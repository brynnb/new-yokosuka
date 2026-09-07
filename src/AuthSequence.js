import { parseAuthTrack, readAuthTag } from "./AuthTrack.js";

export const AUTH_SEQUENCE_COMMANDS = Object.freeze({
  0: Object.freeze({ name: "end", argumentCounts: Object.freeze([0]) }),
  1: Object.freeze({ name: "camera", argumentCounts: Object.freeze([2]) }),
  2: Object.freeze({ name: "move", argumentCounts: Object.freeze([2]) }),
  3: Object.freeze({ name: "motion", argumentCounts: Object.freeze([5]) }),
  4: Object.freeze({ name: "effect", argumentCounts: Object.freeze([4]) }),
  5: Object.freeze({ name: "voice", argumentCounts: Object.freeze([5]) }),
  6: Object.freeze({ name: "sound", argumentCounts: Object.freeze([3, 9]) }),
});

function isPrintableTag(tag) {
  return /^[\x20-\x7e]{4}$/.test(tag);
}

function requireTag(view, offset, label) {
  const tag = readAuthTag(view, offset);
  if (!isPrintableTag(tag)) {
    throw new Error(`AUTH ASEQ ${label} is not a printable four-character tag.`);
  }
  return tag;
}

function littleEndianWordHex(view, offset) {
  return Array.from(
    { length: 4 },
    (_, index) => view.getUint8(offset + index)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
}

function typedCommand(view, command) {
  const { args, argumentOffset, type } = command;
  if (type === 1) {
    return {
      cameraId: requireTag(view, argumentOffset, "camera ID"),
      cameraIndex: args[1],
    };
  }
  if (type === 2) {
    return {
      actorTag: requireTag(view, argumentOffset, "move actor"),
      movementIndex: args[1],
    };
  }
  if (type === 3) {
    const motionId = args[1];
    const sequenceNumber = motionId & 0xff;
    return {
      actorTag: requireTag(view, argumentOffset, "motion actor"),
      motionId,
      motionBank: motionId >>> 8,
      sequenceNumber,
      sequenceIndex: sequenceNumber > 0 ? sequenceNumber - 1 : null,
      timelineFrame: command.frame,
      startFrame: args[2],
      endFrame: args[3],
      flags: args[4],
    };
  }
  if (type === 5) {
    return {
      actorTag: requireTag(view, argumentOffset, "voice actor"),
      stringIndex: args[1],
      lipIndex: args[2] === 0xffffffff ? null : args[2],
      flags: args[3],
      durationSeconds: view.getFloat32(argumentOffset + 16, true),
    };
  }
  if (type === 6) {
    const commandHex = littleEndianWordHex(view, argumentOffset + 4);
    const rawActorTag = readAuthTag(view, argumentOffset);
    const actorTag = isPrintableTag(rawActorTag) ? rawActorTag : null;
    const common = {
      ...(actorTag ? { actorTag } : {}),
      argument0: args[0],
      commandWord: args[1],
      commandHex,
      stringIndex: args[2],
      eventIndex: args[2],
      timelineFrame: command.frame,
      stop: commandHex === "ffffffff",
    };
    if (args.length === 3) return common;
    return {
      ...common,
      argument3: args[3],
      argument4: args[4],
      volume: args[4],
      argument5: args[5],
      argument6: args[6],
      argument7: args[7],
      durationSeconds: view.getFloat32(argumentOffset + 32, true),
    };
  }
  if (type === 4) {
    return {
      // The first word is the same packed fourcc actor handle used by the
      // other actor-directed ASEQ commands. FACE/CLIP needs it to address
      // the active detailed face when one is available.
      actorTag: requireTag(view, argumentOffset, "FACE/CLIP actor"),
      effectId: args[0],
      effectType: args[1],
      pattern: args[2],
      speed: args[3],
    };
  }
  return {};
}

/** Parse the exact ordered frame/command stream in an AUTH ASEQ chunk. */
export function parseAuthSequence(input) {
  const track = parseAuthTrack(input);
  const view = track.view;
  const chunk = track.chunk("ASEQ");
  if (chunk.byteLength < 20) throw new Error("AUTH ASEQ chunk is truncated.");

  const endian = view.getUint8(chunk.offset + 8);
  const version = view.getUint8(chunk.offset + 9);
  const reserved = view.getUint16(chunk.offset + 10, true);
  const durationFrames = view.getUint32(chunk.offset + 12, true);
  if (endian !== 0) {
    throw new Error(`AUTH ASEQ endian ${endian} is not supported.`);
  }
  if (reserved !== 0) throw new Error("AUTH ASEQ header reserved bytes are nonzero.");

  const frames = [];
  const actors = [];
  const motions = [];
  const sounds = [];
  let cursor = chunk.offset + 16;
  let previousFrame = -1;
  let sawTerminator = false;
  while (cursor < chunk.endOffset) {
    if (cursor + 4 > chunk.endOffset) {
      throw new Error("AUTH ASEQ ends inside a frame number.");
    }
    const recordOffset = cursor;
    const frame = view.getInt32(cursor, true);
    cursor += 4;
    if (frame === -1) {
      sawTerminator = true;
      break;
    }
    if (frame < previousFrame || frame > durationFrames) {
      throw new Error(`AUTH ASEQ frame ${frame} is outside its ordered duration.`);
    }
    previousFrame = frame;

    const commands = [];
    let sawFrameEnd = false;
    while (cursor < chunk.endOffset) {
      if (cursor + 4 > chunk.endOffset) {
        throw new Error("AUTH ASEQ ends inside a command header.");
      }
      const commandOffset = cursor;
      const type = view.getUint8(cursor);
      const argc = view.getUint8(cursor + 1);
      const commandReserved = view.getUint16(cursor + 2, true);
      cursor += 4;
      const definition = AUTH_SEQUENCE_COMMANDS[type];
      if (!definition) throw new Error(`Unknown AUTH ASEQ command type ${type}.`);
      if (!definition.argumentCounts.includes(argc)) {
        throw new Error(`AUTH ASEQ ${definition.name} command has argc ${argc}.`);
      }
      if (commandReserved !== 0) {
        throw new Error(`AUTH ASEQ ${definition.name} reserved field is nonzero.`);
      }
      if (type === 0) {
        sawFrameEnd = true;
        break;
      }
      const argumentOffset = cursor;
      const argumentEnd = cursor + argc * 4;
      if (argumentEnd > chunk.endOffset) {
        throw new Error(`AUTH ASEQ ${definition.name} arguments are truncated.`);
      }
      const args = Array.from(
        { length: argc },
        (_, index) => view.getUint32(cursor + index * 4, true),
      );
      cursor = argumentEnd;
      const command = {
        type,
        name: definition.name,
        argc,
        args: Object.freeze(args),
        frame,
        recordOffset: commandOffset,
        argumentOffset,
      };
      Object.assign(command, typedCommand(view, command));
      commands.push(Object.freeze(command));

      if (type === 2) actors[command.movementIndex] = command.actorTag;
      if (type === 3) motions.push(command);
      if (type === 6) sounds.push(command);
    }
    if (!sawFrameEnd) throw new Error(`AUTH ASEQ frame ${frame} has no END command.`);
    frames.push(Object.freeze({
      frame,
      recordOffset,
      commands: Object.freeze(commands),
    }));
  }

  if (!sawTerminator || cursor !== chunk.endOffset) {
    throw new Error("AUTH ASEQ does not end exactly at its -1 terminator.");
  }

  return {
    markerOffset: chunk.offset,
    chunkSize: chunk.byteLength,
    endian,
    version,
    durationFrames,
    timelineComplete: true,
    frames: Object.freeze(frames),
    actors: Object.freeze(actors),
    motions: Object.freeze(motions),
    sounds: Object.freeze(sounds),
  };
}

function packageForBank(motionPackages, bank) {
  if (motionPackages instanceof Map) return motionPackages.get(bank) || null;
  if (
    motionPackages
    && !Array.isArray(motionPackages.sequences)
    && typeof motionPackages === "object"
  ) {
    return motionPackages[bank] || motionPackages[String(bank)] || null;
  }
  return motionPackages;
}

export function resolveAuthMotions(sequence, motionPackages) {
  return sequence.motions.map((event) => {
    const motionPackage = packageForBank(motionPackages, event.motionBank);
    const motion = Number.isInteger(event.sequenceIndex)
      ? motionPackage?.sequences?.find(
        candidate => candidate.index === event.sequenceIndex,
      ) || motionPackage?.sequences?.[event.sequenceIndex]
      : null;
    return {
      ...event,
      sequence: motion || null,
      motionName: motion?.name || null,
      motionDurationFrames: motion?.durationFrames ?? null,
      motionValid: motion?.valid === true,
      motionPackageResolved: Boolean(motionPackage),
    };
  });
}

/** Resolve each AUTH sound against the actor motion active at that frame. */
export function resolveAuthSoundMotions(sequence, motionPackages) {
  const motions = resolveAuthMotions(sequence, motionPackages);
  return (sequence.sounds || []).map((sound) => {
    const soundFrame = sound.frame ?? sound.timelineFrame;
    const motion = motions
      .filter((candidate) => (
        candidate.actorTag === sound.actorTag
        && (candidate.timelineFrame ?? candidate.frame) <= soundFrame
      ))
      .sort((left, right) => (
        (left.timelineFrame ?? left.frame)
          - (right.timelineFrame ?? right.frame)
        || left.recordOffset - right.recordOffset
      ))
      .at(-1);
    const motionTimelineFrame = motion
      ? (motion.timelineFrame ?? motion.frame)
      : null;
    const motionLocalFrame = motion
      ? motion.startFrame + soundFrame - motionTimelineFrame
      : null;
    return {
      ...sound,
      motionRecordOffset: motion?.recordOffset ?? null,
      motionTimelineFrame,
      motionName: motion?.motionName ?? null,
      motionLocalFrame,
      motionFrameResolved: Boolean(
        motion?.motionValid
        && motionLocalFrame >= motion.startFrame
        && motionLocalFrame <= motion.endFrame
      ),
    };
  });
}
