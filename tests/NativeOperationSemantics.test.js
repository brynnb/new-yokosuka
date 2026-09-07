import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const semantics = JSON.parse(fs.readFileSync(
  "tools/evidence/native-operation-semantics.json",
  "utf8",
));

function operation(operationHex) {
  return semantics.operations.find(
    candidate => candidate.operationHex === operationHex,
  );
}

function operations(operationHex) {
  return semantics.operations.filter(
    candidate => candidate.operationHex === operationHex,
  );
}

test("persistent yen operations are constrained to selector 2", () => {
  for (const operationHex of ["0x005f", "0x0060"]) {
    const entry = operation(operationHex);
    assert.ok(entry);
    assert.deepEqual(entry.argumentConstraints, [{
      index: 0,
      values: [2],
    }]);
    assert.match(entry.semanticId, /^persistent-yen-/);
    assert.ok(entry.sources.length >= 3);
  }
});

test("operation 0x0000 retains exact variadic shapes and static pointers", () => {
  const entry = operation("0x0000");
  assert.equal(entry.semanticId, "native-debug-format");
  assert.deepEqual(entry.argumentCounts, [1, 2, 3, 4, 5, 17]);
  assert.deepEqual(entry.argumentConstraints, [{
    index: 0,
    kinds: ["static-pointer"],
  }]);
  assert.match(entry.provenBehavior, /mandatory adapter/);
});

test("operation 0x000a retains its exact inclusive XZ bounds query", () => {
  const entry = operation("0x000a");
  assert.equal(entry.semanticId, "resolved-object-xz-bounds-query");
  assert.equal(entry.argumentCount, 4);
  assert.equal(entry.handlerAddress, "0x0c155878");
  assert.match(entry.provenBehavior, /inclusive rectangle/);
  assert.match(entry.provenBehavior, /zero vector/);
});

test("operation 0x000b retains its exact distance-and-angle predicate", () => {
  const entry = operation("0x000b");
  assert.equal(entry.semanticId, "native-vector-distance-angle-query");
  assert.equal(entry.argumentCount, 5);
  assert.equal(entry.handlerAddress, "0x0c155958");
  assert.equal(entry.staticPointerWordCount, 3);
  assert.match(entry.provenBehavior, /greater than/);
  assert.match(entry.provenBehavior, /strictly less than/);
  assert.match(entry.provenBehavior, /wrapped difference/);
});

test("operation 0x0110 retains its exact FIGP byte-pair write", () => {
  const entry = operation("0x0110");
  assert.equal(entry.semanticId, "resolved-object-figp-byte-pair-write");
  assert.equal(entry.argumentCount, 3);
  assert.equal(entry.handlerAddress, "0x0c09c2c4");
  assert.deepEqual(entry.argumentConstraints, [
    { index: 0, kinds: ["constant", "frame-field", "scene-field"] },
    { index: 1, kinds: ["constant", "frame-field"] },
    { index: 2, kinds: ["constant", "frame-field"] },
  ]);
  assert.match(entry.provenBehavior, /FIGP/);
  assert.match(entry.provenBehavior, /\+0x11 and \+0x12/);
  assert.match(entry.provenBehavior, /native no-op/);
});

test("operation 0x00c8 retains its exact FIGP byte +0x10 write", () => {
  const entry = operation("0x00c8");
  assert.equal(entry.semanticId, "actor-figp-byte-10-write");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c09c2ac");
  assert.match(entry.provenBehavior, /low eight bits/);
  assert.match(entry.provenBehavior, /missing FIGP records/i);
});

test("operation 0x014b retains its exact two-byte global control", () => {
  const entry = operation("0x014b");
  assert.equal(entry.semanticId, "native-operation-014b-mode-byte-control");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c16360a");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 0,
    values: [1, 2, 6, 7, 8],
  }]);
  assert.match(entry.provenBehavior, /unless the current byte is four/);
  assert.match(entry.provenBehavior, /0x0c224dd3/);
});

test("operation 0x0043 retains its exact low-level link-field rewrite", () => {
  const entry = operation("0x0043");
  assert.equal(entry.semanticId, "resolved-object-link-field-zero-write");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c157c88");
  assert.match(entry.provenBehavior, /indexed slot/);
  assert.match(entry.provenBehavior, /mandatory low-level adapters/);
  assert.match(entry.provenBehavior, /no parent, attachment, or targeting/);
});

test("operation 0x00f7 retains its exact dword-5c bit-6 control", () => {
  const entry = operation("0x00f7");
  assert.equal(entry.semanticId, "resolved-object-dword-5c-bit-6-control");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c15836a");
  assert.match(entry.provenBehavior, /old state/);
  assert.match(entry.provenBehavior, /0x00000040/);
  assert.match(entry.provenBehavior, /meaning remain unknown/);
});

test("operation 0x017a retains only its exact three native routes", () => {
  const entry = operation("0x017a");
  assert.equal(entry.semanticId, "native-operation-017a-control");
  assert.equal(entry.argumentCount, 3);
  assert.equal(entry.handlerAddress, "0x0c1636f6");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 0,
    values: [0, 1, 2],
  }]);
  assert.match(entry.provenBehavior, /mandatory adapter/);
});

test("operations 0x0175/76/78/79 retain exact controller route shapes", () => {
  const shapes = operationHex => operations(operationHex).map(entry => ({
    argumentCount: entry.argumentCount,
    modes: entry.argumentConstraints[0].values,
  }));
  assert.deepEqual(shapes("0x0175"), [
    { argumentCount: 1, modes: [1, 2, 27] },
    { argumentCount: 2, modes: [15, 21, 23, 24, 25] },
  ]);
  assert.deepEqual(shapes("0x0176"), [
    { argumentCount: 2, modes: [1] },
  ]);
  assert.deepEqual(shapes("0x0178"), [
    { argumentCount: 1, modes: [10] },
    { argumentCount: 2, modes: [1, 7, 13, 14] },
    { argumentCount: 7, modes: [6] },
  ]);
  assert.deepEqual(shapes("0x0179"), [
    { argumentCount: 1, modes: [3, 12] },
    { argumentCount: 2, modes: [2, 4, 7, 11, 13, 16, 18] },
    { argumentCount: 3, modes: [14] },
    { argumentCount: 2, modes: [41] },
    { argumentCount: 3, modes: [39, 44] },
    { argumentCount: 3, modes: [42, 47] },
    { argumentCount: 7, modes: [36, 37] },
    { argumentCount: 11, modes: [38] },
  ]);
});

test("operation 0x0174 retains only its exact authored dword writes", () => {
  const entry = operation("0x0174");
  assert.equal(
    entry.semanticId,
    "native-operation-0174-global-dword-write",
  );
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c1724bc");
  assert.deepEqual(entry.argumentConstraints, [
    { index: 0, values: [1] },
    { index: 1, values: [0, 1] },
  ]);
  assert.match(entry.provenBehavior, /0x0c2262a8/);
});

test("operation 0x017e retains its exact XMPT selector-five query", () => {
  const entry = operation("0x017e");
  assert.equal(entry.semanticId, "actor-xmpt-selector-five-active-query");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c166c8e");
  assert.match(entry.provenBehavior, /XMPT \+0x18 is nonzero/);
  assert.match(entry.provenBehavior, /\+0x1c equals five/);
});

test("operation 0x017d retains its fixed selector-five request contract", () => {
  const entry = operation("0x017d");
  assert.equal(entry.semanticId, "actor-xmpt-selector-five-request");
  assert.equal(entry.argumentCount, 4);
  assert.equal(entry.handlerAddress, "0x0c166c2e");
  assert.match(entry.provenBehavior, /fixed -1 route scalar/);
  assert.match(entry.provenBehavior, /null supplemental record/);
  assert.match(entry.provenBehavior, /fixed selector five/);
});

test("operation 0x0165 separates its null supplement from fixed selector zero", () => {
  const entry = operation("0x0165");
  assert.equal(entry.semanticId, "actor-xmpt-request");
  assert.deepEqual(entry.argumentConstraints, [{ index: 4, values: [0] }]);
  assert.match(entry.provenBehavior, /optional 24-byte supplemental record/);
  assert.match(entry.provenBehavior, /fixed selector zero/);
});

test("operation 0x0163 retains its exact OP00 procedural-model routes", () => {
  const entries = operations("0x0163");
  assert.equal(entries.length, 8);
  assert.ok(entries.every(entry => (
    entry.semanticId === "native-procedural-model-controller"
    && entry.handlerAddress === "0x0c160368"
  )));
  assert.deepEqual(entries.map(entry => ({
    argumentCount: entry.argumentCount,
    modes: entry.argumentConstraints[0].values,
  })), [
    { argumentCount: 8, modes: [0] },
    { argumentCount: 2, modes: [1, 2, 3] },
    { argumentCount: 8, modes: [10] },
    { argumentCount: 5, modes: [11] },
    { argumentCount: 4, modes: [13, 14, 16, 21] },
    { argumentCount: 4, modes: [17] },
    { argumentCount: 3, modes: [18] },
    { argumentCount: 6, modes: [24] },
  ]);
  assert.equal(entries[0].staticPointerWordCount, 3);
  assert.equal(entries[6].staticPointerWordCount, 3);
  assert.match(entries[6].provenBehavior, /truncates.*toward zero/);
});

