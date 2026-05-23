Qwen-Omni-Realtime 实时音视频模型文档总结
一、概述
Qwen-Omni-Realtime 是千问推出的实时多模态模型，支持音频和视频（连续图像帧） 的流式输入，并能实时生成高质量的文本和音频输出。 支持地域为 北京 和 新加坡，可直接通过 百炼控制台 在线体验。

二、核心功能
多模态理解与交互：

输入：支持流式的音频与图像（如视频抽帧）。

输出：支持仅输出文本或同时输出文本与音频。

高智能水平：Qwen3.5-Omni-Realtime 版本具备与 Qwen3.5-Plus 相当的智能水平。

联网搜索：原生支持联网搜索（WebSearch），模型可自主判断是否需要搜索以回答即时问题。

工具调用：支持 Function Calling，模型可自主调用外部工具。

高级语音能力：

语义打断：可识别对话意图，避免附和声触发打断。

语音控制：支持通过语音指令控制语速、音量和情绪。

声音复刻：部分模型（如 plus 和 flash 版本）支持声音复刻，可使用自定义音色对话。

多语言与方言：支持 113 种语种和方言 的语音识别，以及 36 种语种和方言 的语音生成。

丰富音色：支持 55 种音色，包括多语言和方言音色。

三、接入与使用流程
1. 建立连接
模型支持 WebSocket 和 WebRTC 两种协议接入。

协议	适用场景	特点
WebSocket	服务端集成、快速接入	连接配置简单，支持多种语言 SDK
WebRTC	浏览器端、低延迟语音场景	音频通过 UDP 直传，内置回声消除和降噪
WebSocket 连接
地址：

中国内地（北京）：wss://dashscope.aliyuncs.com/api-ws/v1/realtime

国际（新加坡）：wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime

鉴权：使用 Bearer Token，请求头为 Authorization: Bearer DASHSCOPE_API_KEY。

查询参数：需指定模型，例如 ?model=qwen3.5-omni-plus-realtime。

文档提供了 WebSocket 原生连接、DashScope Python SDK 和 Java SDK 的完整示例代码。

WebRTC 连接
流程：先通过 HTTP POST 交换 SDP（会话描述协议），之后底层自动建立音频通道。

接口：POST https://{endpoint}/api/v1/webrtc/realtime。

注意：WebRTC 功能需 白名单开通，请联系商务获取 Endpoint。

2. 配置会话
连接建立后，需发送 session.update 事件配置会话参数，主要包括：

输出模态 (modalities)：["text"] 或 ["text", "audio"]。

音色 (voice)：如 "Ethan"。

音频格式：输入/输出均支持 pcm 格式。

系统指令 (instructions)：设定模型的目标或角色。

语音活动检测 (turn_detection)：

支持 server_vad 和 semantic_vad 两种类型。

推荐使用 semantic_vad，可配置阈值和静音时长。

可设为 null 以采用手动模式。

3. 输入音频与图片
WebSocket 模式：

客户端通过 input_audio_buffer.append 和 input_image_buffer.append 事件发送 Base64 编码的数据到服务端缓冲区。

VAD 模式：服务端自动检测语音起止并触发响应。

手动模式：客户端需在数据发送完毕后主动调用 input_audio_buffer.commit 事件。

WebRTC 模式：

音频通过 RTP 轨道直接传输，视频通过 RTP 轨道发送画面帧。

仅支持服务端 VAD 模式，不支持手动模式。

4. 接收模型响应
模型响应的格式取决于配置的输出模态。

输出模态	WebSocket 接收方式	WebRTC 接收方式
仅文本	通过 response.text.delta 和 response.text.done 事件接收流式文本	通过 DataChannel 接收流式文本事件
文本+音频	文本通过 response.audio_transcript.delta 接收，音频通过 response.audio.delta 接收 Base64 数据	文本通过 DataChannel 接收，音频通过 RTP 轨道实时接收和播放
四、模型选型
主要模型 Qwen3.5-Omni-Realtime 与前代 Qwen3-Omni-Flash-Realtime 相比有显著提升，具备 联网搜索、工具调用、语义打断、语音控制 等新能力。

五、使用限制
功能冲突：联网搜索 和 工具调用 不兼容，不可同时开启。

会话时长：单次会话最长持续 120 分钟。

对话历史：模型会维护对话历史，当超过以下限制时，会自动丢弃最早的历史信息。

模型	音频最大轮次	视频最大轮次	音频最大时长	视频最大时长
qwen3.5-omni-plus-realtime	100轮	50轮	600秒	240秒
qwen3.5-omni-flash-realtime	80轮	50轮	480秒	120秒
qwen3-omni-flash-realtime	8轮	8轮	—	—
六、快速开始
文档提供了 WebSocket 和 WebRTC 两种协议，Python 和 Java 两种语言，以及 VAD 模式 和 手动模式 的完整示例代码，用户可快速体验实时对话功能。


