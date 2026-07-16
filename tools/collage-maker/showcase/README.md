# Showcase sources

The nine 2048px placeholder photographs in this folder are deterministic [Lorem Picsum](https://picsum.photos/) samples using image IDs 10, 29, 42, 64, 76, 91, 102, 119, and 137.

They exist only to demonstrate the local IIIF pipeline. Replace them with the production image feed and run:

```powershell
pnpm nx -- run collage-maker:publish-showcase
```

The command regenerates the IIIF manifest, Image API services, preview collage, and navigation coordinates together.
