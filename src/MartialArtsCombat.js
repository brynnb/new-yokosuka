export const COMBAT_TICKS_PER_SECOND = 30;
export const COMMAND_COMMIT_TICKS = 3;
export const COMMAND_MODIFIER_CONTINUATION_TICKS = 4;
export const COMMAND_BUFFER_TICKS = 12;

// Exact native move definitions. Each row is:
// [index, id, source label, category, compact command tokens,
//  primary MOTION.BIN sequence, primary frames,
//  high-proficiency sequence, high-proficiency frames,
//  native move code, definition flags, optional display-only tokens].
const NATIVE_MOVE_ROWS = Object.freeze([
  [0, "tigerKnuckle", "Tiger Knuckle", "hand", ["hand"], "AKI_AKI_BATTLE_PANCH_JAB", 19, null, null, 0, [0, 0]],
  [1, "elbowSlam", "Elbow Slam", "hand", ["up", "hand"], "AKI_AKI_ELBOW", 27, null, null, 257, [0, 0]],
  [2, "twistKnuckle", "Twist Knuckle", "hand", ["down", "hand"], "AKI_AKI_BATTLE_PNC_FUK", 24, null, null, 258, [0, 0]],
  [3, "elbowAssault", "Elbow Assault", "hand", ["up", "up", "hand"], "AKI_AKI_RIMONT_MID", 61, null, null, 259, [0, 0]],
  [4, "upperKnuckle", "Upper Knuckle", "hand", ["down", "down", "hand"], "AKI_AKI_BATTLE_PNC_APR", 28, null, null, 260, [0, 0]],
  [5, "sleeveStrike", "Sleeve Strike", "hand", ["up", "down", "hand"], "AKI_AKI_BATTLE_SEIKEN2_MID", 30, null, null, 261, [0, 0]],
  [6, "rainThrust", "Rain Thrust", "hand", ["down", "up", "hand"], "AKI_AKI_BATTLE_PANCH_STR", 21, null, null, 262, [0, 0]],
  [7, "bigWheel", "Big Wheel", "hand", ["hand", "plus", "leg"], "AKI_AKI_BATTLE_PANCH_FUK_MISS", 34, "AKI_AKI_BATTLE_PUNCH_FUK_S1", 30, 526, [0, 0]],
  [8, "twinHandWaves", "TwinHandWaves", "hand", ["up", "hand", "plus", "leg"], "AKI_AKI_SOUSYOU", 52, null, null, 271, [0, 0]],
  [9, "backfistWillow", "Backfist Willow", "hand", ["down", "hand", "plus", "leg"], "AKI_AKI_URAKEN_ROLL_TOP", 27, null, null, 272, [0, 0]],
  [10, "avalancheLance", "AvalancheLance", "hand", ["up", "up", "hand", "plus", "leg"], "AKI_AKI_ELB_Y_ROLL_TOP", 41, "AKI_AKI_ELB_ROLL_TOP", 40, 529, [0, 0]],
  [11, "katanaMistSlash", "KatanaMistSlash", "hand", ["down", "down", "hand", "plus", "leg"], "AKI_AKI_CHP_NUKE_MID", 32, null, null, 274, [0, 0]],
  [12, "mistralFlash", "Mistral Flash", "hand", ["run", "hand"], "AKI_AKI_BAT_RUN_ELB_TOP_R", 27, null, null, 469, [0, 0]],
  [13, "pitBlow", "Pit Blow", "hand", ["up", "hand"], "AKI_AKI_KONGO_TYUKEN_Y_MID", 59, "AKI_AKI_KONGO_TYUKEN_MID", 54, 513, [0, 128]],
  [14, "doubleBlow", "Double Blow", "hand", ["up", "hand", "plus", "leg"], "JIJ_YAM_YAG_ITIMON", 52, "AKI_AKI_YAG_ITIMON1_MID_S1_MK", 55, 527, [0, 1024]],
  [15, "swallowFlip", "Swallow Flip", "hand", ["down", "hand", "leg"], "AKI_AKI_NGS_ENSEI_MK", 32, null, null, 543, [0, 16448]],
  [16, "risingFlash", "Rising Flash", "hand", ["up", "down", "down", "hand"], "AKI_AKI_NEWAP", 24, "AKI_AKI_NEWAP_S1", 30, 544, [64, 0]],
  [17, "twinBlades", "Twin Blades", "hand", ["down", "up", "up", "hand"], "AKI_AKI_CHP_MON", 30, "AKI_AKI_CHP_MON_MK", 54, 545, [2, 0]],
  [18, "stabArmor", "Stab Armor", "hand", ["up", "down", "down", "hand", "plus", "leg"], "AKI_AKI_BATTLE_PNC_SHOTEI", 26, "AKI_AKI_BATTLE_PNC_SHOTEI_S1", 35, 548, [32, 0]],
  [19, "crescentKick", "Crescent Kick", "leg", ["leg"], "AKI_AKI_MAWASIGERI_TOP", 24, null, null, 263, [0, 0]],
  [20, "trampleKick", "Trample Kick", "leg", ["up", "leg"], "AKI_AKI_MAEGERI", 27, null, null, 264, [0, 0]],
  [21, "sideReaperKick", "SideReaperKick", "leg", ["down", "leg"], "AKI_AKI_BATTLE_KICK_LOW", 31, null, null, 521, [0, 0]],
  [22, "againstCascade", "AgainstCascade", "leg", ["up", "up", "leg"], "AKI_AKI_KICK_KERIAGE_Y", 31, "AKI_AKI_KICK_KERIAGE", 32, 522, [0, 0]],
  [23, "surpliceSlash", "Surplice Slash", "leg", ["down", "down", "leg"], "AKI_AKI_KICK_HAZ_KESA_TOP", 31, null, null, 11, [0, 0]],
  [24, "thunderKick", "Thunder Kick", "leg", ["up", "down", "leg"], "AKI_AKI_BAT_KICK_KKT_TOP", 33, "AKI_AKI_KICK_KKT_S1_MK", 36, 12, [0, 0]],
  [25, "holdAgainstLeg", "HoldAgainstLeg", "leg", ["down", "up", "leg"], "AKI_AKI_BATTLE_KICK_SID", 24, null, null, 269, [0, 0]],
  [26, "brutalTiger", "Brutal Tiger", "leg", ["up", "down", "hand", "plus", "leg"], "AKI_AKI_KICK_BACKROLL_TOP_MISS", 36, "AKI_AKI_KICK_BACKROLL_S1", 28, 531, [0, 0]],
  [27, "darkMoon", "Dark Moon", "leg", ["down", "up", "hand", "plus", "leg"], "AKI_AKI_KICK_ABISEGERI", 52, "AKI_AKI_KICK_ABISEGERI_S1", 41, 532, [0, 0]],
  [28, "cycloneKick", "Cyclone Kick", "leg", ["run", "leg"], "AKI_AKI_KICK_BACKROLL_JUMP", 34, "AKI_AKI_KICK_BACKROLL_JUMP_S1", 31, 726, [0, 0]],
  [29, "windmill", "Windmill", "leg", ["run", "hand", "plus", "leg"], "AKI_AKI_KICK_HAZ_TOBI_TOP", 34, null, null, 471, [0, 0]],
  [30, "swallowDive", "Swallow Dive", "leg", ["down", "leg"], "AKI_AKI_KICK_ENSEN_TOP", 28, "AKI_AKI_KICK_ENSEN1_S1", 35, 9, [0, 16416]],
  [31, "tornadoKick", "Tornado Kick", "leg", ["up", "up", "leg", "leg"], "AKI_AKI_BAT_KICK_NIREN1_TOP_MK", 64, null, null, 542, [0, 256]],
  [32, "nothingSkill", "Nothing Skill", "leg", ["down", "up", "leg"], "AKI_AKI_SIDEKICK_S1", 30, null, null, 542, [4, 0]],
  [33, "crawlCyclone", "Crawl Cyclone", "leg", ["up", "down", "down", "leg"], "AKI_AKI_KICK_ZEN", 26, "AKI_AKI_KICK_ZEN_S1", 37, 546, [16, 0]],
  [34, "mudSpider", "Mud Spider", "leg", ["down", "up", "up", "leg"], "AKI_AKI_KICK_SUBERI", 44, "AKI_AKI_KICK_SUBERI_S1", 39, 547, [8, 0]],
  [35, "twinSwallowLeap", "TwinSwallowLeap", "leg", ["down", "up", "up", "hand", "plus", "leg"], "AKI_AKI_KICK_BEST", 27, "AKI_AKI_KICK_BEST_MK", 54, 37, [4096, 0]],
  [36, "shadowReaper", "Shadow Reaper", "leg", ["run", "guard", "plus", "leg"], "AKI_AKI_RUN_KICK_SURA", 33, "AKI_AKI_RUN_KICK_SURA_S1", 40, 728, [512, 0]],
  [37, "overthrow", "Overthrow", "throw", ["throw"], "AKI_AKI_NGS_SEOI", 50, null, null, 21, [0, 0]],
  [38, "sweepThrow", "Sweep Throw", "throw", ["up", "throw"], "AKI_AKI_NGS_UCH", 56, null, null, 22, [0, 0]],
  [39, "vortexThrow", "Vortex Throw", "throw", ["down", "throw"], "AKI_AKI_NGS_JUDO_TM", 57, null, null, 23, [0, 0]],
  [40, "mistReaper", "Mist Reaper", "throw", ["up", "up", "throw"], "AKI_AKI_NGS_JUDO_OG", 50, null, null, 24, [0, 0]],
  [41, "demonDrop", "Demon Drop", "throw", ["down", "down", "throw"], "AKI_AKI_NGS_MAKINAGE", 60, null, null, 25, [0, 0]],
  [42, "shoulderBuster", "Shoulder Buster", "throw", ["up", "down", "throw"], "AKI_AKI_NGS_WUDE1", 81, null, null, 26, [0, 0]],
  [43, "tenguDrop", "Tengu Drop", "throw", ["down", "up", "throw"], "AKI_AKI_NGS_BKFRIP", 40, null, null, 27, [0, 0]],
  [44, "darksideHazuki", "DarksideHazuki", "throw", ["throw"], "AKI_AKI_NAGE_YOKO1_R", 56, null, null, 21, [0, 0], ["position:b1f8", "throw"]],
  [45, "backTwistDrop", "BackTwistDrop", "throw", ["throw"], "AKI_AKI_NAGE_BACK1_BD", 66, null, null, 21, [0, 0], ["position:b2ab", "throw"]],
  [46, "shadowStep", "Shadow Step", "throw", ["up", "guard", "plus", "throw"], "AKI_AKI_NGS_MRK1", 32, null, null, 28, [256, 0]],
  [47, "armBreakFire", "Arm Break Fire", "throw", ["up", "down", "down", "throw"], "AKI_AKI_NGS_SP1_ELB", 45, null, null, 38, [8192, 0]],
  [48, "tigerStorm", "Tiger Storm", "throw", ["down", "up", "up", "throw", "throw"], "AKI_AKI_NGS_HED_MK", 47, "AKI_AKI_NGS_HED_S1_MK", 64, 39, [128, 0]],
  [49, "shadowBlade", "Shadow Blade", "throw", ["up", "guard", "plus", "throw", "hand"], "AKI_AKI_NGS_MRK1_MK", 43, null, null, 29, [16384, 0]],
  [50, "crossCharge", "Cross Charge", "throw", ["up", "up", "guard", "plus", "throw"], "AKI_AKI_NGS_FROU", 55, null, null, 40, [32768, 0]],
]);

