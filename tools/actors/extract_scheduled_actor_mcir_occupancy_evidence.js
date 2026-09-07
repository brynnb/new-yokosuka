#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  extractScheduledPrograms,
} from "../lib/scheduled_actor_extractor.js";

const inventoryPath = path.resolve(
  process.argv[2]
    || "tools/evidence/scheduled-actor-capture-inventory.json",
);
const sourceManifestPath = path.resolve(
  process.argv[3] || "tools/evidence/scheduled-actors.json",
);
const outputPath = path.resolve(
  process.argv[4]
    || "tools/evidence/scheduled-actor-mcir-occupancy-evidence.json",
);

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const source = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const MCIR_SIGNATURE = Buffer.from("ISU_0.25", "ascii");

function graphShape(graph) {
  return [
    graph.directoryCount,
    graph.rootCount,
    graph.groupCount,
    graph.leafCount,
    graph.declaredPointCount,
  ].join(":");
}

function runtimeGraphShape(data, offset) {
  return Array.from(
    { length: 5 },
    (_, index) => data.readUInt32LE(offset + 8 + index * 4),
  ).join(":");
}

function runtimeGraphOffsets(data, base) {
  const directoryCount = data.readUInt32LE(base + 8);
  const rootCount = data.readUInt32LE(base + 12);
  const groupCount = data.readUInt32LE(base + 16);
  const leafCount = data.readUInt32LE(base + 20);
  const rootArray = base + 28 + directoryCount * 8;
  const groupArray = rootArray + rootCount * 32;
  const leafArray = groupArray + groupCount * 32;
  if (
    directoryCount > 0x100
    || rootCount > 0x1000
    || groupCount > 0x10000
    || leafCount > 0x10000
    || leafArray + leafCount * 36 > data.length
  ) return null;
  return {
    directoryCount,
    rootCount,
    groupCount,
    leafCount,
    rootArray,
    groupArray,
    leafArray,
  };
}

function leafOwners(graph) {
  const result = new Map();
  for (const root of graph.roots) {
    for (const group of root.groups || []) {
      for (const leaf of group.leaves || []) {
        const existing = result.get(leaf.leafIndex);
        if (existing && existing.targetCode !== root.targetCode) {
          throw new Error(
            `${graph.linkedRouteTableId} leaf ${leaf.leafIndex} belongs to `
            + `both ${existing.targetCode} and ${root.targetCode}`,
          );
        }
        result.set(leaf.leafIndex, {
          targetCode: root.targetCode,
          leaf,
        });
      }
    }
  }
  return result;
}

function rootLeavesByTarget(graph) {
  const result = new Map();
  for (const root of graph.roots) {
    if (result.has(root.targetCode)) {
      throw new Error(
        `${graph.linkedRouteTableId} has duplicate root ${root.targetCode}`,
      );
    }
    result.set(
      root.targetCode,
      root.groups.flatMap((group) => group.leaves || []),
    );
  }
  return result;
}

function pointerBytes(pointer) {
  const result = Buffer.alloc(4);
  result.writeUInt32LE(pointer >>> 0);
  return result;
}

function occurrences(data, bytes) {
  const result = [];
  let cursor = -1;
  while ((cursor = data.indexOf(bytes, cursor + 1)) !== -1) {
    result.push(cursor);
  }
  return result;
}

