import {useMemo, type ReactNode} from 'react'
import {BaseWalletMultiButton, WalletModalProvider} from '@solana/wallet-adapter-react-ui'
import {mplCandyMachine} from '@metaplex-foundation/mpl-candy-machine'
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults'
import {ConnectionProvider, useWallet, WalletProvider} from '@solana/wallet-adapter-react'
import {walletAdapterIdentity} from '@metaplex-foundation/umi-signer-wallet-adapters'
import {clusterApiUrl} from '@solana/web3.js'
import useFetchCandyMachine from './hooks/useFetchCandyMachine'
import '@solana/wallet-adapter-react-ui/styles.css'
import './ImageOverlay.css'

interface ImageOverlayProps {
    imageUrl: string
    imageAvifUrl?: string
    title: string
    tileCount: number
    demoMode: boolean
    onClick: () => void
}

const endpoint = import.meta.env.VITE_SOL_DEV_ENDPOINT ?? clusterApiUrl('devnet')

function ImageOverlayPanel({
    imageUrl,
    imageAvifUrl,
    title,
    tileCount,
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
                    <code>0x123…9fe</code>
                </div>
                <p>Minted to the Tessera collage · Jan 12, 2026. One of {tileCount.toLocaleString()} tiles.</p>
            </div>
            <div className="overlay-wallet-action">
                {walletAction}
            </div>
        </aside>
    )
}

function ImageOverlayContent(props: ImageOverlayProps) {
    const wallet = useWallet()
    const umi = useMemo(
        () => createUmi(import.meta.env.VITE_SOL_DEV_ENDPOINT ?? clusterApiUrl('devnet'), {commitment: 'confirmed'})
            .use(walletAdapterIdentity(wallet))
            .use(mplCandyMachine()),
        [wallet],
    )
    useFetchCandyMachine({umi})

    return (
        <ImageOverlayPanel
            {...props}
            walletAction={(
                <BaseWalletMultiButton
                    labels={{
                        'change-wallet': 'Change wallet',
                        connecting: 'Connecting…',
                        'copy-address': 'Copy address',
                        copied: 'Copied',
                        disconnect: 'Disconnect',
                        'has-wallet': 'Connect',
                        'no-wallet': 'Select wallet',
                    }}
                />
            )}
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

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={[]} autoConnect>
                <WalletModalProvider>
                    <ImageOverlayContent {...props}/>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    )
}

export default ImageOverlay
