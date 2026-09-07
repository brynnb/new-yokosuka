import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as BABYLON from "@babylonjs/core";
import {
  ARCADE_CABINET_VIEWS,
  YOU_ARCADE_BACKLIT_SIGNS,
  YOU_ARCADE_DIGITAL_DISPLAYS,
  YOU_ARCADE_HIDDEN_SCREEN_FACES,
  YOU_ARCADE_POSTERS,
  YOU_ARCADE_POINT_LIGHTS,
  YOU_ARCADE_SPOT_LIGHTS,
} from "../play/config/arcadeFixtures.js";
import { ArcadeLighting } from "../play/arcade/ArcadeLighting.js";
import {
  YOU_ARCADE_MAP01_JUKEBOX_NODE_ADDRESS,
  hideYouArcadeScreenFaces,
  keepOnlyYouArcadeMap01Jukebox,
} from "../play/arcade/ArcadeFixtures.js";
import { Mt5Loader } from "../src/Mt5Loader.js";

const map01Path = new URL(
  "../public/models/S3_DGCT_MAP01.MT5",
  import.meta.url,
);
const map03Path = new URL(
  "../public/models/S3_DGCT_MAP03.MT5",
  import.meta.url,
);

test("arcade fixture configuration has no implicit engine globals", () => {
  assert.equal(YOU_ARCADE_SPOT_LIGHTS.length, 3);
  for (const light of YOU_ARCADE_SPOT_LIGHTS) {
    assert.ok(Number.isFinite(light.angle));
    assert.ok(light.angle > 0);
  }
  const paddleScore = YOU_ARCADE_DIGITAL_DISPLAYS.find(
    ({ name }) => name === "paddle_score_display",
  );
  assert.equal(paddleScore?.scoreSource, "paddles");
  assert.equal(paddleScore?.digits, 5);
  assert.equal(paddleScore?.maximum, 99999);
  assert.deepEqual(paddleScore?.uvs, [1, 1, 0, 1, 1, 0, 0, 0]);
  const paddleHighScore = YOU_ARCADE_DIGITAL_DISPLAYS.find(
    ({ name }) => name === "paddle_high_score_display",
  );
  assert.equal(paddleHighScore?.scoreSource, "paddlesHighScore");
  assert.equal(paddleHighScore?.digits, 5);
  assert.equal(paddleHighScore?.maximum, 99999);
  assert.deepEqual(paddleHighScore?.uvs, [1, 1, 0, 1, 1, 0, 0, 0]);
  const paddleLastScore = YOU_ARCADE_DIGITAL_DISPLAYS.find(
    ({ name }) => name === "paddle_last_score_display",
  );
  assert.equal(paddleLastScore?.scoreSource, "paddlesLastScore");
  assert.equal(paddleLastScore?.digits, 5);
  assert.equal(paddleLastScore?.maximum, 99999);
  assert.deepEqual(paddleLastScore?.uvs, [1, 1, 0, 1, 1, 0, 0, 0]);
  assert.deepEqual(YOU_ARCADE_POSTERS, [
    {
      name: "sega_rally_poster",
      imageUrl: "/arcade/posters/sega-rally.jpg",
      sourceFilename: "S3_DGCT_MAP.MT5",
      meshName: "mt5_tex_12",
      faceIds: [0, 1],
      sourceCenter: [-3.3416841, 1.375368, -8.08757591],
      bottomLeft: [-3.63768411, 0.95536801, -8.08157591],
      bottomRight: [-3.0456841, 0.95536801, -8.08157591],
      topLeft: [-3.63768411, 1.79536799, -8.08157591],
      topRight: [-3.0456841, 1.79536799, -8.08157591],
    },
    {
      name: "open_rally_poster",
      imageUrl: "/arcade/posters/open-rally.webp",
      sourceFilename: "S3_DGCT_MAP.MT5",
      meshName: "mt5_tex_12",
      faceIds: [0, 1],
      sourceCenter: [-0.010558, 1.375368, -1.74440897],
      bottomLeft: [-0.004558, 0.9506828, -2.03364674],
      bottomRight: [-0.004558, 0.96016087, -1.44172259],
      topLeft: [-0.004558, 1.79057513, -2.04709534],
      topRight: [-0.004558, 1.80005319, -1.45517119],
    },
  ]);
});

test("only six game screens create general arcade glow lights", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const lighting = new ArcadeLighting({
      scene,
      cabinetDefinitions: ARCADE_CABINET_VIEWS,
      pointLights: YOU_ARCADE_POINT_LIGHTS,
      spotLights: YOU_ARCADE_SPOT_LIGHTS,
      worldId: "arcade",
      getCurrentMeshes: () => [],
      getSkybox: () => null,
    });
    lighting.create("arcade");
    assert.deepEqual(
      scene.lights.filter(
        (light) => light.metadata?.arcadeScreenGlow,
      ).map(({ name }) => name),
      [
        "hangon_screen_glow",
        "harrier_screen_glow",
        "astrob_screen_glow",
        "pacman_screen_glow",
        "invaders_screen_glow",
        "qte_screen_glow",
      ],
    );
    for (const light of scene.lights.filter(
      (candidate) => candidate.metadata?.arcadeScreenGlow,
    )) {
      assert.equal(light.getClassName(), "PointLight");
      assert.equal(light.intensity, 1);
      assert.equal(light.range, 2.25);
      assert.equal(light.radius, 0.12);
    }
    assert.equal(
      scene.lights.filter(
        (light) => light.metadata?.arcadeFixtureLight,
      ).length,
      4,
    );
    const jukebox = scene.getLightByName("jukebox_glow");
    assert.equal(jukebox?.getClassName(), "PointLight");
    assert.equal(jukebox?.intensity, 0.8);
    assert.equal(jukebox?.range, 2.25);
    lighting.setPerformanceLightsEnabled(false);
    assert.ok(lighting.lights.every((light) => !light.isEnabled()));
    lighting.setPerformanceLightsEnabled(true);
    assert.ok(lighting.lights.every((light) => light.isEnabled()));
    lighting.dispose();
  } finally {
    engine.dispose();
  }
});

