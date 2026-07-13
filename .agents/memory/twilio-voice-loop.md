---
name: Twilio voice loop
description: Architecture and constraints for the Twilio → OpenAI Realtime API voice bridge in api-python.
---

The voice loop lives entirely in `api-python/voice.py` and is registered as `voice_router` in `main.py`.

**Architecture:**
- `POST /voice/incoming` — Twilio Voice webhook, returns TwiML `<Connect><Stream>` pointing at `/voice/ws` on the same host.
- `WS /voice/ws` — Twilio Media Streams WebSocket. Runs two async tasks: Twilio→OpenAI and OpenAI→Twilio.
- Audio format: mulaw/8000 Hz (g711_ulaw). Zero transcoding — OpenAI Realtime API accepts g711_ulaw natively.
- Barge-in: on `input_audio_buffer.speech_started`, send `response.cancel` to OpenAI and `clear` event to Twilio.
- Latency telemetry: `connected_at` set at Twilio `start` event, `first_audio_at` set at first `response.audio.delta`. Diff logged as `time_to_first_response_ms`.

**Why OPENAI_API_KEY is required (not the Replit proxy):**
The Replit AI Integrations proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL`) supports only HTTP endpoints — it cannot proxy WebSocket connections. The Realtime API is WebSocket-only (`wss://api.openai.com/v1/realtime`). A real `OPENAI_API_KEY` must be set as a secret.

**Model:** `gpt-4o-realtime-preview`

**DB tables (agentops_py schema):**
- `voice_calls` — one row per call; lifecycle: ringing → in-progress → completed/failed
- `voice_call_events` — append-only log; event_types: call_start, first_audio_response, openai_error, bridge_error, call_end

**How to apply:** Any future voice feature, tool-calling extension, or new audio model swap must go through `voice.py`. The `_SESSION_CONFIG` dict is the single place to change model, voice, or VAD settings.