function runtimeOperation16Owners(data) {
  const programsByActor = new Map();
  for (const program of extractScheduledPrograms(data).filter(
    (candidate) => candidate.scheduleTables.length > 0,
  )) {
    if (!programsByActor.has(program.actorCode)) {
      programsByActor.set(program.actorCode, []);
    }
    programsByActor.get(program.actorCode).push(program);
  }
  const cache = new Map();
  return (actorCode, targetCode) => {
    const key = `${actorCode}:${targetCode}`;
    if (cache.has(key)) return cache.get(key);
    const candidates = [];
    for (const program of programsByActor.get(actorCode) || []) {
      const programHeader = Number.parseInt(program.programHeader, 16);
      // Native actor records point four bytes before PRG1. The reviewed
      // captures use the 0x0c cached alias, so compare physical offsets.
      const ownerPointer = ((programHeader & 0x0fffffff) - 4) >>> 0;
      const actorOffsets = occurrences(data, pointerBytes(ownerPointer))
        .filter((offset) => offset + 0x1dc <= data.length);
      for (const actorOffset of actorOffsets) {
        if (data.readUInt16LE(actorOffset + 4) !== 0x16) continue;
        const nextOperationOffset = (
          data.readUInt32LE(actorOffset + 0x64) & 0x00ffffff
        );
        for (const table of program.scheduleTables) {
          for (const entry of table.entries) {
            for (const operation of entry.descriptor.operations) {
              if (
                operation.operation !== 0x16
                || operation.targetCode !== targetCode
              ) continue;
              const operationOffset = (
                Number.parseInt(operation.address, 16) & 0x00ffffff
              );
              if (
                operationOffset + operation.byteLength
                !== nextOperationOffset
              ) continue;
              candidates.push({
                actorCode,
                targetCode,
                actorRecordAddress:
                  `0x${(0x8c000000 + actorOffset).toString(16)}`,
                currentOperationField: 0x16,
                nextOperationPointer:
                  `0x${data.readUInt32LE(actorOffset + 0x64).toString(16)}`,
                programHeader: program.programHeader,
                programByteSha256: program.byteSha256,
                normalizedProgramByteSha256:
                  program.sourceNormalizedByteSha256,
                scheduleTable: table.scheduleTable,
                journeyStartSecond: entry.startSecond,
                operationAddress: operation.address,
                operationOffsetFromProgramHeader: (
                  operationOffset
                  - (programHeader & 0x00ffffff)
                ),
                activationSecond: operation.activationSecond,
                minimumDelaySeconds: operation.minimumDelaySeconds,
              });
            }
          }
        }
      }
    }
    cache.set(key, candidates);
    return candidates;
  };
}

const graphByShape = new Map();
const graphState = new Map();
for (const graph of source.linkedRouteTables) {
  const shape = graphShape(graph);
  if (graphByShape.has(shape)) {
    throw new Error(`MCIR graph shape is not unique: ${shape}`);
  }
  graphByShape.set(shape, graph);
  graphState.set(graph.linkedRouteTableId, {
    graph,
    owners: leafOwners(graph),
    rootLeavesByTarget: rootLeavesByTarget(graph),
    runtimeObservationCount: 0,
    captureHashes: new Set(),
    bindings: new Map(),
    occupancyCohorts: new Map(),
    activeOperationBindings: new Map(),
    activeOperationProgramBindings: new Map(),
  });
}

const uniqueCaptures = new Map();
for (const capture of inventory.captures) {
  if (!uniqueCaptures.has(capture.sha256)) {
    uniqueCaptures.set(capture.sha256, capture);
  }
}

