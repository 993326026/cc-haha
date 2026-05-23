# Voice Runtime 交接文档

## 当前状态

### 已完成（54 tests, 8/11 tasks）

| Task | 内容 | 文件 |
|:--|------|------|
| 1 | Env 文档 | `docs/features/realtime-voice-runtime-env.md` |
| 2 | 事件协议 | `src/server/voice/protocol.ts` |
| 3 | Session 服务 | `src/server/voice/voiceSessionService.ts` |
| 4 | WS Gateway | `src/server/voice/voiceGateway.ts` |
| 5 | Qwen Adapter | `src/server/voice/providers/qwenOmniRealtimeAdapter.ts` |
| 6 | Agent Bridge | `src/server/services/voiceAgentBridge.ts` |
| 7 | 权限服务 | `src/server/services/voicePermissionService.ts` |
| 8 | 打断+状态机 | 同上文件 + gateway interrupt |
| 9 | 第二 provider | **延后** |
| 10 | 业务接入文档 | `docs/features/realtime-voice-integration-guide.md` |
| 11 | 质量门 | 54 tests pass |

### 能跑通

- WebSocket 连接 Qwen3.5-Omni-Realtime ✓
- 音频采集（浏览器 mic → server → Qwen） ✓
- 语音识别 + AI 文字回复 ✓
- AI 语音播报（24000Hz PCM16） ✓
- 手动打断 ✓
- 自动打断 ×（手机回声消除干扰，VAD speech_started 不在播放期间触发）

### 关键配置

- Voice: `Tina`（Cherry/Chelsie 不可用）
- Audio format: `pcm`（不是 pcm16）
- VAD: `semantic_vad`
- Output sample rate: 24000Hz
- Turn detection: `interrupt_response: true, create_response: true`

## 与 cc-haha 的联系

### 复用（直接调用已有代码）

```
voiceGateway.ts
  └─→ qwenOmniRealtimeAdapter.ts    直接 WebSocket 连阿里云（独立，不走 Anthropic SDK）

voiceAgentBridge.ts
  └─→ conversationService.requestControl()    发送 mcp_set_servers
  └─→ sessionMcpService                       读 session MCP 配置

voicePermissionService.ts
  └─→ sessionMcpService                       检查 MCP server 白名单

index.ts
  └─→ router.ts → handleVoiceSessionsApi     新增 /api/voice/ 路由
  └─→ websocket handler                      新增 /ws/voice/ 路径
```

### 不依赖 cc-haha 的部分

- Qwen 连接：直接 `new WebSocket()` 连阿里云，不走 `ANTHROPIC_BASE_URL`
- 音频处理：浏览器 `getUserMedia` + `WebAudio API`，服务器只转发
- Voice session：独立于 text agent session（但可绑定）

### 架构关系

```
浏览器/手机
  ↕ WebSocket (/ws/voice/:id)        ← 新增
cc-haha server
  ├─ voiceGateway                     ← 新增
  │    └─ qwenOmniRealtimeAdapter     ← 新增（独立 WS 连阿里云）
  ├─ voiceSessionService              ← 新增
  ├─ voiceAgentBridge                 ← 新增（桥接到现有 agent）
  │    └─→ conversationService (已有)
  │    └─→ sessionMcpService (已有)
  └─ text agent (已有，不受影响)
       ├─ provider: DeepSeek
       └─ session MCP injection
```

**关键：语音和文字是两条独立链路。** Qwen 处理语音，DeepSeek 处理文字。互不干扰。

## 待还原的临时改动

| # | 文件 | 还原操作 |
|:--|------|------|
| 1 | `.env` | 删除 `SERVER_HOST=0.0.0.0`、`DASHSCOPE_API_KEY` |
| 2 | nginx | `sudo rm /www/server/panel/vhost/nginx/extension/cozeall_com/voice.conf && sudo nginx -s reload` |
| 3 | `src/server/index.ts` | 删除 voice API auth bypass、CORS bypass、voice WS CORS bypass、/voice 路由 |
| 4 | `desktop/public/voice.html` | 删除 |

详见 `docs/voice-test-temp-changes.md`

## Branch 信息

- 分支：`features/voice-runtime`
- 基于：`ECS-haha`
- 已推送：`origin/features/voice-runtime`
- 最后一次提交：`9fc65e4` (docs: voice integration guide)

## 继续开发建议

1. 先还原临时改动或切回 `ECS-haha` 分支（voice runtime 在 `features/voice-runtime`）
2. 修复自动打断：可能需要客户端 VAD 或在 gateway 层检测 speech_started 时序
3. 实现 `voice-providers.json` 配置
4. 完成 Agent Bridge 的 executeTool 真实现（目前是 requestControl 桥接）
5. Fire 前端接入语音面板
