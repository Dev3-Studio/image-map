import {BaseWalletMultiButton} from '@solana/wallet-adapter-react-ui'

export default function SolanaWalletButton() {
    return (
        <BaseWalletMultiButton
            labels={{
                'change-wallet': 'Change wallet',
                connecting: 'Connecting…',
                'copy-address': 'Copy address',
                copied: 'Copied',
                disconnect: 'Disconnect',
                'has-wallet': 'Connect wallet',
                'no-wallet': 'Select wallet',
            }}
        />
    )
}
