import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const actorEvidencePath = "tools/evidence/dialogue-actor-resources.json";
const schedulePath = "play/data/shenmue1-schedule-catalog.json";
const actorReferencePath = "docs/reference/actor-identities.md";
const reviewedActorLabelsPath = "docs/reference/reviewed-actor-labels.json";
const actorDescriptorPath = "docs/reference/project-actor-descriptors.json";
const areaReferencePath = "docs/reference/areas-and-worlds.md";
const referenceFiles = [
  "docs/reference/README.md",
  actorReferencePath,
  reviewedActorLabelsPath,
  actorDescriptorPath,
  "docs/reference/actor-identities.generated.md",
  areaReferencePath,
  "docs/reference/areas-and-worlds.generated.md",
  "docs/reference/state-banks-and-flags.md",
  "docs/reference/state-banks-and-flags.generated.md",
  "docs/reference/scheduled-actor-concepts.md",
  "docs/reference/scheduled-actor-operations.generated.md",
  "docs/reference/native-operations.md",
  "docs/reference/native-operations.generated.md",
  "docs/reference/narrative-terminology.md",
];
const confidenceVocabulary = new Set([
  "confirmed", "high", "medium", "low", "unresolved",
]);

const read = (path) => fs.readFileSync(path, "utf8");
const actorEvidence = JSON.parse(read(actorEvidencePath));
const schedules = JSON.parse(read(schedulePath));
const reviewedActorLabels = JSON.parse(read(reviewedActorLabelsPath));
const actorDescriptors = JSON.parse(read(actorDescriptorPath));

test("reviewed actor identities agree with generated evidence", () => {
  const expected = new Map([
    ["HRSK", "Nozomi Harasaki"],
    ["YAMA", "Shigeo Yamagishi"],
    ["NGSM", "Tetsuya Nagashima"],
    ["TOM_", "Tom Johnson"],
  ]);
  const resources = new Map(actorEvidence.resources.map((entry) => [
    entry.actorCode, entry.actorLabel,
  ]));
  const scheduleLabels = new Map(schedules.programs.map((program) => [
    program.actorCode, program.label,
  ]));
  const documented = new Map(
    [...read(actorReferencePath).matchAll(/^\| `([A-Z0-9_]{4})` \| ([^|]+) \|/gm)]
      .map((match) => [match[1], match[2].trim()]),
  );

  for (const [actorCode, fullName] of expected) {
    const resolved = resources.get(actorCode) ?? scheduleLabels.get(actorCode);
    assert.equal(resolved, fullName, actorCode);
    assert.equal(documented.get(actorCode), fullName, actorCode);
  }
});

test("reference evidence files exist", () => {
  for (const path of referenceFiles) assert.ok(fs.existsSync(path), path);

  const references = referenceFiles.map(read).join("\n");
  const evidencePaths = [...references.matchAll(/`((?:tools\/evidence|play\/data|public\/data)\/[\w./_-]+\.(?:json|js|csv))`/g)]
    .map((match) => match[1]);
  assert.ok(evidencePaths.length > 10);
  for (const path of new Set(evidencePaths)) assert.ok(fs.existsSync(path), path);
});

test("initial native areas exist in authoritative sources", () => {
  const expected = ["JHD0", "JOMO", "JU00", "JD00", "D000", "MFSY", "MKSG", "MS08", "DGCT"];
  const mapCsv = read("public/data/maps.csv");
  const worlds = read("play/config/worlds.js");
  const areaReference = read(areaReferencePath);
  for (const area of expected) {
    assert.match(mapCsv, new RegExp(`(?:^|;)${area}(?:\\s|;|$)`, "m"), area);
    assert.match(worlds, new RegExp(`nativeArea: ["']${area}["']`), area);
    assert.match(areaReference, new RegExp("\\\\| `" + area + "` \\\\|"), area);
  }
});

