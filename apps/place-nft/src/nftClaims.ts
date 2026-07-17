import {mintV2, mplCandyMachine} from '@metaplex-foundation/mpl-candy-machine'
import {setComputeUnitLimit} from '@metaplex-foundation/mpl-toolbox'
import {generateSigner, transactionBuilder} from '@metaplex-foundation/umi'
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults'
import {walletAdapterIdentity} from '@metaplex-foundation/umi-signer-wallet-adapters'
import type {WalletContextState} from '@solana/wallet-adapter-react'
import {clusterApiUrl} from '@solana/web3.js'
import getCandyMachine from './utils/getCandyMachine.ts'

export interface TileClaim {
    claimed: boolean
    tileIndex?: number
    mint?: string
    owner?: string | null
    imageUrl?: string | null
    claimedAt?: string
    updatedAt?: string
}

const claimsApiUrl = import.meta.env.VITE_CLAIMS_API_URL?.replace(/\/$/, '')
const endpoint = import.meta.env.VITE_SOL_DEV_ENDPOINT ?? clusterApiUrl('devnet')

function requireClaimsApi() {
    if (!claimsApiUrl) {
        throw new Error('CLAIMS_NOT_CONFIGURED')
    }
    return claimsApiUrl
}

function encodeBase58(bytes: Uint8Array) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    const digits = [0]
    for (const byte of bytes) {
        let carry = byte
        for (let index = 0; index < digits.length; index += 1) {
            const next = digits[index] * 256 + carry
            digits[index] = next % 58
            carry = Math.floor(next / 58)
        }
        while (carry > 0) {
            digits.push(carry % 58)
            carry = Math.floor(carry / 58)
        }
    }
    for (let index = 0; index < bytes.length - 1 && bytes[index] === 0; index += 1) {
        digits.push(0)
    }
    return digits.reverse().map((digit) => alphabet[digit]).join('')
}

function bytesToBase64(bytes: Uint8Array) {
    let binary = ''
    for (const byte of bytes) {
        binary += String.fromCharCode(byte)
    }
    return btoa(binary)
}

async function imageDataUrl(file: File) {
    if (file.size > 5 * 1024 * 1024) {
        throw new Error('IMAGE_TOO_LARGE')
    }
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'))
        reader.readAsDataURL(file)
    })
}

async function signedBody(
    wallet: WalletContextState,
    action: 'reserve' | 'claim' | 'edit',
    tileIndex: number,
    details = '',
) {
    if (!wallet.publicKey || !wallet.signMessage) {
        throw new Error('WALLET_SIGNATURE_UNAVAILABLE')
    }
    const expiresAt = Date.now() + 4 * 60 * 1000
    const publicKey = wallet.publicKey.toBase58()
    const message = [
        'Tessera tile authorization',
        `Action: ${action}`,
        `Tile: ${tileIndex}`,
        `Wallet: ${publicKey}`,
        `Expires: ${expiresAt}`,
        details,
    ].filter(Boolean).join('\n')
    const signature = await wallet.signMessage(new TextEncoder().encode(message))
    return {wallet: publicKey, expiresAt, signature: bytesToBase64(signature)}
}

async function apiRequest(path: string, init?: RequestInit) {
    const result = await fetch(`${requireClaimsApi()}${path}`, {
        cache: 'no-store',
        ...init,
        headers: {'content-type': 'application/json', ...init?.headers},
    })
    const body = await result.json().catch(() => null) as (TileClaim & {code?: string}) | null
    if (!result.ok) {
        throw new Error(body?.code ?? 'CLAIMS_API_FAILED')
    }
    return body as TileClaim
}

export function getTileClaim(tileIndex: number) {
    return apiRequest(`/tiles/${tileIndex}`)
}

export async function reserveTile(tileIndex: number, wallet: WalletContextState) {
    const authorization = await signedBody(wallet, 'reserve', tileIndex)
    await apiRequest(`/tiles/${tileIndex}/reservations`, {
        method: 'POST',
        body: JSON.stringify(authorization),
    })
}

export async function mintTileNft(wallet: WalletContextState) {
    const umi = createUmi(endpoint, {commitment: 'confirmed'})
        .use(walletAdapterIdentity(wallet))
        .use(mplCandyMachine())
    const candyMachine = await getCandyMachine(umi)
    if (!candyMachine) {
        throw new Error('CANDY_MACHINE_NOT_CONFIGURED')
    }
    if (candyMachine.candyMachine.itemsRedeemed >= candyMachine.candyMachine.data.itemsAvailable) {
        throw new Error('CANDY_MACHINE_SOLD_OUT')
    }

    const nftMint = generateSigner(umi)
    const result = await transactionBuilder()
        .add(setComputeUnitLimit(umi, {units: 800_000}))
        .add(mintV2(umi, {
            candyMachine: candyMachine.candyMachine.publicKey,
            collectionMint: candyMachine.candyMachine.collectionMint,
            collectionUpdateAuthority: candyMachine.candyMachine.authority,
            nftMint,
            tokenStandard: candyMachine.candyMachine.tokenStandard,
        }))
        .sendAndConfirm(umi, {confirm: {commitment: 'confirmed'}})

    return {
        mint: nftMint.publicKey.toString(),
        transaction: encodeBase58(result.signature),
    }
}

export async function finalizeTileClaim(
    tileIndex: number,
    wallet: WalletContextState,
    mint: string,
    transaction: string,
    file: File,
) {
    const details = `Mint: ${mint}\nTransaction: ${transaction}`
    const [authorization, image] = await Promise.all([
        signedBody(wallet, 'claim', tileIndex, details),
        imageDataUrl(file),
    ])
    return apiRequest(`/tiles/${tileIndex}/claim`, {
        method: 'POST',
        body: JSON.stringify({...authorization, mint, transaction, image}),
    })
}

export async function updateTileImage(tileIndex: number, wallet: WalletContextState, file: File) {
    const [authorization, image] = await Promise.all([
        signedBody(wallet, 'edit', tileIndex),
        imageDataUrl(file),
    ])
    return apiRequest(`/tiles/${tileIndex}/image`, {
        method: 'PUT',
        body: JSON.stringify({...authorization, image}),
    })
}
