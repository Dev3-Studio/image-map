import './ImageOverlay.css'
function ImageOverlay({filename, title, onClick}: { filename: string|null, title:string, onClick: () => void }) {
    return(
        <div id={'imageOverlay'}>
            <img src={`../public/fullres/${filename}`} alt="overlay" className="overlay" />
            <h1>{title}</h1>
            <p>Example Description</p>
            <button onClick={()=> onClick}>x</button>
        </div>
    )
}

export default ImageOverlay;