// Package config provides configuration management with hot-reload support.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Config represents the application configuration.
type Config struct {
	KeyCode   int    `json:"keycode"`
	ServerURL string `json:"server_url"`
	// Security (Auto-enabled for localhost)
	InsecureSkipVerify bool `json:"insecure_skip_verify,omitempty"`

	DeviceID string `json:"device_id"`
	// Authentication (v1.5 Multi-User)
	AuthToken string `json:"auth_token,omitempty"` // sk-reliquary-xxx format
	// BYOK: Bring Your Own Key (optional)
	// BYOK: Bring Your Own Key (optional)
	ApiKey string `json:"api_key,omitempty"` // User's own Groq API key
	// Settings
	Language string `json:"language,omitempty"` // zh, en, etc.
	Pipeline string `json:"pipeline,omitempty"` // raw_whisper, whisper_fixer, etc.
}

// defaultKeyCode returns the platform-specific default hotkey code.
// macOS uses Carbon key codes, Windows uses Win32 virtual key codes,
// Linux uses evdev key codes (linux/input-event-codes.h).
func defaultKeyCode() int {
	switch runtime.GOOS {
	case "windows":
		return 0xA1 // VK_RSHIFT (Right Shift)
	case "linux":
		return 54 // KEY_RIGHTSHIFT (evdev)
	default:
		return 60 // Right Shift on macOS (Carbon)
	}
}

// DefaultConfig returns the default configuration.
func DefaultConfig() Config {
	return Config{
		KeyCode:   defaultKeyCode(),
		ServerURL: "https://localhost:443",
		DeviceID:  getDefaultDeviceID(),
		AuthToken: "",            // Must be set after registration
		ApiKey:    "",            // Optional BYOK
		Pipeline:  "raw_whisper", // Default to raw whisper
	}
}

// HasAuthToken returns true if auth token is configured.
func (c Config) HasAuthToken() bool {
	return c.AuthToken != "" && len(c.AuthToken) > 10
}

// getDefaultDeviceID returns hostname as device identifier.
// Simple and human-readable.
func getDefaultDeviceID() string {
	hostname, err := os.Hostname()
	if err != nil {
		return fmt.Sprintf("%s-unknown", runtime.GOOS)
	}
	// Strip .local suffix (common on macOS)
	hostname = strings.TrimSuffix(hostname, ".local")
	return hostname
}

// Manager handles configuration loading and hot-reload.
type Manager struct {
	configPath string
	config     Config
	mu         sync.RWMutex
	onChange   func(Config)
	stopChan   chan struct{}
}

// NewManager creates a new config manager.
// configPath: path to config.json file
func NewManager(configPath string) *Manager {
	return &Manager{
		configPath: configPath,
		config:     DefaultConfig(),
		stopChan:   make(chan struct{}),
	}
}

// GetConfigPath returns the default config file path.
// Creates config in same directory as executable.
func GetConfigPath() string {
	// Try to get executable directory
	exe, err := os.Executable()
	if err != nil {
		// Fallback to current directory
		return "config.json"
	}
	dir := filepath.Dir(exe)
	return filepath.Join(dir, "config.json")
}

// Exists checks if the config file exists.
func (m *Manager) Exists() bool {
	_, err := os.Stat(m.configPath)
	return err == nil
}

// Load reads configuration from file.
// Returns error if file doesn't exist (use LoadOrSetup for first-time setup).
func (m *Manager) Load() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("config not found: %s (run setup first)", m.configPath)
		}
		return fmt.Errorf("failed to read config: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("failed to parse config: %w", err)
	}

	// Apply defaults for missing fields
	if cfg.DeviceID == "" {
		cfg.DeviceID = getDefaultDeviceID()
	}
	if cfg.ServerURL == "" {
		cfg.ServerURL = "http://localhost:8080"
	}

	m.config = cfg
	return nil
}

