import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync } from 'node:fs'

const fullResolutionImageUrls = Object.fromEntries(
  readdirSync(new URL('./public/fullres', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .flatMap((entry) => {
      const match = entry.name.match(/^(\d+)\.(?:avif|jpe?g|png|webp)$/i)

      return match ? [[match[1], `/fullres/${entry.name}`] as const] : []
    }),
)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __FULL_RESOLUTION_IMAGE_URLS__: JSON.stringify(fullResolutionImageUrls),
  },
})
