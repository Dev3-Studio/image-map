'use client';

/* eslint-disable @next/next/no-img-element */
import { Restore } from '@mui/icons-material';
import Fab from '@mui/material/Fab';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import gridData from './grid.json';

const quadrants = ['1', '2', '3', '4'] as const;

interface GridNode {
  '1': GridNode | null;
  '2': GridNode | null;
  '3': GridNode | null;
  '4': GridNode | null;
}

function RecursiveGrid({ grid, id = '' }: { grid: GridNode; id?: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gridTemplateRows: 'repeat(2, 1fr)',
        width: '100%',
        height: '100%',
        gap: 0,
      }}
    >
      {quadrants.map((quadrant) => {
        const child = grid[quadrant];
        const imageId = `${id}${quadrant}`;

        return child ? (
          <RecursiveGrid key={imageId} grid={child} id={imageId} />
        ) : (
          <img
            key={imageId}
            src={`https://picsum.photos/seed/${imageId}/${Math.floor(1600 / (id.length + 1))}/${Math.floor(1600 / (id.length + 1))}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            alt=""
          />
        );
      })}
    </div>
  );
}

export default function Home() {
  return (
    <TransformWrapper initialScale={1} minScale={0.3} maxScale={5} limitToBounds={false}>
      {({ resetTransform }) => (
        <>
          <TransformComponent
            wrapperStyle={{ width: '100vw', height: '100vh' }}
            contentStyle={{ width: '100rem', height: '100rem' }}
          >
            <RecursiveGrid grid={gridData as GridNode} />
          </TransformComponent>
          <Fab
            color="primary"
            aria-label="reset view"
            sx={{ position: 'fixed', bottom: '1rem', right: '1rem' }}
            onClick={() => resetTransform()}
          >
            <Restore />
          </Fab>
        </>
      )}
    </TransformWrapper>
  );
}
