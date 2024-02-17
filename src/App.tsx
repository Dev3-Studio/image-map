import collage from '/collage.avif'
import './App.css'
import {useEffect, useState} from "react";

function App() {
    const handleClick = () => {
        console.log(mousePos);

    }
    const [mousePos, setMousePos] = useState({});
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
    }, []);

  return (
    <div className={'container'}>
        <img src={collage} alt="collage" id={'collage'} onClick={() => handleClick()}/>
    </div>
  )
}

export default App
