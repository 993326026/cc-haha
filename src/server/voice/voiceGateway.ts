/**
 * Voice Session Gateway — WebSocket handler for realtime voice connections.
 */

import type { ServerWebSocket } from 'bun'
import { voiceSessionService } from './voiceSessionService.js'
import { isVoiceClientEvent } from './protocol.js'
import type { VoiceClientEvent, VoiceServerEvent } from './protocol.js'
import { qwenOmniRealtimeAdapter } from './providers/qwenOmniRealtimeAdapter.js'
import type { ProviderConnection } from './providers/types.js'

type VoiceWSData = {
  voiceSessionId: string
  connectedAt: number
}

const clientSockets = new Map<string, ServerWebSocket<VoiceWSData>>()
const providerConns = new Map<string, ProviderConnection>()
const pendingAudio = new Map<string, Array<{ data: string; format: 'pcm16' }>>()

function sendEvent(ws: ServerWebSocket<VoiceWSData>, event: VoiceServerEvent): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(event))
  }
}

function getApiKey(): string {
  return process.env.DASHSCOPE_API_KEY || ''
}

async function flushPendingAudio(voiceSessionId: string, conn: ProviderConnection): Promise<void> {
  const queue = pendingAudio.get(voiceSessionId)
  if (!queue || queue.length === 0) return
  console.log(`[voice] flushing ${queue.length} queued audio chunks for ${voiceSessionId}`)
  for (const chunk of queue) {
    await conn.sendAudio(chunk).catch(() => {})
  }
  pendingAudio.delete(voiceSessionId)
}

export const handleVoiceWebSocket = {
  async open(ws: ServerWebSocket<VoiceWSData>): Promise<void> {
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

    const apiKey = getApiKey()
    if (!apiKey) {
      sendEvent(ws, {
        type: 'session.error',
        code: 'NO_API_KEY',
        message: 'DASHSCOPE_API_KEY not set',
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

    try {
      console.log(`[voice] connecting to Qwen for ${voiceSessionId}`)
      const conn = await qwenOmniRealtimeAdapter.connect({
        apiKey,
        model: 'qwen3.5-omni-plus-realtime',
        onEvent: (event) => {
          console.log(`[voice] Qwen event: ${event.type}`)
          if (event.type === 'session.state') {
            voiceSessionService.updateState(voiceSessionId, event.state)
            // Barge-in: user spoke while assistant was responding
            if (event.state === 'interrupted') {
              conn.interrupt().catch(() => {})
              console.log(`[voice] barge-in detected for ${voiceSessionId}`)
            }
          }
          sendEvent(ws, event)
        },
      })

      providerConns.set(voiceSessionId, conn)
      voiceSessionService.updateState(voiceSessionId, 'listening')
      sendEvent(ws, { type: 'session.state', state: 'listening' })
      console.log(`[voice] Qwen connected for ${voiceSessionId}`)

      // Flush any audio that arrived before provider was ready
      await flushPendingAudio(voiceSessionId, conn)
    } catch (err) {
      console.error(`[voice] Qwen connect failed: ${err instanceof Error ? err.message : String(err)}`)
      sendEvent(ws, {
        type: 'session.error',
        code: 'PROVIDER_CONNECT_FAILED',
        message: err instanceof Error ? err.message : 'Failed to connect to voice provider',
        recoverable: false,
      })
      ws.close()
    }
  },

  message(ws: ServerWebSocket<VoiceWSData>, raw: string | Buffer): void {
    const { voiceSessionId } = ws.data
    const rawStr = typeof raw === 'string' ? raw : raw.toString()
    let event: unknown
    try {
      event = JSON.parse(rawStr)
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
      console.log(`[voice] unknown event: ${(event as any)?.type ?? 'missing'}`)
      sendEvent(ws, {
        type: 'session.error',
        code: 'INVALID_EVENT',
        message: `Unknown event type: ${(event as Record<string, unknown>).type ?? 'missing'}`,
        recoverable: true,
      })
      return
    }

    const ev = event as VoiceClientEvent
    const conn = providerConns.get(voiceSessionId)

    switch (ev.type) {
      case 'audio.input.append': {
        if (!conn) {
          // Queue audio until provider is ready
          const queue = pendingAudio.get(voiceSessionId) ?? []
          queue.push({ data: ev.audio, format: ev.format })
          pendingAudio.set(voiceSessionId, queue)
          if (queue.length === 1) console.log(`[voice] queuing audio before provider ready for ${voiceSessionId}`)
          break
        }
        conn.sendAudio({ data: ev.audio, format: ev.format }).catch(err => {
          console.error(`[voice] sendAudio failed: ${err instanceof Error ? err.message : String(err)}`)
        })
        break
      }
      case 'audio.input.commit': {
        conn?.commitAudio().catch(() => {})
        break
      }
      case 'audio.input.clear': {
        conn?.clearAudio().catch(() => {})
        break
      }
      case 'assistant.interrupt': {
        conn?.interrupt().catch(() => {})
        voiceSessionService.updateState(voiceSessionId, 'interrupted')
        sendEvent(ws, { type: 'session.state', state: 'interrupted' })
        setTimeout(() => {
          voiceSessionService.updateState(voiceSessionId, 'listening')
          sendEvent(ws, { type: 'session.state', state: 'listening' })
        }, 200)
        break
      }
      case 'permission.approve':
      case 'permission.reject':
        break
      case 'session.close': {
        conn?.close().catch(() => {})
        providerConns.delete(voiceSessionId)
        pendingAudio.delete(voiceSessionId)
        voiceSessionService.closeSession(voiceSessionId)
        sendEvent(ws, { type: 'session.state', state: 'closed' })
        clientSockets.delete(voiceSessionId)
        ws.close()
        break
      }
      case 'session.start':
        break
    }
  },

  close(ws: ServerWebSocket<VoiceWSData>): void {
    const { voiceSessionId } = ws.data
    const conn = providerConns.get(voiceSessionId)
    conn?.close().catch(() => {})
    providerConns.delete(voiceSessionId)
    pendingAudio.delete(voiceSessionId)
    voiceSessionService.closeSession(voiceSessionId)
    clientSockets.delete(voiceSessionId)
  },

  drain(_ws: ServerWebSocket<VoiceWSData>): void {
    // no-op
  },
}
