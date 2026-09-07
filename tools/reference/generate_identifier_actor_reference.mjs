#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";

const actorEvidencePath = "tools/evidence/dialogue-actor-resources.json";
const scheduleCatalogPath = "play/data/shenmue1-schedule-catalog.json";
const reviewedLabelsPath = "docs/reference/reviewed-actor-labels.json";
const descriptorRegistryPath = "docs/reference/project-actor-descriptors.json";
const outputPath = "docs/reference/actor-identities.generated.md";
const check = process.argv.includes("--check");
const read = (path) => fs.readFileSync(path, "utf8");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const actorEvidenceText = read(actorEvidencePath);
const scheduleCatalogText = read(scheduleCatalogPath);
const reviewedLabelsText = read(reviewedLabelsPath);
const descriptorRegistryText = read(descriptorRegistryPath);
const actorEvidence = JSON.parse(actorEvidenceText);
const scheduleCatalog = JSON.parse(scheduleCatalogText);
const reviewedLabelsRegistry = JSON.parse(reviewedLabelsText);
const descriptorRegistry = JSON.parse(descriptorRegistryText);
const records = new Map();

function recordFor(actorCode) {
  if (!records.has(actorCode)) records.set(actorCode, { actorCode, resources: [], programs: [] });
  return records.get(actorCode);
}

for (const resource of actorEvidence.resources) recordFor(resource.actorCode).resources.push(resource);
for (const program of scheduleCatalog.programs) recordFor(program.actorCode).programs.push(program);

const reviewedLabels = new Map();
for (const entry of reviewedLabelsRegistry.entries) {
  if (reviewedLabels.has(entry.actorCode)) {
    throw new Error(`duplicate reviewed label for ${entry.actorCode}`);
  }
  if (entry.labelProvenance !== "project-reviewed"
      || !["high", "medium"].includes(entry.confidence)) {
    throw new Error(`${entry.actorCode} reviewed label must be project-reviewed with high or medium confidence`);
  }
  if (!entry.label?.trim() || !entry.sourceSpeakerLabel?.trim()) {
    throw new Error(`${entry.actorCode} reviewed label or source speaker label is empty`);
  }
  for (const evidencePath of entry.evidence ?? []) {
    if (!fs.existsSync(evidencePath)) {
      throw new Error(`${entry.actorCode} reviewed-label evidence does not exist: ${evidencePath}`);
    }
  }
  reviewedLabels.set(entry.actorCode, entry);
}

const descriptors = new Map();
for (const entry of descriptorRegistry.entries) {
  if (descriptors.has(entry.actorCode)) {
    throw new Error(`duplicate project descriptor for ${entry.actorCode}`);
  }
  if (entry.descriptorProvenance !== "project-generated") {
    throw new Error(`${entry.actorCode} descriptor must be marked project-generated`);
  }
  if (!entry.projectDescriptor?.trim()) {
    throw new Error(`${entry.actorCode} has an empty project descriptor`);
  }
  for (const evidencePath of entry.evidence ?? []) {
    if (!fs.existsSync(evidencePath)) {
      throw new Error(`${entry.actorCode} descriptor evidence does not exist: ${evidencePath}`);
    }
  }
  descriptors.set(entry.actorCode, entry);
}

const sortedUnique = (values) => [...new Set(values.filter((value) => (
  value !== null && value !== undefined && value !== ""
)))].sort();
const display = (values) => values.length
  ? values.map((value) => `\`${value}\``).join(", ")
  : "—";
const rows = [];
let resolvedCount = 0;
let unresolvedCount = 0;

