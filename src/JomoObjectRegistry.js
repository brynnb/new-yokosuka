import { DRAWER_OPEN_DISTANCE } from "./RuntimeObjectAnimation.js";
import { JOMO_POSITION_X_PAIRS } from "./generated/JomoObjectActionBindings.js";
import { oldWarehouseDoorRole } from "./OldWarehouseDoors.js";

// The native selector trace proves that these paired leaves translate on X.
// The SCN3 action-route number is not an MT5 node flag, so pair it with the
// independently audited moving child in each model.
const POSITION_X_PANEL_RENDER_NODE_BY_TAG = Object.freeze({
  D1C3: Object.freeze({ model: "S1_JOMO_CHSS501G.MT5", renderNodeKey: 13 }),
  D1C4: Object.freeze({ model: "S1_JOMO_CHSS500G.MT5", renderNodeKey: 8 }),
  TAN1: Object.freeze({ model: "S1_JOMO_HIKR102G.MT5", renderNodeKey: 8 }),
  TAN2: Object.freeze({ model: "S1_JOMO_HIKR103G.MT5", renderNodeKey: 13 }),
  GGB1: Object.freeze({ model: "S1_JOMO_TOBT201G.MT5", renderNodeKey: 13 }),
  GGB2: Object.freeze({ model: "S1_JOMO_TOBT202G.MT5", renderNodeKey: 8 }),
  IMC3: Object.freeze({ model: "S1_JOMO_CHSS501G.MT5", renderNodeKey: 13 }),
  IMC4: Object.freeze({ model: "S1_JOMO_CHSS500G.MT5", renderNodeKey: 8 }),
  DND1: Object.freeze({ model: "S1_JOMO_TUDT202G.MT5", renderNodeKey: 8 }),
  DND2: Object.freeze({ model: "S1_JOMO_TUDT203G.MT5", renderNodeKey: 13 }),
});

const DRAWER_TRAVEL_BY_MODEL = Object.freeze({
  "S1_JOMO_TANM4W3G.MT5": DRAWER_OPEN_DISTANCE,
  "S1_JOMO_TANM4W4G.MT5": DRAWER_OPEN_DISTANCE,
  "S1_JOMO_DESM402G.MT5": 0.32,
  "S1_JOMO_DESM403G.MT5": 0.32,
  "S1_JOMO_BUTM401G.MT5": 0.45,
  "S1_JOMO_BUTM403G.MT5": 0.45,
  "S1_JOMO_HIKR101G.MT5": DRAWER_OPEN_DISTANCE,
  "S1_JOMO_CHDS500G.MT5": DRAWER_OPEN_DISTANCE,
  "S1_JOMO_HIKW101G.MT5": DRAWER_OPEN_DISTANCE,
});

const HINGED_DOOR_MODELS = new Set([
  "S1_JOMO_TANM402G.MT5",
  "S1_JOMO_BUTM402G.MT5",
  "S1_JOMO_CHSS500G.MT5",
  "S1_JOMO_CHSS501G.MT5",
  "S1_JOMO_TUDT202G.MT5",
  "S1_JOMO_TUDT203G.MT5",
  "S1_JOMO_HIKR102G.MT5",
  "S1_JOMO_HIKR103G.MT5",
  "S1_JOMO_TO1W101G.MT5",
  "S1_JOMO_TO2W101G.MT5",
  "S1_JOMO_TVDS500G.MT5",
  "S1_JOMO_TNBR101G.MT5",
  "S1_JOMO_TNBR102G.MT5",
]);

const REFRIGERATOR_DOOR_MODELS = new Set([
  "S1_JOMO_REIO101G.MT5",
  "S1_JOMO_REIO102G.MT5",
]);

const BETD_OPEN_DOOR_BY_TAG = Object.freeze({
  DORR: Object.freeze({
    model: "S1_BETD_DDRR1001.MT5",
    closedYawDegrees: 0,
    openYawDegrees: 80,
  }),
  DORL: Object.freeze({
    model: "S1_BETD_DDRR1002.MT5",
    closedYawDegrees: 0,
    // MAPINFO stores 280 degrees; -80 is the equivalent shortest arc.
    openYawDegrees: -80,
  }),
});

const BETD_INSPECT_LABEL_BY_MODEL = Object.freeze({
  "S1_BETD_DKTR101G.MT5": "Dojo entrance",
  "S1_BETD_GART201G.MT5": "Hazuki dojo sign",
  "S1_BETD_KAKS505G.MT5": "Hanging scroll",
  "S1_BETD_KAKS509G.MT5": "Hanging scroll",
});

