/**
 * Provider Adapter 接口定义
 *
 * 所有 provider-specific 逻辑收敛在 adapter 里，对上暴露统一接口。
 */

import type { VoiceServerEvent } from '../protocol.js'

// ---- 能力声明 ----

export type VoiceProviderCapabilities = {
  audioInput: boolean
  audioOutput: boolean
  transcription: boolean
  serverVad: boolean
  semanticVad?: boolean
  bargeIn: boolean
  toolCalling: boolean
  textOutput?: boolean
  voiceSelection?: boolean
}

// ---- 音频块 ----

export type AudioChunk = {
  data: string   // base64-encoded PCM16
  format: 'pcm16'
}

// ---- 工具结果 ----

export type VoiceToolResult = {
  callId: string
  output: string
}

// ---- 回调事件 ----

export type ProviderEventCallback = (event: VoiceServerEvent) => void

// ---- 连接选项 ----

export type ProviderConnectOptions = {
  apiKey: string
  model: string
  baseUrl?: string
  voice?: string
  instructions?: string
  tools?: Array<{
    type: 'function'
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
  onEvent: ProviderEventCallback
}

// ---- 连接 ----

export type ProviderConnection = {
  sendAudio(chunk: AudioChunk): Promise<void>
  commitAudio(): Promise<void>
  clearAudio(): Promise<void>
  interrupt(): Promise<void>
  sendToolResult(result: VoiceToolResult): Promise<void>
  updateSession(options: ProviderSessionUpdate): Promise<void>
  close(): Promise<void>
}

export type ProviderSessionUpdate = {
  voice?: string
  instructions?: string
  tools?: Array<{
    type: 'function'
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
}

// ---- Adapter ----

export type RealtimeVoiceProviderAdapter = {
  readonly name: string
  readonly capabilities: VoiceProviderCapabilities
  connect(options: ProviderConnectOptions): Promise<ProviderConnection>
}