test("documented confidence labels use the controlled vocabulary", () => {
  for (const path of referenceFiles) {
    for (const match of read(path).matchAll(/\| `([^`]+)` \|\s*$/gm)) {
      assert.ok(confidenceVocabulary.has(match[1]), `${path}: ${match[1]}`);
    }
  }
});

test("actor reference has no contradictory code-to-name assignments", () => {
  const assignments = new Map();
  for (const match of read(actorReferencePath).matchAll(/^\| `([A-Z0-9_]{4})` \| ([^|]+) \|/gm)) {
    const [, actorCode, rawName] = match;
    const fullName = rawName.trim();
    assert.ok(!assignments.has(actorCode) || assignments.get(actorCode) === fullName,
      `${actorCode}: ${assignments.get(actorCode)} versus ${fullName}`);
    assignments.set(actorCode, fullName);
  }
  assert.equal(assignments.size, 4 + reviewedActorLabels.entries.length);
});

test("complete generated actor index is exhaustive and current", () => {
  const generatedPath = "docs/reference/actor-identities.generated.md";
  const generated = read(generatedPath);
  const generatedCodes = new Set(
    [...generated.matchAll(/^\| `([A-Z0-9_]{4})` \|/gm)]
      .map((match) => match[1]),
  );
  const sourceCodes = new Set([
    ...actorEvidence.resources.map(({ actorCode }) => actorCode),
    ...schedules.programs.map(({ actorCode }) => actorCode),
  ]);
  assert.equal(generatedCodes.size, 289);
  assert.deepEqual([...generatedCodes].sort(), [...sourceCodes].sort());

  const result = spawnSync(
    process.execPath,
    ["tools/reference/generate_identifier_actor_reference.mjs", "--check"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("project actor descriptors are explicit, evidence-backed, and never names", async () => {
  const sourceCodes = new Set([
    ...actorEvidence.resources.map(({ actorCode }) => actorCode),
    ...schedules.programs.map(({ actorCode }) => actorCode),
  ]);
  const confirmedCodes = new Set([
    ...actorEvidence.resources.filter(({ actorLabel }) => actorLabel).map(({ actorCode }) => actorCode),
    ...schedules.programs.filter(({ label }) => label).map(({ actorCode }) => actorCode),
  ]);
  const descriptorCodes = new Set();
  for (const descriptor of actorDescriptors.entries) {
    assert.match(descriptor.actorCode, /^[A-Z0-9_]{4}$/);
    assert.ok(sourceCodes.has(descriptor.actorCode), descriptor.actorCode);
    assert.ok(!confirmedCodes.has(descriptor.actorCode), descriptor.actorCode);
    assert.ok(!descriptorCodes.has(descriptor.actorCode), descriptor.actorCode);
    assert.equal(descriptor.descriptorProvenance, "project-generated");
    assert.ok(descriptor.projectDescriptor.trim());
    assert.ok(descriptor.evidence.length > 0);
    for (const path of descriptor.evidence) assert.ok(fs.existsSync(path), path);
    descriptorCodes.add(descriptor.actorCode);
  }
  assert.equal(descriptorCodes.size, 59);

  const unresolvedCodes = new Set([...sourceCodes].filter((actorCode) => (
    !confirmedCodes.has(actorCode)
    && !reviewedActorLabels.entries.some((entry) => entry.actorCode === actorCode)
  )));
  const deliberatelyUndescribed = [...unresolvedCodes]
    .filter((actorCode) => !descriptorCodes.has(actorCode))
    .sort();
  assert.deepEqual(deliberatelyUndescribed, []);

  const caDescriptors = actorDescriptors.entries.filter(({ actorCode }) => (
    /^CA\d\d$/.test(actorCode)
  ));
  assert.equal(caDescriptors.length, 21);
  for (const descriptor of caDescriptors) {
    assert.equal(descriptor.projectDescriptor, "numbered non-rendered timetable program");
    assert.match(descriptor.notes, /car or traffic role remains unproven/);
    const programs = schedules.programs.filter(({ actorCode }) => (
      actorCode === descriptor.actorCode
    ));
    assert.ok(programs.length > 0, descriptor.actorCode);
    assert.ok(programs.every(({ label, modelCode }) => !label && !modelCode));
  }

  const bus2Descriptor = actorDescriptors.entries.find(({ actorCode }) => (
    actorCode === "BUS2"
  ));
  assert.equal(bus2Descriptor.projectDescriptor, "secondary bus route and schedule controller");
  assert.match(read("tools/evidence/scheduled-actors-capture.json"), /"actorCode": "BUS2"/);
  assert.match(read("tools/evidence/scheduled-actor-interaction-registration-evidence.json"), /"targetCode": "BUSW"/);

  const generated = read("docs/reference/actor-identities.generated.md");
  for (const descriptor of actorDescriptors.entries) {
    const row = generated.split("\n").find((line) => (
      line.startsWith(`| \`${descriptor.actorCode}\` |`)
    ));
    assert.ok(row, descriptor.actorCode);
    assert.ok(row.includes(
      `| unresolved | ${descriptor.projectDescriptor} | \`project-generated\` |`,
    ), row);
    if (descriptor.sourceSpeakerLabel) {
      const messagePath = descriptor.evidence.find((path) => path.includes("/messages/"));
      const messageModule = await import(new URL(`../${messagePath}`, import.meta.url));
      assert.ok(messageModule.NATIVE_DIALOGUE_MESSAGE_RESOURCE.messages.some(({ sourceText }) => (
        sourceText?.startsWith(`${descriptor.sourceSpeakerLabel}「`)
      )), descriptor.actorCode);
    }
  }
});

