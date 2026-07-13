"""
Voice loop — Twilio inbound call + OpenAI Realtime API bridge.

Endpoints
---------
POST /voice/incoming
    Twilio Voice webhook. Returns TwiML <Connect><Stream> pointing at /voice/ws.

WS   /voice/ws
    Twilio Media Streams WebSocket. Bridges mulaw/8000 Hz audio to the
    OpenAI Realtime API using the g711_ulaw format natively — no transcoding.

Audio path (zero transcoding)
------------------------------
  Twilio → mulaw/8000 Hz base64 → OpenAI input_audio_format: g711_ulaw
  OpenAI → g711_ulaw base64 delta → Twilio media event

Turn detection / barge-in
--------------------------
  OpenAI server VAD handles turn detection. When the caller interrupts
  (speech_started event), we cancel the current AI response and clear
  Twilio's audio buffer so the AI immediately stops speaking.

Telemetry
---------
  call_connected_at  : monotonic clock at stream "start" event
  first_audio_at     : monotonic clock at first response.audio.delta
  → time_to_first_response_ms persisted to voice_call_events and logged.

DB tables (agentops_py schema)
-------------------------------
  voice_calls        — one row per call (anchor)
  voice_call_events  — append-only event log (call_start, first_audio_response,
                       openai_error, bridge_error, call_end)
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from websockets.asyncio.client import connect as ws_connect

from database import get_conn
from log import get_logger

router = APIRouter(prefix="/voice", tags=["voice"])
log = get_logger("voice")

_OPENAI_REALTIME_URL = (
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview"
)

_SESSION_CONFIG: dict = {
    "type": "session.update",
    "session": {
        "turn_detection": {"type": "server_vad"},
        "input_audio_format": "g711_ulaw",
        "output_audio_format": "g711_ulaw",
        "voice": "alloy",
        "instructions": (
            "You are an AI voice assistant for AgentOps, a portfolio operations "
            "platform. You help portfolio company staff submit and track operational "
            "requests. Keep answers concise — this is a phone call."
        ),
        "modalities": ["text", "audio"],
    },
}


# ---------------------------------------------------------------------------
# DB helpers — sync, dispatched via asyncio.to_thread from the WS handler
# ---------------------------------------------------------------------------

def _db_insert_call(call_sid: str, from_number: str, to_number: str) -> int:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO agentops_py.voice_calls
                (twilio_call_sid, from_number, to_number, status, started_at)
            VALUES (%s, %s, %s, 'ringing', %s)
            RETURNING id
            """,
            (call_sid, from_number, to_number, datetime.now(tz=timezone.utc)),
        )
        row = cur.fetchone()
        conn.commit()
        return row[0]  # type: ignore[index]


def _db_update_call(call_id: int, status: str, *, ended: bool = False) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        if ended:
            cur.execute(
                "UPDATE agentops_py.voice_calls SET status=%s, ended_at=%s WHERE id=%s",
                (status, datetime.now(tz=timezone.utc), call_id),
            )
        else:
            cur.execute(
                "UPDATE agentops_py.voice_calls SET status=%s WHERE id=%s",
                (status, call_id),
            )
        conn.commit()


