import { describe, it, expect, beforeEach } from 'bun:test'
import { voiceAgentBridge } from '../../services/voiceAgentBridge.js'
import { voiceSessionService } from '../../voice/voiceSessionService.js'
import { sessionMcpService } from '../../services/sessionMcpService.js'

describe('voiceAgentBridge', () => {
  const vid = crypto.randomUUID()
  const aid = crypto.randomUUID()

  beforeEach(() => {
    voiceSessionService._clear()
    voiceAgentBridge.cleanup(vid)
    sessionMcpService.clearSessionMcp(aid)
  })

  it('binds a voice session to an agent session', () => {
    voiceSessionService.createSession({ voiceSessionId: vid })
    voiceAgentBridge.bindSession(vid, aid)

    expect(voiceAgentBridge.getAgentSessionId(vid)).toBe(aid)
  })

  it('injects context into voice session', () => {
    voiceSessionService.createSession({ voiceSessionId: vid })
    voiceAgentBridge.bindSession(vid, aid, {
      pageContext: '材料库管理页面',
      userId: 'user-1',
    })

    const instructions = voiceAgentBridge.buildInstructions(vid)
    expect(instructions).toContain('材料库管理页面')
  })

  it('builds instructions with MCP tools', () => {
    // Set up agent session with MCP servers
    sessionMcpService.setSessionMcpServers(aid, {
      'fire-mgmt': { type: 'stdio', command: 'node', args: ['server.js'] },
    })

    voiceSessionService.createSession({ voiceSessionId: vid })
    voiceAgentBridge.bindSession(vid, aid)

    const instructions = voiceAgentBridge.buildInstructions(vid)
    expect(instructions).toContain('工具')
  })

  it('returns session tools from MCP config', () => {
    sessionMcpService.setSessionMcpServers(aid, {
      'fire-mgmt': { type: 'stdio', command: 'node', args: ['server.js'] },
      'github': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
    })

    voiceSessionService.createSession({ voiceSessionId: vid })
    voiceAgentBridge.bindSession(vid, aid)

    const tools = voiceAgentBridge.getSessionTools(vid)
    expect(tools.length).toBeGreaterThan(0)

    const config = voiceAgentBridge.getVoiceSessionConfig(vid)
    expect(config.tools.length).toBeGreaterThan(0)
    expect(config.instructions).toBeDefined()
  })

  it('returns null agent session for unbound voice session', () => {
    voiceSessionService.createSession({ voiceSessionId: vid })
    expect(voiceAgentBridge.getAgentSessionId(vid)).toBeNull()
  })

  it('cleans up context on cleanup', () => {
    voiceSessionService.createSession({ voiceSessionId: vid })
    voiceAgentBridge.bindSession(vid, aid, { pageContext: 'test' })

    const instructions = voiceAgentBridge.buildInstructions(vid)
    expect(instructions).toContain('test')

    voiceAgentBridge.cleanup(vid)
    const afterCleanup = voiceAgentBridge.buildInstructions(vid)
    expect(afterCleanup).not.toContain('test')
  })

  it('reuses session-level MCP configuration', () => {
    sessionMcpService.setSessionMcpServers(aid, {
      'work-tools': { type: 'stdio', command: 'node', args: ['worker.js'] },
    })

    voiceSessionService.createSession({ voiceSessionId: vid })
    voiceAgentBridge.bindSession(vid, aid)

    const tools = voiceAgentBridge.getSessionTools(vid)
    expect(tools.length).toBeGreaterThan(0)

    // Verify config is reusable
    const config1 = voiceAgentBridge.getVoiceSessionConfig(vid)
    const config2 = voiceAgentBridge.getVoiceSessionConfig(vid)
    expect(config1.tools.length).toBe(config2.tools.length)
  })
})
