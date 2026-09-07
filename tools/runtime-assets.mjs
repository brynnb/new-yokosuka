import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "src/runtime-assets.generated.json");
const digest = data => createHash("sha256").update(data).digest("hex");

export function validateSourcePath(file) {
  if (!/^(play\/assets|public\/audio|public\/music)\//.test(file)
    || file.split("/").some(part => part === ".." || !part)
    || file.includes("\\")) throw new Error(`Invalid runtime asset path: ${file}`);
}

export function buildRuntimePlan(repositoryRoot = root, { sourcePrefix } = {}) {
  if (sourcePrefix) validateSourcePath(`${sourcePrefix}/asset`);
  const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "src/runtime-assets.generated.json")));
  return Object.entries(manifest.assets).filter(([file]) => !sourcePrefix || file.startsWith(`${sourcePrefix}/`)).map(([file, record]) => {
    validateSourcePath(file);
    const filePath = path.join(repositoryRoot, file);
    const bytes = fs.readFileSync(filePath);
    if (bytes.length !== record.size || digest(bytes) !== record.sha256) {
      throw new Error(`Runtime asset changed: ${file}; regenerate its manifest before publishing`);
    }
    const extension = path.extname(file).toLowerCase();
    const contentType = ({ ".json": "application/json", ".png": "image/png",
      ".wav": "audio/wav", ".webm": "audio/webm", ".ogg": "audio/ogg", ".mp3": "audio/mpeg" })[extension]
      || "application/octet-stream";
    return { game: "runtime", filePath, size: record.size, sha256: record.sha256,
      key: `shenmue/runtime/${record.sha256}/${file}`, kind: "asset", phase: "content",
      contentType, cacheControl: "public, max-age=31536000, immutable" };
  });
}

async function main() {
  const [command, ...files] = process.argv.slice(2);
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  if (command === "update") {
    // Updating is explicit: absent files are errors, never silently removed.
    const selected = files.length ? files : Object.keys(manifest.assets);
    for (const file of selected) {
      validateSourcePath(file);
      const bytes = fs.readFileSync(path.join(root, file));
      manifest.assets[file] = { sha256: digest(bytes), size: bytes.length };
    }
    manifest.assets = Object.fromEntries(Object.entries(manifest.assets).sort(([a], [b]) => a.localeCompare(b, "en")));
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Updated ${selected.length} runtime asset records`);
  } else if (command === "verify-local") {
    console.log(`Verified ${buildRuntimePlan().length} local runtime assets`);
  } else if (command === "restore") {
    const base = process.env.VITE_ASSET_URL || "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev";
    const entries = Object.entries(manifest.assets);
    let cursor = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < entries.length) {
        const [file, record] = entries[cursor++];
        validateSourcePath(file);
        const target = path.join(root, file);
        if (fs.existsSync(target)) {
          if (digest(fs.readFileSync(target)) !== record.sha256) throw new Error(`Refusing to overwrite modified local asset: ${file}`);
          continue;
        }
        let bytes;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(`${base}/shenmue/runtime/${record.sha256}/${file}`, { signal: AbortSignal.timeout(30_000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length !== record.size || digest(bytes) !== record.sha256) throw new Error("Checksum mismatch");
            break;
          } catch (error) {
            if (attempt === 2) throw new Error(`Restore failed for ${file}: ${error.message}`);
          }
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes, { flag: "wx" });
      }
    }));
    console.log(`Restored/verified ${entries.length} runtime assets`);
  } else throw new Error("Usage: node tools/runtime-assets.mjs <update [source-path ...]|verify-local|restore>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
