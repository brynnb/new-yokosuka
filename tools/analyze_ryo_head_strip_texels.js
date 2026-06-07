#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PNG } = require("../viewer-test/node_modules/pngjs");

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const args = parseArgs(process.argv.slice(2));
const dumpPath = path.resolve(repoRoot, args.dump || "viewer-test/output/ryo-head-atlas-strip-vertices.json");
const texturePath = path.resolve(repoRoot, args.texture || "viewer-test/output/s1-dsba-texture-6-js.png");
const mode = args.mode || "project-cw-hairline";
const limit = parseNumber(args.limit, 30);

const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
const texture = PNG.sync.read(fs.readFileSync(texturePath));

const rows = dump.rows
  .filter((row) => row.atlasRegion === "side" && Array.isArray(row.vertices) && row.vertices.length > 0)
  .map((row) => analyzeRow(row, texture, mode))
  .sort((a, b) => b.suspectScore - a.suspectScore);

const report = {
  dump: path.relative(repoRoot, dumpPath),
  texture: path.relative(repoRoot, texturePath),
  mode,
  stripCount: rows.length,
  topSuspects: rows.slice(0, limit),
  summary: {
    skinLikeUpperRows: rows.filter((row) => row.avgRenderY >= 0.54 && row.skinLikeRatio >= 0.5).length,
    darkUpperRows: rows.filter((row) => row.avgRenderY >= 0.54 && row.darkRatio >= 0.5).length,
  },
};

console.log(JSON.stringify(report, null, 2));

function analyzeRow(row, texture, mode) {
  const samples = [];
  for (const vertex of row.vertices) {
    const uv = mapCurrentRyoHeadUv(vertex, row, mode);
    if (!uv) continue;
    const pixel = sampleNearest(texture, uv[0], uv[1]);
    samples.push({ uv, pixel });
  }

  const avg = samples.reduce((acc, sample) => {
    acc.r += sample.pixel[0];
    acc.g += sample.pixel[1];
    acc.b += sample.pixel[2];
    acc.a += sample.pixel[3];
    return acc;
  }, { r: 0, g: 0, b: 0, a: 0 });

  const count = Math.max(1, samples.length);
  avg.r /= count;
  avg.g /= count;
  avg.b /= count;
  avg.a /= count;

  const skinLikeCount = samples.filter((sample) => isSkinLike(sample.pixel)).length;
  const darkCount = samples.filter((sample) => isDark(sample.pixel)).length;
  const avgRenderY = row.renderPos?.avg?.[1] ?? 0;
  const topWeight = Math.max(0, Math.min(1, (avgRenderY - 0.50) / 0.16));
  const skinLikeRatio = samples.length ? skinLikeCount / samples.length : 0;
  const darkRatio = samples.length ? darkCount / samples.length : 0;
  const suspectScore = topWeight * skinLikeRatio * Math.max(0.25, 1.0 - darkRatio);

  return {
    filter: stripFilter(row),
    nodeOffsetHex: `0x${row.nodeOffset.toString(16)}`,
    entryOffsetHex: `0x${row.entryOffset.toString(16)}`,
    stripIndex: row.stripIndex,
    stripLength: row.stripLength,
    avgRenderY,
    avgSource: row.sourcePos?.avg,
    avgRawUv: row.uv ? [row.uv.avgU, row.uv.avgV] : null,
    avgColor: [avg.r, avg.g, avg.b, avg.a],
    skinLikeRatio,
    darkRatio,
    suspectScore,
    sampledUvs: samples.map((sample) => sample.uv),
  };
}

function mapCurrentRyoHeadUv(vertex, row, mode) {
  if (!vertex?.uv) return null;
  const sourceU = vertex.uv[0];
  const sourceV = vertex.uv[1];
  const sourceY = vertex.sourcePos?.[1] || 0;

  if (row.atlasRegion === "face") {
    return vertex.finalProjectCwAtlasUv || null;
  }

  if (mode === "project-cw-hairline" && isRyoFrontScalpSidePoint(vertex)) {
    let texU = sourceU * 0.5;
    if (sourceY < 0) texU = 0.5 - texU;
    return [texU, 1.0 - sourceV];
  }

  let texU = sourceV * 0.5;
  if (sourceY < 0) texU = 0.5 - texU;
  return [texU, sourceU];
}

function isRyoFrontScalpSidePoint(vertex) {
  const sourcePos = vertex.sourcePos || [];
  const renderPos = vertex.renderPos || [];
  return (
    sourcePos[0] >= 0.035 &&
    (renderPos[1] || 0) >= 0.54 &&
    Math.abs(sourcePos[1] || 0) <= 0.105
  );
}

function sampleNearest(texture, u, v) {
  const x = Math.max(0, Math.min(texture.width - 1, Math.round(u * (texture.width - 1))));
  const y = Math.max(0, Math.min(texture.height - 1, Math.round(v * (texture.height - 1))));
  const offset = (y * texture.width + x) * 4;
  return [
    texture.data[offset],
    texture.data[offset + 1],
    texture.data[offset + 2],
    texture.data[offset + 3],
  ];
}

function isSkinLike(pixel) {
  const [r, g, b, a] = pixel;
  return a > 0 && r >= 110 && g >= 65 && b <= 90 && r > b * 1.5;
}

function isDark(pixel) {
  const [r, g, b, a] = pixel;
  return a > 0 && r < 70 && g < 70 && b < 70;
}

function stripFilter(row) {
  return `0x${row.nodeOffset.toString(16)}:0x${row.entryOffset.toString(16)}:${row.stripIndex}`;
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i++) {
    const arg = values[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = values[i + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      i++;
    } else {
      parsed[key] = "true";
    }
  }
  return parsed;
}

function parseNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
