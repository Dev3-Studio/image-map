import {useEffect, useState} from 'react'
import coordsjson from '../assets/coords.json'
import {loadIIIFManifest, type IIIFMapDefinition} from '../iiifManifest.ts'
import {
    loadStressTestMap,
    STRESS_PREVIEW_AVIF_URL,
    STRESS_PREVIEW_URL,
} from '../stressTestMap.ts'

const FALLBACK_MAP_SIZE = 768

interface FallbackCoords {
    x: number
    y: number
    width: number
}

const fallbackCoordsList = coordsjson as FallbackCoords[]

export interface MapPreviewSources {
    previewUrl: string
    previewAvifUrl?: string
}

export interface MapState {
    definition: IIIFMapDefinition
    manifestReady: boolean
}

const SHOWCASE_PREVIEW: MapPreviewSources = {previewUrl: '/collage.webp'}
const STRESS_PREVIEW: MapPreviewSources = {
    previewUrl: STRESS_PREVIEW_URL,
    previewAvifUrl: STRESS_PREVIEW_AVIF_URL,
}

export function isShowcaseDemo() {
    return new URLSearchParams(window.location.search).get('demo') === 'showcase'
}

/**
 * Loads the map every surface draws from. Both loaders memoize their request, so
 * the landing page and the map share one fetch and one resolved definition.
 */
export function useMapDefinition() {
    const useShowcase = isShowcaseDemo()
    const [mapState, setMapState] = useState<MapState | null>(null)

    useEffect(() => {
        let cancelled = false

        const loadMap = useShowcase ? loadIIIFManifest : loadStressTestMap
        loadMap()
            .then((definition) => {
                if (!cancelled) {
                    setMapState({definition, manifestReady: true})
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setMapState({
                        definition: {
                            width: FALLBACK_MAP_SIZE,
                            height: FALLBACK_MAP_SIZE,
                            previewUrl: '/collage.webp',
                            placements: fallbackCoordsList.map((coords, index) => ({
                                ...coords,
                                height: coords.width,
                                id: `fallback-${index}`,
                            })),
                        },
                        manifestReady: false,
                    })
                }
            })

        return () => {
            cancelled = true
        }
    }, [useShowcase])

    // Before the definition resolves, fall back to the preview the active demo is
    // known to load, so the first paint already shows the right image.
    const preview: MapPreviewSources = mapState
        ? {
            previewUrl: mapState.definition.previewUrl,
            previewAvifUrl: mapState.definition.previewAvifUrl,
        }
        : useShowcase ? SHOWCASE_PREVIEW : STRESS_PREVIEW

    return {mapState, preview, useShowcase}
}