test("operation 0x01bd retains its exact consume-on-read boundary", () => {
  const entry = operation("0x01bd");
  assert.equal(
    entry.semanticId,
    "native-operation-01bd-global-dword-consume",
  );
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c162cb2");
  assert.equal(entry.argumentConstraints, undefined);
  assert.match(entry.provenBehavior, /ignores both authored operands/i);
  assert.match(entry.provenBehavior, /0x0c2242c8/);
  assert.match(entry.provenBehavior, /producer remains required/);
});

test("operations 0x01a0 and 0x01b8 retain exact native ownership", () => {
  const refb = operation("0x01a0");
  assert.equal(refb.semanticId, "resolved-object-refb-control-install");
  assert.equal(refb.argumentCount, 3);
  assert.equal(refb.handlerAddress, "0x0c1600ec");
  assert.deepEqual(refb.argumentConstraints, [
    { index: 0, kinds: ["frame-field"] },
    { index: 1, values: [0, 2, 3, 5] },
    { index: 2, values: [0] },
  ]);

  const slots = operations("0x01b8");
  assert.deepEqual(slots.map(entry => ({
    mode: entry.argumentConstraints[0].values,
    valueKinds: entry.argumentConstraints[1].kinds,
  })), [
    { mode: [1], valueKinds: ["constant", "frame-field"] },
    { mode: [0], valueKinds: ["frame-field"] },
  ]);
  assert.ok(slots.every(entry => (
    entry.semanticId === "native-transient-slot-control"
    && entry.handlerAddress === "0x0c16b24c"
  )));
});

test("operation 0x01a1 retains only its five exact authored routes", () => {
  const entries = operations("0x01a1");
  assert.equal(entries.length, 5);
  assert.deepEqual(entries.map(entry => entry.argumentCount), [10, 10, 10, 10, 1]);
  assert.deepEqual(
    entries.map(entry => entry.semanticId),
    [
      "native-four-channel-byte-envelope-control",
      "native-four-channel-byte-envelope-control",
      "native-four-channel-byte-envelope-control",
      "native-four-channel-byte-envelope-control",
      "native-four-channel-byte-envelope-active-query",
    ],
  );
  assert.ok(entries.every(entry => entry.handlerAddress === "0x0c16adb0"));
  assert.ok(entries.every(entry => entry.sources.includes(
    "tools/evidence/operation-01a1-evidence.json",
  )));
});

test("operations 0x011a, 0x0153, 0x015c, and 0x0193 retain exact controller routes", () => {
  const release = operation("0x011a");
  assert.equal(release.semanticId, "native-operation-011a-object-record-release");
  assert.equal(release.handlerAddress, "0x0c16b2d6");
  assert.deepEqual(release.argumentConstraints, [{
    index: 0,
    kinds: ["constant", "frame-field", "scene-field"],
  }]);

  const negativeFlag = operation("0x0153");
  assert.equal(negativeFlag.semanticId, "native-operation-0153-negative-flag-write");
  assert.deepEqual(negativeFlag.argumentConstraints, [{
    index: 0,
    values: [0, 1, 0xffffffff],
  }]);

  const namedController = operation("0x015c");
  assert.equal(namedController.semanticId, "native-operation-015c-named-controller-acquire");
  assert.deepEqual(namedController.argumentConstraints, [
    { index: 0, kinds: ["static-pointer"] },
    { index: 1, values: [0] },
  ]);

  const controller = operations("0x0193");
  assert.deepEqual(controller.map(entry => entry.argumentConstraints), [
    [{ index: 0, values: [0] }, { index: 1, values: [0] }],
    [{ index: 0, values: [1] }, { index: 1, values: [0] }],
    [{ index: 0, values: [2] }, { index: 1, kinds: ["constant"] }],
  ]);
  assert.ok(controller.every(entry => (
    entry.semanticId === "native-operation-0193-controller"
    && entry.handlerAddress === "0x0c16380a"
  )));
});

test("operation 0x0156 retains both exact FENS envelope routes", () => {
  const entries = operations("0x0156");
  assert.deepEqual(entries.map(entry => entry.argumentConstraints), [
    [
      { index: 0, values: [0] },
      { index: 1, values: [5, 9] },
      { index: 2, values: [1, 60, 80] },
    ],
    [
      { index: 0, values: [1] },
      { index: 1, values: [0] },
      { index: 2, values: [1, 50, 60] },
    ],
  ]);
  assert.ok(entries.every(entry => (
    entry.semanticId === "native-operation-0156-fens-envelope-control"
    && entry.handlerAddress === "0x0c163656"
  )));
  assert.match(entries[0].provenBehavior, /floor\(256 \/ duration\)/);
  assert.match(entries[1].provenBehavior, /selector operand is ignored/);
});

test("operation 0x0047 retains every exact EFPT controller shape", () => {
  const entries = operations("0x0047");
  assert.deepEqual(entries.map(entry => ({
    argumentCount: entry.argumentCount,
    mode: entry.argumentConstraints[0].values[0],
  })), [
    { argumentCount: 6, mode: 0 },
    { argumentCount: 2, mode: 1 },
    { argumentCount: 2, mode: 2 },
    { argumentCount: 2, mode: 3 },
    { argumentCount: 4, mode: 6 },
    { argumentCount: 3, mode: 7 },
    { argumentCount: 3, mode: 10 },
    { argumentCount: 4, mode: 13 },
    { argumentCount: 1, mode: 15 },
  ]);
  assert.ok(entries.every(entry => (
    entry.semanticId === "native-efpt-controller"
    && entry.handlerAddress === "0x0c15feae"
  )));
  assert.match(entries[0].provenBehavior, /eight-slot handle/);
  assert.match(entries.at(-1).provenBehavior, /global reset/);
});

test("operation 0x0100 retains only the exact YD01 EFPT route signatures", () => {
  const entries = operations("0x0100");
  assert.deepEqual(entries.map(entry => ({
    argumentCount: entry.argumentCount,
    mode: entry.argumentConstraints[0].values[0],
  })), [
    { argumentCount: 7, mode: 0 },
    { argumentCount: 5, mode: 9 },
    { argumentCount: 4, mode: 8 },
    { argumentCount: 3, mode: 11 },
    { argumentCount: 3, mode: 12 },
    { argumentCount: 2, mode: 1 },
    { argumentCount: 3, mode: 7 },
    { argumentCount: 2, mode: 2 },
    { argumentCount: 2, mode: 3 },
  ]);
  assert.ok(entries.every(entry => (
    entry.semanticId === "native-efpt-primary-controller"
    && entry.handlerAddress === "0x0c15f74c"
    && entry.sources.includes("tools/evidence/operation-0100-evidence.json")
  )));
  assert.match(entries[0].provenBehavior, /sixteen-slot/);
});

test("operation 0x006e retains all exact fixed-float and inert routes", () => {
  const entries = operations("0x006e");
  assert.deepEqual(entries.map(entry => ({
    argumentCount: entry.argumentCount,
    mode: entry.argumentConstraints[0].values[0],
  })), [
    { argumentCount: 2, mode: 0 },
    { argumentCount: 2, mode: 1 },
    { argumentCount: 2, mode: 2 },
    { argumentCount: 4, mode: 5 },
    { argumentCount: 2, mode: 6 },
  ]);
  assert.ok(entries.every(entry => (
    entry.semanticId === "native-fixed-float-exchange-control"
    && entry.handlerAddress === "0x0c156bc4"
    && entry.sources.includes("tools/evidence/operation-006e-evidence.json")
  )));
  assert.match(entries[0].provenBehavior, /non-mutating query/);
  assert.match(entries[3].provenBehavior, /inert/);
  assert.match(entries[4].provenBehavior, /rts\/nop/);
});

test("operation 0x019e retains only its two authored controller routes", () => {
  const entries = operations("0x019e");
  assert.deepEqual(entries.map(entry => ({
    argumentCount: entry.argumentCount,
    mode: entry.argumentConstraints[0].values[0],
  })), [
    { argumentCount: 2, mode: 2 },
    { argumentCount: 7, mode: 4 },
  ]);
  assert.ok(entries.every(entry => (
    entry.semanticId === "native-operation-019e-controller-control"
    && entry.handlerAddress === "0x0c16ac0e"
    && entry.sources.includes("tools/evidence/operation-019e-evidence.json")
  )));
  assert.equal(entries[1].staticPointerSentinelWord, 0xffffffff);
  assert.equal(entries[1].staticPointerMaximumWordCount, 8);
  assert.match(entries[1].provenBehavior, /eight records/);
});

