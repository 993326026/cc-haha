import { describe, it, expect, afterEach } from 'bun:test'
import { qwenOmniRealtimeAdapter } from '../../voice/providers/qwenOmniRealtimeAdapter.js'
import type { VoiceServerEvent } from '../../voice/protocol.js'

function createMockQwenServer(): { port: number; url: string; stop: () => Promise<void> } {
  const server = Bun.serve({
    port: 0,
    fetch(req, s) {
      if (s.upgrade(req)) return
      return new Response('WebSocket only', { status: 426 })
    },
    websocket: {
      open(ws) {
        // Send session.created
        ws.send(JSON.stringify({
          type: 'session.created',
          session: { id: 'mock-session-1' },
        }))
      },
      message(ws, msg) {
        try {
          const data = JSON.parse(typeof msg === 'string' ? msg : msg.toString())
          const type = data.type

          switch (type) {
            case 'session.update': {
              ws.send(JSON.stringify({ type: 'session.updated', session: data.session }))
              break
            }
            case 'input_audio_buffer.append': {
              // Simulate VAD: speech_started → speech_stopped → auto response
              ws.send(JSON.stringify({ type: 'input_audio_buffer.speech_started' }))
              setTimeout(() => {
                ws.send(JSON.stringify({ type: 'input_audio_buffer.speech_stopped' }))
                // Simulate response
                setTimeout(() => {
                  ws.send(JSON.stringify({ type: 'response.created' }))
                  ws.send(JSON.stringify({
                    type: 'response.audio_transcript.delta',
                    delta: '今天天气不错。',
                  }))
                  ws.send(JSON.stringify({
                    type: 'response.audio.delta',
                    delta: 'FAKE_AUDIO_DATA',
                  }))
                  ws.send(JSON.stringify({ type: 'response.audio.done' }))
                  ws.send(JSON.stringify({
                    type: 'response.audio_transcript.done',
                    transcript: '今天天气不错。',
                  }))
                  ws.send(JSON.stringify({ type: 'response.done' }))
                }, 100)
              }, 50)
              break
            }
            case 'conversation.item.create': {
              // Echo tool result back
              ws.send(JSON.stringify({
                type: 'conversation.item.created',
                item: data.item,
              }))
              break
            }
            case 'response.create': {
              ws.send(JSON.stringify({ type: 'response.created' }))
              setTimeout(() => {
                ws.send(JSON.stringify({ type: 'response.done' }))
              }, 50)
              break
            }
            case 'response.cancel': {
              ws.send(JSON.stringify({ type: 'response.done' }))
              break
            }
            case 'input_audio_buffer.commit':
            case 'input_audio_buffer.clear':
              // no-op
              break
          }
        } catch {
          // skip invalid JSON
        }
      },
      close() {},
      drain() {},
    },
  })

  return {
    port: server.port,
    url: `ws://127.0.0.1:${server.port}`,
    stop: async () => server.stop(true),
  }
}

// ---- Tests ----

describe('qwenOmniRealtimeAdapter', () => {
  let mockServer: ReturnType<typeof createMockQwenServer> | null = null

  afterEach(async () => {
    if (mockServer) {
      await mockServer.stop()
      mockServer = null
    }
  })

  it('reports capabilities correctly', () => {
    expect(qwenOmniRealtimeAdapter.name).toBe('qwen_omni_realtime')
    expect(qwenOmniRealtimeAdapter.capabilities.audioInput).toBe(true)
    expect(qwenOmniRealtimeAdapter.capabilities.toolCalling).toBe(true)
    expect(qwenOmniRealtimeAdapter.capabilities.bargeIn).toBe(true)
  })

  it('opens a realtime session and receives session.created', async () => {
    mockServer = createMockQwenServer()
    const events: VoiceServerEvent[] = []

    const conn = await qwenOmniRealtimeAdapter.connect({
      apiKey: 'test-key',
      model: 'qwen3.5-omni-plus-realtime',
      baseUrl: mockServer.url,
      onEvent: (ev) => events.push(ev),
    })

    // Wait for session.created to arrive
    await new Promise((r) => setTimeout(r, 200))
    expect(events.some((e) => e.type === 'session.state' && e.state === 'listening')).toBe(true)
    await conn.close()
  })

  it('forwards audio chunks', async () => {
    mockServer = createMockQwenServer()
    const events: VoiceServerEvent[] = []

    const conn = await qwenOmniRealtimeAdapter.connect({
      apiKey: 'test-key',
      model: 'qwen3.5-omni-plus-realtime',
      baseUrl: mockServer.url,
      onEvent: (ev) => events.push(ev),
    })

    await new Promise((r) => setTimeout(r, 100)) // wait for session.created
    await conn.sendAudio({ data: 'base64pcmdata', format: 'pcm16' })

    // Wait for the full mock flow
    await new Promise((r) => setTimeout(r, 300))

    const transcriptEvents = events.filter((e) => e.type === 'transcript.delta')
    expect(transcriptEvents.length).toBeGreaterThan(0)

    const audioEvents = events.filter((e) => e.type === 'assistant.audio.chunk')
    expect(audioEvents.length).toBeGreaterThan(0)

    await conn.close()
  })

  it('maps provider audio output events', async () => {
    mockServer = createMockQwenServer()
    const events: VoiceServerEvent[] = []

    const conn = await qwenOmniRealtimeAdapter.connect({
      apiKey: 'test-key',
      model: 'qwen3.5-omni-plus-realtime',
      baseUrl: mockServer.url,
      onEvent: (ev) => events.push(ev),
    })

    await new Promise((r) => setTimeout(r, 100))
    await conn.sendAudio({ data: 'test', format: 'pcm16' })
    await new Promise((r) => setTimeout(r, 300))

    const audioChunks = events.filter((e) => e.type === 'assistant.audio.chunk')
    expect(audioChunks.length).toBeGreaterThan(0)
    expect(audioChunks[0].format).toBe('pcm16')

    await conn.close()
  })

  it('supports interrupt via response.cancel', async () => {
    mockServer = createMockQwenServer()
    const events: VoiceServerEvent[] = []

    const conn = await qwenOmniRealtimeAdapter.connect({
      apiKey: 'test-key',
      model: 'qwen3.5-omni-plus-realtime',
      baseUrl: mockServer.url,
      onEvent: (ev) => events.push(ev),
    })

    await new Promise((r) => setTimeout(r, 100))
    await conn.interrupt()
    await new Promise((r) => setTimeout(r, 100))

    // Should get response.done mapped
    const doneEvents = events.filter((e) => e.type === 'session.state' && e.state === 'listening')
    expect(doneEvents.length).toBeGreaterThan(0)

    await conn.close()
  })

  it('sends tool results and creates conversation item', async () => {
    mockServer = createMockQwenServer()
    const events: VoiceServerEvent[] = []

    const conn = await qwenOmniRealtimeAdapter.connect({
      apiKey: 'test-key',
      model: 'qwen3.5-omni-plus-realtime',
      baseUrl: mockServer.url,
      onEvent: (ev) => events.push(ev),
    })

    await new Promise((r) => setTimeout(r, 100))

    // Should not throw
    await conn.sendToolResult({
      callId: 'call_123',
      output: JSON.stringify({ result: 'done' }),
    })

    await new Promise((r) => setTimeout(r, 100))
    await conn.close()
  })
})
