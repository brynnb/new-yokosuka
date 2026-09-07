import { parseAuthSequence } from "./AuthSequence.js";
import { evaluateAuthCurve, parseAuthSplineCurve } from "./AuthSpline.js";
import { parseAuthTrack } from "./AuthTrack.js";

export const AUTH_MOVEMENT_CHANNELS = Object.freeze([
  "x",
  "y",
  "z",
  "rotationX",
  "rotationY",
  "rotationZ",
  "faceX",
  "faceY",
  "faceZ",
]);

export function parseAuthMovement(input) {
  const track = parseAuthTrack(input);
  const view = track.view;
  const chunk = track.chunk("AMOV");
  const amov = chunk.offset;
  const chunkSize = chunk.byteLength;
  if (chunkSize < 20) {
    throw new Error("AUTH AMOV chunk is truncated.");
  }
  const actorCount = view.getUint32(amov + 12, true);
  const headerSize = 16 + (actorCount + 1) * 4;
  if (headerSize > chunkSize) {
    throw new Error("AUTH AMOV actor table is truncated.");
  }
  const offsets = Array.from(
    { length: actorCount + 1 },
    (_, index) => view.getUint32(amov + 16 + index * 4, true),
  );
  if (
    offsets[0] < headerSize
    || offsets.at(-1) !== chunkSize
    || offsets.some((offset, index) => (
      offset > chunkSize || (index > 0 && offset < offsets[index - 1])
    ))
  ) {
    throw new Error("AUTH AMOV actor offsets are invalid.");
  }
  const tags = parseAuthSequence(input).actors;
  const actors = Array.from({ length: actorCount }, (_, actorIndex) => {
    let cursor = amov + offsets[actorIndex];
    const end = amov + offsets[actorIndex + 1];
    const channels = {};
    for (const name of AUTH_MOVEMENT_CHANNELS) {
      const parsed = parseAuthSplineCurve(view, cursor, end);
      channels[name] = parsed.curve;
      cursor = parsed.nextOffset;
    }
    if (cursor !== end) {
      throw new Error(`AUTH AMOV actor ${actorIndex} has trailing bytes.`);
    }
    return {
      index: actorIndex,
      tag: tags[actorIndex] || null,
      channels,
      duration: Math.max(
        0,
        ...Object.values(channels).map((curve) => curve.times.at(-1) ?? 0),
      ),
      trailingByteCount: 0,
    };
  });
  return {
    markerOffset: amov,
    chunkSize,
    actors,
    duration: Math.max(0, ...actors.map((actor) => actor.duration)),
  };
}

export { evaluateAuthCurve } from "./AuthSpline.js";

export function evaluateAuthActor(actor, time) {
  return Object.fromEntries(
    Object.entries(actor.channels).map(([name, curve]) => [
      name,
      evaluateAuthCurve(curve, time),
    ]),
  );
}
