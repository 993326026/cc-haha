# 实时语音 Provider 配置设计

## 背景

`cc-haha` 已经有一套普通 LLM provider 配置，用于文本 agent 主循环。它管理的是 Anthropic 兼容或 OpenAI 兼容的文本模型，并会把激活 provider 同步到 `cc-haha` managed settings 中，例如：

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_MODEL`

实时语音 Runtime 不能直接复用这套“当前文本 provider”配置。原因是：

- 语音 provider 不是普通文本模型 provider
- 语音 provider 可能使用完全不同的协议，例如 WebSocket 或 WebRTC
- 同一个厂商的文本模型 key 和实时语音 key 可能格式相同，但用途不同
- 用户可能希望文本 agent 用 DeepSeek，而语音 Runtime 用 Qwen-Omni-Realtime

因此需要新增一套独立的 **Voice Provider 配置域**。

## 核心原则

- 文本 provider 和语音 provider 分开管理
- API key 格式不能用来判断 provider 类型
- `sk-xxx` 这种 key 格式可以被阿里云、OpenAI 或其他平台共用，不能凭前缀自动归类
- 语音 Runtime 允许复用已有 key，但必须显式声明复用来源
- 浏览器端永远不能直接拿到 provider API key
- provider key 只存在服务端配置、服务端环境变量或安全存储中

## 配置边界

### Text Provider

用途：

- 现有 CLI / agent 文本主循环
- 普通聊天
- coding agent 推理

现有配置入口：

- `/api/providers`
- `ProviderService`
- `providers.json`
- `settings.json`

示例：

```json
{
  "id": "deepseek-main",
  "presetId": "deepseek",
  "apiKey": "sk-...",
  "baseUrl": "https://api.deepseek.com/anthropic",
  "models": {
    "main": "deepseek-chat",
    "haiku": "deepseek-chat",
    "sonnet": "deepseek-chat",
    "opus": "deepseek-chat"
  }
}
```

### Voice Provider

用途：

- 实时语音输入
- 实时语音输出
- provider 原生 VAD / turn detection
- 打断
- 语音 session

建议新增配置入口：

- `/api/voice/providers`
- `VoiceProviderService`
- `voice-providers.json`

示例：

```json
{
  "activeId": "qwen-realtime",
  "providers": [
    {
      "id": "qwen-realtime",
      "type": "qwen_omni_realtime",
      "name": "Qwen Omni Realtime",
      "apiKeyRef": {
        "source": "env",
        "name": "DASHSCOPE_API_KEY"
      },
      "baseUrl": "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      "model": "qwen3.5-omni-plus-realtime",
      "voice": "Cherry",
      "capabilities": {
        "audioInput": true,
        "audioOutput": true,
        "transcription": true,
        "serverVad": true,
        "bargeIn": true,
        "toolCalling": true
      }
    }
  ]
}
```

## API Key 设计

### 支持阿里云 `sk-xxx`

需要支持。

但实现上不要写成：

```ts
if (apiKey.startsWith('sk-')) provider = 'openai'
```

应该写成：

```ts
{
  type: 'qwen_omni_realtime',
  apiKeyRef: {
    source: 'env',
    name: 'DASHSCOPE_API_KEY'
  }
}
```

也就是说，**provider 类型由配置字段决定，不由 key 前缀决定**。

对我们当前首版主路径，阿里云百炼的实时模型接入应按“直接 Realtime 模型”处理，不再把 `workspaceId` / `appId` 作为硬前提字段。

### Key 来源

推荐支持三种来源：

```ts
type ApiKeyRef =
  | { source: 'env'; name: string }
  | { source: 'stored'; value: string }
  | { source: 'text_provider'; providerId: string }