test("operation 0x009b retains the exact native registry-release route", () => {
  const release = operation("0x009b");
  assert.equal(release.semanticId, "native-registry-record-release");
  assert.equal(release.handlerAddress, "0x0c166020");
  assert.deepEqual(release.argumentConstraints, [{
    index: 0,
    kinds: ["frame-field", "runtime", "scene-field"],
  }]);
  assert.deepEqual(release.sources, [
    "tools/scripting/operations/extract_operation_009b_evidence.py",
    "tools/evidence/operation-009b-evidence.json",
  ]);
});

test("operation 0x01ad retains the exact fixed-stride dword table", () => {
  const write = operation("0x01ad");
  assert.equal(write.semanticId, "native-fixed-stride-record-dword-write");
  assert.equal(write.handlerAddress, "0x0c164b72");
  assert.deepEqual(write.argumentConstraints, [
    { index: 0, values: Array.from({ length: 17 }, (_, index) => index) },
    { index: 1, values: [0, 1] },
  ]);
  assert.deepEqual(write.sources, [
    "tools/scripting/operations/extract_operation_01ad_evidence.py",
    "tools/evidence/operation-01ad-evidence.json",
  ]);
});

test("operation 0x012c retains both exact native no-op shapes", () => {
  const entry = operation("0x012c");
  assert.equal(entry.semanticId, "native-operation-012c-no-op");
  assert.deepEqual(entry.argumentCounts, [1, 2]);
  assert.equal(entry.handlerAddress, "0x0c1731ca");
  assert.match(entry.provenBehavior, /exactly rts; nop/);
  assert.match(entry.provenBehavior, /no result or side effect/);
});

test("operation 0x0128 retains only its authored environment presets", () => {
  const entry = operation("0x0128");
  assert.equal(entry.semanticId, "native-environment-preset-select");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c16b0a2");
  assert.deepEqual(entry.argumentConstraints, [{ index: 0, values: [0, 1] }]);
  assert.match(entry.provenBehavior, /FOG/);
  assert.match(entry.provenBehavior, /BACK/);
  assert.match(entry.provenBehavior, /80-byte/);
});

test("operation 0x0185 retains exact current scene-owner flag control", () => {
  const entry = operation("0x0185");
  assert.equal(entry.semanticId, "native-scene-owner-flag-bit-control");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c16b7b0");
  assert.deepEqual(entry.argumentConstraints, [
    { index: 0, values: [0] },
    { index: 1, values: [0, 1] },
  ]);
  assert.match(entry.provenBehavior, /current scene-owner target/);
  assert.match(entry.provenBehavior, /\+0xe0/);
  assert.match(entry.provenBehavior, /sets or clears/);
});

test("additional complete return handlers remain exact native no-ops", () => {
  for (const [operationHex, argumentCount, handlerAddress] of [
    ["0x00cd", 2, "0x0c155d66"],
    ["0x0141", 2, "0x0c165800"],
    ["0x0182", 3, "0x0c173188"],
  ]) {
    const entry = operation(operationHex);
    assert.equal(entry.semanticId, `native-operation-${operationHex.slice(2)}-no-op`);
    assert.equal(entry.argumentCount, argumentCount);
    assert.equal(entry.handlerAddress, handlerAddress);
    assert.match(entry.provenBehavior, /exactly rts; nop/);
  }
});

test("operation 0x014f retains exact raw float-word writes", () => {
  const entry = operation("0x014f");
  assert.equal(entry.semanticId, "native-operation-014f-global-float-word-write");
  assert.deepEqual(entry.argumentConstraints[0].values, [0, 1053609165, 1056964608]);
  assert.match(entry.provenBehavior, /0x0c21bc74/);
});

test("operation 0x013a writes the authoritative direct-vector third component", () => {
  const entry = operation("0x013a");
  assert.equal(entry.semanticId, "resolved-object-float-word-48-write");
  assert.equal(entry.handlerAddress, "0x0c1584b0");
  assert.match(entry.provenBehavior, /\+0x48/);
  assert.match(entry.provenBehavior, /Missing objects are exact native no-ops/);
});

test("operation 0x0052 retains its exact unused-object table write", () => {
  const entry = operation("0x0052");
  assert.equal(entry.semanticId, "native-operation-0052-indexed-table-write");
  assert.deepEqual(entry.argumentConstraints, [
    { index: 1, values: [32] }, { index: 2, values: [89] },
  ]);
  assert.match(entry.provenBehavior, /never reads/);
  assert.match(entry.provenBehavior, /12-byte-stride/);
});

test("operation 0x016d retains its five exact authored routes", () => {
  const entry = operation("0x016d");
  assert.equal(entry.semanticId, "native-operation-016d-control");
  assert.equal(entry.argumentCount, 4);
  assert.equal(entry.handlerAddress, "0x0c16b358");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 0,
    values: [0, 1, 2, 3, 4],
  }]);
  assert.match(entry.provenBehavior, /0x0c224b20/);
  assert.match(entry.provenBehavior, /native no-op/);
  assert.match(entry.provenBehavior, /mandatory adapters/);
});

test("operation 0x0166 retains distinct exact route shapes", () => {
  const entries = operations("0x0166");
  assert.equal(entries.length, 15);
  const mode28 = entries.find(
    entry => entry.semanticId === "native-operation-0166-mode-28-global-clear",
  );
  assert.equal(mode28.argumentCount, 1);
  assert.deepEqual(mode28.argumentConstraints, [{ index: 0, values: [28] }]);
  assert.match(mode28.provenBehavior, /0x0c224428/);
  const mode29 = entries.find(
    entry => entry.semanticId === "native-operation-0166-mode-29-bounded-poll",
  );
  assert.equal(mode29.argumentCount, 1);
  assert.deepEqual(mode29.argumentConstraints, [{ index: 0, values: [29] }]);
  assert.match(mode29.provenBehavior, /0x0c21bd04/);
  const mode30 = entries.find(
    entry => entry.semanticId === "native-operation-0166-mode-30-record-state-query",
  );
  assert.equal(mode30.argumentCount, 2);
  assert.deepEqual(mode30.argumentConstraints[0], { index: 0, values: [30] });
  assert.match(mode30.provenBehavior, /\+0x14/);
  const control = entries.filter(
    entry => entry.semanticId === "native-operation-0166-control",
  );
  assert.deepEqual(control.map(entry => ({
    argumentCount: entry.argumentCount,
    mode: entry.argumentConstraints[0].values[0],
  })).sort((left, right) => left.mode - right.mode), [
    { argumentCount: 4, mode: 0 },
    { argumentCount: 2, mode: 2 },
    { argumentCount: 1, mode: 3 },
    { argumentCount: 3, mode: 4 },
    { argumentCount: 2, mode: 5 },
    { argumentCount: 2, mode: 6 },
    { argumentCount: 2, mode: 7 },
    { argumentCount: 2, mode: 8 },
    { argumentCount: 3, mode: 13 },
    { argumentCount: 1, mode: 18 },
    { argumentCount: 2, mode: 27 },
  ]);
  assert.ok(control.every(entry => entry.handlerAddress === "0x0c167ab4"));
  assert.ok(control.filter(entry => (
    entry.argumentConstraints[0].values[0] !== 0
  )).every(entry => entry.sources.includes(
    "tools/evidence/operation-0166-control-evidence.json",
  )));
  const byMode = new Map(control.map(entry => [
    entry.argumentConstraints[0].values[0],
    entry,
  ]));
  assert.match(byMode.get(0).provenBehavior, /HUMANS\.idx/);
  assert.match(byMode.get(0).provenBehavior, /scene\/%02d\/stream/);
  assert.deepEqual(byMode.get(0).sources, [
    "tools/scripting/operations/extract_operation_0166_mode0_evidence.py",
    "tools/evidence/operation-0166-mode0-evidence.json",
  ]);
  assert.match(byMode.get(2).provenBehavior, /0x0c21bce8/);
  assert.match(byMode.get(13).provenBehavior, /\+0x90/);
  assert.match(byMode.get(18).provenBehavior, /mandatory low-level adapters/);
  assert.match(byMode.get(27).provenBehavior, /\+0x8c/);
});

