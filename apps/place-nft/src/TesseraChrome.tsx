import {useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type RefObject} from 'react'
import {createSquareCrop, type CropSelection} from './imageCrop.ts'
import './TesseraChrome.css'

interface Point {
    x: number
    y: number
}

export function TesseraHeader({
    activeTileIndex,
    demoMode,
    externalError,
    tileCount,
    onClearError,
    onSearch,
}: {
    activeTileIndex: number | null
    demoMode: boolean
    externalError: string | null
    tileCount: number
    onClearError: () => void
    onSearch: (index: number) => void
}) {
    const [query, setQuery] = useState(activeTileIndex === null ? '' : `#${activeTileIndex}`)
    const [localError, setLocalError] = useState<string | null>(null)
    const [focused, setFocused] = useState(false)
    const error = localError ?? externalError
    const suggestions = useMemo(() => {
        const match = query.trim().match(/^#?\s*(\d+)$/)
        if (!match) {
            return []
        }

        const exactIndex = Number.parseInt(match[1], 10)
        if (exactIndex < 0 || exactIndex >= tileCount) {
            return []
        }

        const nextIndexes = [exactIndex]
        if (match[1].length < String(tileCount - 1).length) {
            const prefix = Number.parseInt(`${match[1]}0`, 10)
            for (let index = prefix; index < Math.min(prefix + 4, tileCount); index += 1) {
                if (!nextIndexes.includes(index)) {
                    nextIndexes.push(index)
                }
            }
        }

        return nextIndexes.slice(0, 5)
    }, [query, tileCount])

    const submitSearch = () => {
        const match = query.trim().match(/^#?\s*(\d+)$/)
        if (!match) {
            setLocalError('Enter a tile number, such as #4281.')
            return
        }

        const index = Number.parseInt(match[1], 10)
        if (index < 0 || index >= tileCount) {
            setLocalError(`Choose a tile between #0 and #${tileCount - 1}.`)
            return
        }

        setLocalError(null)
        onClearError()
        setFocused(false)
        setQuery(`#${index}`)
        onSearch(index)
    }

    return (
        <header className="tessera-header">
            <div className="glass-surface brand-capsule">
                <span className="brand-mark" aria-hidden="true"/>
                <span className="brand-wordmark">Tessera</span>
                {demoMode ? <span className="demo-mode-badge">Demo</span> : null}
            </div>
            <form
                className="glass-surface glow-surface search-capsule"
                onSubmit={(event) => {
                    event.preventDefault()
                    submitSearch()
                }}
                onPointerMove={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect()
                    event.currentTarget.style.setProperty('--glow-x', `${event.clientX - bounds.left}px`)
                    event.currentTarget.style.setProperty('--glow-y', `${event.clientY - bounds.top}px`)
                    event.currentTarget.classList.add('is-glowing')
                }}
                onPointerLeave={(event) => event.currentTarget.classList.remove('is-glowing')}
            >
                <span className="surface-glow" aria-hidden="true"/>
                <svg className="search-icon" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                    <circle cx="6.4" cy="6.4" r="4.6"/>
                    <line x1="10" y1="10" x2="13.6" y2="13.6"/>
                </svg>
                <input
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value)
                        setLocalError(null)
                        onClearError()
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault()
                            submitSearch()
                        }
                    }}
                    placeholder="Jump to tile #"
                    aria-label="Jump to tile number"
                    aria-autocomplete="list"
                    aria-controls="tile-search-suggestions"
                    aria-describedby={error ? 'tile-search-error' : undefined}
                    aria-expanded={focused && suggestions.length > 0}
                    aria-haspopup="listbox"
                    aria-invalid={error ? true : undefined}
                    role="combobox"
                    inputMode="numeric"
                />
                {focused && suggestions.length > 0 ? (
                    <div id="tile-search-suggestions" className="search-feedback search-suggestions" role="listbox">
                        {suggestions.map((index) => (
                            <button
                                key={index}
                                type="button"
                                role="option"
                                aria-selected={index === activeTileIndex}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    setQuery(`#${index}`)
                                    setLocalError(null)
                                    onClearError()
                                    setFocused(false)
                                    onSearch(index)
                                }}
                            >
                                <span>Tile #{index}</span>
                                <small>Jump to tile</small>
                            </button>
                        ))}
                    </div>
                ) : null}
                {error ? (
                    <div id="tile-search-error" className="search-feedback search-error" role="alert">
                        {error}
                    </div>
                ) : null}
            </form>
        </header>
    )
}