const D000_INSPECT_LABEL_BY_MODEL = Object.freeze({
  "S1_D000_OMG_TELM402G.MT5": "Telephone booth",
  "S1_D000_OMG_JIHS5GTG.MT5": "Vending machine",
  "S1_D000_OMG_GAT02L0G.MT5": "Capsule toy machine",
  "S1_D000_OMG_GAT02L3G.MT5": "Capsule toy machine",
  "S1_D000_OMG_GACM400G.MT5": "Capsule toy",
  "S1_D000_OMG_DENS501G.MT5": "Examine",
  "S1_D000_OMG_HTL02DBG.MT5": "Examine",
  "S1_D000_OMG_SEGM4SPG.MT5": "Examine",
  "S1_D000_OMG_TKO0101G.MT5": "Examine",
  "S1_D000_OMG_TKO0102G.MT5": "Examine",
  "S1_D000_OMG_WAGS500G.MT5": "Examine",
});

const D000_INTERACTION_EMOTE_BY_MODEL = Object.freeze({
  "S1_D000_OMG_DENS501G.MT5": "dobuitaPhoneBook",
  "S1_D000_OMG_GACM400G.MT5": "dobuitaGacha",
  "S1_D000_OMG_GAT02L0G.MT5": "dobuitaGacha",
  "S1_D000_OMG_GAT02L3G.MT5": "dobuitaGacha",
  "S1_D000_OMG_JIHS5GTG.MT5": "dobuitaNoMoney",
  "S1_D000_OMG_TELM402G.MT5": "touchForehead",
});

const INSPECT_LABEL_BY_TAG = Object.freeze({
  IWKJ: "Hanging scroll",
  BMKJ: "Hanging scroll",
  KIKJ: "Hanging scroll",
  IGAK: "Framed picture",
  FGAK: "Framed picture",
  TGAK: "Framed picture",
  KGK1: "Framed picture",
  KGK2: "Framed picture",
  kpic: "Framed picture",
  _pc1: "Framed picture",
  _pc3: "Framed picture",
  TRNE: "Mirror",
  TEL_: "Telephone",
  rrad: "Cassette player",
  ptpm: "Photograph",
  kclk: "Clock",
  lclk: "Clock",
  gclk: "Clock",
  HANA: "Flowers",
});

const INSPECT_MODELS = new Set([
  "S1_JOMO_KAKS503G.MT5",
  "S1_JOMO_KAKS504G.MT5",
  "S1_JOMO_KAKS508G.MT5",
  "S1_JOMO_YUKS510G.MT5",
  "S1_JOMO_YUKS511G.MT5",
  "S1_JOMO_YUKS512G.MT5",
  "S1_JOMO_YUKS513G.MT5",
  "S1_JOMO_YUKS514G.MT5",
  "S1_JOMO_YUKS515G.MT5",
  "S1_JOMO_YUKS516G.MT5",
  "S1_JOMO_YUKS517G.MT5",
  "S1_JOMO_KAIR101G.MT5",
  "S1_JOMO_TUBT2051.MT5",
  "S1_JOMO_TUBS205G.MT5",
  "S1_JOMO_KAGT211G.MT5",
  "S1_JOMO_ZALS500G.MT5",
  "S1_JOMO_YAKM400G.MT5",
  "S1_JOMO_FLYM400G.MT5",
  "S1_JOMO_YUNK300G.MT5",
  "S1_JOMO_BTAS500G.MT5",
  "S1_JOMO_DOUK300G.MT5",
  "S1_JOMO_MALS530G.MT5",
  "S1_JOMO_HIMT203G.MT5",
  "S1_JOMO_HIMT204G.MT5",
  "S1_JOMO_CASS500G.MT5",
  "S1_JOMO_MTPK6MTG.MT5",
  "S1_JOMO_MATM400G.MT5",
  "S1_JOMO_BUTM408G.MT5",
  "S1_JOMO_SSTS500G.MT5",
  "S1_JOMO_MLKS301G.MT5",
  "S1_JOMO_NIPK302G.MT5",
  "S1_JOMO_CLOS5003.MT5",
  "S1_JOMO_TMKR101G.MT5",
  "S1_JOMO_MKIS3C1G.MT5",
  "S1_JOMO_TELS514G.MT5",
]);

