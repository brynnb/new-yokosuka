import { NATIVE_HAND_POSE_SLOT_ORDER } from "../../src/NativeHandRig.js";

function pushCommand(frameCommands, frame, command) {
  if (!frameCommands.has(frame)) frameCommands.set(frame, []);
  frameCommands.get(frame).push(Object.freeze(command));
}

function validFrame(cue, durationFrames, { terminal = false } = {}) {
  return Number.isInteger(cue?.frame)
    && cue.frame >= 0
    && cue.frame <= durationFrames
    && (terminal || cue.frame < durationFrames);
}

function validVector(value) {
  return Array.isArray(value)
    && value.length === 3
    && value.every(Number.isFinite);
}

export function validateNativeAseqActivityMetadata(manifest) {
  if (
    manifest.nativeHandPoseSlotOrder !== undefined
    && JSON.stringify(manifest.nativeHandPoseSlotOrder)
      !== JSON.stringify(NATIVE_HAND_POSE_SLOT_ORDER)
  ) {
    throw new Error("AUTH activity manifest has an invalid HAND pose slot order");
  }
  const actorTags = Object.freeze([...(manifest.actorTags || [])]);
  if (
    new Set(actorTags).size !== actorTags.length
    || actorTags.some(actorTag => typeof actorTag !== "string" || !actorTag.trim())
  ) {
    throw new Error("AUTH activity manifest has invalid actor tags");
  }
  return Object.freeze({
    actorTags,
    actorTagSet: new Set(actorTags),
    handPoseTables: Object.freeze({ ...(manifest.nativeHandPoseTables || {}) }),
  });
}

