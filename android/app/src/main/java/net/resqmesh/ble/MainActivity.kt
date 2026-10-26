package net.resqmesh.ble

import android.Manifest
import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.webkit.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var meshService: BleMeshForegroundService? = null
    private var bridgeInterface: WebBleBridgeInterface? = null
    private var directSmsManager: DirectSmsManager? = null
    private var smsBridgeInterface: WebSmsBridgeInterface? = null

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as? BleMeshForegroundService.LocalBinder
            meshService = binder?.getService()

            meshService?.setOnPacketReceivedListener { json ->
                bridgeInterface?.dispatchPacketToWeb(json)
            }
            meshService?.setOnPeerDiscoveredListener { peerId, rssi ->
                bridgeInterface?.dispatchPeerDiscovered(peerId, rssi)
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            meshService = null
        }
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.values.all { it }
        if (allGranted) {
            startMeshService()
        }
    }

    private val smsPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        val status = if (isGranted) DirectSmsManager.STATUS_SMS_QUEUED else DirectSmsManager.STATUS_SMS_PERMISSION_REQUIRED
        val desc = if (isGranted) "SEND_SMS permission granted." else "SEND_SMS permission denied."
        smsBridgeInterface?.dispatchSmsStatusUpdate("system", status, desc)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Direct SMS Manager with status bridge callback
        directSmsManager = DirectSmsManager(this) { sosId, status, details ->
            smsBridgeInterface?.dispatchSmsStatusUpdate(sosId, status, details)
        }

        webView = WebView(this)
        setContentView(webView)

        setupWebView()
        requestPermissionsAndStart()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.setGeolocationEnabled(true)
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false
            }
        }

        // Bridge 1: Multi-Hop BLE Mesh
        bridgeInterface = WebBleBridgeInterface(webView) { meshService }
        webView.addJavascriptInterface(bridgeInterface!!, "AndroidBleBridge")

        // Bridge 2: Direct Cellular Emergency SMS (Zero messaging app popup)
        smsBridgeInterface = WebSmsBridgeInterface(
            webView,
            smsManagerProvider = { directSmsManager },
            permissionRequester = {
                runOnUiThread {
                    smsPermissionLauncher.launch(Manifest.permission.SEND_SMS)
                }
            }
        )
        webView.addJavascriptInterface(smsBridgeInterface!!, "AndroidSmsBridge")

        // Load the web app (supports local host, emulator loopback, or offline PWA asset)
        val targetUrl = "http://10.0.2.2:8000" // Android emulator loopback to host PC
        webView.loadUrl(targetUrl)
    }

    private fun requestPermissionsAndStart() {
        val needed = mutableListOf<String>()

        // 1. Direct Emergency SMS Permissions
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.SEND_SMS)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_PHONE_STATE)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_SCAN)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_ADVERTISE)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_CONNECT)
            }
        } else {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (needed.isEmpty()) {
            startMeshService()
        } else {
            permissionLauncher.launch(needed.toTypedArray())
        }
    }

    private fun startMeshService() {
        val intent = Intent(this, BleMeshForegroundService::class.java).apply {
            action = BleMeshForegroundService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }

    override fun onDestroy() {
        try {
            unbindService(serviceConnection)
        } catch (e: Exception) {}
        super.onDestroy()
    }
}