export function Minimap({
    imageUrl,
    imageAvifUrl,
    viewportRef,
    onNavigate,
}: {
    imageUrl: string
    imageAvifUrl?: string
    viewportRef: RefObject<HTMLDivElement | null>
    onNavigate: (xRatio: number, yRatio: number) => void
}) {
    const [dragging, setDragging] = useState(false)
    const navigateToPointer = (event: PointerEvent<HTMLButtonElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        onNavigate(
            Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
            Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
        )
    }

    return (
        <button
            className={`minimap ${dragging ? 'minimap--dragging' : ''}`}
            type="button"
            title="Drag to navigate the minimap"
            onClick={(event) => {
                if (event.detail === 0) {
                    onNavigate(0.5, 0.5)
                }
            }}
            onPointerDown={(event) => {
                if (event.button !== 0) {
                    return
                }

                event.preventDefault()
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragging(true)
                navigateToPointer(event)
            }}
            onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    navigateToPointer(event)
                }
            }}
            onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    navigateToPointer(event)
                    event.currentTarget.releasePointerCapture(event.pointerId)
                }
                setDragging(false)
            }}
            onPointerCancel={() => setDragging(false)}
            onLostPointerCapture={() => setDragging(false)}
        >
            <picture>
                {imageAvifUrl ? <source type="image/avif" srcSet={imageAvifUrl}/> : null}
                <img className="minimap-image" src={imageUrl} alt="" aria-hidden={true} draggable={false}/>
            </picture>
            <span className="minimap-wash" aria-hidden="true"/>
            <span ref={viewportRef} className="minimap-viewport" aria-hidden="true"/>
            <span className="sr-only">Drag to navigate the collage minimap</span>
        </button>
    )
}

export function PickModeOverlay({onCancel}: {onCancel: () => void}) {
    return (
        <div className="pick-mode" aria-live="polite">
            <div className="pick-mode-shade"/>
            <div className="glass-surface pick-instruction">Pick a spot for your image</div>
            <button className="glass-surface pick-cancel" type="button" onClick={onCancel}>Cancel</button>
        </div>
    )
}

const MIN_CROP_EDGE = 960

interface CropSource {
    file: File
    url: string
}

function clampCropCenter(
    selection: CropSelection,
    width: number,
    height: number,
    zoom = selection.zoom,
) {
    const cropSize = Math.min(width, height) / zoom
    const minX = cropSize / 2 / width
    const minY = cropSize / 2 / height

    return {
        centerX: Math.max(minX, Math.min(1 - minX, selection.centerX)),
        centerY: Math.max(minY, Math.min(1 - minY, selection.centerY)),
        zoom,
    }
}