// MOTION.BIN action-metadata opcode 0x02 supplies three phase-frame halfwords.
// The first two become the inclusive strike window at fighter +0x294/+0x296;
// the third is the following action-phase boundary at +0x298. These 32 rows
// cover every ordinary hand/leg primary motion whose metadata record is
// direct. The five staged/counter motions use nested records and retain their
// explicit recreation implementations below.
const NATIVE_DIRECT_PHASE_FRAMES = Object.freeze({
  tigerKnuckle: Object.freeze([4, 5, 13]),
  elbowSlam: Object.freeze([8, 12, 27]),
  twistKnuckle: Object.freeze([6, 8, 21]),
  elbowAssault: Object.freeze([6, 10, 47]),
  upperKnuckle: Object.freeze([10, 13, 27]),
  sleeveStrike: Object.freeze([10, 12, 30]),
  rainThrust: Object.freeze([6, 8, 20]),
  bigWheel: Object.freeze([12, 14, 32]),
  twinHandWaves: Object.freeze([7, 11, 41]),
  backfistWillow: Object.freeze([10, 12, 24]),
  avalancheLance: Object.freeze([13, 15, 36]),
  katanaMistSlash: Object.freeze([14, 17, 27]),
  mistralFlash: Object.freeze([8, 10, 26]),
  risingFlash: Object.freeze([9, 12, 24]),
  twinBlades: Object.freeze([17, 21, 29]),
  stabArmor: Object.freeze([10, 12, 23]),
  crescentKick: Object.freeze([6, 8, 22]),
  trampleKick: Object.freeze([6, 8, 24]),
  sideReaperKick: Object.freeze([7, 9, 27]),
  againstCascade: Object.freeze([12, 14, 27]),
  surpliceSlash: Object.freeze([11, 13, 27]),
  thunderKick: Object.freeze([15, 17, 29]),
  holdAgainstLeg: Object.freeze([8, 10, 24]),
  brutalTiger: Object.freeze([12, 14, 30]),
  cycloneKick: Object.freeze([14, 19, 30]),
  windmill: Object.freeze([13, 14, 34]),
  swallowDive: Object.freeze([9, 12, 25]),
  nothingSkill: Object.freeze([10, 13, 28]),
  crawlCyclone: Object.freeze([8, 13, 26]),
  mudSpider: Object.freeze([16, 18, 37]),
  twinSwallowLeap: Object.freeze([9, 11, 30]),
  shadowReaper: Object.freeze([10, 15, 33]),
});

// The engine scales those authored phase values by fighter +0x26c. The arena
// capture runs Crescent Kick at 1.111111x, producing 7/9/24 at runtime.
// Other untraced moves use their authored 1.0x values rather than estimates.
const NATIVE_OBSERVED_RUNTIME_PHASE_FRAMES = Object.freeze({
  crescentKick: Object.freeze([7, 9, 24]),
});

// MOTION action-metadata opcode 0x04 is copied to fighter +0x2ac..+0x2ae.
// FUN_0c1915ce uses the first byte as an attack-class table index, passes the
// second to the move-scaling helper, and starts damage calculation from the
// third. These are the 32 direct strike records paired with the phase table
// above; staged moves and throws require their nested/impact records instead.
const NATIVE_DIRECT_ATTACK_PARAMETERS = Object.freeze({
  tigerKnuckle: Object.freeze([5, 0, 4]),
  elbowSlam: Object.freeze([4, 1, 14]),
  twistKnuckle: Object.freeze([5, 0, 6]),
  elbowAssault: Object.freeze([3, 1, 40]),
  upperKnuckle: Object.freeze([5, 1, 12]),
  sleeveStrike: Object.freeze([6, 1, 20]),
  rainThrust: Object.freeze([6, 0, 13]),
  bigWheel: Object.freeze([3, 0, 9]),
  twinHandWaves: Object.freeze([40, 1, 20]),
  backfistWillow: Object.freeze([27, 0, 15]),
  avalancheLance: Object.freeze([3, 0, 20]),
  katanaMistSlash: Object.freeze([26, 1, 18]),
  mistralFlash: Object.freeze([3, 0, 15]),
  risingFlash: Object.freeze([5, 0, 17]),
  twinBlades: Object.freeze([5, 1, 20]),
  stabArmor: Object.freeze([6, 0, 19]),
  crescentKick: Object.freeze([15, 0, 6]),
  trampleKick: Object.freeze([10, 1, 12]),
  sideReaperKick: Object.freeze([15, 2, 14]),
  againstCascade: Object.freeze([8, 0, 16]),
  surpliceSlash: Object.freeze([15, 1, 20]),
  thunderKick: Object.freeze([15, 0, 20]),
  holdAgainstLeg: Object.freeze([9, 1, 14]),
  brutalTiger: Object.freeze([15, 0, 18]),
  cycloneKick: Object.freeze([14, 0, 22]),
  windmill: Object.freeze([14, 0, 22]),
  swallowDive: Object.freeze([15, 0, 18]),
  nothingSkill: Object.freeze([9, 0, 20]),
  crawlCyclone: Object.freeze([15, 5, 20]),
  mudSpider: Object.freeze([9, 1, 18]),
  twinSwallowLeap: Object.freeze([10, 0, 15]),
  shadowReaper: Object.freeze([10, 5, 17]),
});

// Double Blow and Dark Moon have the same adjacent 0x02/0x04 metadata pair
// after a leading setup/padding record instead of directly at metadata+0x0c.
const NATIVE_EMBEDDED_PHASE_FRAMES = Object.freeze({
  doubleBlow: Object.freeze([7, 9, 22]),
  darkMoon: Object.freeze([14, 16, 48]),
});

const NATIVE_EMBEDDED_ATTACK_PARAMETERS = Object.freeze({
  doubleBlow: Object.freeze([15, 0, 30]),
  darkMoon: Object.freeze([15, 3, 25]),
});

