function requireArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} is required`);
  return value;
}

function operationActions(program) {
  return requireArray(program?.functions, "native program functions")
    .flatMap(fn => requireArray(fn.blocks, `native function ${fn.id} blocks`)
      .flatMap(block => requireArray(block.actions, `native block ${block.id} actions`)
        .map(action => ({ functionId: fn.id, blockId: block.id, ...action }))));
}

function unresolvedOperations(program) {
  return operationActions(program).filter(action => (
    action.kind === "engineOperation" && action.adapterStatus !== "proven"
  )).map(action => Object.freeze({
    functionId: action.functionId,
    blockId: action.blockId,
    callFileOffset: action.callFileOffset,
    operationHex: action.operationHex,
    arguments: action.arguments,
    knownOperationFamilies: action.knownOperationFamilies || [],
  }));
}

function exactDirectCallSlots(program, helperFunction) {
  const owner = program.functions.find(fn => fn.id === program.entryFunction);
  if (!owner) throw new Error(`native program ${program.id} has no owner entry function`);
  return owner.blocks.flatMap(block => block.actions).filter(action => (
    action.kind === "directCall" && action.targetFileOffset === helperFunction
  )).map((action) => {
    const argument = action.arguments?.[0];
    if (argument?.kind !== "constant" || !Number.isInteger(argument.value)) {
      throw new Error(`native owner call ${action.callFileOffset} has no exact slot`);
    }
    return Object.freeze({
      slot: argument.value,
      callFileOffset: action.callFileOffset,
      helperFunction,
    });
  });
}

function exactBindings(program) {
  return requireArray(
    program.operation013eStaticBindings,
    `native program ${program.id} operation-0x013e bindings`,
  ).map(binding => Object.freeze({
    slot: binding.slot,
    primaryPointer: binding.primaryPointer,
    secondaryPointer: binding.secondaryPointer,
    callFileOffsets: binding.callFileOffsets,
  }));
}

function activityBinding(activity) {
  return `${activity.slot}:${activity.primaryPointer}:${activity.secondaryPointer}`;
}

export function auditCanonicalOwnerProgram({
  programPack,
  activityManifest,
  expectedOwnerCalls,
  programId,
  helperFunction,
} = {}) {
  const program = requireArray(programPack?.programs, "native program pack programs")
    .find(candidate => candidate.id === programId);
  if (!program) throw new Error(`canonical owner program ${programId} is unavailable`);
  if (activityManifest?.schema !== "new-yokosuka-aseq-activity-pack-v1") {
    throw new Error(`canonical owner program ${programId} has no activity pack`);
  }
  const bindings = exactBindings(program);
  const activities = requireArray(activityManifest.activities, "activity pack activities");
  const activityBindings = new Set(activities.map(activityBinding));
  const missingBindings = bindings.filter(binding => !activityBindings.has(
    `${binding.slot}:${binding.primaryPointer}:${binding.secondaryPointer}`,
  ));
  const calls = exactDirectCallSlots(program, helperFunction);
  const missingCallSlots = calls.filter(call => !bindings.some(
    binding => binding.slot === call.slot,
  ));
  const callOrderMatchesCanonicalEvidence = JSON.stringify(
    calls.map(({ slot, callFileOffset }) => ({ slot, callFileOffset })),
  ) === JSON.stringify(requireArray(expectedOwnerCalls, "canonical owner calls"));
  const unresolved = unresolvedOperations(program);
  const blockers = [
    ...(missingBindings.length > 0 ? ["activity-bindings-missing"] : []),
    ...(missingCallSlots.length > 0 ? ["owner-call-slots-missing"] : []),
    ...(!callOrderMatchesCanonicalEvidence ? ["owner-call-order-mismatch"] : []),
    ...(unresolved.length > 0 ? ["owner-operations-unresolved"] : []),
  ];
  return Object.freeze({
    program: Object.freeze({
      id: program.id,
      disc: program.disc,
      area: program.area,
      mapinfoSha256: program.mapinfoSha256,
      entryFunction: program.entryFunction,
      helperFunction,
    }),
    bindings: Object.freeze(bindings),
    ownerCalls: Object.freeze(calls),
    callOrderMatchesCanonicalEvidence,
    unresolvedOperations: Object.freeze(unresolved),
    blockers: Object.freeze(blockers),
    cutoverReady: blockers.length === 0,
  });
}

function integerSetMatches(values, expectedValues) {
  if (!Array.isArray(values) || values.some(value => !Number.isInteger(value))) {
    return false;
  }
  const unique = [...new Set(values)].sort((left, right) => left - right);
  const expected = [...new Set(expectedValues)].sort((left, right) => left - right);
  return JSON.stringify(unique) === JSON.stringify(expected);
}

function compiledProgramBlockers(program) {
  const blockers = requireArray(program?.compile?.blockers, "compiled program blockers");
  const unresolvedCalls = blockers.reduce(
    (count, blocker) => count + (blocker.callFileOffsets?.length || 0),
    0,
  );
  return Object.freeze({
    status: program.compile.status,
    firstBlocker: program.compile.firstBlocker || null,
    unresolvedOperationTypeCount: blockers.length,
    unresolvedOperationCallCount: unresolvedCalls,
  });
}

const LEGACY_PLAYLIST_PATTERNS = Object.freeze([
  Object.freeze({ id: "playlist-runtime", expression: /NativeAseqPlaylistRuntime/ }),
  Object.freeze({ id: "playlist-schema", expression: /new-yokosuka-aseq-playlist-v1/ }),
  Object.freeze({ id: "playlist-kind", expression: /kind\s*:\s*["']playlist["']/ }),
  Object.freeze({ id: "playlist-timeline", expression: /op00-opening-timeline/ }),
  Object.freeze({ id: "combined-authpack", expression: /OP00_A0114\.authpack/ }),
]);

export function auditLegacyPlaylistSurface(files = []) {
  const references = [];
  for (const file of requireArray(files, "production source files")) {
    if (typeof file?.path !== "string" || typeof file?.contents !== "string") {
      throw new TypeError("production source file path and contents are required");
    }
    for (const pattern of LEGACY_PLAYLIST_PATTERNS) {
      if (pattern.expression.test(file.contents)) {
        references.push(Object.freeze({ path: file.path, kind: pattern.id }));
      }
    }
  }
  return Object.freeze({
    references: Object.freeze(references),
    complete: references.length === 0,
  });
}

/**
 * Audits the generated owner artifact that will replace the final playlist.
 * This deliberately consumes the compiler output, rather than rediscovering
 * the owner in a second inventory path. A structurally complete owner may
 * still be blocked on shared operation semantics or independent AUTH assets.
 */
export function auditCompiledOwnerProgram({
  compiledProgram,
  expected,
  activityManifest,
} = {}) {
  if (compiledProgram?.schema !== "new-yokosuka-native-cutscene-program-v1") {
    throw new Error("canonical compiled cutscene program is unavailable");
  }
  const expectedSlots = requireArray(expected?.slots, "expected AUTH slots");
  const selection = compiledProgram.authResourceSelection;
  if (!selection || typeof selection !== "object") {
    throw new Error(`compiled cutscene program ${compiledProgram.id} has no AUTH selection`);
  }
  const ownerCalls = requireArray(selection.ownerCalls, "compiled owner AUTH calls");
  const selectedSlots = requireArray(selection.selectedSlots, "compiled owner AUTH slots");
  const resourceHashes = ownerCalls.map(call => call.resource?.sha256).filter(Boolean);
  const identityMatches = compiledProgram.id === expected.id
    && compiledProgram.area === expected.area
    && compiledProgram.entryFunction === expected.entryFunction;
  const authoredFamilyMatches = selection.authoredPathToken === expected.authoredPathToken;
  const slotsMatch = integerSetMatches(selectedSlots, expectedSlots)
    && integerSetMatches(ownerCalls.map(call => call.slot), expectedSlots)
    && ownerCalls.length === expectedSlots.length;
  const resourcesAreExact = resourceHashes.length === ownerCalls.length
    && ownerCalls.every(call => (
      Number.isInteger(call.resource?.byteLength)
      && call.resource.byteLength > 0
      && /^0x[0-9a-f]+$/i.test(call.resource.sourceFileOffset || "")
    ));
  const completionBoundaryMatches = selection.completionBoundary?.slot
    === expected.completionBoundarySlot;
  const compiler = compiledProgramBlockers(compiledProgram);
  const activities = Array.isArray(activityManifest?.activities)
    ? activityManifest.activities
    : [];
  const activityBySlot = new Map(activities.map(activity => [activity.slot, activity]));
  const independentlyPackaged = activityManifest?.schema
    === "new-yokosuka-aseq-activity-pack-v1"
    && activities.length === expectedSlots.length
    && integerSetMatches(activities.map(activity => activity.slot), expectedSlots)
    && new Set(activities.map(activity => activity.asset?.path)).size === activities.length
    && ownerCalls.every(call => {
      const activity = activityBySlot.get(call.slot);
      return activity?.binding?.kind === "map-embedded-slot"
        && activity.sha256 === call.resource?.sha256
        && activity.byteLength === call.resource?.byteLength
        && activity.asset?.sha256 === call.resource?.sha256
        && activity.asset?.byteLength === call.resource?.byteLength;
    });
  const blockers = [
    ...(!identityMatches ? ["canonical-owner-identity-mismatch"] : []),
    ...(!authoredFamilyMatches ? ["authored-resource-family-mismatch"] : []),
    ...(!slotsMatch ? ["owner-auth-call-closure-incomplete"] : []),
    ...(!resourcesAreExact ? ["owner-auth-resource-provenance-incomplete"] : []),
    ...(!completionBoundaryMatches ? ["owner-completion-boundary-mismatch"] : []),
    ...(compiler.status !== "compiled" ? ["owner-operations-unresolved"] : []),
    ...(!independentlyPackaged ? ["activities-not-independently-packaged"] : []),
  ];
  return Object.freeze({
    program: Object.freeze({
      id: compiledProgram.id,
      disc: compiledProgram.disc,
      area: compiledProgram.area,
      mapinfoSha256: compiledProgram.mapinfoSha256,
      entryFunction: compiledProgram.entryFunction,
      schema: compiledProgram.schema,
    }),
    identityMatches,
    authoredResourceSelection: Object.freeze({
      kind: selection.selectionKind,
      pathToken: selection.authoredPathToken,
      selectedSlots: Object.freeze([...selectedSlots]),
      ownerCallCount: ownerCalls.length,
      exactResourceCount: resourceHashes.length,
      resourcesAreExact,
      completionBoundarySlot: selection.completionBoundary?.slot ?? null,
    }),
    compiler,
    activityTransport: Object.freeze({
      schema: activityManifest?.schema || null,
      activityCount: activities.length,
      independentlyPackaged,
    }),
    blockers: Object.freeze(blockers),
    cutoverReady: blockers.length === 0,
  });
}
