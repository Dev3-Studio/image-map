const MAX_IMAGE_DATA_LENGTH = 2_000_000

interface ModerationResponse {
    results?: Array<{
        categories?: Record<string, boolean>
    }>
}

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
            return json({code: 'MODERATION_UNAVAILABLE'}, 503)
        }

        try {
            const response = await fetch('https://api.openai.com/v1/moderations', {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${apiKey}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'omni-moderation-latest',
                    input: [{type: 'image_url', image_url: {url: image}}],
                }),
                cache: 'no-store',
                signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]),
            })

            if (!response.ok) {
                console.error(JSON.stringify({event: 'moderation_failed', status: response.status}))
                return json({code: 'MODERATION_UNAVAILABLE'}, 503)
            }

            const moderation = await response.json() as ModerationResponse
            const categories = moderation.results?.[0]?.categories
            if (!categories || typeof categories.sexual !== 'boolean') {
                console.error(JSON.stringify({event: 'moderation_invalid_response'}))
                return json({code: 'MODERATION_UNAVAILABLE'}, 503)
            }

            const explicit = categories.sexual || categories['sexual/minors'] === true
            return json({allowed: !explicit})
        } catch (error) {
            console.error(JSON.stringify({
                event: 'moderation_failed',
                reason: error instanceof Error ? error.name : 'unknown',
            }))
            return json({code: 'MODERATION_UNAVAILABLE'}, 503)
        }
    },
}
