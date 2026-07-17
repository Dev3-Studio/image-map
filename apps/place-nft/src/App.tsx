import './App.css'
import {useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent} from 'react'
import {
    TransformComponent,
    TransformWrapper,
    type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import coordsjson from './assets/coords.json'
import ImageOverlay from './ImageOverlay.tsx'
import IIIFImageLayer from './IIIFImageLayer.tsx'
import {loadIIIFManifest, type IIIFMapDefinition} from './iiifManifest.ts'
import {loadStressTestMap} from './stressTestMap.ts'
import Toolbar from './Toolbar.tsx'
import {
    Minimap,
    PickModeOverlay,
    TesseraHeader,
    UploadDialog,
} from './TesseraChrome.tsx'

const FALLBACK_MAP_SIZE = 768
const MIN_SCALE = 0.04
const MAX_SCALE = 8
const HIGH_RESOLUTION_ZOOM = 1.1
const JUMP_TO_TILE_VIEWPORT_RATIO = 0.6

type DetailLevel = 'preview' | 'iiif'

interface Point {
    x: number
    y: number
}

interface ImageCoords extends Point {
    width: number
    height?: number
}

interface UploadedTile extends Point {
    id: number
    url: string
    width: number
}

interface ViewportState {
    positionX: number
    positionY: number
    scale: number
}

interface LocationViewportState {
    centerX: number
    centerY: number
    scale: number
}

const fallbackCoordsList = coordsjson as ImageCoords[]

function getLocationState(coordsList: ImageCoords[]) {
    const tileMatch = window.location.pathname.match(/^\/tile\/(\d+)\/?$/)
    const rawTileIndex = tileMatch ? Number.parseInt(tileMatch[1], 10) : null
    const params = new URLSearchParams(window.location.search)
    const centerX = Number(params.get('cx'))
    const centerY = Number(params.get('cy'))
    const scale = Number(params.get('z'))
    const viewport = params.has('cx') && params.has('cy') && params.has('z') &&
        Number.isFinite(centerX) && Number.isFinite(centerY) &&
        Number.isFinite(scale) && scale >= MIN_SCALE && scale <= MAX_SCALE
        ? {centerX, centerY, scale}
        : null

    return {
        tileIndex: rawTileIndex !== null && coordsList[rawTileIndex] ? rawTileIndex : null,
        viewport,
        error: rawTileIndex !== null && !coordsList[rawTileIndex]
            ? `Choose a tile between #0 and #${coordsList.length - 1}.`
            : null,
    }
}

function updateLocation(
    tileIndex: number | null,
    viewport: ViewportState,
    wrapper: HTMLElement,
    mode: 'push' | 'replace',
) {
    const params = new URLSearchParams({
        cx: String(Math.round(((wrapper.offsetWidth / 2 - viewport.positionX) / viewport.scale) * 100) / 100),
        cy: String(Math.round(((wrapper.offsetHeight / 2 - viewport.positionY) / viewport.scale) * 100) / 100),
        z: String(Math.round(viewport.scale * 10000) / 10000),
    })
    const demo = new URLSearchParams(window.location.search).get('demo')
    if (demo) {
        params.set('demo', demo)
    }
    const nextUrl = `${tileIndex === null ? '/' : `/tile/${tileIndex}`}?${params}`

    if (`${window.location.pathname}${window.location.search}` === nextUrl) {
        return
    }

    window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', nextUrl)
}

function TesseraMap({
    mapDefinition,
    manifestReady,
}: {
    mapDefinition: IIIFMapDefinition
    manifestReady: boolean
}) {
    const transformRef = useRef<ReactZoomPanPinchRef | null>(null)
    const pointerDownRef = useRef<Point | null>(null)
    const zoomLabelRef = useRef<HTMLSpanElement | null>(null)
    const minimapViewportRef = useRef<HTMLDivElement | null>(null)
    const selectionMarkerRef = useRef<HTMLDivElement | null>(null)
    const locationUpdateTimeoutRef = useRef<number | null>(null)
    const activeTileIndexRef = useRef<number | null>(null)
    const [activeTileIndex, setActiveTileIndex] = useState<number | null>(null)
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
    const [searchError, setSearchError] = useState<string | null>(null)
    const [guidanceVisible, setGuidanceVisible] = useState(true)
    const [usesTouchGestures] = useState(() => window.matchMedia('(pointer: coarse)').matches)
    const [detailLevel, setDetailLevel] = useState<DetailLevel>('preview')
    const [picking, setPicking] = useState(false)
    const [uploadOpen, setUploadOpen] = useState(false)
    const [pickPoint, setPickPoint] = useState<Point>({x: 0, y: 0})
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [uploads, setUploads] = useState<UploadedTile[]>([])
    const coordsList = mapDefinition.placements

    const positionSelectionMarker = useCallback((viewport: ViewportState) => {
        const marker = selectionMarkerRef.current
        const coords = activeTileIndex === null ? null : coordsList[activeTileIndex]
        if (!marker || !coords) {
            return
        }

        const left = viewport.positionX + coords.x * viewport.scale
        const top = viewport.positionY + coords.y * viewport.scale
        marker.style.transform = `translate3d(${left}px, ${top}px, 0)`
        marker.style.width = `${coords.width * viewport.scale}px`
        marker.style.height = `${(coords.height ?? coords.width) * viewport.scale}px`
        marker.classList.toggle('tile-selection-marker--label-below', top < 56)
    }, [activeTileIndex, coordsList])

    const focusTile = useCallback((
        index: number,
        historyMode: 'push' | 'replace' | null,
        locationViewport: LocationViewportState | null = null,
        transformOverride?: ReactZoomPanPinchRef,
    ) => {
        const coords = coordsList[index]
        const transform = transformOverride ?? transformRef.current
        const wrapper = transform?.instance.wrapperComponent
        if (!coords || !transform || !wrapper) {
            return
        }

        const nextViewport = locationViewport ? {
            positionX: wrapper.offsetWidth / 2 - locationViewport.centerX * locationViewport.scale,
            positionY: wrapper.offsetHeight / 2 - locationViewport.centerY * locationViewport.scale,
            scale: locationViewport.scale,
        } : (() => {
            const scale = Math.min(
                MAX_SCALE,
                Math.max(
                    MIN_SCALE,
                    Math.min(wrapper.offsetWidth, wrapper.offsetHeight) *
                        JUMP_TO_TILE_VIEWPORT_RATIO / Math.max(coords.width, coords.height),
                ),
            )

            return {
                positionX: wrapper.offsetWidth / 2 - (coords.x + coords.width / 2) * scale,
                positionY: wrapper.offsetHeight / 2 - (coords.y + coords.height / 2) * scale,
                scale,
            }
        })()

        activeTileIndexRef.current = index
        setActiveTileIndex(index)
        setSelectedImageIndex(null)
        setSearchError(null)
        if (historyMode) {
            updateLocation(index, nextViewport, wrapper, historyMode)
        }
        transform.setTransform(
            nextViewport.positionX,
            nextViewport.positionY,
            nextViewport.scale,
            locationViewport ? 0 : 420,
            'easeOut',
        )
    }, [coordsList])

    const restoreLocation = useCallback((transformOverride?: ReactZoomPanPinchRef) => {
        const {tileIndex, viewport, error} = getLocationState(coordsList)
        setSearchError(error)
        setSelectedImageIndex(null)

        if (tileIndex !== null) {
            focusTile(tileIndex, null, viewport, transformOverride)
            return
        }

        activeTileIndexRef.current = null
        setActiveTileIndex(null)
        const transform = transformOverride ?? transformRef.current
        const wrapper = transform?.instance.wrapperComponent
        if (viewport && transform && wrapper) {
            transform.setTransform(
                wrapper.offsetWidth / 2 - viewport.centerX * viewport.scale,
                wrapper.offsetHeight / 2 - viewport.centerY * viewport.scale,
                viewport.scale,
                0,
                'easeOut',
            )
        } else if (transform) {
            const wrapper = transform.instance.wrapperComponent
            const fitScale = wrapper
                ? Math.max(
                    MIN_SCALE,
                    Math.min(
                        MAX_SCALE,
                        Math.min(
                            wrapper.offsetWidth / mapDefinition.width,
                            wrapper.offsetHeight / mapDefinition.height,
                        ) * 0.94,
                    ),
                )
                : MIN_SCALE
            transform.centerView(fitScale, 0, 'easeOut')
        }
    }, [coordsList, focusTile, mapDefinition.height, mapDefinition.width])

    useEffect(() => {
        const handlePopState = () => restoreLocation()
        window.addEventListener('popstate', handlePopState)

        return () => window.removeEventListener('popstate', handlePopState)
    }, [restoreLocation])

    useEffect(() => {
        const state = transformRef.current?.state
        if (state) {
            positionSelectionMarker(state)
        }
    }, [activeTileIndex, positionSelectionMarker])

    useEffect(() => () => {
        if (locationUpdateTimeoutRef.current !== null) {
            window.clearTimeout(locationUpdateTimeoutRef.current)
        }
    }, [])

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
                point.y < coords.y + coords.height
            ) {
                activeTileIndexRef.current = index
                setActiveTileIndex(index)
                setSelectedImageIndex(index)
                const wrapper = transformRef.current?.instance.wrapperComponent
                if (wrapper) {
                    updateLocation(index, state, wrapper, 'push')
                }
                return
            }
        }
    }

    return (
        <main className="tessera-app">
            <div
                className={`map ${picking ? 'map--picking' : ''}`}
                onClick={handleMapClick}
                onWheelCapture={() => setGuidanceVisible(false)}
                onPointerDownCapture={(event) => {
                    setGuidanceVisible(false)
                    pointerDownRef.current = {x: event.clientX, y: event.clientY}
                }}
            >
                <TransformWrapper
                    ref={transformRef}
                    limitToBounds={false}
                    minScale={MIN_SCALE}
                    maxScale={MAX_SCALE}
                    initialScale={MIN_SCALE}
                    smooth={false}
                    doubleClick={{disabled: true}}
                    wheel={{step: 0.15}}
                    onInit={(ref) => restoreLocation(ref)}
                    onTransform={(ref) => {
                        const {positionX, positionY, scale} = ref.state
                        positionSelectionMarker(ref.state)
                        const nextDetailLevel = scale >= HIGH_RESOLUTION_ZOOM
                            ? 'iiif'
                            : 'preview'

                        setDetailLevel((currentDetailLevel) =>
                            currentDetailLevel === nextDetailLevel
                                ? currentDetailLevel
                                : nextDetailLevel)

                        if (zoomLabelRef.current) {
                            zoomLabelRef.current.textContent = `${Math.round(scale * 100)}%`
                        }

                        if (minimapViewportRef.current) {
                            const minimapSize = minimapViewportRef.current.parentElement?.clientWidth
                                ?? (window.innerWidth < 640 ? 84 : 148)
                            const left = Math.max(0, Math.min(minimapSize - 8, (-positionX / scale / mapDefinition.width) * minimapSize))
                            const top = Math.max(0, Math.min(minimapSize - 8, (-positionY / scale / mapDefinition.height) * minimapSize))
                            const width = Math.max(8, Math.min(minimapSize, (window.innerWidth / scale / mapDefinition.width) * minimapSize))
                            const height = Math.max(8, Math.min(minimapSize, (window.innerHeight / scale / mapDefinition.height) * minimapSize))
                            minimapViewportRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`
                            minimapViewportRef.current.style.width = `${width}px`
                            minimapViewportRef.current.style.height = `${height}px`
                        }

                        if (locationUpdateTimeoutRef.current !== null) {
                            window.clearTimeout(locationUpdateTimeoutRef.current)
                        }
                        locationUpdateTimeoutRef.current = window.setTimeout(() => {
                            const wrapper = ref.instance.wrapperComponent
                            if (wrapper) {
                                updateLocation(
                                    activeTileIndexRef.current,
                                    {positionX, positionY, scale},
                                    wrapper,
                                    'replace',
                                )
                            }
                        }, 180)
                    }}
                >
                    <TransformComponent wrapperClass="transformWrapper" contentClass="transformComponent">
                        <picture
                            className="collage-picture"
                            style={{width: mapDefinition.width, height: mapDefinition.height}}
                        >
                            <img
                                src={mapDefinition.previewUrl}
                                alt="Tessera collage map"
                                id="collage"
                                fetchPriority="high"
                                draggable={false}
                                style={{width: mapDefinition.width, height: mapDefinition.height}}
                            />
                        </picture>
                        <IIIFImageLayer
                            visible={detailLevel === 'iiif'}
                            placements={mapDefinition.placements}
                            manifestReady={manifestReady}
                        />
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

            {guidanceVisible && !picking && !uploadOpen ? (
                <div className="glass-surface map-guidance" role="status">
                    Drag to explore <span aria-hidden="true">·</span>{' '}
                    {usesTouchGestures ? 'Pinch' : 'Scroll'} to zoom
                </div>
            ) : null}

            {activeTileIndex !== null && !picking && !uploadOpen ? (
                <div
                    key={`marker-${activeTileIndex}`}
                    ref={selectionMarkerRef}
                    className="tile-selection-marker"
                    aria-live="polite"
                >
                    <span>Tile #{activeTileIndex}</span>
                </div>
            ) : null}

            {!picking && !uploadOpen ? (
                <TesseraHeader
                    key={`header-${activeTileIndex ?? 'none'}`}
                    activeTileIndex={activeTileIndex}
                    externalError={searchError}
                    tileCount={coordsList.length}
                    onClearError={() => setSearchError(null)}
                    onSearch={(index) => {
                        setGuidanceVisible(false)
                        focusTile(index, 'push')
                    }}
                />
            ) : null}

            {!picking && !uploadOpen ? (
                <Minimap
                    viewportRef={minimapViewportRef}
                    onNavigate={(event) => {
                        setGuidanceVisible(false)
                        const transform = transformRef.current
                        if (!transform) {
                            return
                        }

                        const bounds = event.currentTarget.getBoundingClientRect()
                        const x = ((event.clientX - bounds.left) / bounds.width) * mapDefinition.width
                        const y = ((event.clientY - bounds.top) / bounds.height) * mapDefinition.height
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
                    imageUrl={coordsList[selectedImageIndex].thumbnail ?? '/collage.webp'}
                    title={`Tile #${String(selectedImageIndex).padStart(4, '0')}`}
                    tileCount={coordsList.length}
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

function App() {
    const useShowcase = new URLSearchParams(window.location.search).get('demo') === 'showcase'
    const [mapState, setMapState] = useState<{
        definition: IIIFMapDefinition
        manifestReady: boolean
    } | null>(null)

    useEffect(() => {
        let cancelled = false

        const loadMap = useShowcase ? loadIIIFManifest : loadStressTestMap
        loadMap()
            .then((definition) => {
                if (!cancelled) {
                    setMapState({definition, manifestReady: true})
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setMapState({
                        definition: {
                            width: FALLBACK_MAP_SIZE,
                            height: FALLBACK_MAP_SIZE,
                            previewUrl: '/collage.webp',
                            placements: fallbackCoordsList.map((coords, index) => ({
                                ...coords,
                                height: coords.width,
                                id: `fallback-${index}`,
                            })),
                        },
                        manifestReady: false,
                    })
                }
            })

        return () => {
            cancelled = true
        }
    }, [useShowcase])

    if (!mapState) {
        return (
            <main className="tessera-app map-loading" aria-busy="true">
                <img
                    src={useShowcase ? '/collage.webp' : '/collage-stress.webp'}
                    alt="Preparing the Tessera collage map"
                />
            </main>
        )
    }

    return (
        <TesseraMap
            mapDefinition={mapState.definition}
            manifestReady={mapState.manifestReady}
        />
    )
}

export default App
