import type { VoiceSessionState } from './protocol.js'

export type VoiceSession = {
  voiceSessionId: string
  agentSessionId: string | null
  providerId: string | null
  state: VoiceSessionState
  owner: string
  createdAt: number
}

class VoiceSessionService {
  private sessions = new Map<string, VoiceSession>()

  createSession(options: {
    voiceSessionId?: string
    providerId?: string
    agentSessionId?: string | null
    owner?: string
  }): VoiceSession {
    const voiceSessionId = options.voiceSessionId ?? crypto.randomUUID()
    const session: VoiceSession = {
      voiceSessionId,
      agentSessionId: options.agentSessionId ?? null,
      providerId: options.providerId ?? 'qwen',
      state: 'connecting',
      owner: options.owner ?? 'anonymous',
      createdAt: Date.now(),
    }
    this.sessions.set(voiceSessionId, session)
    return session
  }

  getSession(voiceSessionId: string): VoiceSession | undefined {
    return this.sessions.get(voiceSessionId)
  }

  updateState(voiceSessionId: string, state: VoiceSessionState): boolean {
    const session = this.sessions.get(voiceSessionId)
    if (!session) return false
    session.state = state
    return true
  }

  bindAgentSession(voiceSessionId: string, agentSessionId: string): boolean {
    const session = this.sessions.get(voiceSessionId)
    if (!session) return false
    session.agentSessionId = agentSessionId
    return true
  }

  closeSession(voiceSessionId: string): boolean {
    const session = this.sessions.get(voiceSessionId)
    if (!session) return false
    session.state = 'closed'
    this.sessions.delete(voiceSessionId)
    return true
  }

  /** For testing only */
  _clear(): void {
    this.sessions.clear()
  }
}

export const voiceSessionService = new VoiceSessionService()
