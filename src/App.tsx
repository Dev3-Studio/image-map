import collage from '/collage.avif'
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


//calculate the coordinates for the top left corner of an image
// function calculateCoords(pathArr: number[], image_width: number): coords {
//     let x = 0;
//     let y = 0;
//     let i = 1;
//     for (const num of pathArr) {
//         switch (num) {
//             case 1:
//                 break;
//             case 2:
//                 x += image_width / 2 ** i;
//                 break;
//             case 3:
//                 y += image_width / 2 ** i;
//                 break;
//             case 4:
//                 x += image_width / 2 ** i;
//                 y += image_width / 2 ** i;
//                 break;
//             default:
//                 break;
//         }
//         i ++;
//     }
//     return {x, y};
// }

function App() {
    const handleClick = () => {
        console.log(relativeMousePos);
        let i = 0;
        for (const coords of coordsList){
            i++;

            if (relativeMousePos.x > coords.x && relativeMousePos.x < coords.x + coords.width && relativeMousePos.y > coords.y && relativeMousePos.y < coords.y + coords.width){
                console.log('clicked on image' + i);
                setSelectedImage(`${i-1}.jpg`);
                dialog.show();
                console.log(selectedImage);
            }

        }
    }
    const handleZoom = (ref: ReactZoomPanPinchRef, event) => {

        setRelativeMousePos({ x: mousePos.x * ref.state.scale, y: mousePos.y * ref.state.scale })
    }
    const handlePan = (ref: ReactZoomPanPinchRef, event) => {
        setRelativeMousePos({ x: mousePos.x + ref.state.positionX, y: mousePos.y + ref.state.positionY })
    }
    const dialog: DialogHTMLAttributes<HTMLElement> = document.getElementById('imageOverlay');
    const [selectedImage, setSelectedImage] = useState<string|null>(null);
    const [mousePos, setMousePos] = useState<coords>({x: 0, y: 0});
    const [relativeMousePos, setRelativeMousePos] = useState<coords>({x: 0, y: 0});
    useEffect(() => {
        const handleMouseMove = (event) => {
            setMousePos({ x: event.clientX, y: event.clientY });
        };

        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener(
                'mousemove',
                handleMouseMove
            );
        };
    }, [mousePos]);

  return (
    <div className={'container'} onClick={handleClick}>
        <ImageOverlay filename={selectedImage} onClick={()=>{}}/>
        <TransformWrapper limitToBounds={false} minScale={0.1} initialScale={1}
                          onZoomStop={(ref: ReactZoomPanPinchRef, event) => handleZoom(ref, event)}
                          onPanningStop={(ref: ReactZoomPanPinchRef, event) => handlePan(ref, event)}>
            <TransformComponent>
            <img src={collage} alt="collage" id={'collage'} onClick={() => handleClick()}/>
            </TransformComponent>
        </TransformWrapper>
    </div>
  )
}

export default App