def _db_log_event(call_id: int, event_type: str, detail: dict) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO agentops_py.voice_call_events
                (call_id, event_type, timestamp, detail)
            VALUES (%s, %s, %s, %s)
            """,
            (
                call_id,
                event_type,
                datetime.now(tz=timezone.utc),
                json.dumps(detail),
            ),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Shared mutable state for one call session
# ---------------------------------------------------------------------------

@dataclass
class _CallState:
    call_id: Optional[int] = None
    stream_sid: Optional[str] = None
    call_sid: str = "unknown"
    from_number: str = "unknown"
    to_number: str = "unknown"
    connected_at: Optional[float] = None   # time.monotonic()
    first_audio_at: Optional[float] = None
    current_response_id: Optional[str] = None


# ---------------------------------------------------------------------------
# TwiML webhook — called by Twilio when a call arrives
# ---------------------------------------------------------------------------

@router.post("/incoming")
async def voice_incoming(request: Request) -> Response:
    """
    Twilio Voice POST webhook.

    Returns TwiML that tells Twilio to open a Media Stream to /voice/ws
    on this same host, forwarding the call's audio in real time.
    """
    form = await request.form()
    call_sid = str(form.get("CallSid", "unknown"))
    from_num = str(form.get("From", "unknown"))
    to_num = str(form.get("To", "unknown"))

    log.info("inbound call", extra={"call_sid": call_sid, "from": from_num})

    # Build WebSocket URL from the inbound request's Host header so this
    # works on both dev (*.spock.replit.dev) and deployed (*.replit.app).
    host = request.headers.get("host", "")
    ws_url = f"wss://{host}/api-python/voice/ws"

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<Response>\n"
        "  <Connect>\n"
        f'    <Stream url="{ws_url}">\n'
        f'      <Parameter name="CallSid" value="{call_sid}"/>\n'
        f'      <Parameter name="From" value="{from_num}"/>\n'
        f'      <Parameter name="To" value="{to_num}"/>\n'
        "    </Stream>\n"
        "  </Connect>\n"
        "</Response>\n"
    )
    return Response(content=twiml, media_type="application/xml")


# ---------------------------------------------------------------------------
# WebSocket bridge
# ---------------------------------------------------------------------------

@router.websocket("/ws")
async def voice_ws(websocket: WebSocket) -> None:
    """
    Twilio Media Streams WebSocket endpoint.

    Maintains two concurrent async tasks:
      receive_from_twilio — reads Twilio events, forwards audio → OpenAI
      receive_from_openai — reads OpenAI events, forwards audio → Twilio

    Both tasks share a _CallState instance for low-overhead coordination
    (no locks needed — only one task writes each field).
    """
    await websocket.accept()

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        log.error("OPENAI_API_KEY is not set — rejecting voice WebSocket")
        await websocket.close(code=1011, reason="OPENAI_API_KEY not configured")
        return

    state = _CallState()

    try:
        async with ws_connect(
            _OPENAI_REALTIME_URL,
            additional_headers={
                "Authorization": f"Bearer {api_key}",
                "OpenAI-Beta": "realtime=v1",
            },
            ping_interval=20,
        ) as openai_ws:

            # ------------------------------------------------------------------
            # Task 1: Twilio → OpenAI
            # ------------------------------------------------------------------
            async def receive_from_twilio() -> None:
                try:
                    async for raw in websocket.iter_text():
                        msg = json.loads(raw)
                        event = msg.get("event")

                        if event == "connected":
                            log.info("twilio: media stream connected")

                        elif event == "start":
                            _handle_start(msg, state)
                            state.connected_at = time.monotonic()

                            state.call_id = await asyncio.to_thread(
                                _db_insert_call,
                                state.call_sid,
                                state.from_number,
                                state.to_number,
                            )
                            await asyncio.to_thread(
                                _db_update_call, state.call_id, "in-progress"
                            )
                            await asyncio.to_thread(
                                _db_log_event,
                                state.call_id,
                                "call_start",
                                {
                                    "stream_sid": state.stream_sid,
                                    "call_sid": state.call_sid,
                                    "from": state.from_number,
                                    "to": state.to_number,
                                },
                            )
                            log.info(
                                "voice stream started",
                                extra={
                                    "call_id": state.call_id,
                                    "call_sid": state.call_sid,
                                    "stream_sid": state.stream_sid,
                                },
                            )

                            # Tell OpenAI how to configure the session
                            await openai_ws.send(json.dumps(_SESSION_CONFIG))

                        elif event == "media":
                            # Hot path — zero-copy forward of base64 mulaw payload
                            await openai_ws.send(
                                json.dumps(
                                    {
                                        "type": "input_audio_buffer.append",
                                        "audio": msg["media"]["payload"],
                                    }
                                )
                            )

                        elif event == "stop":
                            log.info(
                                "twilio: stream stopped",
                                extra={"call_sid": state.call_sid},
                            )
                            break

                except WebSocketDisconnect:
                    log.info(
                        "twilio websocket disconnected",
                        extra={"call_sid": state.call_sid},
                    )

            # ------------------------------------------------------------------
            # Task 2: OpenAI → Twilio
            # ------------------------------------------------------------------
            async def receive_from_openai() -> None:
                async for raw in openai_ws:
                    msg = json.loads(raw)
                    etype = msg.get("type", "")

                    if etype in ("session.created", "session.updated"):
                        log.info(f"openai: {etype}")

                    elif etype == "response.created":
                        state.current_response_id = (
                            msg.get("response", {}).get("id")
                        )

                    elif etype == "response.audio.delta":
                        delta = msg.get("delta", "")
                        if not delta or not state.stream_sid:
                            continue

                        # Latency telemetry — first delta only
                        if state.first_audio_at is None:
                            state.first_audio_at = time.monotonic()
                            if state.call_id and state.connected_at is not None:
                                ttfr_ms = round(
                                    (state.first_audio_at - state.connected_at) * 1000
                                )
                                log.info(
                                    "first audio response",
                                    extra={
                                        "call_id": state.call_id,
                                        "time_to_first_response_ms": ttfr_ms,
                                    },
                                )
                                await asyncio.to_thread(
                                    _db_log_event,
                                    state.call_id,
                                    "first_audio_response",
                                    {"time_to_first_response_ms": ttfr_ms},
                                )

                        # Forward mulaw audio chunk to Twilio
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "event": "media",
                                    "streamSid": state.stream_sid,
                                    "media": {"payload": delta},
                                }
                            )
                        )

                    elif etype == "response.audio.done":
                        state.current_response_id = None

                    elif etype == "input_audio_buffer.speech_started":
                        # Barge-in: caller interrupted the AI mid-speech.
                        # Cancel the running AI response and clear Twilio's
                        # audio queue so the AI stops playing immediately.
                        log.info("barge-in detected")
                        if state.current_response_id:
                            await openai_ws.send(
                                json.dumps({"type": "response.cancel"})
                            )
                        if state.stream_sid:
                            await websocket.send_text(
                                json.dumps(
                                    {
                                        "event": "clear",
                                        "streamSid": state.stream_sid,
                                    }
                                )
                            )

                    elif etype == "error":
                        log.error(
                            "openai realtime error",
                            extra={"detail": msg.get("error")},
                        )
                        if state.call_id:
                            await asyncio.to_thread(
                                _db_log_event,
                                state.call_id,
                                "openai_error",
                                {"error": msg.get("error")},
                            )

            # ------------------------------------------------------------------
            # Run both tasks; stop as soon as either side finishes
            # ------------------------------------------------------------------
            t_twilio = asyncio.create_task(receive_from_twilio())
            t_openai = asyncio.create_task(receive_from_openai())

            done, pending = await asyncio.wait(
                {t_twilio, t_openai},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            # Surface any non-cancellation exception from the finished task
            for task in done:
                if not task.cancelled() and task.exception() is not None:
                    raise task.exception()  # type: ignore[misc]

    except WebSocketDisconnect:
        log.info("ws disconnect during setup", extra={"call_sid": state.call_sid})
    except Exception as exc:
        log.error(
            "voice bridge exception",
            extra={"error": str(exc), "call_sid": state.call_sid},
        )
        if state.call_id:
            await asyncio.to_thread(
                _db_log_event,
                state.call_id,
                "bridge_error",
                {"error": str(exc)},
            )
    finally:
        if state.call_id:
            ttfr: Optional[int] = (
                round((state.first_audio_at - state.connected_at) * 1000)
                if state.first_audio_at is not None
                and state.connected_at is not None
                else None
            )
            await asyncio.to_thread(
                _db_log_event,
                state.call_id,
                "call_end",
                {"time_to_first_response_ms": ttfr},
            )
            await asyncio.to_thread(
                _db_update_call, state.call_id, "completed", ended=True
            )
        log.info("voice session closed", extra={"call_sid": state.call_sid})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _handle_start(msg: dict, state: _CallState) -> None:
    """Parse the Twilio 'start' event and populate call state."""
    start = msg.get("start", {})
    state.stream_sid = start.get("streamSid")
    params: dict[str, str] = {
        p["name"]: p["value"]
        for p in start.get("customParameters", [])
    }
    state.call_sid = params.get("CallSid") or start.get("callSid", "unknown")
    state.from_number = params.get("From") or start.get("from", "unknown")
    state.to_number = params.get("To") or start.get("to", "unknown")