// Current HP is the low halfword at defender +0x35c. The Tiger Knuckle trace
// changes it from 120 to 115 on the first contact update. Other direct
// strikes use their authored base damage until their proficiency multipliers
// are observed or fully reconstructed.
const NATIVE_OBSERVED_DAMAGE = Object.freeze({
  tigerKnuckle: 5,
});

const ENEMY_ANIMATION_OVERRIDES = Object.freeze({
  tigerKnuckle: "YKI_AKI_K4_PNC_JUB",
  elbowSlam: "YKI_AKI_K3_PNC_STR_TOP",
  crescentKick: "YKI_AKI_K2_KICK_LOW",
  trampleKick: "YKI_AKI_K2_KICK_LOW",
  sideReaperKick: "YKI_AKI_K4_KICK_MID",
  overthrow: "YKI_AKI_NGS_TAKKULE",
  shoulderBuster: "YKI_AKI_NGS_TAKKULE",
});

// Exact M_FGT1.BIN playback lengths for the enemy-side overrides above.
// Combat ownership must follow the selected actor clip rather than the
// unrelated Ryo catalogue clip stored on the same move definition.
const ENEMY_ANIMATION_DURATION_OVERRIDES = Object.freeze({
  tigerKnuckle: 20,
  elbowSlam: 26,
  crescentKick: 32,
  trampleKick: 32,
  sideReaperKick: 34,
  overthrow: 116,
  shoulderBuster: 116,
});

const ENEMY_VICTIM_ANIMATION_OVERRIDES = Object.freeze({
  overthrow: "AKI_AKI_NGR_TAKKULE",
  shoulderBuster: "AKI_AKI_NGR_TAKKULE",
});

const ENEMY_VICTIM_DURATION_OVERRIDES = Object.freeze({
  overthrow: 122,
  shoulderBuster: 122,
});

const THROW_VICTIM_ANIMATIONS = Object.freeze({
  overthrow: "YKI_AKI_NGR_SEOI",
  sweepThrow: "YKI_AKI_NGR_UCH",
  vortexThrow: "YKI_AKI_NGR_JUDO_TM",
  mistReaper: "YKI_AKI_NGR_JUDO_OG",
  demonDrop: "YKI_AKI_NGR_MAKINAGE",
  shoulderBuster: "YKI_AKI_NGR_WUDE1",
  tenguDrop: "YKI_AKI_NGR_BKFRIP",
  darksideHazuki: "YKI_AKI_NAGERARE_YOKO1_R",
  backTwistDrop: "YKI_AKI_NAGERARE_BACK1_BD",
  shadowStep: "YKI_AKI_NGR_MRK1",
  armBreakFire: "YKI_AKI_NGR_SP1_ELB",
  tigerStorm: "YKI_AKI_NGR_HED_1",
  shadowBlade: "YKI_AKI_NGR_MRK1",
  crossCharge: "YKI_AKI_NGR_FROU",
  swallowFlip: "YKI_AKI_NGR_INASI",
});

const THROW_VICTIM_DURATIONS = Object.freeze({
  overthrow: 50,
  sweepThrow: 56,
  vortexThrow: 53,
  mistReaper: 46,
  demonDrop: 57,
  shoulderBuster: 74,
  tenguDrop: 43,
  darksideHazuki: 58,
  backTwistDrop: 56,
  shadowStep: 36,
  armBreakFire: 55,
  tigerStorm: 42,
  shadowBlade: 36,
  crossCharge: 43,
  swallowFlip: 26,
});

function tuneNativeMove(row) {
  const [
    nativeIndex,
    id,
    label,
    category,
    input,
    animation,
    duration,
    highProficiencyAnimation,
    highProficiencyDuration,
    nativeMoveCode,
    nativeFlags,
    displayInput = input,
  ] = row;
  const isCounter = [
    "swallowFlip",
    "shadowStep",
    "shadowBlade",
    "crossCharge",
  ].includes(id);
  const kind = isCounter
    ? "counter"
    : category === "throw"
      ? "throw"
      : "strike";
  const nativePrimaryAnimation = animation;
  const nativePrimaryDuration = duration;
  // Tornado Kick's compact native command includes both K presses, but its
  // animation is authored as a pose-continuous two-stage action. The first
  // kick ends in the exact opening pose of the catalogue's _MK motion.
  const runtimeAnimation = id === "tornadoKick"
    ? "AKI_AKI_BAT_KICK_NIREN1_TOP"
    : id === "swallowFlip"
      ? "AKI_AKI_NGS_INASI"
      : animation;
  const runtimeDuration = id === "tornadoKick"
    ? 40
    : id === "swallowFlip"
      ? 36
      : duration;
  const runtimeInput = id === "tornadoKick"
    ? input.slice(0, -1)
    : input;
  const runtimeDisplayInput = id === "tornadoKick"
    ? runtimeInput
    : displayInput;
  const commandComplexity = input.filter((token) => token !== "plus").length;
  const startup = Math.max(
    4,
    Math.min(14, Math.round(runtimeDuration * 0.22)),
  );
  const active = kind === "throw"
    ? 2
    : Math.max(3, Math.min(6, Math.round(duration * 0.1)));
  const nativeAuthoredPhaseFrames = (
    NATIVE_DIRECT_PHASE_FRAMES[id]
    || NATIVE_EMBEDDED_PHASE_FRAMES[id]
    || null
  );
  const nativePhaseFrames = (
    NATIVE_OBSERVED_RUNTIME_PHASE_FRAMES[id]
    || nativeAuthoredPhaseFrames
  );
  const nativeHitWindow = nativePhaseFrames?.slice(0, 2) || null;
  const nativeAttackParameterValues =
    NATIVE_DIRECT_ATTACK_PARAMETERS[id]
    || NATIVE_EMBEDDED_ATTACK_PARAMETERS[id]
    || null;
  const nativeAttackParameters = nativeAttackParameterValues
    ? Object.freeze({
      attackClassIndex: nativeAttackParameterValues[0],
      proficiencySelector: nativeAttackParameterValues[1],
      baseDamage: nativeAttackParameterValues[2],
    })
    : null;
  const displayedPosition = displayInput.find(
    (token) => token.startsWith("position:"),
  );
  return Object.freeze({
    nativeIndex,
    nativeMoveCode,
    nativeFlags: Object.freeze([...nativeFlags]),
    id,
    label,
    category,
    kind,
    counterCondition: isCounter
      ? "incoming-strike"
      : null,
    initialFollowupId: id === "swallowFlip"
      ? "swallowFlipThrow"
      : null,
    specialEffect: id === "shadowStep" ? "reposition-behind" : null,
    height: "mid",
    input: Object.freeze([...runtimeInput]),
    nativeInput: Object.freeze([...input]),
    inputAliases: ["pitBlow", "tornadoKick"].includes(id)
      ? Object.freeze([Object.freeze(
        id === "pitBlow" ? [...input, "hand"] : [...input],
      )])
      : Object.freeze([]),
    inputAliasFollowups: id === "pitBlow"
      ? Object.freeze({
        [[...input, "hand"].join("|")]: "pitBlowElbow",
      })
      : id === "tornadoKick"
        ? Object.freeze({
          [input.join("|")]: "tornadoKickFinish",
        })
        : Object.freeze({}),
    displayInput: Object.freeze([...runtimeDisplayInput]),
    positionCondition: id === "overthrow"
      ? "front"
      : displayedPosition === "position:b1f8"
        ? "side"
        : displayedPosition === "position:b2ab"
          ? "back"
          : null,
    animation: runtimeAnimation,
    duration: runtimeDuration,
    nativePrimaryAnimation,
    nativePrimaryDuration,
    highProficiencyAnimation,
    highProficiencyDuration,
    highProficiencyThreshold: highProficiencyAnimation ? 56 : null,
    enemyAnimation: ENEMY_ANIMATION_OVERRIDES[id] || null,
    enemyDuration: ENEMY_ANIMATION_DURATION_OVERRIDES[id] || null,
    enemyVictimAnimation: ENEMY_VICTIM_ANIMATION_OVERRIDES[id] || null,
    enemyVictimDuration: ENEMY_VICTIM_DURATION_OVERRIDES[id] || null,
    victimAnimation: THROW_VICTIM_ANIMATIONS[id] || null,
    victimDuration: THROW_VICTIM_DURATIONS[id] || null,
    synchronizedVictim: Boolean(THROW_VICTIM_ANIMATIONS[id])
      && id !== "shadowStep",
    highProficiencyVictimAnimation: id === "tigerStorm"
      ? "YKI_AKI_NGR_HED_2_S1"
      : null,
    highProficiencyVictimDuration: id === "tigerStorm" ? 43 : null,
    nativeAuthoredPhaseFrames,
    nativePhaseFrames,
    nativeHitFrames: nativeHitWindow
      ? Object.freeze(nativeHitWindow)
      : null,
    nativeAttackParameters,
    nativeAuthoredBaseDamage: nativeAttackParameters?.baseDamage ?? null,
    startup: nativeHitWindow
      ? nativeHitWindow[0]
      : kind === "counter" ? 0 : startup,
    active: nativeHitWindow
      ? nativeHitWindow[1] - nativeHitWindow[0] + 1
      : kind === "counter" ? 2 : active,
    recovery: kind === "counter"
      ? runtimeDuration - 2
      : Math.max(
        1,
        runtimeDuration
          - (nativeHitWindow ? nativeHitWindow[0] : startup)
          - (
            nativeHitWindow
              ? nativeHitWindow[1] - nativeHitWindow[0] + 1
              : active
          ),
      ),
    damage: NATIVE_OBSERVED_DAMAGE[id] ?? nativeAttackParameters?.baseDamage ?? (
      id === "shadowStep" || id === "swallowFlip"
      ? 0
      : kind === "throw"
      ? 5 + Math.floor(commandComplexity / 2)
      : 2 + Math.floor((commandComplexity - 1) / 2)
    ),
    guardDamage: 0,
    range: kind === "throw" || kind === "counter"
      ? 0.9
      : category === "leg"
        ? 1.55
        : 1.25,
    arcDegrees: kind === "throw" || kind === "counter" ? 55 : 70,
    hitStun: id === "shadowStep"
      ? 0
      : kind === "throw"
        ? 30
        : 10 + commandComplexity,
    guardStun: 5,
    knockdown: (kind === "throw" && id !== "shadowStep") || [
      "sideReaperKick",
      "crawlCyclone",
      "shadowReaper",
    ].includes(id),
  });
}

