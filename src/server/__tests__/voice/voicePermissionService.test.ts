import { describe, it, expect } from 'bun:test'
import { voicePermissionService } from '../../services/voicePermissionService.js'

describe('voicePermissionService', () => {
  it('auto-approves read-only tools when policy allows', () => {
    const result = voicePermissionService.evaluate(
      'vs-1',
      'mcp__fire-mgmt__list_material_categories',
      {},
      'req-1',
    )
    expect(result).toBeNull() // null = auto-approved
  })

  it('denies tools matching denied prefixes', () => {
    voicePermissionService.setPolicy('vs-2', {
      deniedToolPrefixes: ['mcp__dangerous__'],
    })
    const result = voicePermissionService.evaluate(
      'vs-2',
      'mcp__dangerous__delete_everything',
      {},
      'req-2',
    )
    expect(result).not.toBeNull()
    expect(result!.type).toBe('permission.resolved')
    expect((result as { approved: boolean }).approved).toBe(false)
  })

  it('creates permission requests for non-whitelisted tools', () => {
    voicePermissionService.setPolicy('vs-3', {
      allowedToolPrefixes: [],
    })
    const result = voicePermissionService.evaluate(
      'vs-3',
      'write_file',
      { path: '/tmp/test' },
      'req-3',
    )
    expect(result).not.toBeNull()
    expect(result!.type).toBe('permission.request')
  })

  it('resolves approved requests', () => {
    const result = voicePermissionService.resolveRequest('req-4', true)
    expect(result).not.toBeNull()
    expect(result!.approved).toBe(true)
  })

  it('resolves rejected requests', () => {
    const result = voicePermissionService.resolveRequest('req-5', false)
    expect(result).not.toBeNull()
    expect(result!.approved).toBe(false)
  })
})