let occupiedLeafObservationCount = 0;
let capturesWithMcir = 0;
let runtimeGraphObservationCount = 0;
let exactActiveOperation16OwnerObservationCount = 0;
let ambiguousActiveOperation16OwnerObservationCount = 0;
let unmatchedActiveOperation16OwnerObservationCount = 0;
let exactFinalReselectionObservationCount = 0;
let unmatchedFinalReselectionObservationCount = 0;
for (const capture of uniqueCaptures.values()) {
  const data = fs.readFileSync(capture.path);
  const operation16Owners = runtimeOperation16Owners(data);
  let cursor = -1;
  let captureHasMcir = false;
  while ((cursor = data.indexOf(MCIR_SIGNATURE, cursor + 1)) !== -1) {
    if (cursor + 28 > data.length) continue;
    const graph = graphByShape.get(runtimeGraphShape(data, cursor));
    if (!graph) continue;
    const offsets = runtimeGraphOffsets(data, cursor);
    if (!offsets) continue;
    const state = graphState.get(graph.linkedRouteTableId);
    state.runtimeObservationCount += 1;
    state.captureHashes.add(capture.sha256);
    runtimeGraphObservationCount += 1;
    captureHasMcir = true;
    const cohortKey = [
      capture.scheduledProgramSetSha256 || "unidentified",
      capture.likelyDisc ?? "unknown-disc",
      capture.likelyArea || "unknown-area",
    ].join(":");
    let cohort = state.occupancyCohorts.get(cohortKey);
    if (!cohort) {
      cohort = {
        scheduledProgramSetSha256:
          capture.scheduledProgramSetSha256 || null,
        likelyDisc: capture.likelyDisc ?? null,
        likelyArea: capture.likelyArea || null,
        captureHashes: new Set(),
        sourceProgramHashesByActor: new Map(),
        bindings: new Map(),
      };
      state.occupancyCohorts.set(cohortKey, cohort);
    }
    cohort.captureHashes.add(capture.sha256);
    for (const program of capture.scheduledPrograms || []) {
      if (!program.sourceNormalizedByteSha256) continue;
      let hashes = cohort.sourceProgramHashesByActor.get(program.actorCode);
      if (!hashes) {
        hashes = new Set();
        cohort.sourceProgramHashesByActor.set(program.actorCode, hashes);
      }
      hashes.add(program.sourceNormalizedByteSha256);
    }

    for (let leafIndex = 0; leafIndex < offsets.leafCount; leafIndex++) {
      const leafOffset = offsets.leafArray + leafIndex * 36;
      const occupantValue = data.readUInt32LE(leafOffset + 16);
      if (occupantValue === 0) continue;
      const occupantActorCode = data.subarray(
        leafOffset + 16,
        leafOffset + 20,
      ).toString("ascii");
      if (!/^[A-Z0-9_]{4}$/.test(occupantActorCode)) continue;
      const owner = state.owners.get(leafIndex);
      if (!owner) {
        throw new Error(
          `${graph.linkedRouteTableId} runtime leaf ${leafIndex} has no root`,
        );
      }
      const runtimePosition = [
        data.readFloatLE(leafOffset),
        data.readFloatLE(leafOffset + 4),
        data.readFloatLE(leafOffset + 8),
      ];
      if (!runtimePosition.every(
        (value, axis) => value === owner.leaf.runtimePosition[axis],
      )) {
        throw new Error(
          `${graph.linkedRouteTableId} runtime leaf ${leafIndex} does not `
          + "match its offline position",
        );
      }

      const bindingKey = `${owner.targetCode}:${occupantActorCode}`;
      const activeOwnerCandidates = operation16Owners(
        occupantActorCode,
        owner.targetCode,
      );
      const activeOwner = activeOwnerCandidates.length === 1
        ? activeOwnerCandidates[0]
        : null;
      let finalReselection = null;
      if (activeOwner) {
        exactActiveOperation16OwnerObservationCount += 1;
        const rootLeaves = state.rootLeavesByTarget.get(owner.targetCode);
        const claimedLeaves = rootLeaves.filter((candidate) => {
          const candidateOffset = (
            offsets.leafArray + candidate.leafIndex * 36
          );
          return data.subarray(
            candidateOffset + 16,
            candidateOffset + 20,
          ).toString("ascii") === occupantActorCode;
        });
        const claimedLeafIndices = new Set(
          claimedLeaves.map((candidate) => candidate.leafIndex),
        );
        const reselectedLeaf = claimedLeaves.length > 0
          && rootLeaves.find((candidate) => {
          const candidateOffset = (
            offsets.leafArray + candidate.leafIndex * 36
          );
          return (
            claimedLeafIndices.has(candidate.leafIndex)
            || data.readUInt32LE(candidateOffset + 16) === 0
          );
        });
        if (claimedLeafIndices.has(leafIndex) && reselectedLeaf) {
          finalReselection = {
            clearedLeafIndices: [...claimedLeafIndices].sort(
              (left, right) => left - right,
            ),
            reselectedLeafIndex: reselectedLeaf.leafIndex,
            reselectedLeaf,
          };
          exactFinalReselectionObservationCount += 1;
        } else {
          unmatchedFinalReselectionObservationCount += 1;
        }
      } else if (activeOwnerCandidates.length > 1) {
        ambiguousActiveOperation16OwnerObservationCount += 1;
      } else {
        unmatchedActiveOperation16OwnerObservationCount += 1;
      }
      let binding = state.bindings.get(bindingKey);
      if (!binding) {
        binding = {
          targetCode: owner.targetCode,
          occupantActorCode,
          observationsByLeaf: new Map(),
        };
        state.bindings.set(bindingKey, binding);
      }
      let leafObservation = binding.observationsByLeaf.get(leafIndex);
      if (!leafObservation) {
        leafObservation = {
          leafIndex,
          observationCount: 0,
          captureHashes: new Set(),
          representativeCapturePaths: new Set(),
          leaf: owner.leaf,
        };
        binding.observationsByLeaf.set(leafIndex, leafObservation);
      }
      leafObservation.observationCount += 1;
      leafObservation.captureHashes.add(capture.sha256);
      if (activeOwner) {
        if (!leafObservation.activeOperation16Owners) {
          leafObservation.activeOperation16Owners = new Map();
        }
        const activeOwnerKey = [
          activeOwner.normalizedProgramByteSha256,
          activeOwner.scheduleTable,
          activeOwner.operationAddress,
          finalReselection?.reselectedLeafIndex ?? "unmatched",
        ].join(":");
        let activeObservation = leafObservation.activeOperation16Owners.get(
          activeOwnerKey,
        );
        if (!activeObservation) {
          activeObservation = {
            ...activeOwner,
            ...(finalReselection ? {
              finalReselectedLeafIndex:
                finalReselection.reselectedLeafIndex,
            } : {}),
            observationCount: 0,
            captureHashes: new Set(),
          };
          leafObservation.activeOperation16Owners.set(
            activeOwnerKey,
            activeObservation,
          );
        }
        activeObservation.observationCount += 1;
        activeObservation.captureHashes.add(capture.sha256);
      }
      if (leafObservation.representativeCapturePaths.size < 3) {
        leafObservation.representativeCapturePaths.add(capture.path);
      }

      let cohortBinding = cohort.bindings.get(bindingKey);
      if (!cohortBinding) {
        cohortBinding = {
          targetCode: owner.targetCode,
          occupantActorCode,
          observationsByLeaf: new Map(),
        };
        cohort.bindings.set(bindingKey, cohortBinding);
      }
      let cohortLeaf = cohortBinding.observationsByLeaf.get(leafIndex);
      if (!cohortLeaf) {
        cohortLeaf = {
          leafIndex,
          observationCount: 0,
          captureHashes: new Set(),
          leaf: owner.leaf,
        };
        cohortBinding.observationsByLeaf.set(leafIndex, cohortLeaf);
      }
      cohortLeaf.observationCount += 1;
      cohortLeaf.captureHashes.add(capture.sha256);
      if (activeOwner) {
        const activeBindingKey = [
          capture.likelyArea || "unknown-area",
          owner.targetCode,
          occupantActorCode,
          activeOwner.normalizedProgramByteSha256,
          activeOwner.operationOffsetFromProgramHeader,
        ].join(":");
        let activeBinding = state.activeOperationProgramBindings.get(
          activeBindingKey,
        );
        if (!activeBinding) {
          activeBinding = {
            likelyArea: capture.likelyArea || null,
            likelyDiscs: new Set(),
            targetCode: owner.targetCode,
            occupantActorCode,
            normalizedProgramByteSha256:
              activeOwner.normalizedProgramByteSha256,
            programByteSha256s: new Set(),
            programHeaders: new Set(),
            scheduleTables: new Set(),
            operationAddresses: new Set(),
            operationOffsetFromProgramHeader:
              activeOwner.operationOffsetFromProgramHeader,
            observationsByLeaf: new Map(),
            finalReselectionsByLeaf: new Map(),
          };
          state.activeOperationProgramBindings.set(
            activeBindingKey,
            activeBinding,
          );
        }
        if (capture.likelyDisc !== null) {
          activeBinding.likelyDiscs.add(capture.likelyDisc);
        }
        activeBinding.programByteSha256s.add(activeOwner.programByteSha256);
        activeBinding.programHeaders.add(activeOwner.programHeader);
        activeBinding.scheduleTables.add(activeOwner.scheduleTable);
        activeBinding.operationAddresses.add(activeOwner.operationAddress);
        let activeLeaf = activeBinding.observationsByLeaf.get(leafIndex);
        if (!activeLeaf) {
          activeLeaf = {
            leafIndex,
            observationCount: 0,
            captureHashes: new Set(),
            leaf: owner.leaf,
          };
          activeBinding.observationsByLeaf.set(leafIndex, activeLeaf);
        }
        activeLeaf.observationCount += 1;
        activeLeaf.captureHashes.add(capture.sha256);
        if (finalReselection) {
          let finalLeaf = activeBinding.finalReselectionsByLeaf.get(
            finalReselection.reselectedLeafIndex,
          );
          if (!finalLeaf) {
            finalLeaf = {
              leafIndex: finalReselection.reselectedLeafIndex,
              observationCount: 0,
              captureHashes: new Set(),
              leaf: finalReselection.reselectedLeaf,
            };
            activeBinding.finalReselectionsByLeaf.set(
              finalReselection.reselectedLeafIndex,
              finalLeaf,
            );
          }
          finalLeaf.observationCount += 1;
          finalLeaf.captureHashes.add(capture.sha256);
        }

        const globalActiveBindingKey = [
          owner.targetCode,
          occupantActorCode,
          activeOwner.normalizedProgramByteSha256,
          activeOwner.operationOffsetFromProgramHeader,
        ].join(":");
        let globalActiveBinding = state.activeOperationBindings.get(
          globalActiveBindingKey,
        );
        if (!globalActiveBinding) {
          globalActiveBinding = {
            targetCode: owner.targetCode,
            occupantActorCode,
            normalizedProgramByteSha256:
              activeOwner.normalizedProgramByteSha256,
            operationOffsetFromProgramHeader:
              activeOwner.operationOffsetFromProgramHeader,
            likelyAreas: new Set(),
            programByteSha256s: new Set(),
            operationAddresses: new Set(),
            observationsByLeaf: new Map(),
            finalReselectionsByLeaf: new Map(),
          };
          state.activeOperationBindings.set(
            globalActiveBindingKey,
            globalActiveBinding,
          );
        }
        if (capture.likelyArea) {
          globalActiveBinding.likelyAreas.add(capture.likelyArea);
        }
        globalActiveBinding.programByteSha256s.add(
          activeOwner.programByteSha256,
        );
        globalActiveBinding.operationAddresses.add(
          activeOwner.operationAddress,
        );
        let globalActiveLeaf = globalActiveBinding.observationsByLeaf.get(
          leafIndex,
        );
        if (!globalActiveLeaf) {
          globalActiveLeaf = {
            leafIndex,
            observationCount: 0,
            captureHashes: new Set(),
            leaf: owner.leaf,
          };
          globalActiveBinding.observationsByLeaf.set(
            leafIndex,
            globalActiveLeaf,
          );
        }
        globalActiveLeaf.observationCount += 1;
        globalActiveLeaf.captureHashes.add(capture.sha256);
        if (finalReselection) {
          let globalFinalLeaf = globalActiveBinding.finalReselectionsByLeaf.get(
            finalReselection.reselectedLeafIndex,
          );
          if (!globalFinalLeaf) {
            globalFinalLeaf = {
              leafIndex: finalReselection.reselectedLeafIndex,
              observationCount: 0,
              captureHashes: new Set(),
              leaf: finalReselection.reselectedLeaf,
            };
            globalActiveBinding.finalReselectionsByLeaf.set(
              finalReselection.reselectedLeafIndex,
              globalFinalLeaf,
            );
          }
          globalFinalLeaf.observationCount += 1;
          globalFinalLeaf.captureHashes.add(capture.sha256);
        }
      }
      occupiedLeafObservationCount += 1;
    }
  }
  if (captureHasMcir) capturesWithMcir += 1;
}

