import commandRegistry from "../data/server-command-registry.json" with {
  type: "json",
};

const CAMERAS = new Map([
  ["d000.hato.camera.2950", { area: "D000", cameraNumber: 2950 }],
  ["d000.hato.camera.2952", { area: "D000", cameraNumber: 2952 }],
  ["d000.hato.camera.2954", { area: "D000", cameraNumber: 2954 }],
  ...[3031, 3032, 3033, 3034, 3035, 3036, 3037].map(
    cameraNumber => [
      `jomo.telephone.camera.${cameraNumber}`,
      { area: "JOMO", cameraNumber },
    ],
  ),
]);

const PLAYER_MOTIONS = new Map([
  ["d000.hato.player-motion.903", {
    actorCode: "AKIR",
    request: 903,
    name: "AKI_AKI_TATI_IWA_L",
    motionFile: null,
    parameters: [-1, -1, -1, 1],
  }],
  ["d000.hato.player-motion.100", {
    actorCode: "AKIR",
    request: 100,
    name: "AKI_AKI_TURN180_L",
    motionFile: null,
    parameters: [-1, -1, -1, 1],
  }],
]);

const ACTIVITIES = new Map([
  ["d000.telephone-book.native", {
    kind: "native-object-interaction",
    area: "D000",
    objectTag: "TBK1",
    action: 1,
    durableEffects: "forbidden",
    programId: "disc1-d000-phone-book-0x6a49c",
    source: "D000 persistent owner 0x69b14 > TBK1 > 0x6a49c",
  }],
]);

const JOMO_TELEPHONE_RECEIVER = Object.freeze({
  objectTag: "TEL_",
  actorCode: "AKIR",
  bindingIndex: 3,
  objectRenderKey: 3,
  actorRenderKey: -0x42,
  actorRuntimeMatrixIndex: 30,
  handCorrection: Object.freeze({
    translation: Object.freeze([
      0.02499999850988388,
      0.07499999552965164,
      0,
    ]),
    rotationAxis: "z",
    rotationFixedTurnRaw: 0x4000,
  }),
  controllerTranslation: Object.freeze([-0.04, -0.01, 0.02]),
  controllerRotationWords: Object.freeze([
    0x0000c000,
    0x000004f6,
    0x0000ec16,
  ]),
  adapterStatus: "exact-telm-render-control-binding",
});

function closedDoorMotionCueSequences({ selector, target, requestWord, sourceOffset }) {
  const sequenceId = `d000.door.${selector}.closed-check`;
  return [
    [`${sequenceId}.start`, {
      kind: "actor-motion-cue-start",
      sequenceId,
      area: "D000",
      actorCode: "AKIR",
      executable: true,
      source: `D000 MAPINFO ${sourceOffset} with XMPT helper 0x6faa0`,
      alignment: {
        target,
        requestWord,
        requestDword: 594,
        stateSelector: 0,
        motion: {
          request: 594,
          name: "AKI_AKI_BASE",
          motionFile: null,
        },
      },
      motion: {
        actorCode: "AKIR",
        request: 28677,
        parameters: [-1, -1, 40, 1.2000000476837158],
        name: "AKI_HITORIGOTO_R_RYURIHATUTEN",
        motionFile: "M_D000.MOTN",
      },
      cues: [58, 82].map(phase => ({
        phase,
        commandHex: "a9054200",
        bank: "f1dobuit",
        extension: "wav",
      })),
      dialoguePhase: 150,
    }],
    [`${sequenceId}.finish`, {
      kind: "actor-motion-cue-finish",
      sequenceId,
      area: "D000",
      executable: true,
      source: `D000 MAPINFO ${sourceOffset} motion-status cleanup`,
    }],
  ];
}

