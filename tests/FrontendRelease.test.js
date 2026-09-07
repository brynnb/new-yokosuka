import assert from "node:assert/strict";
import {
  mkdirSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseScript = join(repositoryRoot, "deploy/frontend-release.sh");
const deployWorkflow = readFileSync(join(
  repositoryRoot,
  ".github/workflows/deploy.yml",
), "utf8");

test("deployment verifies Vite's exact content-hashed play entry", () => {
  assert.match(
    deployWorkflow,
    /grep -oE '\/assets\/\[A-Za-z0-9_-\]\+\\\.js' dist\/play\/index\.html/,
  );
  assert.match(
    deployWorkflow,
    /grep -qF "\$ASSET_PATH" \/tmp\/new-yokosuka-play-document/,
  );
  assert.doesNotMatch(deployWorkflow, /\/assets\/play-/);
});

test("frontend releases stage, switch, roll back, and retain three builds", () => {
  const testRoot = mkdtempSync(join(tmpdir(), "new-yokosuka-release-"));
  const appDirectory = join(testRoot, "app");
  const assetsDirectory = join(appDirectory, "assets");
  const originalFrontend = join(appDirectory, "dist");

  try {
    mkdirSync(assetsDirectory, { recursive: true });
    mkdirSync(originalFrontend, { recursive: true });
    writeFileSync(join(assetsDirectory, "MOTION.BIN"), "motion");
    writeFileSync(join(assetsDirectory, "M_FGT1.BIN"), "fight motion");
    writeFileSync(join(originalFrontend, "index.html"), "legacy frontend");

    const archive = execFileSync("tar", ["czf", "-", "package.json"], {
      cwd: repositoryRoot,
    });
    const run = (operation, releaseId, ...extraArguments) => {
      const result = spawnSync(
        releaseScript,
        [operation, appDirectory, releaseId, ...extraArguments],
        {
          input: operation === "stage" ? archive : undefined,
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stderr);
    };

    run("stage", "one");
    run("activate", "one");
    assert.equal(
      realpathSync(join(appDirectory, "dist")),
      join(appDirectory, "releases/one"),
    );
    run("rollback", "one");
    assert.equal(
      realpathSync(join(appDirectory, "dist")),
      join(appDirectory, "releases/legacy-before-one"),
    );

    for (const releaseId of ["one", "two", "three", "four"]) {
      run("stage", releaseId);
      run("activate", releaseId);
    }
    run("prune", "four", "3");

    assert.equal(
      realpathSync(join(appDirectory, "dist")),
      join(appDirectory, "releases/four"),
    );
    assert.equal(
      readdirSync(join(appDirectory, "releases"), {
        withFileTypes: true,
      }).filter((entry) => entry.isDirectory()).length,
      3,
    );
    assert.equal(
      readFileSync(join(appDirectory, "dist/motion/MOTION.BIN"), "utf8"),
      "motion",
    );
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});

test("open clients retain two previous builds' assets without unbounded accumulation", () => {
  const root = mkdtempSync(join(tmpdir(), "new-yokosuka-stale-client-"));
  const app = join(root, "app");
  const source = join(root, "source");
  try {
    mkdirSync(join(app, "assets"), { recursive: true });
    mkdirSync(join(source, "assets"), { recursive: true });
    mkdirSync(join(source, "audio"), { recursive: true });
    writeFileSync(join(app, "assets/MOTION.BIN"), "motion");
    writeFileSync(join(app, "assets/M_FGT1.BIN"), "fight");
    const run = (operation, id, input) => {
      const result = spawnSync(releaseScript, [operation, app, id, "3"], { input, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    };
    for (const id of ["one", "two", "three", "four"]) {
      for (const filename of readdirSync(join(source, "audio"))) rmSync(join(source, "audio", filename));
      // Builds one and two still use same-origin audio; later releases use R2.
      if (["one", "two"].includes(id)) writeFileSync(join(source, "audio", `${id}.ogg`), id);
      for (const filename of readdirSync(join(source, "assets"))) rmSync(join(source, "assets", filename));
      writeFileSync(join(source, "assets", `${id}-12345678.js`), `export default '${id}';`);
      writeFileSync(join(source, "index.html"), id);
      const archive = execFileSync("tar", ["czf", "-", "."], { cwd: source });
      run("stage", id, archive);
      run("activate", id);
      run("prune", id);
    }
    const liveAssets = join(app, "dist/assets");
    assert.deepEqual(readdirSync(liveAssets).sort(), ["four-12345678.js", "three-12345678.js", "two-12345678.js"]);
    assert.equal(existsSync(join(app, "releases/one")), false);
    assert.equal(readFileSync(join(app, "dist/audio/two.ogg"), "utf8"), "two");
    assert.equal(existsSync(join(app, "dist/audio/one.ogg")), false);
    assert.equal(statSync(join(liveAssets, "two-12345678.js")).ino,
      statSync(join(app, "releases/two/assets/two-12345678.js")).ino);
    assert.equal(readFileSync(join(liveAssets, "two-12345678.js"), "utf8"), "export default 'two';");
    run("rollback", "four");
    assert.equal(readFileSync(join(app, "dist/assets/one-12345678.js"), "utf8"), "export default 'one';");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
