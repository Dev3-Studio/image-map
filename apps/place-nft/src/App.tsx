import collage from '/collage.webp'
import './App.css'
import {useRef, useState, type MouseEvent as ReactMouseEvent} from 'react'
import {
    TransformComponent,
    TransformWrapper,
    type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import coordsjson from './assets/coords.json'
import ImageOverlay from './ImageOverlay.tsx'
import ImageGrid from './ImageGrid.tsx'
import Toolbar from './Toolbar.tsx'
import {
    Minimap,
    PickModeOverlay,
    TesseraHeader,
    UploadDialog,
} from './TesseraChrome.tsx'
import {HIGH_RESOLUTION_TILE_URLS} from './imageTiles.ts'

const MAP_SIZE = 7680
const HIGH_RESOLUTION_ZOOM = 1.1
const HIGH_RESOLUTION_PRELOAD_ORDER = [4, 1, 3, 5, 7, 0, 2, 6, 8]
const preloadedHighResolutionImages: HTMLImageElement[] = []

interface Point {
    x: number
    y: number
}

interface ImageCoords extends Point {
    width: number
}

interface UploadedTile extends Point {
    id: number
    url: string
    width: number
}

const coordsList = coordsjson as ImageCoords[]

function App() {
    const transformRef = useRef<ReactZoomPanPinchRef | null>(null)
    const pointerDownRef = useRef<Point | null>(null)
    const zoomLabelRef = useRef<HTMLSpanElement | null>(null)
    const minimapViewportRef = useRef<HTMLDivElement | null>(null)
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
    const [showHighResolution, setShowHighResolution] = useState(false)
    const [picking, setPicking] = useState(false)
    const [uploadOpen, setUploadOpen] = useState(false)
    const [pickPoint, setPickPoint] = useState<Point>({x: 0, y: 0})
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [uploads, setUploads] = useState<UploadedTile[]>([])

    const handleMapClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        const pointerDown = pointerDownRef.current
        if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) {
            return
        }

        const state = transformRef.current?.state
        if (!state) {
            return
        }

        const point = {
            x: (event.clientX - state.positionX) / state.scale,
            y: (event.clientY - state.positionY) / state.scale,
        }

        if (picking) {
            setPickPoint(point)
            setPicking(false)
            setUploadOpen(true)
            return
        }

        for (let index = 0; index < coordsList.length; index += 1) {
            const coords = coordsList[index]
            if (
                point.x > coords.x &&
                point.x < coords.x + coords.width &&
                point.y > coords.y &&
                point.y < coords.y + coords.width
            ) {
                setSelectedImageIndex(index)
                return
            }
        }
    }

    return (
        <main className="tessera-app">
            <div
                className={`map ${picking ? 'map--picking' : ''}`}
                onClick={handleMapClick}
                onPointerDownCapture={(event) => {
                    pointerDownRef.current = {x: event.clientX, y: event.clientY}
                }}
            >
                <TransformWrapper
                    ref={transformRef}
                    limitToBounds={false}
                    minScale={0.08}
                    maxScale={8}
                    initialScale={1}
                    centerOnInit
                    doubleClick={{disabled: true}}
                    wheel={{step: 0.15}}
                    onTransform={(ref) => {
                        const {positionX, positionY, scale} = ref.state
                        setShowHighResolution((visible) => {
                            const shouldShow = scale >= HIGH_RESOLUTION_ZOOM
                            return visible === shouldShow ? visible : shouldShow
                        })

                        if (zoomLabelRef.current) {
                            zoomLabelRef.current.textContent = `${Math.round(scale * 100)}%`
                        }

                        if (minimapViewportRef.current) {
                            const minimapSize = window.innerWidth <= 720 ? 104 : 148
                            const left = Math.max(0, Math.min(minimapSize - 8, (-positionX / scale / MAP_SIZE) * minimapSize))
                            const top = Math.max(0, Math.min(minimapSize - 8, (-positionY / scale / MAP_SIZE) * minimapSize))
                            const width = Math.max(8, Math.min(minimapSize, (window.innerWidth / scale / MAP_SIZE) * minimapSize))
                            const height = Math.max(8, Math.min(minimapSize, (window.innerHeight / scale / MAP_SIZE) * minimapSize))
                            minimapViewportRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`
                            minimapViewportRef.current.style.width = `${width}px`
                            minimapViewportRef.current.style.height = `${height}px`
                        }
                    }}
                >
                    <TransformComponent wrapperClass="transformWrapper" contentClass="transformComponent">
                        <img
                            src={collage}
                            alt="Tessera collage map"
                            id="collage"
                            draggable={false}
                            onLoad={() => {
                                if (preloadedHighResolutionImages.length > 0) {
                                    return
                                }

                                HIGH_RESOLUTION_PRELOAD_ORDER.forEach((index) => {
                                    const image = new Image()
                                    image.decoding = 'async'
                                    image.fetchPriority = 'low'
                                    image.src = HIGH_RESOLUTION_TILE_URLS[index]
                                    preloadedHighResolutionImages.push(image)
                                })
                            }}
                        />
                        <ImageGrid visible={showHighResolution}/>
                        {uploads.map((upload) => (
                            <img
                                key={upload.id}
                                className="uploaded-tile"
                                src={upload.url}
                                alt="Your upload"
                                draggable={false}
                                style={{
                                    left: upload.x,
                                    top: upload.y,
                                    width: upload.width,
                                    height: upload.width,
                                }}
                            />
                        ))}
                    </TransformComponent>
                    {!picking && !uploadOpen ? (
                        <Toolbar
                            zoomLabelRef={zoomLabelRef}
                            onStartPick={() => {
                                setPicking(true)
                                setSelectedImageIndex(null)
                            }}
                        />
                    ) : null}
                </TransformWrapper>
            </div>

            {!picking && !uploadOpen ? (
                <TesseraHeader
                    onSearch={(index) => {
                        const coords = coordsList[index]
                        const transform = transformRef.current
                        if (!coords || !transform) {
                            return
                        }

                        const scale = Math.max(transform.state.scale, 1.2)
                        transform.setTransform(
                            window.innerWidth / 2 - (coords.x + coords.width / 2) * scale,
                            window.innerHeight / 2 - (coords.y + coords.width / 2) * scale,
                            scale,
                            420,
                            'easeOut',
                        )
                        setSelectedImageIndex(index)
                    }}
                />
            ) : null}

            {!picking && !uploadOpen ? (
                <Minimap
                    viewportRef={minimapViewportRef}
                    onNavigate={(event) => {
                        const transform = transformRef.current
                        if (!transform) {
                            return
                        }

                        const bounds = event.currentTarget.getBoundingClientRect()
                        const x = ((event.clientX - bounds.left) / bounds.width) * MAP_SIZE
                        const y = ((event.clientY - bounds.top) / bounds.height) * MAP_SIZE
                        const scale = transform.state.scale
                        transform.setTransform(
                            window.innerWidth / 2 - x * scale,
                            window.innerHeight / 2 - y * scale,
                            scale,
                            420,
                            'easeOut',
                        )
                    }}
                />
            ) : null}

            {picking ? (
                <PickModeOverlay onCancel={() => setPicking(false)}/>
            ) : null}

            {selectedImageIndex !== null && !picking && !uploadOpen ? (
                <ImageOverlay
                    filename={`${selectedImageIndex % 6}.jpg`}
                    title={`Tile #${String(selectedImageIndex).padStart(4, '0')}`}
                    onClick={() => setSelectedImageIndex(null)}
                />
            ) : null}

            {uploadOpen ? (
                <UploadDialog
                    pickPoint={pickPoint}
                    previewUrl={previewUrl}
                    onFile={(file) => {
                        if (file) {
                            setPreviewUrl(URL.createObjectURL(file))
                        }
                    }}
                    onCancel={() => {
                        setUploadOpen(false)
                        setPreviewUrl(null)
                    }}
                    onMint={() => {
                        if (!previewUrl) {
                            return
                        }

                        setUploads((current) => [
                            ...current,
                            {
                                id: Date.now(),
                                url: previewUrl,
                                x: pickPoint.x - 120,
                                y: pickPoint.y - 120,
                                width: 240,
                            },
                        ])
                        setUploadOpen(false)
                        setPreviewUrl(null)
                    }}
                />
            ) : null}
        </main>
    )
}

export default App
