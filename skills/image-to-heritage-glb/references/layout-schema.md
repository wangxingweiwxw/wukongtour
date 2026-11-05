# Agent-authored layout schema (version 1)

The agent first inspects the user's images and records visible architectural facts and uncertain assumptions, then writes this JSON layout. The script constructs geometry from that description; it does **not** recover a 3D model directly from bitmap pixels. Roof shape, hidden facades, dimensions and joinery are interpretations unless the supplied evidence establishes them.

The builder and validator use only Node built-in modules. They run from any working directory and never import the game project, npm packages, Blender, Python, credentials or network services.

```sh
node /absolute/skill/scripts/build_glb.mjs --spec /absolute/layout.json --out /absolute/output/model.glb --report /absolute/output/build-report.json
node /absolute/skill/scripts/validate_glb.mjs /absolute/output/model.glb --report /absolute/output/validation.json
```

Paths are resolved against the caller's current working directory. Output files are replaced at the explicitly supplied paths; source, GLB and report paths must be distinct. Use a new output filename when retaining an earlier version. Validation finishes before the GLB is written.

## Coordinate and material conventions

- `version` is `1`; `units` is `"meters"` (optional, always meters).
- Right-handed coordinates: +Y up, +Z building front. Viewed from the front toward the origin, +X is screen-right. Ground is Y=0. Positions are `[x,y,z]`; angles are yaw radians about +Y.
- A building's `position` is its footprint center at the base's bottom. All dimensions are meters. `height` measures the timber frame above the platform, not total roof height.
- `id` must be globally unique, begin with a letter/digit, and contain only letters, digits, `_` or `-`, maximum 64 characters. Node names are stable derivatives of these IDs; reserve names such as `id-roof-1` for generated nodes.
- Optional `materials` entries are `{ "color":"#rrggbb", "roughness":0.9, "metallic":0 }`. Hex colors are sRGB, converted to linear PBR base-color factors. Defaults: `stone`, `stoneDark`, `timber`, `timberDark`, `red`, `plaster`, `tile`, `tileLight`, `rock`, `path`. No external textures are needed.
- Optional `seed` is a finite number controlling deterministic rock variation.

## Top-level fields

```json
{
  "version": 1,
  "name": "Courtyard interpretation",
  "description": "Observed features and explicitly stated assumptions",
  "units": "meters",
  "seed": 29,
  "materials": {"timber": {"color":"#76513a", "roughness":0.9}},
  "buildings": [],
  "terraces": [],
  "stairs": [],
  "walls": [],
  "rocks": [],
  "paths": [],
  "walk": {"spawn":[0,0,20], "bounds":{"minX":-25,"maxX":25,"minZ":-25,"maxZ":25}}
}
```

At least one building is required. Object lists have a maximum of 300 entries each. The complete, walkable example is [assets/example-layout.json](../assets/example-layout.json).

## Buildings

```json
{
  "id": "main-hall",
  "name": "Main hall",
  "description": "Three bays, front and rear doors, two roof tiers",
  "type": "hall",
  "position": [0,0,-4],
  "rotation": 0,
  "width": 14,
  "depth": 9,
  "height": 4.6,
  "bays": 3,
  "base": {"height":0.54, "stairs":"both"},
  "doors": {"front":true, "back":true, "width":2.8, "height":2.9},
  "roof": {"levels":2, "rise":2.0, "overhang":1.1, "cornerLift":0.65, "curve":1.7, "material":"tile", "trimMaterial":"tileLight"},
  "materials": {"base":"stone", "frame":"red", "beam":"timber", "wall":"plaster", "door":"timberDark"}
}
```

`type` is `hall`, `gate` or `pavilion`. Halls and gates have enclosing walls with real central front/rear door openings; doors are held open beside the jambs. Pavilions have no enclosing walls. Gates default to a zero-height base; other types default to 0.54m. The script produces a simplified architectural interpretation, not a historical joinery survey.

`width`: 4..100 (default 12); `depth`: 3..100 (default 8); `height`: 2.8..30 (default 4.4). `bays` must be odd, 1..9, with each bay at least 1.4m wide. Defaults use 3 bays. For a comfortably walkable hall, prefer width ≥8m and door width ≥2.2m; columns and doorway collision padding reduce the usable opening.

`base.height`: 0..3. `base.stairs`: `front`, `both`, `all` or `none`; halls/gates default to `both`, pavilions to `all`. Automatic stair rises are at most 0.18m, tread depths 0.6m. Raised walkable buildings require stairs. A building placed on a separate terrace should use a matching base-bottom Y, and the terrace must have its own accessible stairs.

### Platform, stair and entrance extents

`width` and `depth` measure the column/wall footprint, **excluding** the platform, stairs and roof overhang. Let `w=width`, `d=depth`, `h=base.height`, and `D=doors.width` after defaults. Before applying the building's yaw and position:

