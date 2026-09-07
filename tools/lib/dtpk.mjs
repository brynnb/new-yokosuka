import { createHash } from "node:crypto";

const CHUNK_OFFSETS = Object.freeze({
  combination: 0x20,
  program: 0x24,
  unknown: 0x28,
  sequencer: 0x2c,
  playback: 0x30,
  ics: 0x34,
  effects: 0x38,
  samples: 0x3c,
});

// Shenmue's bus bank uses the same three-byte playback-reference record shape
// with entry types d1..d8 and db as well as the previously observed dc..df.
// Their second byte resolves exactly into the bank's playback table and their
// terminal 80/ff framing is identical. Preserve the authored type on each
// entry; it is presentation metadata, not part of playback-table identity.
const PLAYBACK_ENTRY_TYPES = new Set([
  0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xdb,
  0xdc, 0xdd, 0xde, 0xdf,
]);
const EVENT_ENTRY_TYPES = new Set([0xa0, 0xa4, 0xa9]);

function assertRange(bytes, offset, length, label) {
  if (
    !Number.isInteger(offset)
    || !Number.isInteger(length)
    || offset < 0
    || length < 0
    || offset + length > bytes.length
  ) {
    throw new Error(
      `${label} range 0x${offset.toString(16)}+0x${
        length.toString(16)
      } exceeds DTPK length 0x${bytes.length.toString(16)}`,
    );
  }
}

function uint16BE(bytes, offset, label) {
  assertRange(bytes, offset, 2, label);
  return bytes.readUInt16BE(offset);
}

function uint16LE(bytes, offset, label) {
  assertRange(bytes, offset, 2, label);
  return bytes.readUInt16LE(offset);
}

function uint32LE(bytes, offset, label) {
  assertRange(bytes, offset, 4, label);
  return bytes.readUInt32LE(offset);
}

