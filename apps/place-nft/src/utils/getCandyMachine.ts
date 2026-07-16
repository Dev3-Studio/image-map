import { safeFetchCandyGuard, safeFetchCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { Umi, publicKey } from "@metaplex-foundation/umi";

export default async function getCandyMachine(umi: Umi) {
	const candyMachineId = import.meta.env.VITE_CANDY_MACHINE_ID;
	if (!candyMachineId) return null;

    const candyMachine = await safeFetchCandyMachine(umi, publicKey(candyMachineId));
	if (!candyMachine) return null;
    const candyGuard = await safeFetchCandyGuard(umi, candyMachine.mintAuthority);
	if (!candyGuard) return null;
    return {
		candyMachine,
		candyGuard,
	}
}
