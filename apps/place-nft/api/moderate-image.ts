import OpenAI from 'openai'

const MAX_IMAGE_DATA_LENGTH = 2_000_000

function json(body: Record<string, unknown>, status = 200) {
    return Response.json(body, {
        status,
        headers: {
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
        },
    })
}

export default {
    async fetch(request: Request) {
        if (request.method !== 'POST') {
            return new Response(null, {
                status: 405,
                headers: {
                    allow: 'POST',
                    'cache-control': 'no-store',
                },
            })
        }

        if (!request.headers.get('content-type')?.startsWith('application/json')) {
            return json({code: 'UNSUPPORTED_CONTENT_TYPE'}, 415)
        }

        const contentLength = Number(request.headers.get('content-length'))
        if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_DATA_LENGTH + 1_000) {
            return json({code: 'IMAGE_TOO_LARGE'}, 413)
        }

        let payload: unknown
        try {
            payload = await request.json()
        } catch {
            return json({code: 'INVALID_JSON'}, 400)
        }

        const image = typeof payload === 'object' && payload !== null && 'image' in payload
            ? (payload as {image?: unknown}).image
            : null
        if (
            typeof image !== 'string' ||
            !image.startsWith('data:image/jpeg;base64,') ||
            image.length > MAX_IMAGE_DATA_LENGTH
        ) {
            return json({code: 'INVALID_IMAGE'}, 400)
        }

        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
            console.error(JSON.stringify({event: 'moderation_unavailable', reason: 'missing_api_key'}))
            return json({code: 'MODERATION_UNAVAILABLE', reason: 'not_configured'}, 503)
        }

        try {
            const openai = new OpenAI({
                apiKey,
                maxRetries: 0,
                timeout: 8_000,
            })
            const moderation = await openai.moderations.create(
                {
                    model: 'omni-moderation-latest',
                    input: [{type: 'image_url', image_url: {url: image}}],
                },
                {signal: request.signal},
            )
            const categories = moderation.results?.[0]?.categories
            if (!categories || typeof categories.sexual !== 'boolean') {
                console.error(JSON.stringify({event: 'moderation_invalid_response'}))
                return json({code: 'MODERATION_UNAVAILABLE', reason: 'invalid_response'}, 503)
            }

            const explicit = categories.sexual || categories['sexual/minors'] === true
            return json({allowed: !explicit})
        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                const upstreamCode = error.code ?? error.type ?? 'unknown'
                console.error(JSON.stringify({
                    event: 'moderation_failed',
                    status: error.status,
                    upstreamCode,
                    message: error.message,
                    requestId: error.requestID,
                    retryAfter: error.headers?.get('retry-after'),
                    rateLimitRemainingRequests: error.headers?.get('x-ratelimit-remaining-requests'),
                    rateLimitResetRequests: error.headers?.get('x-ratelimit-reset-requests'),
                }))
                const reason = error.status === 401 || error.status === 403
                    ? 'credentials_rejected'
                    : error.status === 429
                        ? upstreamCode === 'insufficient_quota'
                            ? 'quota_exhausted'
                            : 'rate_limited'
                        : error.status && error.status >= 400 && error.status < 500
                            ? 'request_rejected'
                            : 'upstream_unavailable'
                return json({code: 'MODERATION_UNAVAILABLE', reason}, 503)
            }

            const errorName = error instanceof Error ? error.name : 'unknown'
            console.error(JSON.stringify({
                event: 'moderation_failed',
                reason: errorName,
            }))
            return json({
                code: 'MODERATION_UNAVAILABLE',
                reason: error instanceof OpenAI.APIConnectionTimeoutError ? 'timeout' : 'network',
            }, 503)
        }
    },
}
