import { describe, it, expect } from 'bun:test'
import {
  isVoiceClientEvent,
  isVoiceServerEvent,
  type VoiceClientEvent,
  type VoiceServerEvent,
} from '../../voice/protocol.js'

describe('voice protocol', () => {
  // ---- Client events ----

  it('accepts valid client event: session.start', () => {
    const ev: VoiceClientEvent = { type: 'session.start' }
    expect(isVoiceClientEvent(ev)).toBe(true)
  })

  it('accepts valid client event: audio.input.append', () => {
    const ev: VoiceClientEvent = {
      type: 'audio.input.append',
      audio: 'base64...',
      format: 'pcm16',
    }
    expect(isVoiceClientEvent(ev)).toBe(true)
  })

  it('accepts valid client event: assistant.interrupt', () => {
    const ev: VoiceClientEvent = { type: 'assistant.interrupt' }
    expect(isVoiceClientEvent(ev)).toBe(true)
  })

  it('accepts valid client event: permission.approve', () => {
    const ev: VoiceClientEvent = {
      type: 'permission.approve',
      requestId: 'req-1',
    }
    expect(isVoiceClientEvent(ev)).toBe(true)
  })

  it('accepts valid client event: permission.reject', () => {
    const ev: VoiceClientEvent = {
      type: 'permission.reject',
      requestId: 'req-1',
      reason: 'not allowed',
    }
    expect(isVoiceClientEvent(ev)).toBe(true)
  })

  it('rejects unknown event type', () => {
    expect(isVoiceClientEvent({ type: 'unknown.event' })).toBe(false)
  })

  it('rejects non-object', () => {
    expect(isVoiceClientEvent('hello')).toBe(false)
    expect(isVoiceClientEvent(null)).toBe(false)
    expect(isVoiceClientEvent(42)).toBe(false)
  })

  it('rejects object without type', () => {
    expect(isVoiceClientEvent({ data: 'x' })).toBe(false)
  })

  // ---- Server events ----

  it('accepts valid server event: session.started', () => {
    const ev: VoiceServerEvent = {
      type: 'session.started',
      voiceSessionId: 'vs-1',
      agentSessionId: 'as-1',
    }
    expect(isVoiceServerEvent(ev)).toBe(true)
  })

  it('accepts valid server event: transcript.delta', () => {
    const ev: VoiceServerEvent = {
      type: 'transcript.delta',
      text: '你好',
      speaker: 'user',
    }
    expect(isVoiceServerEvent(ev)).toBe(true)
  })

  it('accepts valid server event: assistant.audio.chunk', () => {
    const ev: VoiceServerEvent = {
      type: 'assistant.audio.chunk',
      audio: 'base64...',
      format: 'pcm16',
    }
    expect(isVoiceServerEvent(ev)).toBe(true)
  })

  it('accepts valid server event: tool.call.started', () => {
    const ev: VoiceServerEvent = {
      type: 'tool.call.started',
      callId: 'call-1',
      name: 'search',
    }
    expect(isVoiceServerEvent(ev)).toBe(true)
  })

  it('accepts valid server event: permission.request', () => {
    const ev: VoiceServerEvent = {
      type: 'permission.request',
      requestId: 'req-1',
      toolName: 'write_file',
      reason: 'File modification',
      input: { path: '/tmp/test' },
    }
    expect(isVoiceServerEvent(ev)).toBe(true)
  })

  it('accepts valid server event: session.error', () => {
    const ev: VoiceServerEvent = {
      type: 'session.error',
      code: 'AUTH_FAILED',
      message: 'Invalid token',
      recoverable: false,
    }
    expect(isVoiceServerEvent(ev)).toBe(true)
  })

  it('rejects unknown server event type', () => {
    expect(isVoiceServerEvent({ type: 'unknown.server.event' })).toBe(false)
  })

  it('rejects client event as server event', () => {
    const ev: VoiceClientEvent = { type: 'assistant.interrupt' }
    expect(isVoiceServerEvent(ev)).toBe(false)
  })

  it('rejects server event as client event', () => {
    const ev: VoiceServerEvent = {
      type: 'transcript.delta',
      text: 'hello',
      speaker: 'assistant',
    }
    expect(isVoiceClientEvent(ev)).toBe(false)
  })
})
