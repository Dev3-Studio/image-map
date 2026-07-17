import {useEffect, useRef, useState} from 'react'
import {useTransformContext} from 'react-zoom-pan-pinch'
import {type IIIFPlacement} from './iiifManifest.ts'
import './IIIFImageLayer.css'

const PRELOAD_MARGIN = 384

interface RenderedTile {
    id: string
    src: string
    x: number
    y: number
    width: number
    height: number
}

function IIIFImageLayer({
    visible,
    placements,
    manifestReady,
}: {
    visible: boolean
    placements: IIIFPlacement[]
    manifestReady: boolean
}) {
    const transformContext = useTransformContext()
    const tileKeysRef = useRef('')
    const [tiles, setTiles] = useState<RenderedTile[]>([])

    useEffect(() => {
        let animationFrame: number | null = null

        const updateVisibleTiles = () => {
            if (animationFrame !== null) {
                return
            }

            animationFrame = window.requestAnimationFrame(() => {
                animationFrame = null

                if (!visible || placements.length === 0) {
                    if (tileKeysRef.current) {
                        tileKeysRef.current = ''
                        setTiles([])
                    }
                    return
                }

                const wrapper = transformContext.wrapperComponent
                if (!wrapper) {
                    return
                }

                const {positionX, positionY, scale} = transformContext.state
                const margin = PRELOAD_MARGIN / scale
                const viewLeft = -positionX / scale - margin
                const viewTop = -positionY / scale - margin
                const viewRight = (-positionX + wrapper.offsetWidth) / scale + margin
                const viewBottom = (-positionY + wrapper.offsetHeight) / scale + margin
                const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
                const nextTiles: RenderedTile[] = []

                placements.forEach((placement) => {
                    if (
                        placement.x >= viewRight ||
                        placement.x + placement.width <= viewLeft ||
                        placement.y >= viewBottom ||
                        placement.y + placement.height <= viewTop
                    ) {
                        return
                    }

                    const {service, thumbnail} = placement
                    if (!service) {
                        if (thumbnail) {
                            nextTiles.push({
                                id: placement.id,
                                src: thumbnail,
                                x: placement.x,
                                y: placement.y,
                                width: placement.width,
                                height: placement.height,
                            })
                        }
                        return
                    }
                    const tileProfile = service.tiles[0]
                    const tileHeight = tileProfile.height ?? tileProfile.width
                    const idealFactor = Math.min(
                        service.width / (placement.width * scale * pixelRatio),
                        service.height / (placement.height * scale * pixelRatio),
                    )
                    let factor = 1
                    tileProfile.scaleFactors.forEach((candidate) => {
                        if (candidate <= idealFactor && candidate > factor) {
                            factor = candidate
                        }
                    })

                    const sourceStepX = tileProfile.width * factor
                    const sourceStepY = tileHeight * factor
                    const columns = Math.ceil(service.width / sourceStepX)
                    const rows = Math.ceil(service.height / sourceStepY)
                    const firstColumn = Math.max(0, Math.floor(
                        ((viewLeft - placement.x) / placement.width * service.width) / sourceStepX,
                    ))
                    const lastColumn = Math.min(columns - 1, Math.floor(
                        ((viewRight - placement.x) / placement.width * service.width) / sourceStepX,
                    ))
                    const firstRow = Math.max(0, Math.floor(
                        ((viewTop - placement.y) / placement.height * service.height) / sourceStepY,
                    ))
                    const lastRow = Math.min(rows - 1, Math.floor(
                        ((viewBottom - placement.y) / placement.height * service.height) / sourceStepY,
                    ))
                    const serviceUrl = new URL(service.id, window.location.href)
                        .toString()
                        .replace(/\/$/, '')

                    for (let row = firstRow; row <= lastRow; row += 1) {
                        for (let column = firstColumn; column <= lastColumn; column += 1) {
                            const regionX = column * sourceStepX
                            const regionY = row * sourceStepY
                            const regionWidth = Math.min(sourceStepX, service.width - regionX)
                            const regionHeight = Math.min(sourceStepY, service.height - regionY)
                            const outputWidth = Math.ceil(regionWidth / factor)
                            const outputHeight = Math.ceil(regionHeight / factor)
                            const region = `${regionX},${regionY},${regionWidth},${regionHeight}`
                            const size = `${outputWidth},${outputHeight}`
                            nextTiles.push({
                                id: `${placement.id}-${factor}-${column}-${row}`,
                                src: `${serviceUrl}/${region}/${size}/0/default.jpg`,
                                x: placement.x + regionX / service.width * placement.width,
                                y: placement.y + regionY / service.height * placement.height,
                                width: regionWidth / service.width * placement.width,
                                height: regionHeight / service.height * placement.height,
                            })
                        }
                    }
                })

                const nextTileKeys = nextTiles.map((tile) => tile.id).join('|')
                if (tileKeysRef.current !== nextTileKeys) {
                    tileKeysRef.current = nextTileKeys
                    setTiles(nextTiles)
                }
            })
        }

        updateVisibleTiles()
        const unsubscribe = transformContext.onChange(updateVisibleTiles)
        window.addEventListener('resize', updateVisibleTiles)

        return () => {
            unsubscribe()
            window.removeEventListener('resize', updateVisibleTiles)
            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame)
            }
        }
    }, [placements, transformContext, visible])

    return (
        <div
            id="iiifImageLayer"
            aria-hidden={true}
            data-iiif-state={manifestReady ? 'ready' : 'loading'}
            data-iiif-placement-count={placements.length}
            data-visible-tile-count={tiles.length}
        >
            {tiles.map((tile) => (
                <img
                    key={tile.id}
                    className="iiif-image-tile"
                    src={tile.src}
                    alt=""
                    decoding="async"
                    draggable={false}
                    style={{
                        left: tile.x,
                        top: tile.y,
                        width: tile.width,
                        height: tile.height,
                    }}
                />
            ))}
        </div>
    )
}

export default IIIFImageLayer
