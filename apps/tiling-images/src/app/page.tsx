'use client';
/* eslint-disable @next/next/no-img-element */
import md5 from 'md5';
import { useState } from 'react';
import { MapInteractionCSS } from 'react-map-interaction';
import grid from './grid.json';
import Fab from '@mui/material/Fab';
import AddIcon from '@mui/icons-material/Add';
import { Box } from '@mui/material';
import { Restore } from '@mui/icons-material';

interface ScrollPosition {
	x: number;
	y: number;
}

interface GridProps {
	grid: any;
	level?: number;
	id?: string;
}

function simpleHashRGBA(input: string, alpha: number) {
	// hash input to a hex string
	const hash = md5(input);
	// convert hash to a bytes
	const bytes = new Uint8Array(hash.match(/.{2}/g)!.map(c => parseInt(c, 16)));
	// convert bytes uint8array to a hex string
	const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
	// Modulus 0xFFFFFF to keep the number in the range [0, 0xFFFFFF] (use BigInt)
	const number = BigInt(`0x${hex}`) % BigInt(0xFFFFFF);
	// convert number to a hex string
	const color = number.toString(16).padStart(6, '0');
	// convert hex string to an array of 3 numbers
	const [r, g, b] = color.match(/.{2}/g)!.map(c => parseInt(c, 16));
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function RecursiveGrid({ grid, id = '', level = 0 }: GridProps) {
	const [hoverElement, setHoverElement] = useState<number | null>(null);

	return (
		<div style={{
			display: 'grid',
			gridTemplateColumns: 'repeat(2, 1fr)',
			gridTemplateRows: 'repeat(2, 1fr)',
			width: '100%',
			height: '100%',
			gridGap: '0',
		}}>
			{grid["1"] !== null ?
				<RecursiveGrid grid={grid["1"]} id={id + '1'} level={level + 1} /> :
				// <div
				// 	style={{
				// 		boxSizing: 'border-box',
				// 		width: '100%',
				// 		height: '100%',
				// 		border: hoverElement === 1 ? '1px solid red' : 'none',
				// 		backgroundColor: simpleHashRGBA(id + '1', 0.5)
				// 	}}
				// 	onMouseEnter={() => setHoverElement(1)}
				// 	onMouseLeave={() => setHoverElement(null)}
				// >
				// </div>
				<img
					src={`https://picsum.photos/seed/${id + '1'}/${Math.floor(1600 / (id.length + 1))}/${Math.floor(1600 / (id.length + 1))}`}
					style={{
						width: '100%',
						height: '100%',
						objectFit: 'cover',
					}}
					alt=""
				/>
			}
			{grid["2"] !== null ?
				<RecursiveGrid grid={grid["2"]} id={id + '2'} level={level + 1} /> :
				// <div
				// 	style={{
				// 		boxSizing: 'border-box',
				// 		width: '100%',
				// 		height: '100%',
				// 		border: hoverElement === 2 ? '1px solid red' : 'none',
				// 		backgroundColor: simpleHashRGBA(id + '2', 0.5)
				// 	}}
				// 	onMouseEnter={() => setHoverElement(2)}
				// 	onMouseLeave={() => setHoverElement(null)}
				// >
				// </div>
				<img
					src={`https://picsum.photos/seed/${id + '2'}/${Math.floor(1600 / (id.length + 1))}/${Math.floor(1600 / (id.length + 1))}`}
					style={{
						width: '100%',
						height: '100%',
						objectFit: 'cover',
					}}
					alt=""
				/>
			}
			{grid["3"] !== null ?
				<RecursiveGrid grid={grid["3"]} id={id + '3'} level={level + 1} /> :
				// <div
				// 	style={{
				// 		boxSizing: 'border-box',
				// 		width: '100%',
				// 		height: '100%',
				// 		border: hoverElement === 3 ? '1px solid red' : 'none',
				// 		backgroundColor: simpleHashRGBA(id + '3', 0.5)
				// 	}}
				// 	onMouseEnter={() => setHoverElement(3)}
				// 	onMouseLeave={() => setHoverElement(null)}
				// >
				// </div>
				<img
					src={`https://picsum.photos/seed/${id + '3'}/${Math.floor(1600 / (id.length + 1))}/${Math.floor(1600 / (id.length + 1))}`}
					style={{
						width: '100%',
						height: '100%',
						objectFit: 'cover',
					}}
					alt=""
				/>
			}
			{grid["4"] !== null ?
				<RecursiveGrid grid={grid["4"]} id={id + '4'} level={level + 1} /> :
				// <div
				// 	style={{
				// 		boxSizing: 'border-box',
				// 		width: '100%',
				// 		height: '100%',
				// 		border: hoverElement === 4 ? '1px solid red' : 'none',
				// 		backgroundColor: simpleHashRGBA(id + '4', 0.5)
				// 	}}
				// 	onMouseEnter={() => setHoverElement(4)}
				// 	onMouseLeave={() => setHoverElement(null)}
				// >
				// </div>
				<img
					src={`https://picsum.photos/seed/${id + '4'}/${Math.floor(1600 / (id.length + 1))}/${Math.floor(1600 / (id.length + 1))}`}
					style={{
						width: '100%',
						height: '100%',
						objectFit: 'cover',
					}}
					alt=""
				/>
			}
		</div>
	);
}

export default function Home() {
	const [position, setPosition] = useState({
		value: {
			scale: 1,
			translation: { x: 0, y: 0 }
		}
	});
	return (
		<div style={{
			boxSizing: 'border-box',
		}}>
			<MapInteractionCSS
				maxScale={5}
				minScale={0.3}
				value={position.value}
				onChange={(value: any) => setPosition({ value })}
			>
				<div style={{
					width: '100rem',
					height: '100rem',
				}}>
					<RecursiveGrid grid={grid} />
				</div>
			</MapInteractionCSS>
			<Box>
				<Fab
					color="primary"
					aria-label="add"
					sx={{
						position: 'absolute',
						bottom: '1rem',
						right: '1rem',
					}}
					onClick={() => {
						setPosition({
							value: {
								scale: 1,
								translation: { x: 0, y: 0 }
							}
						});
					}}
				>
					<Restore />
				</Fab>
			</Box>
		</div>

	);
};
