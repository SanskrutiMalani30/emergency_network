package net.resqmesh.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.content.Context
import android.util.Log
import java.nio.charset.StandardCharsets
import java.util.*
import java.util.concurrent.ConcurrentHashMap

/**
 * Manages the GATT Server (receiving packets) and GATT Client connections (transmitting packets)
 * with support for packet chunking, MTU negotiation, and reassembly.
 */
class BleGattServerManager(
    private val context: Context,
    private val bluetoothManager: BluetoothManager,
    private val onPacketReceived: (jsonPayload: String) -> Unit
) {
    companion object {
        private const val TAG = "BleGattServerManager"
        val SERVICE_UUID: UUID = UUID.fromString("0000fe90-0000-1000-8000-00805f9b34fb")
        val CHAR_TX_UUID: UUID = UUID.fromString("0000fe91-0000-1000-8000-00805f9b34fb")
        val CHAR_RX_UUID: UUID = UUID.fromString("0000fe92-0000-1000-8000-00805f9b34fb")
        private const val MAX_CHUNK_SIZE = 180
    }

    private var gattServer: BluetoothGattServer? = null
    private val connectedDevices = ConcurrentHashMap<String, BluetoothDevice>()
    private val incomingBuffers = ConcurrentHashMap<String, StringBuilder>()

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            super.onConnectionStateChange(device, status, newState)
            device?.let {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    Log.i(TAG, "GATT Client connected: ${it.address}")
                    connectedDevices[it.address] = it
                    incomingBuffers[it.address] = StringBuilder()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    Log.i(TAG, "GATT Client disconnected: ${it.address}")
                    connectedDevices.remove(it.address)
                    incomingBuffers.remove(it.address)
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value)

            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
            }

            if (value == null || device == null) return

            val chunk = String(value, StandardCharsets.UTF_8)
            val buffer = incomingBuffers.getOrPut(device.address) { StringBuilder() }

            if (chunk.endsWith("\n") || chunk.endsWith("}")) {
                buffer.append(chunk)
                val completePayload = buffer.toString().trim()
                buffer.clear()
                Log.d(TAG, "Complete multi-hop packet reassembled (${completePayload.length} bytes)")
                onPacketReceived(completePayload)
            } else {
                buffer.append(chunk)
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun startGattServer() {
        if (gattServer != null) return

        gattServer = bluetoothManager.openGattServer(context, gattServerCallback)
        if (gattServer == null) {
            Log.e(TAG, "Unable to create GATT server")
            return
        }

        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)

        // TX Characteristic: Notify / Write
        val txChar = BluetoothGattCharacteristic(
            CHAR_TX_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ or
                    BluetoothGattCharacteristic.PROPERTY_WRITE or
                    BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        // RX Characteristic: Read / Write
        val rxChar = BluetoothGattCharacteristic(
            CHAR_RX_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        service.addCharacteristic(txChar)
        service.addCharacteristic(rxChar)
        gattServer?.addService(service)

        Log.i(TAG, "GATT Server registered with service UUID: $SERVICE_UUID")
    }

    @SuppressLint("MissingPermission")
    fun stopGattServer() {
        try {
            gattServer?.close()
            gattServer = null
            connectedDevices.clear()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing GATT server: ${e.message}")
        }
    }

    /**
     * Sends a packet to a remote BLE device via client connection
     */
    @SuppressLint("MissingPermission")
    fun sendPacketToDevice(device: BluetoothDevice, jsonPayload: String, onComplete: (Boolean) -> Unit) {
        val payloadWithDelim = if (!jsonPayload.endsWith("\n")) "$jsonPayload\n" else jsonPayload
        val bytes = payloadWithDelim.toByteArray(StandardCharsets.UTF_8)

        device.connectGatt(context, false, object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt?, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt?.requestMtu(256)
                    gatt?.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    gatt?.close()
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt?, status: Int) {
                if (status == BluetoothGatt.GATT_SUCCESS && gatt != null) {
                    val service = gatt.getService(SERVICE_UUID)
                    val characteristic = service?.getCharacteristic(CHAR_TX_UUID)
                    if (characteristic != null) {
                        // Send chunks
                        transmitChunks(gatt, characteristic, bytes, 0, onComplete)
                        return
                    }
                }
                gatt?.close()
                onComplete(false)
            }
        })
    }

    @SuppressLint("MissingPermission")
    private fun transmitChunks(
        gatt: BluetoothGatt,
        char: BluetoothGattCharacteristic,
        bytes: ByteArray,
        offset: Int,
        onComplete: (Boolean) -> Unit
    ) {
        if (offset >= bytes.size) {
            gatt.disconnect()
            gatt.close()
            onComplete(true)
            return
        }

        val chunkSize = minOf(MAX_CHUNK_SIZE, bytes.size - offset)
        val chunk = bytes.copyOfRange(offset, offset + chunkSize)

        char.value = chunk
        char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        val written = gatt.writeCharacteristic(char)

        if (written) {
            // Next chunk after small transmission interval
            Timer().schedule(object : TimerTask() {
                override fun run() {
                    transmitChunks(gatt, char, bytes, offset + chunkSize, onComplete)
                }
            }, 50)
        } else {
            gatt.disconnect()
            gatt.close()
            onComplete(false)
        }
    }

    fun getConnectedDeviceCount(): Int = connectedDevices.size
}
