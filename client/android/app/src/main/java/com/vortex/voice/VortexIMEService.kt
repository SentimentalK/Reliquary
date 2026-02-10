package com.reliquary.voice

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.inputmethodservice.InputMethodService
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
// Gomobile binding classes
import mobile.Mobile
import mobile.Reliquary
import mobile.MobileCallback

class ReliquaryIMEService : InputMethodService(), MobileCallback {

    private var reliquaryClient: Reliquary? = null
    private var isRecording = false
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private var initError: String? = null
    private var isInErrorState = false  // Prevents onStatus from overwriting error

    // Audio Configuration to match Go Engine / Groq
    private val SAMPLE_RATE = 16000
    private val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    private val MIN_BUFFER_SIZE = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
    private val BUFFER_SIZE = MIN_BUFFER_SIZE * 2

    private var vibrator: android.os.Vibrator? = null

    // UI References
    private var statusPill: LinearLayout? = null
    private var statusDot: TextView? = null
    private var statusText: TextView? = null
    private var pttContainer: FrameLayout? = null
    private var pttLabel: TextView? = null

    override fun onCreate() {
        super.onCreate()

        vibrator = getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator

        try {
            // Load config from SharedPreferences (set in Setup Activity)
            val prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
            val serverUrl = prefs.getString(MainActivity.KEY_SERVER_URL, "") ?: ""
            val authToken = prefs.getString(MainActivity.KEY_AUTH_TOKEN, "") ?: ""
            val deviceId = android.provider.Settings.Secure.getString(
                contentResolver, android.provider.Settings.Secure.ANDROID_ID
            ) ?: "android_unknown"

            if (serverUrl.isEmpty() || authToken.isEmpty()) {
                val msg = if (serverUrl.isEmpty()) "Server URL not configured" else "Auth Token not configured"
                android.util.Log.w("ReliquaryIME", msg)
                initError = msg
                return
            }

            // Initialize Go Client with config from SharedPreferences
            reliquaryClient = Mobile.newReliquary(
                serverUrl,
                deviceId,
                authToken,
                "",  // API Key: empty by default, can be set via web UI (BYOK)
                this
            )
            android.util.Log.d("ReliquaryIME", "Go Client Initialized (server: $serverUrl)")
        } catch (e: Throwable) {
            e.printStackTrace()
            initError = "Core Init Failed: ${e.message}"
            android.util.Log.e("ReliquaryIME", initError!!)
        }
    }

