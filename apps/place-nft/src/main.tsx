import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import {ConnectionProvider, WalletProvider} from '@solana/wallet-adapter-react'
import {WalletModalProvider} from '@solana/wallet-adapter-react-ui'
import {clusterApiUrl} from '@solana/web3.js'

const endpoint = import.meta.env.VITE_SOL_DEV_ENDPOINT ?? clusterApiUrl('devnet')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
)
