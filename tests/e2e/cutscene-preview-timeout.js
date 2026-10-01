import { readFileSync } from "node:fs";

const FRAMES_PER_SECOND = 30;
const SETUP_AND_CLEANUP_MS = 60_000;
const MINIMUM_COMPLETION_MS = 90_000;

const previews = JSON.parse(readFileSync(
  new URL("../../play/data/events/nativeActivityPreviewPrograms.generated.json", import.meta.url),
  "utf8",
));
const expectations = new Map();
const manifests = new Map();
const audioManifests = new Map();
const musicTracks = JSON.parse(readFileSync(new URL("../../public/music/manifest.json", import.meta.url))).tracks;
for (const program of previews.programs) {
  const attachedActorTags = new Set();
  const propCheckpoints = new Map();
  const musicCues = new Map();
  const namedMusicCues = new Map();
  const records = program.evidence.filter(item => item.kind === "exact-activity-manifest")
    .flatMap(item => {
      if (!manifests.has(item.path)) {
        manifests.set(item.path, JSON.parse(readFileSync(new URL(`../../${item.path}`, import.meta.url))));
      }
      const manifest = manifests.get(item.path);
      // Some multi-catalog packages put an audioBySlot explanation here, not
      // a file reference. Only JSON references can carry package score cues.
      if (manifest.audioManifest?.endsWith(".json")) {
        if (!audioManifests.has(manifest.audioManifest)) {
          audioManifests.set(manifest.audioManifest, JSON.parse(readFileSync(
            new URL(`../../${manifest.audioManifest}`, import.meta.url),
          )));
        }
        for (const cue of audioManifests.get(manifest.audioManifest).music || []) {
          if (cue.activitySlot != null) musicCues.set(cue.activitySlot, cue);
          if (cue.nativeName) namedMusicCues.set(cue.nativeName, cue);
        }
      }
      for (const cue of manifest.music || []) {
        if (cue.activitySlot != null) musicCues.set(cue.activitySlot, cue);
      }
      Object.keys(manifest.attachedObjects || {}).forEach(tag => attachedActorTags.add(tag));
      for (const object of Object.values(manifest.attachedObjects || {})) {
        for (const cue of [
          ...object.attachments, ...(object.presentation || []), ...(object.nodeTransforms || []),
        ]) {
          const frame = cue.frame ?? cue.firstFrame;
          propCheckpoints.set(`${cue.activityId}:${frame}`, { activityId: cue.activityId, frame });
        }
      }
      return manifest.activities;
    });
  // Native named score controls now live at script-stage boundaries, not in
  // the audio manifest's obsolete activitySlot field. Read the generated start
  // block and its static string, so missing OPEN1/OPEN2 checks cannot go silent.
  for (const block of program.functions.flatMap(fn => fn.blocks)) {
    const start = block.actions.find(action => action.operationId === 0x0050
      && action.arguments.length === 1 && action.arguments[0].kind === "constant");
    if (!start) continue;
    for (const action of block.actions.filter(action => action.operationId === 0x015c)) {
      const name = program.staticStrings?.find(value => value.pointer === action.arguments[0]?.value)?.value;
      const cue = namedMusicCues.get(name);
      if (cue) musicCues.set(start.arguments[0].value, cue);
    }
  }
  const activities = program.preview.activities || [program.preview.activity];
  const durations = activities.map(activity => {
    const record = records.find(record => record.activityId === activity.activityId);
    if (!record || !Number.isSafeInteger(record.durationFrames) || record.durationFrames < 1) {
      throw new Error(`No authored duration for ${program.id}: ${activity.activityId}`);
    }
    return record.durationFrames;
  });
  const musicSpans = [];
  let elapsedFrames = 0;
  for (const [index, activity] of activities.entries()) {
    const cue = musicCues.get(activity.slot);
    if (cue) {
      if (musicSpans.length) musicSpans.at(-1).endFrame = elapsedFrames;
      musicSpans.push({ trackId: cue.trackId, startFrame: elapsedFrames });
    }
    elapsedFrames += durations[index];
  }
  if (musicSpans.length) musicSpans.at(-1).endFrame = elapsedFrames;
  for (const span of musicSpans) {
    const duration = musicTracks[span.trackId]?.durationSeconds;
    if (!Number.isFinite(duration)) throw new Error(`No music duration for ${span.trackId}`);
    span.durationSeconds = Math.min(duration, (span.endFrame - span.startFrame) / FRAMES_PER_SECOND);
  }
  expectations.set(program.selector.cutsceneId, {
    programId: program.id,
    activityOrder: activities.map(activity => activity.activityId),
    activityDurations: durations,
    attachedActorTags: [...attachedActorTags],
    propCheckpoints: [...propCheckpoints.values()],
    musicSpans,
    // Count occurrences, not unique resources: authored repeats take real time.
    // Read the current program/manifest rather than a possibly stale smoke run.
    durationFrames: durations.reduce((sum, frames) => sum + frames, 0),
  });
}

export function playbackExpectationForCutscene(cutsceneId) {
  const expected = expectations.get(cutsceneId);
  if (!expected) throw new Error(`No preview program is recorded for ${cutsceneId}`);
  return expected;
}

export function completionTimeoutForCutscene(cutsceneId) {
  const frames = playbackExpectationForCutscene(cutsceneId).durationFrames;
  return Math.max(
    MINIMUM_COMPLETION_MS,
    Math.ceil(frames / FRAMES_PER_SECOND * 1000) + SETUP_AND_CLEANUP_MS,
  );
}