function serializedLeafObservations(observationsByLeaf) {
  return [...observationsByLeaf.values()]
    .sort((left, right) => left.leafIndex - right.leafIndex)
    .map((observation) => ({
      leafIndex: observation.leafIndex,
      observationCount: observation.observationCount,
      captureHashCount: observation.captureHashes.size,
      captureHashes: [...observation.captureHashes].sort(),
      ...(observation.representativeCapturePaths ? {
        representativeCapturePaths: [
          ...observation.representativeCapturePaths,
        ].sort(),
      } : {}),
      ...(observation.leaf ? {
        runtimePosition: observation.leaf.runtimePosition,
        browserPosition: observation.leaf.browserPosition,
        secondRouteFileOffset: observation.leaf.secondRoute?.fileOffset
          || null,
        secondRouteEndpoint:
          observation.leaf.secondRoute?.browserPoints?.at(-1) || null,
      } : {}),
      ...(observation.activeOperation16Owners ? {
        activeOperation16Owners: [
          ...observation.activeOperation16Owners.values(),
        ].map((owner) => ({
          ...owner,
          captureHashCount: owner.captureHashes.size,
          captureHashes: [...owner.captureHashes].sort(),
        })).sort((left, right) => (
          left.normalizedProgramByteSha256.localeCompare(
            right.normalizedProgramByteSha256,
          )
          || left.scheduleTable.localeCompare(right.scheduleTable)
          || left.operationAddress.localeCompare(right.operationAddress)
        )),
      } : {}),
    }));
}

