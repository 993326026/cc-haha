import { describe, it, expect, beforeEach } from 'bun:test'
import { voiceSessionService } from '../../voice/voiceSessionService.js'
import { isVoiceServerEvent } from '../../voice/protocol.js'

describe('voice gateway', () => {
  beforeEach(() => {
    voiceSessionService._clear()
  })

  it('POST /api/voice/sessions creates a new voice session', async () => {
    // Simulate the API handler behavior
    const session = voiceSessionService.createSession({ providerId: 'qwen' })
    expect(session.voiceSessionId).toBeDefined()
    expect(session.providerId).toBe('qwen')
    expect(session.state).toBe('connecting')
  })

  it('voice session data is valid', () => {
    const session = voiceSessionService.createSession({
      providerId: 'qwen',
      agentSessionId: 'agent-1',
    })

    const fetched = voiceSessionService.getSession(session.voiceSessionId)
    expect(fetched).toBeDefined()
    expect(fetched!.agentSessionId).toBe('agent-1')
    expect(fetched!.providerId).toBe('qwen')
  })

  it('server events pass protocol validation', () => {
    const events = [
      { type: 'session.started', voiceSessionId: 'vs-1', agentSessionId: 'as-1' },
      { type: 'session.state', state: 'listening' },
      { type: 'transcript.delta', text: 'hello', speaker: 'assistant' },
      { type: 'assistant.audio.chunk', audio: 'x', format: 'pcm16' },
      { type: 'session.error', code: 'ERR', message: 'msg', recoverable: true },
    ] as const

    for (const ev of events) {
      expect(isVoiceServerEvent(ev)).toBe(true)
    }
  })

  it('voice session state transitions are consistent', () => {
    const session = voiceSessionService.createSession({})

    const validTransitions: string[] = ['listening', 'thinking', 'speaking', 'interrupted', 'closed']
    for (const state of validTransitions) {
      expect(voiceSessionService.updateState(session.voiceSessionId, state as any)).toBe(true)
      expect(session.state).toBe(state)
    }
  })
})