```

说明：

- `env`：从环境变量读取，适合部署
- `stored`：保存到 `voice-providers.json` 或后续安全存储，适合桌面配置
- `text_provider`：显式复用已有文本 provider 的 key，适合某些同平台场景

首版建议优先实现：

- `env`
- `stored`

`text_provider` 可以作为第二阶段实现，避免一开始把两个配置系统耦合太深。

## 与现有 LLM Key 的关系

### 默认不复用

即使现有系统已经配置了 DeepSeek、Kimi、GLM 或其他文本 LLM key，语音 Runtime 也不应该默认拿来用。

原因：

- 文本模型 key 未必有实时语音权限
- 文本 provider base URL 未必支持 realtime protocol
- 文本 provider model mapping 与语音 model 完全不同

### 显式复用

允许用户明确选择“复用某个文本 provider 的 key”，但需要满足：

- provider 类型明确支持语音
- base URL 和 protocol 由 voice provider 配置决定
- 只复用 key，不复用文本 provider 的模型映射

但首版不要把“复用已有文本 provider 的 key”当主路径。首版应该优先支持独立 voice provider 配置，这样 text provider 和 voice provider 可以同时存在，而不会互相污染。

## Qwen Realtime 校准

按当前阿里云官方文档，`qwen3.5-omni-plus-realtime` 这条线的工程判断应当是：

- 它是 **直接 WebSocket Realtime 模型**
- 支持文本、音频、图片输入
- 支持文本、音频输出
- 支持 `Function Calling`
- 支持联网搜索
- 但联网搜索和工具调用不兼容，不能同时开启

因此首版建议：

- `model`: `qwen3.5-omni-plus-realtime`
- `protocol`: `websocket`
- `toolMode`: `function_calling`
- `search`: `disabled`

如果后面要做低成本版本，再补：

- `qwen3.5-omni-flash-realtime`

## 首版 provider 协作规则

首版允许系统同时配置：

- 一个或多个 text provider
- 一个或多个 voice provider

但单个 voice session 的推理规则固定为：

```ts
reasoningMode: 'embedded'
```

也就是：

- 一个 voice session 只使用一个主要 voice provider
- 不在同一个 voice session 里同时启用 “Qwen 负责语音 + DeepSeek 负责主推理”

这样做是为了避免：

- tool authority 冲突
- permission 冲突
- turn state 冲突
- interrupt 后上下文不一致

未来如果需要双 provider 协作，再单独增加：

```ts
reasoningMode: 'delegated_text_agent'
textProviderId?: string
```

示例：

```json
{
  "id": "qwen-realtime-reuse",
  "type": "qwen_omni_realtime",
  "name": "Qwen Realtime using existing Aliyun key",
  "apiKeyRef": {
    "source": "text_provider",
    "providerId": "aliyun-qwen-text"
  },
  "baseUrl": "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
  "model": "qwen-omni-turbo-realtime"
}
```

## 建议新增 API

```text
GET    /api/voice/providers
POST   /api/voice/providers
GET    /api/voice/providers/:id
PUT    /api/voice/providers/:id
DELETE /api/voice/providers/:id
POST   /api/voice/providers/:id/activate
POST   /api/voice/providers/:id/test
GET    /api/voice/providers/presets
```

### Preset 示例

```json
{
  "id": "qwen_omni_realtime",
  "name": "Qwen Omni Realtime",
  "type": "qwen_omni_realtime",
  "defaultBaseUrl": "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
  "defaultModel": "qwen3.5-omni-plus-realtime",
  "defaultVoice": "Cherry",
  "apiKeyEnv": "DASHSCOPE_API_KEY",
  "apiKeyUrl": "https://bailian.console.aliyun.com/",
  "protocol": "websocket",
  "capabilities": {
    "audioInput": true,
    "audioOutput": true,
    "transcription": true,
    "serverVad": true,
    "bargeIn": true,
    "toolCalling": true
  },
  "constraints": {
    "searchAndToolsMutuallyExclusive": true
  }
}
```

## Session 选择规则

创建 voice session 时，provider 选择优先级：

1. 请求里显式传入的 `providerId`
2. 当前激活的 voice provider
3. 环境变量 `VOICE_RUNTIME_DEFAULT_PROVIDER`
4. 返回配置错误

请求示例：

```json
{
  "providerId": "qwen-realtime",
  "voice": "Cherry",
  "agentSessionId": "existing-agent-session-id"
}
```

## 安全要求

- API 返回 provider 列表时必须隐藏 key，只返回 `apiKeyConfigured: true`
- `stored` key 后续应迁移到安全存储，不长期明文落盘
- 日志不能打印完整 key
- 测试 provider 时只能返回成功/失败和错误摘要
- 浏览器只拿 voice session token，不拿 provider key

## 首版建议

首版做法：

- 新增独立 `voice-providers.json`
- 支持 `DASHSCOPE_API_KEY`
- 支持 `stored` key
- UI 或 API 中明确区分 “文本模型 provider” 与 “实时语音 provider”
- 不默认复用已有 LLM key
- 预留 `text_provider` 复用字段，但第二阶段再实现

这样既支持阿里云 `sk-xxx`，也不会把用户已经配置好的 DeepSeek / Kimi / GLM 文本模型配置搅乱。


当前考虑的接入文档：qwen3.5-omni-plus-realtime
https://help.aliyun.com/zh/model-studio/realtime?spm=5176.30275541.J_ZGek9Blx07Hclc3Ddt9dg.1.4e332f3dXBUhEX&scm=20140722.S_help@@%E6%96%87%E6%A1%A3@@2880812._.ID_help@@%E6%96%87%E6%A1%A3@@2880812-RL_Qwen~DAS~Omni~DAS~Realtime-LOC_2024SPAllResult-OR_ser-PAR1_0bc3b4b317795309818871304e03a6-V_4-PAR3_o-RE_new6-P0_0-P1_0