for (const record of [...records.values()].sort((a, b) => a.actorCode.localeCompare(b.actorCode))) {
  const resourceLabels = sortedUnique(record.resources.map(({ actorLabel }) => actorLabel));
  const scheduleLabels = sortedUnique(record.programs.map(({ label }) => label));
  const reviewedLabel = reviewedLabels.get(record.actorCode);
  const allLabels = sortedUnique([
    ...resourceLabels, ...scheduleLabels, reviewedLabel?.label,
  ]);
  if (allLabels.length > 1) {
    throw new Error(`${record.actorCode} has contradictory labels: ${allLabels.join(", ")}`);
  }
  const label = allLabels[0] ?? "unresolved";
  const confidence = resourceLabels.length || scheduleLabels.length
    ? "confirmed"
    : reviewedLabel?.confidence ?? "unresolved";
  const descriptor = descriptors.get(record.actorCode);
  if (descriptor && allLabels.length) {
    throw new Error(`${record.actorCode} has both a confirmed label and a project descriptor`);
  }
  if (allLabels.length) resolvedCount += 1;
  else unresolvedCount += 1;
  const labelEvidence = resourceLabels.length
    ? `actor resources AFS ${record.resources.map(({ afsEntryIndex }) => afsEntryIndex).join(", ")}`
    : scheduleLabels.length
      ? "schedule catalog character mapping"
      : reviewedLabel
        ? `project-reviewed dialogue mapping; extracted speaker label ${reviewedLabel.sourceSpeakerLabel}`
        : "none; do not infer";
  const authoredIdentities = sortedUnique(record.resources.map(({ authoredPersonIdentity }) => authoredPersonIdentity));
  const models = sortedUnique(record.programs.map(({ modelCode }) => modelCode));
  const areas = sortedUnique(record.programs.flatMap(({ selectedAreas = [] }) => selectedAreas));
  const resourceHashes = record.resources.map(({ sha256: hash }) => hash.slice(0, 12));
  rows.push([
    `\`${record.actorCode}\``, label,
    descriptor ? descriptor.projectDescriptor : "—",
    descriptor ? `\`${descriptor.descriptorProvenance}\`` : "—",
    descriptor ? display(descriptor.evidence) : "—",
    display(authoredIdentities), display(models),
    display(areas), String(record.programs.length), String(record.resources.length),
    `${labelEvidence}${resourceHashes.length ? `; payload ${resourceHashes.join(", ")}…` : ""}`,
    `\`${confidence}\``,
  ].join(" | "));
}

for (const actorCode of descriptors.keys()) {
  if (!records.has(actorCode)) {
    throw new Error(`${actorCode} project descriptor has no actor or schedule record`);
  }
}
for (const actorCode of reviewedLabels.keys()) {
  if (!records.has(actorCode)) {
    throw new Error(`${actorCode} reviewed label has no actor or schedule record`);
  }
}

const generated = `# Complete generated actor index

<!-- Generated by node tools/reference/generate_identifier_actor_reference.mjs. Do not edit manually. -->

This index is the exhaustive union of actor codes currently present in
\`${actorEvidencePath}\` and \`${scheduleCatalogPath}\`. It contains
${records.size} actor codes: ${resolvedCount} with one evidence-backed readable
label and ${unresolvedCount} whose readable identity remains \`unresolved\`.
Of those unresolved codes, ${descriptors.size} have a reviewed project-generated
descriptor and ${unresolvedCount - descriptors.size} deliberately retain none.
Absence from this index means absence from both current authoritative inputs,
not proof that the code does not exist elsewhere in the game.

Input SHA-256:

- \`${actorEvidencePath}\`: \`${sha256(actorEvidenceText)}\`
- \`${scheduleCatalogPath}\`: \`${sha256(scheduleCatalogText)}\`
- \`${reviewedLabelsPath}\`: \`${sha256(reviewedLabelsText)}\`
- \`${descriptorRegistryPath}\`: \`${sha256(descriptorRegistryText)}\`

Regenerate with \`node tools/reference/generate_identifier_actor_reference.mjs\`. Validate
freshness without writing by adding \`--check\`.

“Authored identity” is the person identity inside a dialogue resource and may
differ from the resource's actor code. Program count counts distinct extracted
source programs, not physical runtime instances. A dash means that subsystem
has no record for the code. Names sourced from the schedule catalog use its
exact character mapping; this is also the upstream source of the labels shown
for Shenmue I scheduled actors in the \`/play\` debug bar. All runtime-rendered
actor codes have such a label. Additional \`high\`- or \`medium\`-confidence project-reviewed
labels retain the extracted subtitle speaker form that corroborates the mapping;
they are not called \`confirmed\` when the archive lacks the full expansion.
Unknown values outside those sets remain \`unresolved\`.
“Project-generated descriptor” is an explicitly non-canonical
navigation aid for a code proven to represent a generic resource or controller;
it must never be read as an original-data name. A dash means no safe descriptor
is currently supported, not that the abbreviation has been interpreted.

| Actor code | Evidence-backed label | Project-generated descriptor | Descriptor provenance | Descriptor evidence | Authored identity | Model code(s) | Native area(s) | Programs | Dialogue resources | Label evidence | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
${rows.map((row) => `| ${row} |`).join("\n")}
`;

if (check) {
  if (!fs.existsSync(outputPath) || read(outputPath) !== generated) {
    console.error(`${outputPath} is stale; run node tools/reference/generate_identifier_actor_reference.mjs`);
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(outputPath, generated);
  console.log(`Wrote ${outputPath} (${records.size} actor codes)`);
}