- The platform's walk surface is `[-(w+1)/2, +(w+1)/2] × [-(d+1)/2, +(d+1)/2]` at local Y=`h`. Its visible cap projects another 0.04m on each side. When `h=0`, no slab or automatic stairs are created, but the same nominal rectangle remains in `floorBounds`.
- There are `n=ceil(h/0.18)` steps (`n=0` when `h=0`), with actual rise `h/n` and nominal tread depth 0.6m. Stair run is `L=0.6n`; automatic stair width is `S=max(2.4,D+0.4)`.
- Front stairs occupy local X=`[-S/2,S/2]`, Z=`[(d+1)/2,(d+1)/2+L]`; rear stairs mirror that footprint across Z=0. Side stairs occupy X=`[(w+1)/2,(w+1)/2+L]` or its negative mirror, with Z=`[-S/2,S/2]`.
- Each visible tread and its matching walk surface overlap nominal edges by 0.01m on every side (2cm added to width/depth). Include this small overlap when fitting stairs tightly against another object.
- The main `entry` is `[0,0,(d+1)/2+L+1.2]`. If the front door is disabled and the rear door is enabled, its Z sign is reversed. `interior` is `[0,h,0]`. Thus the entry is on the building's surrounding floor, **not** on its raised platform; world Y adds `position[1]`.
- Pavilions with `base.stairs:"all"` also emit `sideEntries` at `[±((w+1)/2+L+1.2),0,0]`, including when `h=0`. Other types/modes emit no side entries. Rotate all these coordinates by the building's yaw, then add its position to obtain metadata/world coordinates.

| `base.stairs` | Automatic stairs when `h>0` | Validated entrance markers |
| --- | --- | --- |
| `front` | Front | Main front entry; rear-only door configuration is rejected for a raised building |
| `both` | Front and rear | Main entry (front, or rear when front is disabled) |
| `all` | Front, rear, left and right | Main entry; pavilions additionally have left/right side entries |
| `none` | None | Main entry; only accepted for zero-height walkable bases or `walk:false` |

For example, a 7.5m-wide pavilion with a 0.54m base has `L=1.8m`, so its side entry is **7.25m from its center**, before yaw/translation. Do not place this marker inside a neighboring platform, wall, rock, or outside explicit `walk.bounds`. Solid collision rectangles normally extend 0.4m beyond their visible walls/columns; open door leaves use 0.32m. Check those inflated bounds around every marker. In a compact courtyard, use `stairs:"both"` if side access is not intended, or move the buildings far enough apart to preserve side access.

Custom route waypoints must use the highest walk-surface height at their actual X/Z. A point on a separate terrace can fall inside an automatic building stair or platform and therefore require a higher Y than the terrace itself. Read `heritageScene.surfaces` and `buildings[].entry/sideEntries` from the GLB when diagnosing a rejected waypoint; do not estimate it from the column footprint alone.

`doors.front` and `doors.back` default true. Width must fit the central bay; default is the smaller of 2.8m and bay width minus 0.7m. Height defaults to the smaller of 2.8m and frame height minus 0.35m. Pavilions ignore enclosure switches.

`roof.levels`: integer 1..3. Each upper tier shrinks and rises. `rise`: 0.5..12; `overhang`: 0.2..5; `cornerLift`: 0..2; `curve`: 1..3. The roof is a tessellated four-slope curved shell with a thin underside, raised tile courses, a ridge and simple ridge tips. It is not a stack of flat rectangular slabs. Cylindrical columns, horizontal beams and simplified layered brackets remain separately identifiable within each building's frame mesh.

Each building is a named parent node with separate base, frame, wall/door, and `id-roof-N` mesh nodes. Parts batch geometry by PBR material while retaining this hierarchy. A viewer can hide roof nodes without hiding the building.

## Site elements

All elements require `id`. `position` and `rotation` default to `[0,0,0]` and 0 except paths, whose points already use world coordinates.

| List | Required dimensions | Meaning and optional values |
| --- | --- | --- |
| `terraces` | `width`, `depth`, `height` | Stone platform centered at position, bottom Y=position.y. Optional `material`. Emits a walkable top surface; no full-platform blocking collider. Add separate `stairs` to connect raised terraces. |
| `stairs` | `width`, `depth`, `height` | Full footprint centered at position; ascending from local +Z toward local -Z. Bottom Y=position.y, top Y=position.y+height. Rise ≤0.18m; rejects tread depth <0.25m. Optional `material`. |
| `walls` | `width`, `height` | Wall runs along local X. `thickness` defaults 0.3. Optional `material`; `opening:{width,height}` cuts a central doorway through the wall, with lintel above. |
| `rocks` | none | `radius` defaults 1; `height` defaults 1.3. Optional `material`, `seed`. Closed low-poly irregular rock mesh, with conservative collision. |
| `paths` | `points:[[x,z],...]` | At least two points, `width` defaults 2, optional `material`. Thin paving at ground level Y=0.025, no raised collision or walk surface. Intended for flat ground, not stairs or elevated paths. |

## Walkable GLB metadata

Walk metadata is on the scene's **identity root node**, `node.extras.heritageScene`. All values use root-local/world meters, independent of building node transforms:

```text
{ version:1, kind:"compound", name, description,
  bounds:{minX,maxX,minZ,maxZ}, spawn:[x,y,z],
  colliders:[{minX,maxX,minY,maxY,minZ,maxZ}],
  surfaces:[{minX,maxX,minZ,maxZ,height}],
  buildings:[{id,name,description,nodeName,roofNodeNames:[],
              entry:[x,y,z],interior:[x,y,z],sideEntries:[],
              floorBounds:{minX,maxX,minZ,maxZ}}],
  walkRoute:[{name,position:[x,y,z]}] }
```

`walk` may explicitly supply `spawn`, `bounds`, and `walkRoute`; generated colliders/surfaces remain authoritative. The default spawn is the first building's front entry, and default route visits each building's entry/interior. Default bounds enclose geometry and spawn with a 3m margin. The validator checks connectivity using the bundled reference controller before the builder writes a GLB; still inspect and walk the route in the target viewer.

Explicit `walk.bounds` must contain every complete surface rectangle (including large ground courts, platform edges and stair tread overlaps), every building `floorBounds`, and all standing points. Checking only building centers or route markers is insufficient. For example, a ground court centered at `[0,-0.12,0]` with width 96 and depth 120 occupies X `[-48,48]`, Z `[-60,60]`; bounds ending at X=42 or Z=58 cannot contain it. Correct the intended bounds or actual ground dimensions and regenerate; do not silently clip/drop navigation surfaces.

The bundled v1 reference contract uses finite coordinates within ±4096m, X/Z bounds spans of 2–256m, at most 32 buildings, 64 route points, 4096 colliders, 4096 surfaces and 8192 optional camera boxes. Surface heights are 0–128m. Collision/camera boxes may protrude at most 4m beyond bounds and must intersect them; surfaces and floor bounds have no such margin. Metadata roots and their ancestors are identity transforms; building nodes are independent direct children and roof references must be unique descendants with meshes. These limits describe the shipped reference runtime, without importing any application code or packages.

Reference movement uses a 1.8m walker, 0.22m maximum step up, 0.26m maximum step down and a 0.25m search grid. Standing heights must agree with the highest surface within 0.02m. The validator requires spawn-to-entry paths, entry/interior and side-entry/interior paths in both directions, and sequential `walkRoute` connectivity. Geometric walls missing from metadata still need visual/target-side review.

Collision volumes cover walls, columns, open leaves and rocks, with approximately 0.4m horizontal body clearance. Platforms are surfaces, so a height-aware controller should limit upward steps to about 0.2m and must not treat platforms as enclosing AABBs. Roofs are not walking obstacles; use roof geometry bounds separately for camera avoidance.

The contract uses axis-aligned rectangles: **walkable objects must use yaw multiples of π/2**. A rotated rectangle's AABB would otherwise close doorways or create false floors. `walk:false` permits arbitrary yaw, omits `heritageScene`, and produces an ordinary visual GLB. Freeform wall openings can be modeled visually, but any walk metadata must still accurately represent their passage.

## Validation and review

Ground height Y=0 is an implicit navigation convention, not an automatically generated mesh. For a compound with a visible ground court, add a terrace whose bottom is Y=-0.12 and height is 0.12, covering the intended site. Raised platforms can overlap it. Leave room beyond pavilion sides for automatic side-entry points and stairs; if the validator reports a blocked side entry, increase spacing or move the neighboring building, rather than disabling collision checks.

The CLI checks GLB magic/version/length/chunk alignment, embedded resources, accessor bounds and finite values, triangle indices, positions/min/max, unit normals, PBR ranges, node hierarchy and transforms. It also checks the v1 walk contract, complete rectangle containment, node ownership, standing clearance and reference-controller path connectivity. It deliberately reports unsupported sparse/packed-matrix/compressed geometry rather than claiming it was validated.

Successful build and validation reports include `nodeNames` in GLB node-array order and `warnings` (an empty array when no warnings were reported). An unnamed node is represented by an empty string rather than an invented name. The builder's own generated nodes are all named. `validation` distinguishes structure, heritage contract and connectivity from Khronos and visual checks, which the CLI does not run. For walkable output, contract and connectivity must both report `status:"passed"`; ordinary GLBs report those stages as not applicable/present. Build reports also include source/output paths and building counts. With `--report`, failed checks replace the report with `ok:false` and the current error, exit nonzero, and do not write a new model. Always match the successful report's SHA-256 to the final GLB.

The built-in validator is a focused integrity and reference-navigation check, not the complete Khronos conformance validator or a guarantee for every importer. A successful check does not prove image similarity, architectural authenticity, watertightness, absence of self-intersection, or correct matching of visible geometry and colliders. Review front/side/three-quarter/top views, compare the supplied images, check roof silhouette and openings, and walk the intended route in the target application before claiming target-side validation.

The GLB contains PBR materials and no external texture or buffer URIs. Runtime lighting, cast/receive-shadow flags, cameras and gameplay controllers are not serialized; the consuming viewer must configure them. Keep the JSON specification and build report beside the final GLB for reproducibility.
