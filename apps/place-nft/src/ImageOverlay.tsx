import {useMemo} from 'react'
import {BaseWalletMultiButton} from '@solana/wallet-adapter-react-ui'
import {mplCandyMachine} from '@metaplex-foundation/mpl-candy-machine'
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults'
import {useWallet} from '@solana/wallet-adapter-react'
import {walletAdapterIdentity} from '@metaplex-foundation/umi-signer-wallet-adapters'
import {clusterApiUrl} from '@solana/web3.js'
import useFetchCandyMachine from './hooks/useFetchCandyMachine'
import './ImageOverlay.css'

function ImageOverlay({
    imageUrl,
    imageAvifUrl,
    title,
    tileCount,
    onClick,
}: {
    imageUrl: string
    imageAvifUrl?: string
    title: string
    tileCount: number
    onClick: () => void
}) {
    const wallet = useWallet()
    const umi = useMemo(
        () => createUmi(import.meta.env.VITE_SOL_DEV_ENDPOINT ?? clusterApiUrl('devnet'), {commitment: 'confirmed'})
            .use(walletAdapterIdentity(wallet))
            .use(mplCandyMachine()),
        [wallet],
    )
    useFetchCandyMachine({umi})

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
            </div>
        </aside>
    )
}

export default ImageOverlay
