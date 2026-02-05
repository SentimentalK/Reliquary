"""Raw Whisper pipeline using Groq API."""

import io
from groq import Groq

from app.config import get_settings
from app.services.pipelines.base import BasePipeline


# Prompt with technical keywords to improve recognition accuracy
# Whisper uses this as context to better recognize domain-specific terms
WHISPER_PROMPT = """
Technical terms: Docker, Kubernetes, AWS, GCP, Azure, API, REST, GraphQL, 
PostgreSQL, Jenkins, Redis, Kafka, RabbitMQ, nginx, Apache, 
Python, JavaScript, TypeScript, Go, Golang, Rust, Java, C++,
React, Vue, Angular, Node.js, FastAPI, Flask, Django,
GitHub, GitLab, CI/CD, DevOps, microservices, containerization,
machine learning, AI, LLM, GPT, transformer, MVP,
JSON, YAML, XML, CSV, Markdown, HTML, CSS, SQL, NoSQL,
localhost, HTTP, HTTPS, WebSocket, SSH, SSL, TLS, OAuth, JWT,
Linux, Ubuntu, macOS, Windows, terminal, shell, bash, zsh.
"""
WHISPER_PROMPT = ''

class RawWhisperPipeline(BasePipeline):
    """
    Direct transcription using Groq's Whisper-large-v3 model.
    
    Uses a prompt with technical keywords to improve recognition.
    Supports BYOK (Bring Your Own Key) via per-request API key.
    """
    
    MODEL = "whisper-large-v3"
    
    def __init__(self):
        # Global API key removed as per request - strictly BYOK
        self._default_api_key = None
    
    def _get_client(self, api_key: str = None) -> Groq:
        """Get Groq client with specified API key (Strict BYOK)."""
        key = api_key
        if not key:
             # Check if we should fallback to server key? User requested strict removal.
             # "I need you to completely remove this global API key logic"
             pass

        # To be absolutely sure, we can still load from env if we wanted, 
        # but user said "if client doesn't give API key it theoretically shouldn't work".
        if not key:
            # Fallback to env ONLY IF explicitly not disabled, but user asked to remove logic.
            # So we will raise error.
            raise ValueError("Authentication error: valid API Key required (BYOK).")
            
        return Groq(api_key=key)
    
    async def transcribe(
        self, 
        audio_bytes: bytes, 
        filename: str = "audio.wav",
        language: str = None,
        prompt: str = None,
        api_key: str = None,  # BYOK: Bring Your Own Key
    ) -> str:
        """
        Transcribe audio using Groq Whisper API.
        
        Args:
            audio_bytes: Raw audio data.
            filename: Filename for format detection.
            language: Language code (e.g., "en", "zh", "ja").
            prompt: Optional custom prompt to guide recognition.
            api_key: Optional API key override (BYOK).
            
        Returns:
            Raw transcription text.
        """
        # Get client (with per-request API key if provided)
        client = self._get_client(api_key)
        
        # Create file-like object from bytes
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename
        
        # Use custom prompt or default technical prompt
        effective_prompt = prompt if prompt else WHISPER_PROMPT
        
        # Build API kwargs - only include language if specified
        api_kwargs = {
            "file": (filename, audio_file),
            "model": self.MODEL,
            "response_format": "text",
            "prompt": effective_prompt,
        }
        
        # Only add language if explicitly specified (None = auto-detect)
        if language:
            api_kwargs["language"] = language
        
        # Call Groq API
        transcription = client.audio.transcriptions.create(**api_kwargs)
        
        return transcription.strip() if isinstance(transcription, str) else transcription.text.strip()

