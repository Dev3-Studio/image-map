const MAX_CROP_OUTPUT_EDGE = 2048

export interface CropSelection {
    centerX: number
    centerY: number
    zoom: number
}

export async function createSquareCrop(file: File, selection: CropSelection) {
    const bitmap = await createImageBitmap(file)
    try {
        const cropSize = Math.min(bitmap.width, bitmap.height) / selection.zoom
        const sourceX = Math.max(0, Math.min(
            bitmap.width - cropSize,
            selection.centerX * bitmap.width - cropSize / 2,
        ))
        const sourceY = Math.max(0, Math.min(
            bitmap.height - cropSize,
            selection.centerY * bitmap.height - cropSize / 2,
        ))
        const outputSize = Math.max(1, Math.min(MAX_CROP_OUTPUT_EDGE, Math.floor(cropSize)))
        const canvas = document.createElement('canvas')
        canvas.width = outputSize
        canvas.height = outputSize
        const context = canvas.getContext('2d')
        if (!context) {
            throw new Error('IMAGE_PROCESSING_FAILED')
        }

        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = 'high'
        context.drawImage(
            bitmap,
            sourceX,
            sourceY,
            cropSize,
            cropSize,
            0,
            0,
            outputSize,
            outputSize,
        )

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/webp', 0.92)
        })
        if (!blob) {
            throw new Error('IMAGE_PROCESSING_FAILED')
        }

        const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
        return new File([blob], `${baseName}-crop.webp`, {
            type: 'image/webp',
            lastModified: Date.now(),
        })
    } finally {
        bitmap.close()
    }
}
