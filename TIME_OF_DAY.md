# Time-of-Day, Seasons, and Variant System

This document describes how the viewer handles time-of-day lighting, skybox textures, seasonal variants, and the MAP file variant system.

---

## Time-of-Day Presets

Based on real Shenmue gameplay footage timing:

| Index | Name    | In-Game Time | Sky Texture   | Clear Color (RGBA)     | Notes                                      |
|-------|---------|-------------|---------------|------------------------|----------------------------------------------|
| 0     | Day     | Morning–4pm | `air00.png`   | `0.4, 0.6, 0.9, 1`    | Normal daylight                              |
| 1     | Sunset  | ~4:30pm     | `air18.png`   | `0.8, 0.4, 0.2, 1`    | Orange sky, ambient changes, windows still unlit |
| 2     | Evening | ~6:30pm     | `air25.png`   | `0.05, 0.03, 0.1, 1`  | Dark sky, lit windows, lanterns on, store signs lit |
| 3     | Night   | Late        | `air25.png`   | `0.01, 0.01, 0.05, 1` | Same dark sky as evening                     |

### Season-Aware Sky Override

When the **Winter** season is active and time is **Day** (index 0):
- Sky texture: `air07.png` (overcast winter sky)
- Clear color: `0.5, 0.55, 0.65, 1`

All other time/season combinations use the default preset sky.

---

## Available Sky Textures

Located in `/public/textures/sky/`. Known purpose of some:

| File         | Description                    |
|-------------|--------------------------------|
| `air00.png` | Clear blue daytime sky         |
| `air07.png` | Overcast/winter daytime sky    |
| `air18.png` | Orange sunset sky (~4:30pm)    |
| `air25.png` | Dark night sky (~6pm+)         |
| `air05.png` | Alternative sunset (unused)    |

Many other `airXX.png` files exist but their in-game mapping is not yet confirmed.

---

## Zone Variant System (`ZONE_VARIANTS`)

Defined in `main.js`. Each zone can have groups of mutually exclusive MAP files controlled by either the **Season** or **Time** toggle.

### Variant Group Format

```javascript
{
  name: "Group Name",
  type: "season" | "time",
  variants: [entry0, entry1, entry2, ...]
}
```

Each entry can be:
- A **string** suffix (e.g. `"MAP03"`) for a single file
- An **array** of suffixes (e.g. `["MAP17", "MAP18", "MAP19"]`) for multi-file groups

The index in the `variants` array corresponds to:
- **Season type**: `seasonPresets` index (0=Summer, 1=Winter, 2=Show All)
- **Time type**: `timeOfDayPresets` index (0=Day, 1=Sunset, 2=Evening, 3=Night)

### `alwaysHide`

Optional array of suffixes that are always hidden regardless of toggle state (e.g. base building shells that time variants replace).

---

## BETD (Hazuki Residence Exterior)

All groups are **season** type (Summer/Winter toggle):

| Group        | Summer (idx 0) | Winter (idx 1) | Notes                        |
|-------------|----------------|----------------|------------------------------|
| Ground      | MAP03          | MAP04          | Same bounding box, ~31k verts |
| Small Plants| MAP08          | MAP09          | Same bbox, ~22k verts        |
| Trees       | MAP10          | MAP11          | Same bbox, ~250k verts       |
| Foliage     | MAP06          | MAP07 / MAP05  | 3 variants                   |

---

## D000 (Dobuita)

Mixed **time** and **season** groups:

### Time-of-Day Groups

| Group       | Day (0)              | Sunset (1)           | Evening (2)          | Night (3)            |
|------------|----------------------|----------------------|----------------------|----------------------|
| Background | MAP02                | MAP02                | MAP03                | MAP03                |
| Windows    | MAP17, MAP18, MAP19  | MAP17, MAP18, MAP19  | MAP20, MAP21, MAP22  | MAP20, MAP21, MAP22  |

