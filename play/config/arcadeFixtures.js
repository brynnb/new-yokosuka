// Source-backed You Arcade fixture and media configuration.
const RADIANS_PER_DEGREE = Math.PI / 180;
export const YOU_ARCADE_INTERACTIONS = Object.freeze([
  Object.freeze({
    gameId: "hazukiTv",
    label: "Hazuki Residence Television",
    worldId: "interior",
    position: [-14.2482, 0.7414, -0.7918],
    size: [1.05, 0.85, 0.65],
    focusOnly: true,
  }),
  Object.freeze({
    gameId: "cornerTv",
    label: "Corner Television",
    position: [-4.6915, 1.0932, -6.0642],
    size: [0.7, 0.7, 0.5],
    focusOnly: true,
  }),
  Object.freeze({
    gameId: "harrier",
    label: "Space Harrier",
    position: [-2.4176, 0.9, -7.15],
    size: [1.15, 1.8, 1.15],
  }),
  Object.freeze({
    gameId: "hangon",
    label: "Hang-On",
    position: [-1.09, 0.9, -1.15],
    size: [1.4, 1.8, 1.4],
  }),
  Object.freeze({
    gameId: "astrob",
    label: "Astro Blaster",
    position: [-4.6013, 0.9, -2.185],
    size: [1.1, 1.8, 1.1],
  }),
  Object.freeze({
    gameId: "pacman",
    label: "Pac-Man",
    position: [-4.8852, 0.6, -3.9018],
    size: [1.1, 1.2, 1.1],
  }),
  Object.freeze({
    gameId: "invaders",
    label: "Space Invaders",
    position: [-0.4825, 0.6, -2.6593],
    size: [1.1, 1.2, 1.1],
  }),
  Object.freeze({
    gameId: "qte",
    label: "Excite QTE",
    position: [-0.355, 0.9, -7.637],
    size: [0.85, 1.8, 0.85],
  }),
  Object.freeze({
    gameId: "paddles",
    label: "Paddle Game",
    position: [-1.24, 1.15, -7.35],
    size: [0.9, 1.5, 0.85],
  }),
  Object.freeze({
    gameId: "darts",
    label: "Darts Seven",
    position: [-0.2, 0.9, -4.6],
    size: [0.9, 1.8, 0.9],
  }),
  Object.freeze({
    gameId: "darts",
    label: "Darts Seven",
    position: [-0.2, 0.9, -3.7],
    size: [0.9, 1.8, 0.9],
  }),
]);
// MAP03 is the active cabinet layout. It contains baked copies of the three
// BIGM402 round lamps, while the runtime placement table also supplies the
// independently controllable lamp models. Remove the 8-triangle baked copy of
// each lamp so the two versions cannot depth-fight.
export const YOU_ARCADE_HIDDEN_SCREEN_FACES = Object.freeze([
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP03.MT5",
    meshName: "mt5_tex_1",
    faceIds: Object.freeze([
      14, 15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28, 29,
      30, 31, 32, 33, 34, 35, 36, 37,
    ]),
  }),
]);
export const YOU_ARCADE_POSTERS = Object.freeze([
  Object.freeze({
    name: "sega_rally_poster",
    imageUrl: "/arcade/posters/sega-rally.jpg",
    sourceFilename: "S3_DGCT_MAP.MT5",
    meshName: "mt5_tex_12",
    faceIds: Object.freeze([0, 1]),
    sourceCenter: Object.freeze([
      -3.3416841, 1.375368, -8.08757591,
    ]),
    bottomLeft: Object.freeze([
      -3.63768411, 0.95536801, -8.08157591,
    ]),
    bottomRight: Object.freeze([
      -3.0456841, 0.95536801, -8.08157591,
    ]),
    topLeft: Object.freeze([
      -3.63768411, 1.79536799, -8.08157591,
    ]),
    topRight: Object.freeze([
      -3.0456841, 1.79536799, -8.08157591,
    ]),
  }),
  Object.freeze({
    name: "open_rally_poster",
    imageUrl: "/arcade/posters/open-rally.webp",
    sourceFilename: "S3_DGCT_MAP.MT5",
    meshName: "mt5_tex_12",
    faceIds: Object.freeze([0, 1]),
    sourceCenter: Object.freeze([
      -0.010558, 1.375368, -1.74440897,
    ]),
    // Offset slightly into the arcade from the selected wall surface.
    bottomLeft: Object.freeze([
      -0.004558, 0.9506828, -2.03364674,
    ]),
    bottomRight: Object.freeze([
      -0.004558, 0.96016087, -1.44172259,
    ]),
    topLeft: Object.freeze([
      -0.004558, 1.79057513, -2.04709534,
    ]),
    topRight: Object.freeze([
      -0.004558, 1.80005319, -1.45517119,
    ]),
  }),
]);
export const YOU_ARCADE_BACKLIT_SIGNS = Object.freeze([
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP.MT5",
    meshName: "mt5_tex_24",
    faceIds: Object.freeze([6, 7]),
    glowCenter: Object.freeze([
      -1.65770141, 0.1132095, -1.71639669,
    ]),
    glowNormal: Object.freeze([-0.713, 0, -0.701]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP03.MT5",
    meshName: "mt5_tex_9",
    faceIds: Object.freeze([60, 61]),
    glowCenter: Object.freeze([
      -4.5687902, 1.70538753, -2.24113828,
    ]),
    glowNormal: Object.freeze([0.5, -0.0032, -0.866]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP.MT5",
    meshName: "mt5_tex_30",
    faceIds: Object.freeze([0, 1]),
    glowCenter: Object.freeze([
      -2.41884999, 1.49631846, -7.4173951,
    ]),
    glowNormal: Object.freeze([0, -0.1227, 0.9924]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP03.MT5",
    meshName: "mt5_tex_2",
    faceIds: Object.freeze([61, 62]),
    glowCenter: Object.freeze([
      -1.24000001, 1.98858994, -7.59196803,
    ]),
    glowNormal: Object.freeze([0, 0, 1]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP03.MT5",
    meshName: "mt5_tex_2",
    faceIds: Object.freeze([57, 58]),
    glowCenter: Object.freeze([
      -1.24000001, 1.85799152, -7.84749801,
    ]),
    glowNormal: Object.freeze([0, 0, 1]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP03.MT5",
    meshName: "mt5_tex_1",
    faceIds: Object.freeze([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]),
    glowCenter: Object.freeze([
      -1.24000001, 1.83837917, -7.84884284,
    ]),
    glowNormal: Object.freeze([0, 0, 1]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP03.MT5",
    meshName: "mt5_tex_3",
    faceIds: Object.freeze([0, 1]),
    glowCenter: Object.freeze([
      -1.24000001, 1.57999702, -7.86749801,
    ]),
    glowNormal: Object.freeze([0, 0, 1]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP03.MT5",
    meshName: "mt5_tex_0",
    faceIds: Object.freeze([22, 23]),
    glowCenter: Object.freeze([
      -0.35499999, 1.72188652, -7.33700007,
    ]),
    // The title faces the aisle in front of the QTE cabinet.
    glowNormal: Object.freeze([0, 0, 1]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP03.MT5",
    meshName: "mt5_tex_4",
    faceIds: Object.freeze([124, 125]),
    glowCenter: Object.freeze([
      -0.259936, 2.32906306, -4.5996429,
    ]),
    glowNormal: Object.freeze([-1, 0, 0]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP03.MT5",
    meshName: "mt5_tex_4",
    faceIds: Object.freeze([124, 125]),
    glowCenter: Object.freeze([
      -0.259936, 2.32906306, -3.69964305,
    ]),
    // The MT5 winding points +X, but the marquee's visible face looks into
    // the arcade along -X.
    glowNormal: Object.freeze([-1, 0, 0]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP01.MT5",
    meshName: "mt5_tex_15",
    // Only replace the four visible front triangles. The surrounding
    // jukebox-top geometry keeps its original material and UV mapping.
    faceIds: Object.freeze([0, 1, 2, 3]),
    splitMirroredV: true,
    offset: 0,
    glowCenter: Object.freeze([
      -4.45140567, 1.73347396, -1.09552904,
    ]),
    glowNormal: Object.freeze([
      -0.511, -0.115, 0.852,
    ]),
  }),
  Object.freeze({
    sourceFilename: "S3_DGCT_MAP01.MT5",
    meshName: "mt5_tex_11",
    // Ten independent jukebox buttons, ten faces apiece.
    faceIds: Object.freeze(
      Array.from({ length: 100 }, (_, faceId) => faceId),
    ),
    glowCenter: Object.freeze([
      -4.30289775, 0.95246794, -1.42784995,
    ]),
    // The originals are removed, so retain the exact authored button
    // positions rather than pushing these small 3D components forward.
    offset: 0,
    glowNormal: Object.freeze([0, 0, 1]),
  }),
]);
export const YOU_ARCADE_SPOT_LIGHTS = Object.freeze([
  Object.freeze({
    name: "darts_board_downlight",
    position: Object.freeze([
      -1.38, 2.77, -3.69964305,
    ]),
    direction: Object.freeze([
      0.5887648892400363, -0.8083043394651347, 0,
    ]),
    angle: 170 * RADIANS_PER_DEGREE,
    exponent: 10,
    intensity: 6.8,
    range: 2.9,
    targetSourceFilename: "S3_DGCT_DARM401G.MT5",
    targetCenter: Object.freeze([
      -0.1625335, 1.416923, -3.69964305,
    ]),
  }),
  Object.freeze({
    name: "darts_board_downlight_2",
    position: Object.freeze([
      -1.38, 2.77, -4.5996429,
    ]),
    direction: Object.freeze([
      0.5887648892400363, -0.8083043394651347, 0,
    ]),
    angle: 170 * RADIANS_PER_DEGREE,
    exponent: 10,
    intensity: 6.8,
    range: 2.9,
    targetSourceFilename: "S3_DGCT_DARM401G.MT5",
    targetCenter: Object.freeze([
      -0.1625335, 1.416923, -4.5996429,
    ]),
  }),
  Object.freeze({
    name: "corner_tv_spotlight",
    position: Object.freeze([
      -4.66, 1.09, -6.08,
    ]),
    direction: Object.freeze([
      -0.7017565899639197,
      0.030075282427025132,
      -0.7117816841062614,
    ]),
    angle: 170 * RADIANS_PER_DEGREE,
    exponent: 2.4,
    intensity: 1,
    range: 4.8,
    targetSourceFilename: "S3_DGCT_MAP.MT5",
    targetCenter: Object.freeze([
      -4.66340549, 1.08678753, -6.08044136,
    ]),
    televisionFlicker: true,
  }),
]);
export const YOU_ARCADE_POINT_LIGHTS = Object.freeze([
  Object.freeze({
    name: "jukebox_glow",
    // Center of the selected illuminated jukebox element, lifted slightly
    // above its upward-facing surface.
    position: Object.freeze([
      -4.479, 1.218775, -1.054634,
    ]),
    color: Object.freeze([1, 0.72, 0.38]),
    intensity: 0.8,
    range: 2.25,
    radius: 0.12,
    targetSourceFilename: "S3_DGCT_MAP01.MT5",
    targetCenter: Object.freeze([
      -4.479, 1.138775, -1.054634,
    ]),
  }),
]);
export const YOU_ARCADE_DIGITAL_DISPLAYS = Object.freeze([
  Object.freeze({
    name: "darts_score_display",
    // Exact rectangle selected from S3_DGCT_MAP01.MT5 mt5_tex_22,
    // faces 106 and 107. Offset 6 mm toward the aisle to avoid z-fighting.
    bottomLeft: Object.freeze([-0.16169, 2.11, -3.9]),
    bottomRight: Object.freeze([-0.16169, 2.11, -3.5]),
    topLeft: Object.freeze([-0.16169, 2.2, -3.9]),
    topRight: Object.freeze([-0.16169, 2.2, -3.5]),
    scoreSource: "darts1HighScore",
    decimalPlaces: 4,
    maximum: 99999,
  }),
  Object.freeze({
    name: "darts_score_display_2",
    bottomLeft: Object.freeze([-0.16169, 1.96, -3.9]),
    bottomRight: Object.freeze([-0.16169, 1.96, -3.5]),
    topLeft: Object.freeze([-0.16169, 2.05, -3.9]),
    topRight: Object.freeze([-0.16169, 2.05, -3.5]),
    scoreSource: "darts1LastScore",
    decimalPlaces: 4,
    maximum: 99999,
  }),
  Object.freeze({
    name: "darts_score_display_3",
    bottomLeft: Object.freeze([-0.16169, 1.81, -3.9]),
    bottomRight: Object.freeze([-0.16169, 1.81, -3.5]),
    topLeft: Object.freeze([-0.16169, 1.9, -3.9]),
    topRight: Object.freeze([-0.16169, 1.9, -3.5]),
    scoreSource: "darts1TimeBonus",
    decimalPlaces: 4,
    maximum: 10,
  }),
  Object.freeze({
    name: "darts_score_display_4",
    bottomLeft: Object.freeze([-0.16169, 1.66, -3.9]),
    bottomRight: Object.freeze([-0.16169, 1.66, -3.5]),
    topLeft: Object.freeze([-0.16169, 1.75, -3.9]),
    topRight: Object.freeze([-0.16169, 1.75, -3.5]),
    scoreSource: "darts1Score",
    decimalPlaces: 4,
    maximum: 99999,
  }),
  Object.freeze({
    name: "darts_score_display_5",
    bottomLeft: Object.freeze([-0.16169, 2.11, -4.8]),
    bottomRight: Object.freeze([-0.16169, 2.11, -4.4]),
    topLeft: Object.freeze([-0.16169, 2.2, -4.8]),
    topRight: Object.freeze([-0.16169, 2.2, -4.4]),
    scoreSource: "darts0HighScore",
    decimalPlaces: 4,
    maximum: 99999,
  }),
  Object.freeze({
    name: "darts_score_display_6",
    bottomLeft: Object.freeze([-0.16169, 1.96, -4.8]),
    bottomRight: Object.freeze([-0.16169, 1.96, -4.4]),
    topLeft: Object.freeze([-0.16169, 2.05, -4.8]),
    topRight: Object.freeze([-0.16169, 2.05, -4.4]),
    scoreSource: "darts0LastScore",
    decimalPlaces: 4,
    maximum: 99999,
  }),
  Object.freeze({
    name: "darts_score_display_7",
    bottomLeft: Object.freeze([-0.16169, 1.81, -4.8]),
    bottomRight: Object.freeze([-0.16169, 1.81, -4.4]),
    topLeft: Object.freeze([-0.16169, 1.9, -4.8]),
    topRight: Object.freeze([-0.16169, 1.9, -4.4]),
    scoreSource: "darts0TimeBonus",
    decimalPlaces: 4,
    maximum: 10,
  }),
  Object.freeze({
    name: "darts_score_display_8",
    bottomLeft: Object.freeze([-0.16169, 1.66, -4.8]),
    bottomRight: Object.freeze([-0.16169, 1.66, -4.4]),
    topLeft: Object.freeze([-0.16169, 1.75, -4.8]),
    topRight: Object.freeze([-0.16169, 1.75, -4.4]),
    scoreSource: "darts0Score",
    decimalPlaces: 4,
    maximum: 99999,
  }),
  Object.freeze({
    name: "paddle_score_display",
    // Five-digit score panel selected from the paddle cabinet marquee.
    // It sits 2 mm in front of the emissive sign replacement.
    bottomLeft: Object.freeze([
      -1.09638801, 1.78406501, -7.84391001,
    ]),
    bottomRight: Object.freeze([
      -0.817, 1.78410602, -7.84390701,
    ]),
    topLeft: Object.freeze([
      -1.09638801, 1.84528601, -7.83931001,
    ]),
    topRight: Object.freeze([
      -0.817, 1.84528601, -7.839311,
    ]),
    scoreSource: "paddles",
    digits: 5,
    maximum: 99999,
    backgroundColor: "#08090b",
    opaqueBackground: true,
    emissiveBoost: 1.8,
    uvs: Object.freeze([1, 1, 0, 1, 1, 0, 0, 0]),
  }),
  Object.freeze({
    name: "paddle_high_score_display",
    bottomLeft: Object.freeze([
      -1.37970001, 1.78406501, -7.84391001,
    ]),
    bottomRight: Object.freeze([
      -1.10030001, 1.78410602, -7.84391001,
    ]),
    topLeft: Object.freeze([
      -1.37970001, 1.84528601, -7.839311,
    ]),
    topRight: Object.freeze([
      -1.10030001, 1.84528601, -7.839311,
    ]),
    scoreSource: "paddlesHighScore",
    digits: 5,
    maximum: 99999,
    backgroundColor: "#08090b",
    opaqueBackground: true,
    emissiveBoost: 1.8,
    uvs: Object.freeze([1, 1, 0, 1, 1, 0, 0, 0]),
  }),
  Object.freeze({
    name: "paddle_last_score_display",
    bottomLeft: Object.freeze([
      -1.66300002, 1.78410602, -7.84390701,
    ]),
    bottomRight: Object.freeze([
      -1.38361201, 1.78406501, -7.84391001,
    ]),
    topLeft: Object.freeze([
      -1.66300002, 1.84528601, -7.839311,
    ]),
    topRight: Object.freeze([
      -1.38361201, 1.84528601, -7.83931001,
    ]),
    scoreSource: "paddlesLastScore",
    digits: 5,
    maximum: 99999,
    backgroundColor: "#08090b",
    opaqueBackground: true,
    emissiveBoost: 1.8,
    uvs: Object.freeze([1, 1, 0, 1, 1, 0, 0, 0]),
  }),
]);
export const JAPANESE_TV_HLS_URL = (
  "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev"
  + "/media/japanese-tv/v1/index.m3u8"
);
export const GODZILLA_VS_BIOLLANTE_HLS_URL = (
  "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev"
  + "/media/godzilla-vs-biollante/v1/index.m3u8"
);
export const JAPANESE_TV_SYNC_EPOCH_MS = Date.UTC(1986, 5, 9);
export const ARCADE_ATTRACT_SYNC_INTERVAL_MS = 1000;
export const ARCADE_ATTRACT_MAX_DRIFT_SECONDS = 0.35;
export const ARCADE_CABINET_VIEWS = Object.freeze({
  cinemaScreen: Object.freeze({
    worldId: "cinema",
    audioChannel: "tv",
    screenGlow: false,
    // Exact world-space corners selected from Screen_primitive1 faces 0-1
    // after the cinema GLB's 1.5x world scale has been applied.
    bottomLeft: Object.freeze([
      6.77651276, 1.95702201, -11.8559823,
    ]),
    bottomRight: Object.freeze([
      -6.87302576, 1.95702201, -11.8559823,
    ]),
    topLeft: Object.freeze([
      6.77651276, 7.88041347, -11.8559823,
    ]),
    topRight: Object.freeze([
      -6.87302576, 7.88041347, -11.8559823,
    ]),
    center: Object.freeze([
      -0.0482565, 4.91871774, -11.8559823,
    ]),
    frontNormal: Object.freeze([0, 0, 1]),
    up: Object.freeze([0, 1, 0]),
    attractUrl: GODZILLA_VS_BIOLLANTE_HLS_URL,
    attractFallbackUrl: "/arcade/attract/corner-tv.mp4",
    reverseU: false,
  }),
  hazukiTv: Object.freeze({
    worldId: "interior",
    audioChannel: "tv",
    // Glass-only bounds selected from texture e7abc8616064365f on
    // S1_JOMO_MAP02.MT5 mt5_tex_24. Texture U runs vertically across this
    // placed face, so the picker corners are reordered into physical screen
    // corners here.
    bottomLeft: Object.freeze([
      -14.44402674, 0.54193813, -0.60918077,
    ]),
    bottomRight: Object.freeze([
      -14.05231759, 0.54193813, -0.97446168,
    ]),
    topLeft: Object.freeze([
      -14.44402674, 0.94094795, -0.60918077,
    ]),
    topRight: Object.freeze([
      -14.05231759, 0.94094795, -0.97446168,
    ]),
    center: Object.freeze([
      -14.24817217, 0.74144304, -0.79182123,
    ]),
    frontNormal: Object.freeze([
      -0.6818, 0, -0.7315,
    ]),
    up: Object.freeze([0, 1, 0]),
    cameraDistance: 0.62,
    attractUrl: JAPANESE_TV_HLS_URL,
    attractFallbackUrl: "/arcade/attract/corner-tv.mp4",
    reverseU: false,
  }),
  cornerTv: Object.freeze({
    worldId: "arcade",
    audioChannel: "tv",
    // Its authored television spotlight supplies the room glow.
    screenGlow: false,
    // The original TV face also contains its bezel and controls. These are
    // the four world-space corners of only the glass display, selected from
    // texture e8a7c8926038425f on S3_DGCT_MAP.MT5 mt5_tex_35.
    bottomLeft: Object.freeze([
      -4.81311542, 0.98328888, -5.99401268,
    ]),
    bottomRight: Object.freeze([
      -4.56980889, 0.98328888, -6.1344754,
    ]),
    topLeft: Object.freeze([
      -4.81311542, 1.20317935, -5.99401268,
    ]),
    topRight: Object.freeze([
      -4.56980889, 1.20317935, -6.1344754,
    ]),
    center: Object.freeze([
      -4.69146216, 1.09323412, -6.06424404,
    ]),
    frontNormal: Object.freeze([
      -0.5, 0, -0.8660254,
    ]),
    up: Object.freeze([0, 1, 0]),
    cameraDistance: 0.55,
    attractUrl: JAPANESE_TV_HLS_URL,
    attractFallbackUrl: "/arcade/attract/corner-tv.mp4",
    reverseU: false,
  }),
  hangon: Object.freeze({
    // Exact browser-space quad selected from mt5_tex_45 faces 365 and 366.
    // These triangles sample the blue lower-right Hang-On image in texture
    // dba3c661aa38325f.
    bottomLeft: Object.freeze([
      -0.48471483, 1.10018003, -1.05307801,
    ]),
    bottomRight: Object.freeze([
      -0.75073125, 1.10018003, -0.78503292,
    ]),
    topLeft: Object.freeze([
      -0.43428079, 1.335603, -0.980979,
    ]),
    topRight: Object.freeze([
      -0.67825059, 1.335603, -0.73514843,
    ]),
    center: Object.freeze([
      -0.58699436, 1.21789151, -0.88855959,
    ]),
    frontNormal: Object.freeze([-0.66616193, 0.34518001, -0.66111954]),
    up: Object.freeze([0.24500564, 0.93853639, 0.2431495]),
    cameraDistance: 0.52,
    attractUrl: "/arcade/attract/hang-on.mp4",
  }),
  harrier: Object.freeze({
    // Exact corners of the authored Space Harrier CRT face in browser space.
    // The authored CRT face is about 0.417 units tall. Use its true 4:3
    // display width rather than the narrower inset texture bounds.
    bottomLeft: Object.freeze([-2.69935, 0.918129, -7.662]),
    bottomRight: Object.freeze([-2.14335, 0.918129, -7.662]),
    topLeft: Object.freeze([-2.69935, 1.331417, -7.72]),
    topRight: Object.freeze([-2.14335, 1.331417, -7.72]),
    center: Object.freeze([-2.42135, 1.124773, -7.691]),
    frontNormal: Object.freeze([0, 0.138976, 0.990296]),
    up: Object.freeze([0, 0.990296, -0.138976]),
    cameraDistance: 0.78,
    attractUrl: "/arcade/attract/space-harrier.mp4",
  }),
  astrob: Object.freeze({
    // Exact authored portrait CRT selected from S3_DGCT_MAP03.MT5,
    // mt5_tex_8 faces 0 and 1.
    bottomLeft: Object.freeze([
      -4.68593502, 1.13620806, -2.2516129,
    ]),
    bottomRight: Object.freeze([
      -4.5012989, 1.13620806, -2.14501309,
    ]),
    topLeft: Object.freeze([
      -4.70127583, 1.47975898, -2.22504306,
    ]),
    topRight: Object.freeze([
      -4.51663923, 1.47975898, -2.11844301,
    ]),
    center: Object.freeze([
      -4.60128725, 1.30798352, -2.18502802,
    ]),
    frontNormal: Object.freeze([
      0.49801837, 0.08895027, -0.86259234,
    ]),
    up: Object.freeze([
      -0.04447665, 0.99603607, 0.07703231,
    ]),
    cameraDistance: 0.62,
    attractUrl: "/arcade/attract/astro-blaster.mp4",
    reverseU: false,
  }),
  pacman: Object.freeze({
    // Exact upward-facing cocktail-table screen selected from
    // S3_DGCT_MAP.MT5, mt5_tex_28 faces 0 and 1.
    bottomLeft: Object.freeze([
      -5.06797814, 0.59608299, -4.08482809,
    ]),
    bottomRight: Object.freeze([
      -5.06797814, 0.59608299, -3.71871909,
    ]),
    topLeft: Object.freeze([
      -4.70239213, 0.59608299, -4.08482809,
    ]),
    topRight: Object.freeze([
      -4.70239213, 0.59608299, -3.71871909,
    ]),
    center: Object.freeze([
      -4.88518514, 0.59608299, -3.90177359,
    ]),
    frontNormal: Object.freeze([0, 1, 0]),
    up: Object.freeze([0, 0, -1]),
    cameraDistance: 0.72,
    attractUrl: "/arcade/attract/pac-man.mp4",
    reverseU: false,
    screenUvs: Object.freeze([1, 1, 1, 0, 0, 0, 0, 1]),
  }),
  invaders: Object.freeze({
    // Exact upward-facing cocktail-table screen selected from
    // S3_DGCT_MAP.MT5, mt5_tex_28 faces 0 and 1.
    bottomLeft: Object.freeze([
      -0.299486, 0.59608299, -2.84206909,
    ]),
    bottomRight: Object.freeze([
      -0.665595, 0.59608299, -2.84206909,
    ]),
    topLeft: Object.freeze([
      -0.299486, 0.59608299, -2.47648309,
    ]),
    topRight: Object.freeze([
      -0.665595, 0.59608299, -2.47648309,
    ]),
    center: Object.freeze([
      -0.4825405, 0.59608299, -2.65927609,
    ]),
    frontNormal: Object.freeze([0, 1, 0]),
    up: Object.freeze([1, 0, 0]),
    cameraDistance: 0.72,
    attractUrl: "/arcade/attract/space-invaders.mp4",
    reverseU: false,
    screenUvs: Object.freeze([1, 1, 1, 0, 0, 0, 0, 1]),
  }),
  qte: Object.freeze({
    // Exact authored QTE 2 CRT selected from S3_DGCT_MAP01.MT5,
    // mt5_tex_0 faces 8 and 9. The six separate authored display elements
    // that sit over this screen are removed by YOU_ARCADE_HIDDEN_SCREEN_FACES.
    bottomLeft: Object.freeze([
      -0.52105999, 1.24844599, -7.62850508,
    ]),
    bottomRight: Object.freeze([
      -0.18893899, 1.24844599, -7.62850508,
    ]),
    topLeft: Object.freeze([
      -0.52105999, 1.62084603, -7.62850508,
    ]),
    topRight: Object.freeze([
      -0.18893899, 1.62084603, -7.62850508,
    ]),
    center: Object.freeze([
      -0.35499949, 1.43464601, -7.62850508,
    ]),
    frontNormal: Object.freeze([0, 0, 1]),
    up: Object.freeze([0, 1, 0]),
    cameraDistance: 0.68,
    attractImageUrl: "/arcade/qte2/title-screen.png",
    screenUvs: Object.freeze([1, 1, 0, 1, 0, 0, 1, 0]),
  }),
  paddles: Object.freeze({
    // BIGM402 supplies its independently controlled cabinet lights.
    screenGlow: false,
    center: Object.freeze([-1.24, 1.45, -7.48]),
    frontNormal: Object.freeze([0, 0, 1]),
    up: Object.freeze([0, 1, 0]),
    cameraDistance: 1.8,
    physical: true,
  }),
});
