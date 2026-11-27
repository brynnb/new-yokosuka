// Assemble geometry only. No avatar, collision, interaction, or script runtime.
import { groupWorldPlacements, readPlacementModelAssets, createPlacementModelLoader,
  preparePlacementRoots, placementInitiallyEnabled } from "./WorldPlacementAssets.js";
import { ScheduledSceneObjectRuntime } from "../../play/world/ScheduledSceneObjectRuntime.js";
import { auditRuntimePlacementRoots, summarizeRuntimePlacementAudit } from "../RuntimePlacementAudit.js";
import { jomoObjectBehavior } from "../JomoObjectRegistry.js";
import { setSourceOrderRotation } from "../Mt5InteractionRotation.js";
import { Tools } from "@babylonjs/core/Misc/tools.js";

export function viewerScheduleDate(timeOfDayIndex) {
  // The viewer exposes four lighting presets rather than a game clock.
  const hour = [12, 17, 19, 23][timeOfDayIndex] ?? 12;
  return new Date(Date.UTC(1986, 11, 3, hour));
}

export async function appendViewerWorldPlacements(state, world, cancelled, onProgress = () => {}, {
  readAssets = readPlacementModelAssets, makeLoader = createPlacementModelLoader,
  scheduledRuntime = null,
} = {}) {
  if (!world || cancelled()) return;
  const groups = groupWorldPlacements(world.placements);
  const auditRows = [];
  const controller = new AbortController();
  const signal = controller.signal;
  const check = () => {
    if (cancelled() && !signal.aborted) controller.abort();
    signal.throwIfAborted();
  };
  const scheduled = scheduledRuntime || new ScheduledSceneObjectRuntime({
    scene: state.scene, state, getGameDate: () => viewerScheduleDate(state.currentTimeOfDay),
  });
  const total = groups.length + scheduled.workCount(world.id);
  let next = 0, done = 0;
  const advance = () => { if (!cancelled()) onProgress(++done, total); };
  const monitor = setInterval(() => { if (cancelled()) controller.abort(); }, 100);
  try {
    const workers = Array.from({length: Math.min(6, groups.length)}, async () => {
      while (next < groups.length) {
        check();
        const [model, rows] = groups[next++];
        const {modelBuffer, texturePack} = await readAssets(model, rows, signal);
        check();
        const loader = makeLoader(state.scene, texturePack);
        for (const [index, placement] of rows.entries()) {
          check();
          const roots = await loader.load(modelBuffer, texturePack);
          preparePlacementRoots(roots, placement, index, state);
          check();
          auditRows.push(...auditRuntimePlacementRoots(placement, roots));
          const behavior = jomoObjectBehavior(model, placement.runtime?.objectTag, placement.runtime);
          for (const root of roots) {
            // The gameplay door owner snaps authored endpoints at registration.
            if (behavior.kind === "swing-door" && Number.isFinite(behavior.closedYawDegrees)
                && Number.isFinite(behavior.openYawDegrees)) {
              const rotation = [...(placement.rotationDegrees || [0, 0, 0])];
              rotation[1] = behavior.initialState === "open" ? behavior.openYawDegrees : behavior.closedYawDegrees;
              setSourceOrderRotation(root, rotation.map(Tools.ToRadians));
            }
            if (!placementInitiallyEnabled(placement, world.id, behavior)) root.setEnabled(false);
          }
        }
        advance();
      }
    });
    const results = await Promise.allSettled(workers);
    if (cancelled()) return;
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    const audit = summarizeRuntimePlacementAudit(world.placements || [], auditRows);
    if (audit.status !== "verified") throw new Error(`Failed to place ${audit.failedRecordCount} object(s) in ${world.label}.`);
    await scheduled.load(world.id, advance, signal);
    if (!cancelled()) state.viewerPlacementAudit = audit;
  } finally {
    clearInterval(monitor);
    controller.abort();
  }
}
