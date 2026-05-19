/**
 * Tests for SessionMcpService and session-mcp API
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { sessionMcpService } from '../services/sessionMcpService.js'

// We test the service directly since it has no external dependencies.
// The API handler depends on conversationService which requires a running
// Bun server — those are integration-tested via conversations.test.ts.

function makeStdioConfig(command = 'node', args: string[] = ['server.js']) {
  return {
    type: 'stdio' as const,
    command,
    args,
  }
}

describe('SessionMcpService', () => {
  const sid = crypto.randomUUID()

  beforeEach(() => {
    sessionMcpService.clearSessionMcp(sid)
  })

  // -------------------------------------------------------------------
  // set / get
  // -------------------------------------------------------------------
  it('should store and retrieve MCP servers', () => {
    const servers = { 'fire-mgmt': makeStdioConfig() }
    sessionMcpService.setSessionMcpServers(sid, servers)
    const result = sessionMcpService.getSessionMcpServers(sid)
    expect(result).toBeDefined()
    expect(result!['fire-mgmt']).toBeDefined()
    expect(result!['fire-mgmt'].command).toBe('node')
  })

  it('should return undefined for unknown session', () => {
    expect(sessionMcpService.getSessionMcpServers('nonexistent')).toBeUndefined()
  })

  // -------------------------------------------------------------------
  // merge vs replace
  // -------------------------------------------------------------------
  it('should merge servers when replace=false (default)', () => {
    sessionMcpService.setSessionMcpServers(sid, { a: makeStdioConfig('a') })
    sessionMcpService.setSessionMcpServers(sid, { b: makeStdioConfig('b') }, false)
    const result = sessionMcpService.getSessionMcpServers(sid)!
    expect(Object.keys(result)).toHaveLength(2)
    expect(result.a).toBeDefined()
    expect(result.b).toBeDefined()
  })

  it('should merge and overwrite existing server with same name', () => {
    sessionMcpService.setSessionMcpServers(sid, { x: makeStdioConfig('old') })
    sessionMcpService.setSessionMcpServers(sid, { x: makeStdioConfig('new') })
    const result = sessionMcpService.getSessionMcpServers(sid)!
    expect(result.x.command).toBe('new')
  })

  it('should replace all servers when replace=true', () => {
    sessionMcpService.setSessionMcpServers(sid, { a: makeStdioConfig('a'), b: makeStdioConfig('b') })
    sessionMcpService.setSessionMcpServers(sid, { c: makeStdioConfig('c') }, true)
    const result = sessionMcpService.getSessionMcpServers(sid)!
    expect(Object.keys(result)).toHaveLength(1)
    expect(result.c).toBeDefined()
    expect(result.a).toBeUndefined()
  })

  // -------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------
  it('should remove a single server by name', () => {
    sessionMcpService.setSessionMcpServers(sid, { a: makeStdioConfig('a'), b: makeStdioConfig('b') })
    const removed = sessionMcpService.removeSessionMcpServer(sid, 'a')
    expect(removed).toBe(true)
    const result = sessionMcpService.getSessionMcpServers(sid)!
    expect(Object.keys(result)).toHaveLength(1)
    expect(result.b).toBeDefined()
  })

  it('should return false when removing unknown server', () => {
    sessionMcpService.setSessionMcpServers(sid, { a: makeStdioConfig('a') })
    expect(sessionMcpService.removeSessionMcpServer(sid, 'nonexistent')).toBe(false)
  })

  it('should remove entire session entry when last server is removed', () => {
    sessionMcpService.setSessionMcpServers(sid, { only: makeStdioConfig('only') })
    sessionMcpService.removeSessionMcpServer(sid, 'only')
    expect(sessionMcpService.getSessionMcpServers(sid)).toBeUndefined()
  })

  // -------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------
  it('should clear all servers for a session', () => {
    sessionMcpService.setSessionMcpServers(sid, { a: makeStdioConfig('a'), b: makeStdioConfig('b') })
    sessionMcpService.clearSessionMcp(sid)
    expect(sessionMcpService.getSessionMcpServers(sid)).toBeUndefined()
  })

  // -------------------------------------------------------------------
  // hasSessionMcpServers
  // -------------------------------------------------------------------
  it('should report whether session has MCP servers', () => {
    expect(sessionMcpService.hasSessionMcpServers(sid)).toBe(false)
    sessionMcpService.setSessionMcpServers(sid, { x: makeStdioConfig('x') })
    expect(sessionMcpService.hasSessionMcpServers(sid)).toBe(true)
    sessionMcpService.clearSessionMcp(sid)
    expect(sessionMcpService.hasSessionMcpServers(sid)).toBe(false)
  })
})
