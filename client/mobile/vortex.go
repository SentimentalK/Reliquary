package mobile

import (
	"voice-typing-client/internal/engine"
)

// MobileCallback is the interface that Android must implement.
// Gomobile will generate a Java/Kotlin abstract class/interface for this.
type MobileCallback interface {
	OnText(text string)
	OnError(err string)
	OnStatus(status string)
}

// Vortex is the facade for the Android client.
type Vortex struct {
	engine   *engine.Engine
	callback MobileCallback
}

// NewVortex creates a new Vortex instance.
func NewVortex(serverURL, deviceID, authToken, apiKey string, callback MobileCallback) *Vortex {
	// Default config for Android
	cfg := engine.Config{
		ServerURL:          serverURL,
		DeviceID:           deviceID,
		AuthToken:          authToken,
		ApiKey:             apiKey,
		SampleRate:         16000, // Android AudioRecord default
		InsecureSkipVerify: true,  // Often needed for dev/local
	}

	// Adapter to map engine.ResultHandler to MobileCallback
	handler := &mobileAdapter{cb: callback}

	return &Vortex{
		engine:   engine.NewEngine(cfg, handler),
		callback: callback,
	}
}

// Start begins a recording session.
func (v *Vortex) Start() error {
	return v.engine.StartRecording()
}

// WriteAudio accepts raw PCM data from Android AudioRecord.
// data: 16-bit PCM mono samples.
func (v *Vortex) WriteAudio(data []byte) error {
	return v.engine.WriteAudio(data)
}

// Stop ends the recording session and triggers processing.
func (v *Vortex) Stop() {
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
