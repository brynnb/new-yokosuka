import commandRegistry from "../data/server-command-registry.json" with {
  type: "json",
};
import authoredScenes from "./AuthoredSceneCatalog.js";

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
  ["s1.mfsy.chicken-race-intro.scene",{kind:"native-cutscene",area:"MFSY",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:"story-s1-chicken-race-intro",packageId:"chicken-race",worldId:"mfsy",storyPresentation:true,
      activity:{slot:0,binding:{kind:"map-embedded-slot",activityId:"RACE/SEQDATA1.AUTH"}}}}],
  ...[["goro-job-lead","GOROCOOP/SEQDATA1.AUTH"],["goro-job-appointment","MGOR/SEQDATA0.AUTH"],
    ["yada-job-interview","MARU/SEQDATA0.AUTH"],["mark-job-introduction","MARU/SEQDATA1.AUTH"],
    ["mark-lunch-intro","MIZUMARK/SEQDATA1.AUTH"],["mark-lunch-aftermath","MIZUMARK/SEQDATA2.AUTH"],
    ["after-work-goro","GOROMA/SEQDATA2.AUTH"]].map(([part,activityId])=>[`s1.mfsy.${part}.scene`,{
    kind:"native-cutscene",area:"MFSY",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-${part}`,packageId:part,worldId:"mfsy",storyPresentation:true,
      activity:{slot:0,binding:{kind:"map-embedded-slot",activityId}}},
  }]),
  ...[["jimmy-knock","CTERMO1/SEQDATA3.AUTH","D000","dobuita"],["jimmy-caught","CTERMO1/SEQDATA1.AUTH","D000","dobuita"],["jimmy-escaped","CTERMO1/SEQDATA2.AUTH","D000","dobuita"],["jimmy-interrogation","A0174/A0174.AUTH","DAZA","daza"]].map(([part,activityId,area,worldId])=>[`s1.${area.toLowerCase()}.${part}.scene`,{
    kind:"native-cutscene",area,durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-${part}`,packageId:part,worldId,storyPresentation:true,
      activity:{slot:0,binding:{kind:"map-embedded-slot",activityId}}},
  }]),
  ...[["chai-intro","A0172"],["chai-victory","A0172"],["chai-rescue","A0172A"]].map(([part,resource])=>[`s1.dgct.${part}.scene`,{
    kind:"native-cutscene",area:"DGCT",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-${part}`,packageId:part,worldId:"arcade",storyPresentation:true,
      activity:{slot:0,binding:{kind:"map-embedded-slot",activityId:`${resource}/${resource}.AUTH`}}},
  }]),
  ...[["jimmy-morning-call","A0169","JOMO","interior"],["post-chen-home","A0160","JOMO","interior"],["bank-savings","01BNK","JOMO","interior"],["travel-family","01EAR","JOMO","interior"],
    ["fuku-travel-funds","01MON","JOMO","interior"],["global-airfare","01MIT","DSKI","dski"],["asia-airfare","01ETU","DAZA","daza"],
    ["global-boat","01MIT","DSKI","dski"],["boat-ticket-purchase","01ETU","DAZA","daza"],["boat-ticket-collection","A0165","DAZA","daza"]].map(([part,resource,area,worldId])=>[`s1.${area.toLowerCase()}.${part}.scene`,{
    kind:"native-cutscene",area,durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-${part}`,packageId:part,worldId,storyPresentation:true,
      activity:{slot:0,binding:{kind:"map-embedded-slot",activityId:`${resource}/${resource}.AUTH`}}},
  }]),
  ["s1.jomo.mirror-dream.scene",{
    kind:"native-cutscene",area:"JOMO",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:"story-s1-mirror-dream",packageId:"kkyb",worldId:"interior",storyPresentation:true,
      activity:{slot:51,binding:{primaryPointer:614200,secondaryPointer:614213}}},
  }],
  ["s1.jomo.phoenix-vision.scene",{
    kind:"native-cutscene",area:"JOMO",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:"story-s1-phoenix-vision",packageId:"kkya",worldId:"interior",storyPresentation:true,
      activity:{slot:50,binding:{primaryPointer:614163,secondaryPointer:614176}}},
  }],
  ["s1.jomo.snow-dream.scene",{
    kind:"native-cutscene",area:"JOMO",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:"story-s1-snow-dream",packageId:"kkyc",worldId:"interior",storyPresentation:true,
      activity:{slot:52,binding:{primaryPointer:614237,secondaryPointer:614250}}},
  }],
  ...[["explanation",6],["theft-start",0],["pursuit",1],["scaffolding",2],["crane",3],["failure",4],["save-mirror",5],["hong-kong",7]].map(([part,slot])=>[`s1.ms08.mirror-meeting.${part}`,{
    kind:"native-cutscene",area:"MS08",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-mirror-meeting-${part}`,packageId:"mirror-meeting",worldId:"ms08",storyPresentation:true,
      activity:{slot,binding:{primaryPointer:0,secondaryPointer:0}}},
  }]),
  ["s1.jhd0.fuku-phoenix-mirror.scene",{
    kind:"native-cutscene",area:"JHD0",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:"story-s1-fuku-phoenix-mirror",packageId:"houo",worldId:"exterior",storyPresentation:true,
      activity:{slot:9,binding:{primaryPointer:394211,secondaryPointer:394224}}},
  }],
  ["s1.jomo.ine-family-crest.scene",{
    kind:"native-cutscene",area:"JOMO",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:"story-s1-ine-family-crest",packageId:"family-crest",worldId:"interior",storyPresentation:true,
      activity:{slot:0,binding:{kind:"map-embedded-slot",activityId:"01136/CREST.AUTH"}}},
  }],
  ...[["introduction",0],["bodyguard",1]].map(([part,slot])=>[`s1.jd00.gui-zhang.${part}`,{
    kind:"native-cutscene",area:"JD00",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-gui-zhang-${part}`,packageId:"gui-zhang-street",worldId:"sakuragaoka",storyPresentation:true,
      activity:{slot,binding:{primaryPointer:0,secondaryPointer:0}}},
  }]),
  ...[["arrival",0],["remembrance",1],["phoenix-question",2]].map(([part,slot])=>[`s1.dkty.handguard.${part}`,{
    kind:"native-cutscene",area:"DKTY",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-bunkado-handguard-${part}`,packageId:"bunkado-handguard",worldId:"dkty",storyPresentation:true,
      activity:{slot,binding:{primaryPointer:0,secondaryPointer:0}}},
  }]),
  ...[["family-fuku","approach",0],["family-fuku","conversation",1],["family-ine","conversation",0]].map(([packageId,part,slot])=>[`s1.jhd0.${packageId}.${part}`,{
    kind:"native-cutscene",area:"JHD0",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-${packageId}-${part}`,packageId,worldId:"exterior",storyPresentation:true,
      // Borrow ordinal AUTH members; zero bindings explicitly do not claim
      // recovered native-owner selection.
      activity:{slot,binding:{primaryPointer:0,secondaryPointer:0}}},
  }]),
  ...[["plate",0,0x2ca34],["arrival",3,0x2ca6a],["lan-di",1,0x2ca46],["phoenix",2,0x2ca58]].map(([part,slot,primaryPointer])=>[`s1.ms08.master-chen.${part}`,{
    kind:"native-cutscene",area:"MS08",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-master-chen-${part}`,packageId:"master-chen",worldId:"ms08",storyPresentation:true,
      activity:{slot,binding:{primaryPointer,secondaryPointer:primaryPointer+13}}},
  }]),
  ["s1.d000.harbor-bus.boarding", {
    kind:"native-cutscene",area:"D000",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:"story-s1-harbor-bus",packageId:"buss",worldId:"dobuita",storyPresentation:true,
      // BUSS retains its original pointer binding (unlike normalized 01TEL).
      activity:{slot:16,binding:{primaryPointer:716815,secondaryPointer:716828}}},
  }],
  ["s1.d000.amihama-directory.scene", {
    kind:"native-cutscene",area:"D000",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:"story-s1-amihama-directory",packageId:"phone-book",worldId:"dobuita",storyPresentation:true,
      activity:{slot:0,binding:{kind:"map-embedded-slot",activityId:"01TEL/SEQDATA0.AUTH"}}},
  }],
  ["s1.drsa.xia-letter-translation.scene", {
    kind:"native-cutscene",area:"DRSA",durableEffects:"forbidden",returnPlayerState:true,
    // TOKI is the original cinematic resource, DRSA the normal shop area.
    // This borrows its presentation, not its native room controller/state.
    cutscene:{id:"story-s1-xia-letter-translation",packageId:"toki",worldId:"drsa",storyPresentation:true,
      activity:{slot:0,binding:{primaryPointer:0x34f7,secondaryPointer:0x3504}}},
  }],
  ["s1.jhd0.fuku-letter-gate.scene", {
    kind:"native-cutscene",area:"JHD0",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:"story-s1-fuku-letter-gate",packageId:"tgma",worldId:"exterior",storyPresentation:true,
      activity:{slot:0,binding:{primaryPointer:0x601b8,secondaryPointer:0x601bd}}},
  }],
  ...[["fuku-resolve",2,0x5f167,0x5f16c],["ine-letter-invitation",3,0x5f16d,0x5f172]].map(([part,slot,primaryPointer,secondaryPointer])=>[`s1.jhd0.${part}.scene`,{
    kind:"native-cutscene",area:"JHD0",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-${part}`,packageId:"kakg",worldId:"exterior",storyPresentation:true,activity:{slot,binding:{primaryPointer,secondaryPointer}}},
  }]),
  ["s1.jomo.chinese-letter.scene", {
    kind:"native-cutscene",area:"JOMO",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:"story-s1-chinese-letter",packageId:"chinese-letter",worldId:"interior",storyPresentation:true,
      activity:{slot:0,binding:{kind:"map-embedded-slot",activityId:"01CRY/LETTER.AUTH"}}},
  }],
  ["s1.d000.nozomi-after-parlor.scene", {
    kind: "native-cutscene", area: "D000", durableEffects: "forbidden", returnPlayerState: true,
    cutscene: { id: "story-s1-nozomi-after-parlor", packageId: "ybhn", worldId: "dobuita",
      storyPresentation: true, activity: { slot: 27,
        binding: { primaryPointer: 0xaf8ae, secondaryPointer: 0xaf8bb } } },
  }],
  ...[["introduction",0,0xb138a,0xb1391],["trap",1,0xb1392,0xb1399]].map(([part,slot,primaryPointer,secondaryPointer])=>[`s1.d000.ambush.${part}`,{
    kind:"native-cutscene",area:"D000",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-parking-lot-${part}`,packageId:"drauth",worldId:"dobuita",storyPresentation:true,activity:{slot,binding:{primaryPointer,secondaryPointer}}},
  }]),
  ...[
    ["introduction",0,718875,718888],
    ["beer",1,718893,718906],
  ].map(([part,slot,primaryPointer,secondaryPointer])=>[`s1.heartbeats.alley.${part}`,{
    kind:"native-cutscene",area:"D000",durableEffects:"forbidden",returnPlayerState:true,
    cutscene:{id:`story-s1-heartbeats-${part}`,packageId:"story-heartbeats-alley",worldId:"dobuita",storyPresentation:true,
      activity:{slot,binding:{primaryPointer,secondaryPointer}}},
  }]),
  ...[
    ["introduction", 334785, 334798],
    ["fish", 334804, 334817],
    ["tofu", 334823, 334836],
  ].map(([part, primaryPointer, secondaryPointer]) => [`s1.ju00.first-kitten.${part}`, {
    kind: "native-cutscene", area: "JU00", durableEffects: "forbidden",
    cutscene: { id: `story-s1-first-kitten-${part}`, packageId: "cata1", worldId: "yamanose",
      storyPresentation: true, activity: { slot: 0, binding: { primaryPointer, secondaryPointer } } },
  }]),
  ["s1.jhd0.first-dojo.scene", {
    kind: "native-cutscene", area: "JHD0", durableEffects: "forbidden",
    cutscene: { id: "story-s1-first-dojo", packageId: "first-dojo", worldId: "exterior",
      storyPresentation: true, activity: { slot: 0, binding: { primaryPointer: 0x5ee04, secondaryPointer: 0x5ee09 } } },
  }],
  ["s1.jomo.first-allowance.scene", {
    kind: "native-cutscene", area: "JOMO", durableEffects: "forbidden",
    cutscene: { id: "story-s1-first-allowance", packageId: "first-allowance", worldId: "interior",
      storyPresentation: true, activity: { slot: 35,
        binding: { kind: "map-embedded-slot", activityId: "01KOZ/SEQDATA35.AUTH" } } },
  }],
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
  ...authoredScenes.scenes.flatMap(scene => [
    [`${scene.id}.start`, { kind: scene.continuesPrevious?"scene-staging-transition":"scene-staging-start", area: scene.area, scene, executable: true }],
    [`${scene.id}.finish`, { kind: "scene-staging-finish", area: scene.area, scene, executable: true }],
  ]),
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