test("clusters machine glows without changing the dartboard or TV spotlights", () => {
  const engine = new BABYLON.NullEngine();
  engine._caps.texelFetch = true;
  engine._caps.colorBufferFloat = true;
  engine._caps.blendFloat = true;
  engine._webGLVersion = 2;
  engine.hostInformation.isMobile = false;
  const scene = new BABYLON.Scene(engine);
  try {
    const lighting = new ArcadeLighting({
      scene,
      cabinetDefinitions: ARCADE_CABINET_VIEWS,
      pointLights: YOU_ARCADE_POINT_LIGHTS,
      spotLights: YOU_ARCADE_SPOT_LIGHTS,
      worldId: "arcade",
      getCurrentMeshes: () => [],
      getSkybox: () => null,
    });
    lighting.create("arcade");

    assert.ok(lighting.cluster);
    assert.deepEqual(
      lighting.cluster.lights.map(({ name }) => name),
      [
        "hangon_screen_glow",
        "harrier_screen_glow",
        "astrob_screen_glow",
        "pacman_screen_glow",
        "invaders_screen_glow",
        "qte_screen_glow",
        "jukebox_glow",
      ],
    );
    for (const name of [
      "darts_board_downlight",
      "darts_board_downlight_2",
      "corner_tv_spotlight",
    ]) {
      const light = lighting.lights.find((candidate) => candidate.name === name);
      assert.equal(light?.getClassName(), "SpotLight");
      assert.equal(light?._clusteredContainer, null);
    }

    lighting.dispose();
    assert.equal(
      scene.materials.some((material) => material.name === "ProxyMaterial"),
      false,
    );
  } finally {
    engine.dispose();
  }
});

test("the baked MAP03 paddle lamps are suppressed for runtime lamps", {
  skip: !existsSync(map03Path) && "requires the local MAP03 source model",
}, async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const source = readFileSync(map03Path);
    const roots = await new Mt5Loader(scene).load(
      source.buffer.slice(
        source.byteOffset,
        source.byteOffset + source.byteLength,
      ),
      null,
    );
    for (const root of roots) root._filename = "S3_DGCT_MAP03.MT5";
    hideYouArcadeScreenFaces(roots);
    const mesh = roots.flatMap(
      (root) => root.getChildMeshes(false),
    ).find(({ name }) => name === "mt5_tex_1");
    const indices = mesh.getIndices();
    for (let faceId = 14; faceId <= 37; faceId++) {
      const offset = faceId * 3;
      assert.equal(indices[offset + 1], indices[offset]);
      assert.equal(indices[offset + 2], indices[offset]);
    }
  } finally {
    engine.dispose();
  }
});

test("You Arcade uses MAP03 fixtures and retains only MAP01's jukebox", {
  skip: !existsSync(map01Path) && "requires the local MAP01 source model",
}, async () => {
  assert.equal(YOU_ARCADE_MAP01_JUKEBOX_NODE_ADDRESS, 67560);
  assert.deepEqual(YOU_ARCADE_HIDDEN_SCREEN_FACES, [{
    sourceFilename: "S3_DGCT_MAP03.MT5",
    meshName: "mt5_tex_1",
    faceIds: [
      14, 15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28, 29,
      30, 31, 32, 33, 34, 35, 36, 37,
    ],
  }]);
  assert.deepEqual(
    YOU_ARCADE_BACKLIT_SIGNS.filter(
      ({ sourceFilename }) => sourceFilename === "S3_DGCT_MAP01.MT5",
    ).map(({ meshName, faceIds }) => ({ meshName, faceIds })),
    [
      { meshName: "mt5_tex_15", faceIds: [0, 1, 2, 3] },
      {
        meshName: "mt5_tex_11",
        faceIds: Array.from({ length: 100 }, (_, faceId) => faceId),
      },
    ],
  );

  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const source = readFileSync(map01Path);
    const roots = await new Mt5Loader(scene).load(
      source.buffer.slice(
        source.byteOffset,
        source.byteOffset + source.byteLength,
      ),
      null,
    );
    for (const root of roots) {
      root._filename = "S3_DGCT_MAP01.MT5";
    }
    assert.deepEqual(keepOnlyYouArcadeMap01Jukebox(roots), {
      retainedTriangles: 1250,
      suppressedTriangles: 927,
    });
  } finally {
    engine.dispose();
  }
});
