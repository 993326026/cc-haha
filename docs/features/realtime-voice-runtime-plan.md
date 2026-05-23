# Realtime Voice Runtime 开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `cc-haha` 中落地一套可用于 Web / App / 企业入口的实时语音 Runtime，首版以 `Qwen-Omni-Realtime` 为主 provider，支持实时双向语音、打断、工具调用和高风险操作确认。

**Architecture:** 采用 `Voice Session Gateway + Realtime Voice Runtime + Provider Adapter + Agent Bridge` 的分层结构。语音会话是新的交互层，工具与权限继续复用 `cc-haha` 现有的 server、session、tool、MCP 与 permission 体系。

**Tech Stack:** TypeScript、Bun、现有 `cc-haha` server / WebSocket 架构、`Qwen-Omni-Realtime`、第二 provider（`OpenAI Realtime` 或 `Gemini Live`）、WebRTC 或 WebSocket 音频流、MCP。

---

## 开工前准备

### 必须准备

- [ ] `DASHSCOPE_API_KEY`
  用于 `Qwen-Omni-Realtime`，这是首版主 provider 的必要凭证。
  注意：阿里云的 key 可能也是 `sk-xxx` 开头，不能因为前缀像 OpenAI 就当成 OpenAI key。

- [ ] 第二 provider 的 key
  建议二选一：
  - `OPENAI_API_KEY`
  - `GEMINI_API_KEY`

- [ ] 业务工具服务端凭证
  例如：
  - `Fire MCP` 的 token
  - 内部服务 API token
  - 租户或用户代理身份凭证

- [ ] 可用的 `HTTPS / WSS` 环境
  浏览器麦克风、WebRTC、实时语音链路都更依赖这一层。

- [ ] 一套会话鉴权方案
  浏览器不能直接拿 provider key，必须由服务端颁发临时会话或临时 token。

- [ ] 独立 voice provider 配置方案
  语音 provider 要和现有文本 LLM provider 分开，避免用户已经配置好的 DeepSeek、Kimi、GLM 等文本 key 被误用。

### 强烈建议准备

- [ ] `TURN/STUN` 服务
  如果打算上 WebRTC，企业网络下没有它会很容易出连接问题。

- [ ] provider 用量预算
  实时语音比普通文本聊天更容易产生持续成本，建议提前设好：
  - 日额度
  - 单会话时长上限
  - provider 切换策略

- [ ] 语音测试环境
  至少准备：
  - Chrome 最新版
  - 一副常规耳机
  - 一台带麦克风的手机

- [ ] 基础观测能力
  至少记录：
  - voice session 建立失败
  - provider 断开
  - 平均首音频返回时间
  - permission 请求数量
  - tool 调用成功率

### 当前不需要优先准备

- [ ] 独立 STT provider key
- [ ] 独立 TTS provider key
- [ ] Seeduplex API key

说明：
首版主线不走 `ASR -> text LLM -> TTS` 拼装方案，也不把 `Seeduplex` 放进正式依赖。
同时，首版不做 “Qwen 负责语音、DeepSeek 负责同一 voice session 主推理” 这种双 provider 协作。
另外，`Qwen` 首版主路径按 **直接 Realtime 模型** 接入，不按 `workspace_id/app_id` 的应用型接入来设计。

## 文件结构预案

### `cc-haha` 预计新增

- `src/server/voice/protocol.ts`
- `src/server/voice/voiceSessionService.ts`
- `src/server/voice/voiceGateway.ts`
- `src/server/voice/providers/types.ts`
- `src/server/voice/providers/qwenOmniRealtimeAdapter.ts`
- `src/server/voice/providers/openaiRealtimeAdapter.ts` 或 `src/server/voice/providers/geminiLiveAdapter.ts`
- `src/server/services/voiceAgentBridge.ts`
- `src/server/services/voicePermissionService.ts`
- `src/server/__tests__/voice/`

### `cc-haha` 预计修改

- `src/server/router.ts`
- `src/server/index.ts`
- `src/server/ws/handler.ts` 或相关 session 管理文件
- 现有 session / inspection / audit 相关 server 文件

### 客户端或接入方预计需要

- `VoiceClient`
- `VoiceRecorder`
- `VoicePlayer`
- `VoiceStateIndicator`
- `VoicePermissionDialog`

---

### Task 1: 固化 provider 与鉴权策略

**Files:**
- Modify: [docs/features/realtime-voice-runtime-design.md](</D:/桌面/DH/AI Workspace/cc-haha/docs/features/realtime-voice-runtime-design.md>)
- Create: `docs/features/realtime-voice-provider-config.md`
- Create: `docs/features/realtime-voice-runtime-env.md`

