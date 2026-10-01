const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export function validNativeAseqGazeTarget(target, metadata) {
  if (target?.kind === "world-point") return vector(target.position);
  if (!vector(target?.offset)) return false;
  if (target.kind === "object-base") return metadata.objectTagSet?.has(target.objectTag) === true;
  return target.kind === "actor-component" && metadata.actorTagSet.has(target.actorTag)
    && Number.isInteger(target.selector) && target.selector >= -1 && target.selector <= 127;
}

// Both FACE eye gaze and LKPT use native scene coordinates. Resolve against
// the current rendered frame, then reflect X exactly once at this boundary.
export function resolveNativeAseqGazeTarget(actors, target) {
  if (target === null) return null;
  if (target?.kind === "world-point" && vector(target.position)) {
    return [-target.position[0], target.position[1], target.position[2]];
  }
  if (!vector(target?.offset)) throw new Error("AUTH gaze target offset is invalid");
  const position = target.kind === "actor-component"
    ? actors.componentWorldPosition(target.actorTag, target.selector)
    : target.kind === "object-base" ? actors.objectWorldPosition?.(target.objectTag) : null;
  if (!vector(position)) {
    throw new Error(`AUTH gaze target ${target.actorTag || target.objectTag}:${target.selector ?? "base"} is unavailable`);
  }
  return [position[0] - target.offset[0], position[1] + target.offset[1], position[2] + target.offset[2]];
}
