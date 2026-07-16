import collage from '/collage.webp'
import './App.css'
import {useState} from "react";
import {TransformWrapper, TransformComponent, ReactZoomPanPinchRef} from "react-zoom-pan-pinch";
import coordsjson from './assets/coords.json';
import ImageOverlay from "./ImageOverlay.tsx";
const coordsList = coordsjson as imageCoords[];
import Toolbar from "./Toolbar.tsx";
// @ts-expect-error not used for testing
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import ImageGrid from "./ImageGrid.tsx";
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
    const handleZoom = (ref: ReactZoomPanPinchRef) => {
        setZoom(ref.state.scale);
        console.log('zoom' + ref.state.scale)
        // setRelativeMousePos({ x: mousePos.x * ref.state.scale, y: mousePos.y * ref.state.scale })
    }
    const handlePan = (ref: ReactZoomPanPinchRef, event: TouchEvent | MouseEvent) => {
        if ("clientX" in event) {
            setRelativeMousePos({
                x: (event.clientX - ref.state.positionX) / zoom,
                y: (event.clientY - ref.state.positionY) / zoom
            })
        }
    }
    const [selectedImage, setSelectedImage] = useState<string|null>(null);
    const [relativeMousePos, setRelativeMousePos] = useState<coords>({x: 0, y: 0});
    const [zoom, setZoom] = useState<number>(1);
    const [dialogOpen, setDialogOpen] = useState<boolean>(false);

    function closeDialog() {
        setDialogOpen(false);
    }

  return (
    <div className={'container'}>
        <div onClick={handleClick} className={'map'}>
            <TransformWrapper limitToBounds={false} minScale={0.1} initialScale={1} doubleClick={{ disabled: true }}
                              centerOnInit={true} onZoomStop={(ref: ReactZoomPanPinchRef) => handleZoom(ref)}
                              // minPositionX={-100} minPositionY={-100} maxPositionX={9000} maxPositionY={9000}
                              onPanningStop={(ref: ReactZoomPanPinchRef, event) => handlePan(ref, event)
            }>
                <TransformComponent  wrapperClass={'transformWrapper'} contentClass={'transformComponent'}>
                    {<img src={collage} alt="collage" id={'collage'}/>}
                    {/*{(zoom >= 0.5) && <ImageGrid />}*/}
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
