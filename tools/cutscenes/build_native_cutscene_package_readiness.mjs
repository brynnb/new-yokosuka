#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = relativePath => JSON.parse(readFileSync(path.join(root, relativePath)));
const digest = relativePath => createHash("sha256")
  .update(readFileSync(path.join(root, relativePath)))
  .digest("hex");
const hex = value => `0x${value.toString(16)}`;

const packageDescriptors = Object.freeze([
  { resourceName: "A0114", manifestKey: "op00", embeddedArea: "OP00" },
  { resourceName: "DRAUTH", manifestKey: "drauth" },
  { resourceName: "YQ14", manifestKey: "yq14" },
  { resourceName: "YBHN", manifestKey: "ybhn" },
  {
    resourceName: "DJHN",
    manifestKey: "djhn",
    selectedResourcePattern: /^DJHN_\d+$/i,
  },
  { resourceName: "D0W0", manifestKey: "d0w0" },
  {
    resourceName: "DNOZ",
    manifestKey: "dnoz",
    // The JD00 owner opens DNOZ.PKS and installs its two authored AUTH
    // members in archive order. The playable DNOZ package is sourced from
    // the dedicated map's distinct loose files, so pointer identity cannot
    // (and must not) be used to claim these archive payloads are packaged.
    archiveMemberBySlot: Object.freeze({
      0: "SEQDATA2.AUTH",
      1: "SEQDATA3.AUTH",
    }),
  },
  {
    resourceName: "EVSN",
    manifestKey: "evsn",
    archiveMemberBySlot: Object.freeze({
      0: "SEQDATA1.AUTH",
      1: "SEQDATA2.AUTH",
      2: "SEQDATA3.AUTH",
      3: "SEQDATA4.AUTH",
    }),
  },
  {
    resourceName: "CATA1",
    manifestKey: "cata1",
    productionBlocker: "native-realtime-interstitial-and-scene-object-FIXO-attachment-runtime-unimplemented",
  },
  { resourceName: "JHW0", manifestKey: "jhw0" },
  { resourceName: "MSKA", manifestKey: "mska" },
  {
    resourceName: "KAKG",
    manifestKey: "kakg",
    archiveMemberBySlot: Object.freeze({
      0: "SEQDATK0.AUTH",
      1: "SEQDATK1.AUTH",
    }),
    dispositionBySlot: Object.freeze({
      0: "native-owner-resident-object-staging-not-standalone-cutscene",
      1: "native-owner-resident-object-staging-not-standalone-cutscene",
    }),
  },
  { resourceName: "HIHY", manifestKey: "hihy" },
  { resourceName: "BUSS", manifestKey: "buss" },
  {
    resourceName: "SAKR",
    manifestKey: "sakr",
    archiveMemberBySlot: Object.freeze({ 0: "SEQDATA0.AUTH" }),
  },
  {
    resourceName: "BEBF",
    manifestKey: "bebf",
    archiveMemberBySlot: Object.freeze({
      60: "SEQDATA0.AUTH",
      61: "SEQDATA1.AUTH",
      62: "SEQDATA2.AUTH",
      63: "SEQDATA3.AUTH",
    }),
  },
  {
    resourceName: "TGMA",
    manifestKey: "tgma",
    archiveMemberBySlot: Object.freeze({ 0: "SEQDATA4.AUTH" }),
  },
  ...["MPM1", "MPM2"].map(resourceName => ({
    resourceName,
    archiveMemberBySlot: Object.freeze({ 0: "SEQDATA3.AUTH" }),
    dispositionBySlot: Object.freeze({
      0: "support-map-presentation-not-standalone-cutscene",
    }),
  })),
]);

