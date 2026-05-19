import type { McpServerConfigForProcessTransport } from '../../entrypoints/agentSdkTypes.js'

/**
 * Per-session dynamic MCP configuration store.
 *
 * MVP: in-memory only. cc-haha restarts lose all state — fire
 * must re-inject MCP config on reconnect / panel open.
 */
class SessionMcpService {
  private store = new Map<string, Record<string, McpServerConfigForProcessTransport>>()

  setSessionMcpServers(
    sessionId: string,
    servers: Record<string, McpServerConfigForProcessTransport>,
    replace = false,
  ): void {
    if (replace) {
      this.store.set(sessionId, { ...servers })
    } else {
      const existing = this.store.get(sessionId) ?? {}
      this.store.set(sessionId, { ...existing, ...servers })
    }
  }

  getSessionMcpServers(
    sessionId: string,
  ): Record<string, McpServerConfigForProcessTransport> | undefined {
    return this.store.get(sessionId)
  }

  removeSessionMcpServer(sessionId: string, name: string): boolean {
    const servers = this.store.get(sessionId)
    if (!servers || !(name in servers)) return false
    delete servers[name]
    if (Object.keys(servers).length === 0) {
      this.store.delete(sessionId)
    }
    return true
  }

  clearSessionMcp(sessionId: string): void {
    this.store.delete(sessionId)
  }

  hasSessionMcpServers(sessionId: string): boolean {
    const servers = this.store.get(sessionId)
    return !!servers && Object.keys(servers).length > 0
  }
}

export const sessionMcpService = new SessionMcpService()
