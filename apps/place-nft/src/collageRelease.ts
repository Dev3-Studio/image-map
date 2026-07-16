export interface CollageRelease {
    schemaVersion: 1
    generationId: string
    sourceRevision: string
    previewUrl: string
    manifestUrl: string
    publishedAt: string
}

export const bundledRelease: CollageRelease = {
    schemaVersion: 1,
    generationId: 'bundled',
    sourceRevision: 'bundled',
    previewUrl: '/collage.webp',
    manifestUrl: '/iiif/manifest.json',
    publishedAt: '1970-01-01T00:00:00.000Z',
}

export function currentReleaseUrl() {
    const baseUrl = import.meta.env.VITE_COLLAGE_RELEASE_BASE_URL?.trim().replace(/\/$/, '')
    return baseUrl ? `${baseUrl}/current.json` : null
}

export async function loadCollageRelease(url: string) {
    const response = await fetch(url, {cache: 'no-store'})
    if (!response.ok) {
        throw new Error(`Collage release request failed with ${response.status}`)
    }

    const release = await response.json() as Partial<CollageRelease>
    if (
        release.schemaVersion !== 1 ||
        !release.generationId ||
        !release.sourceRevision ||
        !release.previewUrl ||
        !release.manifestUrl ||
        !release.publishedAt
    ) {
        throw new Error('Collage release pointer is invalid')
    }

    return release as CollageRelease
}
