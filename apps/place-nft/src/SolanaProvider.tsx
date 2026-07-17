import {useMemo, type ReactNode} from 'react'
import {ConnectionProvider, useWallet, WalletProvider} from '@solana/wallet-adapter-react'
import {WalletModalProvider} from '@solana/wallet-adapter-react-ui'
import {clusterApiUrl} from '@solana/web3.js'
import {SolanaWalletContext} from './solanaWalletContext.ts'
import '@solana/wallet-adapter-react-ui/styles.css'

const endpoint = import.meta.env.VITE_SOL_DEV_ENDPOINT ?? clusterApiUrl('devnet')

function WalletBridge({children}: {children: ReactNode}) {
    const wallet = useWallet()
    return <SolanaWalletContext.Provider value={wallet}>{children}</SolanaWalletContext.Provider>
}

export default function SolanaProvider({children}: {children: ReactNode}) {
    const wallets = useMemo(() => [], [])

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <WalletBridge>{children}</WalletBridge>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    )
}