function serializedBinding(binding) {
  const leafObservations = serializedLeafObservations(
    binding.observationsByLeaf,
  );
  const finalReselectionObservations = binding.finalReselectionsByLeaf
    ? serializedLeafObservations(binding.finalReselectionsByLeaf)
    : null;
  return {
    targetCode: binding.targetCode,
    occupantActorCode: binding.occupantActorCode,
    observedLeafCount: leafObservations.length,
    deterministicObservedLeaf: leafObservations.length === 1,
    leafObservations,
    ...(finalReselectionObservations ? {
      finalReselectedLeafCount: finalReselectionObservations.length,
      deterministicFinalReselectedLeaf:
        finalReselectionObservations.length === 1,
      finalReselectionObservations,
    } : {}),
  };
}

function areaProgramVariantBindings(state) {
  const bindings = new Map();
  for (const [cohortKey, cohort] of state.occupancyCohorts) {
    if (!cohort.likelyArea) continue;
    for (const cohortBinding of cohort.bindings.values()) {
      const sourceHashes = cohort.sourceProgramHashesByActor.get(
        cohortBinding.occupantActorCode,
      );
      // Runtime leaves contain only the four-byte actor code. A cohort with
      // two resident source programs for that code cannot identify which
      // source variant owns the leaf, so preserve it as cohort-only evidence.
      if (sourceHashes?.size !== 1) continue;
      const [normalizedProgramByteSha256] = sourceHashes;
      const key = [
        cohort.likelyArea,
        cohortBinding.targetCode,
        cohortBinding.occupantActorCode,
        normalizedProgramByteSha256,
      ].join(":");
      let binding = bindings.get(key);
      if (!binding) {
        binding = {
          likelyArea: cohort.likelyArea,
          likelyDiscs: new Set(),
          targetCode: cohortBinding.targetCode,
          occupantActorCode: cohortBinding.occupantActorCode,
          normalizedProgramByteSha256,
          scheduledProgramSetSha256s: new Set(),
          cohortKeys: new Set(),
          observationsByLeaf: new Map(),
        };
        bindings.set(key, binding);
      }
      if (cohort.likelyDisc !== null) {
        binding.likelyDiscs.add(cohort.likelyDisc);
      }
      if (cohort.scheduledProgramSetSha256) {
        binding.scheduledProgramSetSha256s.add(
          cohort.scheduledProgramSetSha256,
        );
      }
      binding.cohortKeys.add(cohortKey);
      for (const observation of cohortBinding.observationsByLeaf.values()) {
        let combined = binding.observationsByLeaf.get(observation.leafIndex);
        if (!combined) {
          combined = {
            leafIndex: observation.leafIndex,
            observationCount: 0,
            captureHashes: new Set(),
            leaf: observation.leaf,
          };
          binding.observationsByLeaf.set(observation.leafIndex, combined);
        }
        combined.observationCount += observation.observationCount;
        for (const hash of observation.captureHashes) {
          combined.captureHashes.add(hash);
        }
      }
    }
  }
  return [...bindings.values()].map((binding) => ({
    likelyArea: binding.likelyArea,
    likelyDiscs: [...binding.likelyDiscs].sort((left, right) => left - right),
    normalizedProgramByteSha256: binding.normalizedProgramByteSha256,
    scheduledProgramSetSha256s: [
      ...binding.scheduledProgramSetSha256s,
    ].sort(),
    cohortCount: binding.cohortKeys.size,
    ...serializedBinding(binding),
  })).sort((left, right) => (
    left.likelyArea.localeCompare(right.likelyArea)
    || left.targetCode.localeCompare(right.targetCode)
    || left.occupantActorCode.localeCompare(right.occupantActorCode)
    || left.normalizedProgramByteSha256.localeCompare(
      right.normalizedProgramByteSha256,
    )
  ));
}

