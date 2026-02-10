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
            val deviceId = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}".trim()
                .ifEmpty { "Android Device" }

            if (serverUrl.isEmpty() || authToken.isEmpty()) {
                val msg = if (serverUrl.isEmpty()) "Server URL not configured" else "Auth Token not configured"
                android.util.Log.w("ReliquaryIME", msg)
                initError = msg
                return
            }

            // Read cached config (set via web UI through Control Plane)
            val apiKey = prefs.getString(MainActivity.KEY_API_KEY, "") ?: ""
            val language = prefs.getString(MainActivity.KEY_LANGUAGE, "") ?: ""
            val pipeline = prefs.getString(MainActivity.KEY_PIPELINE, "") ?: ""

            // Initialize Go Client with config from SharedPreferences
            reliquaryClient = Mobile.newReliquary(
                serverUrl,
                deviceId,
                authToken,
                apiKey,
                this
            )

            // Apply cached language/pipeline if set
            if (language.isNotEmpty() || pipeline.isNotEmpty()) {
                reliquaryClient?.updateConfig(apiKey, language, pipeline)
            }

            android.util.Log.d("ReliquaryIME", "Go Client Initialized (server: $serverUrl, lang: $language, pipe: $pipeline, byok: ${apiKey.isNotEmpty()})")
        } catch (e: Throwable) {
            e.printStackTrace()
            initError = "Core Init Failed: ${e.message}"
            android.util.Log.e("ReliquaryIME", initError!!)
        }
    }

    // === Keyboard Window Lifecycle ===
    // Control Plane connects when keyboard is shown, disconnects when hidden.
    // This ensures no background network activity when user is not using the keyboard.

    override fun onWindowShown() {
        super.onWindowShown()
        android.util.Log.d("ReliquaryIME", "Keyboard shown — connecting control plane")
        reliquaryClient?.connectControl()
    }

    override fun onWindowHidden() {
        super.onWindowHidden()
        android.util.Log.d("ReliquaryIME", "Keyboard hidden — disconnecting control plane")
        reliquaryClient?.disconnectControl()
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
            updateStatusPill("ready", getString(R.string.status_ready))
        } else {
            updateStatusPill("error", getString(R.string.status_not_initialized))
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
        // === Backspace (Continuous) ===
        val btnBackspace = view.findViewById<ImageButton>(R.id.btn_backspace)
        val handler = Handler(Looper.getMainLooper())
        
        val deleteRunnable = object : Runnable {
            override fun run() {
                val ic = currentInputConnection ?: return
                val selected = ic.getSelectedText(0)
                if (selected != null && selected.isNotEmpty()) {
                    ic.commitText("", 1)
                } else {
                    ic.deleteSurroundingText(1, 0)
                }
                hapticLight()
                handler.postDelayed(this, 50) // Repeat every 50ms
            }
        }

        btnBackspace.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    // Initial delete
                    hapticLight()
                    val ic = currentInputConnection
                    val selected = ic?.getSelectedText(0)
                    if (selected != null && selected.isNotEmpty()) {
                        ic.commitText("", 1)
                    } else {
                        ic?.deleteSurroundingText(1, 0)
                    }
                    
                    // Start repeating after delay
                    handler.postDelayed(deleteRunnable, 400)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    handler.removeCallbacks(deleteRunnable)
                    true
                }
                else -> false
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
                    updateStatusPill("listening", getString(R.string.status_listening))
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.background = ContextCompat.getDrawable(this, R.drawable.bg_kb_button)
                    stopRecording()
                    updateStatusPill("processing", getString(R.string.status_processing))
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
            updateStatusPill("error", getString(R.string.error_mic_missing))
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
                updateStatusPill("error", getString(R.string.error_audio_init))
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
            updateStatusPill("error", getString(R.string.error_recording))
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
            updateStatusPill("ready", getString(R.string.status_ready))

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
                err.contains("API Key", ignoreCase = true) -> getString(R.string.error_api_key)
                err.contains("certificate", ignoreCase = true) -> getString(R.string.error_ssl)
                err.contains("connection refused", ignoreCase = true) -> getString(R.string.error_connection_refused)
                err.contains("connection", ignoreCase = true) -> getString(R.string.error_connection_failed)
                err.contains("timeout", ignoreCase = true) -> getString(R.string.error_timeout)
                err.contains("auth", ignoreCase = true) -> getString(R.string.error_auth)
                err.contains("permission", ignoreCase = true) -> getString(R.string.error_permission)
                err.contains("short", ignoreCase = true) -> getString(R.string.error_too_short)
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
                status == "Ready" -> updateStatusPill("ready", getString(R.string.status_ready))
                status.contains("Recording") -> updateStatusPill("listening", getString(R.string.status_listening))
                status.contains("Processing") -> updateStatusPill("processing", getString(R.string.status_processing))
                else -> updateStatusPill("ready", status)
            }
        }
    }

    // === Control Plane Callbacks ===

    override fun onControlConnected() {
        android.util.Log.d("ReliquaryIME", "Control Plane: Connected")
    }

    override fun onControlDisconnected() {
        android.util.Log.d("ReliquaryIME", "Control Plane: Disconnected")
    }

    override fun onConfigUpdate(apiKey: String?, language: String?, pipeline: String?) {
        android.util.Log.d("ReliquaryIME", "Config update from server: lang=$language, pipe=$pipeline, byok=${!apiKey.isNullOrEmpty()}")

        // Persist to SharedPreferences so config survives restarts
        val prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        val editor = prefs.edit()

        if (!apiKey.isNullOrEmpty()) {
            editor.putString(MainActivity.KEY_API_KEY, apiKey)
        }
        // Language: empty string = auto detect, which is a valid value to persist
        if (language != null) {
            editor.putString(MainActivity.KEY_LANGUAGE, language)
        }
        if (!pipeline.isNullOrEmpty()) {
            editor.putString(MainActivity.KEY_PIPELINE, pipeline)
        }

        editor.apply()
        android.util.Log.d("ReliquaryIME", "Config persisted to SharedPreferences")
    }
}