export const MARTIAL_ARTS_MOVES = Object.freeze(Object.fromEntries(
  NATIVE_MOVE_ROWS.map((row) => {
    const move = tuneNativeMove(row);
    return [move.id, move];
  }),
));

// These are the exact successful/fallback motion requests reached from
// EN_RYOU's hand and leg continuation roots. They are transitions, not
// aliases for the standalone catalogue clips. The DMY-prefixed motions are
// real, complete MOTION.BIN sequences selected by the native string VM.
// Durations are decoded directly from each sequence.
const NATIVE_STRING_STAGE_ROWS = Object.freeze([
  ["comboJabBody", "Jab to Body", "AKI_AKI_COMBO_JAB_BDY", 16, 4, 3, 2, false],
  ["comboBodyElbow", "Body to Elbow", "AKI_AKI_COMBO_BDY_ELB", 23, 6, 3, 2, false],
  ["comboMawashi2", "Second Roundhouse", "AKI_AKI_COMBO_MAWA_2", 27, 7, 4, 2, false],
  ["comboMawashi3", "Third Roundhouse", "AKI_AKI_COMBO_MAWA_3", 42, 11, 5, 3, true],
  ["comboHandUra", "Tiger Flurry Backfist", "DMY_AKI_AKI_URAKEN_ROLL_TOP", 27, 6, 4, 2, false],
  ["comboLegUra", "Tiger Claw Backfist", "DMY_DMY_AKI_AKI_URAKEN_ROLL_TOP", 27, 6, 4, 2, false],
  ["comboUpper2", "Advancing Upper", "AKI_AKI_BATTLE_PNC_APR2", 29, 7, 4, 2, false],
  ["comboTwist", "Twist Knuckle Transition", "DMY_AKI_AKI_BATTLE_PNC_FUK", 24, 6, 4, 2, false],
  ["comboElbow", "Elbow Transition", "DMY_AKI_AKI_ELBOW", 27, 7, 4, 2, false],
  ["comboRain", "Rain Thrust Transition", "DMY_AKI_AKI_BATTLE_PANCH_STR", 21, 5, 3, 2, false],
  ["comboRimont", "Elbow Assault Finish", "DMY_AKI_AKI_RIMONT_MID", 61, 13, 5, 4, true],
  ["comboLowKick", "Low Kick Transition", "AKI_AKI_BATTLE_KICK_LOW", 31, 8, 4, 2, false],
  ["comboSideKick", "Side Kick Finish", "AKI_AKI_BATTLE_KICK_SID", 24, 6, 4, 3, false],
  ["comboBackroll", "Backroll Kick Finish", "AKI_AKI_KICK_BACKROLL_JUMP", 34, 9, 4, 3, true],
  ["comboKatanaFinish", "Katana Mist Finish", "AKI_AKI_CHP_NUKE_MID", 32, 8, 4, 3, false],
  ["comboCascadeFinish", "Against Cascade Finish", "AKI_AKI_KICK_KERIAGE", 32, 8, 4, 3, false],
  ["comboCrescentEntry", "Crescent Entry", "AKI_AKI_MAWASIGERI_TOP", 24, 6, 4, 2, false],
]);

export const MARTIAL_ARTS_STRING_STAGES = Object.freeze(Object.fromEntries(
  NATIVE_STRING_STAGE_ROWS.map(([
    id,
    label,
    animation,
    duration,
    startup,
    active,
    damage,
    knockdown,
  ]) => [id, Object.freeze({
    id,
    label,
    animation,
    duration,
    startup,
    active,
    recovery: duration - startup - active,
    damage,
    guardDamage: 0,
    range: 1.35,
    arcDegrees: 70,
    height: "mid",
    kind: "strike",
    category: "string",
    hitStun: 11,
    guardStun: 5,
    knockdown,
    stringStage: true,
  })]),
));

// EN_RYOU.BIN requests the three Arm Break Fire actor/victim pairs as
// SP1_ELB, SP2_WAK, and SP3_GJJ. The move catalogue only exposes SP1 as the
// initial move because the latter two are input-gated continuations:
//   W, S, S+L -> J -> J+K
// The continuation clips deliberately have different actor/victim lengths.
// Replacing both one-shots when the next stage begins reproduces the native
// overlap instead of forcing either participant to wait in a neutral pose.
const NATIVE_FOLLOWUP_STAGE_ROWS = Object.freeze([
  [
    "throwAcquireNear",
    "Grab",
    null,
    [],
    "AKI_AKI_TUKAMI_NG",
    26,
    null,
    null,
    26,
    0,
    0,
    false,
  ],
  [
    "throwAcquireLong",
    "Long Grab",
    null,
    [],
    "AKI_AKI_TUKAMI_NG_LONG",
    26,
    null,
    null,
    26,
    0,
    0,
    false,
  ],
  [
    "swallowFlipThrow",
    "Swallow Flip: Throw",
    "swallowFlip",
    [],
    "AKI_AKI_NGS_ENSEI_MK",
    32,
    "YKI_AKI_NGR_ENSEI",
    40,
    5,
    3,
    4,
    true,
  ],
  [
    "swallowFlipPunch",
    "Swallow Flip: Ground Strike",
    "swallowFlipThrow",
    ["hand"],
    "AKI_AKI_NGS_ENSEI_PNC",
    38,
    "YKI_AKI_NGR_ENSEI_PNC",
    38,
    7,
    4,
    3,
    true,
  ],
  [
    "pitBlowElbow",
    "Pit Blow: Elbow Strike",
    "pitBlow",
    ["hand"],
    "AKI_AKI_KONGO_TYUKEN_C_MID",
    56,
    null,
    null,
    10,
    4,
    3,
    false,
    56,
  ],
  [
    "tornadoKickFinish",
    "Tornado Kick: Second Kick",
    "tornadoKick",
    ["leg"],
    "AKI_AKI_BAT_KICK_NIREN1_TOP_MK",
    64,
    null,
    null,
    11,
    5,
    4,
    true,
  ],
  [
    "armBreakChestStrike",
    "Arm Break Fire: Chest Strike",
    "armBreakFire",
    ["hand"],
    "AKI_AKI_NGS_SP2_WAK",
    65,
    "YKI_AKI_NGR_SP2_WAK",
    76,
    12,
    3,
    0,
    false,
  ],
  [
    "armBreakFireFinish",
    "Arm Break Fire: Armbar",
    "armBreakChestStrike",
    ["hand", "plus", "leg"],
    "AKI_AKI_NGS_SP3_GJJ",
    84,
    "YKI_AKI_NGR_SP3_GJJ",
    75,
    15,
    4,
    4,
    true,
  ],
]);

