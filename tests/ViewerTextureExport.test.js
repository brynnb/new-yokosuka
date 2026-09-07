import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  exportViewerTextures,
  parseEmbeddedMt5Textures,
  parseTexturePack,
} from "../tools/assets/export_viewer_textures.mjs";

function pvr2x2Argb1555() {
  const pvr = Buffer.alloc(24);
  pvr.write("PVRT", 0, "ascii");
  pvr.writeUInt32LE(16, 4);
  pvr[8] = 0;
  pvr[9] = 9;
  pvr.writeUInt16LE(2, 12);
  pvr.writeUInt16LE(2, 14);
  pvr.writeUInt16LE(0xfc00, 16);
  pvr.writeUInt16LE(0x83e0, 18);
  pvr.writeUInt16LE(0x801f, 20);
  pvr.writeUInt16LE(0x0000, 22);
  return pvr;
}

function texturePack(id, pvr) {
  const pack = Buffer.alloc(12 + pvr.length);
  Buffer.from(id).copy(pack, 0, 0, 8);
  pack.writeUInt32LE(pvr.length, 8);
  pvr.copy(pack, 12);
  return pack;
}

test("texture image exporter retains source alpha and writes manifests and contact sheets", async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "viewer-texture-export-"));
  const inputDir = path.join(temporary, "models");
  const outputDir = path.join(temporary, "images");
  mkdirSync(inputDir);
  writeFileSync(
    path.join(inputDir, "S3_D000_textures_3.bin"),
    texturePack("SIGNTEST", pvr2x2Argb1555()),
  );

  const result = await exportViewerTextures({
    inputDir,
    outputDir,
    namespace: "S3",
    includeEmbedded: false,
    maxBytes: 10 * 1024 * 1024,
  });

  assert.equal(result.textureCount, 1);
  const manifest = JSON.parse(readFileSync(path.join(outputDir, "manifest.json")));
  assert.equal(manifest.sourceDirectory, "models");
  assert.equal(manifest.records[0].variant, "night");
  assert.equal(manifest.records[0].usesTransparency, true);
  assert.equal(manifest.records[0].lossless, true);
  assert.equal(manifest.records[0].imageFormat, "png");
  const exported = path.join(outputDir, manifest.records[0].file);
  const decoded = await sharp(exported).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.channels, 4);
  assert.deepEqual([...decoded.data.filter((_, index) => index % 4 === 3)], [255, 255, 255, 0]);
  assert.equal(readFileSync(path.join(outputDir, "manifest.csv"), "utf8").includes("SIGNTEST"), true);
  assert.equal(readFileSync(path.join(outputDir, "README.txt"), "utf8").includes("contact sheets"), true);
  assert.equal(readFileSync(path.join(path.dirname(exported), "contact-sheet-001.webp")).length < 10 * 1024 * 1024, true);
});

test("texture pack parser rejects truncated records", () => {
  assert.throws(() => parseTexturePack(Buffer.alloc(11)), /truncated/);
});

test("embedded MT5 parser ignores files without a TEXD section", () => {
  assert.deepEqual(parseEmbeddedMt5Textures(Buffer.from("not an MT5")), []);
});
