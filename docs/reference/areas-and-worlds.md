# Areas and worlds

A native area is a four-character map/runtime identifier. A browser world ID is
a project route and rendering configuration. A display name is UI text. An
interior destination or map variant can reuse or supplement a native area; none
of these identifiers is interchangeable.

The [complete generated area and world index](areas-and-worlds.generated.md)
is the exhaustive union of current MAPINFO sources and destinations, the map
CSV, schedule residencies, and browser worlds. Regenerate it with
`node tools/reference/generate_identifier_area_reference.mjs`, or add `--check` to
validate freshness. This file retains the reviewed initial mappings and usage
rules.

## Initial Shenmue I world mapping

| Native area | Player-facing location | Browser world | Type | Known transition / distinction | Evidence | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| `JHD0` | Hazuki Residence Grounds | `exterior` | exterior | Native front-door route from `JOMO` targets scene 1, entry 2 | `public/data/maps.csv`; `play/config/worlds.js`; `tools/evidence/jomo-front-door-map-transition.json` | `confirmed` |
| `JOMO` | Hazuki Residence Interior | `interior` | interior | Separate native area from the grounds | same sources; `tools/evidence/player-portal-inventory.json` | `confirmed` |
| `JU00` | Yamanose | `yamanose` | exterior | Neighborhood link in the JHD0–JU00–JD00 route | `public/data/maps.csv`; worlds config; transition inventory | `confirmed` |
| `JD00` | Sakuragaoka | `sakuragaoka` | exterior | Exact JD00/D000 boundary evidence exists | `public/data/maps.csv`; worlds config; `tools/evidence/jd00-d000-boundary-transition.json` | `confirmed` |
| `D000` | Dobuita | `dobuita` | exterior | Contains native destinations including `DGCT`; generated shop interiors remain distinct browser destinations | `public/data/maps.csv`; worlds config; `tools/evidence/map-transition-coverage.json` | `confirmed` |
| `MFSY` | New Yokosuka Harbor | `mfsy` | exterior | Harbor main playable area | `public/data/maps.csv`; worlds config; schedule catalog | `confirmed` |
| `MKSG` | Old Warehouse District | `mksg` | exterior | Spatial tiles are not timed map variants | `public/data/maps.csv`; worlds config; `docs/implementation/world-time-and-variants.md` | `confirmed` |
| `MS08` | Old Warehouse No. 8 | `ms08` | interior | Native Warehouse No. 8 area; not a generated Dobuita interior | `public/data/maps.csv`; worlds config; schedule catalog | `confirmed` |
| `DGCT` | YOU Arcade | `arcade` | interior | Native destination linked from Dobuita evidence | `public/data/maps.csv`; worlds config; transition coverage | `confirmed` |
| `JABE` | Abe Store Candy Shop | `jabe` | interior | Sakuragaoka static door 0; exact return targets `JD00` entry 3 | worlds config; native transition catalog | `confirmed` |
| `MKYU` | Harbor Lounge | `mkyu` | interior | Harbor static door 18; root-only exit targets `MFSY` entry 19 | worlds config; native transition and exact-door audit | `confirmed` |
| `MS8S` | Warehouse No. 8 | `ms8s` | interior | Harbor static door 26; exact return targets `MFSY` entry 5 | worlds config; native transition catalog | `confirmed` |

`play/config/locations.js` asset prefixes (`S1_…`, `S2_…`, and `S3_…`) are
browser asset namespace choices, not claims about the original disc number.
Likewise, generated Dobuita shop worlds can have player-facing destinations
without becoming new native area codes or inheriting `D000` schedules.

An operation-`0x0030` destination proves a map transition call, not by itself a
clickable door or walk-over portal. The transition inventory requires an exact
door, event-volume, or selector binding before exposing a browser interaction.