export const MARTIAL_ARTS_FOLLOWUP_STAGES = Object.freeze(Object.fromEntries(
  NATIVE_FOLLOWUP_STAGE_ROWS.map(([
    id,
    label,
    parentMoveId,
    input,
    animation,
    duration,
    victimAnimation,
    victimDuration,
    startup,
    active,
    damage,
    knockdown,
    minimumProficiency = 0,
  ]) => [id, Object.freeze({
    id,
    label,
    parentMoveId,
    input: Object.freeze([...input]),
    animation,
    duration,
    victimAnimation,
    victimDuration,
    startup,
    active,
    recovery: duration - startup - active,
    damage,
    guardDamage: 0,
    range: 0,
    arcDegrees: 360,
    height: "mid",
    kind: "throw",
    category: "followup",
    hitStun: victimDuration || 14,
    guardStun: 0,
    knockdown,
    followupStage: true,
    requiresConnection: Boolean(victimAnimation),
    synchronizedVictim: Boolean(victimAnimation),
    minimumProficiency,
  })]),
));

function stringDefinition(id, label, input, stageIds) {
  if (input.length !== stageIds.length) {
    throw new Error(`Combat string ${id} has mismatched input/stage data`);
  }
  return Object.freeze({
    id,
    label,
    input: Object.freeze([...input]),
    stageIds: Object.freeze([...stageIds]),
  });
}

// These are the ten built-in strings listed by the original-game battle
// guides. Direction tokens select opcode-0x48 branches but do not start a new
// animation. Stage motions below follow EN_RYOU's exact continuation graph.
export const MARTIAL_ARTS_STRINGS = Object.freeze([
  stringDefinition(
    "tigerFlurry",
    "Tiger Flurry",
    Array(8).fill("hand"),
    [
      null,
      "comboJabBody",
      "comboHandUra",
      "comboUpper2",
      "comboTwist",
      "comboElbow",
      "comboRain",
      "comboRimont",
    ],
  ),
  stringDefinition(
    "katanaRush",
    "Katana Rush",
    ["hand", "hand", "up", "hand", "hand"],
    [null, "comboJabBody", null, "comboBodyElbow", "comboKatanaFinish"],
  ),
  stringDefinition(
    "flyingKneeFourHitter",
    "Flying Knee Four-Hitter",
    ["hand", "hand", "up", "hand", "leg"],
    [null, "comboJabBody", null, "comboBodyElbow", "comboCascadeFinish"],
  ),
  stringDefinition(
    "tigersRage",
    "Tiger's Rage",
    ["hand", "hand", "leg"],
    [null, "comboJabBody", "comboSideKick"],
  ),
  stringDefinition(
    "eyeOfTheTigerStorm",
    "Eye of the Tiger Storm",
    ["hand", "hand", "hand", "leg"],
    [null, "comboJabBody", "comboHandUra", "comboBackroll"],
  ),
  stringDefinition(
    "theReaper",
    "The Reaper",
    ["hand", "hand", "down", "leg", "leg", "leg"],
    [null, "comboJabBody", null, "comboLowKick", "comboMawashi2", "comboMawashi3"],
  ),
  stringDefinition(
    "tigerMaelstrom",
    "Tiger Maelstrom",
    ["hand", "leg", "leg", "leg"],
    [null, "comboCrescentEntry", "comboMawashi2", "comboMawashi3"],
  ),
  stringDefinition(
    "crescentCyclone",
    "Crescent Cyclone",
    ["leg", "leg", "leg"],
    [null, "comboMawashi2", "comboMawashi3"],
  ),
  stringDefinition(
    "tigerClaw",
    "Tiger Claw",
    ["leg", "hand", "hand", "hand", "hand", "hand", "hand"],
    [
      null,
      "comboLegUra",
      "comboUpper2",
      "comboTwist",
      "comboElbow",
      "comboRain",
      "comboRimont",
    ],
  ),
  stringDefinition(
    "whirlingFury",
    "Whirling Fury",
    ["leg", "hand", "leg"],
    [null, "comboLegUra", "comboBackroll"],
  ),
]);

function commandsArePrefix(commands, definition) {
  return commands.length <= definition.input.length
    && commands.every((command, index) => definition.input[index] === command);
}

const STRING_STAGE_BY_PREFIX = (() => {
  const result = new Map();
  for (const definition of MARTIAL_ARTS_STRINGS) {
    for (let length = 2; length <= definition.input.length; length += 1) {
      const stageId = definition.stageIds[length - 1];
      if (!stageId) continue;
      const key = definition.input.slice(0, length).join("|");
      const previous = result.get(key);
      if (previous && previous !== stageId) {
        throw new Error(`Conflicting combat-string stage for ${key}`);
      }
      result.set(key, stageId);
    }
  }
  return result;
})();

const COMBAT_COMMAND_LABELS = Object.freeze({
  up: "W",
  down: "S",
  run: "Shift",
  guard: "I",
  plus: "+",
  hand: "J",
  leg: "K",
  throw: "L",
  "position:b1f8": "At opponent's side",
  "position:b2ab": "Behind opponent",
});

export function formatCombatCommand(input) {
  return input.map((token) => COMBAT_COMMAND_LABELS[token] || token).join(" ");
}

export function combatCommandKey(input) {
  return input.join("|");
}

