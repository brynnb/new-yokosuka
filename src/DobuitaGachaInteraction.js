import { Vector3 } from "@babylonjs/core";

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

// D000 MAPINFO 0x524cc, selector 0: float literals at 0x525b8/0x525bc.
// The native DAMY attachment helper (0x57c4e) transforms this machine-local
// point into world space. Reflect source X just as the MT5 loader does.
export const GACHA_SOURCE_APPROACH = Object.freeze([-0.051100000739097595, 0, 0.6507710218429565]);

// D000 MAPINFO 0x535e4 (FIXO hand choreography) and 0x555ac (dispense).
// Audited against original literals by audit_d000_gacha_interaction.js.
export const GACHA_CAPSULE = Object.freeze({
  lidModel: 'S3_D000_CAPS5FTG.MT5',
  baseModels: ['S3_D000_CAPS5GRG.MT5', 'S3_D000_CAPS5BLG.MT5', 'S3_D000_CAPS5RDG.MT5', 'S3_D000_CAPS5YEG.MT5'],
  dispenseFrame: 215, pickupFrame: 310, openFrame: 360,
  lidReleaseFrame: 410, regripFrame: 430, regripEndFrame: 450, baseReleaseFrame: 503,
  rightGrip: {renderKey: -0x41, position: [0.12600000202655792, 0.03500000014901161, -0.0560000017285347], rotationRaw: [16384, 0, 0]},
  leftGrip: {renderKey: -0x42, position: [0.09000000357627869, 0.07500000298023224, 0.00800000037997961], rotationRaw: [13111, 817, 50684]},
  leftRegrip: [0.06700000166893005, 0.061000000685453415, 0.03790000081062317],
  // Native op 9 modes 10/11 are sine/cosine: X += sin(yaw)*.2
  // - cos(yaw)*(-.1); Z += cos(yaw)*.2 + sin(yaw)*(-.1).
  dispensePosition: [0.10000000149011612, 0.5, 0.20000000298023224],
  dropDistance: 0.07999999821186066, dropAcceleration: 0.0010000000474974513,
});

export function gachaInteractionPose(root) {
  const world = root.computeWorldMatrix(true);
  const [x, y, z] = GACHA_SOURCE_APPROACH;
  const position = Vector3.TransformCoordinates(new Vector3(-x, y, z), world);
  const facing = Vector3.TransformNormal(new Vector3(0, 0, -1), world);
  return { position, yaw: Math.atan2(facing.x, facing.z) };
}
