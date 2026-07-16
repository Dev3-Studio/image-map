interface IIIFTileProfile {
    width: number
    height?: number
    scaleFactors: number[]
}

export interface IIIFImageService {
    id: string
    type: 'ImageService3'
    width: number
    height: number
    tiles: IIIFTileProfile[]
}

interface IIIFAnnotation {
    id: string
    target: string
    body: {
        id?: string
        service?: IIIFImageService[]
    }
}

interface IIIFManifest {
    items?: Array<{
        width?: number
        height?: number
        items?: Array<{
            items?: IIIFAnnotation[]
        }>
    }>
}

export interface IIIFPlacement {
    id: string
    x: number
    y: number
    width: number
    height: number
    service?: IIIFImageService
    thumbnail?: string
}

export interface IIIFMapDefinition {
    width: number
    height: number
    placements: IIIFPlacement[]
}

export function loadIIIFManifest(url: string) {
    return fetch(url)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`IIIF manifest request failed with ${response.status}`)
            }

            return response.json() as Promise<IIIFManifest>
        })
        .then((manifest) => {
            const canvas = manifest.items?.[0]
            const annotations = canvas?.items?.[0]?.items ?? []
            const placements = annotations.flatMap((annotation) => {
                const match = annotation.target.match(/#xywh=([\d.]+),([\d.]+),([\d.]+),([\d.]+)$/)
                const service = annotation.body.service?.find((candidate) =>
                    candidate.type === 'ImageService3' &&
                    candidate.width > 0 &&
                    candidate.height > 0 &&
                    candidate.tiles?.[0]?.scaleFactors.length > 0)

                if (!match || !service) {
                    return []
                }

                const [, rawX, rawY, rawWidth, rawHeight] = match
                return [{
                    id: annotation.id,
                    x: Number(rawX),
                    y: Number(rawY),
                    width: Number(rawWidth),
                    height: Number(rawHeight),
                    service,
                    thumbnail: annotation.body.id,
                }]
            })

            if (!canvas?.width || !canvas.height || placements.length === 0) {
                throw new Error('IIIF manifest does not contain a usable canvas')
            }

            return {
                width: canvas.width,
                height: canvas.height,
                placements,
            }
        })
}