export const DEFAULT_COMBATANT = Object.freeze({
  maxHealth: 20,
  radius: 0.32,
  moveSpeed: 2.2,
  turnSpeed: Math.PI * 2.5,
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeAngle(angle) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

export function distanceAndFacing(attacker, defender) {
  const dx = defender.x - attacker.x;
  const dz = defender.z - attacker.z;
  const distance = Math.hypot(dx, dz);
  const targetYaw = Math.atan2(dx, dz);
  return {
    distance,
    targetYaw,
    facingError: normalizeAngle(targetYaw - attacker.yaw),
  };
}

export function createCombatant(options = {}) {
  const maximum = Math.max(
    1,
    Number(options.maxHealth) || DEFAULT_COMBATANT.maxHealth,
  );
  return {
    id: String(options.id || "combatant"),
    team: String(options.team || "neutral"),
    x: Number(options.x) || 0,
    z: Number(options.z) || 0,
    yaw: Number(options.yaw) || 0,
    radius: Math.max(0.05, Number(options.radius) || DEFAULT_COMBATANT.radius),
    maxHealth: maximum,
    health: clamp(
      Number.isFinite(options.health) ? options.health : maximum,
      0,
      maximum,
    ),
    action: null,
    reaction: null,
    guardHeld: false,
    guardStun: 0,
    hitStun: 0,
    knockdown: 0,
    invulnerability: 0,
    proficiency: Math.max(0, Number(options.proficiency) || 0),
    commandQueue: [],
    commandIdleTicks: 0,
    commandOverrides: { ...(options.commandOverrides || {}) },
    stringCommands: [],
    activeStringId: null,
    activeFollowupId: null,
    pendingInitialFollowupId: null,
    lastMoveId: null,
    defeated: false,
  };
}

export function combatActionDuration(action, move) {
  if (!action || !move) return 0;
  const actorDuration = action.enemyVariant && move.enemyDuration
    ? move.enemyDuration
    : action.highProficiency && move.highProficiencyDuration
      ? move.highProficiencyDuration
      : move.duration;
  if (
    !move.synchronizedVictim
    || !action.lockedTargetId
    // Authored multi-stage pairs deliberately replace both clips at the
    // actor-side boundary. Only a terminal pair waits for its longer side.
    || action.nextFollowupId
  ) {
    return actorDuration;
  }
  const victimDuration = action.enemyVariant
    ? move.enemyVictimDuration || move.victimDuration
    : action.highProficiency
      ? move.highProficiencyVictimDuration || move.victimDuration
      : move.victimDuration;
  return Math.max(actorDuration, victimDuration || 0);
}

export function actionPhase(action, move) {
  if (!action || !move) return "idle";
  const duration = combatActionDuration(action, move);
  if (action.tick < move.startup) return "startup";
  if (action.tick < move.startup + move.active) return "active";
  if (action.tick < duration) return "recovery";
  return "complete";
}

export function canAct(combatant) {
  return Boolean(
    combatant
    && !combatant.defeated
    && !combatant.action
    && combatant.hitStun <= 0
    && combatant.guardStun <= 0
    && combatant.knockdown <= 0
  );
}

export function synchronizeCombatVictim(attacker, defender, move) {
  if (!attacker?.action || !defender || !move?.synchronizedVictim) {
    return false;
  }
  const victimDuration = attacker.action.enemyVariant
    ? move.enemyVictimDuration || move.victimDuration
    : attacker.action.highProficiency
      ? move.highProficiencyVictimDuration || move.victimDuration
      : move.victimDuration;
  if (!Number.isFinite(victimDuration) || victimDuration <= 0) return false;
  defender.guardHeld = false;
  defender.guardStun = 0;
  defender.hitStun = Math.max(defender.hitStun, victimDuration);
  defender.action = null;
  defender.commandQueue.length = 0;
  defender.commandIdleTicks = 0;
  defender.stringCommands.length = 0;
  defender.activeStringId = null;
  defender.activeFollowupId = null;
  defender.reaction = {
    kind: "paired",
    moveId: move.id,
    attackerId: attacker.id,
    tick: 0,
  };
  return true;
}

export function counterConditionSatisfied(
  combatant,
  opponent,
  move,
  moves = MARTIAL_ARTS_MOVES,
) {
  if (!move?.counterCondition) return true;
  if (
    move.counterCondition !== "incoming-strike"
    || !combatant
    || !opponent?.action
  ) {
    return false;
  }
  const incomingMove = moves[opponent.action.moveId]
    || MARTIAL_ARTS_STRING_STAGES[opponent.action.moveId]
    || MARTIAL_ARTS_FOLLOWUP_STAGES[opponent.action.moveId];
  if (incomingMove?.kind !== "strike") return false;
  const phase = actionPhase(opponent.action, incomingMove);
  return (
    (phase === "startup" || phase === "active")
    && strikeCanConnect(opponent, combatant, incomingMove)
  );
}

export function queueCombatCommand(combatant, command, {
  maximum = 12,
} = {}) {
  if (!combatant || combatant.defeated) return false;
  const normalized = String(command || "");
  if (!normalized) return false;
  combatant.commandQueue.push(normalized);
  combatant.commandIdleTicks = 0;
  if (combatant.commandQueue.length > maximum) {
    combatant.commandQueue.splice(
      0,
      combatant.commandQueue.length - maximum,
    );
  }
  return true;
}

function commandEndsWith(queue, input) {
  if (input.length > queue.length) return false;
  const offset = queue.length - input.length;
  return input.every((command, index) => queue[offset + index] === command);
}

function commandIsPrefix(queue, input) {
  if (queue.length > input.length) return false;
  return queue.every((command, index) => input[index] === command);
}

export function opponentPosition(attacker, defender) {
  if (!attacker || !defender) return "front";
  const towardAttacker = Math.atan2(
    attacker.x - defender.x,
    attacker.z - defender.z,
  );
  const angle = Math.abs(normalizeAngle(towardAttacker - defender.yaw));
  if (angle > Math.PI * 0.75) return "back";
  if (angle > Math.PI * 0.25) return "side";
  return "front";
}

export function selectQueuedMove(
  combatant,
  moves = MARTIAL_ARTS_MOVES,
  { position = "front", opponent = null } = {},
) {
  if (!canAct(combatant)) return null;
  const batchedString = combatant.commandQueue.length > 1
    && matchingStrings(combatant.commandQueue).length > 0;
  const stringBase = batchedString
    ? Object.values(moves).find((candidate) => (
      candidate.input.length === 1
      && candidate.input[0] === combatant.commandQueue[0]
    ))
    : null;
  const matches = Object.values(moves)
    .flatMap((move) => [
      move.input,
      ...(move.inputAliases || []),
    ].filter((input) => (
      commandEndsWith(combatant.commandQueue, input)
      && (!move.positionCondition || move.positionCondition === position)
      && counterConditionSatisfied(combatant, opponent, move, moves)
    )).map((matchedInput) => ({ move, matchedInput })))
    .sort((left, right) => (
      right.matchedInput.length - left.matchedInput.length
      || Number(
        combatant.commandOverrides[combatCommandKey(right.move.input)]
          === right.move.id,
      ) - Number(
        combatant.commandOverrides[combatCommandKey(left.move.input)]
          === left.move.id,
      )
      || Number(Boolean(right.move.positionCondition))
        - Number(Boolean(left.move.positionCondition))
    ));
  // Counter commands are allowed to lead the incoming attack by the normal
  // command-buffer window. Do not collapse a temporarily ineligible full
  // counter command into its ordinary one-button suffix (for Swallow Flip,
  // that would incorrectly turn S J K into Crescent Kick).
  const bufferedCounter = Object.values(moves).find((candidate) => (
    candidate.counterCondition
    && [candidate.input, ...(candidate.inputAliases || [])].some(
      (input) => commandEndsWith(combatant.commandQueue, input),
    )
    && (!candidate.positionCondition || candidate.positionCondition === position)
    && !counterConditionSatisfied(combatant, opponent, candidate, moves)
  ));
  if (bufferedCounter && combatant.commandIdleTicks <= COMMAND_BUFFER_TICKS) {
    return null;
  }
  const selected = stringBase
    ? { move: stringBase, matchedInput: stringBase.input }
    : matches[0] || null;
  const move = selected?.move || null;
  const longerCandidate = move && Object.values(moves).some((candidate) => (
    [candidate.input, ...(candidate.inputAliases || [])].some((input) => (
      input.length > combatant.commandQueue.length
      && commandIsPrefix(combatant.commandQueue, input)
    ))
  ));
  const commitTicks = move?.input.includes("guard")
    ? COMMAND_MODIFIER_CONTINUATION_TICKS
    : COMMAND_COMMIT_TICKS;
  const startsNativeString = Boolean(
    move
    && selected.matchedInput.length === 1
    && (
      selected.matchedInput[0] === "hand"
      || selected.matchedInput[0] === "leg"
    )
  );
  if (
    move
    && !startsNativeString
    && combatant.commandIdleTicks < commitTicks
    && longerCandidate
  ) {
    return null;
  }
  if (move) {
    if (stringBase) {
      combatant.commandQueue.shift();
    } else {
      combatant.commandQueue.length = 0;
    }
    const aliasKey = selected.matchedInput.join("|");
    combatant.pendingInitialFollowupId = (
      move.inputAliasFollowups?.[aliasKey] || null
    );
    combatant.commandIdleTicks = 0;
  }
  return move;
}

export function setCombatCommandOverride(
  combatant,
  moveId,
  moves = MARTIAL_ARTS_MOVES,
) {
  const move = moves[moveId];
  if (!combatant || !move) return false;
  combatant.commandOverrides[combatCommandKey(move.input)] = move.id;
  return true;
}

export function startCombatMove(combatant, move, {
  lockedTargetId = null,
  defender = null,
} = {}) {
  if (!canAct(combatant) || !move) return false;
  combatant.guardHeld = false;
  combatant.action = {
    moveId: move.id,
    tick: 0,
    highProficiency: Boolean(
      move.highProficiencyAnimation
      && combatant.proficiency >= move.highProficiencyThreshold
    ),
    enemyVariant: combatant.team === "enemy",
    connected: new Set(),
    nextFollowupId: combatant.pendingInitialFollowupId
      || move.initialFollowupId
      || null,
    lockedTargetId,
    counteringTargetId: move.counterCondition ? lockedTargetId : null,
  };
  combatant.pendingInitialFollowupId = null;
  combatant.stringCommands = (
    move.input?.length === 1
    && (move.input[0] === "hand" || move.input[0] === "leg")
  ) ? [move.input[0]] : [];
  combatant.activeStringId = null;
  combatant.activeFollowupId = null;
  combatant.lastMoveId = move.id;
  synchronizeCombatVictim(combatant, defender, move);
  return true;
}

// EN_RYOU action opcode 0x1b at file 0x0e4c compares the current opponent
// distance against the 16.16 fixed-point operand 0x00016666. Passing the
// comparison reaches TUKAMI_NG; its stacked fallback reaches TUKAMI_NG_LONG.
export const THROW_ACQUISITION_NEAR_DISTANCE = 0x00016666 / 0x10000;

function startThrowAcquisition(combatant, move, opponent, followupStages) {
  if (!canAct(combatant) || !move || move.kind !== "throw") return null;
  const distance = opponent
    ? distanceAndFacing(combatant, opponent).distance
    : Number.POSITIVE_INFINITY;
  const stageId = (
    distance < THROW_ACQUISITION_NEAR_DISTANCE
  ) ? "throwAcquireNear" : "throwAcquireLong";
  const stage = followupStages[stageId];
  if (!stage) return null;
  combatant.guardHeld = false;
  combatant.action = {
    moveId: stage.id,
    tick: 0,
    highProficiency: false,
    connected: new Set(),
    acquisitionStage: true,
    pendingThrowMoveId: move.id,
    lockedTargetId: opponent?.id || null,
  };
  combatant.pendingInitialFollowupId = null;
  combatant.stringCommands.length = 0;
  combatant.activeStringId = null;
  combatant.activeFollowupId = null;
  combatant.lastMoveId = stage.id;
  return stage;
}

function matchingStrings(commands) {
  return MARTIAL_ARTS_STRINGS.filter(
    (definition) => commandsArePrefix(commands, definition),
  );
}

function startCombatStringStage(combatant, stage, commands, candidates) {
  combatant.guardHeld = false;
  combatant.action = {
    moveId: stage.id,
    tick: 0,
    highProficiency: false,
    connected: new Set(),
    stringStage: true,
  };
  combatant.stringCommands = [...commands];
  const completedString = candidates.find(
    (definition) => definition.input.length === commands.length,
  );
  combatant.activeStringId = completedString?.id
    || (candidates.length === 1 ? candidates[0].id : null);
  combatant.lastMoveId = stage.id;
}

function consumeCombatStringCommand(combatant, currentMove) {
  if (
    !combatant.action
    || !currentMove
    || combatant.stringCommands.length === 0
    || combatant.commandQueue.length === 0
    // Native strings require the next button before the outgoing attack has
    // settled into late recovery. Inputs after this cancel window retain the
    // existing ordinary late-buffer behavior.
    || combatant.action.tick
      > currentMove.startup + currentMove.active + 3
  ) {
    return null;
  }
  const command = combatant.commandQueue[0];
  const commands = [...combatant.stringCommands, command];
  const candidates = matchingStrings(commands);
  if (candidates.length === 0) return null;

  combatant.commandQueue.shift();
  combatant.commandIdleTicks = 0;
  combatant.stringCommands = commands;
  const stageId = STRING_STAGE_BY_PREFIX.get(commands.join("|"));
  if (!stageId) {
    return {
      type: "string-input-accepted",
      combatantId: combatant.id,
      command,
    };
  }
  const stage = MARTIAL_ARTS_STRING_STAGES[stageId];
  startCombatStringStage(combatant, stage, commands, candidates);
  return {
    type: "string-stage-started",
    combatantId: combatant.id,
    stringId: combatant.activeStringId,
    stageId,
    moveId: stageId,
    label: stage.label,
    animation: stage.animation,
  };
}

function followupForAction(action, followupStages) {
  if (!action) return null;
  return Object.values(followupStages).find(
    (stage) => stage.parentMoveId === action.moveId,
  ) || null;
}

function consumeCombatFollowupCommand(
  combatant,
  currentMove,
  followupStages,
) {
  if (
    !combatant.action
    || !currentMove
    || combatant.commandQueue.length === 0
  ) {
    return null;
  }
  const queuedStage = combatant.action.nextFollowupId
    ? followupStages[combatant.action.nextFollowupId]
    : null;
  const followup = queuedStage
    ? Object.values(followupStages).find(
      (stage) => stage.parentMoveId === queuedStage.id,
    ) || null
    : followupForAction(combatant.action, followupStages);
  const queueProperty = queuedStage
    ? "queuedFollowupAfterNextId"
    : "nextFollowupId";
  if (combatant.action[queueProperty]) return null;
  if (!followup) return null;
  if (combatant.proficiency < followup.minimumProficiency) return null;
  const comparedLength = Math.min(
    combatant.commandQueue.length,
    followup.input.length,
  );
  if (!followup.input.slice(0, comparedLength).every(
    (command, index) => combatant.commandQueue[index] === command,
  )) {
    return null;
  }
  if (combatant.commandQueue.length < followup.input.length) return null;

  combatant.commandQueue.splice(0, followup.input.length);
  combatant.commandIdleTicks = 0;
  combatant.action[queueProperty] = followup.id;
  return {
    type: "followup-input-accepted",
    combatantId: combatant.id,
    parentMoveId: currentMove.id,
    followupId: followup.id,
    input: [...followup.input],
  };
}

function startCombatFollowupStage(
  combatant,
  stage,
  lockedTargetId,
  nextFollowupId = null,
) {
  combatant.guardHeld = false;
  combatant.action = {
    moveId: stage.id,
    tick: 0,
    highProficiency: false,
    connected: new Set(),
    followupStage: true,
    lockedTargetId,
    nextFollowupId,
  };
  combatant.activeFollowupId = stage.id;
  combatant.lastMoveId = stage.id;
}

export function isGuarding(combatant) {
  return Boolean(
    combatant.guardHeld
    && canAct(combatant)
  );
}

export function strikeCanConnect(attacker, defender, move) {
  if (
    !attacker
    || !defender
    || attacker === defender
    || attacker.team === defender.team
    || attacker.defeated
    || defender.defeated
    || defender.invulnerability > 0
    || defender.action?.counteringTargetId === attacker.id
  ) {
    return false;
  }
  const { distance, facingError } = distanceAndFacing(attacker, defender);
  const edgeDistance = Math.max(
    0,
    distance - attacker.radius - defender.radius,
  );
  return edgeDistance <= move.range
    && Math.abs(facingError) <= move.arcDegrees * Math.PI / 360;
}

export function applyCombatHit(attacker, defender, move) {
  const guarded = move.kind !== "throw" && isGuarding(defender);
  const damage = guarded ? move.guardDamage : move.damage;
  const victimDuration = attacker.action?.enemyVariant
    ? move.enemyVictimDuration || move.victimDuration
    : attacker.action?.highProficiency
      ? move.highProficiencyVictimDuration || move.victimDuration
      : move.victimDuration;
  const hitStun = guarded
    ? 0
    : move.synchronizedVictim && victimDuration
      ? Math.max(1, victimDuration - (attacker.action?.tick || 0))
      : victimDuration || move.hitStun;
  defender.health = clamp(defender.health - damage, 0, defender.maxHealth);
  defender.guardStun = guarded ? move.guardStun : 0;
  defender.hitStun = hitStun;
  defender.knockdown = !guarded && move.knockdown
    ? Math.max(defender.knockdown, hitStun + 24)
    : defender.knockdown;
  defender.invulnerability = guarded ? 2 : 4;
  defender.action = null;
  defender.commandQueue.length = 0;
  defender.stringCommands.length = 0;
  defender.activeStringId = null;
  defender.activeFollowupId = null;
  defender.reaction = {
    kind: guarded ? "guard" : move.knockdown ? "knockdown" : "hit",
    moveId: move.id,
    attackerId: attacker.id,
    tick: 0,
  };
  if (defender.health <= 0) {
    defender.defeated = true;
    defender.knockdown = Number.POSITIVE_INFINITY;
    defender.reaction.kind = "defeated";
  }
  return {
    type: guarded ? "guarded" : "hit",
    attackerId: attacker.id,
    defenderId: defender.id,
    moveId: move.id,
    highProficiency: Boolean(attacker.action?.highProficiency),
    damage,
    health: defender.health,
    knockdown: defender.knockdown > 0,
    defeated: defender.defeated,
  };
}

export function applyCombatSpecial(attacker, defender, move) {
  if (move?.specialEffect !== "reposition-behind") return null;
  const separation = attacker.radius + defender.radius + 0.15;
  attacker.x = defender.x - Math.sin(defender.yaw) * separation;
  attacker.z = defender.z - Math.cos(defender.yaw) * separation;
  attacker.yaw = Math.atan2(
    defender.x - attacker.x,
    defender.z - attacker.z,
  );
  return {
    type: "repositioned",
    attackerId: attacker.id,
    defenderId: defender.id,
    moveId: move.id,
    x: attacker.x,
    z: attacker.z,
    yaw: attacker.yaw,
  };
}

function decrementTimer(value) {
  return Number.isFinite(value) ? Math.max(0, value - 1) : value;
}

export class MartialArtsCombat {
  constructor({
    moves = MARTIAL_ARTS_MOVES,
    stringStages = MARTIAL_ARTS_STRING_STAGES,
    followupStages = MARTIAL_ARTS_FOLLOWUP_STAGES,
    ticksPerSecond = COMBAT_TICKS_PER_SECOND,
  } = {}) {
    this.moves = moves;
    this.stringStages = stringStages;
    this.followupStages = followupStages;
    this.ticksPerSecond = ticksPerSecond;
    this.combatants = new Map();
    this.accumulator = 0;
    this.tick = 0;
  }

  add(combatant) {
    if (!combatant?.id) throw new Error("Combatant id is required.");
    this.combatants.set(combatant.id, combatant);
    return combatant;
  }

  remove(id) {
    return this.combatants.delete(id);
  }

  actionDefinition(action) {
    if (!action) return null;
    return this.moves[action.moveId]
      || this.stringStages[action.moveId]
      || this.followupStages[action.moveId]
      || null;
  }

  nearestOpponent(combatant) {
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of this.combatants.values()) {
      if (
        candidate === combatant
        || candidate.team === combatant.team
        || candidate.defeated
      ) {
        continue;
      }
      const distance = Math.hypot(
        candidate.x - combatant.x,
        candidate.z - combatant.z,
      );
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  startQueuedMove(combatant) {
    const opponent = this.nearestOpponent(combatant);
    const queued = selectQueuedMove(combatant, this.moves, {
      position: opponentPosition(combatant, opponent),
      opponent,
    });
    if (!queued) {
      return null;
    }
    if (queued.kind === "throw") {
      const acquisition = startThrowAcquisition(
        combatant,
        queued,
        opponent,
        this.followupStages,
      );
      if (!acquisition) return null;
      return {
        type: "throw-acquisition-started",
        combatantId: combatant.id,
        moveId: queued.id,
        stageId: acquisition.id,
        animation: acquisition.animation,
      };
    }
    if (!startCombatMove(combatant, queued, {
      lockedTargetId: queued.counterCondition ? opponent?.id || null : null,
      defender: queued.counterCondition ? opponent : null,
    })) {
      return null;
    }
    return {
      type: "move-started",
      combatantId: combatant.id,
      ...(combatant.action.lockedTargetId
        ? { defenderId: combatant.action.lockedTargetId }
        : {}),
      moveId: queued.id,
      highProficiency: combatant.action.highProficiency,
    };
  }

  update(deltaSeconds) {
    const events = [];
    this.accumulator += Math.max(0, deltaSeconds) * this.ticksPerSecond;
    while (this.accumulator >= 1) {
      this.accumulator -= 1;
      events.push(...this.step());
    }
    return events;
  }

  step() {
    this.tick += 1;
    const events = [];
    const combatants = [...this.combatants.values()];

    for (const combatant of combatants) {
      combatant.guardStun = decrementTimer(combatant.guardStun);
      combatant.hitStun = decrementTimer(combatant.hitStun);
      combatant.knockdown = decrementTimer(combatant.knockdown);
      combatant.invulnerability = decrementTimer(combatant.invulnerability);
      if (combatant.reaction) {
        combatant.reaction.tick += 1;
        if (
          !combatant.defeated
          && combatant.hitStun <= 0
          && combatant.guardStun <= 0
          && combatant.knockdown <= 0
        ) {
          events.push({
            type: "recovered",
            combatantId: combatant.id,
            reaction: combatant.reaction.kind,
          });
          combatant.reaction = null;
        }
      }
      if (combatant.commandQueue.length > 0) {
        combatant.commandIdleTicks += 1;
        if (combatant.commandIdleTicks > COMMAND_BUFFER_TICKS) {
          combatant.commandQueue.length = 0;
          combatant.commandIdleTicks = 0;
        }
      }

      if (!combatant.action) {
        const started = this.startQueuedMove(combatant);
        if (started) events.push(started);
        continue;
      }

      const move = this.actionDefinition(combatant.action);
      if (!move) {
        combatant.action = null;
        combatant.stringCommands.length = 0;
        combatant.activeStringId = null;
        combatant.activeFollowupId = null;
        continue;
      }
      const followupEvent = consumeCombatFollowupCommand(
        combatant,
        move,
        this.followupStages,
      );
      if (followupEvent) events.push(followupEvent);
      const stringEvent = consumeCombatStringCommand(combatant, move);
      if (stringEvent) events.push(stringEvent);
      const activeMove = this.actionDefinition(combatant.action);
      if (!activeMove) continue;
      const phase = actionPhase(combatant.action, activeMove);
      if (phase === "active") {
        for (const defender of combatants) {
          // Once a paired actor/victim sequence has begun, its locked target
          // is authoritative. Both clips can carry independent root travel;
          // re-running an ordinary range test at the later damage frame can
          // otherwise turn an already-visible throw into a phantom miss.
          const isLockedPairedTarget = Boolean(
            (
              combatant.action.followupStage
              || activeMove.synchronizedVictim
            )
            && combatant.action.lockedTargetId === defender.id,
          );
          if (
            combatant.action.connected.has(defender.id)
            || (
              !isLockedPairedTarget
              && !strikeCanConnect(combatant, defender, activeMove)
            )
          ) {
            continue;
          }
          combatant.action.connected.add(defender.id);
          const special = applyCombatSpecial(
            combatant,
            defender,
            activeMove,
          );
          const connectionEvent = (
            special || applyCombatHit(combatant, defender, activeMove)
          );
          if (Number.isFinite(connectionEvent.damage)) {
            combatant.action.damageDealt = (
              (combatant.action.damageDealt || 0) + connectionEvent.damage
            );
          }
          events.push(connectionEvent);
          // Throws and authored strikes target one opponent. This also avoids
          // an implausible single punch sweeping an entire crowd.
          break;
        }
      }
      combatant.action.tick += 1;
      if (actionPhase(combatant.action, activeMove) === "complete") {
        const completedAction = combatant.action;
        combatant.action = null;
        const moveEndedEvent = {
          type: "move-ended",
          combatantId: combatant.id,
          moveId: activeMove.id,
          ...(completedAction.lockedTargetId
            ? { defenderId: completedAction.lockedTargetId }
            : {}),
        };
        events.push(moveEndedEvent);
        if (completedAction.acquisitionStage) {
          const pendingThrow = this.moves[
            completedAction.pendingThrowMoveId
          ];
          const target = this.combatants.get(
            completedAction.lockedTargetId,
          );
          if (
            pendingThrow
            && target
            && strikeCanConnect(combatant, target, pendingThrow)
            && startCombatMove(combatant, pendingThrow, {
              lockedTargetId: target.id,
              defender: target,
            })
          ) {
            events.push({
              type: "move-started",
              combatantId: combatant.id,
              defenderId: target.id,
              moveId: pendingThrow.id,
              highProficiency: combatant.action.highProficiency,
            });
          } else {
            events.push({
              type: "throw-acquisition-failed",
              combatantId: combatant.id,
              moveId: completedAction.pendingThrowMoveId,
            });
          }
          continue;
        }
        const followupId = completedAction.nextFollowupId
          || activeMove.initialFollowupId
          || null;
        const followup = followupId
          ? this.followupStages[followupId]
          : null;
        const lockedTargetId = completedAction.lockedTargetId
          || [...completedAction.connected][0]
          || null;
        if (
          followup
          && combatant.proficiency >= followup.minimumProficiency
          && (!followup.requiresConnection || lockedTargetId)
        ) {
          moveEndedEvent.continued = true;
          startCombatFollowupStage(
            combatant,
            followup,
            lockedTargetId,
            completedAction.queuedFollowupAfterNextId || null,
          );
          synchronizeCombatVictim(
            combatant,
            this.combatants.get(lockedTargetId),
            followup,
          );
          events.push({
            type: "followup-stage-started",
            combatantId: combatant.id,
            defenderId: lockedTargetId,
            parentMoveId: activeMove.id,
            followupId: followup.id,
            moveId: followup.id,
            animation: followup.animation,
            victimAnimation: followup.victimAnimation,
          });
          continue;
        }
        if (completedAction.followupStage) {
          combatant.activeFollowupId = null;
        }
        // A command buffered during recovery begins on the same simulation
        // tick. The animation adapter therefore blends from the outgoing
        // move's final routed pose directly into the next authored clip,
        // without rendering a one-frame idle/stance pose between them.
        const chained = this.startQueuedMove(combatant);
        if (chained) {
          moveEndedEvent.continued = true;
          events.push(chained);
        }
        if (!chained && completedAction.stringStage) {
          combatant.stringCommands.length = 0;
          combatant.activeStringId = null;
        }
      }
    }
    return events;
  }
}

export class MartialArtsEnemyAI {
  constructor({
    preferredRange = 1.1,
    aggression = 0.72,
    random = Math.random,
  } = {}) {
    this.preferredRange = preferredRange;
    this.aggression = clamp(aggression, 0, 1);
    this.random = random;
    this.cooldown = 0;
  }

  decide(enemy, target) {
    if (!enemy || !target || enemy.defeated || target.defeated) {
      return { kind: "idle" };
    }
    const relation = distanceAndFacing(enemy, target);
    if (enemy.hitStun > 0 || enemy.knockdown > 0) {
      return { kind: "stunned" };
    }
    if (enemy.action) return { kind: "action" };
    if (this.cooldown > 0) {
      this.cooldown -= 1;
      return { kind: "guard", turnYaw: relation.targetYaw };
    }
    if (relation.distance > this.preferredRange + 0.45) {
      return {
        kind: "approach",
        turnYaw: relation.targetYaw,
        distance: Math.min(0.1, relation.distance - this.preferredRange),
      };
    }
    if (relation.distance < 0.65) {
      return {
        kind: "retreat",
        turnYaw: relation.targetYaw,
        distance: 0.06,
      };
    }
    if (this.random() > this.aggression) {
      this.cooldown = 8;
      return { kind: "guard", turnYaw: relation.targetYaw };
    }
    const moveId = relation.distance < 0.95 && this.random() < 0.22
      ? "shoulderBuster"
      : this.random() < 0.55
        ? "tigerKnuckle"
        : "crescentKick";
    this.cooldown = 5;
    return { kind: "move", moveId, turnYaw: relation.targetYaw };
  }
}
