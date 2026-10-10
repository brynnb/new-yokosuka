# Asset browser

The Audio tab provides a shared music browser/player with Shenmue I / Shenmue II
selection, search and collapsible categories. Shenmue II can also be filtered by
disc. See [Audio archive](audio-archive.md) for extraction and coverage.

The asset viewer presents the extracted catalog without renaming files or
changing scene-loading groups. `src/catalog.js` owns catalog selection and camera/UI adapters;
`src/AssetBrowser.js` provides shared collapsible sections, labels, and search.

Both the viewer and /play construct MT5/MT7 scenes through
`src/rendering/SceneAssets.js`. `SceneResources.js` owns loader/material defaults,
static freezing and resource disposal; the same graphics preferences and
postprocessing runtime serve both entry points. Map effects, native lighting,
timed layers and spatial batching live alongside them in `src/rendering/`.
The viewer retains individual nodes by disabling static batching; /play batches
compatible static MT5 map parts and MT7 MAPM geometry. PROP hierarchies remain
intact in both.

Static batching retains model/layer roots, spatial cells, material and surface
state, and source-face picking information. Scaled MT5 map parts use the
inverse-transpose normal transform before merging; applying the position
transform to normals would change lighting on non-uniformly scaled geometry.
Blended surfaces, tangent-bearing scaled meshes, callbacks, moving/interactive
owners and independently disabled subtrees remain unmerged. The viewer continues
to retain individual inspection parts. Regression coverage is in
`tests/StaticWorldBatching.test.js`, including mirrored/scaled geometry, ground
picking, layer changes and cancellation.

`SceneStandardMaterial.js` reuses Babylon's prepared shader state only for
immutable world batches with clean submesh defines. It keeps ordinary per-mesh
uniform binding active (including camera, fog and lighting), rather than freezing
shared materials. Material/light/attribute dirty flags, replaced or new render-pass
effects and script promotion back to dynamic geometry leave that fast path.
Camera projection, clipping/depth state and light-resource readiness are still
checked. Characters, instances, mutable surfaces, active material plugins and
specialized rendering passes use normal shader preparation.

`SceneSpatialIndex.js` shares its static cells between ray picking and swept
collision queries. Dynamic door bounds and collision flags are read at query
time. The controller passes a conservative nearby list to Babylon's sliding
ellipsoid and uses the same index for native boundary/recovery checks; candidate
lists are never retained across movements or travel. Before render selection,
disabled dynamic meshes are omitted from the octree candidates. Occlusion query
proxies stay independently enabled so hidden actors can become visible again.
Coverage is in `tests/WorldRaycastIndex.test.js`, `tests/ThirdPersonController.test.js`
and `tests/SceneStandardMaterial.test.js`.

Scene cleanup releases meshes before their materials and textures. Partial-load
cleanup retains resources referenced by surviving meshes; full travel releases
the final owners. Scene-lifetime caches must observe resource disposal rather
than returning disposed materials on the next world load.

`AssetViewerEnvironment.js` connects the viewer's time controls and camera
position to the shared native lighting, map-layer and water implementations.
/play supplies its clock, actor position and scripted layer changes to those
same implementations. The viewer does not start gameplay, accounts or networking.
Shared scene requests drain superseded parsing before clearing loader caches;
resource reads have a bounded timeout/retry and failed files are reported.

For rendered comparison, run
`npx playwright test tests/e2e/shared-renderer.spec.js --project=chromium`.
It loads matched resident geometry through the viewer and the real play scene
runtime/world loader with inert gameplay services. This isolates rendering;
it is not an end-to-end player or NPC behavior test.

- Both games start with a flat list of one-click area buttons and a collapsed
  Interiors section above a collapsed Scene variants section. They share the
  same presentation components. Interiors are curated named shops, homes,
  entertainment venues and notable story destinations, not every small room.
  Buttons load the existing complete scene groups; they do not add gameplay
  interactions. Missing catalog entries and unidentified scenes are excluded.
- Shenmue II combines named outdoor areas from all discs in that list. Repeated
  areas use the earliest available complete main scene; later versions remain
  selectable under Scene variants and the four disc → region → location folders.
  Archives without primary environment geometry do not become area shortcuts.
- Shenmue has its existing location shortcuts plus collapsed characters,
  objects, and three source-scenario folders grouped by region. Its `S1_`/`S2_`/`S3_`
  prefixes are scenario identifiers, not a reliable physical-disc partition.
  Hazuki Residence Interior now lives in Interiors. Interior names use maps.csv;
  repeated scenarios use the earliest available copy without mixing files.
- Individual opening-scene components stay inside a collapsed parent section.
- Search matches all entered words against names, original codes, and parent
  locations. Matching branches expand temporarily; clearing search restores the
  previous expansion state. Collapse all also clears the search.

Names come from the existing maps/characters CSVs, curated main-view and
collection labels, and `Shenmue2AssetOrganization.js`. Original filenames remain
visible as secondary text and searchable. Unknown names remain unidentified.
Shenmue II's `CHRM` kind can represent people **or objects**, so ambiguous models
are explicitly grouped as character/object models rather than asserted to be NPCs.
This is a browsing change, not a new claim about reconstructed scene fidelity.

Shenmue II item labels additionally use the pinned community table in
`src/data/shenmue2-item-names.json` from
[Wulinshu Items (SM2), revision 649](https://wulinshu.com/wiki/index.php?title=Items_(SM2)&oldid=649).
Only unambiguous model IDs are named. The Dreamcast corpus uses seven-character
resource IDs followed by one G/I/T suffix; the join accepts only those observed
suffixes (or an exact ID), never arbitrary prefixes. This is a naming inference
from the HD wiki and extracted Dreamcast filenames, not a behavioral assertion.
Shared IDs such as TMEM200 (Mysterious Paper / Chawan Sign) remain unnamed.
The current catalog gains labels for 271 distinct member names, across 1,080
records; original filenames and duplicate archive-entry numbers remain searchable.

Eleven previously unnamed map IDs use
[Wulinshu Map IDs (SM2), revision 437](https://wulinshu.com/wiki/index.php?title=Map_IDs_(SM2)&oldid=437).
Existing curated labels are preserved. Unknown copies are called alternates,
not assigned invented event purposes; QAE1/QAE6 retain both buildings named by
the source. Tentative QABT and unidentified QT09/QUG0 stay unidentified.
These additions label existing disc folders, not new curated travel shortcuts.

Camera controls live over the 3D viewer. Overview frames all loaded geometry in
either game. Interior view restores a single entrance viewpoint validated against
the current Shenmue II environment; it does not cycle between rooms. It is
disabled when no entrance passes the geometry checks. Shenmue I entrance data
has not yet been connected to that validator, so only Overview is available there.

Verify with `node --test tests/Shenmue2AssetOrganization.test.js` and
`npx playwright test tests/e2e/asset-browser.spec.js --project=chromium`.

For a production preview, set `E2E_APP_URL=https://www.newyokosuka.com`,
`E2E_PREVIEW_ORIGIN=http://127.0.0.1:5189` (the local preview port), and
`PLAYWRIGHT_SKIP_WEB_SERVER=true`. The test intercepts application requests and
serves the local build under that origin, letting R2 enforce its real production
CORS policy without uploading or modifying anything on the live site.
