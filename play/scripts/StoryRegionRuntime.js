import catalog from "../data/story-regions.json" with { type: "json" };

/** Poll small authored areas; the server independently validates position and
 * eligibility. No native-room fallback is permitted for this dispatch family.
 */
export class StoryRegionRuntime {
  constructor({ controller, getCharacter, getGameDate = () => null, publishPresence, onError = console.error, regions = catalog.regions }) {
    this.controller = controller;
    this.getCharacter = getCharacter;
    this.getGameDate = getGameDate;
    this.publishPresence = publishPresence;
    this.onError = onError;
    this.regions = regions;
    for(const region of regions)if(region.hours&&(!Array.isArray(region.hours)||region.hours.length!==2
      ||region.hours.some(hour=>!Number.isFinite(hour)||hour<0||hour>24)||region.hours[0]===24||region.hours[0]===region.hours[1]))throw new Error(`Invalid story region hours: ${region.id}`);
    this.inside = new Set();
    this.contextKey = null;
    this.generation = 0;
  }
  reset() { this.generation++; this.inside.clear(); this.contextKey = null; }
  update({ area, playerPosition, enabled }) {
    const position = Array.isArray(playerPosition) ? playerPosition
      : playerPosition ? [playerPosition.x, playerPosition.y, playerPosition.z] : null;
    const character = this.getCharacter();
    const key = character ? `${character.id}:${character.modeRevision}:${area}` : null;
    if (key !== this.contextKey) { this.reset(); this.contextKey = key; }
    if (!character || character.playMode !== "story" || !character.openingCompleted || !enabled
      || !position || position.length !== 3 || !position.every(Number.isFinite)) return false;
    for (const region of this.regions) {
      // Use-only bounds authorize a selected world object on the server; merely
      // walking nearby must not start its interaction or consume entry dispatch.
      if (region.trigger === "use") continue;
      if (region.area !== area) continue;
      if (region.hours) {
        const date=this.getGameDate();
        const hour=date instanceof Date ? date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600 : NaN;
        const [start,end]=region.hours;
        const eligible=Number.isFinite(hour)&&(start<end ? hour>=start&&hour<end : hour>=start||hour<end);
        // A declined daytime request must not consume tomorrow/nighttime
        // eligibility while the player waits in the same physical volume.
        // This is dispatch only; Yarn independently checks the personal clock.
        if(!eligible){this.inside.delete(region.id);continue;}
      }
      const inside = position.every((value, axis) => value >= region.min[axis] && value <= region.max[axis]);
      if (!inside) { this.inside.delete(region.id); continue; }
      if (this.inside.has(region.id) || character.storyFlags?.[region.completedFlag]
        || (region.requiredFlags || []).some(flag => character.storyFlags?.[flag] !== true)
        || this.controller.status !== "idle") continue;
      this.inside.add(region.id);
      this.publishPresence();
      const generation = this.generation;
      void this.controller.start({ kind: "enter" }, { area }).then(result => {
        if (generation === this.generation && result?.outcome === "rejected") this.onError(result.error);
      }).catch(error => { if (generation === this.generation) this.onError(error); });
      return true;
    }
    return false;
  }
}
