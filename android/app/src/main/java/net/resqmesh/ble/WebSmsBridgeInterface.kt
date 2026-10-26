package net.resqmesh.ble

import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.gson.Gson

/**
 * JavaScript Interface injected into the WebView as `window.AndroidSmsBridge`.
 * Bridges React frontend with native Android SmsManager for silent direct emergency SMS dispatch.
 */
class WebSmsBridgeInterface(
    private val webView: WebView,
    private val smsManagerProvider: () -> DirectSmsManager?,
    private val permissionRequester: () -> Unit
) {
    private val gson = Gson()

    @JavascriptInterface
    fun isDirectSmsSupported(): Boolean {
        val mgr = smsManagerProvider() ?: return false
        return mgr.isTelephonyAvailable()
    }

    @JavascriptInterface
    fun hasSmsPermission(): Boolean {
        val mgr = smsManagerProvider() ?: return false
        return mgr.hasSendSmsPermission()
    }

    @JavascriptInterface
    fun requestSmsPermission() {
        permissionRequester()
    }

    @JavascriptInterface
    fun getSimState(): String {
        val mgr = smsManagerProvider() ?: return "UNAVAILABLE"
        return mgr.getSimState()
    }

    @JavascriptInterface
    fun sendDirectSms(sosId: String, recipientPhone: String, messageText: String): String {
        val mgr = smsManagerProvider()
        if (mgr == null) {
            val errMap = mapOf(
                "sos_id" to sosId,
                "delivery_status" to DirectSmsManager.STATUS_SMS_SUBMISSION_FAILED,
                "error" to "DirectSmsManager not initialized"
            )
            return gson.toJson(errMap)
        }

        val res = mgr.sendDirectEmergencySms(sosId, recipientPhone, messageText)
        return gson.toJson(res)
    }

    /**
     * Dispatches native cellular carrier status events back to web dashboard
     */
    fun dispatchSmsStatusUpdate(sosId: String, status: String, details: String) {
        val payload = mapOf(
            "sos_id" to sosId,
            "delivery_status" to status,
            "details" to details,
            "timestamp" to java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.format(java.util.Date())
        )
        val json = gson.toJson(payload)
        val escaped = json.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "")
        val js = "javascript:(function(){ if(window.onNativeSmsStatusUpdate){ window.onNativeSmsStatusUpdate(\"$escaped\"); } })();"
        webView.post { webView.loadUrl(js) }
    }
}
