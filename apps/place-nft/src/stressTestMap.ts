import {type IIIFMapDefinition, type IIIFPlacement} from './iiifManifest.ts'

const FIXTURE_TILE_COUNT = 4_999
const MAP_SIZE = 12_800
const R2_DEMO_URL = 'https://pub-78666f1dd7984ef69f57781fac523d68.r2.dev/tessera-5000-v1'

interface FixtureCoords {
    x: number
    y: number
    width: number
}

let stressTestMapPromise: Promise<IIIFMapDefinition> | null = null

export function loadStressTestMap() {
    if (stressTestMapPromise) {
        return stressTestMapPromise
    }

    stressTestMapPromise = fetch('/coords4999.json')
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Stress-test coordinates request failed with ${response.status}`)
            }

            return response.json() as Promise<FixtureCoords[]>
        })
        .then((fixtureCoords) => {
            if (fixtureCoords.length !== FIXTURE_TILE_COUNT) {
                throw new Error(`Expected ${FIXTURE_TILE_COUNT} stress-test coordinates`)
            }

            const placements: IIIFPlacement[] = fixtureCoords.map((coords, index) => {
                const width = coords.width / 2
                return {
                    id: `stress-tile-${index}`,
                    x: coords.x,
                    y: coords.y,
                    width,
                    height: width,
                    thumbnail: `${R2_DEMO_URL}/iiif/images/${index}.jpg`,
                }
            })
            const first = placements[0]
            placements.push({
                id: `stress-tile-${FIXTURE_TILE_COUNT}`,
                x: first.x,
                y: first.y,
                width: first.width / 2,
                height: first.height / 2,
                thumbnail: `${R2_DEMO_URL}/iiif/images/${FIXTURE_TILE_COUNT}.jpg`,
            })

            return {
                width: MAP_SIZE,
                height: MAP_SIZE,
                previewUrl: `${R2_DEMO_URL}/collage.webp`,
                mediumPreviewUrl: `${R2_DEMO_URL}/collage-medium.webp`,
                placements,
            }
        })
        .catch((error) => {
            stressTestMapPromise = null
            throw error
        })

    return stressTestMapPromise
}