test("reviewed dialogue labels retain provenance and conservative confidence", async () => {
  const resources = new Map(actorEvidence.resources.map((entry) => [
    entry.actorCode, entry,
  ]));
  const expected = new Map([
    ["HARY", ["Harry Thompson", "ハリー", "high"]],
    ["IZAW", ["Midori Aizawa", "碧", "medium"]],
    ["JONZ", ["Jones Henders", "ジョーンズ", "high"]],
    ["RBRT", ["Robert Wells", "ロバート", "high"]],
    ["SERA", ["Takeshi Sera", "世良", "high"]],
  ]);
  assert.equal(reviewedActorLabels.entries.length, expected.size);
  const generated = read("docs/reference/actor-identities.generated.md");
  for (const entry of reviewedActorLabels.entries) {
    assert.deepEqual(
      [entry.label, entry.sourceSpeakerLabel, entry.confidence],
      expected.get(entry.actorCode),
    );
    assert.equal(entry.labelProvenance, "project-reviewed");
    assert.ok(["high", "medium"].includes(entry.confidence));
    assert.equal(resources.get(entry.actorCode)?.actorLabel, null);
    assert.ok(entry.evidence.length >= 2);
    for (const path of entry.evidence) assert.ok(fs.existsSync(path), path);
    const messagePath = entry.evidence.find((path) => path.includes("/messages/"));
    const messageModule = await import(new URL(`../${messagePath}`, import.meta.url));
    assert.ok(messageModule.NATIVE_DIALOGUE_MESSAGE_RESOURCE.messages.some(({ sourceText }) => (
      sourceText.startsWith(`${entry.sourceSpeakerLabel}「`)
    )), entry.actorCode);
    const row = generated.split("\n").find((line) => (
      line.startsWith(`| \`${entry.actorCode}\` |`)
    ));
    assert.ok(row?.includes(`| ${entry.label} |`), entry.actorCode);
    assert.ok(row?.endsWith(`| \`${entry.confidence}\` |`), row);
  }
});

