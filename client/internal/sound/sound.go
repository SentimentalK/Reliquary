// Package sound provides audio feedback for recording states.
package sound

import (
	"os/exec"
	"runtime"
)

// PlayStart plays a sound indicating recording has started.
func PlayStart() {
	playPop()
}

// PlayStop is called when recording stops.
// No sound - user will hear the success sound after transcription.
func PlayStop() {
	// No sound on stop
}

// PlaySuccess plays a sound indicating successful transcription.
// Uses the same Pop sound as start for consistency.
func PlaySuccess() {
	playPop()
}

// PlayError plays a sound indicating an error occurred.
func PlayError() {
	switch runtime.GOOS {
	case "darwin":
		exec.Command("afplay", "/System/Library/Sounds/Basso.aiff").Start()
	case "windows":
		exec.Command("powershell", "-c", "[console]::beep(300,300)").Start()
	case "linux":
		exec.Command("paplay", "/usr/share/sounds/freedesktop/stereo/dialog-error.oga").Start()
	}
}

// playPop plays the Pop sound.
func playPop() {
	switch runtime.GOOS {
	case "darwin":
		exec.Command("afplay", "/System/Library/Sounds/Pop.aiff").Start()
	case "windows":
		exec.Command("powershell", "-c", "[console]::beep(800,200)").Start()
	case "linux":
		exec.Command("paplay", "/usr/share/sounds/freedesktop/stereo/message.oga").Start()
	}
}
