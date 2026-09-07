import { evaluateAuthCurve, parseAuthSplineCurve } from "./AuthSpline.js";
import { parseAuthTrack } from "./AuthTrack.js";

export const AUTH_CAMERA_FLAGS = Object.freeze({
  spline: 0x01,
  roll: 0x20,
  perspective: 0x40,
});

export const AUTH_CAMERA_CHANNELS = Object.freeze([
  "positionX",
  "positionY",
  "positionZ",
  "targetX",
  "targetY",
  "targetZ",
  "roll",
  "perspective",
]);

const KNOWN_FLAG_MASK = Object.values(AUTH_CAMERA_FLAGS)
  .reduce((mask, flag) => mask | flag, 0);

/** Parse the exact offset table and eight serialized splines in AUTH ACAM. */
export function parseAuthCamera(input) {
  const track = parseAuthTrack(input);
  const view = track.view;
  const chunk = track.chunk("ACAM");
  const acam = chunk.offset;
  const cameraCount = view.getUint32(acam + 12, true);
  const headerSize = 16 + (cameraCount + 1) * 4;
  if (headerSize > chunk.byteLength) {
    throw new Error("AUTH ACAM camera table is truncated.");
  }
  const offsets = Array.from(
    { length: cameraCount + 1 },
    (_, index) => view.getUint32(acam + 16 + index * 4, true),
  );
  if (
    offsets[0] < headerSize
    || offsets.at(-1) !== chunk.byteLength
    || offsets.some((offset, index) => (
      offset > chunk.byteLength || (index > 0 && offset < offsets[index - 1])
    ))
  ) {
    throw new Error("AUTH ACAM camera offsets are invalid.");
  }

  const cameras = Array.from({ length: cameraCount }, (_, cameraIndex) => {
    let cursor = acam + offsets[cameraIndex];
    const end = acam + offsets[cameraIndex + 1];
    if (cursor + 4 > end) {
      throw new Error(`AUTH ACAM camera ${cameraIndex} has no flags.`);
    }
    const flags = view.getUint32(cursor, true);
    cursor += 4;
    if ((flags & AUTH_CAMERA_FLAGS.spline) === 0 || (flags & ~KNOWN_FLAG_MASK) !== 0) {
      throw new Error(`AUTH ACAM camera ${cameraIndex} has unknown flags 0x${flags.toString(16)}.`);
    }

    const channels = {};
    for (const name of AUTH_CAMERA_CHANNELS) {
      const parsed = parseAuthSplineCurve(view, cursor, end);
      channels[name] = parsed.curve;
      cursor = parsed.nextOffset;
    }
    if (cursor !== end) {
      throw new Error(`AUTH ACAM camera ${cameraIndex} has trailing bytes.`);
    }
    if (
      !(flags & AUTH_CAMERA_FLAGS.roll)
      && channels.roll.times.length !== 0
    ) {
      throw new Error(`AUTH ACAM camera ${cameraIndex} has unflagged roll data.`);
    }
    if (
      !(flags & AUTH_CAMERA_FLAGS.perspective)
      && channels.perspective.times.length !== 0
    ) {
      throw new Error(`AUTH ACAM camera ${cameraIndex} has unflagged perspective data.`);
    }
    return Object.freeze({
      index: cameraIndex,
      flags,
      channels: Object.freeze(channels),
      duration: Math.max(
        0,
        ...Object.values(channels).map((curve) => curve.times.at(-1) ?? 0),
      ),
    });
  });

  return {
    markerOffset: acam,
    chunkSize: chunk.byteLength,
    cameras: Object.freeze(cameras),
    duration: Math.max(0, ...cameras.map((camera) => camera.duration)),
  };
}

export function evaluateAuthCamera(camera, time) {
  return Object.fromEntries(
    Object.entries(camera.channels).map(([name, curve]) => [
      name,
      evaluateAuthCurve(curve, time),
    ]),
  );
}
