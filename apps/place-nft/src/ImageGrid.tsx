import './ImageGrid.css'
import {Virtualize} from 'react-zoom-pan-pinch';
import {HIGH_RESOLUTION_TILE_URLS, TILES_PER_SIDE} from './imageTiles.ts';

const MAP_SIZE = 7680;
const TILE_SIZE = MAP_SIZE / TILES_PER_SIDE;
const PRELOAD_MARGIN = 400;

const tiles = HIGH_RESOLUTION_TILE_URLS.map((src, index) => ({
    index,
    src,
    x: (index % TILES_PER_SIDE) * TILE_SIZE,
    y: Math.floor(index / TILES_PER_SIDE) * TILE_SIZE,
}));

function ImageGrid({visible}: {visible: boolean}) {
    if (!visible) {
        return null;
    }

    return(
        <div id={'imageGrid'} aria-hidden={true}>
            {tiles.map(({index, src, x, y}) => (
                <Virtualize
                    key={index}
                    x={x}
                    y={y}
                    width={TILE_SIZE}
                    height={TILE_SIZE}
                    margin={PRELOAD_MARGIN}
                    className={'imageGrid-tile'}
                    style={{left: x, top: y, width: TILE_SIZE, height: TILE_SIZE}}
                >
                    <img
                        src={src}
                        alt={''}
                        decoding={'async'}
                        fetchPriority={'high'}
                        draggable={false}
                    />
                </Virtualize>
            ))}
        </div>
    )
}

export default ImageGrid;
