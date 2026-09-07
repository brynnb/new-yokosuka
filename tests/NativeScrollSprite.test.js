import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseNativeScrollSprite } from "../src/NativeScrollSprite.js";

test("OP02 SCR1 is the exact native slot-one single-texture resource", () => {
  const bytes = readFileSync("play/assets/introduction/op02/SCROLL53.SCR1");
  const parsed = parseNativeScrollSprite(bytes, { sourceName: "SCROLL53.SCR1" });

  assert.equal(parsed.slotIndex, 1);
  assert.equal(parsed.containerKind, "TEXN");
  assert.equal(parsed.width, 512);
  assert.equal(parsed.height, 256);
  assert.deepEqual(parsed.tiles.map(tile => ({
    tileIndex: tile.tileIndex,
    name: tile.name,
    width: tile.width,
    height: tile.height,
    colorFormat: tile.colorFormat,
    dataFormat: tile.dataFormat,
  })), [{
    tileIndex: 0,
    name: "air53",
    width: 512,
    height: 256,
    colorFormat: 1,
    dataFormat: 0x0d,
  }]);
});

test("OP02 SCR0 joins its SCL0 and SCL1 vertical texture tiles", () => {
  const bytes = readFileSync("play/assets/introduction/op02/SCROLL67.SCR0");
  const parsed = parseNativeScrollSprite(bytes, { sourceName: "SCROLL67.SCR0" });

  assert.equal(parsed.slotIndex, 0);
  assert.equal(parsed.containerKind, "SCRL");
  assert.equal(parsed.width, 512);
  assert.equal(parsed.height, 320);
  assert.deepEqual(parsed.tiles.map(tile => ({
    tileIndex: tile.tileIndex,
    name: tile.name,
    width: tile.width,
    height: tile.height,
  })), [
    { tileIndex: 0, name: "air67", width: 512, height: 256 },
    { tileIndex: 1, name: "air67b", width: 512, height: 64 },
  ]);
});

test("scroll resource slot identity comes from the native SCR extension", () => {
  const bytes = readFileSync("play/assets/introduction/op02/SCROLL53.SCR1");
  assert.throws(
    () => parseNativeScrollSprite(bytes, { sourceName: "SCROLL53.SPR" }),
    /must end in SCR0, SCR1, or SCR2/,
  );
});

test("script allocation supplies the native slot for bare SPR resources", () => {
  const bytes = readFileSync("play/assets/hazuki/hihy/SCROLL25.SPR");
  const parsed = parseNativeScrollSprite(bytes, {
    sourceName: "SCROLL25.SPR",
    nativeSlot: 0,
  });
  assert.equal(parsed.slotIndex, 0);
  assert.equal(parsed.containerKind, "TEXN");
  assert.equal(parsed.width, 512);
  assert.equal(parsed.height, 256);
});

test("OP02 generated artifacts retain native slot and tiled-image provenance", () => {
  const sourceGraph = JSON.parse(readFileSync(
    "play/assets/introduction/op02/cutscene-source-graph.generated.json",
    "utf8",
  ));
  const manifest = JSON.parse(readFileSync(
    "play/assets/introduction/op02/manifest.json",
    "utf8",
  ));
  assert.deepEqual(sourceGraph.resources
    .filter(resource => resource.kind === "scroll-sprite")
    .map(resource => ({
      name: resource.source.archiveMember,
      lifecycle: resource.lifecycle,
      slot: resource.nativeSlot,
      dimensions: resource.logicalDimensions,
      textureNames: resource.tiles.map(tile => tile.textureName),
    })), [
    {
      name: "SCROLL53.SCR1",
      lifecycle: "activity-local",
      slot: 1,
      dimensions: [512, 256],
      textureNames: ["air53"],
    },
    {
      name: "SCROLL67.SCR0",
      lifecycle: "area-resident",
      slot: 0,
      dimensions: [512, 320],
      textureNames: ["air67", "air67b"],
    },
  ]);
  assert.deepEqual(manifest.scrollSprites, [
    {
      path: "play/assets/introduction/op02/SCROLL53.SCR1",
      imagePath: "play/assets/introduction/op02/SCROLL53.png",
      nativeSlot: 1,
      width: 512,
      height: 256,
      horizontalWrap: "mirror",
      textureOffsetY: -0.2,
      textureNames: ["air53"],
    },
    {
      path: "play/assets/introduction/op02/SCROLL67.SCR0",
      imagePath: "play/assets/introduction/op02/SCROLL67.png",
      nativeSlot: 0,
      width: 512,
      height: 320,
      horizontalWrap: "mirror",
      textureOffsetY: -0.2,
      textureNames: ["air67", "air67b"],
    },
  ]);
});
