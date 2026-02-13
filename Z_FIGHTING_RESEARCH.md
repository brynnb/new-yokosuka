# Research: Z-Fighting and Overlapping Geometry in Shenmue Assets

This document analyzes the issue of overlapping geometry in the "New Yokosuka" asset viewer and tracks the solutions.

## The Problem: Z-Fighting
In several Shenmue zones, multiple meshes occupy the exact same coordinate space. This results in "Z-fighting," where the GPU flickers between two surfaces because it cannot determine which is closer.

### Root Causes:
1.  **Dojo walls (BETD)**: Interior and exterior wall meshes perfectly overlap. The original engine only rendered one side based on camera position; our viewer rendered both.
2.  **Seasonal variants (BETD)**: Summer/winter ground, foliage, and tree meshes overlap. The engine loaded only the active season.
3.  **Time-of-day variants (D000)**: Day/sunset/evening/night building meshes overlap. The engine loaded only the active time variant.

---

## Solutions Implemented

### 1. Winding Order Fix (Dojo Z-Fighting) — `src/Mt5Loader.js`
The real fix for dojo wall z-fighting was **flipping the triangle winding order** for opaque surfaces and enabling `backFaceCulling = true`. MT5 opaque surfaces have normals pointing outward but winding order that makes the back face the "front" for Babylon.js. By reversing the winding, the front face aligns with the normals, so backface culling correctly hides interior walls when viewed from outside (and vice versa).

```javascript
// Opaque surfaces: reversed winding so front face aligns with normals
if (i % 2 === 0) indices.push(a, c, b);
else indices.push(a, b, c);
```

### 2. Variant Toggle System (Seasonal + Time-of-Day) — `main.js`
A `ZONE_VARIANTS` config defines which MAP files are mutually exclusive per zone:
- **BETD**: Season-type groups (Summer/Winter toggle for ground, plants, trees, foliage)
- **D000**: Time-type groups (Day/Sunset/Evening/Night for buildings), plus `alwaysHide` for the base building shell (MAP04) that time variants replace.

Inactive variants are **skipped at load time** (not loaded then hidden), which also improves performance.

### 3. Logarithmic Depth Buffer — `main.js`
```javascript
scene.useLogarithmicDepth = true;
```
Increases Z-buffer precision for large environments. This alone doesn't fix overlapping geometry but reduces z-fighting for surfaces at similar but not identical depths.

### 4. Alpha Decal Z-Offset — `src/Mt5Loader.js`
```javascript
mat.zOffset = -1.0; // For 1-bit alpha surfaces (graffiti, fences)
```
Ensures punch-through alpha surfaces (like wall graffiti) render in front of the wall behind them.

---

## Previous Attempt (Removed)
A two-tier `zOffset` system using `fileIndex` and `meshCounter` was tried but removed. It assigned unique depth biases per sub-mesh but was not the actual fix — the winding order change and variant system were what resolved the issues. The zOffset system added complexity without benefit and was cleaned up.
