import {useState, type MouseEvent} from 'react'
import type {MapPreviewSources} from './hooks/useMapDefinition.ts'
import './Landing.css'

const STATS = [
    {value: '10,000', label: 'Tiles on the canvas'},
    {value: '7,680 px', label: 'Full canvas width'},
    {value: '960 px', label: 'Minimum image size'},
    {value: '1 of 1', label: 'Each tile, forever'},
]

const FAQS = [
    {
        q: 'What exactly am I buying?',
        a: 'A single tile on the Tessera canvas — a fixed square region of the shared collage. Minting records your wallet address as the tile’s owner and permanently places your image inside it.',
    },
    {
        q: 'Can I change my image later?',
        a: 'No. Tessera is a one-shot canvas: once a tile is minted, its image is final. That permanence is what makes the finished picture worth being part of.',
    },
    {
        q: 'What image formats work?',
        a: 'Any common format — JPG, PNG, or WebP. Images should be square and at least 960 × 960 pixels so they stay sharp at full zoom.',
    },
    {
        q: 'Do I need a wallet to explore?',
        a: 'No. Anyone can pan, zoom, and search the collage freely. A wallet is only needed at the final step, when you mint a tile of your own.',
    },
    {
        q: 'What happens when all 10,000 tiles are claimed?',
        a: 'The canvas is complete. The finished collage stays online for anyone to explore, and every tile remains tied to the address that minted it.',
    },
]

function ArrowIcon() {
    return (
        <svg className="landing-arrow" width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
            <path d="M2 6.5h9"/>
            <path d="M7.5 3 11 6.5 7.5 10"/>
        </svg>
    )
}

export default function Landing({
    preview,
    collageHref,
    onOpenCollage,
}: {
    preview: MapPreviewSources
    collageHref: string
    onOpenCollage: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
    const [openFaq, setOpenFaq] = useState(-1)

    return (
        <div className="landing">
            <nav className="glass-surface landing-nav" aria-label="Main">
                <a className="landing-nav-brand" href="#top">
                    <span className="brand-mark" aria-hidden="true"/>
                    <span className="landing-wordmark">Tessera</span>
                </a>
                <a className="landing-nav-link" href="#how">How it works</a>
                <a className="landing-nav-link" href="#faq">FAQ</a>
                <a className="landing-cta" href={collageHref} onClick={onOpenCollage}>Open the collage</a>
            </nav>

            <section className="landing-hero" id="top">
                <picture className="landing-hero-picture">
                    {preview.previewAvifUrl ? (
                        <source type="image/avif" srcSet={preview.previewAvifUrl}/>
                    ) : null}
                    <img
                        className="landing-hero-image"
                        src={preview.previewUrl}
                        alt="The Tessera collage"
                        fetchPriority="high"
                        draggable={false}
                    />
                </picture>
                <div className="landing-hero-wash" aria-hidden="true"/>
                <div className="landing-hero-center">
                    <div className="glass-surface landing-hero-card">
                        <div className="landing-badge">
                            <span className="brand-mark landing-badge-mark" aria-hidden="true"/>
                            One canvas · 10,000 tiles
                        </div>
                        <h1 className="landing-title">Ten thousand images. One picture.</h1>
                        <p className="landing-lede">
                            Tessera is a shared collage — a single 7,680-pixel canvas divided into 10,000 square
                            tiles. Claim a spot, mint your image, and it becomes a permanent piece of the picture.
                        </p>
                        <div className="landing-hero-actions">
                            <a className="landing-cta landing-cta--large" href={collageHref} onClick={onOpenCollage}>
                                Explore the collage
                                <ArrowIcon/>
                            </a>
                            <a className="landing-ghost-button" href="#how">How it works</a>
                        </div>
                    </div>
                </div>
            </section>

            <section className="landing-how" id="how">
                <div className="landing-section-heading">
                    <h2>How it works</h2>
                    <p>Three steps from an image on your phone to a tile on the canvas.</p>
                </div>
                <div className="landing-steps">
                    <article className="glass-surface landing-step">
                        <div className="landing-step-icon">
                            <svg width="17" height="17" viewBox="0 0 15 15" aria-hidden="true">
                                <circle cx="6.4" cy="6.4" r="4.6"/>
                                <line x1="10" y1="10" x2="13.6" y2="13.6"/>
                            </svg>
                        </div>
                        <div className="landing-step-index">STEP 1</div>
                        <h3>Find your spot</h3>
                        <p>
                            Pan and zoom across the full canvas. Every open tile is up for grabs — pick the
                            neighborhood you want your image to live in.
                        </p>
                    </article>
                    <article className="glass-surface landing-step">
                        <div className="landing-step-icon">
                            <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
                                <path d="M7 10V2.5"/>
                                <path d="M3.8 5.2 7 2l3.2 3.2"/>
                                <path d="M2 11.5h10"/>
                            </svg>
                        </div>
                        <div className="landing-step-index">STEP 2</div>
                        <h3>Upload your image</h3>
                        <p>
                            Drop in any square image, 960 × 960 or larger. It’s cropped to your tile exactly as you
                            preview it — what you see is what gets placed.
                        </p>
                    </article>
                    <article className="glass-surface landing-step">
                        <div className="landing-step-icon landing-step-icon--accent">
                            <span className="landing-step-mark" aria-hidden="true"/>
                        </div>
                        <div className="landing-step-index">STEP 3</div>
                        <h3>Mint it to the canvas</h3>
                        <p>
                            Connect a wallet and mint. Your tile is written to the collage permanently, with your
                            address on record as its owner.
                        </p>
                    </article>
                </div>
            </section>

            <section className="landing-stats-section" aria-label="Canvas facts">
                <div className="glass-surface landing-stats">
                    {STATS.map((stat) => (
                        <div className="landing-stat" key={stat.label}>
                            <div className="landing-stat-value">{stat.value}</div>
                            <div className="landing-stat-label">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="landing-faq" id="faq">
                <h2>Questions</h2>
                <div className="landing-faq-list">
                    {FAQS.map((faq, index) => {
                        const open = openFaq === index
                        return (
                            <div className={`glass-surface landing-faq-item ${open ? 'landing-faq-item--open' : ''}`} key={faq.q}>
                                <button
                                    className="landing-faq-question"
                                    type="button"
                                    aria-expanded={open}
                                    aria-controls={`landing-faq-answer-${index}`}
                                    onClick={() => setOpenFaq(open ? -1 : index)}
                                >
                                    <span>{faq.q}</span>
                                    <span className="landing-faq-icon" aria-hidden="true">
                                        <svg width="11" height="11" viewBox="0 0 15 15">
                                            <line x1="2.5" y1="7.5" x2="12.5" y2="7.5"/>
                                            <line x1="7.5" y1="2.5" x2="7.5" y2="12.5"/>
                                        </svg>
                                    </span>
                                </button>
                                <div className="landing-faq-answer" id={`landing-faq-answer-${index}`} role="region">
                                    <p>{faq.a}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </section>

            <footer className="landing-footer">
                <div className="landing-footer-brand">
                    <span className="brand-mark" aria-hidden="true"/>
                    <span className="landing-wordmark">Tessera</span>
                </div>
                <a className="landing-cta landing-cta--large" href={collageHref} onClick={onOpenCollage}>Claim your tile</a>
                <div className="landing-footer-note">© 2026 Tessera · A shared canvas, one tile at a time</div>
            </footer>
        </div>
    )
}
