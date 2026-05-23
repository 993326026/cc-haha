import { describe, it, expect, beforeEach } from 'bun:test'
import { voiceSessionService } from '../../voice/voiceSessionService.js'

describe('voice interrupt flow', () => {
  const vid = crypto.randomUUID()

  beforeEach(() => {
    voiceSessionService._clear()
  })

  it('moves state from speaking to interrupted to listening', () => {
    const s = voiceSessionService.createSession({ voiceSessionId: vid })

    // Follow valid transition chain: connecting → listening → thinking → speaking
    expect(voiceSessionService.updateState(vid, 'listening')).toBe(true)
    expect(s.state).toBe('listening')

    expect(voiceSessionService.updateState(vid, 'thinking')).toBe(true)
    expect(s.state).toBe('thinking')

    expect(voiceSessionService.updateState(vid, 'speaking')).toBe(true)
    expect(s.state).toBe('speaking')

    // Interrupt!
    expect(voiceSessionService.updateState(vid, 'interrupted')).toBe(true)
    expect(s.state).toBe('interrupted')

    // Back to listening
    expect(voiceSessionService.updateState(vid, 'listening')).toBe(true)
    expect(s.state).toBe('listening')
  })

  it('allows interrupt from thinking state', () => {
    const s = voiceSessionService.createSession({ voiceSessionId: vid })

    voiceSessionService.updateState(vid, 'listening')
    voiceSessionService.updateState(vid, 'thinking')

    expect(voiceSessionService.updateState(vid, 'interrupted')).toBe(true)
    expect(s.state).toBe('interrupted')
  })

  it('allows interrupt from tool_running state', () => {
    const s = voiceSessionService.createSession({ voiceSessionId: vid })

    voiceSessionService.updateState(vid, 'listening')
    voiceSessionService.updateState(vid, 'thinking')
    voiceSessionService.updateState(vid, 'tool_running')

    expect(voiceSessionService.updateState(vid, 'interrupted')).toBe(true)
    expect(s.state).toBe('interrupted')
  })

  it('rejects invalid transitions like connecting → speaking', () => {
    const s = voiceSessionService.createSession({ voiceSessionId: vid })

    expect(voiceSessionService.updateState(vid, 'speaking')).toBe(false)
    expect(s.state).toBe('connecting')
  })

  it('rejects closed → listening', () => {
    const s = voiceSessionService.createSession({ voiceSessionId: vid })

    voiceSessionService.updateState(vid, 'listening')
    voiceSessionService.updateState(vid, 'closed')
    expect(s.state).toBe('closed')

    // closed has no outgoing transitions
    expect(voiceSessionService.updateState(vid, 'listening')).toBe(false)
  })
})
