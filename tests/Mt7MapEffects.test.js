import assert from "node:assert/strict";
import test from "node:test";
import {
  mt7MapEffectDefinition,
  mt7MapEffectMaterialState,
  WORKERS_PIER_FOUNTAIN_EFFECT,
  WORKERS_PIER_FOUNTAIN_JETS_EFFECT,
} from "../src/Mt7MapEffects.js";

function fountainModel() {
  return {
    textures: [{ textureIdHex: "e691caa8a831425f" }],
    nodes: [],
  };
}

test("identifies all three native Worker's Pier UV animations", () => {
  assert.equal(
    mt7MapEffectDefinition(
      "S2DC_D1_AR02_MPK00_MAP18.MT7",
      fountainModel(),
    ),
    WORKERS_PIER_FOUNTAIN_EFFECT,
  );
  assert.equal(
    mt7MapEffectDefinition(
      "S2DC_D1_AR02_MPK00_MAP17.MT7",
      fountainModel(),
    ),
    WORKERS_PIER_FOUNTAIN_JETS_EFFECT,
  );
  const water = mt7MapEffectDefinition(
    "S2DC_D1_AR02_MPK00_MAP16.MT7",
    fountainModel(),
  );
  assert.equal(water.modelIndex, 16);
  assert.equal(water.sourceUPerUpdate, 0.00015);
  assert.equal(water.sourceVPerUpdate, 0.0001);
  assert.equal(
    mt7MapEffectDefinition("S2DC_D1_AR02_MPK00_MAP15.MT7", fountainModel()),
    null,
  );
  assert.equal(
    mt7MapEffectDefinition(
      "S2DC_D1_AR02_MPK00_MAP18.MT7",
      null,
    ),
    null,
  );
});

test("matches generated effects independently of Shenmue II disc number", () => {
  const effect = mt7MapEffectDefinition(
    "S2DC_D3_KRK4_MPK00_MAP03.MT7",
    fountainModel(),
  );
  assert.equal(effect.roomId, "KRK4");
  assert.equal(effect.modelIndex, 3);
  assert.equal(effect.sourceVPerUpdate, -0.004);
});

test("uses the native repeat sampler for every texture in an animated model", () => {
  const original = { addressU: "clamp", addressV: "clamp", filterMode: 1 };
  assert.deepEqual(
    mt7MapEffectMaterialState(
      WORKERS_PIER_FOUNTAIN_EFFECT,
      "fountain",
      original,
    ),
    { addressU: "repeat", addressV: "repeat", filterMode: 1 },
  );
  assert.deepEqual(
    mt7MapEffectMaterialState(
      WORKERS_PIER_FOUNTAIN_EFFECT,
      "other",
      original,
    ),
    { addressU: "repeat", addressV: "repeat", filterMode: 1 },
  );
});
