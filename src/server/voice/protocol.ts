/**
 * Realtime Voice Runtime — 统一事件协议
 *
 * 客户端与 server 之间使用 cc-haha 自有协议，不直接依赖任何 provider 原生格式。
 */

// ---- 音频格式 ----

export type AudioFormat = 'pcm16'

// ---- 会话状态 ----

export type VoiceSessionState =
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'tool_running'
  | 'awaiting_permission'
  | 'interrupted'
  | 'closed'

// ---- Client → Server ----

export type VoiceClientEvent =
  | { type: 'session.start'; sessionId?: string; provider?: string; voice?: string }
  | { type: 'audio.input.append'; audio: string; format: AudioFormat }
  | { type: 'audio.input.commit' }
  | { type: 'audio.input.clear' }
  | { type: 'assistant.interrupt' }
  | { type: 'permission.approve'; requestId: string; input?: unknown }
  | { type: 'permission.reject'; requestId: string; reason?: string }
  | { type: 'session.close' }

// ---- Server → Client ----

export type VoiceServerEvent =
  | { type: 'session.started'; voiceSessionId: string; agentSessionId: string }
  | { type: 'session.state'; state: VoiceSessionState }
  | { type: 'transcript.delta'; text: string; speaker: 'user' | 'assistant' }
  | { type: 'transcript.final'; text: string; speaker: 'user' | 'assistant' }
  | { type: 'assistant.audio.chunk'; audio: string; format: AudioFormat }
  | { type: 'assistant.audio.stop' }
  | { type: 'assistant.text.delta'; text: string }
  | { type: 'tool.call.started'; callId: string; name: string; summary?: string }
  | { type: 'tool.call.completed'; callId: string; resultSummary?: string }
  | { type: 'permission.request'; requestId: string; toolName: string; reason: string; input: unknown }
  | { type: 'permission.resolved'; requestId: string; approved: boolean }
  | { type: 'session.error'; code: string; message: string; recoverable: boolean }

// ---- 校验 ----

const CLIENT_EVENT_TYPES = new Set<string>([
  'session.start',
  'audio.input.append',
  'audio.input.commit',
  'audio.input.clear',
  'assistant.interrupt',
  'permission.approve',
  'permission.reject',
  'session.close',
])

const SERVER_EVENT_TYPES = new Set<string>([
  'session.started',
  'session.state',
  'transcript.delta',
  'transcript.final',
  'assistant.audio.chunk',
  'assistant.audio.stop',
  'assistant.text.delta',
  'tool.call.started',
  'tool.call.completed',
  'permission.request',
  'permission.resolved',
  'session.error',
])

export function isVoiceClientEvent(value: unknown): value is VoiceClientEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string' &&
    CLIENT_EVENT_TYPES.has((value as Record<string, string>).type)
  )
}

export function isVoiceServerEvent(value: unknown): value is VoiceServerEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string' &&
    SERVER_EVENT_TYPES.has((value as Record<string, string>).type)
  )
}
