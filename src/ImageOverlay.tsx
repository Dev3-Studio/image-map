import './ImageOverlay.css'
function ImageOverlay({filename, title, onClick}: { filename: string|null, title:string, onClick: () => void }) {
    return(
        <div id={'imageOverlay'}>
            <img className="overlay" src={`../fullres/${filename}`} alt="overlay" />
            <h1 className={'overlay-name'}>{title}</h1>
            <h5>Owner: 0x123</h5>
            <p className={'overlay-description'}>Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</p>
            <button onClick={onClick}>x</button>
        </div>
    )
}

export default ImageOverlay;