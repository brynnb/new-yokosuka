import assert from "node:assert/strict";
import test from "node:test";
import { DRAWER_OPEN_DISTANCE } from "../src/RuntimeObjectAnimation.js";
import { jomoObjectBehavior } from "../src/JomoObjectRegistry.js";

test("classifies the recovered JOMO drawer families", () => {
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_TANM4W3G.MT5", "ATS1"),
    { kind: "drawer", travel: DRAWER_OPEN_DISTANCE },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_DESM402G.MT5", "AKD2"),
    { kind: "drawer", travel: 0.32 },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_BUTM403G.MT5", "BMB1"),
    { kind: "drawer", travel: 0.45 },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_CHDS500G.MT5", "D1C1"),
    { kind: "drawer", travel: DRAWER_OPEN_DISTANCE },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_HIKW101G.MT5", "IKD1"),
    { kind: "drawer", travel: DRAWER_OPEN_DISTANCE },
  );
});

test("classifies cabinet, room-door, and clock behavior by model and tag", () => {
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_TANM402G.MT5", "ATS7"),
    { kind: "hinged-door" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_DR15_028.MT5", "dor3"),
    { kind: "sliding-door" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_DR01_015.MT5", "dor7"),
    { kind: "swing-door" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_REIO101G.MT5", "DDR1"),
    { kind: "swing-door" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_REIO102G.MT5", "DDR2"),
    { kind: "swing-door" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_CHSS500G.MT5", "D1C4"),
    {
      kind: "paired-sliding-panel",
      pairId: "D1C",
      partnerTag: "D1C3",
      renderNodeKey: 0x08,
      actionRouteNodeOrVariant: 0x06,
      evidence: "jomo-object-action-bindings.json",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_TOBT201G.MT5", "GGB1"),
    {
      kind: "paired-sliding-panel",
      pairId: "GGB",
      partnerTag: "GGB2",
      renderNodeKey: 0x0d,
      actionRouteNodeOrVariant: 0x0d,
      evidence: "jomo-object-action-bindings.json",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_TO1W101G.MT5", "DDG1"),
    { kind: "hinged-door" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_TNBR102G.MT5", "itbL"),
    { kind: "hinged-door" },
  );
  assert.deepEqual(
    jomoObjectBehavior(
      "S1_JOMO_DR15_016.MT5",
      null,
      { staticDoorIndex: 14 },
    ),
    { kind: "sliding-door" },
  );
  assert.deepEqual(
    jomoObjectBehavior(
      "S1_JOMO_DR01_016.MT5",
      null,
      { staticDoorIndex: 5 },
    ),
    { kind: "swing-door" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_CLKS501G.MT5", "TOKE"),
    { kind: "alarm-clock" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_KAKS503G.MT5", "IWKJ"),
    { kind: "inspect", label: "Hanging scroll" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_YUKS510G.MT5", "IGAK"),
    { kind: "inspect", label: "Framed picture" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_YAKM400G.MT5", "DDYK"),
    { kind: "inspect", label: "Examine" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_TELS514G.MT5", "TEL_"),
    { kind: "inspect", label: "Telephone" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_CASS500G.MT5", "rrad"),
    { kind: "inspect", label: "Cassette player" },
  );
});

test("uses the offline selector-10 trace for all paired position-X panels", () => {
  const cases = [
    ["S1_JOMO_CHSS501G.MT5", "D1C3", "D1C4", 0x0d, 0x06],
    ["S1_JOMO_CHSS500G.MT5", "D1C4", "D1C3", 0x08, 0x06],
    ["S1_JOMO_HIKR102G.MT5", "TAN1", "TAN2", 0x08, 0x08],
    ["S1_JOMO_HIKR103G.MT5", "TAN2", "TAN1", 0x0d, 0x0d],
    ["S1_JOMO_TOBT201G.MT5", "GGB1", "GGB2", 0x0d, 0x0d],
    ["S1_JOMO_TOBT202G.MT5", "GGB2", "GGB1", 0x08, 0x08],
    ["S1_JOMO_CHSS501G.MT5", "IMC3", "IMC4", 0x0d, 0x05],
    ["S1_JOMO_CHSS500G.MT5", "IMC4", "IMC3", 0x08, 0x05],
    ["S1_JOMO_TUDT202G.MT5", "DND1", "DND2", 0x08, 0x06],
    ["S1_JOMO_TUDT203G.MT5", "DND2", "DND1", 0x0d, 0x06],
  ];
  for (
    const [
      model,
      tag,
      partnerTag,
      renderNodeKey,
      actionRouteNodeOrVariant,
    ] of cases
  ) {
    assert.deepEqual(
      jomoObjectBehavior(model, tag),
      {
        kind: "paired-sliding-panel",
        pairId: tag.slice(0, -1),
        partnerTag,
        renderNodeKey,
        actionRouteNodeOrVariant,
        evidence: "jomo-object-action-bindings.json",
      },
    );
  }
});

test("does not infer mechanical animation from the shared task callback alone", () => {
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_FUTS301G.MT5", "FUT1"),
    { kind: "inspect", label: "Examine" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_DR15_028.MT5", "FUT1"),
    { kind: "inspect", label: "Examine" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_JOMO_DR15_016.MT5", null),
    { kind: "none" },
  );
});

test("uses BETD's authored open yaw for the two exterior door leaves", () => {
  assert.deepEqual(
    jomoObjectBehavior("S1_BETD_DDRR1001.MT5", "DORR"),
    {
      kind: "swing-door",
      closedYawDegrees: 0,
      openYawDegrees: 80,
      initialState: "open",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_BETD_DDRR1002.MT5", "DORL"),
    {
      kind: "swing-door",
      closedYawDegrees: 0,
      openYawDegrees: -80,
      initialState: "open",
    },
  );
});

test("classifies recovered Dobuita fixtures without guessing door motion", () => {
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_OMG_TELM402G.MT5", "TEL0"),
    {
      kind: "inspect",
      label: "Telephone booth",
      interactionEmoteId: "touchForehead",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_OMG_JIHS5GTG.MT5", "VM_0"),
    {
      kind: "vending-machine",
      label: "Drink vending machine",
      evidence: "vending-machines.json",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_OMG_DENS501G.MT5", "TBK1"),
    {
      kind: "inspect",
      label: "Examine",
      interactionEmoteId: "dobuitaPhoneBook",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_OMG_GAT02L0G.MT5", "GCH0"),
    {
      kind: "inspect",
      label: "Capsule toy machine",
      interactionEmoteId: "dobuitaGacha",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_OMG_GACM400G.MT5", "GBX0"),
    {
      kind: "inspect",
      label: "Capsule toy",
      interactionEmoteId: "dobuitaGacha",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_OMG_SEGM4SPG.MT5", "DAMY"),
    {
      kind: "passive-anchor",
      initiallyEnabled: false,
      evidence: "d000-passive-anchor.json",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_OMG_HTL02DBG.MT5", "HDCA"),
    {
      kind: "passive-scenery",
      evidence: "d000-static-fixtures.json",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_OMG_WAGS500G.MT5", "WAGK"),
    {
      kind: "state-dependent-cutscene-prop",
      initiallyEnabled: true,
      evidence: "d000-static-fixtures.json",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior(
      "S1_D000_DR02_014.MT5",
      null,
      { staticDoorIndex: 47, staticDoorType: 2 },
    ),
    {
      kind: "d000-door",
      renderNodeKey: 12,
      alternateRenderNodeKey: 7,
      endpointFixedTurnMagnitude: 16679,
      evidence: "d000-selector-53-door-call-trace.json",
      routeEvidence: "d000-door-node-route.json",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior(
      "S1_D000_DR00_002.MT5",
      null,
      { staticDoorIndex: 48, staticDoorType: 1 },
    ),
    { kind: "none" },
  );
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_DR02_014.MT5", null),
    { kind: "none" },
  );
  assert.deepEqual(
    jomoObjectBehavior(
      "S2_MFSY_DR02_021.MT5",
      null,
      { staticDoorIndex: 16, staticDoorType: 2 },
    ),
    {
      kind: "d000-door",
      renderNodeKey: 12,
      alternateRenderNodeKey: 7,
      endpointFixedTurnMagnitude: 16679,
      evidence: "d000-selector-53-door-call-trace.json",
      routeEvidence: "mfsy-static-door-node12.json",
    },
  );
  assert.deepEqual(
    jomoObjectBehavior(
      "S2_MFSY_DR00_008.MT5",
      null,
      { staticDoorIndex: 17, staticDoorType: 1 },
    ),
    { kind: "none" },
  );
  assert.deepEqual(
    jomoObjectBehavior(
      "S2_MKSG_DR02_021.MT5",
      "dor8",
      { runtimeDoorIndex: 8 },
    ),
    {
      kind: "d000-door",
      renderNodeKey: 12,
      alternateRenderNodeKey: 7,
      endpointFixedTurnMagnitude: 16679,
      evidence: "d000-selector-53-door-call-trace.json",
      routeEvidence: "mksg-runtime-placements.json",
      lockedMessage: null,
      warehouseDoorRole: "harbor-exit",
    },
  );
});

test("locks ordinary MKSG warehouses and registers the MS08 return door", () => {
  const locked = jomoObjectBehavior(
    "S2_MKSG_DR02_021.MT5",
    "dor4",
    { runtimeDoorIndex: 4 },
  );
  assert.equal(locked.kind, "d000-door");
  assert.equal(locked.warehouseDoorRole, "locked-warehouse");
  assert.equal(locked.lockedMessage, "This warehouse is locked.");

  const warehouseEight = jomoObjectBehavior(
    "S2_MKSG_DR02_021.MT5",
    "dor3",
    { runtimeDoorIndex: 3 },
  );
  assert.equal(warehouseEight.warehouseDoorRole, "warehouse-8-entrance");
  assert.equal(warehouseEight.lockedMessage, null);

  const interiorDoor = jomoObjectBehavior(
    "S2_MS08_DR02_021.MT5",
    "dor0",
    { staticDoorIndex: 0, staticDoorType: 2 },
  );
  assert.equal(interiorDoor.kind, "d000-door");
  assert.equal(interiorDoor.renderNodeKey, 12);
  assert.equal(interiorDoor.alternateRenderNodeKey, 7);
});

test("classifies new interior entrance and root-only Lounge exit behavior", () => {
  const abeEntrance = jomoObjectBehavior(
    "S1_JD00_DR15_024.MT5",
    null,
    { staticDoorIndex: 0, staticDoorType: 2 },
  );
  assert.equal(abeEntrance.kind, "d000-door");
  assert.equal(abeEntrance.renderNodeKey, 12);
  assert.equal(abeEntrance.alternateRenderNodeKey, 7);

  assert.deepEqual(
    jomoObjectBehavior(
      "S2_MKYU_DR02_001.MT5",
      "DR02_001",
      { nativeInteriorDoor: true, nativeStaticTransition: true },
    ),
    {
      kind: "passive-transition-anchor",
      evidence: "exact-door-model-audit.json",
    },
  );
});

test("uses the interior-proven single sliding leaf for JHD0's house door", () => {
  assert.deepEqual(
    jomoObjectBehavior("S1_JHD0_DR15_016.MT5", "dor0"),
    {
      kind: "sliding-door",
      renderNodeKey: 7,
      evidence: "jomo-front-door-map-transition.json",
    },
  );
});

test("classifies JHD0's neighborhood gate as a paired transition door", () => {
  assert.deepEqual(
    jomoObjectBehavior("S1_JHD0_DR29_000.MT5", "dor1"),
    {
      kind: "exterior-transition-door",
      renderNodeKeys: [7, 12],
      evidence: "jhd0-exterior-door-placements.json",
    },
  );
});

test("classifies the active Yamanose residence gate as a transition door", () => {
  assert.deepEqual(
    jomoObjectBehavior(
      "S1_JU00_DR29_000.MT5",
      "dor0",
      { staticDoorIndex: 18 },
    ),
    {
      kind: "exterior-transition-door",
      renderNodeKeys: [7, 12],
      evidence: "ju00-runtime-placements.json",
    },
  );
});

test("adds the proven native node spin to TKOK and TKOL only", () => {
  const expected = {
    kind: "inspect",
    label: "Examine",
    initiallyEnabled: true,
    ambientAnimation: {
      kind: "d000-tko-node-spin",
      renderNodeKey: 152,
      sourceFixedTurnsPerTick: -910,
      gameHz: 30,
      autoPlay: true,
      evidence: "d000-tko-node-spin.json",
    },
  };
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_OMG_TKO0101G.MT5", "TKOK"),
    expected,
  );
  const tkol = jomoObjectBehavior("S1_D000_OMG_TKO0101G.MT5", "TKOL");
  assert.deepEqual(tkol, {
    ...expected,
    initiallyEnabled: false,
    ambientAnimation: {
      ...expected.ambientAnimation,
      autoPlay: false,
    },
  });
  assert.deepEqual(
    jomoObjectBehavior("S1_D000_OMG_TKO0102G.MT5", "TKOM"),
    {
      kind: "inspect",
      label: "Examine",
      initiallyEnabled: false,
      stateTransitionAnimation: {
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
      },
      initialStateEvidence: "d000-tko-initial-state.json",
      stateMachineEvidence: "d000-tko-state-machine.json",
    },
  );
  assert.equal(
    jomoObjectBehavior("S1_D000_OMG_TKO0102G.MT5", "TKON")
      .initiallyEnabled,
    true,
  );
});