const paths = Object.freeze({
  inventory: "tools/evidence/shenmue1-scripted-scene-inventory.json",
  programs: "play/data/events/nativeEventPrograms.generated.json",
  routes: "tools/data/native-event-program-routes.json",
  audio: "tools/evidence/d000-auth-audio-banks.json",
  op00: "play/assets/introduction/op00/manifest.json",
  drauth: "play/assets/dobuita/drauth/manifest.json",
  yq14: "play/assets/dobuita/yq14/manifest.json",
  yq14Audio: "public/audio/world/yq14/manifest.json",
  ybhn: "play/assets/dobuita/ybhn/manifest.json",
  ybhnAudio: "public/audio/world/ybhn/manifest.json",
  ybhnLifecycle: "tools/evidence/ybhn-native-lifecycle.json",
  djhn: "play/assets/dobuita/djhn/manifest.json",
  djhnAudio: "public/audio/world/djhn/manifest.json",
  djhnLifecycle: "tools/evidence/djhn-native-lifecycle.json",
  d0w0: "play/assets/dobuita/d0w0/manifest.json",
  d0w0Audio: "public/audio/world/d0w0/manifest.json",
  d0w0Lifecycle: "tools/evidence/d0w0-native-lifecycle.json",
  dnoz: "play/assets/sakuragaoka/dnoz/manifest.json",
  dnozAudio: "public/audio/world/dnoz/manifest.json",
  dnozLifecycle: "tools/evidence/dnoz-native-lifecycle.json",
  evsn: "play/assets/sakuragaoka/evsn/manifest.json",
  evsnAudio: "public/audio/world/evsn/manifest.json",
  evsnLifecycle: "tools/evidence/evsn-native-lifecycle.json",
  cata1: "play/assets/yamanose/cata1/manifest.json",
  cata1Audio: "public/audio/world/cata1/manifest.json",
  cata1Lifecycle: "tools/evidence/cata1-native-lifecycle.json",
  jhw0: "play/assets/hazuki/jhw0/manifest.json",
  jhw0Audio: "public/audio/world/jhw0/manifest.json",
  jhw0Lifecycle: "tools/evidence/jhw0-native-lifecycle.json",
  mska: "play/assets/hazuki/mska/manifest.json",
  mskaAudio: "public/audio/world/mska/manifest.json",
  mskaLifecycle: "tools/evidence/mska-native-lifecycle.json",
  kakg: "play/assets/hazuki/kakg/manifest.json",
  kakgFukuAudio: "public/audio/world/kakg-fuku/manifest.json",
  kakgIneAudio: "public/audio/world/kakg-ine/manifest.json",
  kakgLifecycle: "tools/evidence/kakg-native-lifecycle.json",
  hihy: "play/assets/hazuki/hihy/manifest.json",
  hihyAudio: "public/audio/world/hihy/manifest.json",
  hihyLifecycle: "tools/evidence/hihy-native-lifecycle.json",
  buss: "play/assets/dobuita/buss/manifest.json",
  bussAudio: "public/audio/world/buss/manifest.json",
  bussLifecycle: "tools/evidence/buss-native-lifecycle.json",
  bebf: "play/assets/hazuki/bebf/manifest.json",
  bebfAudio: "public/audio/world/bebf/manifest.json",
  bebfLifecycle: "tools/evidence/bebf-native-lifecycle.json",
  sakr: "play/assets/yd01/sakr/manifest.json",
  sakrAudio: "public/audio/world/sakr/manifest.json",
  sakrLifecycle: "tools/evidence/sakr-native-lifecycle.json",
  tgmaLifecycle: "tools/evidence/tgma-native-lifecycle.json",
  tgma: "play/assets/hazuki/tgma/manifest.json",
  tgmaAudio: "public/audio/world/tgma/manifest.json",
});
const inventory = readJson(paths.inventory);
const programPack = readJson(paths.programs);
const routePack = readJson(paths.routes);
const routeById = new Map(routePack.routes.map(route => [route.id, route]));
const audioAudit = readJson(paths.audio);
const packageManifests = new Map(packageDescriptors
  .filter(descriptor => descriptor.manifestKey)
  .map(descriptor => [
    descriptor.resourceName,
    readJson(paths[descriptor.manifestKey]),
  ]));

const payloadByHash = new Map(inventory.authPayloads.map(value => [value.sha256, value]));
const authByIdentity = new Map(inventory.authResources.map(value => [
  `${value.disc}:${value.area}:${value.sourcePath.split("/").at(-1)?.replace(/\.PKS$/i, "")}`
    + `:${value.archiveMember?.toUpperCase()}`,
  value,
]));
const verifiedAudio = new Set(audioAudit.mappings.map(value => value.family));
const unresolvedAudio = new Set(audioAudit.unresolvedFamilies);
const packagedActivities = new Map([...packageManifests].map(([
  resourceName,
  manifest,
]) => [resourceName, new Map(manifest.activities.map(value => [
  `${value.slot}:${value.primaryPointer}:${value.secondaryPointer}`,
  value,
]))]));
const packagedEmbeddedActivities = new Map([...packageManifests].map(([
  resourceName,
  manifest,
]) => [resourceName, new Map(manifest.activities
  .filter(value => value.binding?.kind === "map-embedded-slot")
  .map(value => [value.slot, value]))]));

function canonicalResourceName(selectedResourceName) {
  return packageDescriptors.find(descriptor => (
    descriptor.resourceName === selectedResourceName
    || descriptor.selectedResourcePattern?.test(selectedResourceName)
  ))?.resourceName || selectedResourceName;
}

function cstring(bytes, offset) {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  return bytes.subarray(offset, end).toString("ascii");
}

