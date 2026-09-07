import {
  supportedDobuitaInteriorTransitions,
} from "../../src/DobuitaInteriorTransitions.js";

const BASE_AREA_WORLDS = Object.freeze({
  JHD0: "exterior",
  JOMO: "interior",
  JU00: "yamanose",
  JD00: "sakuragaoka",
  D000: "dobuita",
  MFSY: "mfsy",
  MKSG: "mksg",
  MS08: "ms08",
  JABE: "jabe",
  MKYU: "mkyu",
  MS8S: "ms8s",
});

export function scheduledActorAreaWorlds(nativeMapTransitions) {
  const areaWorlds = { ...BASE_AREA_WORLDS };
  for (const transition of supportedDobuitaInteriorTransitions(
    nativeMapTransitions,
  )) {
    const area = transition.destination?.area;
    const worldId = transition.destination?.worldId;
    if (!area || !worldId || !transition.destination?.browserSpawn) {
      throw new Error(
        `Supported Dobuita transition ${transition.id || "<unknown>"} `
        + "does not define a renderable destination.",
      );
    }
    if (areaWorlds[area] && areaWorlds[area] !== worldId) {
      throw new Error(
        `Conflicting scheduled-actor world mappings for ${area}: `
        + `${areaWorlds[area]} and ${worldId}.`,
      );
    }
    areaWorlds[area] = worldId;
  }
  return Object.freeze(areaWorlds);
}