const graphs = [...graphState.values()].map((state) => {
  const occupancyCohorts = [...state.occupancyCohorts.values()].map(
    (cohort) => ({
    scheduledProgramSetSha256: cohort.scheduledProgramSetSha256,
    likelyDisc: cohort.likelyDisc,
    likelyArea: cohort.likelyArea,
    captureHashCount: cohort.captureHashes.size,
    captureHashes: [...cohort.captureHashes].sort(),
    sourceProgramVariants: [...cohort.sourceProgramHashesByActor]
      .map(([actorCode, hashes]) => ({
        actorCode,
        normalizedProgramByteSha256s: [...hashes].sort(),
      }))
      .sort((left, right) => left.actorCode.localeCompare(right.actorCode)),
    bindings: [...cohort.bindings.values()].map(serializedBinding)
      .sort((left, right) => (
        left.targetCode.localeCompare(right.targetCode)
        || left.occupantActorCode.localeCompare(right.occupantActorCode)
      )),
  })).sort((left, right) => (
    (left.scheduledProgramSetSha256 || "")
      .localeCompare(right.scheduledProgramSetSha256 || "")
    || (left.likelyDisc ?? 0) - (right.likelyDisc ?? 0)
    || (left.likelyArea || "").localeCompare(right.likelyArea || "")
  ));
  return {
    linkedRouteTableId: state.graph.linkedRouteTableId,
    sourceFileSha256: state.graph.sourceFileSha256,
    rootCount: state.graph.rootCount,
    groupCount: state.graph.groupCount,
    leafCount: state.graph.leafCount,
    runtimeObservationCount: state.runtimeObservationCount,
    captureHashCount: state.captureHashes.size,
    bindings: [...state.bindings.values()].map(serializedBinding)
      .sort((left, right) => (
        left.targetCode.localeCompare(right.targetCode)
        || left.occupantActorCode.localeCompare(right.occupantActorCode)
      )),
    occupancyCohorts,
    areaProgramVariantBindings: areaProgramVariantBindings(state),
    activeOperationBindings: [
      ...state.activeOperationBindings.values(),
    ].map((binding) => ({
      normalizedProgramByteSha256:
        binding.normalizedProgramByteSha256,
      operationOffsetFromProgramHeader:
        binding.operationOffsetFromProgramHeader,
      likelyAreas: [...binding.likelyAreas].sort(),
      programByteSha256s: [...binding.programByteSha256s].sort(),
      operationAddresses: [...binding.operationAddresses].sort(),
      ...serializedBinding(binding),
    })).sort((left, right) => (
      left.targetCode.localeCompare(right.targetCode)
      || left.occupantActorCode.localeCompare(right.occupantActorCode)
      || left.normalizedProgramByteSha256.localeCompare(
        right.normalizedProgramByteSha256,
      )
      || left.operationOffsetFromProgramHeader
        - right.operationOffsetFromProgramHeader
    )),
    activeOperationProgramBindings: [
      ...state.activeOperationProgramBindings.values(),
    ].map((binding) => ({
      likelyArea: binding.likelyArea,
      likelyDiscs: [...binding.likelyDiscs].sort(
        (left, right) => left - right,
      ),
      normalizedProgramByteSha256:
        binding.normalizedProgramByteSha256,
      programByteSha256s: [...binding.programByteSha256s].sort(),
      programHeaders: [...binding.programHeaders].sort(),
      scheduleTables: [...binding.scheduleTables].sort(),
      operationAddresses: [...binding.operationAddresses].sort(),
      operationOffsetFromProgramHeader:
        binding.operationOffsetFromProgramHeader,
      ...serializedBinding(binding),
    })).sort((left, right) => (
      (left.likelyArea || "").localeCompare(right.likelyArea || "")
      || left.targetCode.localeCompare(right.targetCode)
      || left.occupantActorCode.localeCompare(right.occupantActorCode)
      || left.normalizedProgramByteSha256.localeCompare(
        right.normalizedProgramByteSha256,
      )
      || left.operationOffsetFromProgramHeader
        - right.operationOffsetFromProgramHeader
    )),
  };
});

