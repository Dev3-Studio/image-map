import {useMemo, useState, type DragEvent, type PointerEvent, type RefObject} from 'react'
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
    onFile: (file: File | null) => void
    onCancel: () => void
    onMint: () => void
}) {
    return (
        <div className="upload-layer" role="presentation">
            <div className="upload-backdrop"/>
            <section
                className="glass-surface upload-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="upload-title"
                aria-busy={moderation.status === 'checking'}
            >
                <div className="upload-heading">
                    <h2 id="upload-title">Add at {Math.round(pickPoint.x / 30)} · {Math.round(pickPoint.y / 30)}</h2>
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
                <label
                    className={`upload-dropzone ${previewUrl ? 'upload-dropzone--preview' : ''}`}
                    onDragOver={(event: DragEvent<HTMLLabelElement>) => event.preventDefault()}
                    onDrop={(event: DragEvent<HTMLLabelElement>) => {
                        event.preventDefault()
                        onFile(event.dataTransfer.files[0] ?? null)
                    }}
                >
                    {previewUrl ? (
                        <img src={previewUrl} alt="Upload preview"/>
                    ) : (
                        <>
                            <svg className="upload-icon" width="20" height="20" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                <path d="M7 10V2.5"/>
                                <path d="M3.8 5.2 7 2l3.2 3.2"/>
                                <path d="M2 11.5h10"/>
                            </svg>
                            <span>Drop an image, or browse</span>
                            <small>Square · min 960 × 960</small>
                        </>
                    )}
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                            onFile(event.target.files?.[0] ?? null)
                            event.currentTarget.value = ''
                        }}
                    />
                </label>
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
                        Images are checked for explicit content before {demoMode ? 'placing' : 'minting'}.
                    </div>
                )}
                <button
                    className="primary-button"
                    type="button"
                    disabled={!previewUrl || moderation.status !== 'approved'}
                    onClick={onMint}
                >
                    {moderation.status === 'checking'
                        ? 'Checking image…'
                        : demoMode ? 'Place on demo canvas' : 'Mint to collage'}
                </button>
            </section>
        </div>
    )
}
