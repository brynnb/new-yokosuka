import catalog from "../data/authored-story-objects.json" with {type: "json"};
import {markWorldMeshDynamic} from "../../src/rendering/SceneSpatialIndex.js";

function resolveRoot(roots, tag) {
  const matches = roots.filter(root => !root.isDisposed?.()
    && root._runtimePlacementRecord?.runtime?.objectTag === tag);
  if (matches.length !== 1) throw Error(`Story object ${tag}: expected one placement, found ${matches.length}`);
  return matches[0];
}

// Read the server's existing story flags, never another save store. The same
// transform primitive serves temporary, cancellable inspection tableaus.
export function applyStoryObjectTransforms(roots, transforms) {
  const entries = transforms.map(transform => {
    if (typeof transform.object !== "string" || !transform.object
      || (transform.visible != null && typeof transform.visible !== "boolean")
      || (transform.offset != null && (!Array.isArray(transform.offset)
        || transform.offset.length !== 3 || !transform.offset.every(Number.isFinite)))) {
      throw Error("Invalid Story object transform");
    }
    const root = resolveRoot(roots, transform.object);
    return {root, transform, position: root.position.clone(), enabled: root.isEnabled(false)};
  });
  const restore = () => {
    for (const {root, position, enabled} of entries) {
      if (root.isDisposed?.()) continue;
      root.position.copyFrom(position);
      root.setEnabled(enabled);
      root.computeWorldMatrix(true);
    }
  };
  try {
    for (const {root, transform} of entries) {
      // Runtime placements may have frozen matrices or indexed static bounds.
      // Transfer the hierarchy to the existing dynamic owner before moving it.
      for (const node of [root, ...(root.getDescendants?.(false) || [])]) markWorldMeshDynamic(node);
      if (transform.offset) root.position.addInPlaceFromFloats(...transform.offset);
      if (transform.visible != null) root.setEnabled(transform.visible);
      root.computeWorldMatrix(true);
    }
  } catch (error) { restore(); throw error; }
  return restore;
}

export class StoryObjectPresentation {
  constructor({getCharacter, rules = catalog.rules}) {
    this.getCharacter = getCharacter;
    this.rules = rules;
    this.area = null;
    this.roots = [];
    this.key = null;
    this.restore = null;
  }

  load(area, roots) {
    this.clear();
    this.area = area;
    this.roots = roots;
    this.update();
  }

  update() {
    const character = this.getCharacter();
    const rules = this.rules.filter(rule => rule.area === this.area);
    const active = character?.playMode === "story" && character.openingCompleted
      ? rules.filter(rule => character.storyFlags?.[rule.flag] === true) : [];
    const key = `${character?.id}:${character?.modeRevision}:${active.map(rule => rule.flag).join(",")}`;
    if (key === this.key) return false;
    this.restore?.();
    this.restore = null;
    this.key = null;
    if (active.length) this.restore = applyStoryObjectTransforms(this.roots, active.flatMap(rule => rule.transforms));
    this.key = key;
    return true;
  }

  clear() {
    this.restore?.();
    this.restore = null;
    this.key = null;
    this.area = null;
    this.roots = [];
  }
}
