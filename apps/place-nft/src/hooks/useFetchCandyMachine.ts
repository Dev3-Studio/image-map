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
		getCandyMachine(umi).then((cmwg) => {
			setCandyMachineWithGuard(cmwg);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return candyMachineWithGuard;
}