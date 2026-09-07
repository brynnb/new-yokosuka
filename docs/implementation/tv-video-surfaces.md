# Adding Video to an In-World Television

This guide documents the complete workflow used for the televisions in You
Arcade and the Hazuki Residence. It assumes the television is already part of
an MT5 map, but its authored screen faces also contain a bezel, controls, or
another non-screen area.

The important distinction is:

- the in-game triangle picker identifies the authored faces and their texture;
- the standalone texture-region picker identifies the glass *inside* those
  faces;
- `/play` renders a new four-corner video surface over only that glass.

## Existing examples

The definitions are currently in `play/config/arcadeFixtures.js` under
`ARCADE_CABINET_VIEWS`. The name is historical; this table now also contains
non-arcade ambient video screens.

| ID | World | Source |
| --- | --- | --- |
| `cinemaScreen` | `cinema` | `cinema-v6.glb`, `Screen_primitive1` |
| `cornerTv` | `arcade` | `S3_DGCT_MAP.MT5`, `mt5_tex_35` |
| `hazukiTv` | `interior` | `S1_JOMO_MAP02.MT5`, `mt5_tex_24` |

The arcade and Hazuki televisions use the six-hour Japanese television HLS
stream hosted in R2. The cinema screen uses the Godzilla vs. Biollante HLS
stream. `/arcade/attract/corner-tv.mp4` remains their automatic fallback.

## 1. Select the authored faces

Run `/play` locally, open the debug panel, enable the triangle picker, and
select the two triangles forming the television's full textured face. Use
**Copy selection**.

Keep this evidence:

- `sourceFilename`
- `meshName`, normally `mt5_tex_N`
- `faceId`
- the three UV coordinates and three world positions for each face

The number in `mt5_tex_N` is the model's texture index. For example,
`mt5_tex_24` uses texture index 24.

Do not use the full triangle face directly as the video surface when its
texture includes a bezel. Doing so covers the television frame.

## 2. Resolve and extract the texture

The model and its texture pack may be local or hosted in the project's R2
asset bucket. Scene texture packs follow names such as
`S1_JOMO_textures.bin`.

Use `Mt5Loader.textureIds` to resolve a model texture index to its eight-byte
texture ID:

```js
import fs from "node:fs";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "./src/Mt5Loader.js";

const exact = (bytes) => bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const loader = new Mt5Loader(scene);
await loader.load(exact(fs.readFileSync("/tmp/MAP.MT5")), null);

const textureIndex = 24;
console.log(Mt5Loader.textureIdHex(loader.textureIds.get(textureIndex)));
```

Then find that ID in the texture pack and decode it with `PvrDecoder`:

```js
import fs from "node:fs";
import { Mt5Loader } from "./src/Mt5Loader.js";
import { PvrDecoder } from "./src/PvrDecoder.js";

const textureIdHex = "e7abc8616064365f";
const raw = fs.readFileSync("/tmp/textures.bin");
const pack = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const index = Mt5Loader.buildTexturePackIndex(pack);
const id = Uint8Array.from(
  textureIdHex.match(/../g).map((byte) => Number.parseInt(byte, 16)),
);
const view = new DataView(id.buffer);
const entry = index.get(
  `${view.getUint32(0, true)}_${view.getUint32(4, true)}`,
);
const decoded = new PvrDecoder(
  pack,
  entry.offset,
  entry.length,
).decodePixels();

console.log(decoded.width, decoded.height);
process.stdout.write(Buffer.from(decoded.pixelData));
```

Pipe the RGBA output into ImageMagick, using the reported dimensions:

```bash
node decode-tv-texture.mjs \
  | convert -size 128x128 -depth 8 rgba:- tv-texture.png
```

## 3. Select only the glass

The standalone helper lives outside this repository at:

```text
../texture-region-picker
```

Run it with:

```bash
cd ../texture-region-picker
python3 -m http.server 4180
```

Then open <http://127.0.0.1:4180>.

To add a permanent preset, add an entry to the `presets` object in its
`index.html` containing:

- the extracted PNG filename;
- model, mesh, texture index, and texture ID;
- the rectangular UV bounds covered by the two source faces;
- the world positions corresponding to UV top-left, top-right, bottom-right,
  and bottom-left.

The green outline is the complete authored face. Drag the red handles to the
four corners of the actual glass and copy the resulting JSON. Keep
**rectangular selection** enabled unless the glass is genuinely skewed in the
texture.

The result includes:

- selected pixel coordinates;
- normalized UV coordinates;
- interpolated world positions on the original face.

## 4. Reorder texture corners into physical corners

The standalone picker's labels are **texture-space labels**. They are not
guaranteed to be physical top-left, top-right, bottom-left, and bottom-right
on the placed television. Shenmue textures are frequently rotated relative to
the model.

Before creating the `/play` definition:

1. Separate the two lower world points from the two upper points using world
   `y`.
2. Determine physical left/right while looking at the visible front of the
   television.
3. Assign `bottomLeft`, `bottomRight`, `topLeft`, and `topRight` in physical
   screen order.

`applyArcadeCabinetScreenGeometry()` creates vertices in this order:

```text
bottomLeft, bottomRight, topRight, topLeft
```

Incorrect ordering rotates, mirrors, twists, or hides the video.

## 5. Add the video definition

Add a uniquely named entry to `ARCADE_CABINET_VIEWS` in
`play/config/arcadeFixtures.js`:

