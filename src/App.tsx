import collage from '/collage.webp'
import './App.css'
import {DialogHTMLAttributes, useEffect, useState} from "react";
import {TransformWrapper, TransformComponent, ReactZoomPanPinchRef} from "react-zoom-pan-pinch";
import coordsjson from '../public/coords.json';
import ImageOverlay from "./ImageOverlay.tsx";
const coordsList = coordsjson as imageCoords[];
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
                console.log('clicked on image' + i);
                setSelectedImage(`${i-1}.jpg`);
                // if (dialog) dialog.show();
                console.log(selectedImage);
            }

        }
    }
    const handleZoom = (ref: ReactZoomPanPinchRef) => {
        setZoom(ref.state.scale);
        // setRelativeMousePos({ x: mousePos.x * ref.state.scale, y: mousePos.y * ref.state.scale })
    }
    const handlePan = (ref: ReactZoomPanPinchRef, event) => {
        setRelativeMousePos({ x: (event.clientX - ref.state.positionX) / zoom, y: (event.clientY - ref.state.positionY) / zoom})
    }
    const dialog: HTMLDialogElement|null = document.getElementById('imageOverlay') as HTMLDialogElement|null;
    const [selectedImage, setSelectedImage] = useState<string|null>(null);
    const [relativeMousePos, setRelativeMousePos] = useState<coords>({x: 0, y: 0});
    const [zoom, setZoom] = useState<number>(1);

  return (
    <div className={'container'} onClick={handleClick}>

        <TransformWrapper limitToBounds={false} minScale={0.1} initialScale={1}
                          onZoomStop={(ref: ReactZoomPanPinchRef, event) => handleZoom(ref, event)}
                          onPanningStop={(ref: ReactZoomPanPinchRef, event) => handlePan(ref, event)}>
            <TransformComponent>

            <img src={collage} alt="collage" id={'collage'} onClick={() => handleClick()}/>
            </TransformComponent>

        </TransformWrapper>
        <ImageOverlay filename={selectedImage} title={'Example Title'} onClick={()=> {
            dialog?.close()
            setSelectedImage(null)
        }}/>
    </div>
  )
}

export default App
