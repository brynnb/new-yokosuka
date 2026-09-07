import { runtimeAssetUrl } from "../../src/RuntimeAssets.js";
import { fetchAssetBuffer } from "../../src/AssetCache.js";
import { MotnLoader } from "../../src/MotnLoader.js";
import nativeEventMotionManifest from "../data/events/nativeEventMotions.generated.json" with {
  type: "json",
};

const MOTION_PATH = "/motion/MOTION.BIN";
const FIGHT_MOTION_PATH = "/motion/M_FGT1.BIN";
const SUPPLEMENTAL_PATHS = new Map([
  ["M_D000.MOTN", runtimeAssetUrl("play/assets/dobuita/M_D000.MOTN")],
  ["M_JOMO.MOTN", runtimeAssetUrl("play/assets/hazuki/M_JOMO.MOTN")],
  ["M_GACH.MOTN", runtimeAssetUrl("play/assets/dobuita/M_GACH.MOTN")],
  ["M_DJUC.MOTN", runtimeAssetUrl("play/assets/vending/M_DJUC.MOTN")],
  ["M_FREE.BIN", runtimeAssetUrl("play/assets/scheduled-actors/M_FREE.BIN")],
]);

export const PLAYER_COMBAT_CONFIG = Object.freeze({
  stance: "YKI_AKI_KAMAE1_LP",
  guard: "DMY_YKI_AKI_KAMAE1_GU_LP",
  locomotion: Object.freeze({
    combatAdvance: "YKI_AKI_KAMAE1_WALK_F",
    combatStrafeLeft: "YKI_AKI_KAMAE1_WALK_L",
    combatStrafeRight: "YKI_AKI_KAMAE1_WALK_R",
  }),
  reactions: Object.freeze({
    hit: "AKI_AKI_NGR_UDEKIME",
    guard: "AKI_AKI_NGR_UDEKIME",
    knockdown: "AKI_AKI_DNGR_UMA_YARARE",
    defeated: "AKI_AKI_DNGR_UMA_YARARE",
    defeatedIdle: "YKI_AKI_DOWN_SID_L_LP",
  }),
});

// Playback and native event transactions are synchronous. Retain the compact
// source bytes, expanding only the sequences actually requested by playback.
// Do not parse all 1,500+ MOTION.BIN sequences into long-lived JS curves.
export class PlayerMotionBank {
  constructor(url, {fetchBuffer = fetchAssetBuffer, parse = MotnLoader.parse} = {}) {
    this.url = url;
    this.fetchBuffer = fetchBuffer;
    this.parse = parse;
    this.buffer = null;
    this.sequences = new Map();
  }

  async ensureLoaded(signal) {
    signal?.throwIfAborted();
    if (this.buffer) return;
    const buffer = await this.fetchBuffer(this.url, {signal});
    signal?.throwIfAborted();
    this.buffer = buffer;
  }

  getSequence(name) {
    if (!this.buffer) throw new Error(`Motion bank is not ready: ${this.url}`);
    if (!this.sequences.has(name)) {
      const sequence = this.parse(this.buffer, {sequenceNames: [name]}).getSequence(name);
      if (!sequence) throw new Error(`Motion ${name} is missing from ${this.url}`);
      this.sequences.set(name, sequence);
    }
    return this.sequences.get(name);
  }
}

export function playerFeatureMotionPaths(world) {
  const paths = [];
  if (world?.vehicle === "forklift") paths.push(SUPPLEMENTAL_PATHS.get("M_FREE.BIN"));
  // This is the same encounter scope used by PlayWorldLifecycle.syncCombat.
  if (world?.id === "mfbt") paths.push(FIGHT_MOTION_PATH);
  return paths;
}

export async function prefetchPlayerMotionLibrary(world, signal) {
  await Promise.all([
    MOTION_PATH,
    // Small interaction banks remain callable from synchronous native events
    // and network emotes across areas. Defer their decoding/baking, not their
    // availability. Combat and forklift banks have explicit world readiness.
    ...[...SUPPLEMENTAL_PATHS].filter(([name]) => name !== "M_FREE.BIN").map(([, url]) => url),
    ...playerFeatureMotionPaths(world),
  ].map(url => fetchAssetBuffer(url, {signal})));
}

export async function loadPlayerMotionLibrary({
  configureLocomotion,
  presentationMotionDefinitions,
  world = null,
}) {
  const motion = new PlayerMotionBank(MOTION_PATH);
  const fightMotion = new PlayerMotionBank(FIGHT_MOTION_PATH);
  const supplementalMotions = new Map([...SUPPLEMENTAL_PATHS].map(
    ([name, url]) => [name, new PlayerMotionBank(url)],
  ));
  const ensureWorld = async (target, signal) => {
    await Promise.all([
      ...(target?.id === "mfbt" ? [fightMotion.ensureLoaded(signal)] : []),
      ...(target?.vehicle === "forklift"
        ? [supplementalMotions.get("M_FREE.BIN").ensureLoaded(signal)] : []),
    ]);
  };
  await Promise.all([
    motion.ensureLoaded(),
    ...[...supplementalMotions].filter(([name]) => name !== "M_FREE.BIN")
      .map(([, bank]) => bank.ensureLoaded()),
    ensureWorld(world),
    configureLocomotion(),
  ]);
  const definitions = new Map();
  for (const definition of [...nativeEventMotionManifest.motions, ...presentationMotionDefinitions]) {
    const next = {name: definition.name, motionFile: definition.motionFile || null};
    const existing = definitions.get(definition.request);
    if (existing && (existing.name !== next.name || existing.motionFile !== next.motionFile)) {
      throw new Error(`scripted motion request ${definition.request} has conflicting sources`);
    }
    definitions.set(definition.request, next);
  }
  return {motion, fightMotion, supplementalMotions,
    scriptedMotions: Object.fromEntries(definitions), ensureWorld};
}