```js
myTv: Object.freeze({
  worldId: "interior",
  bottomLeft: Object.freeze([x, y, z]),
  bottomRight: Object.freeze([x, y, z]),
  topLeft: Object.freeze([x, y, z]),
  topRight: Object.freeze([x, y, z]),
  center: Object.freeze([x, y, z]),
  frontNormal: Object.freeze([x, y, z]),
  up: Object.freeze([0, 1, 0]),
  cameraDistance: 0.62,
  attractUrl: "/arcade/attract/my-tv.mp4",
  attractFallbackUrl: "/arcade/attract/my-tv-fallback.mp4",
  reverseU: false,
}),
```

The center is the average of the four physical corners. `frontNormal` points
out of the visible glass and should be normalized or close to normalized.

The runtime:

- creates an unlit, double-sided Babylon `VideoTexture` surface;
- offsets it 0.003 world units along `frontNormal`;
- loops the video;
- preserves audio;
- attenuates audio by horizontal player distance;
- pauses it outside the definition's `worldId`;
- retries playback after a user gesture if browser autoplay policy blocks it.

### If the video is invisible

First flip `frontNormal`:

```js
frontNormal: Object.freeze([-x, -y, -z]),
```

This was required for both existing televisions. A wrong normal offsets the
new surface slightly *inside* the original television face. The material is
already double-sided, so backface culling is usually not the problem; the
original glass is simply winning the depth test.

### If the picture is mirrored

Toggle:

```js
reverseU: true
```

Alternatively provide an explicit eight-value `screenUvs` array. Existing
cocktail arcade screens demonstrate this override.

## 6. Prepare a clip

For a one-minute H.264/AAC clip beginning at a precise source timestamp:

```bash
ffmpeg \
  -ss 04:58:56 \
  -i source.mp4 \
  -t 60 \
  -map 0:v:0 \
  -map 0:a:0? \
  -c:v libx264 \
  -preset fast \
  -crf 23 \
  -pix_fmt yuv420p \
  -c:a aac \
  -b:a 128k \
  -movflags +faststart \
  -y public/arcade/attract/my-tv.mp4
```

`yuv420p`, H.264, AAC, and `faststart` provide broad browser compatibility.
If several televisions use the same footage, point them to the same file
rather than duplicating it.

Each definition currently creates its own HTML video element and decoder. A
few televisions are inexpensive, but many simultaneous televisions should
share a video/texture instance when synchronized playback is acceptable, or
use lightweight pre-recorded attract clips rather than several emulators.

### Long-form HLS video

The Japanese television program is packaged as a video-on-demand HLS stream
with roughly ten-second MPEG-TS segments. Its public playlist is:

```text
https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev/media/japanese-tv/v1/index.m3u8
```

The media lives in the dedicated `newyokosuka` R2 bucket under
`media/japanese-tv/v1/`. Segments use a one-year immutable cache policy; the
playlist uses a five-minute cache policy. The bucket's CORS policy permits
`GET` and `HEAD` from `newyokosuka.com`, `www.newyokosuka.com`, and local
development.

Package another already-compatible H.264/AAC source with:

```bash
ffmpeg \
  -i source.mp4 \
  -map 0:v:0 \
  -map 0:a:0? \
  -c copy \
  -hls_time 10 \
  -hls_playlist_type vod \
  -hls_flags independent_segments+temp_file \
  -hls_segment_filename "segment-%05d.ts" \
  index.m3u8
```

Upload all segments first and the playlist last, so clients never receive a
playlist that refers to missing media. Use `video/mp2t` for segments and
`application/vnd.apple.mpegurl` for the playlist.

Safari consumes HLS natively. `/play` uses `hls.js` for Chrome and Firefox,
then falls back to `attractFallbackUrl` if HLS cannot be initialized.

Long-form televisions are synchronized from the multiplayer server's
wall-clock timestamp. The client maps that shared clock onto the video's
looping duration and corrects playback whenever drift exceeds 0.35 seconds.
This means players entering at different times see the same part of the
program. Offline play uses the device clock, then resynchronizes after the
server connects.

## 7. Make it focusable

Add an entry to `YOU_ARCADE_INTERACTIONS` in
`play/config/arcadeFixtures.js`. This table also
supports non-arcade worlds despite its historical name:

```js
Object.freeze({
  gameId: "myTv",
  label: "Television",
  worldId: "interior",
  position: [centerX, centerY, centerZ],
  size: [width, height, depth],
  focusOnly: true,
}),
```

The `gameId` must match the video definition. `focusOnly: true` uses the
cabinet camera transition without launching an arcade game or emulator.

The interaction behavior is:

- click once to zoom in and lock movement;
- click again or press `Esc` to zoom out;
- movement unlocks after the exit transition.

`cameraDistance` and `frontNormal` control the focused camera position. If the
camera enters a wall, reduce `cameraDistance` or verify that `frontNormal`
points toward the viewer.

## 8. Optional television light

The You Arcade corner TV currently uses `corner_tv_spotlight` in
`YOU_ARCADE_SPOT_LIGHTS`. Its `televisionFlicker` metadata changes brightness
and near-white color every 0.5–4 seconds:

- 75% of changes are hard cuts;
- 25% use a short eased transition.

This light is an approximation and is not sampling actual video frames. A new
TV does not automatically receive a light.

## 9. Validate

Run:

```bash
node --check play/PlayApplication.js
git diff --check
npm run build
```

Then manually verify:

- the bezel remains visible;
- the video is not hidden behind the original glass;
- orientation and mirroring are correct;
- audio gets quieter with distance;
- leaving the world stops its playback;
- focus enters and exits without leaving movement locked.
