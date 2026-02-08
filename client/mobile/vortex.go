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

// Reliquary is the facade for the Android client.
type Reliquary struct {
	engine   *engine.Engine
	callback MobileCallback
}

// NewReliquary creates a new Reliquary instance.
func NewReliquary(serverURL, deviceID, authToken, apiKey string, callback MobileCallback) *Reliquary {
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

	return &Reliquary{
		engine:   engine.NewEngine(cfg, handler),
		callback: callback,
	}
}

// Start begins a recording session.
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
