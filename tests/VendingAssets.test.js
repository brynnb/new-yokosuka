import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { externalTextureKeysFromMt5 } from "../src/assetLoader.js";
import { MotnLoader } from "../src/MotnLoader.js";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { arrangeVendingMachineDisplay } from "../src/VendingMachineDisplay.js";

const manifest = JSON.parse(
  fs.readFileSync("play/assets/vending/manifest.json", "utf8"),
);

function bytes(path) {
  const value = fs.readFileSync(path);
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  );
}

function sha256(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

test("bundled vending cans retain their source models and complete textures", () => {
  assert.deepEqual(
    manifest.assets.map(({ resourceCode }) => resourceCode),
    ["COKE", "FATO", "FATG", "SPRT", "CAFE", "ATRK"],
  );
  for (const asset of manifest.assets) {
    assert.equal(sha256(asset.model), asset.modelSha256, asset.resourceCode);
    const model = bytes(asset.model);
    const textures = bytes(asset.texturePack);
    const requested = externalTextureKeysFromMt5(model);
    const available = Mt5Loader.buildTexturePackIndex(textures);
    assert.equal(available.size, asset.textureCount, asset.resourceCode);
    assert.deepEqual(
      [...requested].filter((key) => !available.has(key)),
      [],
      `${asset.resourceCode} has missing textures`,
    );
  }
});

test("asset viewer vending machine retains its complete original display", () => {
  const machine = manifest.highDetailMachine;
  assert.equal(sha256(machine.path), machine.sha256);

  const requested = externalTextureKeysFromMt5(bytes(machine.path));
  const available = Mt5Loader.buildTexturePackIndex(bytes(machine.texturePack));
  assert.equal(available.size, machine.textureCount);
  assert.deepEqual(
    [...requested].filter((key) => !available.has(key)),
    [],
    "high-detail vending machine has missing textures",
  );

  const models = JSON.parse(fs.readFileSync("public/models.json", "utf8"));
  const texturePacks = JSON.parse(
    fs.readFileSync("public/texture-packs.json", "utf8"),
  ).texturePacks;
  assert.equal(models.includes("G_VENDING_JIHS5KNG.MT5"), true);
  assert.equal(texturePacks.includes("G_VENDING_textures.bin"), true);
});

test("asset viewer arranges all eight native cans on the display backing", () => {
  const parents = Array.from({ length: 8 }, (_, index) => ({
    name: `node_${(0x2e80 + index * 0x40).toString(16)}`,
    position: {
      set(x, y, z) {
        this.value = [x, y, z];
      },
    },
    getChildren() {
      return [{
        name: `mt5_tex_${Math.min(6, index + 2)}`,
        getTotalVertices: () => 14,
      }];
    },
  }));
  const roots = [{
    getDescendants: () => parents,
  }];

  assert.equal(
    arrangeVendingMachineDisplay("G_VENDING_JIHS5KNG.MT5", roots),
    8,
  );
  assert.deepEqual(
    parents.map((parent) => parent.position.value),
    [
      [-0.18, 1.46, 0.302],
      [-0.06, 1.46, 0.302],
      [0.06, 1.46, 0.302],
      [0.18, 1.46, 0.302],
      [-0.18, 1.22, 0.302],
      [-0.06, 1.22, 0.302],
      [0.06, 1.22, 0.302],
      [0.18, 1.22, 0.302],
    ],
  );
});

test("bundled vending motion contains every production drinking phase", () => {
  assert.equal(sha256(manifest.motion.path), manifest.motion.sha256);
  assert.equal(
    fs.statSync(manifest.motion.path).size,
    manifest.motion.byteLength,
  );
  const motion = MotnLoader.parse(bytes(manifest.motion.path));
  for (const name of [
    "AKI_IRERU_COIN",
    "AKI_TORU_JUICE",
    "AKI_NOMU_JUICE",
    "AKI_NOMU_JUICE_250",
  ]) {
    assert.equal(motion.getSequence(name)?.valid, true, name);
  }
});