function SquareCropEditor({
    source,
    cropApplied,
    moderationStatus,
    onApply,
    onChoose,
    onInvalidate,
}: {
    source: CropSource
    cropApplied: boolean
    moderationStatus: 'idle' | 'checking' | 'approved' | 'blocked' | 'error'
    onApply: (file: File) => void | Promise<void>
    onChoose: (file: File | null) => void
    onInvalidate: () => void
}) {
    const frameRef = useRef<HTMLDivElement | null>(null)
    const activeRef = useRef(true)
    const cropVersionRef = useRef(0)
    const dragRef = useRef<{
        pointerId: number
        x: number
        y: number
        frameSize: number
        selection: CropSelection
    } | null>(null)
    const [imageSize, setImageSize] = useState({width: 0, height: 0})
    const [selection, setSelection] = useState<CropSelection>({centerX: 0.5, centerY: 0.5, zoom: 1})
    const [processing, setProcessing] = useState(false)
    const [cropError, setCropError] = useState<string | null>(null)
    const shortestEdge = Math.min(imageSize.width, imageSize.height)
    const maxZoom = Math.max(1, Math.min(3, shortestEdge / MIN_CROP_EDGE))
    const cropSize = shortestEdge > 0 ? shortestEdge / selection.zoom : 1
    const imageStyle = imageSize.width > 0 ? {
        width: `${imageSize.width / cropSize * 100}%`,
        height: `${imageSize.height / cropSize * 100}%`,
        left: `${50 - selection.centerX * imageSize.width / cropSize * 100}%`,
        top: `${50 - selection.centerY * imageSize.height / cropSize * 100}%`,
    } : undefined
    const canApply = shortestEdge >= MIN_CROP_EDGE && !processing && moderationStatus !== 'checking'

    useEffect(() => {
        activeRef.current = true
        return () => {
            activeRef.current = false
        }
    }, [])

    const invalidate = () => {
        cropVersionRef.current += 1
        if (moderationStatus !== 'idle') {
            onInvalidate()
        }
        setCropError(null)
    }

    const updateZoom = (zoom: number) => {
        invalidate()
        setSelection((current) => clampCropCenter(current, imageSize.width, imageSize.height, zoom))
    }

    return (
        <div className="crop-editor">
            <div
                ref={frameRef}
                className="crop-frame"
                role="group"
                tabIndex={0}
                aria-label="Square crop. Drag the image or use arrow keys to reposition it."
                onKeyDown={(event) => {
                    if (
                        !imageSize.width ||
                        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
                    ) {
                        return
                    }
                    event.preventDefault()
                    invalidate()
                    const xStep = cropSize / imageSize.width * 0.025
                    const yStep = cropSize / imageSize.height * 0.025
                    setSelection((current) => clampCropCenter({
                        ...current,
                        centerX: current.centerX + (event.key === 'ArrowLeft' ? xStep : event.key === 'ArrowRight' ? -xStep : 0),
                        centerY: current.centerY + (event.key === 'ArrowUp' ? yStep : event.key === 'ArrowDown' ? -yStep : 0),
                    }, imageSize.width, imageSize.height))
                }}
                onPointerDown={(event) => {
                    if (!imageSize.width || !frameRef.current) {
                        return
                    }
                    invalidate()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    dragRef.current = {
                        pointerId: event.pointerId,
                        x: event.clientX,
                        y: event.clientY,
                        frameSize: frameRef.current.getBoundingClientRect().width,
                        selection,
                    }
                    event.currentTarget.classList.add('crop-frame--dragging')
                }}
                onPointerMove={(event) => {
                    const drag = dragRef.current
                    if (!drag || drag.pointerId !== event.pointerId) {
                        return
                    }
                    const sourceCropSize = shortestEdge / drag.selection.zoom
                    setSelection(clampCropCenter({
                        ...drag.selection,
                        centerX: drag.selection.centerX -
                            (event.clientX - drag.x) / drag.frameSize * sourceCropSize / imageSize.width,
                        centerY: drag.selection.centerY -
                            (event.clientY - drag.y) / drag.frameSize * sourceCropSize / imageSize.height,
                    }, imageSize.width, imageSize.height))
                }}
                onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId)
                    }
                    dragRef.current = null
                    event.currentTarget.classList.remove('crop-frame--dragging')
                }}
                onPointerCancel={(event) => {
                    dragRef.current = null
                    event.currentTarget.classList.remove('crop-frame--dragging')
                }}
                onLostPointerCapture={(event) => {
                    dragRef.current = null
                    event.currentTarget.classList.remove('crop-frame--dragging')
                }}
            >
                <img
                    src={source.url}
                    alt="Image being cropped"
                    draggable={false}
                    style={imageStyle}
                    onLoad={(event) => {
                        const nextSize = {
                            width: event.currentTarget.naturalWidth,
                            height: event.currentTarget.naturalHeight,
                        }
                        setImageSize(nextSize)
                        setSelection({centerX: 0.5, centerY: 0.5, zoom: 1})
                        setCropError(null)
                    }}
                    onError={() => setCropError('This image could not be opened. Choose another file.')}
                />
                <span className="crop-grid" aria-hidden="true"/>
                <span className="crop-frame-border" aria-hidden="true"/>
            </div>
            <div className="crop-instruction">Drag to reposition · zoom to refine</div>
            <div className="crop-controls">
                <label className="crop-zoom">
                    <span>Zoom</span>
                    <input
                        type="range"
                        min="1"
                        max={maxZoom}
                        step="0.01"
                        value={Math.min(selection.zoom, maxZoom)}
                        disabled={shortestEdge < MIN_CROP_EDGE}
                        onChange={(event) => updateZoom(Number(event.currentTarget.value))}
                    />
                </label>
                <button
                    className="crop-reset"
                    type="button"
                    disabled={!imageSize.width}
                    onClick={() => {
                        invalidate()
                        setSelection({centerX: 0.5, centerY: 0.5, zoom: 1})
                    }}
                >
                    Reset
                </button>
            </div>
            {shortestEdge > 0 && shortestEdge < MIN_CROP_EDGE ? (
                <div className="crop-error" role="alert">
                    Choose an image at least {MIN_CROP_EDGE} px on its shortest side.
                </div>
            ) : cropError ? <div className="crop-error" role="alert">{cropError}</div> : null}
            <div className="crop-actions">
                <label className="secondary-button crop-replace">
                    Choose another
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                            onChoose(event.currentTarget.files?.[0] ?? null)
                            event.currentTarget.value = ''
                        }}
                    />
                </label>
                <button
                    className={`secondary-button crop-apply ${cropApplied ? 'crop-apply--done' : ''}`}
                    type="button"
                    disabled={!canApply || cropApplied}
                    onClick={async () => {
                        const cropVersion = cropVersionRef.current
                        setProcessing(true)
                        setCropError(null)
                        try {
                            const file = await createSquareCrop(source.file, selection)
                            if (activeRef.current && cropVersionRef.current === cropVersion) {
                                void onApply(file)
                            }
                        } catch {
                            setCropError('We couldn’t create this crop. Try another image.')
                        } finally {
                            setProcessing(false)
                        }
                    }}
                >
                    {processing
                        ? 'Creating crop…'
                        : moderationStatus === 'checking'
                            ? 'Checking crop…'
                            : cropApplied ? 'Crop applied ✓' : 'Apply crop'}
                </button>
            </div>
        </div>
    )
}

