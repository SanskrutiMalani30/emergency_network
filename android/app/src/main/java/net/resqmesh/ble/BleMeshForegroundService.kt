package net.resqmesh.ble

import android.app.*
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.concurrent.ConcurrentHashMap

/**
 * Android Foreground Service maintaining continuous BLE mesh participation,
 * background scanning, advertising, and opportunistic routing in disaster environments.
 */
class BleMeshForegroundService : Service() {

    companion object {
        private const val TAG = "BleMeshService"
        private const val NOTIFICATION_ID = 9110
        private const val CHANNEL_ID = "resqmesh_ble_channel"
        const val ACTION_START = "net.resqmesh.ble.ACTION_START"
        const val ACTION_STOP = "net.resqmesh.ble.ACTION_STOP"
    }

    private val binder = LocalBinder()
    private var wakeLock: PowerManager.WakeLock? = null
    private var scannerAdvertiser: BleScannerAndAdvertiser? = null
    private var gattServerManager: BleGattServerManager? = null

    private val discoveredDevices = ConcurrentHashMap<String, BluetoothDevice>()
    private var packetListener: ((String) -> Unit)? = null
    private var peerListener: ((String, Int) -> Unit)? = null

    inner class LocalBinder : Binder() {
        fun getService(): BleMeshForegroundService = this@BleMeshForegroundService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RESQMesh:BleWakeLock")
        wakeLock?.acquire(24 * 60 * 60 * 1000L) // 24 hours

        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = bluetoothManager.adapter

        if (adapter != null && adapter.isEnabled) {
            gattServerManager = BleGattServerManager(this, bluetoothManager) { jsonPayload ->
                packetListener?.invoke(jsonPayload)
            }
            gattServerManager?.startGattServer()

            scannerAdvertiser = BleScannerAndAdvertiser(
                adapter,
                onPeerDiscovered = { peerId, rssi ->
                    peerListener?.invoke(peerId, rssi)
                },
                onDeviceFound = { device ->
                    discoveredDevices[device.address] = device
                }
            )

            scannerAdvertiser?.startAdvertising("RESQMesh-Node")
            scannerAdvertiser?.startScanning()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = buildNotification("RESQMesh BLE Mesh Active", "Relaying emergency SOS packets across nearby peers")
        startForeground(NOTIFICATION_ID, notification)

        return START_STICKY
    }

    fun broadcastPacketToPeers(jsonPayload: String) {
        val targets = discoveredDevices.values.toList()
        for (device in targets) {
            gattServerManager?.sendPacketToDevice(device, jsonPayload) { success ->
                Log.d(TAG, "Relayed packet to ${device.address}: success=$success")
            }
        }
    }

    fun setOnPacketReceivedListener(listener: (String) -> Unit) {
        this.packetListener = listener
    }

    fun setOnPeerDiscoveredListener(listener: (String, Int) -> Unit) {
        this.peerListener = listener
    }

    fun getDiscoveredPeerCount(): Int = discoveredDevices.size

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "RESQMesh Emergency BLE Relay",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps BLE mesh relay active in the background"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(title: String, text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    override fun onDestroy() {
        scannerAdvertiser?.stopAdvertising()
        scannerAdvertiser?.stopScanning()
        gattServerManager?.stopGattServer()

        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        super.onDestroy()
    }
}
