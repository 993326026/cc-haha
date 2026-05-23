/**
 * Qwen-Omni-Realtime Adapter
 *
 * WebSocket 连接到阿里云百炼 Realtime API。
 * 协议兼容 OpenAI Realtime 事件规范。
 *
 * 文档: https://help.aliyun.com/zh/model-studio/realtime
 */

import type {
  RealtimeVoiceProviderAdapter,
  VoiceProviderCapabilities,
  ProviderConnectOptions,
  ProviderConnection,
  AudioChunk,
  VoiceToolResult,
  ProviderSessionUpdate,
} from './types.js'
import type { VoiceServerEvent } from '../protocol.js'

const WS_BASE_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'

const CAPABILITIES: VoiceProviderCapabilities = {
  audioInput: true,
  audioOutput: true,
  transcription: true,
  serverVad: true,
  semanticVad: true,
  bargeIn: true,
  toolCalling: true,
  textOutput: true,
  voiceSelection: true,
}

// ---- Event mapping: Qwen Realtime → VoiceServerEvent ----

function mapQwenEvent(qwenType: string, data: Record<string, unknown>, callId?: string): VoiceServerEvent | null {
  switch (qwenType) {
    case 'session.created':
    case 'session.updated':
      return { type: 'session.state', state: 'listening' }

    case 'input_audio_buffer.speech_started':
      // User started speaking — could be barge-in
      return { type: 'session.state', state: 'interrupted' }

    case 'input_audio_buffer.speech_stopped':
      // User finished speaking
      return { type: 'session.state', state: 'thinking' }

    case 'response.created':
      return { type: 'session.state', state: 'thinking' }

    case 'response.text.delta': {
      const text = typeof data.delta === 'string' ? data.delta : ''
      return { type: 'transcript.delta', text, speaker: 'assistant' }
    }

    case 'response.text.done': {
      const text = typeof data.text === 'string' ? data.text : ''
      return { type: 'transcript.final', text, speaker: 'assistant' }
    }

    case 'response.audio_transcript.delta': {
      const text = typeof data.delta === 'string' ? data.delta : ''
      if (text) process.stderr.write(text)
      return { type: 'transcript.delta', text, speaker: 'assistant' }
    }

    case 'response.audio_transcript.done': {
      const text = typeof data.transcript === 'string' ? data.transcript : ''
      process.stderr.write('\n[Qwen] ' + text + '\n')
      return { type: 'transcript.final', text, speaker: 'assistant' }
    }

    case 'response.audio.delta': {
      const audio = typeof data.delta === 'string' ? data.delta : ''
      return { type: 'assistant.audio.chunk', audio, format: 'pcm16' }
    }

    case 'response.audio.done':
      return { type: 'assistant.audio.stop' }

    case 'response.function_call': {
      const fc = data as Record<string, unknown>
      const name = typeof fc.name === 'string' ? fc.name : 'unknown'
      const cid = typeof fc.call_id === 'string' ? fc.call_id : (callId ?? crypto.randomUUID())
      return { type: 'tool.call.started', callId: cid, name }
    }

    case 'response.done':
      return { type: 'session.state', state: 'listening' }

    case 'error': {
      const code = typeof data.code === 'string' ? data.code : 'ERROR'
      const message = typeof data.message === 'string' ? data.message : 'Unknown error'
      return { type: 'session.error', code, message, recoverable: code !== 'AUTH_FAILED' }
    }

    default:
      return null
  }
}

// ---- Adapter implementation ----

let firstAudio = true

