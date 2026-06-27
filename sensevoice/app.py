import os
import time
import tempfile
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess
import torch

app = FastAPI(title="Reliquary SenseVoice Service", version="1.0.0")

# Check device (cuda or cpu)
device = os.environ.get("SENSEVOICE_DEVICE", "cpu")
if device == "cuda" and not torch.cuda.is_available():
    print("CUDA requested but not available. Falling back to CPU.")
    device = "cpu"

print(f"Loading SenseVoice model on {device}...")
model = AutoModel(
    model="iic/SenseVoiceSmall",
    vad_model="fsmn-vad",
    vad_kwargs={"max_single_segment_time": 30000},
    device=device,
)
print("Model loaded successfully.")

@app.get("/health")
async def health():
    return {"status": "ok", "device": device}

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("auto")
):
    try:
        t0 = time.time()
        audio_bytes = await file.read()
        
        # Write to a temporary file for FunASR generator
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
            temp_file.write(audio_bytes)
            temp_path = temp_file.name
        
        try:
            res = model.generate(
                input=temp_path,
                cache={},
                language=language,
                use_itn=True,
            )
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        
        if not res:
            raise HTTPException(status_code=500, detail="Inference returned empty result")
            
        raw_text = res[0].get("text", "")
        # Apply rich transcription postprocess to get clean text (punctuation, casing, etc.)
        text = rich_transcription_postprocess(raw_text)
        
        # Clean emojis, smiley faces, and sound event tags (like [laughter], (笑声), etc.)
        import re
        text = re.sub(r'[\U00010000-\U0010ffff]', '', text)  # Plane 1+ emojis
        text = re.sub(r'[\u2600-\u27BF]', '', text)          # Basic Plane emojis/symbols
        text = re.sub(r'\[.*?\]|<.*?>|\(.*?\)', '', text)    # Sound event tags in brackets
        # Strip common emoji characters explicitly just in case
        for sym in ["😄", "👏", "🎼", "🎵", "🎶", "😊", "😢", "😡", "😭", "😆", "😅"]:
            text = text.replace(sym, "")
        text = re.sub(r'\s+', ' ', text).strip()
        
        latency_ms = int((time.time() - t0) * 1000)
        return {
            "text": text,
            "latency_ms": latency_ms
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/audio/transcriptions")
async def openai_transcriptions(
    file: UploadFile = File(...),
    model: str = Form("SenseVoiceSmall"),
    language: str = Form(None),
    prompt: str = Form(None),
    response_format: str = Form("json"),
    temperature: float = Form(0.0),
):
    # Map request to underlying transcribe logic
    lang_param = language or "auto"
    result = await transcribe(file=file, language=lang_param)
    
    # OpenAI response format mapping
    if response_format == "text":
        return result["text"]
    
    # Default is JSON format
    return {"text": result["text"]}
