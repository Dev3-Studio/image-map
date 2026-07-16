import { CandyGuard, CandyMachine, DefaultGuardSet } from '@metaplex-foundation/mpl-candy-machine';
import { Umi } from '@metaplex-foundation/umi';
import { useEffect, useState } from 'react';
import getCandyMachine from '../utils/getCandyMachine';

interface CandyMachineWithGuard {
	candyMachine: CandyMachine;
	candyGuard: CandyGuard<DefaultGuardSet>;
}

export default function useFetchCandyMachine({ umi }: { umi: Umi; }) {
	const [candyMachineWithGuard, setCandyMachineWithGuard] = useState<CandyMachineWithGuard | null>(null);

	useEffect(() => {
		let active = true;

		getCandyMachine(umi).then((cmwg) => {
			if (active) setCandyMachineWithGuard(cmwg);
		});

		return () => {
			active = false;
		};
	}, [umi]);

	return candyMachineWithGuard;
}
