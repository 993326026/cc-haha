import { sessionMcpService } from '../services/sessionMcpService.js'
import { conversationService } from '../services/conversationService.js'
import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import type { McpServerConfigForProcessTransport } from '../../entrypoints/agentSdkTypes.js'

/**
 * Session-level dynamic MCP server management API.
 *
 * Routes:
 *   POST   /api/sessions/:id/mcp-servers        — set/merge MCP servers
 *   GET    /api/sessions/:id/mcp-servers        — list current MCP servers
 *   DELETE /api/sessions/:id/mcp-servers/:name  — remove one MCP server
 */

type McpServersBody = {
  servers?: Record<string, unknown>
  applyNow?: boolean
  replace?: boolean
}

export async function handleSessionMcpApi(
  req: Request,
  url: URL,
  segments: string[],
): Promise<Response> {
  try {
    // segments: ['api', 'sessions', sessionId, 'mcp-servers', serverName?]
    const sessionId = segments[2]
    const serverName = segments[4] // only present for DELETE /.../mcp-servers/:name

    if (!sessionId) {
      throw ApiError.badRequest('sessionId is required')
    }

    switch (req.method) {
      case 'POST':
        return handlePost(req, sessionId)
      case 'GET':
        return handleGet(sessionId)
      case 'DELETE':
        return handleDelete(req, sessionId, serverName)
      default:
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 },
        )
    }
  } catch (error) {
    return errorResponse(error)
  }
}

async function handlePost(req: Request, sessionId: string): Promise<Response> {
  let body: McpServersBody
  try {
    body = (await req.json()) as McpServersBody
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (!body.servers || typeof body.servers !== 'object' || Object.keys(body.servers).length === 0) {
    throw ApiError.badRequest('servers must be a non-empty object')
  }

  // Validate each server has a valid type
  const validTypes = new Set(['stdio', 'sse', 'http', 'sdk'])
  for (const [name, config] of Object.entries(body.servers)) {
    if (typeof config !== 'object' || config === null) {
      throw ApiError.badRequest(`Server "${name}" configuration must be an object`)
    }
    const cfg = config as Record<string, unknown>
    if (typeof cfg.type !== 'string' || !validTypes.has(cfg.type)) {
      throw ApiError.badRequest(
        `Server "${name}" has invalid type "${String(cfg.type)}". Must be one of: ${[...validTypes].join(', ')}`,
      )
    }
    if (cfg.type === 'stdio' && typeof cfg.command !== 'string') {
      throw ApiError.badRequest(`Server "${name}" (stdio) requires a "command" string`)
    }
    if ((cfg.type === 'sse' || cfg.type === 'http') && typeof cfg.url !== 'string') {
      throw ApiError.badRequest(`Server "${name}" (${cfg.type}) requires a "url" string`)
    }
  }

  const servers = body.servers as Record<string, McpServerConfigForProcessTransport>
  const replace = body.replace === true

  sessionMcpService.setSessionMcpServers(sessionId, servers, replace)

  const serverNames = Object.keys(servers)
  console.log(`[session-mcp] POST ${sessionId}: saved ${serverNames.join(', ')} (replace=${replace}, applyNow=${body.applyNow ?? false})`)

  if (body.applyNow === true && conversationService.hasSession(sessionId)) {
    console.log(`[session-mcp] POST ${sessionId}: applyNow — CLI is running, sending mcp_set_servers`)
    await conversationService.applySessionMcpServers(sessionId)
  } else if (body.applyNow === true) {
    console.log(`[session-mcp] POST ${sessionId}: applyNow=true but CLI not running, config saved for later apply`)
  }

  const saved = sessionMcpService.getSessionMcpServers(sessionId)
  return Response.json({
    ok: true,
    servers: saved ?? {},
  })
}

async function handleGet(sessionId: string): Promise<Response> {
  const servers = sessionMcpService.getSessionMcpServers(sessionId)
  const names = Object.keys(servers ?? {})
  console.log(`[session-mcp] GET ${sessionId}: ${names.length > 0 ? names.join(', ') : '(empty)'}`)
  return Response.json({
    servers: servers ?? {},
  })
}

async function handleDelete(
  req: Request,
  sessionId: string,
  serverName: string | undefined,
): Promise<Response> {
  if (!serverName) {
    throw ApiError.badRequest('server name is required in path: /api/sessions/:id/mcp-servers/:name')
  }

  const removed = sessionMcpService.removeSessionMcpServer(sessionId, serverName)
  if (!removed) {
    throw ApiError.notFound(`MCP server "${serverName}" not found for session ${sessionId}`)
  }

  console.log(`[session-mcp] DELETE ${sessionId}: removed "${serverName}"`)

  // Re-apply remaining servers if session is active
  if (conversationService.hasSession(sessionId)) {
    console.log(`[session-mcp] DELETE ${sessionId}: CLI is running, re-applying remaining servers`)
    await conversationService.applySessionMcpServers(sessionId)
  }

  const remaining = sessionMcpService.getSessionMcpServers(sessionId)
  return Response.json({
    ok: true,
    servers: remaining ?? {},
  })
}