// LoadOrSetup loads config if exists, otherwise runs interactive setup.
// Returns true if setup was performed (new user).
func (m *Manager) LoadOrSetup() (bool, error) {
	if m.Exists() {
		// Config exists, just load it
		return false, m.Load()
	}

	// First-time setup
	fmt.Println("\n🎙️  Welcome to Reliquary Voice Client!")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("Let's set up your configuration.")

	// Get server URL
	fmt.Print("Server URL [http://localhost:8080]: ")
	var serverURL string
	fmt.Scanln(&serverURL)
	if serverURL == "" {
		serverURL = "http://localhost:8080"
	}

	// Get auth token
	fmt.Println("\nTo get your auth token:")
	fmt.Println("  1. Open the Reliquary web UI")
	fmt.Println("  2. Register with your invite code")
	fmt.Println("  3. Copy your master secret (sk-reliquary-xxx)")
	fmt.Println()
	fmt.Print("Auth Token (or press Enter to skip): ")
	var authToken string
	fmt.Scanln(&authToken)

	// Create config
	m.mu.Lock()
	m.config = Config{
		KeyCode:   defaultKeyCode(),
		ServerURL: serverURL,
		DeviceID:  getDefaultDeviceID(),
		AuthToken: authToken,
		ApiKey:    "",            // Can be set via web UI later
		Pipeline:  "raw_whisper", // Default to raw whisper
	}
	m.mu.Unlock()

	if err := m.Save(); err != nil {
		return true, fmt.Errorf("failed to save config: %w", err)
	}

	fmt.Printf("\n✅ Config saved to: %s\n", m.configPath)
	if authToken == "" {
		fmt.Println("⚠️  No auth token set. You can add it later to config.json")
	}
	fmt.Println()

	return true, nil
}

// SetAuthToken updates the auth token and saves to disk.
// Used when receiving token from server registration.
func (m *Manager) SetAuthToken(token string) error {
	m.mu.Lock()
	m.config.AuthToken = token
	m.mu.Unlock()
	return m.Save()
}

// SetApiKey updates the API key (BYOK) and saves to disk.
// Used when receiving config update from server.
func (m *Manager) SetApiKey(apiKey string) error {
	m.mu.Lock()
	m.config.ApiKey = apiKey
	m.mu.Unlock()
	return m.Save()
}

// SetLanguage updates the language setting and saves to disk.
func (m *Manager) SetLanguage(lang string) error {
	m.mu.Lock()
	m.config.Language = lang
	m.mu.Unlock()
	return m.Save()
}

// SetPipeline updates the pipeline setting and saves to disk.
func (m *Manager) SetPipeline(pipeline string) error {
	m.mu.Lock()
	m.config.Pipeline = pipeline
	m.mu.Unlock()
	return m.Save()
}

// saveDefault creates a default config file.
func (m *Manager) saveDefault() error {
	m.config = DefaultConfig()
	return m.saveConfig()
}

// saveConfig writes the current config to file.
func (m *Manager) saveConfig() error {
	data, err := json.MarshalIndent(m.config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.configPath, data, 0644)
}

// Save persists the current configuration to disk.
// Used by Control Plane to save server-pushed config updates.
func (m *Manager) Save() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.saveConfig()
}

// Update atomically updates configuration fields and persists to disk.
// Useful for applying partial config updates from Control Plane.
func (m *Manager) Update(keyCode *int, serverURL *string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	changed := false

	if keyCode != nil && m.config.KeyCode != *keyCode {
		m.config.KeyCode = *keyCode
		changed = true
	}
	if serverURL != nil && m.config.ServerURL != *serverURL {
		m.config.ServerURL = *serverURL
		changed = true
	}

	if changed {
		return m.saveConfig()
	}
	return nil
}

// SetKeyCode updates the keycode and persists to disk.
func (m *Manager) SetKeyCode(keyCode int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.config.KeyCode == keyCode {
		return nil
	}

	m.config.KeyCode = keyCode
	return m.saveConfig()
}

// Get returns the current configuration.
func (m *Manager) Get() Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.config
}

// OnChange sets the callback for configuration changes.
func (m *Manager) OnChange(fn func(Config)) {
	m.onChange = fn
}

// StartWatching begins watching the config file for changes.
func (m *Manager) StartWatching() {
	go func() {
		var lastModTime time.Time
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-m.stopChan:
				return
			case <-ticker.C:
				info, err := os.Stat(m.configPath)
				if err != nil {
					continue
				}

				modTime := info.ModTime()
				if modTime.After(lastModTime) && !lastModTime.IsZero() {
					// Config file changed
					oldConfig := m.Get()
					if err := m.Load(); err != nil {
						fmt.Printf("[Config] Failed to reload: %v\n", err)
						continue
					}

					newConfig := m.Get()
					if newConfig != oldConfig {
						fmt.Printf("[Config] Configuration changed: keycode=%d, server=%s\n",
							newConfig.KeyCode, newConfig.ServerURL)
						if m.onChange != nil {
							m.onChange(newConfig)
						}
					}
				}
				lastModTime = modTime
			}
		}
	}()
}

// StopWatching stops the config file watcher.
func (m *Manager) StopWatching() {
	close(m.stopChan)
}
