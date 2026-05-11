/**
 * WeChat QR 扫码绑定 —— CLI 独立脚本
 *
 * 用法: bun run wechat/qr-bind.ts
 *
 * 完成后写 adapters.json，之后直接 bun run wechat 即可启动。
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import {
  startWechatLoginWithQr,
  pollWechatLoginWithQr,
} from './protocol.js'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 5 * 60_000 // 5 分钟超时

function getConfigPath(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  return path.join(configDir, 'adapters.json')
}

function readConfigFile(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeConfigFile(data: Record<string, any>): void {
  const filePath = getConfigPath()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = `${filePath}.tmp.${crypto.randomBytes(8).toString('hex')}`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 })
  fs.renameSync(tmp, filePath)
}

async function main(): Promise<void> {
  console.log('=== cc-haha WeChat 扫码绑定 ===\n')

  try {
    // 1. 生成二维码
    console.log('正在生成绑定二维码...')
    const qr = await startWechatLoginWithQr()
    console.log(`\n请使用微信扫描以下链接中的二维码：`)
    console.log(`\n  ${qr.qrcodeUrl}\n`)
    console.log('等待扫码确认中... (超时 5 分钟)')
    console.log('')

    // 2. 轮询扫码状态
    const startTime = Date.now()
    let lastStatus = ''

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      const result = await pollWechatLoginWithQr({ sessionKey: qr.sessionKey })

      // 状态变化时打印
      if (result.status !== lastStatus) {
        lastStatus = result.status
        const statusLabels: Record<string, string> = {
          wait: '等待扫描...',
          scaned: '已扫描，请在手机上确认...',
          scaned_but_redirect: '正在切换微信网关...',
        }
        if (statusLabels[result.status]) {
          console.log(`  [${new Date().toLocaleTimeString()}] ${statusLabels[result.status]}`)
        }
      }

      if (result.connected) {
        // 3. 绑定成功，写入配置
        console.log('\n✓ 微信绑定成功！\n')

        const config = readConfigFile()
        config.wechat = {
          ...config.wechat,
          accountId: result.accountId!,
          botToken: result.botToken!,
          baseUrl: result.baseUrl,
          userId: result.userId,
        }
        writeConfigFile(config)

        console.log('已写入配置到 ~/.claude/adapters.json')
        console.log(`  accountId: ${result.accountId}`)
        console.log(`  baseUrl: ${result.baseUrl}\n`)
        console.log('下一步：启动 server 和 wechat adapter')
        console.log('  # 终端 1: 启动服务端')
        console.log('  cd /opt/aibot/cc-haha/cc-haha-0.2.1 && bun run start')
        console.log('')
        console.log('  # 终端 2: 启动微信 adapter')
        console.log('  cd /opt/aibot/cc-haha/cc-haha-0.2.1/adapters && bun run wechat')
        return
      }

      if (result.status === 'expired') {
        console.log('\n✗ 二维码已过期，请重新运行此脚本。')
        process.exit(1)
      }

      await sleep(POLL_INTERVAL_MS)
    }

    console.log('\n✗ 绑定超时，请重新运行。')
    process.exit(1)
  } catch (err) {
    console.error('\n✗ 绑定失败:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

void main()