test("complete generated area index is exhaustive and current", () => {
  const generatedPath = "docs/reference/areas-and-worlds.generated.md";
  const generatedCodes = new Set(
    [...read(generatedPath).matchAll(/^\| `([A-Z0-9]{4})` \|/gm)]
      .map((match) => match[1]),
  );
  const transitions = JSON.parse(read("tools/evidence/map-transition-catalog.json"));
  const sourceCodes = new Set(transitions.maps.map(({ source }) => source.area));
  for (const edge of transitions.exactEdges) {
    sourceCodes.add(edge.source.area);
    sourceCodes.add(edge.destination.area);
  }
  for (const program of schedules.programs) {
    for (const area of program.selectedAreas || []) sourceCodes.add(area);
  }
  for (const line of read("public/data/maps.csv").split(/\r?\n/).slice(1)) {
    const area = line.split(";")[1]?.trim();
    if (/^[A-Z0-9]{4}$/.test(area)) sourceCodes.add(area);
  }
  assert.ok(generatedCodes.size > 100);
  for (const area of sourceCodes) assert.ok(generatedCodes.has(area), area);

  const result = spawnSync(
    process.execPath,
    ["tools/reference/generate_identifier_area_reference.mjs", "--check"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("complete generated persistent-state index covers every bank entry and is current", () => {
  const generated = read("docs/reference/state-banks-and-flags.generated.md");
  const entries = [...generated.matchAll(/^\| ([234]) \| (\d+) \|/gm)]
    .map((match) => `${match[1]}:${match[2]}`);
  assert.equal(entries.length, 1120);
  assert.equal(new Set(entries).size, entries.length);
  for (const [bank, capacity] of [[2, 1024], [3, 64], [4, 32]]) {
    for (let index = 0; index < capacity; index += 1) {
      assert.ok(entries.includes(`${bank}:${index}`), `${bank}:${index}`);
    }
  }

  const result = spawnSync(
    process.execPath,
    ["tools/reference/generate_identifier_state_reference.mjs", "--check"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("generated operation indexes cover their authoritative registries and are current", () => {
  const scheduled = JSON.parse(read("tools/evidence/scheduled-actor-operation-coverage.json"));
  const native = JSON.parse(read("tools/evidence/native-operation-semantics.json"));
  const scheduledDoc = read("docs/reference/scheduled-actor-operations.generated.md");
  const nativeDoc = read("docs/reference/native-operations.generated.md");
  const scheduledCodes = [...scheduledDoc.matchAll(/^\| `(0x[0-9a-f]+)` \|/gm)].map((match) => match[1]);
  const nativeCodes = [...nativeDoc.matchAll(/^\| `(0x[0-9a-f]+)` \|/gm)].map((match) => match[1]);
  assert.deepEqual(scheduledCodes, scheduled.operationFamilies
    .sort((a, b) => a.operation - b.operation).map(({ operationHex }) => operationHex));
  assert.deepEqual(nativeCodes, native.operations
    .sort((a, b) => a.operationId - b.operationId).map(({ operationHex }) => operationHex));
  for (const operation of native.operations) {
    for (const source of operation.sources) assert.ok(fs.existsSync(source), source);
  }

  const result = spawnSync(
    process.execPath,
    ["tools/reference/generate_identifier_operation_references.mjs", "--check"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("narrative glossary covers the adaptation contract without duplicate terms", () => {
  const glossary = read("docs/reference/narrative-terminology.md");
  const terms = [...glossary.matchAll(/^\| (?!---)(?:`)?([^|`]+?)(?:`)? \|/gm)]
    .map((match) => match[1].trim())
    .filter((term) => !["Term", "Classification"].includes(term));
  assert.equal(new Set(terms).size, terms.length);
  for (const required of [
    "Original story date",
    "Public MMO calendar",
    "Personal narrative phase",
    "Canonical order",
    "Proven mechanical prerequisite",
    "Optional clue route",
    "Convergence milestone",
    "Shared NPC",
    "Personal dialogue",
    "Presentation overlay",
    "Private instance",
    "Party instance",
    "Evidence confidence",
    "Narrative identity",
    "Event token",
    "Recovery path",
  ]) assert.ok(terms.includes(required), required);
  assert.match(glossary, /Canonical order is not automatically a proven mechanical prerequisite/);
});