test("operation 0x0120 retains its three exact fixed-record routes", () => {
  const entries = operations("0x0120");
  assert.equal(entries.length, 3);
  const entry = entries[0];
  assert.equal(
    entry.semanticId,
    "native-operation-0120-record-field-control",
  );
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c164ae6");
  assert.deepEqual(entry.argumentConstraints, [
    { index: 0, values: [0] },
    { index: 1, kinds: ["constant"] },
  ]);
  assert.match(entry.provenBehavior, /32 fixed records/);
  assert.match(entry.provenBehavior, /dword \+0x08/);
  assert.match(entry.provenBehavior, /meaning remain unknown/);
  assert.deepEqual(entries.slice(1).map(candidate => ({
    argumentCount: candidate.argumentCount,
    mode: candidate.argumentConstraints[0].values[0],
    indices: candidate.argumentConstraints[1].values,
  })), [
    {
      argumentCount: 3,
      mode: 1,
      indices: [0, 1, 2, 5, 6, 9, 16, 19],
    },
    {
      argumentCount: 3,
      mode: 2,
      indices: [2, 5, 16, 19],
    },
  ]);
  assert.match(entries[1].provenBehavior, /old dword \+0x08/);
  assert.match(entries[2].provenBehavior, /old dword \+0x34/);
});

test("operation 0x0121 promotes only exact two-argument actor-field routes", () => {
  const entry = operation("0x0121");
  assert.equal(entry.semanticId, "resolved-actor-dword-7c-access");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c1583dc");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 1,
    values: [0, 1, 2, 4, 8, 9, 11],
  }]);
  assert.match(entry.provenBehavior, /dword at actor offset \+0x7c/);
  assert.match(entry.provenBehavior, /other argument shapes remain unresolved/);
});

test("operation 0x0118 retains four exact object/global field routes", () => {
  const entries = operations("0x0118");
  assert.equal(entries.length, 4);
  assert.ok(entries.every(entry => (
    entry.semanticId === "resolved-object-b8-bc-control"
    && entry.argumentCount === 3
    && entry.handlerAddress === "0x0c1648ac"
  )));
  assert.deepEqual(entries.map(entry => entry.argumentConstraints[0].values[0]), [
    0, 1, 2, 3,
  ]);
  assert.match(entries[0].provenBehavior, /exact prior dword/);
  assert.match(entries[2].provenBehavior, /does not require a guessed prior/);
  assert.match(entries[3].provenBehavior, /raw float32 word/);
});

test("operation 0x004d retains exact shared dword low-flag ownership", () => {
  const entry = operation("0x004d");
  assert.equal(
    entry.semanticId,
    "resolved-object-dword-5c-low-flags-control",
  );
  assert.equal(entry.argumentCount, 2);
  assert.deepEqual(entry.argumentConstraints, [{ index: 1, values: [1] }]);
  assert.match(entry.provenBehavior, /invalidation generation/);
});

test("operation 0x001c retains only four exact packed-word routes", () => {
  const entry = operation("0x001c");
  assert.equal(entry.semanticId, "native-operation-001c-packed-word-query");
  assert.equal(entry.argumentCount, 3);
  assert.equal(entry.handlerAddress, "0x0c157bdc");
  assert.deepEqual(entry.argumentConstraints[1], {
    index: 1,
    kinds: [
      "constant",
      "frame-address",
      "frame-field",
      "runtime",
      "scene-address",
      "static-pointer",
    ],
  });
  assert.deepEqual(entry.argumentConstraints[2], {
    index: 2,
    values: [0, 0x02000000, 0x40000000, 0x42000000],
  });
  assert.match(entry.provenBehavior, /distinct missing-object behavior/);
  assert.match(entry.provenBehavior, /destination\+4 query helper/);
  assert.match(entry.provenBehavior, /mandatory read-only adapters/);
});

test("operation 0x001e retains only the authored direct heading form", () => {
  const entry = operation("0x001e");
  assert.equal(
    entry.semanticId,
    "resolved-object-world-point-heading-write",
  );
  assert.equal(entry.argumentCount, 4);
  assert.equal(entry.handlerAddress, "0x0c1578a4");
  assert.equal(entry.staticPointerWordCount, 3);
  assert.deepEqual(entry.argumentConstraints, [
    { index: 1, values: [0x38000000] },
    {
      index: 2,
      kinds: ["frame-address", "scene-address", "static-pointer"],
    },
    { index: 3, values: [0] },
  ]);
  assert.match(entry.provenBehavior, /direct position/);
  assert.match(entry.provenBehavior, /direct secondary-vector/);
});

test("operation 0x008f retains exact object orchestration boundaries", () => {
  const entry = operation("0x008f");
  assert.equal(
    entry.semanticId,
    "native-operation-008f-object-orchestration",
  );
  assert.equal(entry.argumentCount, 3);
  assert.equal(entry.handlerAddress, "0x0c17355c");
  assert.deepEqual(entry.argumentConstraints, [
    {
      index: 0,
      kinds: ["constant", "frame-field", "unresolved"],
    },
    {
      index: 1,
      kinds: ["constant", "frame-field", "scene-field", "static-pointer"],
    },
    {
      index: 2,
      kinds: ["constant", "runtime"],
    },
  ]);
  assert.match(entry.provenBehavior, /current-owner \+0x1c/);
  assert.match(entry.provenBehavior, /conditional identity reconciliation/);
  assert.match(entry.provenBehavior, /mandatory low-level adapters/);
  assert.match(entry.provenBehavior, /meanings remain unknown/);
});

test("operation 0x0084 retains exact MOTI resource request routing", () => {
  const entry = operation("0x0084");
  assert.equal(entry.semanticId, "native-motion-resource-request");
  assert.equal(entry.argumentCount, 3);
  assert.equal(entry.handlerAddress, "0x0c165fd2");
  assert.deepEqual(entry.argumentConstraints, [
    {
      index: 0,
      kinds: [
        "constant",
        "frame-field",
        "operation-result",
        "scene-field",
      ],
    },
    { index: 1, kinds: ["constant"] },
    { index: 2, kinds: ["static-pointer"] },
  ]);
  assert.match(entry.provenBehavior, /M_MOBJ\.BIN and M_MDOR\.BIN/);
  assert.match(entry.provenBehavior, /opaque handle/);
  assert.match(entry.provenBehavior, /current-scene query 0x019c/);
});

test("operations 0x00d8 and 0x00dd retain shake and HNDM contracts", () => {
  const shake = operation("0x00d8");
  assert.equal(shake.semanticId, "native-camera-shake-envelope-write");
  assert.equal(shake.argumentCount, 3);
  assert.equal(shake.handlerAddress, "0x0c1570ca");
  assert.deepEqual(shake.argumentConstraints[2], {
    index: 2,
    kinds: ["constant", "frame-field", "runtime"],
  });
  assert.match(shake.provenBehavior, /\+0, \+0, and \+1/);

  const handMotion = operation("0x00dd");
  assert.equal(handMotion.semanticId, "native-hand-motion-resource-request");
  assert.equal(handMotion.argumentCount, 3);
  assert.equal(handMotion.handlerAddress, "0x0c165128");
  assert.deepEqual(handMotion.argumentConstraints.map(value => value.kinds), [
    ["constant"], ["constant"], ["static-pointer"],
  ]);
  assert.match(handMotion.provenBehavior, /HNDM resource request/);
});

test("operation 0x008c owns the object IMGM selection byte", () => {
  const entry = operation("0x008c");
  assert.equal(entry.semanticId, "resolved-object-imgm-selection-write");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c164ffe");
  assert.deepEqual(entry.argumentConstraints, [
    { index: 0, kinds: ["constant"] },
    { index: 1, kinds: ["frame-field", "runtime"] },
  ]);
  assert.match(entry.provenBehavior, /IMGM/);
  assert.match(entry.provenBehavior, /low byte/);
  assert.match(entry.provenBehavior, /selection index/);
});

test("operation 0x019f retains only its exact MOMT flag routes", () => {
  const entry = operation("0x019f");
  assert.equal(
    entry.semanticId,
    "native-operation-019f-momt-flag-24-control",
  );
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c166d7c");
  assert.deepEqual(entry.argumentConstraints, [
    { index: 0, kinds: ["constant", "frame-field"] },
    { index: 1, values: [0, 1] },
  ]);
  assert.match(entry.provenBehavior, /0x01000000/);
  assert.match(entry.provenBehavior, /record \+0x18/);
  assert.match(entry.provenBehavior, /registry unlink adapter/);
  assert.match(entry.provenBehavior, /meaning of bit 24 remains unknown/);
});

test("operation 0x018e retains its exact fixed global byte write", () => {
  const entry = operation("0x018e");
  assert.equal(entry.semanticId, "fixed-global-byte-0c201fe0-write");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c1637fc");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 0,
    values: [0, 1],
  }]);
  assert.match(entry.provenBehavior, /0x0c201fe0/);
  assert.match(entry.provenBehavior, /meaning remain unknown/);
});

