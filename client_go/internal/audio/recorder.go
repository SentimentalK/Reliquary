// Package audio provides microphone recording functionality.
package audio

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"sync"

	"github.com/gen2brain/malgo"
)

// Recorder handles microphone audio capture.
type Recorder struct {
	ctx     *malgo.AllocatedContext
	device  *malgo.Device
	buffer  *bytes.Buffer
	mu      sync.Mutex
	running bool

	// Audio format settings
	SampleRate uint32
	Channels   uint32
	BitDepth   uint32
}

// NewRecorder creates a new audio recorder with default settings.
func NewRecorder() (*Recorder, error) {
	ctx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to init audio context: %w", err)
	}

	return &Recorder{
		ctx:        ctx,
		buffer:     &bytes.Buffer{},
		SampleRate: 16000, // 16kHz for speech recognition
		Channels:   1,     // Mono
		BitDepth:   16,    // 16-bit
	}, nil
}

// Start begins recording from the default microphone.
func (r *Recorder) Start() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.running {
		return nil
	}

	r.buffer.Reset()

	deviceConfig := malgo.DefaultDeviceConfig(malgo.Capture)
	deviceConfig.Capture.Format = malgo.FormatS16
	deviceConfig.Capture.Channels = r.Channels
	deviceConfig.SampleRate = r.SampleRate

	// Callback for receiving audio data
	onData := func(outputSamples, inputSamples []byte, frameCount uint32) {
		r.mu.Lock()
		r.buffer.Write(inputSamples)
		r.mu.Unlock()
	}

	device, err := malgo.InitDevice(r.ctx.Context, deviceConfig, malgo.DeviceCallbacks{
		Data: onData,
	})
	if err != nil {
		return fmt.Errorf("failed to init capture device: %w", err)
	}

	if err := device.Start(); err != nil {
		device.Uninit()
		return fmt.Errorf("failed to start capture: %w", err)
	}

	r.device = device
	r.running = true
	return nil
}

// Stop ends recording and returns audio as WAV bytes.
func (r *Recorder) Stop() ([]byte, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.running {
		return nil, fmt.Errorf("recorder not running")
	}

	r.device.Stop()
	r.device.Uninit()
	r.device = nil
	r.running = false

	// Convert raw PCM to WAV
	return r.toWAV(r.buffer.Bytes()), nil
}

// toWAV wraps raw PCM data with a WAV header.
func (r *Recorder) toWAV(pcmData []byte) []byte {
	buf := &bytes.Buffer{}

	// RIFF header
	buf.WriteString("RIFF")
	binary.Write(buf, binary.LittleEndian, uint32(36+len(pcmData)))
	buf.WriteString("WAVE")

	// fmt chunk
	buf.WriteString("fmt ")
	binary.Write(buf, binary.LittleEndian, uint32(16))       // Chunk size
	binary.Write(buf, binary.LittleEndian, uint16(1))        // PCM format
	binary.Write(buf, binary.LittleEndian, uint16(r.Channels))
	binary.Write(buf, binary.LittleEndian, r.SampleRate)
	byteRate := r.SampleRate * r.Channels * (r.BitDepth / 8)
	binary.Write(buf, binary.LittleEndian, byteRate)
	blockAlign := r.Channels * (r.BitDepth / 8)
	binary.Write(buf, binary.LittleEndian, uint16(blockAlign))
	binary.Write(buf, binary.LittleEndian, uint16(r.BitDepth))

	// data chunk
	buf.WriteString("data")
	binary.Write(buf, binary.LittleEndian, uint32(len(pcmData)))
	buf.Write(pcmData)

	return buf.Bytes()
}

// Close releases audio resources.
func (r *Recorder) Close() {
	if r.running {
		r.Stop()
	}
	if r.ctx != nil {
		r.ctx.Uninit()
		r.ctx.Free()
	}
}