function blockers(resourceName, actorTags, packaged, disposition) {
  if (disposition) return [disposition];
  if (packaged) return [];
  const result = [];
  if (unresolvedAudio.has(resourceName)) result.push("native-audio-bank-link-unresolved");
  if (actorTags.includes("BIN_") && !packaged) {
    result.push("archive-local-BIN_-scene-object-binding-unpackaged");
  }
  if (resourceName === "AUTH") result.push("owned-by-specialized-phone-book-control-timeline");
  if (result.length === 0) result.push("complete-player-facing-owner-and-dependencies-unreviewed");
  return result;
}

const reviewedBindings = [];
for (const program of programPack.programs) {
  const reviewedRoute = routeById.get(program.id);
  const embeddedOwnerCalls = program.authResourceSelection?.ownerCalls || [];
  // Preview programs are playback wrappers over reviewed source owners. They do
  // not establish new AUTH ownership and must not be counted as package evidence.
  if (!reviewedRoute && embeddedOwnerCalls.length === 0) continue;
  const mapPath = `extracted_files/data/SCENE/0${program.disc}/${program.area}/MAPINFO.BIN`;
  const map = readFileSync(path.join(root, mapPath));
  const reviewedOffsets = reviewedRoute?.activityBindingCallOffsets;
  for (const binding of program.operation013eStaticBindings || []) {
    if (
      reviewedOffsets
      && !binding.callFileOffsets.some(offset => reviewedOffsets.includes(offset))
    ) continue;
    const primaryResource = cstring(map, binding.primaryPointer);
    const secondaryResource = cstring(map, binding.secondaryPointer);
    const selectedResourceName = secondaryResource || primaryResource;
    const resourceName = canonicalResourceName(selectedResourceName);
    const packageDescriptor = packageDescriptors.find(
      descriptor => descriptor.resourceName === resourceName,
    );
    const key = `${binding.slot}:${binding.primaryPointer}:${binding.secondaryPointer}`;
    const packagedActivity = packagedActivities.get(resourceName)?.get(key);
    const member = primaryResource.toLowerCase().endsWith(".bin")
      ? primaryResource.replace(/\.bin$/i, ".AUTH").toUpperCase()
      : packagedActivity?.archiveMember
        || packageDescriptor?.archiveMemberBySlot?.[binding.slot];
    if (!member) {
      throw new Error(`${program.id} ${resourceName} has no exact AUTH member selection`);
    }
    const resource = authByIdentity.get(`${program.disc}:${program.area}:${resourceName}:${member}`);
    if (!resource) {
      throw new Error(
        `${program.id} ${resourceName}/${member} has no exact AUTH inventory resource`,
      );
    }
    const payload = payloadByHash.get(resource.payloadSha256);
    if (!payload || payload.parseStatus !== "complete") {
      throw new Error(`${resource.id} has no complete AUTH payload`);
    }
    const packaged = Boolean(packagedActivity);
    const productionBlocker = packageDescriptor?.productionBlocker || null;
    const production = packaged && !productionBlocker;
    const soundCount = (payload.commandCounts?.sound || 0) + (payload.commandCounts?.voice || 0);
    reviewedBindings.push({
      programId: program.id,
      callFileOffsets: binding.callFileOffsets,
      nativeBinding: {
        slot: binding.slot,
        primaryPointer: hex(binding.primaryPointer),
        secondaryPointer: hex(binding.secondaryPointer),
        primaryResource,
        ...(selectedResourceName !== resourceName ? { selectedResourceName } : {}),
        resourceName,
      },
      authResource: {
        id: resource.id,
        archiveMember: resource.archiveMember,
        byteLength: resource.byteLength,
        sha256: resource.payloadSha256,
        durationFrames: payload.durationFrames,
        actorTags: payload.actorTags,
        motionBanks: payload.motionBanks,
        commandCounts: payload.commandCounts,
      },
      gates: {
        ownerBinding: "evidence-proven",
        authPayload: "parsed",
        motion: packaged ? "packaged-and-verified" : "resolved-sequences-not-yet-packaged",
        audio: packaged
          ? "packaged-and-verified"
          : soundCount === 0
          ? "not-applicable"
          : verifiedAudio.has(resourceName)
            ? "native-bank-link-verified"
            : unresolvedAudio.has(resourceName)
              ? "native-bank-link-unresolved"
              : "unreviewed",
        package: production
          ? "registered-and-runtime-tested"
          : packaged
            ? "packaged-not-registered"
            : "not-registered",
      },
      availability: production ? "production" : "research-only",
      blockers: blockers(
        resourceName,
        payload.actorTags,
        packaged,
        productionBlocker || packageDescriptor?.dispositionBySlot?.[binding.slot],
      ),
    });
  }

  const embeddedDescriptor = packageDescriptors.find(
    descriptor => descriptor.embeddedArea === program.area,
  );
  for (const ownerCall of embeddedOwnerCalls) {
    if (!embeddedDescriptor) {
      throw new Error(`${program.id} has no embedded activity package descriptor`);
    }
    const resourceName = embeddedDescriptor.resourceName;
    const packagedActivity = packagedEmbeddedActivities
      .get(resourceName)?.get(ownerCall.slot);
    if (!packagedActivity) {
      throw new Error(`${program.id} embedded slot ${ownerCall.slot} is not packaged`);
    }
    const resource = inventory.authResources.find(value => (
      value.disc === program.disc
      && value.area === program.area
      && value.sourcePath.endsWith("/MAPINFO.BIN")
      && value.payloadSha256 === ownerCall.resource.sha256
    ));
    const payload = payloadByHash.get(ownerCall.resource.sha256);
    if (
      !resource
      || !payload
      || payload.parseStatus !== "complete"
      || packagedActivity.byteLength !== ownerCall.resource.byteLength
      || packagedActivity.sha256 !== ownerCall.resource.sha256
    ) {
      throw new Error(`${program.id} embedded slot ${ownerCall.slot} identity changed`);
    }
    reviewedBindings.push({
      programId: program.id,
      callFileOffsets: [ownerCall.callFileOffset],
      nativeBinding: {
        kind: "map-embedded-slot",
        slot: ownerCall.slot,
        activityId: packagedActivity.activityId,
        resourceName,
      },
      authResource: {
        id: resource.id,
        archiveMember: packagedActivity.archiveMember,
        byteLength: resource.byteLength,
        sha256: resource.payloadSha256,
        durationFrames: payload.durationFrames,
        actorTags: payload.actorTags,
        motionBanks: payload.motionBanks,
        commandCounts: payload.commandCounts,
      },
      gates: {
        ownerBinding: "evidence-proven",
        authPayload: "parsed",
        motion: "packaged-and-verified",
        audio: "packaged-and-verified",
        package: "registered-and-runtime-tested",
      },
      availability: "production",
      blockers: [],
    });
  }
}

