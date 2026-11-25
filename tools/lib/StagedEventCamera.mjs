import {evaluateAuthCurve} from "../../src/AuthSpline.js";

// Preserve individual shot splines and a hard cut at each native frame.
export function composeEventCameraShots(cameras, shots, durationFrames) {
  const channels = {};
  const cutEpsilon = 0.000001;
  const fields = Object.keys(cameras.get(shots[0].cameraNumber).curves);
  for (const field of fields) {
    const times = [], values = [], tangents = [];
    for (const [index, shot] of shots.entries()) {
      const curve = cameras.get(shot.cameraNumber).curves[field];
      const source = {times: curve.times, values: curve.values, tangents: curve.slopes};
      const start = shot.frame / 30;
      const next = shots[index + 1];
      const end = next ? next.frame / 30 - cutEpsilon : durationFrames / 30;
      const innerTimes = curve.times.map(time => start + time).filter(time => time > start && time < end);
      for (const time of [start, ...innerTimes, end]) {
        const local = time - start;
        const nativeKey = curve.times.findIndex(value => Math.abs(value - local) < 1e-8);
        const slope = nativeKey >= 0 ? curve.slopes[nativeKey]
          : (evaluateAuthCurve(source, local + cutEpsilon) - evaluateAuthCurve(source, local - cutEpsilon)) / (2 * cutEpsilon);
        times.push(time);
        values.push(evaluateAuthCurve(source, local));
        tangents.push(slope);
      }
    }
    channels[field] = {times, values, tangents};
  }
  const camera = Object.fromEntries(fields.map(field => [field, channels[field].values[0]]));
  return {cameraTrack: {channels}, camera};
}
