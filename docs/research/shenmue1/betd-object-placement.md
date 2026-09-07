# BETD exterior object placement

This document owns BETD-specific placement evidence and regeneration. See
[World loading and transitions](../../implementation/world-loading-and-transitions.md)
for the current playable-world architecture. `/play` uses JHD0 for the normal
Hazuki grounds; BETD remains a distinct exterior variant and viewer source.

## Source

The exact Disc 1 source is:

```text
SCENE/01/BETD/MAPINFO.BIN
```

It was extracted locally to `.disc-work/exact/betd/MAPINFO.BIN`. Unlike the
large native-SH-4 JOMO script, BETD stores its separately rendered props as
serialized `CHRD/CHRS` records followed by a `STRG` table.

## Model identity

Every rendered record has this serialized expression immediately before its
four-character object tag:

```text
relative("$MODEL.MT5"), relative("Character"), 0x22, "TAG0"
```

The relative pointer resolves into the same `STRG` table as the record's named
properties. This directly proves model identity. It is important for `KAK1`
and `KAK2`: their short tags and `Image` labels do not numerically identify
the corresponding `KAKS` filename.

## Recovered records

| Tag | Model | Position | Authored rotation (degrees) |
| --- | --- | --- | --- |
| `DORR` | `DDRR1001.MT5` | `(-2.3610, 1.0551, -23.4547)` | `(0, 80, 0)` |
| `DORL` | `DDRR1002.MT5` | `(-2.3610, 1.0600, -21.4349)` | `(0, 280, 0)` |
| `SECD` | `DKTR101G.MT5` | `(-11.3000, 1.1095, -22.4500)` | `(0, 0, 0)` |
| `GART` | `GART201G.MT5` | `(-6.8058, 3.4745, -16.5728)` | `(10, 180, 0)` |
| `KAK1` | `KAKS509G.MT5` | `(-11.2439, 2.9721, -23.0970)` | `(0, 90, 0)` |
| `KAK2` | `KAKS505G.MT5` | `(-11.2420, 2.9721, -21.8370)` | `(0, 90, 0)` |

The browser loader reflects MT5 source-space X internally. CHRS world
positions are already in the coordinate convention used by the exterior map,
so they are applied unchanged.

## Double-door pose

The two `DDRR` meshes are complementary, approximately two-meter-high,
one-meter-wide thin leaves:

- `DDRR1001`: local Z approximately `0..1`
- `DDRR1002`: local Z approximately `-1..0`

At zero yaw they meet between their two world pivots and close the doorway.
The authored `80°` and `280°` (`-80°`) yaws rotate them apart along the
shortest arcs. Therefore BETD's records contain an open double-door pose, not
two arbitrary world orientations. `/play` initializes both leaves open and
uses zero yaw as their interactive closed state.

## Browser loading

`tools/evidence/betd-mapinfo-placements.json` is generated with:

```bash
node tools/worlds/extract_mapinfo_character_placements.js \
  .disc-work/exact/betd/MAPINFO.BIN \
  --prefix S1_BETD_ \
  --out tools/evidence/betd-mapinfo-placements.json
```

The exterior world's normal catalog load is restricted to `MAP*.MT5`.
Separately placed models are loaded only from this manifest, preventing the
old behavior where every non-map BETD resource appeared at the origin.

## Verification boundary

Static evidence proves all six source records, model associations, and
transforms. Tests independently assert the record sequence and door endpoints.
Visual confirmation in `/play` remains required for final exterior sign-off;
it is not used to choose or nudge these transforms.
