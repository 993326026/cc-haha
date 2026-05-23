# 实时语音 Runtime 环境与环境变量

## 首版环境变量

```bash
# Qwen-Omni-Realtime（首版主 provider，必需）
DASHSCOPE_API_KEY=               # sk-xxx 格式，但不能按 OpenAI key 处理
                                  # 获取地址: https://bailian.console.aliyun.com/

# 第二 provider（二选一，用于验证抽象层）
OPENAI_API_KEY=
GEMINI_API_KEY=

# Voice Runtime 全局配置
VOICE_RUNTIME_DEFAULT_PROVIDER=qwen
VOICE_RUNTIME_ALLOWED_PROVIDERS=qwen,openai
VOICE_RUNTIME_SESSION_SIGNING_KEY=
```

DASHSCOPE_API_KEY 即使是 `sk-xxx` 格式，也只能由 `qwen_omni_realtime` provider 使用。不要根据 `sk-` 前缀自动推断 provider。

Qwen 首版主路径按**直接 Realtime 模型**接入，不要求 `workspace_id` 和 `app_id`。

## 服务端保管规则

1. provider key 只保存在服务端（环境变量或 voice-providers.json）
2. 浏览器只拿临时 voice session 信息
3. 业务系统凭证不进前端
4. MCP 鉴权仍由业务服务端控制
5. voice provider key 与 text provider key 默认分离

## Voice Provider 配置

首版使用独立配置文件 `voice-providers.json`。支持三种 key 来源：

| 来源 | 说明 | 首版 |
|------|------|:--:|
| `env` | 从环境变量读取，如 DASHSCOPE_API_KEY | 支持 |
| `stored` | 明文存在配置文件中 | 支持 |
| `text_provider` | 复用已有文本 provider 的 key | 预留 |

## Provider 选择优先级

创建 voice session 时：

1. 请求里显式传入的 `providerId`
2. 当前激活的 voice provider（voice-providers.json `activeId`）
3. 环境变量 `VOICE_RUNTIME_DEFAULT_PROVIDER`
4. 返回配置错误

## 首版 Provider 策略

```
default provider:  qwen
secondary provider: openai 或 gemini
experimental:       seeduplex（只保留设计占位）

qwen model:  qwen3.5-omni-plus-realtime  (主)
             qwen3.5-omni-flash-realtime  (降级)

qwen constraint: tool calling 与搜索互斥，开 tool calling 必须关搜索
```

## 推理模式

首版固定 `reasoningMode = embedded`：

- voice session 只使用一个主要 voice provider 完成听、想、说
- 现有 text provider 继续服务普通文本 chat session
- 不在同一 voice session 里混跑 Qwen 语音 + DeepSeek 推理
