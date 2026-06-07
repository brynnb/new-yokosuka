import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(__dirname, "output");
const stripDumpPath = path.join(outputDir, "ryo-head-atlas-strip-vertices.json");

const args = parseArgs(process.argv.slice(2));
const count = parseNumber(args.count, 12);
const cellWidth = parseNumber(args.width, 360);
const cellHeight = parseNumber(args.height, 360);
const cameraAlphas = parseNumberList(args["camera-alphas"] || args.alpha || "0,205");
const cameraBeta = String(parseNumber(args.beta, 72));
const region = args.region || "side";
const outPath = path.resolve(repoRoot, args.out || "viewer-test/output/ryo-head-side-strip-candidates.png");
const metaPath = outPath.replace(/\.png$/i, ".json");
const tempDir = path.join(outputDir, ".strip-sheet");

if (!fs.existsSync(stripDumpPath)) {
  execFileSync(process.execPath, [
    path.join(repoRoot, "tools/dump_mt5_atlas.js"),
    path.join(repoRoot, "public/models/S2_YDB1_YKC_M.MT5"),
    "--json",
    "--vertices",
  ], {
    cwd: repoRoot,
    stdio: ["ignore", fs.openSync(stripDumpPath, "w"), "inherit"],
  });
}

const dump = JSON.parse(fs.readFileSync(stripDumpPath, "utf8"));
const candidates = dump.rows
  .filter((row) => !region || row.atlasRegion === region)
  .sort(compareCandidateRows)
  .slice(0, count);

fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const columns = cameraAlphas.length;
const rows = candidates.length;
const sheet = new PNG({ width: columns * cellWidth, height: rows * cellHeight });
sheet.data.fill(198);

const cells = [];
for (let rowIndex = 0; rowIndex < candidates.length; rowIndex++) {
  const candidate = candidates[rowIndex];
  const filter = stripFilter(candidate);

  for (let columnIndex = 0; columnIndex < cameraAlphas.length; columnIndex++) {
    const alpha = cameraAlphas[columnIndex];
    const imagePath = path.join(tempDir, `strip-${rowIndex}-a${alpha}.png`);
    execFileSync(process.execPath, [path.join(__dirname, "render-ryu.mjs")], {
      cwd: repoRoot,
      env: {
        ...process.env,
        RYU_RENDER_FOCUS: "head-atlas",
        RYU_ONLY_HEAD_ATLAS_STRIPS: filter,
        RYU_CAMERA_ALPHA: String(alpha),
        RYU_CAMERA_BETA: cameraBeta,
        RYU_SHOT_WIDTH: String(cellWidth),
        RYU_SHOT_HEIGHT: String(cellHeight),
        RYU_SHOT_OUT: path.relative(repoRoot, imagePath),
      },
      stdio: "ignore",
    });

    const cell = PNG.sync.read(fs.readFileSync(imagePath));
    blit(cell, sheet, columnIndex * cellWidth, rowIndex * cellHeight);
    cells.push({
      row: rowIndex,
      column: columnIndex,
      cameraAlpha: alpha,
      filter,
      nodeOffset: candidate.nodeOffset,
      nodeOffsetHex: `0x${candidate.nodeOffset.toString(16)}`,
      entryOffset: candidate.entryOffset,
      entryOffsetHex: `0x${candidate.entryOffset.toString(16)}`,
      stripIndex: candidate.stripIndex,
      stripLength: candidate.stripLength,
      atlasRegion: candidate.atlasRegion,
      renderAvg: candidate.renderPos?.avg,
      sourceAvg: candidate.sourcePos?.avg,
      rawUv: candidate.uv,
      finalProjectCwAtlasUv: candidate.finalProjectCwAtlasUv,
    });
  }
}

fs.writeFileSync(outPath, PNG.sync.write(sheet));
fs.writeFileSync(metaPath, JSON.stringify({
  stripDump: path.relative(repoRoot, stripDumpPath),
  output: path.relative(repoRoot, outPath),
  region,
  count: candidates.length,
  cellWidth,
  cellHeight,
  cameraAlphas,
  cells,
}, null, 2));

console.log(JSON.stringify({
  output: path.relative(repoRoot, outPath),
  metadata: path.relative(repoRoot, metaPath),
  count: candidates.length,
  cameraAlphas,
}, null, 2));

function compareCandidateRows(a, b) {
  const ay = a.renderPos?.avg?.[1] ?? 0;
  const by = b.renderPos?.avg?.[1] ?? 0;
  if (by !== ay) return by - ay;

  const ax = Math.abs(a.renderPos?.avg?.[0] ?? 0);
  const bx = Math.abs(b.renderPos?.avg?.[0] ?? 0);
  if (bx !== ax) return bx - ax;

  return (b.stripLength || 0) - (a.stripLength || 0);
}

function stripFilter(row) {
  return `0x${row.nodeOffset.toString(16)}:0x${row.entryOffset.toString(16)}:${row.stripIndex}`;
}

function blit(source, target, targetX, targetY) {
  const copyWidth = Math.min(source.width, target.width - targetX);
  const copyHeight = Math.min(source.height, target.height - targetY);
  for (let y = 0; y < copyHeight; y++) {
    const sourceStart = y * source.width * 4;
    const targetStart = ((targetY + y) * target.width + targetX) * 4;
    source.data.copy(target.data, targetStart, sourceStart, sourceStart + copyWidth * 4);
  }
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

function parseNumberList(value) {
  return String(value)
    .split(",")
    .map((part) => Number.parseFloat(part.trim()))
    .filter(Number.isFinite);
}
