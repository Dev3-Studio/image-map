import {type RefObject} from 'react'
import {useControls} from 'react-zoom-pan-pinch'
import './Toolbar.css'

function Toolbar({
    zoomLabelRef,
    demoMode,
    onStartPick,
}: {
    zoomLabelRef: RefObject<HTMLSpanElement | null>
    demoMode: boolean
    onStartPick: () => void
}) {
    const {zoomIn, zoomOut, resetTransform} = useControls()

    return (
        <div
            id="toolbar"
            className="glass-surface glow-surface"
            onClick={(event) => event.stopPropagation()}
            onPointerMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect()
                event.currentTarget.style.setProperty('--glow-x', `${event.clientX - bounds.left}px`)
                event.currentTarget.style.setProperty('--glow-y', `${event.clientY - bounds.top}px`)
                event.currentTarget.classList.add('is-glowing')
            }}
            onPointerLeave={(event) => event.currentTarget.classList.remove('is-glowing')}
        >
            <span className="surface-glow" aria-hidden="true"/>
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomOut(0.35, 300, 'easeOut')}>
                <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                    <line x1="2.5" y1="7.5" x2="12.5" y2="7.5"/>
                </svg>
            </button>
            <span ref={zoomLabelRef} className="zoom-label">100%</span>
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomIn(0.35, 300, 'easeOut')}>
                <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                    <line x1="2.5" y1="7.5" x2="12.5" y2="7.5"/>
                    <line x1="7.5" y1="2.5" x2="7.5" y2="12.5"/>
                </svg>
            </button>
            <span className="toolbar-divider"/>
            <button type="button" aria-label="Reset view" title="Reset view" onClick={() => resetTransform(420, 'easeOut')}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/>
                    <path d="M12.5 1.5v3h-3"/>
                </svg>
            </button>
            <span className="toolbar-divider"/>
            <button
                className={`upload-button ${demoMode ? 'upload-button--demo' : ''}`}
                type="button"
                aria-label={demoMode ? 'Add a demo image' : 'Add your image'}
                title={demoMode ? 'Add a demo image — no wallet required' : 'Add your image'}
                onClick={onStartPick}
            >
                <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M7 10V2.5"/>
                    <path d="M3.8 5.2 7 2l3.2 3.2"/>
                    <path d="M2 11.5h10"/>
                </svg>
                {demoMode ? <span className="upload-button-label">Add image</span> : null}
            </button>
        </div>
    )
}

export default Toolbar
