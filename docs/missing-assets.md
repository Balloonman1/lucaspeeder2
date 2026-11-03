# Missing production assets

The build is not visually complete until every entry here is replaced. The development environment can only
download from GitHub and npm, so these must be downloaded by hand and committed (Git LFS) into `public/assets/`.

| Slot | Needed | Where to get it | Drop-in path |
| --- | --- | --- | --- |
| Hero hover bike | Game-ready hover bike, ~100k tris, 4K PBR (albedo/normal/ORM), livery mask, thruster nodes | Fab, CGTrader, Sketchfab (royalty-free license), or commission | `public/assets/models/bike_scout.glb` |
| Rider | Game-ready motorcyclist/pilot, Mixamo-compatible rig, 2K PBR | Fab, CGTrader, Reallusion ActorCore | `public/assets/models/rider.glb` |
| Canyon rocks (8–12) | Photogrammetry sandstone boulders and cliff chunks with LODs | Quixel Megascans (Fab), Poly Haven models (CC0) | `public/assets/models/rocks/*.glb` |
| Desert vegetation | Scanned grass, scrub and flower atlases (alpha + normal) | Megascans, Poly Haven plants | `public/assets/textures/veg/*` |
| Foods (10) | Scanned rice bowl, strawberries, raspberries, vegetables, bagel, toast, milk carton, tomatoes, cherries, drink can | Phone photogrammetry (RealityScan/Polycam) or Sketchfab CC-BY scans | `public/assets/models/food/*.glb` |
| Sky HDRIs | Desert sunrise / noon / golden hour, 4K | Poly Haven (CC0) | `public/assets/hdri/*.hdr` |
