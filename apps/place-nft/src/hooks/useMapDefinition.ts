import {useEffect, useState} from 'react'
import useSWR from 'swr'
import coordsjson from '../assets/coords.json'
import {currentReleaseUrl, loadCollageRelease} from '../collageRelease.ts'
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
    generationId: string
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
    const {data: remoteRelease} = useSWR(
        useShowcase ? null : currentReleaseUrl(),
        loadCollageRelease,
        {
            refreshInterval: 15_000,
            refreshWhenHidden: false,
            revalidateOnFocus: true,
        },
    )

    useEffect(() => {
        let cancelled = false

        void (async () => {
            try {
                const definition = useShowcase
                    ? await loadIIIFManifest()
                    : remoteRelease
                        ? await loadIIIFManifest(remoteRelease.manifestUrl, remoteRelease.previewUrl)
                        : await loadStressTestMap()

                if (!cancelled) {
                    setMapState({
                        definition,
                        generationId: useShowcase
                            ? 'showcase'
                            : remoteRelease?.generationId ?? 'stress-test',
                        manifestReady: true,
                    })
                }
            } catch {
                if (remoteRelease && !useShowcase) {
                    try {
                        const definition = await loadStressTestMap()
                        if (!cancelled) {
                            setMapState({
                                definition,
                                generationId: 'stress-test',
                                manifestReady: true,
                            })
                        }
                        return
                    } catch {
                        // Fall through to the bundled coordinate fallback.
                    }
                }

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
                        generationId: 'fallback',
                        manifestReady: false,
                    })
                }
            }
        })()

        return () => {
            cancelled = true
        }
    }, [remoteRelease, useShowcase])

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
