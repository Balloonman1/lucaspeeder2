# Asset inventory and credits

Every file under `public/assets/` is listed here with its source and license.

## Scanned PBR textures (Poly Haven, CC0) — `public/assets/textures/{1k,2k}`
rocky_trail, forrest_ground_01, rocks_ground_02, rock_face_03, sand_01, rock_boulder_dry, brown_mud_02.
Source: https://polyhaven.com/textures (mirrored via the original lucaspeeder repo and moritzbrantner/asset-tooling). License: CC0.

## HDRI (Poly Haven, CC0) — `public/assets/hdri/kiara_1_dawn_1k.hdr`

## Models — `public/assets/models`
- `Soldier.glb` — Mixamo "Vanguard" soldier as distributed in the three.js examples (rider). Mixamo/Adobe license permits use inside a game; not redistributable standalone.
- `WaterBottle.glb` — Khronos glTF Sample Assets, © Microsoft, CC-BY 4.0 (energy drink body).

## Audio (Kenney, CC0) — `public/assets/audio`
impactSoft_heavy_000, impactMetal_medium_000, confirmation_001, click_001, error_008, jingles_STEEL02, glass_001.

## Generated at build or runtime (original work, no license needed)
- `public/assets/levels/veyra/*` — heightfield, splat map and trail data from `tools/gen-terrain.mjs`.
- Grass/flower atlas, particle sprites, locator ring, scuff map, food labels — drawn on canvas at startup (`src/engine/textures.ts`, `src/engine/items.ts`).

## TEMPORARY stand-ins (not final quality, see docs/missing-assets.md)
- Hover bike (`src/engine/bike.ts`): built in code from lofted sections and parts.
- Foods, tomatoes, cherries (`src/engine/items.ts`): built in code.
- Boulders, hoodoos, comms masts (`src/engine/rocks.ts`): procedural geometry wrapped in scanned textures.
- Grass, scrub and flower cards (`src/engine/vegetation.ts`): procedural atlas.
