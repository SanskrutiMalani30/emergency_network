package net.resqmesh.ble

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicInteger

/**
 * RESQMesh — Direct Emergency Cellular SMS Manager
 *
 * Transmits emergency SOS text messages directly through native cellular telephony (SmsManager)
 * without launching any messaging application (Google Messages, WhatsApp, etc.).
 * Operates offline with zero mobile data or Wi-Fi requirement.
 */
class DirectSmsManager(
    private val context: Context,
    private val onStatusUpdate: (sosId: String, status: String, details: String) -> Unit
) {
    companion object {
        private const val TAG = "DirectSmsManager"

        // Canonical Delivery Status Lifecycle
        const val STATUS_SOS_SAVED_OFFLINE = "SOS_SAVED_OFFLINE"
        const val STATUS_SMS_PERMISSION_REQUIRED = "SMS_PERMISSION_REQUIRED"
        const val STATUS_SMS_QUEUED = "SMS_QUEUED"
        const val STATUS_SMS_SUBMISSION_FAILED = "SMS_SUBMISSION_FAILED"
        const val STATUS_SMS_SUBMITTED_TO_CARRIER = "SMS_SUBMITTED_TO_CARRIER"
        const val STATUS_SMS_DELIVERY_CONFIRMED = "SMS_DELIVERY_CONFIRMED"

        fun maskPhoneNumber(phone: String): String {
            val clean = phone.replace(Regex("[\\s\\-\\(\\)]"), "")
            if (clean.length <= 4) return "****"
            val visible = clean.takeLast(4)
            val prefix = if (clean.startsWith("+")) clean.substring(0, 3) else ""
            return "$prefix*****$visible"
        }
    }

    fun hasSendSmsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun isTelephonyAvailable(): Boolean {
        return context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
    }

    fun getSimState(): String {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            ?: return "UNAVAILABLE"
        return when (tm.simState) {
            TelephonyManager.SIM_STATE_READY -> "READY"
            TelephonyManager.SIM_STATE_ABSENT -> "NO_SIM"
            TelephonyManager.SIM_STATE_PIN_REQUIRED,
            TelephonyManager.SIM_STATE_PUK_REQUIRED,
            TelephonyManager.SIM_STATE_NETWORK_LOCKED -> "LOCKED"
            else -> "NO_CARRIER_SERVICE"
        }
    }

    /**
     * Sends an emergency SMS directly via SmsManager without opening any messaging application.
     * Tracks each part of multi-part messages and reports truthful carrier submission & delivery.
     */
    fun sendDirectEmergencySms(
        sosId: String,
        recipientPhone: String,
        messageText: String
    ): Map<String, Any> {
        Log.i(TAG, "Direct emergency SMS triggered for SOS: $sosId to ${maskPhoneNumber(recipientPhone)}")

        // 1. Verify Permission
        if (!hasSendSmsPermission()) {
            Log.w(TAG, "SEND_SMS permission not granted. Request required.")
            onStatusUpdate(sosId, STATUS_SMS_PERMISSION_REQUIRED, "SEND_SMS Android runtime permission required.")
            return mapOf(
                "sos_id" to sosId,
                "delivery_status" to STATUS_SMS_PERMISSION_REQUIRED,
                "error" to "Permission SEND_SMS required"
            )
        }

        // 2. Validate Telephony & SIM Status
        if (!isTelephonyAvailable()) {
            val err = "Device does not have cellular telephony hardware."
            Log.e(TAG, err)
            onStatusUpdate(sosId, STATUS_SMS_SUBMISSION_FAILED, err)
            return mapOf("sos_id" to sosId, "delivery_status" to STATUS_SMS_SUBMISSION_FAILED, "error" to err)
        }

        val simState = getSimState()
        if (simState == "NO_SIM") {
            val err = "No active SIM card detected for cellular transmission."
            Log.e(TAG, err)
            onStatusUpdate(sosId, STATUS_SMS_SUBMISSION_FAILED, err)
            return mapOf("sos_id" to sosId, "delivery_status" to STATUS_SMS_SUBMISSION_FAILED, "error" to err)
        }

        // 3. Clean and Validate Recipient Phone Number
        val cleanPhone = recipientPhone.replace(Regex("[\\s\\-\\(\\)]"), "")
        if (cleanPhone.length < 7) {
            val err = "Invalid recipient phone number format."
            Log.e(TAG, err)
            onStatusUpdate(sosId, STATUS_SMS_SUBMISSION_FAILED, err)
            return mapOf("sos_id" to sosId, "delivery_status" to STATUS_SMS_SUBMISSION_FAILED, "error" to err)
        }

        // 4. Acquire appropriate SmsManager instance
        val smsManager: SmsManager = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed resolving SmsManager: ${e.message}")
            onStatusUpdate(sosId, STATUS_SMS_SUBMISSION_FAILED, "SmsManager service initialization failed")
            return mapOf("sos_id" to sosId, "delivery_status" to STATUS_SMS_SUBMISSION_FAILED, "error" to (e.message ?: "SmsManager error"))
        }

        // 5. Divide message if text exceeds 160 characters (multipart SMS)
        val parts = smsManager.divideMessage(messageText)
        val totalParts = parts.size
        val sentCount = AtomicInteger(0)
        val deliveredCount = AtomicInteger(0)
        val hasFailed = AtomicInteger(0)

        val uniqueSuffix = "${sosId.replace(Regex("[^a-zA-Z0-9]"), "")}_${System.currentTimeMillis()}"
        val sentAction = "net.resqmesh.SMS_SENT_$uniqueSuffix"
        val deliveredAction = "net.resqmesh.SMS_DELIVERED_$uniqueSuffix"

        val sentIntents = ArrayList<PendingIntent>()
        val deliveryIntents = ArrayList<PendingIntent>()

        // 6. Broadcast Receiver for Carrier Network Submission
        val sentReceiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                val code = resultCode
                if (code == Activity.RESULT_OK) {
                    val currentSent = sentCount.incrementAndGet()
                    Log.d(TAG, "SMS part $currentSent/$totalParts successfully submitted to carrier for SOS $sosId")
                    if (currentSent == totalParts && hasFailed.get() == 0) {
                        Log.i(TAG, "All $totalParts parts submitted to carrier network for SOS $sosId")
                        onStatusUpdate(sosId, STATUS_SMS_SUBMITTED_TO_CARRIER, "SMS accepted by cellular carrier.")
                    }
                } else {
                    hasFailed.incrementAndGet()
                    val reason = when (code) {
                        SmsManager.RESULT_ERROR_NO_SERVICE -> "No cellular carrier service."
                        SmsManager.RESULT_ERROR_RADIO_OFF -> "Cellular radio is turned off (Airplane Mode)."
                        SmsManager.RESULT_ERROR_NULL_PDU -> "Null PDU received from carrier."
                        SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "SMS rate limit exceeded."
                        else -> "Carrier transmission failure (Code: $code)."
                    }
                    Log.e(TAG, "SMS submission failed for SOS $sosId: $reason")
                    onStatusUpdate(sosId, STATUS_SMS_SUBMISSION_FAILED, reason)
                }
            }
        }

        // 7. Broadcast Receiver for Cellular Delivery Confirmation
        val deliveryReceiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                val code = resultCode
                if (code == Activity.RESULT_OK) {
                    val currentDelivered = deliveredCount.incrementAndGet()
                    Log.i(TAG, "Delivery receipt confirmed for part $currentDelivered/$totalParts (SOS: $sosId)")
                    if (currentDelivered == totalParts) {
                        Log.i(TAG, "SMS DELIVERY CONFIRMED to recipient handset for SOS $sosId")
                        onStatusUpdate(sosId, STATUS_SMS_DELIVERY_CONFIRMED, "Delivery report confirmed by recipient handset.")
                    }
                } else {
                    Log.w(TAG, "Carrier delivery report failed with code: $code for SOS $sosId")
                }
            }
        }

        // 8. Register Receivers safely with export flags
        val filterSent = IntentFilter(sentAction)
        val filterDelivery = IntentFilter(deliveredAction)

        val receiverFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.RECEIVER_NOT_EXPORTED
        } else {
            0
        }

        ContextCompat.registerReceiver(context, sentReceiver, filterSent, receiverFlags)
        ContextCompat.registerReceiver(context, deliveryReceiver, filterDelivery, receiverFlags)

        // 9. Build PendingIntents for each part
        for (i in 0 until totalParts) {
            val piSent = PendingIntent.getBroadcast(
                context,
                i,
                Intent(sentAction),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val piDelivered = PendingIntent.getBroadcast(
                context,
                i,
                Intent(deliveredAction),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            sentIntents.add(piSent)
            deliveryIntents.add(piDelivered)
        }

        // 10. Perform Direct Cellular Dispatch
        try {
            smsManager.sendMultipartTextMessage(
                cleanPhone,
                null,
                parts,
                sentIntents,
                deliveryIntents
            )
            Log.i(TAG, "Dispatched $totalParts SMS parts to cellular hardware. No messaging UI opened.")
            return mapOf(
                "sos_id" to sosId,
                "delivery_status" to STATUS_SMS_QUEUED,
                "parts_count" to totalParts,
                "recipient" to maskPhoneNumber(cleanPhone)
            )
        } catch (e: Exception) {
            Log.e(TAG, "Exception during sendMultipartTextMessage: ${e.message}", e)
            try {
                context.unregisterReceiver(sentReceiver)
                context.unregisterReceiver(deliveryReceiver)
            } catch (_: Exception) {}

            val errMsg = e.message ?: "Failed sending multipart SMS"
            onStatusUpdate(sosId, STATUS_SMS_SUBMISSION_FAILED, errMsg)
            return mapOf(
                "sos_id" to sosId,
                "delivery_status" to STATUS_SMS_SUBMISSION_FAILED,
                "error" to errMsg
            )
        }
    }
}
