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


class RawWhisperPipeline(BasePipeline):
    """
    Direct transcription using Groq's Whisper-large-v3 model.
    
    Uses a prompt with technical keywords to improve recognition.
    """
    
    MODEL = "whisper-large-v3"
    
    def __init__(self):
        settings = get_settings()
        self.client = Groq(api_key=settings.groq_api_key)
    
    async def transcribe(
        self, 
        audio_bytes: bytes, 
        filename: str = "audio.wav",
        language: str = None,
        prompt: str = None,
    ) -> str:
        """
        Transcribe audio using Groq Whisper API.
        
        Args:
            audio_bytes: Raw audio data.
            filename: Filename for format detection.
            language: Language code (e.g., "en", "zh", "ja").
            prompt: Optional custom prompt to guide recognition.
            
        Returns:
            Raw transcription text.
        """
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
        transcription = self.client.audio.transcriptions.create(**api_kwargs)
        
        return transcription.strip() if isinstance(transcription, str) else transcription.text.strip()
