import './ImageGrid.css'
import {Virtualize} from 'react-zoom-pan-pinch';

const MAP_SIZE = 7680;
const TILES_PER_SIDE = 3;
const TILE_SIZE = MAP_SIZE / TILES_PER_SIDE;
const PRELOAD_MARGIN = 400;

const tiles = Array.from({length: TILES_PER_SIDE ** 2}, (_, index) => ({
    index,
    x: (index % TILES_PER_SIDE) * TILE_SIZE,
    y: Math.floor(index / TILES_PER_SIDE) * TILE_SIZE,
}));

function ImageGrid({visible}: {visible: boolean}) {
    if (!visible) {
        return null;
    }

    return(
        <div id={'imageGrid'} aria-hidden={true}>
            {tiles.map(({index, x, y}) => (
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
                        src={`/subimages/collage-sub${index}.webp`}
                        alt={''}
                        decoding={'async'}
                        draggable={false}
                    />
                </Virtualize>
            ))}
        </div>
    )
}

export default ImageGrid;
