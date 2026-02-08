package engine

import (
	"fmt"
	"log"
	"sync"
	"time"

	"voice-typing-client/internal/network"
)

// State represents the current engine state.
type State int

const (
	StateIdle State = iota
	StateRecording
	StateProcessing
)

func (s State) String() string {
	switch s {
	case StateIdle:
		return "Idle"
	case StateRecording:
		return "Recording"
	case StateProcessing:
		return "Processing"
	default:
		return "Unknown"
	}
}

// ResultHandler is the callback interface for engine events.
type ResultHandler interface {
	OnText(text string)
	OnError(err error)
	OnStatus(status string)
}

// Config holds the engine configuration.
type Config struct {
	ServerURL          string
	DeviceID           string
	AuthToken          string
	ApiKey             string
	Language           string
	Pipeline           string
	InsecureSkipVerify bool
	SampleRate         int
}

// Engine manages the voice typing logic (State + Network).
type Engine struct {
	config  Config
	handler ResultHandler

	mu           sync.Mutex
	state        State
	streamClient *network.StreamClient
	audioChan    chan []byte
	streamDone   chan struct{}
	streamError  error

	recordingStartTime time.Time
}

// NewEngine creates a new voice typing engine.
func NewEngine(cfg Config, handler ResultHandler) *Engine {
	return &Engine{
		config:  cfg,
		handler: handler,
		state:   StateIdle,
	}
}

// UpdateConfig updates the engine configuration dynamically.
func (e *Engine) UpdateConfig(cfg Config) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.config = cfg
}

// StartRecording initiates a recording session.
func (e *Engine) StartRecording() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.state != StateIdle {
		return fmt.Errorf("engine is not idle: %s", e.state)
	}

	e.handler.OnStatus("Recording...")
	e.recordingStartTime = time.Now()
	e.streamError = nil
	e.state = StateRecording

	// Prepare audio channel
	e.audioChan = make(chan []byte, 100)

	// Identity for connection
	identity := network.Identity{
		DeviceID:           e.config.DeviceID,
		AuthToken:          e.config.AuthToken,
		ApiKey:             e.config.ApiKey,
		Language:           e.config.Language,
		Pipeline:           e.config.Pipeline,
		InsecureSkipVerify: e.config.InsecureSkipVerify,
	}

	// Initialize StreamClient
	e.streamClient = network.NewStreamClient(e.config.ServerURL, identity)
	if err := e.streamClient.Connect(); err != nil {
		e.state = StateIdle
		return fmt.Errorf("failed to connect: %w", err)
	}

	// Send Config Handshake
	if err := e.streamClient.SendConfig(e.config.SampleRate); err != nil {
		e.streamClient.Close()
		e.state = StateIdle
		return fmt.Errorf("failed to send config: %w", err)
	}

	// Start streaming loop
	e.streamDone = make(chan struct{})
	go e.runStreamLoop()

	return nil
}

// WriteAudio pushes PCM chunks to the engine.
func (e *Engine) WriteAudio(data []byte) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.state != StateRecording {
		return nil // Ignore audio if not recording (or return error)
	}

	select {
	case e.audioChan <- data:
		return nil
	default:
		return fmt.Errorf("audio buffer full, dropping frame")
	}
}

// StopRecording ends the session and waits for result.
func (e *Engine) StopRecording() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.state != StateRecording {
		return
	}

	duration := time.Since(e.recordingStartTime)
	close(e.audioChan) // Signal end of audio stream

	// Wait for streaming loop to finish sending
	<-e.streamDone

	// Check if stream failed
	if e.streamError != nil {
		e.state = StateIdle
		e.streamClient.Close()
		e.handler.OnError(fmt.Errorf("stream connection lost"))
		e.handler.OnStatus("Ready")
		return
	}

	// Filter short recordings
	if duration < 500*time.Millisecond {
		e.state = StateIdle
		e.streamClient.Close()
		e.handler.OnStatus("Ready (Ignored short tap)")
		return
	}

	e.state = StateProcessing
	e.handler.OnStatus("Processing...")

	// Do network IO in background to avoid blocking caller (UI thread)
	// Note: In a UI app, we probably want to offload this.
	// For simplicity, we'll spawn a goroutine here, but we need to ensure thread safety.
	// Actually, let's keep it simple: The caller calls StopRecording, we transition state.
	// The retrieval of results should happen asynchronously.

	go func(client *network.StreamClient) {
		// Send EOF
		if err := client.SendEOF(); err != nil {
			e.handler.OnError(fmt.Errorf("failed to send EOF: %w", err))
			client.Close()
			e.resetState()
			return
		}

		// Receive Result
		result, err := client.ReceiveResult()
		client.Close()

		if err != nil {
			e.handler.OnError(fmt.Errorf("transcription failed: %w", err))
		} else if result.Text != "" {
			e.handler.OnText(result.Text)
		} else {
			e.handler.OnStatus("No speech detected")
		}

		e.resetState()
	}(e.streamClient)
}

func (e *Engine) resetState() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.state = StateIdle
	e.handler.OnStatus("Ready")
}

func (e *Engine) runStreamLoop() {
	defer close(e.streamDone)
	if err := e.streamClient.StreamAudio(e.audioChan); err != nil {
		e.mu.Lock()
		e.streamError = err
		e.mu.Unlock()
		log.Printf("[Engine] Stream error: %v", err)
	}
}
