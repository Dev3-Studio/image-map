import collage from '/collage.webp'
import './App.css'
import {useState} from "react";
import {TransformWrapper, TransformComponent, ReactZoomPanPinchRef} from "react-zoom-pan-pinch";
import coordsjson from './assets/coords.json';
import ImageOverlay from "./ImageOverlay.tsx";
const coordsList = coordsjson as imageCoords[];
import Toolbar from "./Toolbar.tsx";
import ImageGrid from "./ImageGrid.tsx";
import {HIGH_RESOLUTION_TILE_URLS} from "./imageTiles.ts";

const HIGH_RESOLUTION_ZOOM = 1.1;
const HIGH_RESOLUTION_PRELOAD_ORDER = [4, 1, 3, 5, 7, 0, 2, 6, 8];
const preloadedHighResolutionImages: HTMLImageElement[] = [];

interface coords{
    x: number,
    y: number
}

interface imageCoords{
    x: number,
    y: number,
    width: number,
}


function App() {
    const handleClick = () => {
        console.log('relative: ' + relativeMousePos.x + ', ' + relativeMousePos.y);
        let i = 0;
        for (const coords of coordsList){
            i++;
            if (relativeMousePos.x > coords.x && relativeMousePos.x < coords.x + coords.width && relativeMousePos.y > coords.y && relativeMousePos.y < coords.y + coords.width){
                setSelectedImage(`${i-1}.jpg`);
                setDialogOpen(true);
                return;
            }
        }
    }
    const handlePan = (ref: ReactZoomPanPinchRef, event: TouchEvent | MouseEvent) => {
        if ("clientX" in event) {
            setRelativeMousePos({
                x: (event.clientX - ref.state.positionX) / ref.state.scale,
                y: (event.clientY - ref.state.positionY) / ref.state.scale
            })
        }
    }
    const [selectedImage, setSelectedImage] = useState<string|null>(null);
    const [relativeMousePos, setRelativeMousePos] = useState<coords>({x: 0, y: 0});
    const [showHighResolution, setShowHighResolution] = useState<boolean>(false);
    const [dialogOpen, setDialogOpen] = useState<boolean>(false);

    function closeDialog() {
        setDialogOpen(false);
    }

  return (
    <div className={'container'}>
        <div onClick={handleClick} className={'map'}>
            <TransformWrapper
                limitToBounds={false}
                minScale={0.1}
                initialScale={1}
                smooth={false}
                doubleClick={{ disabled: true }}
                centerOnInit={true}
                onTransform={(ref: ReactZoomPanPinchRef) =>
                    setShowHighResolution(ref.state.scale >= HIGH_RESOLUTION_ZOOM)}
                onPanningStop={(ref: ReactZoomPanPinchRef, event) => handlePan(ref, event)}
            >
                <TransformComponent  wrapperClass={'transformWrapper'} contentClass={'transformComponent'}>
                    <img
                        src={collage}
                        alt="Collage map"
                        id={'collage'}
                        draggable={false}
                        onLoad={() => {
                            if (preloadedHighResolutionImages.length > 0) {
                                return;
                            }

                            HIGH_RESOLUTION_PRELOAD_ORDER.forEach((index) => {
                                const image = new Image();
                                image.decoding = 'async';
                                image.fetchPriority = 'low';
                                image.src = HIGH_RESOLUTION_TILE_URLS[index];
                                preloadedHighResolutionImages.push(image);
                            });
                        }}
                    />
                    <ImageGrid visible={showHighResolution}/>
                </TransformComponent>
                <Toolbar/>
            </TransformWrapper>
        </div>
        {dialogOpen && <ImageOverlay filename={selectedImage} title={selectedImage!} onClick={()=>
            closeDialog()}/>}
    </div>
  )
}

export default App