- [ ] **Step 1: 整理环境变量清单**

写明首版环境变量：

```text
DASHSCOPE_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
VOICE_RUNTIME_DEFAULT_PROVIDER=qwen
VOICE_RUNTIME_ALLOWED_PROVIDERS=qwen,openai
VOICE_RUNTIME_SESSION_SIGNING_KEY=
```

说明：

```text
DASHSCOPE_API_KEY 即使是 sk-xxx 格式，也只能由 qwen_omni_realtime provider 使用。
不要根据 sk- 前缀自动推断 provider。
Qwen 首版主路径按直接 Realtime 模型接入，不要求 workspace_id 和 app_id。
```

- [ ] **Step 2: 写出服务端保管规则**

明确：

```text
1. provider key 只保存在服务端
2. 浏览器只拿临时会话信息
3. 业务系统凭证不进前端
4. MCP 鉴权仍由业务服务端控制
5. voice provider key 与 text provider key 默认分离
```

- [ ] **Step 3: 写出 voice provider 配置规则**

首版使用独立配置文件：

```text
voice-providers.json
```

支持 key 来源：

```text
env: 从环境变量读取，例如 DASHSCOPE_API_KEY
stored: 存在 voice provider 配置中
text_provider: 预留字段，第二阶段再支持
```

- [ ] **Step 4: 写出 provider 选择规则**

首版推荐：

```text
default provider: qwen
secondary provider: openai 或 gemini
experimental provider: seeduplex（只保留设计占位）
```

并补充 Qwen 约束：

```text
default qwen model: qwen3.5-omni-plus-realtime
fallback qwen model: qwen3.5-omni-flash-realtime
tool calling enabled => search disabled
```

- [ ] **Step 5: 写出首版推理模式规则**

首版固定：

```text
reasoningMode = embedded
```

含义：

```text
voice session 只使用一个主要 voice provider 完成听、想、说。
现有 text provider 继续服务普通文本 chat session。
不在同一 voice session 里混跑 Qwen 语音 + DeepSeek 推理。
```

- [ ] **Step 6: 提交文档**

Run:

```bash
git add docs/features/realtime-voice-runtime-design.md docs/features/realtime-voice-provider-config.md docs/features/realtime-voice-runtime-env.md
git commit -m "docs: add realtime voice runtime environment guide"
```

### Task 2: 定义统一语音协议

**Files:**
- Create: `src/server/voice/protocol.ts`
- Test: `src/server/__tests__/voice/protocol.test.ts`

- [ ] **Step 1: 先写协议测试**

覆盖：

```ts
describe('voice protocol', () => {
  it('accepts valid client events')
  it('accepts valid server events')
  it('rejects unknown event types')
  it('rejects malformed permission events')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bun test src/server/__tests__/voice/protocol.test.ts
```

Expected:

```text
FAIL - module or validators not found
```

- [ ] **Step 3: 写最小实现**

先定义：

```ts
export type VoiceClientEvent = ...
export type VoiceServerEvent = ...
export type VoiceSessionState = ...
export function isVoiceClientEvent(value: unknown): boolean
export function isVoiceServerEvent(value: unknown): boolean
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
bun test src/server/__tests__/voice/protocol.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/server/voice/protocol.ts src/server/__tests__/voice/protocol.test.ts
git commit -m "feat: add realtime voice protocol"
```

### Task 3: 搭建 voice session 生命周期