// These records preserve the native coroutine relationship as well as its
// individual operations. The answer and hang-up helpers run concurrently with
// the main dialogue coroutine; the authored hang-up command joins that already
// running timeline instead of starting a new delay after the dialogue.
//
// A sequence remains non-executable until every consequential player-visible
// operation has a proven Babylon adapter.
const SEQUENCES = new Map([
  ["d000.door.1.closed-check.start", {
    kind: "actor-motion-cue-start",
    sequenceId: "d000.door.1.closed-check",
    area: "D000",
    actorCode: "AKIR",
    executable: true,
    source: "D000 MAPINFO 0x74874 with side-aware XMPT helper 0x74df4 > 0x6fba0",
    alignment: {
      selector: {
        kind: "native-actor-axis-threshold",
        actorCode: "AKIR",
        axis: "x",
        comparison: "greater-than",
        threshold: 0,
        whenTrue: {
          target: [-40.03379821777344, 0.07999999821186066, 74.68450164794922],
          requestWord: 3276,
          requestDword: 0x00000612,
        },
        whenFalse: {
          target: [-40.913700103759766, 0.07999999821186066, 75.03309631347656],
          requestWord: 3276,
          requestDword: 0x80000612,
        },
      },
      stateSelector: 0,
      motion: {
        request: 1554,
        name: "AKI_AKANAI_HIKIDO_F",
        motionFile: null,
      },
    },
    timing: {
      kind: "post-alignment-ticks",
      tickRate: 30,
      dialogueTick: 120,
    },
    cues: [56, 78].map(tick => ({
      tick,
      commandHex: "a9054200",
      bank: "f1dobuit",
      extension: "wav",
    })),
  }],
  ["d000.door.1.closed-check.finish", {
    kind: "actor-motion-cue-finish",
    sequenceId: "d000.door.1.closed-check",
    area: "D000",
    executable: true,
    source: "D000 MAPINFO 0x74d50 interaction cleanup after the completed XMPT timeline",
  }],
  ...closedDoorMotionCueSequences({
    selector: 51,
    target: [6.452099800109863, 0.07000000029802322, 84.81649780273438],
    requestWord: 58254,
    sourceOffset: "0x7507c",
  }),
  ...closedDoorMotionCueSequences({
    selector: 61,
    target: [-19.149999618530273, 0.07240000367164612, 72.97000122070312],
    requestWord: 1820,
    sourceOffset: "0x7557c",
  }),
  ["jomo.telephone.ring.sa1093", {
    kind: "telephone-ring",
    area: "JOMO",
    executable: true,
    source: "JOMO MAPINFO 0x7dd1c",
    tickRate: 30,
    cues: [
      { tick: 0, commandHex: "a9056500", bank: "f1omoyaa", extension: "wav" },
      { tick: 90, commandHex: "a9056500", bank: "f1omoyaa", extension: "wav" },
    ],
  }],
  ["jomo.telephone.answer.sa1093.first", {
    kind: "telephone-call-start",
    callId: "jomo.telephone.sa1093.first",
    area: "JOMO",
    executable: true,
    source: "JOMO MAPINFO 0x7dcae with child helpers 0x7dada and 0x7dc3c",
    tickRate: 30,
    motion: {
      actorCode: "AKIR", request: 8254, parameters: [-1, -1, -1, 1],
      name: "AKI_DERU_DENWA_A_GORODENWA_F",
      motionFile: "M_JOMO.MOTN",
      sourceFormat: "COMMON01.PKS::M_JOMO.MOTN",
      nativeRegistry: {
        lowerExclusive: 0x2000,
        upperExclusive: 0x2046,
        index: 61,
      },
      adapterStatus: "exact-source-clip-packaged",
    },
    answer: {
      tick: 123,
      sound: { commandHex: "ab060000", bank: "f1omoyaa", extension: "wav" },
      receiver: JOMO_TELEPHONE_RECEIVER,
    },
    hangup: {
      tick: 904,
      sound: { commandHex: "ab060100", bank: "f1omoyaa", extension: "wav" },
    },
    dialogueLeadInTicks: 150,
  }],
  ["jomo.telephone.answer.sa1093.later", {
    kind: "telephone-call-start",
    callId: "jomo.telephone.sa1093.later",
    area: "JOMO",
    executable: true,
    source: "JOMO MAPINFO 0x7cf2c with child helpers 0x7dada and 0x7dc3c",
    tickRate: 30,
    motion: {
      actorCode: "AKIR", request: 8255, parameters: [-1, -1, -1, 1],
      name: "AKI_DERU_DENWA_B_GORODENWA_F",
      motionFile: "M_JOMO.MOTN",
      sourceFormat: "COMMON01.PKS::M_JOMO.MOTN",
      nativeRegistry: {
        lowerExclusive: 0x2000,
        upperExclusive: 0x2046,
        index: 62,
      },
      adapterStatus: "exact-source-clip-packaged",
    },
    answer: {
      tick: 145,
      sound: { commandHex: "ab060000", bank: "f1omoyaa", extension: "wav" },
      receiver: JOMO_TELEPHONE_RECEIVER,
    },
    hangup: {
      tick: 850,
      sound: { commandHex: "ab060100", bank: "f1omoyaa", extension: "wav" },
    },
    dialogueLeadInTicks: 170,
  }],
  ...["first", "later"].map(variant => [
    `jomo.telephone.hangup.sa1093.${variant}`,
    {
      kind: "telephone-call-finish",
      callId: `jomo.telephone.sa1093.${variant}`,
      area: "JOMO",
      executable: true,
      source: "JOMO MAPINFO child helper 0x7dc3c, joined by the main coroutine",
      behavior: "join-active-call-timeline",
    },
  ]),
]);