function createQwenConnection(options: ProviderConnectOptions): ProviderConnection {
  firstAudio = true
  const { apiKey, model, voice, instructions, tools, onEvent, baseUrl } = options
  const endpoint = baseUrl ?? WS_BASE_URL
  const wsUrl = `${endpoint}?model=${encodeURIComponent(model)}`
  let ws: WebSocket | null = null
  let closed = false

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })

      socket.addEventListener('open', () => {
        ws = socket
        sendSessionUpdate()
        resolve(socket)
      })

      socket.addEventListener('message', (msg) => {
        if (closed) return
        try {
          const data = JSON.parse(typeof msg.data === 'string' ? msg.data : '')
          const qwenType: string = data.type ?? ''
          // Log raw event type for debugging barge-in
          if (qwenType !== 'response.audio_transcript.delta' && qwenType !== 'response.audio.delta') {
            console.error(`[qwen] ${qwenType}`)
          }
          if (qwenType === 'error' || qwenType === 'session.error') {
            console.error(`[qwen-adapter] RAW QWEN ERROR: ${typeof msg.data === 'string' ? msg.data : 'binary'}`)
          }
          const event = mapQwenEvent(qwenType, data)
          if (event) {
            onEvent(event)
          }
        } catch {
          // skip parse errors
        }
      })

      socket.addEventListener('error', (err) => {
        if (!closed) {
          onEvent({
            type: 'session.error',
            code: 'CONNECTION_ERROR',
            message: err instanceof Error ? err.message : 'WebSocket error',
            recoverable: true,
          })
        }
        if (!ws) reject(err instanceof Error ? err : new Error('WebSocket connection failed'))
      })

      socket.addEventListener('close', () => {
        ws = null
        if (!closed) {
          closed = true
          onEvent({
            type: 'session.error',
            code: 'CONNECTION_CLOSED',
            message: 'Provider connection closed',
            recoverable: true,
          })
        }
      })
    })
  }

  function sendSessionUpdate() {
    if (!ws || ws.readyState !== 1) return
    ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        voice: 'Tina',
        input_audio_format: 'pcm',
        output_audio_format: 'pcm',
        instructions: instructions ?? '你是AI语音助手，请用自然口语简短回复。',
        turn_detection: { type: 'semantic_vad', threshold: 0.5, silence_duration_ms: 800, create_response: true, interrupt_response: true },
        tools: (tools ?? []).map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        tool_choice: tools && tools.length > 0 ? 'auto' : 'none',
      },
    }))
  }

  // Kick off connection
  const connectionPromise = connect()

  return {
    async sendAudio(chunk: AudioChunk): Promise<void> {
      const s = await connectionPromise
      if (s.readyState === 1) {
        const size = chunk.data.length
        if (firstAudio) { console.error(`[qwen-adapter] first audio chunk: ${size} base64 chars`); firstAudio = false }
        s.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: chunk.data,
        }))
      } else {
        console.error(`[qwen-adapter] WS not ready, state=${s.readyState}`)
      }
    },

    async commitAudio(): Promise<void> {
      const s = await connectionPromise
      if (s.readyState === 1) {
        s.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
        s.send(JSON.stringify({ type: 'response.create' }))
      }
    },

    async clearAudio(): Promise<void> {
      const s = await connectionPromise
      if (s.readyState === 1) {
        s.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
      }
    },

    async interrupt(): Promise<void> {
      const s = ws
      if (s && s.readyState === 1) {
        s.send(JSON.stringify({ type: 'response.cancel' }))
      }
    },

    async sendToolResult(result: VoiceToolResult): Promise<void> {
      const s = ws
      if (s && s.readyState === 1) {
        s.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: result.callId,
            output: result.output,
          },
        }))
        s.send(JSON.stringify({ type: 'response.create' }))
      }
    },

    async updateSession(update: ProviderSessionUpdate): Promise<void> {
      const s = ws
      if (s && s.readyState === 1) {
        const sessionUpdate: Record<string, unknown> = {}
        if (update.voice) sessionUpdate.voice = update.voice
        if (update.instructions) sessionUpdate.instructions = update.instructions
        if (update.tools) {
          sessionUpdate.tools = update.tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          }))
        }
        s.send(JSON.stringify({ type: 'session.update', session: sessionUpdate }))
      }
    },

    async close(): Promise<void> {
      closed = true
      const s = ws
      if (s && s.readyState === 1) {
        s.close()
      }
    },
  }
}

export const qwenOmniRealtimeAdapter: RealtimeVoiceProviderAdapter = {
  name: 'qwen_omni_realtime',
  capabilities: CAPABILITIES,
  connect: createQwenConnection,
}
