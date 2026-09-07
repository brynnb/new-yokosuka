import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMULATORJS_FILES,
  EMULATORJS_VERSION,
  emulatorJsCacheRoot,
} from "./emulatorjs-assets.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = emulatorJsCacheRoot(projectRoot);

function checksum(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function existingFileMatches(path, expected) {
  try {
    return checksum(await readFile(path)) === expected;
  } catch {
    return false;
  }
}

for (const file of EMULATORJS_FILES) {
  const outputPath = resolve(cacheRoot, file.sourcePath);
  if (await existingFileMatches(outputPath, file.sha256)) continue;
  const url = `https://cdn.emulatorjs.org/${EMULATORJS_VERSION}/${file.sourcePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const actualChecksum = checksum(data);
  if (actualChecksum !== file.sha256) {
    throw new Error(
      `Checksum mismatch for ${file.sourcePath}: expected ${file.sha256}, `
      + `received ${actualChecksum}`,
    );
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, data);
}
