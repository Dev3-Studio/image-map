import collage from '/collage.webp'
import './App.css'
import {useState} from "react";
import {TransformWrapper, TransformComponent, ReactZoomPanPinchRef} from "react-zoom-pan-pinch";
import coordsjson from '../public/coords.json';
import ImageOverlay from "./ImageOverlay.tsx";
const coordsList = coordsjson as imageCoords[];
import Toolbar from "./Toolbar.tsx";
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
        // console.log('relative: ' + relativeMousePos.x + ', ' + relativeMousePos.y);
        let i = 0;
        for (const coords of coordsList){
            i++;

            if (relativeMousePos.x > coords.x && relativeMousePos.x < coords.x + coords.width && relativeMousePos.y > coords.y && relativeMousePos.y < coords.y + coords.width){
                // console.log('clicked on image' + i);
                setSelectedImage(`${i-1}.jpg`);
                setDialogOpen(true);
                console.log(dialogOpen);
                // if (dialog) dialog.show();
                // console.log(selectedImage);
            }

        }
    }
    const handleZoom = (ref: ReactZoomPanPinchRef) => {
        setZoom(ref.state.scale);
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
        console.log(dialogOpen);
    }

  return (

    <div className={'container'}>
        <div className={'map'} onClick={handleClick}>
            <TransformWrapper limitToBounds={false} minScale={0.1} initialScale={1}
                              onZoomStop={(ref: ReactZoomPanPinchRef) => handleZoom(ref)}
                              onPanningStop={(ref: ReactZoomPanPinchRef, event) => handlePan(ref, event)}
            >
                <TransformComponent>
                    <img src={collage} alt="collage" id={'collage'}/>
                </TransformComponent>

            </TransformWrapper>
        </div>
        {dialogOpen && <ImageOverlay filename={selectedImage} title={selectedImage!} onClick={()=>
            closeDialog()}/>}

        <Toolbar/>
    </div>
  )
}

export default App
