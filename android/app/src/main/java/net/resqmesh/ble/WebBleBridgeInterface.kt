package net.resqmesh.ble

import android.webkit.JavascriptInterface
import android.webkit.WebView

/**
 * JavaScript Interface injected into the WebView as `window.AndroidBleBridge`.
 * Provides direct bridge for the React/PWA web dashboard to utilize native BLE hardware.
 */
class WebBleBridgeInterface(
    private val webView: WebView,
    private val serviceProvider: () -> BleMeshForegroundService?
) {
    private val nodeId = "android-node-" + android.os.Build.MODEL.replace(" ", "-").lowercase()

    @JavascriptInterface
    fun broadcastPacket(jsonPayload: String) {
        val service = serviceProvider()
        service?.broadcastPacketToPeers(jsonPayload)
    }

    @JavascriptInterface
    fun getPeerCount(): Int {
        val service = serviceProvider()
        return service?.getDiscoveredPeerCount() ?: 0
    }

    @JavascriptInterface
    fun isNativeMeshActive(): Boolean = serviceProvider() != null

    @JavascriptInterface
    fun getNodeId(): String = nodeId

    /**
     * Dispatches incoming BLE packet into the WebView JavaScript environment
     */
    fun dispatchPacketToWeb(jsonPayload: String) {
        val escaped = jsonPayload.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "")
        val js = "javascript:(function(){ if(window.onBlePacketReceived){ window.onBlePacketReceived(\"$escaped\"); } })();"
        webView.post { webView.loadUrl(js) }
    }

    /**
     * Dispatches peer discovery event into the WebView JavaScript environment
     */
    fun dispatchPeerDiscovered(peerId: String, rssi: Int) {
        val js = "javascript:(function(){ if(window.onBlePeerDiscovered){ window.onBlePeerDiscovered(\"$peerId\", $rssi); } })();"
        webView.post { webView.loadUrl(js) }
    }
}
