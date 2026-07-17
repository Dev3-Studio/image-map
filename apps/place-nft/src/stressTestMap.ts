import {type IIIFMapDefinition, type IIIFPlacement} from './iiifManifest.ts'

const FIXTURE_TILE_COUNT = 4_999
const MAP_SIZE = 12_800

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

            const placements: IIIFPlacement[] = []
            fixtureCoords.forEach((coords, fixtureIndex) => {
                // The legacy fixture stores each edge at twice the size used by the 12,800px collage.
                const width = coords.width / 2
                // Split one region into two photographs to turn the 4,999-leaf fixture into 5,000 tiles.
                const placementCount = fixtureIndex === 0 ? 2 : 1

                for (let part = 0; part < placementCount; part += 1) {
                    const placementWidth = fixtureIndex === 0 ? width / 2 : width
                    const placementHeight = width
                    const index = placements.length
                    const sourceWidth = Math.max(240, Math.min(900, Math.round(placementWidth * 1.5)))
                    const sourceHeight = Math.max(240, Math.min(900, Math.round(placementHeight * 1.5)))

                    placements.push({
                        id: `stress-tile-${index}`,
                        x: coords.x + part * placementWidth,
                        y: coords.y,
                        width: placementWidth,
                        height: placementHeight,
                        thumbnail: `https://picsum.photos/seed/tessera-${index}/${sourceWidth}/${sourceHeight}`,
                    })
                }
            })

            return {
                width: MAP_SIZE,
                height: MAP_SIZE,
                previewUrl: '/collage-stress.webp',
                placements,
            }
        })
        .catch((error) => {
            stressTestMapPromise = null
            throw error
        })

    return stressTestMapPromise
}
