# Alpha Texture Antialiasing

## Area of work

This belongs to **real-time rendering quality**, primarily:

- texture minification and mipmapping;
- alpha-tested or cutout geometry;
- spatial antialiasing with multisample antialiasing (MSAA);
- texture filtering and anisotropic filtering.

In New Yokosuka, many objects that look geometrically detailed are actually
flat triangles textured with transparent PVR images. Railings, crane
scaffolding, fences, foliage, and signs can use this technique. They are often
called billboards or cutouts here even when they do not rotate to face the
camera like a Babylon `billboardMode` mesh.

## The original problem

A Dreamcast cutout texture commonly stores every texel as either fully opaque
or fully transparent. When a thin feature becomes smaller than a screen pixel,
ordinary alpha testing must still choose between drawing or discarding that
pixel. Small camera movements change the choice repeatedly, producing:

- shimmering or crawling edges;
- moire-like patterns;
- a vertical "running water" appearance on repeated railings;
- sudden changes as the selected mip level changes.

The effect can still be visible up close because a hard transparent edge moves
across the screen's fixed pixel grid. Distance makes it more severe because
more texture detail must be represented by fewer pixels.

## Texture filtering pipeline

`PvrDecoder` creates a complete mip chain for alpha-bearing PVR textures. Each
level is half the previous level's dimensions until it reaches 1x1.

### Alpha-aware color filtering

RGB is averaged in proportion to alpha. Fully transparent black texels
therefore do not darken the visible color along a cutout's edge. Alpha itself
is averaged normally so it represents the fraction of the filtered area that
was covered.

Coverage adjustments for one mip are never fed into the construction of the
next mip. Doing so compounds the adjustment and causes successive levels to
alternate between too solid and too sparse.

### Two alpha policies

The correct mip alpha depends on how the material will be rendered:

1. **MSAA alpha-to-coverage:** Preserve the naturally averaged fractional
   alpha. The GPU converts it into multisample coverage.
2. **Hard alpha-test fallback:** Scale alpha at each mip so approximately the
   same fraction of texels remains above the alpha-test cutoff. This limits
   cutouts shrinking or expanding when no multisample coverage is available.

The fallback coverage calculation evaluates rounded 8-bit values, exactly as
they will be uploaded. Treating a calculated value such as 127.5 as invisible
and later uploading it as 128 previously made some mip levels unexpectedly
solid.

### Upload and sampling

Custom mip levels are uploaded to Babylon's internal texture after the base
`RawTexture` is created. Texture clones used for different MT5 wrap modes share
that internal GPU texture and therefore share its mip chain.

The mip chain is also restored after WebGL context loss. If custom upload is
unavailable, or the texture is not power-of-two, Babylon's ordinary generated
mipmaps remain the fallback.

MT5 textures use trilinear filtering and up to 8x anisotropic filtering. These
reduce transitions between mip levels and improve sampling on surfaces viewed
at steep angles, but neither replaces alpha edge antialiasing.

## Alpha-to-coverage material path

Babylon's ordinary alpha-test material discards filtered edge pixels below a
cutoff and forces every surviving fragment to alpha 1. Enabling GPU
alpha-to-coverage after that operation has no useful fractional alpha left to
consume.

`Mt5AlphaToCoverageMaterial` avoids that hard discard and preserves the
filtered texture alpha in the fragment output. It overrides Babylon's blend
queue decision so the mesh still:

- renders with normal depth writes;
- avoids transparent-object sorting;
- does not use conventional source-alpha color blending.

Immediately before an eligible mesh renders, the loader enables the engine's
alpha-to-coverage state. MSAA turns fractional alpha into coverage across the
pixel's samples. The state is disabled immediately afterward so unrelated
materials are unaffected.

The path is enabled only when:

- the loader's `alphaToCoverage` option is enabled;
- the texture uses the MT5 `alphatest` mode;
- the active render target has more than one sample;
- the engine exposes alpha-to-coverage control.

Otherwise the material uses normal hard alpha testing and the corresponding
coverage-preserving mip policy.

## Blended character hair

Smooth-alpha character surfaces use ordinary blending, not the cutout path
above. Sorting whole meshes is insufficient when several hair sheets share
one mesh: a farther sheet can paint over a nearer one and look like missing
geometry even with back-face culling disabled. Yohei Kondo's `YHI_L` hair is
one example.

The shared MT5 character loader installs `TransparentTriangleSort` for these
blended meshes. It orders their triangles back-to-front using the current
camera and skinned positions, in one two-sided pass. This preserves fractional
alpha and winding without splitting the character into additional draw calls.
Only rendered meshes are sorted, and unchanged order skips the index upload.
CPU triangle order stays authored so picking and detailed FACE replacement
continue to use stable triangle IDs.

This is triangle-depth sorting, not per-pixel order-independent transparency;
arbitrarily intersecting translucent surfaces can still need a more advanced
renderer. Opaque surfaces and alpha-tested scenery are unaffected.

## Why distant cutouts can still look lighter

When dark scaffolding covers only part of a screen pixel, correct
antialiasing resolves that pixel as a mixture of the scaffolding and its bright
background. Some lightening is therefore physically expected.

It should not, however, happen because mip generation reduces opacity. The
harbor crane exposed exactly that bug: its first reduced mip had an average
alpha near 99 even though the source averaged about 132. The old hard-cutoff
coverage correction was still being applied before alpha-to-coverage. The two
paths are now separate, and the crane texture retains an average alpha of
approximately 132 through its entire naturally filtered mip chain.

## Diagnosed harbor examples

- `S2_MFSY_MAP10.MT5`, `mt5_tex_5`, texture ID
  `9896d2926135425f`: a 64x64 railing texture repeated roughly twenty times.
- `S2_MFSY_MAP11.MT5`, `mt5_tex_36`, texture ID
  `a49ad3926135425f`: a 128x128 crane-scaffolding texture sampled from a narrow
  band and repeated along the crane geometry.

These examples confirmed that `originalTextures: []` in triangle-picker output
does not mean the mesh lacks a texture. Raw PVR texture wrappers have an empty
Babylon name, and the debug export filters empty names from that list.

## Remaining limitations

- Browser/default-framebuffer MSAA commonly provides only a few coverage
  levels, so it cannot make every subpixel transition perfectly smooth.
- Alpha-to-coverage is spatial antialiasing. It does not accumulate information
  across frames like temporal antialiasing (TAA).
- Very thin, high-contrast, heavily repeated patterns can retain some motion
  shimmer even with correct mipmaps and MSAA.
- This pipeline covers alpha PVR textures decoded through the MT5 loader. PNG,
  video, canvas, and dynamically generated textures use their own paths.

Possible future improvements include a higher sample count, supersampled
rendering, or carefully integrated temporal antialiasing. Darkening distant
cutouts is not a general solution because it creates halos and incorrect
silhouettes.

## Verification

Focused coverage lives in:

- `tests/PvrMipmaps.test.js` for mip dimensions, edge-color filtering, alpha
  coverage, byte rounding, and odd dimensions;
- `tests/Mt5Loader.test.js` for the alpha-preserving material, render-queue
  behavior, scoped engine state, and selection of the natural-alpha decode
  policy when MSAA is available.
- `tests/TransparentTriangleSort.test.js` for camera/pose-dependent hair order,
  preserved topology, and production character-loader integration.

Visual verification requires a full page reload because textures and materials
already uploaded to the scene do not automatically adopt decoder or material
changes.