export function UploadDialog({
    pickPoint,
    previewUrl,
    moderation,
    demoMode,
    onFile,
    onCancel,
    onMint,
}: {
    pickPoint: Point
    previewUrl: string | null
    moderation: {
        status: 'idle' | 'checking' | 'approved' | 'blocked' | 'error'
        message: string
    }
    demoMode: boolean
    onFile: (file: File | null) => void | Promise<void>
    onCancel: () => void
    onMint: () => void
}) {
    const [source, setSource] = useState<CropSource | null>(null)

    useEffect(() => () => {
        if (source) {
            URL.revokeObjectURL(source.url)
        }
    }, [source])

    const chooseFile = (file: File | null) => {
        void onFile(null)
        if (!file) {
            setSource(null)
            return
        }
        setSource({file, url: URL.createObjectURL(file)})
    }

    return (
        <div className="upload-layer" role="presentation">
            <div className="upload-backdrop"/>
            <section
                className={`glass-surface upload-dialog ${source ? 'upload-dialog--crop' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="upload-title"
                aria-busy={moderation.status === 'checking'}
            >
                <div className="upload-heading">
                    <h2 id="upload-title">
                        {source ? 'Adjust square crop' : `Add at ${Math.round(pickPoint.x / 30)} · ${Math.round(pickPoint.y / 30)}`}
                    </h2>
                    <button className="round-button" type="button" aria-label="Close upload" onClick={onCancel}>
                        <svg width="10" height="10" viewBox="0 0 11 11" aria-hidden="true">
                            <line x1="1.5" y1="1.5" x2="9.5" y2="9.5"/>
                            <line x1="9.5" y1="1.5" x2="1.5" y2="9.5"/>
                        </svg>
                    </button>
                </div>
                {demoMode ? (
                    <div className="upload-demo-notice">
                        <span aria-hidden="true"/>
                        No wallet required · resets when you refresh
                    </div>
                ) : null}
                {source ? (
                    <SquareCropEditor
                        key={source.url}
                        source={source}
                        cropApplied={Boolean(previewUrl) && moderation.status === 'approved'}
                        moderationStatus={moderation.status}
                        onApply={onFile}
                        onChoose={chooseFile}
                        onInvalidate={() => void onFile(null)}
                    />
                ) : (
                    <label
                        className="upload-dropzone"
                        onDragOver={(event: DragEvent<HTMLLabelElement>) => event.preventDefault()}
                        onDrop={(event: DragEvent<HTMLLabelElement>) => {
                            event.preventDefault()
                            chooseFile(event.dataTransfer.files[0] ?? null)
                        }}
                    >
                        <svg className="upload-icon" width="20" height="20" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path d="M7 10V2.5"/>
                            <path d="M3.8 5.2 7 2l3.2 3.2"/>
                            <path d="M2 11.5h10"/>
                        </svg>
                        <span>Drop an image, or browse</span>
                        <small>Crop to square · min 960 × 960</small>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                                chooseFile(event.currentTarget.files?.[0] ?? null)
                                event.currentTarget.value = ''
                            }}
                        />
                    </label>
                )}
                {moderation.status !== 'idle' ? (
                    <div
                        className={`upload-moderation upload-moderation--${moderation.status}`}
                        role="status"
                        aria-live="polite"
                    >
                        {moderation.status === 'checking' ? (
                            <span className="upload-moderation-spinner" aria-hidden="true"/>
                        ) : null}
                        <span>{moderation.message}</span>
                    </div>
                ) : (
                    <div className="upload-moderation-note">
                        Apply your crop, then it will be checked before {demoMode ? 'placing' : 'minting'}.
                    </div>
                )}
                <button
                    className="primary-button"
                    type="button"
                    disabled={!previewUrl || moderation.status !== 'approved'}
                    onClick={onMint}
                >
                    {moderation.status === 'checking'
                        ? 'Checking crop…'
                        : demoMode ? 'Place on demo canvas' : 'Mint to collage'}
                </button>
            </section>
        </div>
    )
}
