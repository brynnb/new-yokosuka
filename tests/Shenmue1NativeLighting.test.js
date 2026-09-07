import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import nativeLightCatalog from "../play/data/shenmue1-native-lights.json" with {
  type: "json",
};
import { WORLDS } from "../play/config/worlds.js";
import { NativeSceneLighting } from "../src/rendering/NativeSceneLighting.js";
import {
  findShenmue1LightScenes,
  parseShenmue1LightScene,
} from "../tools/lib/shenmue1_lght.js";

function fixture() {
  const bytes = Buffer.alloc(0x40);
  bytes.write("LGHT", 0, "ascii");
  bytes.writeUInt32LE(0x40, 4);
  bytes.write("LGHT", 8, "ascii");
  bytes.writeUInt32LE(0x38, 0x0c);
  bytes.writeFloatLE(1.2, 0x10);
  bytes.writeUInt16LE(1, 0x14);
  bytes.writeUInt16LE(3, 0x16);
  for (let offset = 0x18; offset < 0x20; offset += 2) {
    bytes.writeUInt16LE(0x3800, offset);
  }
  bytes.writeUInt16LE(7, 0x20);
  bytes.writeUInt16LE(1, 0x22);
  bytes.writeUInt16LE(11, 0x24);
  for (let offset = 0x26; offset < 0x3e; offset += 2) {
    bytes.writeUInt16LE(0x3c00, offset);
  }
  bytes.writeUInt16LE(1820, 0x3e);
  return bytes;
}

test("parses Shenmue I nested LGHT records", () => {
  const parsed = parseShenmue1LightScene(fixture());
  assert.equal(parsed.root.size, 0x40);
  assert.equal(parsed.children.length, 1);
  assert.equal(parsed.children[0].mode, 3);
  assert.deepEqual(parsed.children[0].globalValues, [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(parsed.children[0].records[0], {
    slot: 7,
    enabled: 1,
    nativeType: 11,
    color: [1, 1, 1],
    intensity: 1,
    scalarA: 1,
    scalarB: 1,
    position: [1, 1, 1],
    direction: [1, 1, 1],
    angularParameter: 1820,
    sourceOffset: 0x20,
  });
});

test("rejects inconsistent Shenmue I LGHT child sizes", () => {
  const bytes = fixture();
  bytes.writeUInt16LE(2, 0x14);
  assert.throws(
    () => parseShenmue1LightScene(bytes),
    /has size 56, expected 88/,
  );
});

test("locates LGHT roots embedded in MAPINFO token streams", () => {
  const bytes = Buffer.concat([
    Buffer.from("ATTR\x08\x00\x00\x00", "binary"),
    fixture(),
  ]);
  const scenes = findShenmue1LightScenes(bytes);
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0].offset, 8);
  assert.equal(scenes[0].scene.children[0].records[0].slot, 7);
});

test("generated catalog retains every recovered scripted light preset", () => {
  const d000 = nativeLightCatalog.areas.D000;
  assert.equal(d000.source.sha256, (
    "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e"
  ));
  assert.equal(d000.source.lghtOffset, 0);
  assert.equal(d000.initialPresetIndex, 0);
  assert.equal(d000.presets[0].sourceRecordCount, 100);
  assert.equal(d000.presets[0].records.length, 97);
  assert.equal(Object.keys(nativeLightCatalog.areas).length, 30);
  assert.equal(
    Object.values(nativeLightCatalog.areas).reduce(
      (sum, area) => sum + area.presets.reduce(
        (presetSum, preset) => presetSum + preset.records.length,
        0,
      ),
      0,
    ),
    731,
  );
  assert.equal(nativeLightCatalog.areas.OP02.presets.length, 2);
  assert.deepEqual(
    nativeLightCatalog.areas.OP02.presets.map(preset => preset.records[0].direction),
    [
      [-0.5595703125, -0.1700439453125, 0.9296875],
      [0.0731201171875, -0.059722900390625, 1],
    ],
  );
});

test("every opted-in Shenmue I world resolves a generated light baseline", () => {
  const optedIn = Object.values(WORLDS).filter(
    ({ nativePointLightingArea }) => nativePointLightingArea,
  );
  assert.ok(optedIn.length > 20);
  for (const world of optedIn) {
    assert.ok(
      nativeLightCatalog.areas[world.nativePointLightingArea],
      `${world.id} has missing ${world.nativePointLightingArea} lights`,
    );
  }
  for (const worldId of ["exterior", "arcade", "cinema", "dsus", "dgct"]) {
    assert.equal(WORLDS[worldId]?.nativePointLightingArea, undefined);
  }
  assert.equal(WORLDS.ma00.nativePointLightingArea, "MFSY");
  assert.equal(WORLDS.ma00race.nativePointLightingArea, "MA00");
});

