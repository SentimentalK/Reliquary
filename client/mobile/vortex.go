package mobile

import (
	"fmt"
	"log"
	"voice-typing-client/internal/engine"
	"voice-typing-client/internal/network"
)

// MobileCallback is the interface that Android must implement.
// Gomobile will generate a Java/Kotlin abstract class/interface for this.
type MobileCallback interface {
	OnText(text string)
	OnError(err string)
	OnStatus(status string)
	OnControlConnected()
	OnControlDisconnected()
	// OnConfigUpdate is called when server pushes config changes.
	// Empty string means "no change" for that field.
	OnConfigUpdate(apiKey, language, pipeline string)
}

// Reliquary is the facade for the Android client.
type Reliquary struct {
	engine       *engine.Engine
	controlPlane *network.ControlPlaneClient
	callback     MobileCallback
	identity     network.Identity
	serverURL    string
}

// NewReliquary creates a new Reliquary instance (backward-compatible).
func NewReliquary(serverURL, deviceID, authToken, apiKey string, callback MobileCallback) *Reliquary {
	return NewReliquaryWithConfig(serverURL, deviceID, authToken, apiKey, "", "", callback)
}

// NewReliquaryWithConfig creates a new Reliquary instance with full config.
// language and pipeline are persisted from previous sessions (e.g. SharedPreferences).
func NewReliquaryWithConfig(serverURL, deviceID, authToken, apiKey, language, pipeline string, callback MobileCallback) *Reliquary {
	// Default config for Android
	cfg := engine.Config{
		ServerURL:          serverURL,
		DeviceID:           deviceID,
		AuthToken:          authToken,
		ApiKey:             apiKey,
		Language:           language,
		Pipeline:           pipeline,
		SampleRate:         16000, // Android AudioRecord default
		InsecureSkipVerify: true,  // Often needed for dev/local
	}

	identity := network.Identity{
		DeviceID:           deviceID,
		AuthToken:          authToken,
		ApiKey:             apiKey,
		Language:           language,
		Pipeline:           pipeline,
		InsecureSkipVerify: true,
		Platform:           "android",
	}

	// Adapter to map engine.ResultHandler to MobileCallback
	handler := &mobileAdapter{cb: callback}

	return &Reliquary{
		engine:    engine.NewEngine(cfg, handler),
		callback:  callback,
		identity:  identity,
		serverURL: serverURL,
	}
}

// UpdateConfig updates engine config dynamically (e.g. after server push).
func (v *Reliquary) UpdateConfig(apiKey, language, pipeline string) {
	cfg := v.engine.GetConfig()
	if apiKey != "" {
		cfg.ApiKey = apiKey
		v.identity.ApiKey = apiKey
	}
	if language != "" {
		cfg.Language = language
		v.identity.Language = language
	} else {
		// Empty string means "auto detect" — clear the field
		cfg.Language = ""
		v.identity.Language = ""
	}
	if pipeline != "" {
		cfg.Pipeline = pipeline
		v.identity.Pipeline = pipeline
	}
	v.engine.UpdateConfig(cfg)
	log.Printf("[Mobile] Config updated: lang=%q, pipeline=%q, byok=%v", cfg.Language, cfg.Pipeline, cfg.ApiKey != "")
}

// ConnectControl establishes the persistent control plane WebSocket.
// Call this when the keyboard becomes visible (onWindowShown).
func (v *Reliquary) ConnectControl() {
	if v.controlPlane != nil {
		// Already connected or connecting
		return
	}

	v.controlPlane = network.NewControlPlaneClient(v.serverURL, v.identity)

	v.controlPlane.OnConnected(func() {
		if v.callback != nil {
			v.callback.OnControlConnected()
		}
	})

	v.controlPlane.OnDisconnected(func() {
		if v.callback != nil {
			v.callback.OnControlDisconnected()
		}
	})

	v.controlPlane.OnAuthFailed(func(reason string) {
		if v.callback != nil {
			v.callback.OnError(fmt.Sprintf("Control auth failed: %s", reason))
		}
	})

	// Handle config updates from server (the key feature)
	v.controlPlane.OnConfigUpdate(func(update network.ConfigUpdate) {
		apiKey := ""
		language := ""
		pipeline := ""

		if update.ApiKey != nil {
			apiKey = *update.ApiKey
		}
		if update.Language != nil {
			language = *update.Language
		}
		if update.Pipeline != nil {
			pipeline = *update.Pipeline
		}

		// Update engine config immediately
		v.UpdateConfig(apiKey, language, pipeline)

		// Notify Android to persist the changes
		if v.callback != nil {
			v.callback.OnConfigUpdate(apiKey, language, pipeline)
		}
	})

	// Connect in background goroutine with auto-reconnect
	go v.controlPlane.ConnectWithRetry()
}

// DisconnectControl tears down the control plane WebSocket.
// Call this when the keyboard is hidden (onWindowHidden).
func (v *Reliquary) DisconnectControl() {
	if v.controlPlane != nil {
		v.controlPlane.Stop()
		v.controlPlane = nil
	}
}

// IsControlConnected returns whether the control plane is active.
func (v *Reliquary) IsControlConnected() bool {
	if v.controlPlane == nil {
		return false
	}
	return v.controlPlane.IsConnected()
}

// Start begins a recording session (stream WebSocket, short-lived).
func (v *Reliquary) Start() error {
	return v.engine.StartRecording()
}

// WriteAudio accepts raw PCM data from Android AudioRecord.
// data: 16-bit PCM mono samples.
func (v *Reliquary) WriteAudio(data []byte) error {
	return v.engine.WriteAudio(data)
}

// Stop ends the recording session and triggers processing.
func (v *Reliquary) Stop() {
	v.engine.StopRecording()
}

// mobileAdapter adapts the engine.ResultHandler interface to MobileCallback.
type mobileAdapter struct {
	cb MobileCallback
}

func (m *mobileAdapter) OnText(text string) {
	if m.cb != nil {
		m.cb.OnText(text)
	}
}

func (m *mobileAdapter) OnError(err error) {
	if m.cb != nil {
		m.cb.OnError(err.Error())
	}
}

func (m *mobileAdapter) OnStatus(status string) {
	if m.cb != nil {
		m.cb.OnStatus(status)
	}
}