test("operation 0x0194 exposes only its three observed native routes", () => {
  const entries = operations("0x0194");
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map(entry => entry.argumentConstraints),
    [0, 1, 2].map(mode => [
      { index: 0, values: [mode] },
      { index: 1, values: [0] },
    ]),
  );
  for (const entry of entries) {
    assert.equal(entry.semanticId, "native-operation-0194-control");
    assert.equal(entry.argumentCount, 2);
    assert.equal(entry.handlerAddress, "0x0c16383e");
    assert.match(entry.provenBehavior, /meaning remain unknown/);
  }
  assert.match(entries[0].provenBehavior, /0x0c0f2dc0/);
  assert.match(entries[1].provenBehavior, /0x0c0f2de4/);
  assert.match(entries[2].provenBehavior, /low byte/);
});

test("operation 0x01af retains fourteen exact byte-state selectors", () => {
  const entries = operations("0x01af").filter(
    entry => entry.semanticId === "native-game-state-byte-control",
  );
  assert.equal(entries.length, 8);
  assert.deepEqual(
    entries.map(entry => entry.argumentCount),
    [2, 1, 2, 1, 4, 3, 3, 2],
  );
  assert.deepEqual(
    entries.flatMap(entry => entry.argumentConstraints[0].values).sort(
      (left, right) => left - right,
    ),
    [14, 15, 42, 44, 55, 56, 57, 58, 71, 72, 73, 74, 75, 76],
  );
  for (const entry of entries) {
    assert.equal(entry.handlerAddress, "0x0c16b64e");
    assert.match(entry.provenBehavior, /unknown/);
  }
});

test("operation 0x0113 retains exact FACE and CLIP record writes", () => {
  const entry = operation("0x0113");
  assert.equal(entry.semanticId, "actor-face-clip-control-write");
  assert.equal(entry.argumentCount, 4);
  assert.equal(entry.handlerAddress, "0x0c164eb8");
  assert.equal(entry.argumentConstraints, undefined);
  assert.match(entry.provenBehavior, /FACE \+0x2c/);
  assert.match(entry.provenBehavior, /FACE \+0x4a/);
  assert.match(entry.provenBehavior, /CLIP \+0x1c/);
});

test("operation 0x0059 copies only to proven native address operands", () => {
  const entry = operation("0x0059");
  assert.equal(entry.semanticId, "native-clock-record-copy");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c170776");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 0,
    kinds: ["frame-address", "scene-address"],
  }]);
  assert.match(entry.provenBehavior, /does not substitute browser time/);
});

test("operation 0x0058 installs the normalized native clock record", () => {
  const entry = operation("0x0058");
  assert.equal(entry.semanticId, "native-clock-record-write");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c170768");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 0,
    kinds: ["frame-address", "scene-address"],
  }]);
  assert.match(entry.provenBehavior, /recomputes Sunday-zero weekday/);
});

test("operation 0x015f retains exact MAPC bit and object-float writes", () => {
  const entry = operation("0x015f");
  assert.equal(entry.semanticId, "resolved-object-mapc-bit-control");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c1584d4");
  assert.deepEqual(entry.argumentConstraints, [
    {
      index: 0,
      kinds: ["constant", "frame-field", "scene-field"],
    },
    { index: 1, values: [0, 1] },
  ]);
  assert.match(entry.provenBehavior, /MAPC/);
  assert.match(entry.provenBehavior, /\+0x48/);
});

test("operation 0x00ec retains its exact TMNM record writes", () => {
  const entry = operation("0x00ec");
  assert.equal(entry.semanticId, "resolved-object-tmnm-parameter-write");
  assert.equal(entry.argumentCount, 7);
  assert.equal(entry.handlerAddress, "0x0c1664e6");
  assert.equal(entry.argumentConstraints, undefined);
  assert.match(entry.provenBehavior, /TMNM/);
  assert.match(entry.provenBehavior, /\+0x14/);
  assert.match(entry.provenBehavior, /\+0x1c/);
});

test("operation 0x00fb retains its exact TMNM word-zero reset", () => {
  const entry = operation("0x00fb");
  assert.equal(entry.semanticId, "resolved-object-tmnm-word-zero-reset");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c1665ec");
  assert.equal(entry.argumentConstraints, undefined);
  assert.match(entry.provenBehavior, /TMNM/);
  assert.match(entry.provenBehavior, /\+0x00/);
  assert.match(entry.provenBehavior, /no-op/);
});

test("operation 0x0094 retains the exact FACE controller reset", () => {
  const entry = operation("0x0094");
  assert.equal(entry.semanticId, "resolved-face-controller-setup");
  assert.equal(entry.argumentCount, 4);
  assert.equal(entry.handlerAddress, "0x0c165080");
  assert.match(entry.provenBehavior, /FACE controller at \+0x44/);
  assert.match(entry.provenBehavior, /60, 70, 80, or 90/);
});

test("operation 0x00ae retains the shared fixed-record pose write", () => {
  const entry = operation("0x00ae");
  assert.equal(entry.semanticId, "native-fixed-record-pose-write");
  assert.equal(entry.argumentCount, 3);
  assert.equal(entry.handlerAddress, "0x0c164a2a");
  assert.match(entry.provenBehavior, /\+0x1c/);
  assert.match(entry.provenBehavior, /operation 0x0120 mode two/);
});

test("operation 0x00b4 retains its proven SCRL control routes", () => {
  const entries = semantics.operations.filter(
    value => value.operationHex === "0x00b4",
  );
  assert.deepEqual(entries.map(value => value.semanticId), [
    "scroll-sprite-resource-allocation",
    "scroll-sprite-resource-allocation",
    "scroll-sprite-slot-release",
    "scroll-sprite-transition-request",
    "scroll-sprite-global-signed-word-write",
  ]);
  assert.match(entries[0].provenBehavior, /slot zero/);
  assert.match(entries[4].provenBehavior, /0x0c1f7158/);
});

test("operation 0x00eb retains only its two exact HNDL/HNDR masks", () => {
  const entry = operation("0x00eb");
  assert.equal(
    entry.semanticId,
    "resolved-object-hndl-hndr-component-write",
  );
  assert.equal(entry.argumentCount, 4);
  assert.equal(entry.handlerAddress, "0x0c1652fe");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 2,
    values: [21, 42],
  }]);
  assert.match(entry.provenBehavior, /raw 32-bit addition/);
  assert.match(entry.provenBehavior, /\+0x10/);
});

test("operations 0x00e7 and 0x00e9 retain exact HNDL/HNDR motion routes", () => {
  const request = operation("0x00e7");
  assert.equal(request.semanticId, "resolved-object-hndl-hndr-motion-request");
  assert.equal(request.argumentCount, 9);
  assert.equal(request.handlerAddress, "0x0c1651ca");
  assert.match(request.provenBehavior, /zero-range state/);

  const controls = operations("0x00e9");
  assert.deepEqual(controls.map(entry => ({
    argumentCount: entry.argumentCount,
    mode: entry.argumentConstraints[0],
  })), [
    { argumentCount: 5, mode: { index: 2, values: [0] } },
    { argumentCount: 4, mode: { index: 2, values: [1] } },
  ]);
  assert.ok(controls.every(entry => (
    entry.semanticId === "resolved-object-hndl-hndr-motion-control"
    && entry.handlerAddress === "0x0c165280"
  )));
});

test("operation 0x0199 retains its three exact native modes", () => {
  const entries = operations("0x0199");
  assert.equal(entries.length, 3);
  const entry = entries[0];
  assert.equal(entry.semanticId, "native-operation-0199-mode-zero");
  assert.equal(entry.argumentCount, 6);
  assert.equal(entry.handlerAddress, "0x0c1573d6");
  assert.deepEqual(entry.argumentConstraints[0], {
    index: 0,
    values: [0],
  });
  assert.deepEqual(
    entry.argumentConstraints.slice(1).map(constraint => constraint.kinds),
    [["constant"], ["constant"], ["constant"], ["constant"], ["constant"]],
  );
  assert.match(entry.provenBehavior, /mandatory adapter/);
  assert.equal(entries[1].semanticId, "native-operation-0199-control-dword-write");
  assert.deepEqual(entries[1].argumentConstraints[0], {
    index: 0,
    values: [1],
  });
  assert.equal(entries[2].semanticId, "native-operation-0199-status-byte-query");
  assert.deepEqual(entries[2].argumentConstraints[0], {
    index: 0,
    values: [2],
  });
});

test("sound and MOMT mask effects retain their exact native boundaries", () => {
  const sound = operation("0x006c");
  assert.equal(sound.semanticId, "sound-command-dispatch");
  assert.equal(sound.handlerAddress, "0x0c16b110");
  assert.equal(sound.argumentConstraints, undefined);

  const mask = operation("0x0040");
  assert.equal(mask.semanticId, "actor-momt-mask-control");
  assert.deepEqual(mask.argumentConstraints, [{
    index: 1,
    values: [1, 2],
  }]);
});

