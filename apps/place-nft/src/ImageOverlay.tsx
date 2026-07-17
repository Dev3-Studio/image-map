import {useMemo, useState, type FormEvent, type ReactNode} from 'react'
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
    description?: string
    link?: string
    owner?: string
    caption?: string
    tileCount: number
    demoMode: boolean
    canEdit?: boolean
    onSaveDetails?: (details: {title: string; description: string; link: string}) => void
    onClick: () => void
}

const endpoint = import.meta.env.VITE_SOL_DEV_ENDPOINT ?? clusterApiUrl('devnet')

function ImageOverlayPanel({
    imageUrl,
    imageAvifUrl,
    title,
    description,
    link,
    owner = '0x123…9fe',
    caption,
    tileCount,
    canEdit = false,
    onSaveDetails,
    onClick,
    walletAction,
}: ImageOverlayProps & {walletAction: ReactNode}) {
    const [editing, setEditing] = useState(false)
    const [draftTitle, setDraftTitle] = useState(title)
    const [draftDescription, setDraftDescription] = useState(description ?? '')
    const [draftLink, setDraftLink] = useState(link ?? '')
    const [linkError, setLinkError] = useState('')

    const saveDetails = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const nextTitle = draftTitle.trim()
        let nextLink = draftLink.trim()

        if (!nextTitle) {
            return
        }

        if (nextLink && !/^https?:\/\//i.test(nextLink)) {
            nextLink = `https://${nextLink}`
        }

        if (nextLink) {
            try {
                const url = new URL(nextLink)
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    throw new Error('Unsupported link protocol')
                }
                nextLink = url.toString()
            } catch {
                setLinkError('Enter a valid http or https link.')
                return
            }
        }

        onSaveDetails?.({
            title: nextTitle,
            description: draftDescription.trim(),
            link: nextLink,
        })
        setDraftLink(nextLink)
        setLinkError('')
        setEditing(false)
    }

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
                    <code>{owner}</code>
                </div>
                {description ? <p className="overlay-description">{description}</p> : null}
                <p className="overlay-caption">
                    {caption ?? `Minted to the Tessera collage · Jan 12, 2026. One of ${tileCount.toLocaleString()} tiles.`}
                </p>
                {link ? (
                    <a className="overlay-link" href={link} target="_blank" rel="noopener noreferrer">
                        <span>Visit this tile’s link</span>
                        <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                            <path d="M4 9 9.5 3.5M5.5 3.5h4v4"/>
                        </svg>
                    </a>
                ) : null}
            </div>
            {editing ? (
                <form className="overlay-editor" onSubmit={saveDetails}>
                    <label>
                        <span>Title</span>
                        <input
                            value={draftTitle}
                            maxLength={80}
                            required
                            autoFocus
                            onChange={(event) => setDraftTitle(event.currentTarget.value)}
                        />
                    </label>
                    <label>
                        <span>Description</span>
                        <textarea
                            value={draftDescription}
                            maxLength={300}
                            rows={4}
                            placeholder="Tell visitors about this image"
                            onChange={(event) => setDraftDescription(event.currentTarget.value)}
                        />
                    </label>
                    <label>
                        <span>Link</span>
                        <input
                            value={draftLink}
                            maxLength={2048}
                            inputMode="url"
                            placeholder="https://example.com"
                            aria-invalid={Boolean(linkError)}
                            aria-describedby={linkError ? 'overlay-link-error' : undefined}
                            onChange={(event) => {
                                setDraftLink(event.currentTarget.value)
                                setLinkError('')
                            }}
                        />
                    </label>
                    {linkError ? <div id="overlay-link-error" className="overlay-editor-error" role="alert">{linkError}</div> : null}
                    <div className="overlay-editor-actions">
                        <button className="overlay-secondary-button" type="button" onClick={() => {
                            setDraftTitle(title)
                            setDraftDescription(description ?? '')
                            setDraftLink(link ?? '')
                            setLinkError('')
                            setEditing(false)
                        }}>
                            Cancel
                        </button>
                        <button className="overlay-primary-button" type="submit" disabled={!draftTitle.trim()}>
                            Save details
                        </button>
                    </div>
                </form>
            ) : null}
            <div className="overlay-actions">
                {canEdit && !editing ? (
                    <button className="overlay-edit-button" type="button" onClick={() => setEditing(true)}>
                        Edit title, description &amp; link
                    </button>
                ) : null}
                <div className="overlay-wallet-action">
                    {walletAction}
                </div>
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
