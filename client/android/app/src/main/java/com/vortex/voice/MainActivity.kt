package com.reliquary.voice

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    companion object {
        const val PREFS_NAME = "reliquary_config"
        const val KEY_SERVER_URL = "server_url"
        const val KEY_AUTH_TOKEN = "auth_token"
        const val KEY_API_KEY = "api_key"
        const val KEY_LANGUAGE = "language"
        const val KEY_PIPELINE = "pipeline"
    }

    private lateinit var prefs: SharedPreferences

    // Step containers
    private lateinit var step1Container: LinearLayout
    private lateinit var step2Container: LinearLayout
    private lateinit var step3Container: LinearLayout
    private lateinit var step4Container: LinearLayout
    private lateinit var step5Container: LinearLayout

    // Step number badges
    private lateinit var step1Number: TextView
    private lateinit var step2Number: TextView
    private lateinit var step3Number: TextView
    private lateinit var step4Number: TextView
    private lateinit var step5Number: TextView

    // Step descriptions
    private lateinit var step1Desc: TextView
    private lateinit var step2Desc: TextView
    private lateinit var step3Desc: TextView
    private lateinit var step4Desc: TextView
    private lateinit var step5Desc: TextView

    // Input fields
    private lateinit var etServerUrl: EditText
    private lateinit var etAuthToken: EditText

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted: Boolean ->
            if (isGranted) {
                Toast.makeText(this, "✅ 麦克风权限已授权", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "麦克风权限是必需的", Toast.LENGTH_LONG).show()
            }
            updateAllSteps()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // Bind step containers
        step1Container = findViewById(R.id.step1_container)
        step2Container = findViewById(R.id.step2_container)
        step3Container = findViewById(R.id.step3_container)
        step4Container = findViewById(R.id.step4_container)
        step5Container = findViewById(R.id.step5_container)

        // Bind step numbers
        step1Number = findViewById(R.id.step1_number)
        step2Number = findViewById(R.id.step2_number)
        step3Number = findViewById(R.id.step3_number)
        step4Number = findViewById(R.id.step4_number)
        step5Number = findViewById(R.id.step5_number)

        // Bind step descriptions
        step1Desc = findViewById(R.id.step1_desc)
        step2Desc = findViewById(R.id.step2_desc)
        step3Desc = findViewById(R.id.step3_desc)
        step4Desc = findViewById(R.id.step4_desc)
        step5Desc = findViewById(R.id.step5_desc)

        // Bind input fields
        etServerUrl = findViewById(R.id.et_server_url)
        etAuthToken = findViewById(R.id.et_auth_token)

        // Load saved values into input fields
        val savedUrl = prefs.getString(KEY_SERVER_URL, "") ?: ""
        val savedToken = prefs.getString(KEY_AUTH_TOKEN, "") ?: ""
        if (savedUrl.isNotEmpty()) {
            etServerUrl.setText(savedUrl)
        }
        if (savedToken.isNotEmpty()) {
            etAuthToken.setText(savedToken)
        }

        // Step 1: Grant Microphone Permission
        findViewById<Button>(R.id.btn_grant_permission).setOnClickListener {
            checkAndRequestPermission()
        }

        // Step 2: Enable Keyboard in system settings
        findViewById<Button>(R.id.btn_enable_ime).setOnClickListener {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        }

        // Step 3: Save Server URL
        findViewById<Button>(R.id.btn_save_url).setOnClickListener {
            val url = etServerUrl.text.toString().trim()
            if (url.isEmpty()) {
                Toast.makeText(this, "请输入后端地址", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                Toast.makeText(this, "地址必须以 http:// 或 https:// 开头", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            prefs.edit().putString(KEY_SERVER_URL, url).apply()
            Toast.makeText(this, "✅ 后端地址已保存", Toast.LENGTH_SHORT).show()
            updateAllSteps()
        }

        // Step 4: Save Auth Token
        findViewById<Button>(R.id.btn_save_token).setOnClickListener {
            val token = etAuthToken.text.toString().trim()
            if (token.isEmpty()) {
                Toast.makeText(this, "请输入认证令牌", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            prefs.edit().putString(KEY_AUTH_TOKEN, token).apply()
            Toast.makeText(this, "✅ 认证令牌已保存", Toast.LENGTH_SHORT).show()
            updateAllSteps()
        }

        // Step 5: Switch to Reliquary keyboard
        findViewById<Button>(R.id.btn_switch_ime).setOnClickListener {
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showInputMethodPicker()
        }
    }

    override fun onResume() {
        super.onResume()
        updateAllSteps()
    }

    private fun checkAndRequestPermission() {
        when {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED -> {
                Toast.makeText(this, "✅ 权限已授权", Toast.LENGTH_SHORT).show()
            }
            else -> {
                requestPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }

    /**
     * Updates visual state of all 5 steps to show completion status.
     */
    private fun updateAllSteps() {
        val hasPermission = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
        val enabledMethods = imm.enabledInputMethodList
        val isImeEnabled = enabledMethods.any { it.packageName == packageName }

        val hasServerUrl = !prefs.getString(KEY_SERVER_URL, "").isNullOrEmpty()
        val hasAuthToken = !prefs.getString(KEY_AUTH_TOKEN, "").isNullOrEmpty()

        // Step 1
        setStepComplete(step1Container, step1Number, step1Desc, hasPermission,
            if (hasPermission) "✅ 麦克风权限已授权" else "授权后即可进行语音录入")

        // Step 2
        setStepComplete(step2Container, step2Number, step2Desc, isImeEnabled,
            if (isImeEnabled) "✅ Reliquary 键盘已启用" else "在系统设置中开启 Reliquary 键盘")

        // Step 3
        setStepComplete(step3Container, step3Number, step3Desc, hasServerUrl,
            if (hasServerUrl) "✅ 已配置: ${prefs.getString(KEY_SERVER_URL, "")}" else "Reliquary 服务器 URL")

        // Step 4
        setStepComplete(step4Container, step4Number, step4Desc, hasAuthToken,
            if (hasAuthToken) "✅ 令牌已配置" else "输入您的 Master Secret 令牌")

        // Step 5 - always pending (user needs to switch manually each time)
        setStepComplete(step5Container, step5Number, step5Desc, false,
            "将输入法切换为 Reliquary Voice")

        // Disable step 5 button if prerequisites are not met
        val allReady = hasPermission && isImeEnabled && hasServerUrl && hasAuthToken
        findViewById<Button>(R.id.btn_switch_ime).apply {
            isEnabled = allReady
            alpha = if (allReady) 1.0f else 0.4f
        }
    }

    /**
     * Visually marks a step as complete or pending.
     */
    private fun setStepComplete(
        container: LinearLayout,
        numberView: TextView,
        descView: TextView,
        isComplete: Boolean,
        description: String
    ) {
        if (isComplete) {
            container.setBackgroundResource(R.drawable.bg_step_row_complete)
            numberView.setBackgroundResource(R.drawable.bg_step_circle_complete)
            numberView.text = "✓"
            numberView.setTextColor(ContextCompat.getColor(this, R.color.white))
        } else {
            container.setBackgroundResource(R.drawable.bg_step_row)
            numberView.setBackgroundResource(R.drawable.bg_step_circle)
            // Restore original number
            val stepNum = when (numberView.id) {
                R.id.step1_number -> "1"
                R.id.step2_number -> "2"
                R.id.step3_number -> "3"
                R.id.step4_number -> "4"
                R.id.step5_number -> "5"
                else -> "?"
            }
            numberView.text = stepNum
            numberView.setTextColor(ContextCompat.getColor(this, R.color.foreground))
        }
        descView.text = description
    }
}
