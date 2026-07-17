const MODERATION_MAX_EDGE = 1024

interface ModerationResponse {
    allowed?: boolean
}

export async function moderateImage(file: File, signal: AbortSignal) {
    if (!file.type.startsWith('image/')) {
        throw new Error('INVALID_IMAGE')
    }

    const bitmap = await createImageBitmap(file)
    try {
        const scale = Math.min(1, MODERATION_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
            throw new Error('IMAGE_PROCESSING_FAILED')
        }

        context.fillStyle = '#fff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        const image = canvas.toDataURL('image/jpeg', 0.85)

        const response = await fetch('/api/moderate-image', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({image}),
            cache: 'no-store',
            signal,
        })
        const result = await response.json().catch(() => null) as ModerationResponse | null
        if (!response.ok || typeof result?.allowed !== 'boolean') {
            throw new Error('MODERATION_UNAVAILABLE')
        }

        return result.allowed
    } finally {
        bitmap.close()
    }
}