**Files:**
- Create: `src/server/voice/voiceSessionService.ts`
- Test: `src/server/__tests__/voice/voiceSessionService.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖：

```ts
describe('voiceSessionService', () => {
  it('creates a voice session bound to an agent session')
  it('tracks provider, state, and owner')
  it('cleans up sessions on close')
  it('rejects unsupported providers')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
bun test src/server/__tests__/voice/voiceSessionService.test.ts
```

- [ ] **Step 3: 写最小实现**

至少支持：

```ts
createSession()
getSession()
updateState()
bindAgentSession()
closeSession()
```

- [ ] **Step 4: 再跑测试**

Run:

```bash
bun test src/server/__tests__/voice/voiceSessionService.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/server/voice/voiceSessionService.ts src/server/__tests__/voice/voiceSessionService.test.ts
git commit -m "feat: add voice session lifecycle service"
```

### Task 4: 增加 Voice Gateway

**Files:**
- Create: `src/server/voice/voiceGateway.ts`
- Modify: `src/server/router.ts`
- Modify: `src/server/index.ts`
- Test: `src/server/__tests__/voice/voiceGateway.test.ts`

- [ ] **Step 1: 写 gateway 行为测试**

覆盖：

```ts
describe('voice gateway', () => {
  it('starts a session')
  it('routes audio.input.append events')
  it('routes assistant.interrupt events')
  it('returns session.error for malformed messages')
})
```

- [ ] **Step 2: 接到 server 路由**

建议新增：

```text
POST /api/voice/session
WS   /ws/voice/:voiceSessionId
```

首版建议：

```text
先走 WebSocket 音频流
WebRTC 放到后续阶段
```

- [ ] **Step 3: 实现最小 gateway**

先只打通：

```text
session.start
audio.input.append
assistant.interrupt
session.close
```

- [ ] **Step 4: 跑 gateway 测试**

Run:

```bash
bun test src/server/__tests__/voice/voiceGateway.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/server/voice/voiceGateway.ts src/server/router.ts src/server/index.ts src/server/__tests__/voice/voiceGateway.test.ts
git commit -m "feat: add voice session gateway"
```

### Task 5: 接入 Qwen-Omni-Realtime adapter

**Files:**
- Create: `src/server/voice/providers/types.ts`
- Create: `src/server/voice/providers/qwenOmniRealtimeAdapter.ts`
- Test: `src/server/__tests__/voice/qwenOmniRealtimeAdapter.test.ts`

- [ ] **Step 1: 定义 provider adapter 接口**

定义：

```ts
export type RealtimeVoiceProviderAdapter = {
  name: string
  capabilities: VoiceProviderCapabilities
  connect(options: ProviderConnectOptions): Promise<ProviderConnection>
}
```

- [ ] **Step 2: 写 adapter 测试**

覆盖：

```ts
describe('qwenOmniRealtimeAdapter', () => {
  it('opens a realtime session')
  it('forwards audio chunks')
  it('maps provider transcript events')
  it('maps provider audio output events')
  it('supports interrupt')
})
```

- [ ] **Step 3: 实现最小 adapter**

先支持：

```text
connect
sendAudio
commitAudio
interrupt
close
provider event mapping
```

并补齐百炼应用层配置：

```text
qwen3.5-omni-plus-realtime
websocket auth
tool calling mode
duplex mode
```

- [ ] **Step 4: 跑 adapter 测试**

Run:

```bash
bun test src/server/__tests__/voice/qwenOmniRealtimeAdapter.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/server/voice/providers/types.ts src/server/voice/providers/qwenOmniRealtimeAdapter.ts src/server/__tests__/voice/qwenOmniRealtimeAdapter.test.ts
git commit -m "feat: add qwen realtime voice adapter"
```

### Task 6: 连接 agent、tool、MCP

**Files:**
- Create: `src/server/services/voiceAgentBridge.ts`
- Modify: 现有 session / tool / MCP 相关 server 文件
- Test: `src/server/__tests__/voice/voiceAgentBridge.test.ts`

- [ ] **Step 1: 写 bridge 测试**

覆盖：

```ts
describe('voiceAgentBridge', () => {
  it('binds a voice session to an agent session')
  it('forwards transcript.final into the agent')
  it('returns tool results back to the voice runtime')
  it('reuses session-level MCP configuration')
})
```

- [ ] **Step 2: 实现最小 bridge**

首版按 embedded reasoning 打通：

```text
provider tool call -> cc-haha tool/MCP execution
cc-haha permission flow -> voice runtime event
tool result -> provider event
voice session metadata -> audit/session state
```

不要在首版这里强行接：

```text
transcript.final -> runHeadless text main loop -> assistant text -> re-speak
```

- [ ] **Step 3: 跑 bridge 测试**

Run:

```bash
bun test src/server/__tests__/voice/voiceAgentBridge.test.ts
```

- [ ] **Step 4: 提交**

```bash
git add src/server/services/voiceAgentBridge.ts src/server/__tests__/voice/voiceAgentBridge.test.ts
git commit -m "feat: bridge voice runtime to agent sessions"
```

### Task 7: 做权限确认与审计

**Files:**
- Create: `src/server/services/voicePermissionService.ts`
- Modify: 现有 permission / audit 相关 server 文件
- Test: `src/server/__tests__/voice/voicePermissionService.test.ts`

- [ ] **Step 1: 写权限测试**

覆盖：

```ts
describe('voicePermissionService', () => {
  it('auto-approves read-only tools when policy allows')
  it('creates permission requests for write tools')
  it('resolves approved requests')
  it('resolves rejected requests')
})
```

- [ ] **Step 2: 实现最小权限服务**

支持：

```text
policy evaluation
permission.request
approve / reject
audit emission
```

- [ ] **Step 3: 跑测试**

Run:

```bash
bun test src/server/__tests__/voice/voicePermissionService.test.ts
```

- [ ] **Step 4: 提交**

```bash
git add src/server/services/voicePermissionService.ts src/server/__tests__/voice/voicePermissionService.test.ts
git commit -m "feat: add voice permission flow"
```

### Task 8: 加入打断与状态流转

**Files:**
- Modify: `src/server/voice/voiceSessionService.ts`
- Modify: `src/server/voice/voiceGateway.ts`
- Modify: `src/server/voice/providers/qwenOmniRealtimeAdapter.ts`
- Test: `src/server/__tests__/voice/interrupt.test.ts`

- [ ] **Step 1: 写打断测试**

覆盖：

```ts
describe('voice interrupt flow', () => {
  it('stops assistant audio on interrupt')
  it('moves state from speaking to listening')
  it('cancels provider response when supported')
})
```

- [ ] **Step 2: 实现最小打断链路**

打通：

```text
client interrupt
runtime stop audio
provider interrupt
state transition
```

- [ ] **Step 3: 跑测试**

Run:

```bash
bun test src/server/__tests__/voice/interrupt.test.ts
```

- [ ] **Step 4: 提交**

```bash
git add src/server/voice/voiceSessionService.ts src/server/voice/voiceGateway.ts src/server/voice/providers/qwenOmniRealtimeAdapter.ts src/server/__tests__/voice/interrupt.test.ts
git commit -m "feat: add voice interrupt flow"
```

### Task 9: 接入第二 provider（延后开发）

> **状态: 延后。** 待首版 Qwen 链路跑通并接入首个业务系统后再启动。

**Files:**
- Create: `src/server/voice/providers/openaiRealtimeAdapter.ts` 或 `src/server/voice/providers/geminiLiveAdapter.ts`
- Test: `src/server/__tests__/voice/secondaryProvider.test.ts`

- [ ] **Step 1: 选定第二 provider**

推荐优先级：

```text
1. OpenAI Realtime
2. Gemini Live
```

- [ ] **Step 2: 写兼容性测试**

覆盖：

```ts
describe('secondary provider compatibility', () => {
  it('supports the same gateway protocol')
  it('supports transcript and audio output events')
  it('supports interrupt or a documented fallback')
})
```

- [ ] **Step 3: 实现第二 adapter**

- [ ] **Step 4: 跑 provider 测试**

Run:

```bash
bun test src/server/__tests__/voice/secondaryProvider.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/server/voice/providers src/server/__tests__/voice/secondaryProvider.test.ts
git commit -m "feat: add secondary realtime voice provider"
```

### Task 10: 业务接入与首版联调

**Files:**
- Modify: 业务接入方代码仓库
- Modify: `cc-haha` voice session API 文档
- Test: 联调脚本与手工验证记录

- [ ] **Step 1: 建立首个产品接入**

先接：

```text
create voice session
attach MCP/tools
send page context
receive audio / transcript / permission events
```

- [ ] **Step 2: 验证三条主路径**

必须跑通：

```text
普通问答
只读查询
写操作确认
```

- [ ] **Step 3: 记录联调结果**

记录：

```text
首次建连成功率
首音频延迟
打断成功率
写操作确认成功率
```

- [ ] **Step 4: 提交**

```bash
git add <relevant files>
git commit -m "feat: integrate realtime voice runtime into first product"
```

### Task 11: 验证与质量门

**Files:**
- Test: `src/server/__tests__/voice/`
- Run: server checks and quality checks

- [ ] **Step 1: 跑 server 检查**

Run:

```bash
bun run check:server
```

- [ ] **Step 2: 跑相关语音测试**

Run:

```bash
bun test src/server/__tests__/voice
```

- [ ] **Step 3: 若本地 provider 可用，跑质量门**

Run:

```bash
bun run quality:providers
bun run quality:gate --mode baseline --allow-live --provider-model <provider:model[:label]>
```

- [ ] **Step 4: PR 前跑总检查**

Run:

```bash
bun run quality:pr
```

- [ ] **Step 5: 汇总结果**

记录：

```text
测试通过情况
质量报告路径
live provider 是否跑通
未覆盖风险
```

## 里程碑建议

- 里程碑 1：`cc-haha` 内部能建立 voice session，能收发音频和 transcript
- 里程碑 2：`Qwen-Omni-Realtime` 跑通完整语音回路
- 里程碑 3：voice session 能驱动 agent / MCP / permission
- 里程碑 4：第二 provider 跑通，抽象层成立
- 里程碑 5：首个业务系统完成接入

## 风险提醒

- `Seeduplex` 目前不应进入首版关键路径
- 如果浏览器首版强依赖 WebRTC，就要尽早处理 TURN/STUN
- 语音体验成败高度依赖延迟、打断和权限确认节奏，不能只看“功能是否存在”
- 如果前端直接拿 provider key，后面安全整改成本会很高
