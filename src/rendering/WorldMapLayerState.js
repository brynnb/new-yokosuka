import { timeOfDayIndexForDate } from "../WorldTime.js";
import {
  evaluateNativeMapLayerStates,
  nativeMapLayerDefinition,
  numberedMapLayer,
} from "./NativeMapLayerState.js";

export function evaluateTimedMapLayerStates(definition, date) {
  const states = new Map();
  if (!definition || !(date instanceof Date)) return states;
  const daytime = timeOfDayIndexForDate(date) < 2;
  for (const pair of definition.dayEveningPairs || []) {
    const [dayLayer, eveningLayer] = pair;
    states.set(dayLayer, daytime ? 1 : 0);
    states.set(eveningLayer, daytime ? 0 : 1);
  }
  for (const nightLayer of definition.nightOnlyLayers || []) {
    states.set(nightLayer, daytime ? 0 : 1);
  }
  return states;
}

function timedLayerDefinition(world) {
  const definition = world?.timedMapLayers;
  if (!definition) return null;
  const controlledLayers = new Set([
    ...(definition.dayEveningPairs || []).flat(),
    ...(definition.nightOnlyLayers || []),
  ]);
  return {
    modelPrefix: definition.modelPrefix,
    controlledLayers: [...controlledLayers],
    dayEveningPairs: definition.dayEveningPairs,
    nightOnlyLayers: definition.nightOnlyLayers,
  };
}

export class WorldMapLayerState {
  constructor() {
    this.area = null;
    this.definition = null;
    this.native = false;
    this.meshesByLayer = new Map();
    this.layerByRoot = new Map();
    this.lastMinute = null;
    this.states = new Map();
    this.baseStates = new Map();
    this.scriptStates = new Map();
  }

  clear() {
    this.area = null;
    this.definition = null;
    this.native = false;
    this.meshesByLayer.clear();
    this.layerByRoot.clear();
    this.lastMinute = null;
    this.states.clear();
    this.baseStates.clear();
    this.scriptStates.clear();
  }

  load(world, meshes, date) {
    this.clear();
    const area = String(world?.nativeArea || "").toUpperCase();
    const nativeDefinition = nativeMapLayerDefinition(area);
    this.area = area;
    this.native = Boolean(nativeDefinition);
    this.definition = nativeDefinition || timedLayerDefinition(world);
    if (!this.definition) return false;

    for (const mesh of meshes) {
      const layer = numberedMapLayer(
        mesh._filename,
        this.definition.modelPrefix,
      );
      if (
        layer === null
        || !this.definition.controlledLayers.includes(layer)
      ) {
        continue;
      }
      if (!this.meshesByLayer.has(layer)) {
        this.meshesByLayer.set(layer, []);
      }
      this.meshesByLayer.get(layer).push(mesh);
      this.layerByRoot.set(mesh, layer);
    }
    this.update(date, true);
    return true;
  }

  update(date, force = false) {
    if (!this.definition || !(date instanceof Date)) return false;
    const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
    if (!force && minute === this.lastMinute) return false;
    this.lastMinute = minute;
    const timedStates = this.native
      ? evaluateNativeMapLayerStates(this.area, date)
      : evaluateTimedMapLayerStates(this.definition, date);
    this.baseStates = timedStates;
    const states = new Map([
      ...timedStates,
      ...this.scriptStates,
    ]);
    this.applyStates(states);
    return true;
  }

  applyStates(states) {
    for (const [layer, value] of states) {
      const active = value !== 0;
      for (const mesh of this.meshesByLayer.get(layer) || []) {
        if (!mesh.isDisposed?.()) mesh.setEnabled(active);
      }
    }
    this.states = states;
  }

  scriptState(layer) {
    return this.scriptStates.has(layer)
      ? { present: true, value: this.scriptStates.get(layer) }
      : { present: false, value: null };
  }

  setScriptState(layer, value) {
    if (!Number.isInteger(layer) || layer < 0 || layer >= 32) {
      throw new RangeError("native MAP layer must be between 0 and 31");
    }
    if (!Number.isInteger(value)) {
      throw new TypeError("native MAP layer state must be an integer");
    }
    this.scriptStates.set(layer, value);
    this.applyStates(new Map([
      ...this.baseStates,
      ...this.scriptStates,
    ]));
  }

  restoreScriptState(layer, previous) {
    if (previous?.present) {
      this.scriptStates.set(layer, previous.value);
    } else {
      this.scriptStates.delete(layer);
    }
    this.applyStates(new Map([
      ...this.baseStates,
      ...this.scriptStates,
    ]));
  }

  activeLayerForMesh(mesh) {
    for (let node = mesh; node; node = node.parent) {
      const layer = this.layerByRoot.get(node);
      if (layer === undefined) continue;
      return this.states.get(layer) !== 0 ? layer : null;
    }
    return null;
  }
}
