import catalog from "../data/story-regions.json" with { type: "json" };

/** Poll small authored areas; the server independently validates position and
 * eligibility. No native-room fallback is permitted for this dispatch family.
 */
export class StoryRegionRuntime {
  constructor({ controller, getCharacter, publishPresence, onError = console.error, regions = catalog.regions }) {
    this.controller = controller;
    this.getCharacter = getCharacter;
    this.publishPresence = publishPresence;
    this.onError = onError;
    this.regions = regions;
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
      if (region.area !== area) continue;
      const inside = position.every((value, axis) => value >= region.min[axis] && value <= region.max[axis]);
      if (!inside) { this.inside.delete(region.id); continue; }
      if (this.inside.has(region.id) || character.storyFlags?.[region.completedFlag]
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
