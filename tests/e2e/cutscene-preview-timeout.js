import { readFileSync } from "node:fs";

const FRAMES_PER_SECOND = 30;
const SETUP_AND_CLEANUP_MS = 60_000;
const MINIMUM_COMPLETION_MS = 90_000;

const smoke = JSON.parse(readFileSync(
  new URL("../../tools/evidence/selectable-cutscene-smoke.json", import.meta.url),
  "utf8",
));
const durationFramesByCutsceneId = new Map(smoke.scenes.map(scene => [
  scene.cutsceneId,
  scene.coverage?.durationFrames,
]));

export function completionTimeoutForCutscene(cutsceneId) {
  const frames = durationFramesByCutsceneId.get(cutsceneId);
  if (!Number.isSafeInteger(frames) || frames < 0) {
    throw new Error(`No authored duration is recorded for ${cutsceneId}`);
  }
  return Math.max(
    MINIMUM_COMPLETION_MS,
    Math.ceil(frames / FRAMES_PER_SECOND * 1000) + SETUP_AND_CLEANUP_MS,
  );
}