test("operation 0x004e retains its exact paired MOMT float writes", () => {
  const entry = operation("0x004e");
  assert.equal(entry.semanticId, "actor-momt-float-pair-write");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c165a60");
  assert.match(entry.provenBehavior, /\+0x00f0 and \+0x0128/);
  assert.match(entry.provenBehavior, /registry unlink/);
});

test("secondary interaction-record writes require all eight native arguments", () => {
  const entry = semantics.secondaryOperations.find(
    candidate => candidate.operationHex === "0x0005",
  );
  assert.equal(entry.semanticId, "interaction-record-fields-write");
  assert.equal(entry.argumentCount, 8);
  assert.equal(entry.handlerAddress, "0x0c15f3e8");
});

test("secondary interaction manager retains its exact subcommands", () => {
  const entries = semantics.secondaryOperations.filter(
    candidate => candidate.operationHex === "0x0001",
  );
  assert.deepEqual(
    entries.map(entry => ({
      semanticId: entry.semanticId,
      values: entry.argumentConstraints[0].values,
    })),
    [
      {
        semanticId: "interaction-context-word-56-set",
        values: [1],
      },
      {
        semanticId: "interaction-context-word-56-clear",
        values: [12],
      },
      {
        semanticId: "interaction-manager-indirect-index-query",
        values: [3],
      },
      {
        semanticId: "interaction-manager-runtime-slot-allocate",
        values: [6],
      },
      {
        semanticId: "interaction-manager-nearest-descriptor-query",
        values: [5],
      },
      {
        semanticId: "interaction-manager-runtime-slot-status-consume",
        values: [13],
      },
    ],
  );
});

test("operation 0x0116 retains only its exact proven selector contracts", () => {
  const entries = semantics.operations.filter(
    candidate => candidate.operationHex === "0x0116",
  );
  assert.deepEqual(entries.map(entry => ({
    semanticId: entry.semanticId,
    argumentCount: entry.argumentCount,
    selectors: entry.argumentConstraints[0].values,
  })), [
    {
      semanticId: "global-runtime-controller-event-poll",
      argumentCount: 1,
      selectors: [0xffffffff],
    },
    {
      semanticId: "global-runtime-controller-initialize",
      argumentCount: 2,
      selectors: [0],
    },
    {
      semanticId: "global-runtime-controller-reset",
      argumentCount: 1,
      selectors: [2],
    },
    {
      semanticId: "global-runtime-controller-status-query",
      argumentCount: 1,
      selectors: [3],
    },
    {
      semanticId: "fixed-global-dword-write",
      argumentCount: 2,
      selectors: [4, 5],
    },
  ]);
});

test("operation 0x0139 separates outer controller and action modes", () => {
  const entries = semantics.operations.filter(
    candidate => candidate.operationHex === "0x0139",
  );
  assert.deepEqual(entries.map(entry => ({
    semanticId: entry.semanticId,
    argumentCount: entry.argumentCount,
    selectors: entry.argumentConstraints[0].values,
  })), [
    {
      semanticId: "tagged-object-controller-initialize",
      argumentCount: 3,
      selectors: [0],
    },
    {
      semanticId: "tagged-object-controller-configuration-write",
      argumentCount: 2,
      selectors: [16],
    },
    {
      semanticId: "tagged-object-action",
      argumentCount: undefined,
      selectors: [1, 2, 3, 4, 5],
    },
  ]);
});

test("operation 0x009c retains its low-level MOTM word contract", () => {
  const entry = operation("0x009c");
  assert.equal(entry.semanticId, "actor-controller-word-7c-write");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c16602e");
  assert.equal(entry.argumentConstraints, undefined);
});

test("operation 0x009d promotes only its five authored MOTM modes", () => {
  const entry = operation("0x009d");
  assert.equal(entry.semanticId, "actor-motm-mode-control");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c166078");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 1,
    values: [0, 1, 2, 3, 0xffffffff],
  }]);
  assert.match(entry.provenBehavior, /words \+0x86, \+0x90, and \+0x9a/);
});

test("operation 0x001b retains its exact FIXO reset boundary", () => {
  const entry = operation("0x001b");
  assert.equal(entry.semanticId, "resolved-object-fixo-reset");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c157830");
  assert.match(entry.provenBehavior, /hard prerequisite/);
});

test("operation 0x0143 promotes only its exact selector-zero writes", () => {
  const entry = operation("0x0143");
  assert.equal(
    entry.semanticId,
    "global-runtime-controller-byte-selection",
  );
  assert.equal(entry.argumentCount, 3);
  assert.deepEqual(entry.argumentConstraints, [{
    index: 0,
    values: [0],
  }]);
});

test("operation 0x015b retains its exact REFB vector contract", () => {
  const entry = operation("0x015b");
  assert.equal(entry.semanticId, "resolved-object-refb-vector-write");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c1600d2");
  assert.match(entry.provenBehavior, /argument-one offsets/);
  assert.match(entry.provenBehavior, /do not dereference/);
});

test("operation 0x0031 retains all eight exact unsigned field routes", () => {
  const entry = operation("0x0031");
  assert.equal(entry.semanticId, "current-event-control-field-query");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c16b4c8");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 0,
    values: [0, 1, 2, 3, 4, 5, 6, 7],
  }]);
  assert.match(entry.provenBehavior, /not the D000 logical door selector/);
});

test("operation 0x002d retains every exact authored primary-runtime mode", () => {
  const entries = semantics.operations.filter(
    candidate => candidate.operationHex === "0x002d",
  );
  assert.deepEqual(entries.slice(0, 3).map(entry => ({
    semanticId: entry.semanticId,
    argumentCount: entry.argumentCount,
    selectors: entry.argumentConstraints[0].values,
  })), [
    {
      semanticId: "primary-runtime-state-transition",
      argumentCount: 1,
      selectors: [0, 1],
    },
    {
      semanticId: "primary-runtime-state-one-query",
      argumentCount: 1,
      selectors: [2],
    },
    {
      semanticId: "primary-runtime-status-byte-query",
      argumentCount: 1,
      selectors: [8],
    },
  ]);
  assert.deepEqual(entries.slice(3).map(entry => ({
    argumentCount: entry.argumentCount,
    selector: entry.argumentConstraints[0].values[0],
  })), [
    { argumentCount: 2, selector: 7 },
    { argumentCount: 2, selector: 9 },
    { argumentCount: 1, selector: 11 },
    { argumentCount: 2, selector: 12 },
    { argumentCount: 2, selector: 13 },
    { argumentCount: 3, selector: 14 },
    { argumentCount: 1, selector: 15 },
    { argumentCount: 2, selector: 16 },
    { argumentCount: 2, selector: 17 },
    { argumentCount: 1, selector: 18 },
  ]);
  assert.ok(entries.slice(3).every(entry => (
    entry.semanticId === "primary-runtime-extended-operation"
  )));
  assert.match(entries[6].provenBehavior, /native no-op/);
  assert.match(entries[8].provenBehavior, /missing actor is a no-op/);
});

test("operation 0x002b retains its exact MOMT numeric query boundary", () => {
  const entry = operation("0x002b");
  assert.equal(entry.semanticId, "actor-momt-numeric-query");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c165e48");
  assert.match(entry.provenBehavior, /\+0x00f0 and control float word \+0x00dc/);
  assert.match(entry.provenBehavior, /signed remainder\/quotient/);
  assert.match(entry.provenBehavior, /0\.1875-scaled subtraction/);
});

test("operation 0x0027 retains the direct native object scale vector", () => {
  const entry = operation("0x0027");
  assert.equal(entry.semanticId, "resolved-object-scale-vector-write");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.staticPointerWordCount, 3);
  assert.equal(entry.handlerAddress, "0x0c164d44");
  assert.match(entry.provenBehavior, /\+0x34\/\+0x38\/\+0x3c/);
});

test("operation 0x0026 retains its exact fixed-global dword query", () => {
  const entry = operation("0x0026");
  assert.equal(entry.semanticId, "native-fixed-global-dword-query");
  assert.equal(entry.argumentCount, 0);
  assert.equal(entry.handlerAddress, "0x0c1649a8");
  assert.deepEqual(entry.sources, [
    "tools/scripting/operations/extract_operation_0026_evidence.py",
    "tools/evidence/operation-0026-evidence.json",
  ]);
});

test("operation 0x002a promotes only its exact MOMT mode-zero path", () => {
  const entry = operation("0x002a");
  assert.equal(entry.semanticId, "actor-momt-scaled-position-offset");
  assert.equal(entry.argumentCount, 3);
  assert.equal(entry.handlerAddress, "0x0c165cd4");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 2,
    values: [0],
  }]);
  assert.match(entry.provenBehavior, /\+0x0194\/\+0x0198\/\+0x019c/);
  assert.match(entry.provenBehavior, /before argument one is dereferenced/);
});

