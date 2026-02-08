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
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import android.widget.ImageButton
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

    // Audio Configuration to match Go Engine / Groq
    private val SAMPLE_RATE = 16000
    private val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    // Buffer size should be larger than min to ensure smooth streaming
    private val MIN_BUFFER_SIZE = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
    private val BUFFER_SIZE = MIN_BUFFER_SIZE * 2

    private var micIcon: android.widget.ImageView? = null
    private var vibrator: android.os.Vibrator? = null

    override fun onCreate() {
        super.onCreate()
        
        vibrator = getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator

        try {
            // Initialize Go Client
            // Loading config from hardcoded strings for now (TODO: Load from Settings Activity)
            reliquaryClient = Mobile.newReliquary(
                "https://voice.sentimentalk.com",
                "android_mobile_client", 
                "sk-reliquary-f2527a71f69620a1e2a560697dc5bb33",
                "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",
                this
            )
            android.util.Log.d("ReliquaryIME", "Go Client Initialized")
        } catch (e: Throwable) {
            e.printStackTrace()
            Handler(Looper.getMainLooper()).post {
                Toast.makeText(this, "Reliquary Core Load Failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onCreateInputView(): View {
        // Fix: Use ContextThemeWrapper to apply App Theme (Material) to the IME context
        val contextThemeWrapper = android.view.ContextThemeWrapper(this, R.style.Theme_ReliquaryVoice)
        val view = android.view.LayoutInflater.from(contextThemeWrapper).inflate(R.layout.ime_voice_bar, null)
        
        // Bind Icon for Visual Status
        micIcon = view.findViewById(R.id.iv_mic_icon)
        val micContainer = view.findViewById<View>(R.id.btn_mic_container)

        // 1. Switch IME
        view.findViewById<ImageButton>(R.id.btn_switch_ime).setOnClickListener {
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showInputMethodPicker()
        }

        // 2. Backspace
        view.findViewById<ImageButton>(R.id.btn_backspace).setOnClickListener {
            // Haptic Feedback
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                vibrator?.vibrate(android.os.VibrationEffect.createOneShot(20, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                vibrator?.vibrate(20)
            }
            val ic = currentInputConnection
            ic?.deleteSurroundingText(1, 0)
        }

        // 3. Mic Button (Hold to Speak)
        micContainer.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    // Haptic Feedback on Start
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                         vibrator?.vibrate(android.os.VibrationEffect.createOneShot(50, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
                    } else {
                         vibrator?.vibrate(50)
                    }

                    startRecording()
                    v.isPressed = true
                    updateStatus("Listening...")
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    stopRecording()
                    v.isPressed = false
                    updateStatus("Processing...")
                    true
                }
                else -> false
            }
        }

        return view
    }

    private fun startRecording() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Microphone permission missing!", Toast.LENGTH_SHORT).show()
            updateStatus("Perm Missing")
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
                Toast.makeText(this, "Audio Init Failed", Toast.LENGTH_SHORT).show()
                return
            }

            audioRecord?.startRecording()
            isRecording = true
            
            // Start Go Engine Session (Must be on background thread)
            Thread {
                try {
                    android.util.Log.d("ReliquaryIME", "Starting Reliquary Client...")
                    reliquaryClient?.start()
                    android.util.Log.d("ReliquaryIME", "Reliquary Client Started")
                } catch (e: Exception) {
                    android.util.Log.e("ReliquaryIME", "Start Failed Exception", e)
                    e.printStackTrace()
                    onError("Start Failed: ${e.message}")
                }
            }.start()

            // Start Reading Thread
            recordingThread = Thread {
                val buffer = ByteArray(MIN_BUFFER_SIZE) // Read small chunks
                android.util.Log.d("ReliquaryIME", "Starting Audio Loop")
                while (isRecording) {
                    val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                    if (read > 0) {
                        // Pass data to Go
                        try {
                            reliquaryClient?.writeAudio(buffer.sliceArray(0 until read))
                        } catch (e: Exception) {
                            android.util.Log.e("ReliquaryIME", "Write Audio Failed", e)
                            e.printStackTrace()
                        }
                    }
                }
            }
            recordingThread?.start()

        } catch (e: Exception) {
            e.printStackTrace()
            isRecording = false
            stopRecording()
        }
    }

    private fun stopRecording() {
        if (!isRecording) return // Already stopped

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

    private fun updateStatus(status: String) {
        Handler(Looper.getMainLooper()).post {
            // Visual State Feedback (Tinting the background circle)
            // Default (Idle): #E1F0FF (Light Blue)
            // Listening: #FFDDDD (Light Red)
            // Processing: #FFF4CC (Light Orange)
            // Error: #FFCCCC (Red)

            val color = when (status) {
                "Listening..." -> 0xFFFFDDDD.toInt() // Light Red
                "Processing..." -> 0xFFFFF4CC.toInt() // Light Yellow
                "Error" -> 0xFFFFCCCC.toInt() // Red
                "Perm Missing" -> 0xFFCCCCCC.toInt() // Grey
                else -> 0xFFE1F0FF.toInt() // Default Light Blue
            }
            
            // Tint the background circle (bg_mic_circle_light)
            micIcon?.background?.setTint(color)
        }
    }

    // --- MobileCallback Implementation (Called from Go) ---

    override fun onText(text: String) {
        android.util.Log.d("ReliquaryIME", "onText: $text")
        Handler(Looper.getMainLooper()).post {
            val ic = currentInputConnection
            ic?.commitText(text, 1)
            updateStatus("HOLD TO SPEAK")
            
            // Success Haptic
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                vibrator?.vibrate(android.os.VibrationEffect.createOneShot(30, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            }
        }
    }

    override fun onError(err: String) {
        android.util.Log.e("ReliquaryIME", "onError: $err")
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(this, err, Toast.LENGTH_SHORT).show()
            updateStatus("Error")
            
            // Error Haptic (Double pulse)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                val waveform = longArrayOf(0, 50, 50, 50)
                val amplitudes = intArrayOf(0, 255, 0, 255)
               // Simple fallback for one-shot if waveform complicated
                vibrator?.vibrate(android.os.VibrationEffect.createWaveform(waveform, -1))
            } else {
                 vibrator?.vibrate(longArrayOf(0, 50, 50, 50), -1)
            }

            Handler(Looper.getMainLooper()).postDelayed({
                updateStatus("HOLD TO SPEAK")
            }, 1000)
        }
    }

    override fun onStatus(status: String) {
        android.util.Log.d("ReliquaryIME", "onStatus: $status")
         Handler(Looper.getMainLooper()).post {
            // Engine sends detailed status, map to visual states
             if (status == "Ready") {
                 updateStatus("HOLD TO SPEAK")
             } else if (status.contains("Recording")) {
                 updateStatus("Listening...")
             } else if (status.contains("Processing")) {
                 updateStatus("Processing...")
             } else {
                 updateStatus(status)
             }
         }
    }
}
