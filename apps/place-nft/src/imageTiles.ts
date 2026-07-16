export const TILES_PER_SIDE = 3;

export const HIGH_RESOLUTION_TILE_URLS = Array.from(
    {length: TILES_PER_SIDE ** 2},
    (_, index) => `/subimages/collage-sub${index}.webp`,
);
