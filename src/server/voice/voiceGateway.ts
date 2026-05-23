/**
 * Voice Session Gateway — WebSocket handler for realtime voice connections.
 *
 * Routes voice client events to the voice session service and provider adapter.
 * Phase 1 uses a fake provider that echoes back transcript and audio events.
 */

import type { ServerWebSocket } from 'bun'
import { voiceSessionService } from './voiceSessionService.js'
import { isVoiceClientEvent } from './protocol.js'
import type { VoiceClientEvent, VoiceServerEvent } from './protocol.js'

type VoiceWSData = {
  voiceSessionId: string
  connectedAt: number
}

// In-memory WS lookup for sending events to connected clients
const clientSockets = new Map<string, ServerWebSocket<VoiceWSData>>()

function sendEvent(ws: ServerWebSocket<VoiceWSData>, event: VoiceServerEvent): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(event))
  }
}

// ---- Fake Provider (Phase 1) ----

let fakeTimer: ReturnType<typeof setTimeout> | null = null

function fakeProviderRun(ws: ServerWebSocket<VoiceWSData>, voiceSessionId: string): void {
  const session = voiceSessionService.getSession(voiceSessionId)
  if (!session) return

  // Simulate provider flow: listening → thinking → transcript → speak
  voiceSessionService.updateState(voiceSessionId, 'listening')
  sendEvent(ws, { type: 'session.state', state: 'listening' })

  fakeTimer = setTimeout(() => {
    voiceSessionService.updateState(voiceSessionId, 'thinking')
    sendEvent(ws, { type: 'session.state', state: 'thinking' })

    fakeTimer = setTimeout(() => {
      sendEvent(ws, {
        type: 'transcript.delta',
        text: '你好，我是',
        speaker: 'assistant',
      })
      fakeTimer = setTimeout(() => {
        sendEvent(ws, {
          type: 'transcript.delta',
          text: '语音助手。',
          speaker: 'assistant',
        })
        fakeTimer = setTimeout(() => {
          sendEvent(ws, {
            type: 'transcript.final',
            text: '你好，我是语音助手。',
            speaker: 'assistant',
          })
          voiceSessionService.updateState(voiceSessionId, 'speaking')
          sendEvent(ws, { type: 'session.state', state: 'speaking' })
          sendEvent(ws, {
            type: 'assistant.audio.chunk',
            audio: 'FAKE_AUDIO_BASE64',
            format: 'pcm16',
          })
          sendEvent(ws, { type: 'assistant.audio.stop' })
          voiceSessionService.updateState(voiceSessionId, 'listening')
          sendEvent(ws, { type: 'session.state', state: 'listening' })
        }, 300)
      }, 200)
    }, 500)
  }, 300)
}

function fakeProviderInterrupt(voiceSessionId: string): void {
  if (fakeTimer) {
    clearTimeout(fakeTimer)
    fakeTimer = null
  }
  voiceSessionService.updateState(voiceSessionId, 'listening')
}

// ---- WebSocket handler ----

export const handleVoiceWebSocket = {
  open(ws: ServerWebSocket<VoiceWSData>): void {
    const { voiceSessionId } = ws.data
    const session = voiceSessionService.getSession(voiceSessionId)
    if (!session) {
      sendEvent(ws, {
        type: 'session.error',
        code: 'SESSION_NOT_FOUND',
        message: `Voice session ${voiceSessionId} not found`,
        recoverable: false,
      })
      ws.close()
      return
    }

    clientSockets.set(voiceSessionId, ws)
    voiceSessionService.updateState(voiceSessionId, 'connecting')
    sendEvent(ws, {
      type: 'session.started',
      voiceSessionId,
      agentSessionId: session.agentSessionId ?? '',
    })
    sendEvent(ws, { type: 'session.state', state: 'connecting' })

    // Phase 1: start fake provider
    fakeProviderRun(ws, voiceSessionId)
  },

  message(ws: ServerWebSocket<VoiceWSData>, raw: string | Buffer): void {
    const { voiceSessionId } = ws.data
    let event: unknown
    try {
      event = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
    } catch {
      sendEvent(ws, {
        type: 'session.error',
        code: 'PARSE_ERROR',
        message: 'Invalid JSON',
        recoverable: true,
      })
      return
    }

    if (!isVoiceClientEvent(event)) {
      sendEvent(ws, {
        type: 'session.error',
        code: 'INVALID_EVENT',
        message: `Unknown event type: ${(event as Record<string, unknown>).type ?? 'missing'}`,
        recoverable: true,
      })
      return
    }

    const ev = event as VoiceClientEvent

    switch (ev.type) {
      case 'assistant.interrupt': {
        fakeProviderInterrupt(voiceSessionId)
        voiceSessionService.updateState(voiceSessionId, 'interrupted')
        sendEvent(ws, { type: 'session.state', state: 'interrupted' })
        // After interrupt, go back to listening
        setTimeout(() => {
          voiceSessionService.updateState(voiceSessionId, 'listening')
          sendEvent(ws, { type: 'session.state', state: 'listening' })
        }, 200)
        break
      }
      case 'session.close': {
        fakeProviderInterrupt(voiceSessionId)
        voiceSessionService.closeSession(voiceSessionId)
        sendEvent(ws, { type: 'session.state', state: 'closed' })
        clientSockets.delete(voiceSessionId)
        ws.close()
        break
      }
      case 'audio.input.append':
      case 'audio.input.commit':
      case 'audio.input.clear':
      case 'permission.approve':
      case 'permission.reject':
        // No-op in Phase 1 — fake provider doesn't process real audio
        break
      case 'session.start':
        // session.start after reconnect — re-run fake provider
        fakeProviderRun(ws, voiceSessionId)
        break
    }
  },

  close(ws: ServerWebSocket<VoiceWSData>): void {
    const { voiceSessionId } = ws.data
    fakeProviderInterrupt(voiceSessionId)
    voiceSessionService.closeSession(voiceSessionId)
    clientSockets.delete(voiceSessionId)
  },

  drain(_ws: ServerWebSocket<VoiceWSData>): void {
    // no-op
  },
}
