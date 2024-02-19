function ImageOverlay({filename, onClick}: { filename: string|null,  onClick: () => void }) {
    return(
        <dialog id={'imageOverlay'}>
            <img src={`../public/fullres/${filename}`} alt="overlay" className="overlay" />
            <h1>Example Title</h1>
            <p>Example Description</p>
            <button onClick={()=> onClick}>x</button>
        </dialog>
    )
}

export default ImageOverlay;