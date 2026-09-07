import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  candidateKey,
  classifyCoverage,
} from "../tools/scripting/build_script_translation_coverage.mjs";

const coverage = JSON.parse(fs.readFileSync(
  "tools/evidence/script-translation-coverage.json",
  "utf8",
));

test("translation coverage accounts for the complete recovered dialogue corpus", () => {
  const summary = coverage.summary;
  assert.equal(summary.candidateCount, 1285);
  assert.equal(
    summary.translated
      + summary["specialized-activity-owned"]
      + summary["native-reference-only"]
      + summary.unresolved,
    summary.candidateCount,
  );
  assert.equal(summary.translated, 7);
  assert.equal(summary["specialized-activity-owned"], 1);
  assert.equal(summary.implementedCount, 8);
  assert.equal(coverage.mappings.length, 8);
});

test("coverage mappings are exact and require a valid published Yarn owner", () => {
  const candidate = {
    disc: 1,
    area: "D000",
    executableTargetIndex: 1,
    regionStartFileOffset: "0x100",
    unresolved: ["no-branch-exclusive-trigger-route"],
  };
	const ownership = {
		candidate,
		ownership: "translated",
		scriptSlug: "example",
		evidenceLocator: "exact-source#0x100",
		version: 2,
		contentFormat: "yarn",
		compileStatus: "valid",
		commandSchemaVersion: "test-v1",
	};
	const result = classifyCoverage([candidate], [ownership]);
  assert.equal(candidateKey(candidate), "1:D000:1:0x100");
  assert.equal(result.records[0].classification, "translated");
  assert.equal(result.records[0].mapping.publishedVersion, 2);
	assert.deepEqual(result.records[0].unresolved, []);
  assert.deepEqual(result.records[0].sourceUnresolved, ["no-branch-exclusive-trigger-route"]);
	assert.throws(
		() => classifyCoverage([candidate], [{ ...ownership, candidate: { ...candidate, executableTargetIndex: 2 } }]),
		/no recovered candidate/,
	);
	assert.throws(
		() => classifyCoverage([candidate], [{ ...ownership, compileStatus: "invalid" }]),
		/not valid published Yarn/,
	);
});

test("unmapped candidates remain reference-only or explicitly unresolved", () => {
  const complete = {
    disc: 1, area: "D000", executableTargetIndex: 1,
    regionStartFileOffset: "0x100", unresolved: ["no-branch-exclusive-trigger-route"],
  };
  const incomplete = {
    disc: 1, area: "D000", executableTargetIndex: 2,
    regionStartFileOffset: "0x200", unresolved: ["missing-subtitle-provenance"],
  };
	const result = classifyCoverage([complete, incomplete], []);
  assert.deepEqual(
    result.records.map(record => record.classification),
    ["native-reference-only", "unresolved"],
  );
});
