function asciiWord(data, offset) {
  const value = data.subarray(offset, offset + 4).toString("ascii");
  return /^[\x20-\x7e]{4}$/.test(value) ? value : null;
}

function finiteVector(data, offset) {
  const result = [
    data.readFloatLE(offset),
    data.readFloatLE(offset + 4),
    data.readFloatLE(offset + 8),
  ];
  return result.every(Number.isFinite) ? result : null;
}

function browserVector(runtime) {
  return runtime && [-runtime[0], runtime[1], runtime[2]];
}

function floatVectorWordHex(vector) {
  if (!vector) return null;
  const bytes = Buffer.alloc(12);
  vector.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes.toString("hex");
}

function hexOffset(value) {
  return `0x${value.toString(16)}`;
}

export function mobjResourceOffset(data, resourceCode) {
  if (data.subarray(0, 4).toString("ascii") !== "MOBJ") return null;
  const count = data.readUInt32LE(4);
  if (count > 0x1000 || 8 + count * 8 > data.length) return null;
  for (let index = 0; index < count; index++) {
    const cursor = 8 + index * 8;
    if (data.subarray(cursor, cursor + 4).toString("ascii") === resourceCode) {
      const offset = data.readUInt32LE(cursor + 4);
      return offset < data.length ? offset : null;
    }
  }
  return null;
}

