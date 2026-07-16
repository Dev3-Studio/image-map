import './Toolbar.css'
import {useControls} from "react-zoom-pan-pinch";

function Toolbar() {
    const { zoomIn, zoomOut, resetTransform, centerView } = useControls();
    return(
        <div id={'toolbar'}>
            <button onClick={()=> zoomIn()}>Zoom In +</button>
            <button onClick={()=> zoomOut()}>Zoom Out -</button>
            <button onClick={()=> resetTransform()}>Reset</button>
            <button onClick={()=> centerView()}>Center</button>
        </div>
    )
}

export default Toolbar;