test("native scene lighting uses clustered points or bounded fallback", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const material = new BABYLON.StandardMaterial("world", scene);
  const globalLight = new BABYLON.HemisphericLight(
    "global",
    BABYLON.Vector3.Up(),
    scene,
  );
  const runtime = new NativeSceneLighting({
    scene,
    getActorPosition: () => BABYLON.Vector3.Zero(),
  });
  try {
    await runtime.create({
      id: "dobuita",
      nativeArea: "D000",
      nativePointLightingArea: "D000",
    });
    assert.equal(runtime.mode, "fallback");
    assert.equal(runtime.lights.length, 97);
    assert.equal(
      runtime.lights.filter((light) => light.isEnabled()).length,
      4,
    );
    assert.equal(material.maxSimultaneousLights, 8);
    runtime.clear();
    assert.equal(scene.getLightByName("global"), globalLight);
    assert.equal(material.maxSimultaneousLights, 4);
    assert.equal(
      scene.lights.some((light) => light.metadata?.nativeSceneLight),
      false,
    );
    assert.equal(
      scene.materials.some((candidate) => candidate.name === "ProxyMaterial"),
      false,
    );
  } finally {
    runtime.dispose();
    engine.dispose();
  }
});

test("large native baselines cluster without reducing their light count", async () => {
  const engine = new BABYLON.NullEngine();
  engine._caps.texelFetch = true;
  engine._caps.colorBufferFloat = true;
  engine._caps.blendFloat = true;
  engine._webGLVersion = 2;
  engine.hostInformation.isMobile = false;
  const scene = new BABYLON.Scene(engine);
  const otherScene = new BABYLON.Scene(engine);
  const runtime = new NativeSceneLighting({ scene });
  try {
    await runtime.create({
      id: "mfsy",
      nativeArea: "MFSY",
      nativePointLightingArea: "MFSY",
    });
    assert.equal(runtime.mode, "clustered");
    assert.equal(runtime.area, "MFSY");
    assert.equal(runtime.cluster.lights.length, 115);
    runtime.update();
    assert.equal(
      runtime.cluster.lights.filter((light) => light.isEnabled()).length,
      115,
    );
    for (const candidate of [scene, otherScene]) {
      assert.equal(
        candidate.meshes.some((mesh) => mesh.name === "ProxyMesh"),
        false,
      );
    }
    runtime.clear();
    assert.equal(
      scene.materials.some((material) => material.name === "ProxyMaterial"),
      false,
    );
  } finally {
    runtime.dispose();
    otherScene.dispose();
    engine.dispose();
  }
});

test("native scene lighting requires explicit world opt-in", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const runtime = new NativeSceneLighting({ scene });
    await runtime.create({
      id: "sakuragaoka",
      nativeArea: "JD00",
    });
    assert.equal(runtime.mode, null);
    assert.equal(runtime.lights.length, 0);
  } finally {
    engine.dispose();
  }
});

test("lighting batches yield, cancel safely, and preserve material ownership", async (t) => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const materials = Array.from({length: 4}, (_, i) => new BABYLON.StandardMaterial(`batch-${i}`, scene));
  const runtime = new NativeSceneLighting({scene});
  const controller = new AbortController();
  let tick = 0;
  const clock = t.mock.method(performance, "now", () => (tick += 10));
  let resume;
  let yields = 0;
  const loading = runtime.create({nativePointLightingArea: "D000"}, {
    signal: controller.signal,
    yieldWork: () => { yields++; return new Promise(resolve => { resume = resolve; }); },
  });
  try {
    assert.equal(yields, 1);
    assert.equal(runtime.preparing, true);
    assert.equal(materials[0].maxSimultaneousLights, 8);
    assert.equal(materials[1].maxSimultaneousLights, 4);
    runtime.update();
    assert.equal(materials[1].maxSimultaneousLights, 4, "frame update must not race preparation");
    controller.abort();
    resume();
    await assert.rejects(loading, {name: "AbortError"});
    assert.equal(materials[1].maxSimultaneousLights, 4, "cancelled work must not continue configuring");
    clock.mock.restore();
    runtime.clear();
    assert.equal(materials[0].maxSimultaneousLights, 4);
    materials[0].maxSimultaneousLights = 12;
    materials[1].freeze();
    await runtime.create({nativePointLightingArea: "D000"});
    assert.equal(materials[0].maxSimultaneousLights, 12);
    assert.equal(materials[1].isFrozen, false);
    runtime.clear();
    assert.equal(materials[0].maxSimultaneousLights, 12);
    assert.equal(materials[1].isFrozen, true);
  } finally {
    clock.mock.restore();
    runtime.dispose();
    engine.dispose();
  }
});

test("cleared lighting cannot resume against a replacement world", async (t) => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const material = new BABYLON.StandardMaterial("replacement", scene);
  const runtime = new NativeSceneLighting({scene});
  let tick = 0;
  const clock = t.mock.method(performance, "now", () => (tick += 10));
  let resume;
  const pending = runtime.create({nativePointLightingArea: "D000"}, {
    yieldWork: () => new Promise(resolve => { resume = resolve; }),
  });
  clock.mock.restore();
  runtime.clear();
  await runtime.create({id: "unlit"});
  resume();
  await assert.rejects(pending, {name: "AbortError"});
  assert.equal(runtime.mode, null);
  assert.equal(material.maxSimultaneousLights, 4);
  runtime.dispose();
  engine.dispose();
});
