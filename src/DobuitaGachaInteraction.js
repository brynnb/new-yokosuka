export const DOBUITA_GACHA_MACHINES = Object.freeze([
  Object.freeze({
    index: 0,
    machineTag: "GCH0",
    capsuleBoxTag: "GBX0",
    lowDetailModel: "S1_D000_OMG_GAT02L0G.MT5",
    highDetailModel: "S1_D000_GAT0G00G.MT5",
    sourcePosition: Object.freeze([24.5, 0, 32.15999984741211]),
    sourceYawRaw: 0x8000,
    componentSelector: 4,
    recordFlags: 0x0204,
  }),
  Object.freeze({
    index: 3,
    machineTag: "GCH3",
    capsuleBoxTag: "GBX3",
    lowDetailModel: "S1_D000_OMG_GAT02L3G.MT5",
    highDetailModel: "S1_D000_GAT0G03G.MT5",
    sourcePosition: Object.freeze([23.75, 0, 32.15999984741211]),
    sourceYawRaw: 0x8000,
    componentSelector: 2,
    recordFlags: 0x0302,
  }),
]);

export function gachaMachineTagForInspectable(inspectable) {
  if (!inspectable) return null;
  const direct = DOBUITA_GACHA_MACHINES.find(
    (machine) => machine.machineTag === inspectable.objectTag,
  );
  if (direct) return direct.machineTag;
  const box = DOBUITA_GACHA_MACHINES.find(
    (machine) => (
      machine.capsuleBoxTag === inspectable.objectTag
      && machine.machineTag === inspectable.parentObjectTag
    ),
  );
  return box?.machineTag || null;
}

export function activeGachaMachineTag(activeEmote) {
  if (activeEmote?.emote?.id !== "dobuitaGacha") return null;
  return gachaMachineTagForInspectable(
    activeEmote.context?.inspectable,
  );
}