function hex(value, width) {
  return value.toString(16).padStart(width, "0");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parsePlaybackEntries(bytes, playbackOffset, playbackEnd) {
  if (!playbackOffset) return [];
  assertRange(bytes, playbackOffset, 0x50, "playback header");
  const count = uint16LE(bytes, playbackOffset + 0x10, "playback count") + 1;
  assertRange(bytes, playbackOffset + 0x50, count * 0x40, "playback entries");
  if (playbackOffset + 0x50 + count * 0x40 > playbackEnd) {
    throw new Error("Playback entries overlap the next DTPK chunk");
  }
  return Array.from({ length: count }, (_, playbackId) => {
    const offset = playbackOffset + 0x50 + playbackId * 0x40;
    const storedId = bytes[offset];
    if (storedId !== (playbackId & 0xff)) {
      throw new Error(
        `Playback ${playbackId} stores low ID 0x${hex(storedId, 2)}`,
      );
    }
    return {
      playbackId,
      offset,
      sampleId: bytes[offset + 2],
      unknown03: bytes[offset + 3],
      adjust: uint16LE(bytes, offset + 4, `playback ${playbackId} adjust`),
      pan: bytes[offset + 6],
      gain: bytes[offset + 7],
      dtpkRate: uint16BE(bytes, offset + 10, `playback ${playbackId} rate`),
      envelopeHex: bytes.subarray(offset + 12, offset + 28).toString("hex"),
      randomTune: bytes[offset + 28],
      effectsOverride: bytes[offset + 30],
      effectsFlags: bytes[offset + 31],
      groupOverride: bytes[offset + 34],
      groupPriority: bytes[offset + 35],
      selfPriority: bytes[offset + 36],
      lfoHex: bytes.subarray(offset + 46, offset + 50).toString("hex"),
      sha256: sha256(bytes.subarray(offset, offset + 0x40)),
    };
  });
}

function parseTrack(bytes, {
  absoluteOffset,
  endOffset,
  groupBank,
  groupDescriptor,
  track,
}) {
  assertRange(bytes, absoluteOffset, endOffset - absoluteOffset, "track");
  const composition = bytes.subarray(absoluteOffset, endOffset);
  let cursor = 0;
  const flags = composition[cursor++];
  if (flags === undefined) throw new Error("Empty DTPK track");
  let syncGroup = null;
  let syncLevel = null;
  if (composition[cursor] <= 0x7f) {
    syncGroup = composition[cursor++];
    syncLevel = composition[cursor++];
  }
  const firstType = composition[cursor];
  const result = {
    track,
    offset: absoluteOffset,
    byteLength: composition.length,
    flags,
    syncGroup,
    syncLevel,
    commandHex: `${hex(groupDescriptor, 4)}${hex(track, 2)}00`,
    compositionHex: composition.toString("hex"),
    kind: "unknown",
    playable: false,
    entries: [],
  };

  // A8 groups are sequenced songs. Their event stream is not an SFX command
  // composition and is deliberately retained raw rather than guessed at here.
  if (groupBank === 0xa8) {
    result.kind = "song";
    return result;
  }

  if (PLAYBACK_ENTRY_TYPES.has(firstType)) {
    result.kind = "sfx";
    while (PLAYBACK_ENTRY_TYPES.has(composition[cursor])) {
      const type = composition[cursor++];
      if (cursor + 2 > composition.length) {
        throw new Error(`Truncated playback entry in ${result.commandHex}`);
      }
      const playbackLow = composition[cursor++];
      const volume = composition[cursor++];
      const trailing = [];
      while (
        cursor < composition.length
        && composition[cursor] !== 0xff
        && !PLAYBACK_ENTRY_TYPES.has(composition[cursor])
        && composition[cursor] !== 0xa0
      ) {
        trailing.push(composition[cursor++]);
      }
      result.entries.push({
        type,
        playbackLow,
        playbackId: playbackLow,
        volume,
        trailingHex: Buffer.from(trailing).toString("hex"),
      });
    }
    if (composition[cursor] !== 0xff) {
      result.kind = "unsupported";
      return result;
    }
    const finalTrailing = result.entries.at(-1)?.trailingHex || "";
    const terminal = finalTrailing.length >= 2
      ? Number.parseInt(finalTrailing.slice(-2), 16)
      : 0;
    let high = terminal & 0x0f;
    let previousLow = 0x7f;
    let crossedBoundary = false;
    for (const entry of [...result.entries].reverse()) {
      if (entry.playbackLow > previousLow) crossedBoundary = true;
      let entryHigh = high;
      if (crossedBoundary && entryHigh > 0) entryHigh -= 1;
      entry.playbackId = entry.playbackLow + entryHigh * 0x80;
      previousLow = entry.playbackLow;
    }
    result.playable = result.entries.length > 0;
    return result;
  }

  if (EVENT_ENTRY_TYPES.has(firstType)) {
    result.kind = "event";
    const type = composition[cursor++];
    result.entries.push({
      type,
      eventId: composition[cursor++],
      value: composition[cursor++],
      trailingHex: composition.subarray(cursor).toString("hex"),
    });
  }
  return result;
}

function parseGroups(bytes, sequenceOffset, sequenceEnd) {
  if (!sequenceOffset) return [];
  assertRange(bytes, sequenceOffset, 4, "sequencer header");
  const count = uint32LE(bytes, sequenceOffset, "sequencer group count") + 1;
  assertRange(bytes, sequenceOffset + 4, count * 4, "sequencer groups");
  const descriptors = Array.from({ length: count }, (_, index) => (
    uint32LE(
      bytes,
      sequenceOffset + 4 + index * 4,
      `sequencer group ${index}`,
    )
  ));
  return descriptors.map((descriptorWord, index) => {
    const descriptor = descriptorWord >>> 16;
    const relativeOffset = descriptorWord & 0xffff;
    const nextRelativeOffset = index + 1 < count
      ? descriptors[index + 1] & 0xffff
      : sequenceEnd - sequenceOffset;
    const absoluteOffset = sequenceOffset + relativeOffset;
    const groupEnd = sequenceOffset + nextRelativeOffset;
    if (groupEnd <= absoluteOffset) {
      throw new Error(`DTPK group ${index} has a non-positive span`);
    }
    const trackCount = uint32LE(
      bytes,
      absoluteOffset,
      `group ${index} track count`,
    ) + 1;
    assertRange(bytes, absoluteOffset + 4, trackCount * 4, "track offsets");
    const trackOffsets = Array.from({ length: trackCount }, (_, track) => (
      uint32LE(
        bytes,
        absoluteOffset + 4 + track * 4,
        `group ${index} track ${track} offset`,
      )
    ));
    const tracks = trackOffsets.map((relativeTrackOffset, track) => {
      const nextTrackOffset = track + 1 < trackCount
        ? trackOffsets[track + 1]
        : nextRelativeOffset;
      let trackEnd = sequenceOffset + nextTrackOffset;
      const trackStart = sequenceOffset + relativeTrackOffset;
      while (trackEnd > trackStart && bytes[trackEnd - 1] === 0) trackEnd -= 1;
      return parseTrack(bytes, {
        absoluteOffset: trackStart,
        endOffset: trackEnd,
        groupBank: descriptor >>> 8,
        groupDescriptor: descriptor,
        track,
      });
    });
    return {
      index,
      descriptor,
      descriptorHex: hex(descriptor, 4),
      bank: descriptor >>> 8,
      bankHex: hex(descriptor >>> 8, 2),
      relativeOffset,
      byteLength: groupEnd - absoluteOffset,
      trackCount,
      tracks,
    };
  });
}

function parseSamples(bytes, sampleOffset, sampleEnd) {
  if (!sampleOffset) return [];
  assertRange(bytes, sampleOffset, 4, "sample header");
  const count = uint32LE(bytes, sampleOffset, "sample count") + 1;
  assertRange(bytes, sampleOffset + 4, count * 0x10, "sample definitions");
  return Array.from({ length: count }, (_, sampleId) => {
    const definitionOffset = sampleOffset + 4 + sampleId * 0x10;
    const locationAndFormat = uint32LE(
      bytes,
      definitionOffset,
      `sample ${sampleId} location`,
    );
    const dataOffset = locationAndFormat & 0x007fffff;
    const qualityFlag = locationAndFormat & 0x00800000;
    const formatFlag = locationAndFormat & 0x01000000;
    const unknownFlag = locationAndFormat & 0x02000000;
    const channelsFlag = uint32LE(
      bytes,
      definitionOffset + 8,
      `sample ${sampleId} channels`,
    );
    const sampleLength = uint32LE(
      bytes,
      definitionOffset + 12,
      `sample ${sampleId} length`,
    );
    const byteLength = sampleLength * (channelsFlag === 0x80 ? 2 : 1);
    const loopStart = uint16LE(
      bytes,
      definitionOffset + 4,
      "sample loop start",
    );
    const loopEnd = uint16LE(
      bytes,
      definitionOffset + 6,
      "sample loop end",
    );
    // DTPK writes a 28-sample terminal span for ordinary ADPCM clips and a
    // full-length terminal value for ordinary PCM clips. Those fields are
    // decoder boundaries, not authored loops. A materially earlier start is
    // the native loop evidence used by the forklift and other sustained SFX.
    const hasAuthoredLoop = formatFlag
      ? loopStart > 0 && loopEnd - loopStart > 28
      : loopStart > 0;
    assertRange(bytes, dataOffset, byteLength, `sample ${sampleId} data`);
    if (dataOffset + byteLength > sampleEnd) {
      throw new Error(`Sample ${sampleId} overlaps the end of its DTPK chunk`);
    }
    return {
      sampleId,
      definitionOffset,
      dataOffset,
      byteLength,
      sampleLength,
      format: formatFlag ? "yamaha-aica-adpcm" : "pcm",
      bitsPerSample: formatFlag ? 4 : (qualityFlag ? 8 : 16),
      channels: channelsFlag === 0x80 ? 2 : 1,
      rawLoopStart: loopStart,
      rawLoopEnd: loopEnd,
      authoredLoop: hasAuthoredLoop
        ? { startSample: loopStart, endSample: loopEnd }
        : null,
      unknownFlag: Boolean(unknownFlag),
      sha256: sha256(bytes.subarray(dataOffset, dataOffset + byteLength)),
    };
  });
}

export function translateDTPKRate(rate) {
  if (rate < 0x600) {
    const highRates = [
      [44100, 0x0000],
      [45000, 0x0100],
      [46000, 0x0200],
      [47000, 0x0300],
      [48000, 0x0400],
      [49000, 0x0500],
    ];
    for (const [sampleRate, dtpkRate] of highRates) {
      if (rate === dtpkRate || rate < dtpkRate) return sampleRate;
    }
    return 44100;
  }
  if (rate <= 0xd000) return null;
  const pairs = [
    [4000, 0xd61d], [6000, 0xdd1e], [6500, 0xde36],
    [7000, 0xe008], [8000, 0xe21d], [8012, 0xe21e],
    [8500, 0xe320], [9000, 0xe41f], [9500, 0xe51c],
    [10500, 0xe70a], [11025, 0xe800], [12000, 0xe91e],
    [12500, 0xea0b], [13000, 0xea36], [14000, 0xec08],
    [15000, 0xed15], [16000, 0xee1d], [17000, 0xef20],
    [18000, 0xf01f], [19000, 0xf11c], [20000, 0xf214],
    [21000, 0xf30a], [22050, 0xf400], [23000, 0xf42f],
    [24000, 0xf4f6], [25000, 0xf600], [26000, 0xf71d],
    [28000, 0xf800], [30000, 0xf900], [32000, 0xfa13],
    [34000, 0xfb00], [35000, 0xfc1d], [38000, 0xfd15],
    [40000, 0xfe1d], [42000, 0xff00],
  ];
  for (const [sampleRate, dtpkRate] of pairs) {
    if (rate === dtpkRate || rate < dtpkRate + 0x20) return sampleRate;
  }
  return null;
}

export function parseDTPK(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  assertRange(bytes, 0, 0x40, "DTPK header");
  if (bytes.subarray(0, 4).toString("ascii") !== "DTPK") {
    throw new Error("Input is not a DTPK bank");
  }
  const declaredByteLength = uint32LE(bytes, 0x08, "DTPK file size");
  if (declaredByteLength !== bytes.length) {
    throw new Error(
      `DTPK declares 0x${declaredByteLength.toString(16)} bytes but has 0x${
        bytes.length.toString(16)
      }`,
    );
  }
  const offsets = Object.fromEntries(
    Object.entries(CHUNK_OFFSETS).map(([name, headerOffset]) => [
      name,
      uint32LE(bytes, headerOffset, `${name} chunk offset`),
    ]),
  );
  const presentOffsets = [
    ...new Set(
      Object.values(offsets).filter((offset) => offset > 0),
    ),
    bytes.length,
  ].sort((left, right) => left - right);
  const endFor = (offset) => (
    presentOffsets.find((candidate) => candidate > offset) ?? bytes.length
  );
  const groups = parseGroups(
    bytes,
    offsets.sequencer,
    endFor(offsets.sequencer),
  );
  const playbacks = parsePlaybackEntries(
    bytes,
    offsets.playback,
    endFor(offsets.playback),
  ).map((playback) => ({
    ...playback,
    sampleRate: translateDTPKRate(playback.dtpkRate),
  }));
  const samples = parseSamples(
    bytes,
    offsets.samples,
    endFor(offsets.samples),
  );
  const playbackById = new Map(
    playbacks.map((playback) => [playback.playbackId, playback]),
  );
  for (const group of groups) {
    for (const track of group.tracks) {
      for (const entry of track.entries) {
        if (entry.playbackId === undefined) continue;
        const playback = playbackById.get(entry.playbackId);
        entry.sampleId = playback?.sampleId ?? null;
        entry.dtpkRate = playback?.dtpkRate ?? null;
        entry.sampleRate = playback?.sampleRate ?? null;
        entry.playbackResolved = Boolean(playback);
      }
    }
  }
  return {
    schema: "new-yokosuka-dtpk-v1",
    id: uint32LE(bytes, 0x04, "DTPK ID"),
    byteLength: bytes.length,
    sha256: sha256(bytes),
    offsets,
    groups,
    playbacks,
    samples,
  };
}