const uniqueBindings = [...new Map(reviewedBindings.map(value => [
  `${value.nativeBinding.resourceName}:${value.nativeBinding.slot}:`
    + `${value.nativeBinding.primaryPointer}:${value.nativeBinding.secondaryPointer}`,
  value,
])).values()];
uniqueBindings.sort((left, right) => (
  left.programId.localeCompare(right.programId)
  || left.nativeBinding.slot - right.nativeBinding.slot
));
const report = {
  schema: "new-yokosuka-native-cutscene-package-readiness-v2",
  generatedBy: "tools/cutscenes/build_native_cutscene_package_readiness.mjs",
  generatedFrom: Object.fromEntries(
    Object.entries(paths).map(([name, sourcePath]) => [name, {
      path: sourcePath,
      sha256: digest(sourcePath),
    }]),
  ),
  evidenceBoundary: [
    "Only exact operation-0x013e installs and compiled map-embedded AUTH owner calls retained by reviewed native programs are promoted here.",
    "A parsed AUTH payload is not called a cutscene and is not production-available by itself.",
    "Production requires the complete owner, exact dependencies, a registered package, runtime tests, and fail-closed cleanup.",
    "Canonical byte-identical motion assets may be referenced by hash; they are not copied into each scene package.",
  ],
  corpus: {
    mapinfoCount: inventory.summary.mapinfoProgramCount,
    logicalAuthResourceCount: inventory.summary.authResourceCount,
    uniqueAuthPayloadCount: inventory.summary.uniqueAuthPayloadCount,
  },
  summary: {
    reviewedBindingCount: uniqueBindings.length,
    productionBindingCount: uniqueBindings.filter(value => value.availability === "production").length,
    researchOnlyBindingCount: uniqueBindings.filter(value => value.availability === "research-only").length,
  },
  blockerClusters: Object.entries(uniqueBindings.reduce((counts, binding) => {
    for (const blocker of binding.blockers) {
      counts[blocker] = (counts[blocker] || 0) + 1;
    }
    return counts;
  }, {})).map(([blocker, bindingCount]) => ({ blocker, bindingCount }))
    .sort((left, right) => (
      right.bindingCount - left.bindingCount
      || left.blocker.localeCompare(right.blocker)
    )),
  reviewedBindings: uniqueBindings,
};

const output = path.join(root, "tools/evidence/native-cutscene-package-readiness.json");
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${output}: ${report.summary.productionBindingCount}/${report.summary.reviewedBindingCount} exact bindings production-ready`,
);