- **Day/Sunset**: Daytime background buildings (MAP02) + unlit windows (MAP17-19)
- **Evening/Night**: Night background buildings (MAP03) + lit windows (MAP20-22)

### Season Group

| Group  | Summer (0) | Winter (1) |
|--------|-----------|------------|
| Roads  | MAP23     | MAP24      |

### Always Visible (no filtering)

MAP, MAP01, MAP04–MAP16, MAP25, MAP26

### D000 MAP File Reference

| File       | Content                                          | Variant? |
|-----------|--------------------------------------------------|----------|
| MAP.MT5   | Buildings and sidewalks                          | Always   |
| MAP01.MT5 | Buildings and sidewalks                          | Always   |
| MAP02.MT5 | Daytime background buildings                     | Time     |
| MAP03.MT5 | Nighttime background buildings                   | Time     |
| MAP04.MT5 | Buildings and sidewalks                          | Always   |
| MAP05.MT5 | Seems empty / placed items (placement unknown)   | Always   |
| MAP06.MT5 | Warm street lamps/lanterns (holiday variant?)     | Always   |
| MAP07.MT5 | Similar to MAP06                                 | Always   |
| MAP08–14  | Small shop interiors / shop parts                | Always   |
| MAP15.MT5 | Buildings and hillside                           | Always   |
| MAP16.MT5 | Store opening hours signs                        | Always   |
| MAP17.MT5 | Daytime windows                                  | Time     |
| MAP18.MT5 | Daytime windows                                  | Time     |
| MAP19.MT5 | Daytime windows                                  | Time     |
| MAP20.MT5 | Evening/night glowing windows                    | Time     |
| MAP21.MT5 | Evening/night glowing windows                    | Time     |
| MAP22.MT5 | Evening/night glowing windows                    | Time     |
| MAP23.MT5 | Summer roads and foliage                         | Season   |
| MAP24.MT5 | Winter roads                                     | Season   |
| MAP25.MT5 | Small brick structures (chimney tops?)            | Always   |
| MAP26.MT5 | Seems empty                                      | Always   |

---

## Lighting Setup

Defined in `main.js` `createScene()`:

| Light             | Type          | Default Intensity | Color/Notes                          |
|-------------------|---------------|-------------------|--------------------------------------|
| `hemiLight`       | Hemispheric   | 1.2               | Direction (0,1,0), ground color (0.1, 0.1, 0.15) |
| `skyLight`        | Directional   | 1.5               | Direction (0,-1,0) — top-down sun    |
| `directLight`     | Directional   | 1.0               | Direction (-1,-2,-1) — angled sun    |
| `fillLight`       | Point         | 0.8               | Position (-20, 20, -20)              |

**Scene ambient**: `Color3(0.3, 0.3, 0.3)`
**Material emissive**: `Color3(0.08, 0.08, 0.08)` (per-material in Mt5Loader)

### Lighting Debug Panel

A "Lighting" button in the top-right of the canvas opens a panel to adjust all light properties in real-time. Use the **Copy Values to Clipboard** button to export current settings as JSON, which can then be hardcoded into time-of-day presets.

---

## Season Presets

| Index | Name     | Behavior                              |
|-------|----------|---------------------------------------|
| 0     | Summer   | Show summer variants, hide winter     |
| 1     | Winter   | Show winter variants, hide summer     |
| 2     | Show All | No filtering, show all variants       |

The Season button only appears for zones that have `season`-type groups in `ZONE_VARIANTS`.

---

## Implementation Notes

- **Load-time skip**: Inactive variant files are skipped during scene loading (not loaded then hidden). This means toggling season or time-of-day **reloads the scene** to fetch the correct files.
- **Single model mode**: When viewing an individual model from the sidebar, all variant filtering is bypassed so every file can be inspected freely.
- **Duplicate suffix safety**: If the same MAP suffix appears at both the active and an inactive index (e.g. MAP02 at both Day and Sunset), it won't be incorrectly hidden.
