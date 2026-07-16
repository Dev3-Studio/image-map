import {useEffect, useState} from 'react';
import {useTransformContext} from 'react-zoom-pan-pinch';
import coordsjson from './assets/coords.json';
import './FullResolutionImageLayer.css';

const PRELOAD_MARGIN = 320;

interface ImageCoordinates {
    x: number;
    y: number;
    width: number;
}

interface FullResolutionImage extends ImageCoordinates {
    index: number;
    src: string;
}

const coordsList = coordsjson as ImageCoordinates[];
const fullResolutionImages = Object.entries(__FULL_RESOLUTION_IMAGE_URLS__).flatMap(
    ([rawIndex, src]) => {
        const index = Number(rawIndex);
        const coordinates = coordsList[index];

        return coordinates ? [{...coordinates, index, src}] : [];
    },
);

function FullResolutionImageLayer() {
    const transformContext = useTransformContext();
    const [visibleImages, setVisibleImages] = useState<FullResolutionImage[]>([]);

    useEffect(() => {
        let animationFrame: number | null = null;

        const updateVisibleImages = () => {
            if (animationFrame !== null) {
                return;
            }

            animationFrame = window.requestAnimationFrame(() => {
                animationFrame = null;

                const wrapper = transformContext.wrapperComponent;
                if (!wrapper) {
                    return;
                }

                const {positionX, positionY, scale} = transformContext.state;
                const left = (-positionX - PRELOAD_MARGIN) / scale;
                const top = (-positionY - PRELOAD_MARGIN) / scale;
                const right = (-positionX + wrapper.offsetWidth + PRELOAD_MARGIN) / scale;
                const bottom = (-positionY + wrapper.offsetHeight + PRELOAD_MARGIN) / scale;
                const nextVisibleImages = fullResolutionImages.filter((image) =>
                    image.x < right &&
                    image.x + image.width > left &&
                    image.y < bottom &&
                    image.y + image.width > top
                );

                setVisibleImages((currentImages) => {
                    const unchanged = currentImages.length === nextVisibleImages.length &&
                        currentImages.every((image, index) =>
                            image.index === nextVisibleImages[index].index);

                    return unchanged ? currentImages : nextVisibleImages;
                });
            });
        };

        updateVisibleImages();
        const unsubscribe = transformContext.onChange(updateVisibleImages);
        window.addEventListener('resize', updateVisibleImages);

        return () => {
            unsubscribe();
            window.removeEventListener('resize', updateVisibleImages);

            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
            }
        };
    }, [transformContext]);

    return (
        <div
            id={'fullResolutionImageLayer'}
            aria-hidden={true}
            data-visible-image-count={visibleImages.length}
        >
            {visibleImages.map(({index, src, x, y, width}) => (
                <img
                    key={index}
                    className={'fullResolutionImage'}
                    src={src}
                    alt={''}
                    decoding={'async'}
                    fetchPriority={'high'}
                    draggable={false}
                    style={{left: x, top: y, width, height: width}}
                />
            ))}
        </div>
    );
}

export default FullResolutionImageLayer;
