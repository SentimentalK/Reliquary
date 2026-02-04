"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.chat import router as chat_router
from app.api.devices import router as devices_router
from app.config import get_settings

app = FastAPI(
    title="Voice Typing API",
    description="Low-latency voice transcription service with Control Plane",
    version="0.2.0",
)

# CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(chat_router, tags=["transcription"])
app.include_router(devices_router, tags=["devices"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=True,
        ws_ping_interval=None,  # Disable ping - client may not respond during streaming
        ws_ping_timeout=None,   # No timeout
        timeout_keep_alive=300,  # Keep connections alive for 5 minutes
    )