export function extractMcirLinkedRoutes(data) {
  const base = mobjResourceOffset(data, "MCIR");
  if (base === null || base + 28 > data.length) return null;
  const magic = data.subarray(base, base + 4).toString("ascii");
  const version = data.subarray(base + 4, base + 8).toString("ascii");
  if (magic !== "ISU_" || version !== "0.25") return null;

  const directoryCount = data.readUInt32LE(base + 8);
  const rootCount = data.readUInt32LE(base + 12);
  const groupCount = data.readUInt32LE(base + 16);
  const leafCount = data.readUInt32LE(base + 20);
  const declaredPointCount = data.readUInt32LE(base + 24);
  const rootArray = base + 28 + directoryCount * 8;
  const groupArray = rootArray + rootCount * 32;
  const leafArray = groupArray + groupCount * 32;
  const pointArray = leafArray + leafCount * 36;
  if (
    directoryCount > 0x100
    || rootCount > 0x1000
    || groupCount > 0x10000
    || leafCount > 0x10000
    || pointArray > data.length
  ) return null;

  const pointsAt = (rawPointer, count) => {
    const offset = base + rawPointer;
    if (
      count < 0
      || count > 0x10000
      || offset < pointArray
      || offset + count * 12 > data.length
    ) return null;
    const runtimePoints = Array.from(
      { length: count },
      (_, index) => finiteVector(data, offset + index * 12),
    );
    if (runtimePoints.some((point) => point === null)) return null;
    return {
      rawPointer: hexOffset(rawPointer),
      fileOffset: hexOffset(offset),
      runtimePoints,
      browserPoints: runtimePoints.map(browserVector),
    };
  };

  const leaves = Array.from({ length: leafCount }, (_, index) => {
    const cursor = leafArray + index * 36;
    const runtimePosition = finiteVector(data, cursor);
    const firstPointCount = data.readUInt32LE(cursor + 20);
    const secondPointCount = data.readUInt32LE(cursor + 28);
    return {
      leafIndex: index,
      fileOffset: hexOffset(cursor),
      runtimePosition,
      browserPosition: browserVector(runtimePosition),
      transformControlWord: data.readUInt32LE(cursor + 12),
      initialOccupantCode: asciiWord(data, cursor + 16),
      firstRoute: pointsAt(
        data.readUInt32LE(cursor + 24),
        firstPointCount,
      ),
      secondRoute: pointsAt(
        data.readUInt32LE(cursor + 32),
        secondPointCount,
      ),
    };
  });

  const groups = Array.from({ length: groupCount }, (_, index) => {
    const cursor = groupArray + index * 32;
    const firstWord = data.readUInt32LE(cursor);
    const leafSubsetCount = data.readUInt32LE(cursor + 24);
    const rawLeafPointer = data.readUInt32LE(cursor + 28);
    const firstLeafIndex = (base + rawLeafPointer - leafArray) / 36;
    const subsetIsOwned = (
      Number.isInteger(firstLeafIndex)
      && firstLeafIndex >= 0
      && firstLeafIndex + leafSubsetCount <= leaves.length
    );
    return {
      groupIndex: index,
      fileOffset: hexOffset(cursor),
      selectorWords: [
        firstWord,
        data.readUInt32LE(cursor + 4),
        data.readUInt32LE(cursor + 8),
        data.readUInt32LE(cursor + 12),
        data.readUInt32LE(cursor + 16),
        data.readUInt32LE(cursor + 20),
      ],
      rawLeafPointer: hexOffset(rawLeafPointer),
      leaves: subsetIsOwned
        ? leaves.slice(firstLeafIndex, firstLeafIndex + leafSubsetCount)
        : null,
    };
  });

  const roots = Array.from({ length: rootCount }, (_, index) => {
    const cursor = rootArray + index * 32;
    const runtimePosition = finiteVector(data, cursor + 4);
    const routePointCount = data.readUInt32LE(cursor + 16);
    const groupSubsetCount = data.readUInt32LE(cursor + 24);
    const rawGroupPointer = data.readUInt32LE(cursor + 28);
    const firstGroupIndex = (base + rawGroupPointer - groupArray) / 32;
    const subsetIsOwned = (
      Number.isInteger(firstGroupIndex)
      && firstGroupIndex >= 0
      && firstGroupIndex + groupSubsetCount <= groups.length
    );
    const ownedGroups = subsetIsOwned
      ? groups.slice(firstGroupIndex, firstGroupIndex + groupSubsetCount)
      : null;
    const ownedLeaves = ownedGroups?.flatMap(
      (group) => group.leaves || [],
    ) || [];
    const finalRuntimeEndpoints = ownedLeaves.map(
      (leaf) => leaf.secondRoute?.runtimePoints?.at(-1) || null,
    );
    const finalEndpointKeys = new Set(
      finalRuntimeEndpoints.filter(Boolean).map(
        floatVectorWordHex,
      ),
    );
    const finalEndpointInvariantAcrossLeaves = (
      ownedLeaves.length > 0
      && finalRuntimeEndpoints.every(Boolean)
      && finalEndpointKeys.size === 1
    );
    const finalRuntimeEndpoint = finalEndpointInvariantAcrossLeaves
      ? finalRuntimeEndpoints[0]
      : null;
    return {
      rootIndex: index,
      targetCode: asciiWord(data, cursor),
      fileOffset: hexOffset(cursor),
      runtimePosition,
      browserPosition: browserVector(runtimePosition),
      route: pointsAt(data.readUInt32LE(cursor + 20), routePointCount),
      rawGroupPointer: hexOffset(rawGroupPointer),
      groups: ownedGroups,
      finalEndpointInvariantAcrossLeaves,
      finalEndpointLeafIndices: finalEndpointInvariantAcrossLeaves
        ? ownedLeaves.map((leaf) => leaf.leafIndex)
        : [],
      finalRuntimeEndpoint,
      finalRuntimeEndpointWordHex:
        floatVectorWordHex(finalRuntimeEndpoint),
      finalBrowserEndpoint: browserVector(finalRuntimeEndpoint),
    };
  });

  const referencedPointCount = new Set([
    ...roots.map((root) => root.route?.fileOffset),
    ...leaves.flatMap((leaf) => [
      leaf.firstRoute?.fileOffset,
      leaf.secondRoute?.fileOffset,
    ]),
  ].filter(Boolean)).size;
  return {
    resourceCode: "MCIR",
    resourceFileOffset: hexOffset(base),
    magic,
    version,
    directoryCount,
    rootCount,
    groupCount,
    leafCount,
    declaredPointCount,
    distinctPointArrayCount: referencedPointCount,
    roots,
    decodingEvidence: {
      loaderAddress: "0x0c1261ec",
      relocatorAddress: "0x0c1262a4",
      rootLookupAddress: "0x0c127302",
      occupiedLeafLookupAddress: "0x0c12743c",
      freeLeafLookupAddress: "0x0c12733a",
      operation16InitializationAddress: "0x0c126cca",
      operation16PositionAddress: "0x0c126ec2",
      operation16PositionRule:
        "clear every leaf occupied by the actor, select the first free leaf, "
        + "and use the final point of that leaf's second route",
    },
  };
}