const bindings = graphs.flatMap((graph) => graph.bindings);
const cohortBindings = graphs.flatMap(
  (graph) => graph.occupancyCohorts.flatMap((cohort) => cohort.bindings),
);
const areaVariantBindings = graphs.flatMap(
  (graph) => graph.areaProgramVariantBindings,
);
const activeOperationVariantBindings = graphs.flatMap(
  (graph) => graph.activeOperationProgramBindings,
);
const activeOperationBindings = graphs.flatMap(
  (graph) => graph.activeOperationBindings,
);
const report = {
  schema: "new-yokosuka-scheduled-actor-mcir-occupancy-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), sourceManifestPath),
  ],
  evidenceBoundary: (
    "Each unique RAM capture is scanned structurally for an ISU_0.25 graph "
    + "whose complete header shape matches one exact offline MCIR table. "
    + "Runtime leaf +0x10 stores the occupying actor code. Offline graph "
    + "ownership independently maps every serialized leaf to exactly one "
    + "target root, and runtime/offline leaf positions must match exactly. "
    + "A deterministic observed leaf proves captures agree for that "
    + "actor/target pair. Residency cohorts separately group captures by "
    + "the exact resident scheduled-program set and inferred disc/area, so "
    + "population- and map-residency-dependent allocation changes remain "
    + "explicit. Area/program-variant bindings are emitted only when the "
    + "occupant actor code maps to exactly one normalized source program in "
    + "every supporting cohort, then merge only the same inferred map and "
    + "source hash. Exact active-operation bindings additionally require a "
    + "runtime actor record whose current-operation field is 0x16 and whose "
    + "saved next-operation pointer equals the end of the exact extracted "
    + "operation targeting that occupied root; source normalized hash and "
    + "operation offset therefore remain part of the identity. Captures prove "
    + "waiting-state allocations, while the executable proves that the final "
    + "handler clears and reselects the first free leaf when the gate opens. "
    + "The report applies that clear/reselect rule to each captured population "
    + "and preserves the waiting and reselected leaves separately. It does "
    + "not claim that a population stayed unchanged until an unobserved gate "
    + "opening, or that unobserved story states agree."
  ),
  handlerEvidence: {
    descriptorDispatcherAddress: "0x0c119444",
    operation16TimeGateAddress: "0x0c11a952",
    operation16InitializationAddress: "0x0c126cca",
    operation16PositionAddress: "0x0c126ec2",
    rootLookupAddress: "0x0c127302",
    occupiedLeafLookupAddress: "0x0c12743c",
    freeLeafLookupAddress: "0x0c12733a",
    groupPredicateAddress: "0x0c1274a4",
    groupPredicateResult: 1,
    freeLeafSelectionRule:
      "first unoccupied leaf in serialized root/group/leaf order",
    initializationRule:
      "while the operation-0x16 time gate is waiting, claim the first free "
      + "leaf by writing the actor code at leaf +0x10",
    positionRule:
      "when the time gate opens, clear every occupancy for this actor under "
      + "the target root, reselect the first free leaf, and use that leaf's "
      + "second-route endpoint",
    actorCurrentOperationOffset: "0x04",
    actorNextOperationPointerOffset: "0x64",
    leafOccupantCodeOffset: "0x10",
    leafStrideBytes: 36,
  },
  summary: {
    inventoryCaptureCount: inventory.captures.length,
    uniqueCaptureHashCount: uniqueCaptures.size,
    uniqueCapturesWithMcirCount: capturesWithMcir,
    runtimeGraphObservationCount,
    occupiedLeafObservationCount,
    distinctActorTargetBindingCount: bindings.length,
    deterministicObservedLeafBindingCount: bindings.filter(
      (binding) => binding.deterministicObservedLeaf,
    ).length,
    multiLeafObservedBindingCount: bindings.filter(
      (binding) => !binding.deterministicObservedLeaf,
    ).length,
    occupancyCohortCount: graphs.reduce(
      (total, graph) => total + graph.occupancyCohorts.length,
      0,
    ),
    cohortBindingCount: cohortBindings.length,
    deterministicCohortBindingCount: cohortBindings.filter(
      (binding) => binding.deterministicObservedLeaf,
    ).length,
    multiLeafCohortBindingCount: cohortBindings.filter(
      (binding) => !binding.deterministicObservedLeaf,
    ).length,
    areaProgramVariantBindingCount: areaVariantBindings.length,
    deterministicAreaProgramVariantBindingCount: areaVariantBindings.filter(
      (binding) => binding.deterministicObservedLeaf,
    ).length,
    multiLeafAreaProgramVariantBindingCount: areaVariantBindings.filter(
      (binding) => !binding.deterministicObservedLeaf,
    ).length,
    exactActiveOperation16OwnerObservationCount,
    ambiguousActiveOperation16OwnerObservationCount,
    unmatchedActiveOperation16OwnerObservationCount,
    exactFinalReselectionObservationCount,
    unmatchedFinalReselectionObservationCount,
    activeOperationProgramBindingCount:
      activeOperationVariantBindings.length,
    deterministicActiveOperationProgramBindingCount:
      activeOperationVariantBindings.filter(
        (binding) => binding.deterministicObservedLeaf,
      ).length,
    multiLeafActiveOperationProgramBindingCount:
      activeOperationVariantBindings.filter(
        (binding) => !binding.deterministicObservedLeaf,
      ).length,
    deterministicFinalReselectionProgramBindingCount:
      activeOperationVariantBindings.filter(
        (binding) => binding.deterministicFinalReselectedLeaf,
      ).length,
    multiLeafFinalReselectionProgramBindingCount:
      activeOperationVariantBindings.filter(
        (binding) => !binding.deterministicFinalReselectedLeaf,
      ).length,
    activeOperationBindingCount: activeOperationBindings.length,
    deterministicActiveOperationBindingCount: activeOperationBindings.filter(
      (binding) => binding.deterministicObservedLeaf,
    ).length,
    multiLeafActiveOperationBindingCount: activeOperationBindings.filter(
      (binding) => !binding.deterministicObservedLeaf,
    ).length,
    deterministicFinalReselectionBindingCount:
      activeOperationBindings.filter(
        (binding) => binding.deterministicFinalReselectedLeaf,
      ).length,
    multiLeafFinalReselectionBindingCount:
      activeOperationBindings.filter(
        (binding) => !binding.deterministicFinalReselectedLeaf,
      ).length,
  },
  graphs,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${occupiedLeafObservationCount} occupied-leaf `
  + `observations, ${bindings.length} actor/target bindings, `
  + `${report.summary.deterministicObservedLeafBindingCount} deterministic.`,
);
