import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const PROJECT_MARKERS = [
  ".disc-work",
  "captures",
  "extracted_files",
  "extracted_disc2_v2",
  "extracted_disc3_v2",
  "play",
  "public",
  "tools",
];

export function portableProjectPath(value) {
  const resolved = path.resolve(value);
  const relative = path.relative(projectRoot, resolved);
  if (relative !== ".." && !relative.startsWith(`..${path.sep}`)) {
    return relative.split(path.sep).join("/");
  }
  const parts = resolved.split(path.sep);
  const markerIndex = parts.findIndex(part => PROJECT_MARKERS.includes(part));
  if (markerIndex >= 0) return parts.slice(markerIndex).join("/");
  throw new Error(`path is outside the project evidence roots: ${value}`);
}
