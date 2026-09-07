import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repository = path.resolve(new URL("..", import.meta.url).pathname);

test("failed S2 corpus refresh leaves every published artifact unchanged", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ny-s2-refresh-test-"));
  try {
    const captures = path.join(root, "captures");
    const bindings = path.join(root, "bindings");
    const fixtures = path.join(root, "fixtures", "shenmue2-animation");
    const characters = path.join(root, "characters");
    const coverage = path.join(root, "evidence", "coverage.json");
    const family = path.join(root, "evidence", "family.json");
    const report = path.join(root, "refresh.json");
    for (const directory of [captures, bindings, fixtures, characters]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    const fixtureBytes = "{\"sentinel\":\"fixture\"}\n";
    const coverageBytes = "{\"sentinel\":\"coverage\"}\n";
    const familyBytes = "{\"sentinel\":\"family\"}\n";
    fs.writeFileSync(path.join(fixtures, "sentinel.json"), fixtureBytes);
    fs.mkdirSync(path.dirname(coverage), { recursive: true });
    fs.writeFileSync(coverage, coverageBytes);
    fs.writeFileSync(family, familyBytes);

    const result = childProcess.spawnSync(process.execPath, [
      "tools/animation/refresh_shenmue2_animation_corpus.mjs",
      "--captures-dir", captures,
      "--bindings-dir", bindings,
      "--fixtures-dir", fixtures,
      "--characters-dir", characters,
      "--coverage", coverage,
      "--family-conformance", family,
      "--humans-idx", path.join(root, "missing.idx"),
      "--humans-afs", path.join(root, "missing.afs"),
      "--report", report,
    ], { cwd: repository, encoding: "utf8" });

    assert.notEqual(result.status, 0);
    assert.equal(
      fs.readFileSync(path.join(fixtures, "sentinel.json"), "utf8"),
      fixtureBytes,
    );
    assert.equal(fs.readFileSync(coverage, "utf8"), coverageBytes);
    assert.equal(fs.readFileSync(family, "utf8"), familyBytes);
    assert.deepEqual(
      fs.readdirSync(path.dirname(fixtures)).filter(
        (name) => name.startsWith(".shenmue2-animation-refresh-"),
      ),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
