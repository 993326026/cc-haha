/**
 * Voice Permission Service
 *
 * 语音场景的工具权限确认策略。
 * 复用现有 can_use_tool 自动批准逻辑,同时增加语音特有的审计。
 */

import { conversationService } from './conversationService.js'
import { sessionMcpService } from './sessionMcpService.js'
import type { VoiceServerEvent } from '../voice/protocol.js'

export type VoiceToolPolicy = {
  autoApproveReadOnly: boolean
  requireConfirmationForWrite: boolean
  allowedToolPrefixes: string[]
  deniedToolPrefixes: string[]
}

const DEFAULT_POLICY: VoiceToolPolicy = {
  autoApproveReadOnly: true,
  requireConfirmationForWrite: true,
  allowedToolPrefixes: ['mcp__fire-mgmt__'],
  deniedToolPrefixes: [],
}

class VoicePermissionService {
  private policies = new Map<string, VoiceToolPolicy>()
  private pendingRequests = new Map<string, {
    voiceSessionId: string
    toolName: string
    resolve: (approved: boolean) => void
  }>()

  setPolicy(voiceSessionId: string, policy: Partial<VoiceToolPolicy>): void {
    this.policies.set(voiceSessionId, { ...DEFAULT_POLICY, ...policy })
  }

  getPolicy(voiceSessionId: string): VoiceToolPolicy {
    return this.policies.get(voiceSessionId) ?? { ...DEFAULT_POLICY }
  }

  /**
   * 判断工具调用是否需要用户确认。
   * 返回 null 表示自动放行，返回 permission event 表示需要确认。
   */
  evaluate(
    voiceSessionId: string,
    toolName: string,
    args: Record<string, unknown>,
    requestId: string,
  ): VoiceServerEvent | null {
    const policy = this.getPolicy(voiceSessionId)

    // 检查拒绝列表
    if (policy.deniedToolPrefixes.some((prefix) => toolName.startsWith(prefix))) {
      return {
        type: 'permission.resolved',
        requestId,
        approved: false,
      }
    }

    // 自动放行白名单
    if (policy.autoApproveReadOnly && policy.allowedToolPrefixes.some((prefix) => toolName.startsWith(prefix))) {
      console.log(`[voicePermission] auto-approve: ${toolName} voiceSession=${voiceSessionId}`)
      return null // null = auto-approved
    }

    // 需要确认
    if (policy.requireConfirmationForWrite) {
      return {
        type: 'permission.request',
        requestId,
        toolName,
        reason: `Voice session wants to execute: ${toolName}`,
        input: args,
      }
    }

    return null
  }

  /**
   * 检查 tool 是否可以被 agent session 的 auto-approve 覆盖。
   * 复用 conversationService 中已有的 can_use_tool 自动批准机制。
   */
  isAutoApprovedByAgentSession(agentSessionId: string | null, toolName: string): boolean {
    if (!agentSessionId) return false

    // 检查 agent session 是否注入了该 tool 对应的 MCP server
    const servers = sessionMcpService.getSessionMcpServers(agentSessionId)
    if (!servers) return false

    // 从 toolName 提取 server name: mcp__serverName__toolName
    const match = toolName.match(/^mcp__(.+?)__/)
    if (!match) return false

    const serverName = match[1]
    return serverName in servers
  }

  trackPendingRequest(voiceSessionId: string, requestId: string, toolName: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, { voiceSessionId, toolName, resolve })
    })
  }

  resolveRequest(requestId: string, approved: boolean): VoiceServerEvent | null {
    const pending = this.pendingRequests.get(requestId)
    if (pending) {
      this.pendingRequests.delete(requestId)
      pending.resolve(approved)
    }
    return { type: 'permission.resolved', requestId, approved }
  }
}

export const voicePermissionService = new VoicePermissionService()
