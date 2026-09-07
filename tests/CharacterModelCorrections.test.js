import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  characterModelBindScaleCorrection,
} from "../play/characters/CharacterModelCorrections.js";

test("playable characters reuse authoritative bind-scale corrections", async () => {
  assert.equal(characterModelBindScaleCorrection("SHA_L"), 0.1);
  assert.equal(characterModelBindScaleCorrection("HOS_L"), 1);
  const characterConfig = await readFile(
    new URL("../play/config/characters.js", import.meta.url),
    "utf8",
  );
  assert.match(
    characterConfig,
    /modelScale: characterModelBindScaleCorrection\(definition\.modelCode\)/,
  );
});
