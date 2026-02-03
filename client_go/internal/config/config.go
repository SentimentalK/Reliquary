// Package config provides configuration management with hot-reload support.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Config represents the application configuration.
type Config struct {
	KeyCode   int    `json:"keycode"`
	ServerURL string `json:"server_url"`
}

// DefaultConfig returns the default configuration.
func DefaultConfig() Config {
	return Config{
		KeyCode:   61, // Right Option on macOS
		ServerURL: "http://localhost:8080",
	}
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

	m.config = cfg
	return nil
}

// saveDefault creates a default config file.
func (m *Manager) saveDefault() error {
	m.config = DefaultConfig()
	data, err := json.MarshalIndent(m.config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.configPath, data, 0644)
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
