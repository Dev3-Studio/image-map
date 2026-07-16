import './ImageOverlay.css'
import {WalletMultiButton} from "@solana/wallet-adapter-react-ui";
import { mplCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import useFetchCandyMachine from './hooks/useFetchCandyMachine';
import {useWallet} from "@solana/wallet-adapter-react";
import {walletAdapterIdentity} from "@metaplex-foundation/umi-signer-wallet-adapters";
function ImageOverlay({filename, title, onClick}: { filename: string|null, title:string, onClick: () => void }) {
    const wallet = useWallet();
    const umi = createUmi(process.env.NEXT_PUBLIC_SOL_DEV_ENDPOINT!, { commitment: 'confirmed' })
        .use(walletAdapterIdentity(wallet))
        .use(mplCandyMachine());
    const candyMachineWithGuard = useFetchCandyMachine({ umi });

    return(
        <div id={'imageOverlay'}>
            <button className={'overlay-close'} onClick={onClick}>x</button>
            <img className="overlay-image" src={`../fullres/${filename}`} alt="overlay"/>
            <h1 className={'overlay-name'}>{title}</h1>
            <h5 className={'overlay-owner'}>Owner: 0x123</h5>
            <p className={'overlay-description'}>Lorem Ipsum is simply dummy text of the printing and typesetting
                industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown
                printer took a galley of type and scrambled it to make a type specimen book. It has survived not only
                five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was
                popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more
                recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</p>
            <WalletMultiButton />
        </div>
    )
}

export default ImageOverlay;