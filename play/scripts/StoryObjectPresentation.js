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
  constructor({getCharacter, rules = catalog.rules, surfaces = catalog.surfaces}) {
    this.getCharacter = getCharacter;
    this.rules = rules;
    this.surfaces = surfaces;
    this.activeSurfaces = [];
    for (const surface of surfaces) {
      if (!/^[A-Z0-9]{4}$/.test(surface.area) || !/^[A-Z0-9_]{4}$/.test(surface.object)
        || !Array.isArray(surface.models) || !surface.models.length || !surface.models.every(model => typeof model === "string" && model.length > 0)
        || ![surface.requiredFlags, surface.excludedFlags].every(Array.isArray)
        || ![...surface.requiredFlags, ...surface.excludedFlags].every(flag => typeof flag === "string" && flag.length > 0)
        || ![surface.min, surface.max].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))
        || surface.min.some((v, i) => v > surface.max[i])) throw Error(`Invalid Story surface ${surface.area}:${surface.object}`);
    }
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
    this.activeSurfaces = character?.playMode === "story" && character.openingCompleted
      ? this.surfaces.filter(surface => surface.area === this.area
        && surface.requiredFlags.every(flag => character.storyFlags?.[flag] === true)
        && surface.excludedFlags.every(flag => character.storyFlags?.[flag] !== true)) : [];
    const key = `${character?.id}:${character?.modeRevision}:${active.map(rule => rule.flag).join(",")}`;
    if (key === this.key) return false;
    this.restore?.();
    this.restore = null;
    this.key = null;
    if (active.length) this.restore = applyStoryObjectTransforms(this.roots, active.flatMap(rule => rule.transforms));
    this.key = key;
    return true;
  }

  isSurfaceMesh(mesh) {
    for (let node = mesh; node; node = node.parent) {
      if (this.activeSurfaces.some(surface => surface.models.includes(node._filename))) return true;
    }
    return false;
  }

  pickSurface(pick) {
    if (!pick?.hit || !pick.pickedPoint || !this.isSurfaceMesh(pick.pickedMesh)) return null;
    const point = pick.pickedPoint, values = [point.x, point.y, point.z];
    const matches = this.activeSurfaces.filter(surface => {
      let sourceMatches = false;
      for (let node = pick.pickedMesh; node; node = node.parent) if (surface.models.includes(node._filename)) sourceMatches = true;
      return sourceMatches && values.every((v, i) => v >= surface.min[i] && v <= surface.max[i]);
    });
    if (matches.length > 1) throw Error("Ambiguous authored Story surface");
    const surface = matches[0];
    // A logical interaction on real rendered geometry, not a new scene mesh or
    // save system. The server independently checks accepted player proximity.
    return surface ? {objectTag: surface.object, root: pick.pickedMesh,
      position: point} : null;
  }

  clear() {
    this.restore?.();
    this.restore = null;
    this.key = null;
    this.area = null;
    this.roots = [];
    this.activeSurfaces = [];
  }
}
