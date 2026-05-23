import { describe, it, expect, beforeEach } from 'bun:test'
import { voiceSessionService } from '../../voice/voiceSessionService.js'

describe('voiceSessionService', () => {
  beforeEach(() => {
    voiceSessionService._clear()
  })

  it('creates a voice session', () => {
    const s = voiceSessionService.createSession({ providerId: 'qwen', owner: 'user-1' })
    expect(s.voiceSessionId).toBeDefined()
    expect(s.providerId).toBe('qwen')
    expect(s.state).toBe('connecting')
    expect(s.owner).toBe('user-1')
  })

  it('tracks provider, state, and owner', () => {
    const s = voiceSessionService.createSession({
      providerId: 'openai',
      owner: 'user-2',
    })
    const fetched = voiceSessionService.getSession(s.voiceSessionId)
    expect(fetched).toBeDefined()
    expect(fetched!.providerId).toBe('openai')
    expect(fetched!.owner).toBe('user-2')
  })

  it('creates a voice session bound to an agent session', () => {
    const s = voiceSessionService.createSession({
      agentSessionId: 'agent-123',
    })
    expect(s.agentSessionId).toBe('agent-123')
  })

  it('binds to an agent session after creation', () => {
    const s = voiceSessionService.createSession({})
    expect(s.agentSessionId).toBeNull()

    const ok = voiceSessionService.bindAgentSession(s.voiceSessionId, 'agent-456')
    expect(ok).toBe(true)
    expect(s.agentSessionId).toBe('agent-456')
  })

  it('returns undefined for unknown session', () => {
    expect(voiceSessionService.getSession('nonexistent')).toBeUndefined()
  })

  it('binds agent session returns false for unknown', () => {
    expect(voiceSessionService.bindAgentSession('nonexistent', 'x')).toBe(false)
  })

  it('updates state', () => {
    const s = voiceSessionService.createSession({})
    expect(voiceSessionService.updateState(s.voiceSessionId, 'listening')).toBe(true)
    expect(s.state).toBe('listening')
  })

  it('updateState returns false for unknown', () => {
    expect(voiceSessionService.updateState('nonexistent', 'speaking')).toBe(false)
  })

  it('cleans up sessions on close', () => {
    const s = voiceSessionService.createSession({})
    voiceSessionService.closeSession(s.voiceSessionId)
    expect(s.state).toBe('closed')
    expect(voiceSessionService.getSession(s.voiceSessionId)).toBeUndefined()
  })

  it('close returns false for unknown session', () => {
    expect(voiceSessionService.closeSession('nonexistent')).toBe(false)
  })
})