export function enrichNativeAseqActivityFrames({
  record,
  sequence,
  frames,
  metadata,
} = {}) {
  const activityLabel = record?.activityId || `<slot ${record?.slot ?? "?"}>`;
  const frameCommands = new Map(frames.map(frame => [
    frame.frame,
    [...frame.commands],
  ]));

  for (const cue of record.nativeHandPoseCues || []) {
    const table = metadata.handPoseTables[cue.poseTableOffset];
    if (
      !validFrame(cue, record.durationFrames)
      || !sequence.actors.includes(cue.actorTag)
      || (cue.side !== "left" && cue.side !== "right")
      || !Number.isInteger(cue.durationNativeTicks)
      || cue.durationNativeTicks < 1
      || !Array.isArray(table?.vectors)
      || table.vectors.length !== NATIVE_HAND_POSE_SLOT_ORDER.length
    ) throw new Error(`AUTH activity ${activityLabel} has an invalid HAND cue`);
    pushCommand(frameCommands, cue.frame, {
      name: "hand-pose",
      actorTag: cue.actorTag,
      side: cue.side,
      durationNativeTicks: cue.durationNativeTicks,
      poseTableOffset: cue.poseTableOffset,
      callFileOffset: cue.callFileOffset,
      vectors: table.vectors,
    });
  }

  for (const cue of record.nativeBodyHandPoseCues || []) {
    if (
      !validFrame(cue, record.durationFrames)
      || !sequence.actors.includes(cue.actorTag)
      || !Number.isInteger(cue.channel)
      || cue.channel < 0
      || cue.channel > 2
      || !Number.isInteger(cue.targetIndex)
      || cue.targetIndex < 0
      || cue.targetIndex >= 15
      || !Number.isInteger(cue.durationNativeTicks)
      || cue.durationNativeTicks <= 1
    ) throw new Error(`AUTH activity ${activityLabel} has an invalid MHND cue`);
    pushCommand(frameCommands, cue.frame, {
      name: "body-hand-pose",
      actorTag: cue.actorTag,
      channel: cue.channel,
      targetIndex: cue.targetIndex,
      durationNativeTicks: cue.durationNativeTicks,
      callFileOffset: cue.callFileOffset,
    });
  }

  for (const cue of record.nativeDetailedHandDefaults || []) {
    if (
      !sequence.actors.includes(cue.actorTag)
      || !Array.isArray(cue.sides)
      || cue.sides.length < 1
      || new Set(cue.sides).size !== cue.sides.length
      || cue.sides.some(side => side !== "left" && side !== "right")
    ) throw new Error(`AUTH activity ${activityLabel} has invalid detailed HAND defaults`);
    pushCommand(frameCommands, 0, {
      name: "detailed-hand-default",
      actorTag: cue.actorTag,
      sides: Object.freeze([...cue.sides]),
      sourceFunction: cue.sourceFunction,
      ownerCallFileOffset: cue.ownerCallFileOffset,
    });
  }

  for (const cue of record.nativeFaceClipCues || []) {
    if (
      !validFrame(cue, record.durationFrames)
      || !metadata.actorTagSet.has(cue.actorTag)
      || !Number.isInteger(cue.clipGroup)
      || cue.clipGroup < 0
      || !Number.isInteger(cue.selector)
      || cue.selector < 0
      || !Number.isInteger(cue.durationNativeTicks)
      || cue.durationNativeTicks < 1
    ) throw new Error(`AUTH activity ${activityLabel} has an invalid FACE clip cue`);
    pushCommand(frameCommands, cue.frame, {
      name: "face-clip",
      actorTag: cue.actorTag,
      clipGroup: cue.clipGroup,
      selector: cue.selector,
      durationNativeTicks: cue.durationNativeTicks,
      callFileOffset: cue.callFileOffset,
    });
  }

  for (const cue of record.nativeFaceControllerCues || []) {
    if (
      !validFrame(cue, record.durationFrames)
      || !metadata.actorTagSet.has(cue.actorTag)
      || !Number.isInteger(cue.mode)
      || cue.mode < 0
      || cue.mode > 0xff
      || !Number.isInteger(cue.intervalNativeTicks)
      || cue.intervalNativeTicks < 0
      || cue.intervalNativeTicks > 0xffff
      || !Number.isInteger(cue.parameter)
      || cue.parameter < 0
      || cue.parameter > 0xff
    ) throw new Error(`AUTH activity ${activityLabel} has an invalid FACE controller cue`);
    pushCommand(frameCommands, cue.frame, {
      name: "face-controller",
      actorTag: cue.actorTag,
      mode: cue.mode,
      intervalNativeTicks: cue.intervalNativeTicks,
      parameter: cue.parameter,
      callFileOffset: cue.callFileOffset,
    });
  }

  for (const cue of record.nativeFaceGazeCues || []) {
    const worldTargetValid = cue.target?.kind === "world-point"
      && validVector(cue.target.position);
    const actorTargetValid = cue.target?.kind === "actor-component"
      && metadata.actorTagSet.has(cue.target.actorTag)
      && Number.isInteger(cue.target.selector)
      && cue.target.selector >= -1
      && cue.target.selector <= 127
      && typeof cue.target.associated === "boolean"
      && validVector(cue.target.offset);
    if (
      !validFrame(cue, record.durationFrames, { terminal: true })
      || !metadata.actorTagSet.has(cue.actorTag)
      || (cue.mode !== 0 && cue.mode !== 2)
      || !Number.isInteger(cue.durationNativeTicks)
      || cue.durationNativeTicks < 1
      || (cue.mode === 0 && cue.target !== undefined)
      || (cue.mode === 2 && !worldTargetValid && !actorTargetValid)
    ) throw new Error(`AUTH activity ${activityLabel} has an invalid FACE gaze cue`);
    pushCommand(frameCommands, cue.frame, {
      name: "face-gaze",
      actorTag: cue.actorTag,
      mode: cue.mode,
      durationNativeTicks: cue.durationNativeTicks,
      target: cue.target,
      callFileOffset: cue.callFileOffset,
    });
  }

  for (const cue of record.nativeActorLookPointCues || []) {
    const worldTargetValid = cue.target?.kind === "world-point"
      && validVector(cue.target.position);
    const actorTargetValid = cue.target?.kind === "actor-component"
      && metadata.actorTagSet.has(cue.target.actorTag)
      && Number.isInteger(cue.target.selector)
      && cue.target.selector >= -1
      && cue.target.selector <= 127
      && validVector(cue.target.offset);
    if (
      !validFrame(cue, record.durationFrames, { terminal: true })
      || !metadata.actorTagSet.has(cue.actorTag)
      || !Number.isInteger(cue.selector)
      || !Number.isInteger(cue.mode)
      || (cue.target !== null && !worldTargetValid && !actorTargetValid)
      || (cue.selector < 0 && cue.target !== null)
      || (cue.selector >= 0 && cue.target === null)
    ) throw new Error(`AUTH activity ${activityLabel} has an invalid actor look-point cue`);
    pushCommand(frameCommands, cue.frame, {
      name: "actor-look-point",
      actorTag: cue.actorTag,
      selector: cue.selector,
      mode: cue.mode,
      target: cue.target,
      callFileOffset: cue.callFileOffset,
    });
  }

  return Object.freeze([...frameCommands.entries()]
    .sort(([left], [right]) => left - right)
    .map(([frame, commands]) => Object.freeze({
      frame,
      commands: Object.freeze(commands),
    })));
}
