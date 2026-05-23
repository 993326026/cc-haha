import { voiceSessionService } from '../voice/voiceSessionService.js'
import { ApiError, errorResponse } from '../middleware/errorHandler.js'

export async function handleVoiceSessionsApi(
  req: Request,
  _url: URL,
  _segments: string[],
): Promise<Response> {
  try {
    switch (req.method) {
      case 'POST': {
        let body: { providerId?: string; agentSessionId?: string } = {}
        try {
          body = (await req.json()) as Record<string, unknown>
        } catch {
          // empty body is ok
        }

        const session = voiceSessionService.createSession({
          providerId: body.providerId,
          agentSessionId: body.agentSessionId ?? null,
        })

        return Response.json(
          {
            voiceSessionId: session.voiceSessionId,
            agentSessionId: session.agentSessionId,
            providerId: session.providerId,
            state: session.state,
          },
          { status: 201 },
        )
      }
      default:
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 },
        )
    }
  } catch (error) {
    return errorResponse(error)
  }
}