export function jomoObjectBehavior(model, objectTag, evidence = {}) {
  if (
    evidence.stateDependent === true
    && typeof evidence.authoredMovementFile === "string"
  ) {
    return {
      kind: "state-dependent-cutscene-prop",
      initiallyEnabled: false,
      evidence: "native runtime placement state",
    };
  }
  if (
    /(?:^|_)JIHS5(?:GT|KR)G\.MT5$/i.test(model)
    && /^(?:VM_|JIH)/i.test(objectTag || "")
  ) {
    return {
      kind: "vending-machine",
      label: "Drink vending machine",
      evidence: "vending-machines.json",
    };
  }
  if (
    model === "S1_D000_OMG_SEGM4SPG.MT5"
    && objectTag === "DAMY"
  ) {
    return {
      kind: "passive-anchor",
      initiallyEnabled: false,
      evidence: "d000-passive-anchor.json",
    };
  }
  if (
    model === "S1_JU00_DR29_000.MT5"
    && evidence.staticDoorIndex === 18
  ) {
    return {
      kind: "exterior-transition-door",
      renderNodeKeys: [7, 12],
      evidence: "ju00-runtime-placements.json",
    };
  }
  if (
    model === "S1_D000_OMG_HTL02DBG.MT5"
    && objectTag === "HDCA"
  ) {
    return {
      kind: "passive-scenery",
      evidence: "d000-static-fixtures.json",
    };
  }
  if (
    model === "S1_D000_OMG_WAGS500G.MT5"
    && objectTag === "WAGK"
  ) {
    return {
      kind: "state-dependent-cutscene-prop",
      initiallyEnabled: true,
      evidence: "d000-static-fixtures.json",
    };
  }
  const betdDoor = BETD_OPEN_DOOR_BY_TAG[objectTag];
  if (betdDoor?.model === model) {
    return {
      kind: "swing-door",
      closedYawDegrees: betdDoor.closedYawDegrees,
      openYawDegrees: betdDoor.openYawDegrees,
      initialState: "open",
    };
  }
  if (BETD_INSPECT_LABEL_BY_MODEL[model]) {
    return {
      kind: "inspect",
      label: BETD_INSPECT_LABEL_BY_MODEL[model],
    };
  }
  if (D000_INSPECT_LABEL_BY_MODEL[model]) {
    const behavior = {
      kind: "inspect",
      label: D000_INSPECT_LABEL_BY_MODEL[model],
    };
    if (D000_INTERACTION_EMOTE_BY_MODEL[model]) {
      behavior.interactionEmoteId = D000_INTERACTION_EMOTE_BY_MODEL[model];
    }
    if (
      model === "S1_D000_OMG_TKO0101G.MT5"
      && (objectTag === "TKOK" || objectTag === "TKOL")
    ) {
      behavior.initiallyEnabled = objectTag === "TKOK";
      behavior.ambientAnimation = {
        kind: "d000-tko-node-spin",
        renderNodeKey: 152,
        sourceFixedTurnsPerTick: -910,
        gameHz: 30,
        autoPlay: objectTag === "TKOK",
        evidence: "d000-tko-node-spin.json",
      };
    }
    if (
      model === "S1_D000_OMG_TKO0102G.MT5"
      && (objectTag === "TKOM" || objectTag === "TKON")
    ) {
      behavior.initiallyEnabled = objectTag === "TKON";
      behavior.stateTransitionAnimation = {
        kind: "d000-tko-node-slowdown",
        renderNodeKey: 152,
        counterTicks: 40,
        sourceFixedTurnsPerTick: {
          initial: -888,
          final: -30,
          step: 22,
        },
        autoPlay: false,
        evidence: "d000-tko-node-slowdown.json",
      };
      behavior.initialStateEvidence = "d000-tko-initial-state.json";
      behavior.stateMachineEvidence = "d000-tko-state-machine.json";
    }
    return behavior;
  }
  if (
    /^S1_D000_DR/i.test(model)
    && Number.isInteger(evidence.staticDoorIndex)
    && evidence.staticDoorType === 2
  ) {
    return {
      kind: "d000-door",
      renderNodeKey: 12,
      alternateRenderNodeKey: 7,
      endpointFixedTurnMagnitude: 16679,
      evidence: "d000-selector-53-door-call-trace.json",
      routeEvidence: "d000-door-node-route.json",
    };
  }
  if (evidence.nativeStaticTransition === true) {
    return {
      kind: "passive-transition-anchor",
      evidence: "exact-door-model-audit.json",
    };
  }
  if (
    evidence.nativeInteriorDoor === true
    && /^S[123]_[A-Z0-9]{4}_DR\d{2}[_-]\d{3}\.MT5$/i.test(model)
  ) {
    return {
      kind: "d000-door",
      renderNodeKey: 12,
      alternateRenderNodeKey: 7,
      endpointFixedTurnMagnitude: 16679,
      evidence: "map-transition-objects.json",
      routeEvidence: "interior-door-model-audit.json",
    };
  }
  if (
    model === "S2_MFSY_DR02_021.MT5"
    && Number.isInteger(evidence.staticDoorIndex)
    && evidence.staticDoorType === 2
  ) {
    return {
      kind: "d000-door",
      renderNodeKey: 12,
      alternateRenderNodeKey: 7,
      endpointFixedTurnMagnitude: 16679,
      evidence: "d000-selector-53-door-call-trace.json",
      routeEvidence: "mfsy-static-door-node12.json",
    };
  }
  if (
    model === "S1_JD00_DR15_024.MT5"
    && evidence.staticDoorIndex === 0
  ) {
    return {
      kind: "d000-door",
      renderNodeKey: 12,
      alternateRenderNodeKey: 7,
      endpointFixedTurnMagnitude: 16679,
      evidence: "jd00-runtime-placements.json",
      routeEvidence: "jabe-door-to-jd00-entry-3",
    };
  }
  if (
    model === "S2_MKSG_DR02_021.MT5"
    && Number.isInteger(evidence.runtimeDoorIndex)
  ) {
    const role = oldWarehouseDoorRole(objectTag);
    return {
      kind: "d000-door",
      renderNodeKey: 12,
      alternateRenderNodeKey: 7,
      endpointFixedTurnMagnitude: 16679,
      evidence: "d000-selector-53-door-call-trace.json",
      routeEvidence: "mksg-runtime-placements.json",
      lockedMessage: role?.kind === "locked-warehouse"
        ? role.label
        : null,
      warehouseDoorRole: role?.kind || null,
    };
  }
  if (
    model === "S2_MS08_DR02_021.MT5"
    && evidence.staticDoorIndex === 0
  ) {
    return {
      kind: "d000-door",
      renderNodeKey: 12,
      alternateRenderNodeKey: 7,
      endpointFixedTurnMagnitude: 16679,
      evidence: "MS08 MAPINFO DOOR record at 0x2b0bc",
      routeEvidence: "mfsy-static-door-node12.json",
    };
  }
  if (
    model === "S1_JHD0_DR15_016.MT5"
    && /^dor0$/i.test(objectTag || "")
  ) {
    return {
      kind: "sliding-door",
      renderNodeKey: 7,
      evidence: "jomo-front-door-map-transition.json",
    };
  }
  if (
    model === "S1_JHD0_DR29_000.MT5"
    && /^dor1$/i.test(objectTag || "")
  ) {
    return {
      kind: "exterior-transition-door",
      renderNodeKeys: [7, 12],
      evidence: "jhd0-exterior-door-placements.json",
    };
  }
  const drawerTravel = DRAWER_TRAVEL_BY_MODEL[model];
  if (drawerTravel !== undefined) {
    return { kind: "drawer", travel: drawerTravel };
  }
  const pairedPanel = JOMO_POSITION_X_PAIRS[objectTag];
  const panelRenderNode = POSITION_X_PANEL_RENDER_NODE_BY_TAG[objectTag];
  if (pairedPanel && panelRenderNode?.model === model) {
    return {
      kind: "paired-sliding-panel",
      pairId: pairedPanel.pairId,
      partnerTag: pairedPanel.partnerTag,
      renderNodeKey: panelRenderNode.renderNodeKey,
      actionRouteNodeOrVariant: pairedPanel.actionRouteNodeOrVariant,
      evidence: "jomo-object-action-bindings.json",
    };
  }
  if (HINGED_DOOR_MODELS.has(model)) {
    return { kind: "hinged-door" };
  }
  if (REFRIGERATOR_DOOR_MODELS.has(model)) {
    return { kind: "swing-door" };
  }
  const provenDoorPlacement = (
    /^dor\d$/i.test(objectTag || "")
    || Number.isInteger(evidence.staticDoorIndex)
  );
  if (/^S1_JOMO_DR01_/i.test(model) && provenDoorPlacement) {
    return { kind: "swing-door" };
  }
  if (/^S1_JOMO_DR/i.test(model) && provenDoorPlacement) {
    return { kind: "sliding-door" };
  }
  if (model === "S1_JOMO_CLKS501G.MT5" && objectTag === "TOKE") {
    return { kind: "alarm-clock" };
  }
  if (INSPECT_MODELS.has(model)) {
    return {
      kind: "inspect",
      label: INSPECT_LABEL_BY_TAG[objectTag] || "Examine",
    };
  }
  // Every live JOMO TASK tag identifies an authored scene object even when
  // its exact story-state callback has not yet been decoded. Keep those
  // objects clickable without inventing mechanical motion. This is
  // intentionally scoped to JOMO so a coincidental four-byte tag in another
  // zone cannot silently acquire behavior.
  if (/^S1_JOMO_/i.test(model) && objectTag) {
    return {
      kind: "inspect",
      label: INSPECT_LABEL_BY_TAG[objectTag] || "Examine",
    };
  }
  return { kind: "none" };
}
