import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EMULATORJS_FILES,
  emulatorJsCacheRoot,
} from "../scripts/emulatorjs-assets.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("arcade runtime uses only checksum-pinned EmulatorJS assets", () => {
  const packageJson = JSON.parse(readFileSync(
    resolve(projectRoot, "package.json"),
    "utf8",
  ));
  const dependencyNames = Object.keys(packageJson.dependencies || {});
  assert.deepEqual(
    dependencyNames.filter((name) => name.startsWith("@emulatorjs/")),
    [],
  );

  const sourcePaths = EMULATORJS_FILES.map(({ sourcePath }) => sourcePath);
  assert(sourcePaths.some((path) => path.includes("fbneo")));
  assert(sourcePaths.some((path) => path.includes("mame2003_plus")));
  assert.equal(
    sourcePaths.some((path) => (
      path.includes("cores/")
      && !path.includes("fbneo")
      && !path.includes("mame2003_plus")
    )),
    false,
  );

  const cacheRoot = emulatorJsCacheRoot(projectRoot);
  for (const file of EMULATORJS_FILES) {
    const sourcePath = resolve(cacheRoot, file.sourcePath);
    assert(existsSync(sourcePath), `missing ${file.sourcePath}`);
    const checksum = createHash("sha256")
      .update(readFileSync(sourcePath))
      .digest("hex");
    assert.equal(checksum, file.sha256, file.sourcePath);
  }
});
