import './ImageGrid.css'

function ImageGrid() {
    return(
        <div id={'imageGrid'}>
            <img src={'/subimages/collage-sub0.webp'} className={'imageGrid-0'} alt={'0'} loading={"lazy"}/>
            <img src={'/subimages/collage-sub1.webp'} className={'imageGrid-1'} alt={'1'} loading={"lazy"}/>
            <img src={'/subimages/collage-sub2.webp'} className={'imageGrid-2'} alt={'2'} loading={"lazy"}/>
            <img src={'/subimages/collage-sub3.webp'} className={'imageGrid-3'} alt={'3'} loading={"lazy"}/>
            <img src={'/subimages/collage-sub4.webp'} className={'imageGrid-4'} alt={'4'} loading={"lazy"}/>
            <img src={'/subimages/collage-sub5.webp'} className={'imageGrid-5'} alt={'5'} loading={"lazy"}/>
            <img src={'/subimages/collage-sub6.webp'} className={'imageGrid-6'} alt={'6'} loading={"lazy"}/>
            <img src={'/subimages/collage-sub7.webp'} className={'imageGrid-7'} alt={'7'} loading={"lazy"}/>
            <img src={'/subimages/collage-sub8.webp'} className={'imageGrid-8'} alt={'8'} loading={"lazy"}/>
        </div>
    )

}
export default ImageGrid;