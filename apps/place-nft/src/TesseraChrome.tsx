import {useState, type DragEvent, type MouseEvent, type RefObject} from 'react'
import './TesseraChrome.css'

interface Point {
    x: number
    y: number
}

export function TesseraHeader({onSearch}: {onSearch: (index: number) => void}) {
    const [query, setQuery] = useState('')

    return (
        <header className="tessera-header">
            <div className="glass-surface brand-capsule">
                <span className="brand-mark" aria-hidden="true"/>
                <span className="brand-wordmark">Tessera</span>
            </div>
            <form
                className="glass-surface glow-surface search-capsule"
                onSubmit={(event) => event.preventDefault()}
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
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') {
                            return
                        }

                        event.preventDefault()
                        const index = Number.parseInt(query.replace(/[^0-9]/g, ''), 10)
                        if (Number.isInteger(index)) {
                            onSearch(index)
                        }
                    }}
                    placeholder="Jump to tile #"
                    aria-label="Jump to tile number"
                    inputMode="numeric"
                />
            </form>
        </header>
    )
}

export function Minimap({
    viewportRef,
    onNavigate,
}: {
    viewportRef: RefObject<HTMLDivElement | null>
    onNavigate: (event: MouseEvent<HTMLButtonElement>) => void
}) {
    return (
        <button className="minimap" type="button" title="Minimap" onClick={onNavigate}>
            <span className="minimap-wash" aria-hidden="true"/>
            <span ref={viewportRef} className="minimap-viewport" aria-hidden="true"/>
            <span className="sr-only">Navigate the collage minimap</span>
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
    onFile,
    onCancel,
    onMint,
}: {
    pickPoint: Point
    previewUrl: string | null
    onFile: (file: File | null) => void
    onCancel: () => void
    onMint: () => void
}) {
    return (
        <div className="upload-layer" role="presentation">
            <div className="upload-backdrop"/>
            <section className="glass-surface upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title">
                <div className="upload-heading">
                    <h2 id="upload-title">Add at {Math.round(pickPoint.x / 30)} · {Math.round(pickPoint.y / 30)}</h2>
                    <button className="round-button" type="button" aria-label="Close upload" onClick={onCancel}>
                        <svg width="10" height="10" viewBox="0 0 11 11" aria-hidden="true">
                            <line x1="1.5" y1="1.5" x2="9.5" y2="9.5"/>
                            <line x1="9.5" y1="1.5" x2="1.5" y2="9.5"/>
                        </svg>
                    </button>
                </div>
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
                        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
                    />
                </label>
                <button className="primary-button" type="button" disabled={!previewUrl} onClick={onMint}>
                    Mint to collage
                </button>
            </section>
        </div>
    )
}