    override fun onCreateInputView(): View {
        val contextThemeWrapper = android.view.ContextThemeWrapper(this, R.style.Theme_ReliquaryVoice)
        val view = android.view.LayoutInflater.from(contextThemeWrapper).inflate(R.layout.ime_voice_bar, null)

        // Set IME window navigation bar color to match keyboard background
        window?.window?.let { w ->
            w.navigationBarColor = android.graphics.Color.parseColor("#F3F4F6")
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                w.decorView.systemUiVisibility = w.decorView.systemUiVisibility or
                    View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
        }

        // Bind UI references
        statusPill = view.findViewById(R.id.status_pill)
        statusDot = view.findViewById(R.id.status_dot)
        statusText = view.findViewById(R.id.status_text)
        pttContainer = view.findViewById(R.id.btn_ptt_container)
        pttLabel = view.findViewById(R.id.tv_ptt_label)

        // Show init error on status pill if applicable
        if (initError != null) {
            updateStatusPill("error", initError!!)
        } else if (reliquaryClient != null) {
            updateStatusPill("ready", "Ready")
        } else {
            updateStatusPill("error", "Not Initialized")
        }

        // === Navigation Arrows (Up / Down only) ===
        view.findViewById<ImageButton>(R.id.btn_arrow_up).setOnClickListener {
            hapticLight()
            sendKeyEvent(KeyEvent.KEYCODE_DPAD_UP)
        }
        view.findViewById<ImageButton>(R.id.btn_arrow_down).setOnClickListener {
            hapticLight()
            sendKeyEvent(KeyEvent.KEYCODE_DPAD_DOWN)
        }

        // === Backspace (handles both selection and single char) ===
        view.findViewById<ImageButton>(R.id.btn_backspace).setOnClickListener {
            hapticLight()
            val ic = currentInputConnection ?: return@setOnClickListener
            val selected = ic.getSelectedText(0)
            if (selected != null && selected.isNotEmpty()) {
                ic.commitText("", 1)
            } else {
                ic.deleteSurroundingText(1, 0)
            }
        }

        // === Enter (always send KEYCODE_ENTER for reliable newline) ===
        view.findViewById<ImageButton>(R.id.btn_enter).setOnClickListener {
            hapticLight()
            sendKeyEvent(KeyEvent.KEYCODE_ENTER)
        }

        // === PTT Mic Button (Hold to Speak) ===
        pttContainer?.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    if (initError != null) {
                        // Don't allow recording if init failed
                        Toast.makeText(this, initError, Toast.LENGTH_SHORT).show()
                        return@setOnTouchListener true
                    }
                    hapticMedium()
                    isInErrorState = false  // Clear error on new recording attempt
                    v.background = ContextCompat.getDrawable(this, R.drawable.bg_kb_button_ptt_active)
                    startRecording()
                    updateStatusPill("listening", "Listening...")
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.background = ContextCompat.getDrawable(this, R.drawable.bg_kb_button)
                    stopRecording()
                    updateStatusPill("processing", "Processing...")
                    true
                }
                else -> false
            }
        }

        return view
    }

    private fun sendKeyEvent(keyCode: Int) {
        val ic = currentInputConnection ?: return
        ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
        ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
    }

    private fun hapticLight() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            vibrator?.vibrate(android.os.VibrationEffect.createOneShot(20, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(20)
        }
    }

    private fun hapticMedium() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            vibrator?.vibrate(android.os.VibrationEffect.createOneShot(50, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(50)
        }
    }

    /**
     * Updates the status pill UI with appropriate background and text.
     * States: "ready", "listening", "processing", "error"
     */
    private fun updateStatusPill(state: String, message: String) {
        Handler(Looper.getMainLooper()).post {
            val pillBg = when (state) {
                "listening" -> R.drawable.bg_status_pill_listening
                "error" -> R.drawable.bg_status_pill_error
                else -> R.drawable.bg_status_pill
            }
            statusPill?.setBackgroundResource(pillBg)

            val textColor = when (state) {
                "listening" -> 0xFFFFFFFF.toInt() // White
                "error" -> 0xFFDC2626.toInt()     // Red 600
                else -> 0xFF374151.toInt()         // Gray 700
            }
            statusDot?.setTextColor(textColor)
            statusText?.setTextColor(textColor)
            statusText?.text = message
        }
    }

    // === Recording ===

    private fun startRecording() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            updateStatusPill("error", "Mic Permission Missing")
            return
        }

        if (isRecording) return

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                BUFFER_SIZE
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                updateStatusPill("error", "Audio Init Failed")
                return
            }

            audioRecord?.startRecording()
            isRecording = true

            // Start Go Engine Session
            Thread {
                try {
                    android.util.Log.d("ReliquaryIME", "Starting Reliquary Client...")
                    reliquaryClient?.start()
                    android.util.Log.d("ReliquaryIME", "Reliquary Client Started")
                } catch (e: Exception) {
                    android.util.Log.e("ReliquaryIME", "Start Failed Exception", e)
                    onError("Start Failed: ${e.message}")
                }
            }.start()

            // Start Audio Read Thread
            recordingThread = Thread {
                val buffer = ByteArray(MIN_BUFFER_SIZE)
                android.util.Log.d("ReliquaryIME", "Starting Audio Loop")
                while (isRecording) {
                    val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                    if (read > 0) {
                        try {
                            reliquaryClient?.writeAudio(buffer.sliceArray(0 until read))
                        } catch (e: Exception) {
                            android.util.Log.e("ReliquaryIME", "Write Audio Failed", e)
                        }
                    }
                }
            }
            recordingThread?.start()

        } catch (e: Exception) {
            e.printStackTrace()
            isRecording = false
            updateStatusPill("error", "Recording Error")
        }
    }

    private fun stopRecording() {
        if (!isRecording) return

        isRecording = false
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {
            e.printStackTrace()
        }
        audioRecord = null
        recordingThread = null

        // Stop Go Engine (triggers processing)
        try {
            reliquaryClient?.stop()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // === MobileCallback Implementation (Called from Go) ===

    override fun onText(text: String) {
        android.util.Log.d("ReliquaryIME", "onText: $text")
        Handler(Looper.getMainLooper()).post {
            currentInputConnection?.commitText(text, 1)
            isInErrorState = false  // Clear error on success
            updateStatusPill("ready", "Ready")

            // Success haptic
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                vibrator?.vibrate(android.os.VibrationEffect.createOneShot(30, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            }
        }
    }

    override fun onError(err: String) {
        android.util.Log.e("ReliquaryIME", "onError: $err")
        Handler(Looper.getMainLooper()).post {
            // Show meaningful error on status pill
            val displayMsg = when {
                err.contains("API Key", ignoreCase = true) -> "Groq API Key Required, check web UI"
                err.contains("certificate", ignoreCase = true) -> "SSL Certificate Error"
                err.contains("connection refused", ignoreCase = true) -> "Connection Refused"
                err.contains("connection", ignoreCase = true) -> "Connection Failed"
                err.contains("timeout", ignoreCase = true) -> "Request Timeout"
                err.contains("auth", ignoreCase = true) -> "Auth Failed"
                err.contains("permission", ignoreCase = true) -> "Permission Denied"
                err.contains("short", ignoreCase = true) -> "Too Short"
                err.length > 30 -> err.substring(0, 30) + "..."
                else -> err
            }
            updateStatusPill("error", displayMsg)
            isInErrorState = true  // Block onStatus from overwriting

            // Error Haptic (Double pulse)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                vibrator?.vibrate(android.os.VibrationEffect.createWaveform(longArrayOf(0, 50, 50, 50), -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(longArrayOf(0, 50, 50, 50), -1)
            }

            // Error persists on status pill until next successful action
            // (no auto-recover)
        }
    }

    override fun onStatus(status: String) {
        android.util.Log.d("ReliquaryIME", "onStatus: $status")
        Handler(Looper.getMainLooper()).post {
            // Don't let onStatus overwrite an error message
            if (isInErrorState) {
                android.util.Log.d("ReliquaryIME", "onStatus ignored (in error state): $status")
                return@post
            }
            when {
                status == "Ready" -> updateStatusPill("ready", "Ready")
                status.contains("Recording") -> updateStatusPill("listening", "Listening...")
                status.contains("Processing") -> updateStatusPill("processing", "Processing...")
                else -> updateStatusPill("ready", status)
            }
        }
    }
}
