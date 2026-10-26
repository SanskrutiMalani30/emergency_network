package net.resqmesh.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.le.*
import android.os.ParcelUuid
import android.util.Log
import java.util.UUID

/**
 * Manages low-power Bluetooth Low Energy advertising and background scanning
 * for peer node discovery in disaster zones.
 */
class BleScannerAndAdvertiser(
    private val bluetoothAdapter: BluetoothAdapter,
    private val onPeerDiscovered: (peerId: String, rssi: Int) -> Unit,
    private val onDeviceFound: (device: android.bluetooth.BluetoothDevice) -> Unit
) {
    companion object {
        private const val TAG = "BleScannerAdvertiser"
        val SERVICE_UUID: UUID = UUID.fromString("0000fe90-0000-1000-8000-00805f9b34fb")
    }

    private val advertiser: BluetoothLeAdvertiser? = bluetoothAdapter.bluetoothLeAdvertiser
    private val scanner: BluetoothLeScanner? = bluetoothAdapter.bluetoothLeScanner

    private var isAdvertising = false
    private var isScanning = false

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            isAdvertising = true
            Log.i(TAG, "BLE Mesh Advertising active. Service UUID: $SERVICE_UUID")
        }

        override fun onStartFailure(errorCode: Int) {
            isAdvertising = false
            Log.e(TAG, "BLE Mesh Advertising failed with code: $errorCode")
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            result?.let {
                val device = it.device
                val rssi = it.rssi
                val peerId = device.name ?: "mesh-${device.address.replace(":", "").takeLast(6)}"
                Log.d(TAG, "Discovered RESQMesh peer: $peerId (RSSI: $rssi dBm)")
                onPeerDiscovered(peerId, rssi)
                onDeviceFound(device)
            }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "BLE Scan failed with code: $errorCode")
        }
    }

    @SuppressLint("MissingPermission")
    fun startAdvertising(nodeId: String) {
        if (isAdvertising || advertiser == null) return

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        try {
            advertiser.startAdvertising(settings, data, advertiseCallback)
        } catch (e: Exception) {
            Log.e(TAG, "Error starting advertising: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    fun stopAdvertising() {
        if (!isAdvertising || advertiser == null) return
        try {
            advertiser.stopAdvertising(advertiseCallback)
            isAdvertising = false
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping advertising: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    fun startScanning() {
        if (isScanning || scanner == null) return

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
            .setReportDelay(0)
            .build()

        try {
            scanner.startScan(listOf(filter), settings, scanCallback)
            isScanning = true
            Log.i(TAG, "BLE Scanning started for service UUID: $SERVICE_UUID")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting scan: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScanning() {
        if (!isScanning || scanner == null) return
        try {
            scanner.stopScan(scanCallback)
            isScanning = false
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping scan: ${e.message}")
        }
    }
}
