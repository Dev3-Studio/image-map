import { safeFetchCandyGuard, safeFetchCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { Umi, publicKey } from "@metaplex-foundation/umi";

export default async function getCandyMachine(umi: Umi) {
    const candyMachine = await safeFetchCandyMachine(umi, publicKey(process.env.NEXT_PUBLIC_CANDY_MACHINE_ID!));
	if (!candyMachine) return null;
    const candyGuard = await safeFetchCandyGuard(umi, candyMachine.mintAuthority);
	if (!candyGuard) return null;
    return {
		candyMachine,
		candyGuard,
	}
}