function requireExactCapabilities(kind, catalog) {
  const declared = new Set(commandRegistry.capabilities
    .filter(capability => capability.kind === kind)
    .map(capability => capability.identifier));
  if (
    declared.size !== catalog.size
    || [...catalog.keys()].some(identifier => !declared.delete(identifier))
    || declared.size !== 0
  ) {
    throw new Error(`script ${kind} capability registry does not match Babylon catalog`);
  }
}

requireExactCapabilities("camera", CAMERAS);
requireExactCapabilities("motion", PLAYER_MOTIONS);
requireExactCapabilities("sequence", SEQUENCES);
requireExactCapabilities("activity", ACTIVITIES);

const implementedPresentationCommands = new Set([
  "play_player_motion", "look_at_actor", "clear_actor_look", "start_camera",
  "stop_camera", "play_sequence", "start_activity",
]);
const declaredPresentationCommands = new Set(commandRegistry.entries
  .filter(entry => entry.authority === "server-orchestrated-presentation")
  .map(entry => entry.name));
if (
  implementedPresentationCommands.size !== declaredPresentationCommands.size
  || [...implementedPresentationCommands].some(name => !declaredPresentationCommands.delete(name))
  || declaredPresentationCommands.size !== 0
) {
  throw new Error("script presentation command registry does not match Babylon runtime");
}

function clone(value) {
  return value ? structuredClone(value) : null;
}

export function scriptEventPlayerMotionDefinitions() {
  const motions = [
    ...PLAYER_MOTIONS.values(),
    ...[...SEQUENCES.values()].flatMap(sequence => (
      [
        ...(sequence.alignment?.motion
          ? [{ actorCode: sequence.actorCode, ...sequence.alignment.motion }]
          : []),
        ...(sequence.motion ? [sequence.motion] : []),
      ]
    )),
  ];
  const byRequest = new Map();
  for (const motion of motions) {
    if (
      motion.actorCode !== "AKIR"
      || !Number.isInteger(motion.request)
      || typeof motion.name !== "string"
      || !motion.name
      || !(motion.motionFile === null || typeof motion.motionFile === "string")
    ) {
      throw new Error("script event player motion catalog is incomplete");
    }
    const definition = Object.freeze({
      request: motion.request,
      name: motion.name,
      motionFile: motion.motionFile,
    });
    const existing = byRequest.get(motion.request);
    if (existing && (
      existing.name !== definition.name
      || existing.motionFile !== definition.motionFile
    )) {
      throw new Error(`script event motion request ${motion.request} is ambiguous`);
    }
    byRequest.set(motion.request, definition);
  }
  return Object.freeze([...byRequest.values()]);
}

export class ScriptEventPresentationCatalog {
  camera(id) {
    return clone(CAMERAS.get(id));
  }

  playerMotion(id) {
    return clone(PLAYER_MOTIONS.get(id));
  }

  sequence(id) {
    return clone(SEQUENCES.get(id));
  }

  activity(id) {
    return clone(ACTIVITIES.get(id));
  }
}

export function createScriptEventPresentationCatalog() {
  return new ScriptEventPresentationCatalog();
}
