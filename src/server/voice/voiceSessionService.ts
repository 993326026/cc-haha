import type { VoiceSessionState } from './protocol.js'

export type VoiceSession = {
  voiceSessionId: string
  agentSessionId: string | null
  providerId: string | null
  state: VoiceSessionState
  owner: string
  createdAt: number
}

// 合法状态转移
const VALID_TRANSITIONS: Record<VoiceSessionState, VoiceSessionState[]> = {
  connecting: ['listening', 'closed'],
  listening: ['thinking', 'interrupted', 'closed'],
  thinking: ['speaking', 'tool_running', 'interrupted', 'listening', 'closed'],
  speaking: ['listening', 'interrupted', 'closed'],
  tool_running: ['speaking', 'listening', 'interrupted', 'awaiting_permission', 'closed'],
  awaiting_permission: ['tool_running', 'listening', 'interrupted', 'closed'],
  interrupted: ['listening', 'closed'],
  closed: [],
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
    if (session.state === state) return true

    const allowed = VALID_TRANSITIONS[session.state]
    if (allowed && !allowed.includes(state)) {
      console.warn(
        `[voiceSession] invalid transition: ${session.state} → ${state} (session=${voiceSessionId})`,
      )
      return false
    }

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
