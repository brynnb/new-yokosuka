import fs from "node:fs";
import path from "node:path";

function readJson(filename) {
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch {
    return null;
  }
}

export function shenmue2RamCaptureTiming(ramPath) {
  const directory = path.dirname(path.resolve(ramPath));
  const frame = readJson(path.join(directory, "frame.json"));
  if (
    frame?.schema === "flycast-pvr-frame-v2"
    && frame.ramSize === 0x01000000
  ) {
    return "synchronized-pvr-frame";
  }
  const savestate = readJson(path.join(directory, "savestate-ram.json"));
  if (savestate?.schema === "new-yokosuka-flycast-savestate-ram-v1") {
    return "offline-savestate-ram";
  }
  return "unclassified-ram";
}

export function shenmue2RamSupportsPoseConformance(ramPath) {
  return shenmue2RamCaptureTiming(ramPath) === "synchronized-pvr-frame";
}