test("operation 0x003d retains both exact collection increment routes", () => {
  const entry = operation("0x003d");
  assert.equal(entry.semanticId, "native-collection-byte-increment");
  assert.equal(entry.argumentCount, 4);
  assert.equal(entry.handlerAddress, "0x0c163060");
  assert.match(entry.provenBehavior, /235-index namespace/);
  assert.match(entry.provenBehavior, /32 two-byte records/);
  assert.match(entry.provenBehavior, /Argument two is forwarded but unused/);
});

test("operation 0x003f retains both exact collection query routes", () => {
  const entry = operation("0x003f");
  assert.equal(entry.semanticId, "native-collection-byte-query");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c1630de");
  assert.match(entry.provenBehavior, /235-index namespace/);
  assert.match(entry.provenBehavior, /32 auxiliary records/);
});

test("operation 0x0066 retains eight exact indexed controller routes", () => {
  const entries = semantics.operations.filter(
    candidate => candidate.operationHex === "0x0066",
  );
  assert.equal(entries.length, 5);
  assert.deepEqual(
    entries.map(entry => entry.argumentConstraints),
    [
      [{ index: 1, values: [0, 10, 11] }],
      [
        { index: 0, kinds: ["constant", "frame-field"] },
        { index: 1, values: [2] },
        { index: 2, kinds: ["frame-address", "static-pointer"] },
      ],
      [
        { index: 0, kinds: ["constant", "frame-field"] },
        { index: 1, values: [4, 5] },
        { index: 2, kinds: ["constant", "frame-field"] },
      ],
      [
        { index: 0, kinds: ["constant", "frame-field"] },
        { index: 1, values: [6] },
        { index: 2, kinds: ["frame-address", "static-pointer"] },
      ],
      [
        { index: 0, kinds: ["constant", "frame-field"] },
        { index: 1, values: [8] },
        { index: 2, kinds: ["frame-address", "static-pointer"] },
      ],
    ],
  );
  assert.ok(entries.every(
    entry => entry.semanticId === "indexed-record-controller-write",
  ));
  assert.match(entries[1].provenBehavior, /\+0x08 through \+0x14/);
  assert.match(entries[2].provenBehavior, /\+0x18/);
  assert.match(entries[2].provenBehavior, /\+0x1c/);
  assert.match(entries[3].provenBehavior, /\+0x20/);
  assert.match(entries[4].provenBehavior, /\+0x34 through \+0x3c/);
});

test("operation 0x0070 retains exact MOMT vector-slot routing", () => {
  const entry = operation("0x0070");
  assert.equal(entry.semanticId, "resolved-object-momt-vector-slot-write");
  assert.equal(entry.argumentCount, 4);
  assert.equal(entry.handlerAddress, "0x0c15761a");
  assert.equal(entry.staticPointerWordCount, 3);
  assert.deepEqual(entry.argumentConstraints[2], {
    index: 2,
    kinds: ["frame-address", "scene-address", "static-pointer"],
  });
  assert.deepEqual(entry.argumentConstraints[3].values, [
    0x38000000,
    0x39000000,
    0x78000000,
  ]);
  assert.match(entry.provenBehavior, /direct affine point transform/);
});

test("operation 0x013f retains its exact OSAG float-word write", () => {
  const entry = operation("0x013f");
  assert.equal(entry.semanticId, "resolved-object-osag-float-word-write");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c131b44");
  assert.deepEqual(entry.argumentConstraints, [
    { index: 0, kinds: ["constant", "frame-field"] },
    { index: 1, kinds: ["constant"] },
  ]);
  assert.match(entry.provenBehavior, /OSAG \+0x01e8/);
});

test("operation 0x013c retains ten exact fixed-container routes", () => {
  const entries = semantics.operations.filter(
    candidate => candidate.operationHex === "0x013c",
  );
  assert.equal(entries.length, 10);
  assert.ok(entries.every(
    entry => entry.semanticId === "native-operation-013c-container-control",
  ));
  assert.deepEqual(
    entries.map(entry => ({
      argumentCount: entry.argumentCount,
      routes: entry.argumentConstraints
        .filter(constraint => constraint.index < 2)
        .map(constraint => constraint.values),
    })),
    [
      { argumentCount: 3, routes: [[0], [10]] },
      { argumentCount: 4, routes: [[0], [0]] },
      { argumentCount: 3, routes: [[2], [3]] },
      { argumentCount: 2, routes: [[0], [2]] },
      { argumentCount: 3, routes: [[0], [5, 6]] },
      { argumentCount: 3, routes: [[2], [1]] },
      { argumentCount: 3, routes: [[2], [2]] },
      { argumentCount: 4, routes: [[1], [0]] },
      { argumentCount: 3, routes: [[1], [1]] },
      { argumentCount: 5, routes: [[0], [8]] },
    ],
  );
  assert.match(entries[0].provenBehavior, /default 3000/);
  assert.match(entries[1].provenBehavior, /\+0x44/);
  assert.match(entries[2].provenBehavior, /currently installed/);
  assert.match(entries[3].provenBehavior, /\+0x38, \+0x3c, or \+0x40/);
  assert.match(entries[5].provenBehavior, /\+0x08/);
  assert.match(entries[6].provenBehavior, /\+0x34/);
  assert.deepEqual(entries[9].argumentConstraints[2], {
    index: 2,
    kinds: ["frame-field", "scene-field"],
  });
  assert.match(entries[7].provenBehavior, /reference count/);
  assert.match(entries[8].provenBehavior, /remaining reference count/);
  assert.match(entries[9].provenBehavior, /subordinate activity/);
});

test("secondary-motion operations retain exact global, mode, and flag routes", () => {
  const globalFloat = operations("0x0164");
  assert.equal(globalFloat.length, 1);
  assert.equal(
    globalFloat[0].semanticId,
    "native-secondary-motion-global-float-write",
  );
  assert.deepEqual(globalFloat[0].argumentConstraints[0].values, [
    0, 1, 2, 10, 11, 20, 21, 30, 31,
  ]);

  const actorMode = operations("0x0142");
  assert.equal(actorMode.length, 1);
  assert.equal(actorMode[0].semanticId, "resolved-secondary-motion-mode-write");
  assert.deepEqual(actorMode[0].argumentConstraints[1].values, [
    0, 2, 4, 5, 6, 8, 9,
  ]);

  const actorFlag = operations("0x0025");
  assert.equal(actorFlag.length, 1);
  assert.equal(actorFlag[0].semanticId, "resolved-secondary-motion-flag-write");
  assert.deepEqual(actorFlag[0].argumentConstraints[1].values, [2, 4, 8]);
  assert.deepEqual(actorFlag[0].argumentConstraints[2].values, [0, 1]);
});

test("operation 0x013e retains only exact install and release shapes", () => {
  const entries = operations("0x013e");
  assert.equal(entries.length, 2);
  assert.ok(entries.every(
    entry => (
      entry.semanticId === "native-operation-013e-resource-slot-control"
      && entry.handlerAddress === "0x0c15555a"
    ),
  ));
  assert.deepEqual(entries.map(entry => ({
    argumentCount: entry.argumentCount,
    constraints: entry.argumentConstraints,
  })), [
    {
      argumentCount: 4,
      constraints: [
        { index: 0, values: [0] },
        { index: 1, kinds: ["constant", "frame-field"] },
        { index: 2, kinds: ["static-pointer"] },
        { index: 3, kinds: ["static-pointer"] },
      ],
    },
    {
      argumentCount: 2,
      constraints: [
        { index: 0, values: [1] },
        { index: 1, kinds: ["constant", "frame-field"] },
      ],
    },
  ]);
  assert.match(entries[0].provenBehavior, /0\.\.69/);
  assert.match(entries[1].provenBehavior, /release path/);
});

