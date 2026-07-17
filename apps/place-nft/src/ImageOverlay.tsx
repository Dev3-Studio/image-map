import {type ReactNode} from 'react'
import SolanaWalletButton from './SolanaWalletButton.tsx'
import type {TileClaim} from './nftClaims.ts'
import './ImageOverlay.css'

interface ImageOverlayProps {
    imageUrl: string
    imageAvifUrl?: string
    title: string
    tileCount: number
    demoMode: boolean
    claim: TileClaim | null
    onClick: () => void
}

function compactAddress(address: string) {
    return `${address.slice(0, 4)}…${address.slice(-4)}`
}

function ImageOverlayPanel({
    imageUrl,
    imageAvifUrl,
    title,
    tileCount,
    claim,
    onClick,
    walletAction,
}: ImageOverlayProps & {walletAction: ReactNode}) {
    return (
        <aside id="imageOverlay" className="glass-surface" aria-label="Tile detail">
            <button className="overlay-close round-button" type="button" aria-label="Close tile detail" onClick={onClick}>
                <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                    <line x1="1.5" y1="1.5" x2="9.5" y2="9.5"/>
                    <line x1="9.5" y1="1.5" x2="1.5" y2="9.5"/>
                </svg>
            </button>
            <picture className="overlay-picture">
                {imageAvifUrl ? <source type="image/avif" srcSet={imageAvifUrl}/> : null}
                <img className="overlay-image" src={imageUrl} alt={`Artwork for ${title}`}/>
            </picture>
            <div className="overlay-copy">
                <h1>{title}</h1>
                <div className="overlay-owner">
                    <span>Owner</span>
                    <code>{claim?.owner ? compactAddress(claim.owner) : claim?.claimed ? 'Resolving…' : 'Unclaimed'}</code>
                </div>
                <p>
                    {claim?.claimedAt
                        ? `Minted to the Tessera collage · ${new Date(claim.claimedAt).toLocaleDateString()}. `
                        : 'One available piece of the Tessera collage. '}
                    One of {tileCount.toLocaleString()} tiles.
                </p>
            </div>
            <div className="overlay-wallet-action">
                {walletAction}
            </div>
        </aside>
    )
}

function ImageOverlayContent(props: ImageOverlayProps) {
    return (
        <ImageOverlayPanel
            {...props}
            walletAction={<SolanaWalletButton/>}
        />
    )
}

function ImageOverlay(props: ImageOverlayProps) {
    if (props.demoMode) {
        return (
            <ImageOverlayPanel
                {...props}
                walletAction={(
                    <div className="overlay-demo-mode" role="status">
                        <strong>Demo mode</strong>
                        <span>No wallet required</span>
                    </div>
                )}
            />
        )
    }

    return <ImageOverlayContent {...props}/>
}

export default ImageOverlay
