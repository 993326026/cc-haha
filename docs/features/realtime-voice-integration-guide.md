# 实时语音 Runtime 业务接入指南

## 适用对象

需要在自己的 Web/App/企业入口中接入 cc-haha 实时语音能力的业务系统（如 Fire）。

## 前置条件

1. cc-haha server 已启动，监听 `127.0.0.1:3456`
2. 已配置 voice provider: `DASHSCOPE_API_KEY` 环境变量
3. 业务系统已具备用户鉴权能力

## 接入流程

### Step 1: 创建 agent session（可复用已有文字 session）

```
POST http://127.0.0.1:3456/api/sessions
Content-Type: application/json

{ "workDir": "/opt/aibot/your-project" }

Response: { "sessionId": "abc-123" }
```

### Step 2: 注入业务 MCP tools

```
POST http://127.0.0.1:3456/api/sessions/abc-123/mcp-servers
Content-Type: application/json

{
  "servers": {
    "your-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server.cjs"],
      "env": { "TOKEN": "xxx" }
    }
  },
  "applyNow": true
}
```

### Step 3: 创建 voice session（绑定 agent session）

```
POST http://127.0.0.1:3456/api/voice/sessions
Content-Type: application/json

{
  "providerId": "qwen",
  "agentSessionId": "abc-123"
}

Response: { "voiceSessionId": "vs-def-456", "state": "connecting" }
```

### Step 4: 连接 voice WebSocket

```javascript
const ws = new WebSocket('ws://127.0.0.1:3456/ws/voice/vs-def-456')

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  switch (msg.type) {
    case 'transcript.delta':
      // 实时转写文字
      console.log(msg.text)
      break
    case 'assistant.audio.chunk':
      // base64 PCM16 音频 → 播放
      playAudio(msg.audio)
      break
    case 'permission.request':
      // 高风险操作确认 → 弹窗
      showConfirmDialog(msg)
      break
    case 'session.error':
      console.error(msg.code, msg.message)
      break
  }
}

// 发送音频
ws.send(JSON.stringify({
  type: 'audio.input.append',
  audio: base64AudioData,
  format: 'pcm16',
}))

// 打断
ws.send(JSON.stringify({ type: 'assistant.interrupt' }))

// 批准/拒绝权限
ws.send(JSON.stringify({
  type: 'permission.approve',
  requestId: 'req-123',
}))

// 结束
ws.send(JSON.stringify({ type: 'session.close' }))
```

## 完整事件类型

### 客户端发送 (VoiceClientEvent)

| type | 说明 |
|------|------|
| `audio.input.append` | 发送音频 chunk（base64 PCM16） |
| `audio.input.commit` | 手动提交音频（非 VAD 模式） |
| `audio.input.clear` | 清空音频缓冲区 |
| `assistant.interrupt` | 打断当前播报 |
| `permission.approve` | 批准工具执行 |
| `permission.reject` | 拒绝工具执行 |
| `session.close` | 关闭会话 |

### 服务端发送 (VoiceServerEvent)

| type | 说明 |
|------|------|
| `session.state` | 状态变更（listening/thinking/speaking/...） |
| `transcript.delta` | 实时转写增量 |
| `transcript.final` | 单轮转写完成 |
| `assistant.audio.chunk` | 音频流 chunk |
| `assistant.audio.stop` | 音频播放结束 |
| `tool.call.started` | 工具调用开始 |
| `tool.call.completed` | 工具调用完成 |
| `permission.request` | 需要用户确认 |
| `permission.resolved` | 权限已处理 |
| `session.error` | 错误事件 |

## 权限策略

Voice Runtime 默认策略：

- `mcp__fire-mgmt__*` 只读工具 → 自动放行
- 非白名单工具 → 需要用户确认
- 拒绝列表工具 → 直接拒绝

可通过 `voicePermissionService.setPolicy()` 自定义。

## 音频格式要求

- 输入: PCM16, 16000Hz, 单声道, 640 bytes/chunk (20ms)
- 输出: PCM16, 16000Hz, 单声道 (base64)

## 首版限制

- 单会话最长 120 分钟
- 工具调用超时 30 秒
- 仅 Qwen 一个 provider
- WebSocket only（WebRTC 需白名单）
