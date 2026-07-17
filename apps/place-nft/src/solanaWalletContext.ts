import {createContext, useContext} from 'react'
import type {WalletContextState} from '@solana/wallet-adapter-react'

export const SolanaWalletContext = createContext<WalletContextState | null>(null)

export function useSolanaWallet() {
    return useContext(SolanaWalletContext)
}
