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
	UserID    string `json:"user_id"`
	DeviceID  string `json:"device_id"`
}

// DefaultConfig returns the default configuration.
func DefaultConfig() Config {
	return Config{
		KeyCode:   61, // Right Option on macOS
		ServerURL: "http://localhost:8080",
		UserID:    "default_user",
		DeviceID:  getDefaultDeviceID(),
	}
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
		return "voice_config.json"
	}
	dir := filepath.Dir(exe)
	return filepath.Join(dir, "voice_config.json")
}

// Load reads configuration from file.
// Creates default config if file doesn't exist.
func (m *Manager) Load() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Create default config file
			return m.saveDefault()
		}
		return fmt.Errorf("failed to read config: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("failed to parse config: %w", err)
	}

	// Apply defaults for missing fields
	if cfg.UserID == "" {
		cfg.UserID = "default_user"
	}
	if cfg.DeviceID == "" {
		cfg.DeviceID = getDefaultDeviceID()
	}

	m.config = cfg
	return nil
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
