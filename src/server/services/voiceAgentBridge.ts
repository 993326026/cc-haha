/**
 * Voice Agent Bridge
 *
 * 连接 voice runtime 与现有 cc-haha agent/tool/MCP/permission 体系。
 * 首版按 Mode A (Embedded Reasoner): provider 负责推理，bridge 负责工具桥接。
 *
 * 职责:
 * - voice session → agent session 绑定
 * - 上下文注入 (MCP tools, business context)
 * - provider tool call → cc-haha tool execution
 * - 权限协调 (复用 can_use_tool 自动批准)
 */

import { voiceSessionService } from '../voice/voiceSessionService.js'
import { conversationService } from './conversationService.js'
import { sessionMcpService } from './sessionMcpService.js'
import type { VoiceServerEvent } from '../voice/protocol.js'

export type VoiceBridgeContext = {
  userId?: string
  tenantId?: string
  pageContext?: string
  allowedTools?: string[]
}

class VoiceAgentBridge {
  private contexts = new Map<string, VoiceBridgeContext>()

  /**
   * 绑定 voice session 到 agent session，注入上下文。
   */
  bindSession(voiceSessionId: string, agentSessionId: string, ctx?: VoiceBridgeContext): void {
    voiceSessionService.bindAgentSession(voiceSessionId, agentSessionId)
    if (ctx) {
      this.contexts.set(voiceSessionId, ctx)
    }
  }

  /**
   * 获取 voice session 的 agent session ID。
   */
  getAgentSessionId(voiceSessionId: string): string | null {
    const session = voiceSessionService.getSession(voiceSessionId)
    return session?.agentSessionId ?? null
  }

  /**
   * 构建注入到 voice provider 的 system instructions。
   */
  buildInstructions(voiceSessionId: string): string {
    const ctx = this.contexts.get(voiceSessionId)
    const session = voiceSessionService.getSession(voiceSessionId)

    let instructions = '你是一个智能语音助手。请用自然口语交流。'

    if (ctx?.pageContext) {
      instructions += `\n当前页面: ${ctx.pageContext}`
    }

    if (session?.agentSessionId) {
      const servers = sessionMcpService.getSessionMcpServers(session.agentSessionId)
      if (servers && Object.keys(servers).length > 0) {
        instructions += '\n你有可用的工具来查询数据，请根据用户问题调用合适的工具。'
      }
    }

    return instructions
  }

  /**
   * 从绑定的 agent session 获取 MCP tools 列表。
   * 用于注入到 voice provider session 的 tools 配置。
   */
  getSessionTools(voiceSessionId: string): Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }> {
    const session = voiceSessionService.getSession(voiceSessionId)
    if (!session?.agentSessionId) return []

    const servers = sessionMcpService.getSessionMcpServers(session.agentSessionId)
    if (!servers) return []

    // Return tool stubs — full schema would come from the CLI's tools/list.
    // In the MVP, the voice provider gets tool names from context,
    // and actual execution happens through the CLI.
    const tools: Array<{
      name: string
      description: string
      parameters: Record<string, unknown>
    }> = []

    for (const [serverName] of Object.entries(servers)) {
      tools.push({
        name: `mcp__${serverName}__*`,
        description: `Tools from ${serverName} MCP server. The specific tool name will be determined by the user's question.`,
        parameters: { type: 'object', properties: {} },
      })
    }

    return tools
  }

  /**
   * 处理 voice provider 发来的工具调用。
   *
   * MVP: 通过 agent session 的 CLI 执行工具。
   * 工具结果会回传给 voice provider。
   */
  async executeTool(
    voiceSessionId: string,
    toolName: string,
    args: Record<string, unknown>,
    callId: string,
  ): Promise<string> {
    const session = voiceSessionService.getSession(voiceSessionId)
    if (!session?.agentSessionId) {
      return JSON.stringify({ error: 'No agent session bound to voice session' })
    }

    if (!conversationService.hasSession(session.agentSessionId)) {
      return JSON.stringify({ error: 'Agent session is not running' })
    }

    // Use requestControl to send a tool execution request to the CLI.
    // The CLI handles the actual MCP tool call.
    const result = await conversationService.requestControl(
      session.agentSessionId,
      {
        subtype: 'execute_tool',
        tool_name: toolName,
        arguments: args,
        call_id: callId,
      },
      30_000,
    )

    return typeof result.output === 'string' ? result.output : JSON.stringify(result)
  }

  /**
   * 构建 voice session 的 provider 连接指令。
   * 包含可用的工具描述和权限策略。
   */
  getVoiceSessionConfig(voiceSessionId: string): {
    instructions: string
    tools: Array<{
      type: 'function'
      name: string
      description: string
      parameters: Record<string, unknown>
    }>
  } {
    return {
      instructions: this.buildInstructions(voiceSessionId),
      tools: this.getSessionTools(voiceSessionId).map((t) => ({
        type: 'function' as const,
        ...t,
      })),
    }
  }

  /**
   * 清理 voice session 的桥接状态。
   */
  cleanup(voiceSessionId: string): void {
    this.contexts.delete(voiceSessionId)
  }
}

export const voiceAgentBridge = new VoiceAgentBridge()