test("operation 0x0050 retains exact bounded start and completion polling", () => {
  const entries = operations("0x0050");
  assert.equal(entries.length, 8);
  assert.ok(entries.every(entry => (
    entry.semanticId === "native-operation-0050-aseq-activity-control"
    && entry.handlerAddress === "0x0c155194"
  )));
  assert.ok(entries.slice(0, 4).every(entry => entry.argumentCount === 1));
  assert.deepEqual(
    entries[0].argumentConstraints[0].values,
    Array.from({ length: 70 }, (_, index) => index),
  );
  assert.deepEqual(entries[1].argumentConstraints, [{
    index: 0,
    kinds: ["frame-field"],
  }]);
  assert.deepEqual(entries[2].argumentConstraints, [{
    index: 0,
    values: [0xffffffff],
  }]);
  assert.deepEqual(entries[3].argumentConstraints, [{
    index: 0,
    values: [0xfffffff9],
  }]);
  assert.equal(entries[4].argumentCount, 3);
  assert.deepEqual(entries[4].argumentConstraints, [
    { index: 0, values: [0xfffffff4] },
    { index: 1, kinds: ["constant", "frame-field"] },
  ]);
  assert.equal(entries[5].argumentCount, 1);
  assert.deepEqual(entries[5].argumentConstraints, [{
    index: 0,
    values: [0xfffffff6],
  }]);
  assert.equal(entries[6].argumentCount, 3);
  assert.deepEqual(entries[6].argumentConstraints, [{
    index: 0,
    values: [0xfffffff7],
  }]);
  assert.equal(entries[7].argumentCount, 1);
  assert.deepEqual(entries[7].argumentConstraints, [{
    index: 0,
    values: [0xfffffffa],
  }]);
  assert.match(entries[0].provenBehavior, /ASEQ\/ACAM\/AMOV\/ASTR\/ALIP/);
  assert.match(entries[2].provenBehavior, /returns zero/);
  assert.match(entries[3].provenBehavior, /delayed-stop latch/);
  assert.match(entries[4].provenBehavior, /slot record's dword at \+0x10/);
  assert.match(entries[5].provenBehavior, /dword at \+0x40/);
  assert.match(entries[6].provenBehavior, /native no-op/);
  assert.match(entries[7].provenBehavior, /terminal-stop sequence/);
});

test("operation 0x0187 retains the exact native area-request record write", () => {
  const entry = operation("0x0187");
  assert.equal(entry.semanticId, "native-area-request-record-write");
  assert.equal(entry.handlerAddress, "0x0c16b4b6");
  assert.equal(entry.argumentCount, 4);
  assert.match(entry.provenBehavior, /\+0xdc, \+0xd4, \+0xd0, and \+0xd8/);
  assert.match(entry.provenBehavior, /pending bit zero at \+0xcc/);
});

test("operation 0x010f retains indexed native LGHT preset selection", () => {
  const entries = operations("0x010f");
  assert.equal(entries.length, 2);
  assert.ok(entries.every(entry => (
    entry.semanticId === "native-light-preset-select"
    && entry.handlerAddress === "0x0c1646f2"
    && entry.argumentCount === 1
  )));
  assert.deepEqual(
    entries[0].argumentConstraints[0].values,
    Array.from({ length: 24 }, (_, index) => index),
  );
  assert.deepEqual(entries[1].argumentConstraints, [{
    index: 0,
    kinds: ["frame-field"],
  }]);
  assert.match(entries[0].provenBehavior, /LGHT child/);
  assert.match(entries[1].provenBehavior, /signed 0\.\.23 bounds check/);
});

test("operation 0x0032 retains exact native controller field queries", () => {
  const entry = operation("0x0032");
  assert.equal(entry.semanticId, "native-controller-input-field-query");
  assert.equal(entry.handlerAddress, "0x0c16b53c");
  assert.equal(entry.argumentCount, 2);
  assert.deepEqual(entry.argumentConstraints, [
    { index: 0, values: [0, 1, 2, 3] },
    { index: 1, values: [0, 1, 2, 3, 4, 5, 6, 7] },
  ]);
  assert.match(entry.provenBehavior, /four 20-byte native controller records/);
});

test("operation 0x0170 retains exact MAP preparation invalidation and rebuild", () => {
  const entries = operations("0x0170");
  assert.equal(entries.length, 2);
  assert.ok(entries.every(entry => (
    entry.semanticId === "native-map-render-preparation-control"
    && entry.handlerAddress === "0x0c164be6"
    && entry.argumentCount === 2
  )));
  assert.deepEqual(entries.map(entry => (
    entry.argumentConstraints[1].values
  )), [[0], [1]]);
  assert.deepEqual(entries[0].argumentConstraints[0].values, [
    0xffffffff,
    ...Array.from({ length: 32 }, (_, index) => index),
  ]);
  assert.match(entries[0].provenBehavior, /invalidates retained render/);
  assert.match(entries[1].provenBehavior, /PRER workspace/);
});

test("operation 0x0071 retains its exact three-channel float access", () => {
  const entry = operation("0x0071");
  assert.equal(entry.semanticId, "fixed-three-channel-float-word-access");
  assert.equal(entry.argumentCount, 2);
  assert.deepEqual(entry.argumentConstraints, [{
    index: 0,
    values: [0, 1, 2, 3, 4],
  }]);
  assert.match(entry.provenBehavior, /\+0x104, \+0x108, and \+0x10c/);
  assert.match(entry.provenBehavior, /prior-value consumers fail closed/);
});

test("operation 0x005d retains only its exact CCOW bit-seven modes", () => {
  const entry = operation("0x005d");
  assert.equal(entry.semanticId, "resolved-object-ccow-bit-7-control");
  assert.equal(entry.argumentCount, 2);
  assert.equal(entry.handlerAddress, "0x0c158880");
  assert.deepEqual(entry.argumentConstraints, [{
    index: 1,
    values: [0, 1, 2],
  }]);
  assert.match(entry.provenBehavior, /0x00000080/);
  assert.match(entry.provenBehavior, /meaning remains unknown/);
});

test("operation 0x01c7 promotes only its seven exact authored routes", () => {
  const entries = semantics.operations.filter(
    candidate => candidate.operationHex === "0x01c7",
  );
  assert.deepEqual(entries.map(entry => ({
    semanticId: entry.semanticId,
    argumentCount: entry.argumentCount,
    constraints: entry.argumentConstraints,
  })), [
    {
      semanticId: "native-operation-01c7-control",
      argumentCount: 1,
      constraints: [{ index: 0, values: [0] }],
    },
    {
      semanticId: "native-operation-01c7-control",
      argumentCount: 1,
      constraints: [{ index: 0, values: [1] }],
    },
    {
      semanticId: "native-operation-01c7-control",
      argumentCount: 2,
      constraints: [{ index: 0, values: [2] }],
    },
    {
      semanticId: "native-operation-01c7-control",
      argumentCount: 3,
      constraints: [
        { index: 0, values: [3] },
        { index: 1, values: [0] },
      ],
    },
    {
      semanticId: "native-operation-01c7-control",
      argumentCount: 4,
      constraints: [
        { index: 0, values: [3] },
        { index: 1, values: [1] },
      ],
    },
    {
      semanticId: "native-operation-01c7-control",
      argumentCount: 3,
      constraints: [
        { index: 0, values: [3] },
        { index: 1, values: [2] },
      ],
    },
    {
      semanticId: "native-operation-01c7-control",
      argumentCount: 4,
      constraints: [
        { index: 0, values: [3] },
        { index: 1, values: [3] },
      ],
    },
  ]);
});

test("operation 0x00e6 retains its exact five-argument FIXO contract", () => {
  const entry = operation("0x00e6");
  assert.equal(
    entry.semanticId,
    "resolved-object-fixo-attachment-install",
  );
  assert.equal(entry.argumentCount, 5);
  assert.equal(entry.handlerAddress, "0x0c1577fe");
  assert.match(entry.provenBehavior, /MOMT\/control lookup/);
});

test("operation 0x0132 retains its exact OSAG node and flag writes", () => {
  const entry = operation("0x0132");
  assert.equal(entry.semanticId, "actor-osag-node-byte-and-flag-set");
  assert.equal(entry.argumentCount, 1);
  assert.equal(entry.handlerAddress, "0x0c131ab6");
  assert.match(entry.provenBehavior, /old & 0x0f/);
  assert.match(entry.provenBehavior, /mask 0x10/);
});

test("operation 0x00f3 retains its exact eight-slot sound-bank contract", () => {
  const entry = operation("0x00f3");
  assert.equal(entry.semanticId, "native-sound-bank-slot-reconcile");
  assert.equal(entry.argumentCount, 8);
  assert.equal(entry.handlerAddress, "0x0c16b350");
  assert.match(entry.provenBehavior, /null pointer leaves its slot unchanged/);
  assert.match(entry.provenBehavior, /exact literal FREE releases/);
});

test("operation 0x018a retains four exact controller-owner routes", () => {
  const entries = operations("0x018a");
  assert.deepEqual(entries.map(entry => entry.semanticId), [
    "native-operation-018a-primary-initialize",
    "native-operation-018a-secondary-initialize",
    "native-operation-018a-primary-slot-reset",
    "native-operation-018a-primary-slot-conditional-mark",
  ]);
  assert.ok(entries.every(entry => entry.handlerAddress === "0x0c16b150"));
  assert.match(entries[0].provenBehavior, /sixteen 44-byte slots/);
  assert.match(entries[2].provenBehavior, /descending order/);
  assert.match(entries[3].provenBehavior, /offset \+8/);
});
