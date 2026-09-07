export const GAME_TICKS_PER_SECOND = 30;

export const EMOTES = Object.freeze([
  {
    id: "scratchHead",
    label: "Scratch Head",
    entry: "AKI_AKI_PORI_ST",
    loop: "AKI_AKI_PORI_LP",
    exit: "AKI_AKI_PORI_EN",
  },
  {
    id: "petCat",
    label: "Pet Cat",
    entry: "AKI_AKI_SAGASU_KAGI_ST",
    loop: "AKI_AKI_SAGASU_KAGI_LP",
    exit: "AKI_AKI_SAGASU_KAGI_EN",
  },
  {
    id: "bow",
    label: "Bow",
    entry: "AKI_AKI_OJIGI_ST",
    loop: "AKI_AKI_OJIGI_LP",
    exit: "AKI_AKI_OJIGI_EN",
  },
  {
    id: "lookUp",
    label: "Look Up",
    entry: "AKI_AKI_LOOKUP_UP",
    loop: "AKI_AKI_LOOKUP_LP",
    exit: "AKI_AKI_LOOKUP_DOWN",
  },
  {
    id: "thinking",
    label: "Thinking",
    entry: "AKI_AKI_THINK_ST",
    loop: "AKI_AKI_THINK_LP",
    exit: "AKI_AKI_THINK_EN",
  },
  {
    id: "crossArms",
    label: "Cross Arms",
    entry: "AKI_AKI_UDEKUMI_ST",
    loop: "AKI_AKI_UDEKUMI_LP",
    exit: "AKI_AKI_UDEKUMI_EN",
  },
  {
    id: "touchForehead",
    label: "Touch Forehead",
    entry: "AKI_AKI_DENWA_TORU",
    loop: "AKI_AKI_DENWA_LP",
    exit: "AKI_AKI_DENWA_OKU",
  },
  {
    id: "cough",
    label: "Cough",
    loop: "AKI_AKI_KAMAE_TUKARE2_LP",
  },
  {
    id: "lyingDown",
    label: "Lying Down",
    loop: "AKI_AKI_SLEEP_BED_LP",
    holdLoopUntilMovement: true,
  },
]);

export const PICKER_EMOTE_IDS = new Set(EMOTES.map((emote) => emote.id));
export const INTERACTION_EMOTES = Object.freeze([
  {
    id: "dobuitaPhoneBook",
    label: "Use telephone book",
    motionFile: "M_D000.MOTN",
    entry: "AKI_TORU_TELBOOK_90_F",
    loop: "AKI_LOOK_TELBOOK_LP_F",
    exit: "AKI_OKU_TELBOOK_90_F",
  },
  {
    id: "dobuitaNoMoney",
    label: "Check pockets",
    motionFile: "M_D000.MOTN",
    loop: "AKI_NAI_OKANE_B_POCKET_F",
  },
  {
    id: "dobuitaGacha",
    label: "Use capsule toy machine",
    motionFile: "M_GACH.MOTN",
    loop: "AKI_ASOBU_GATYA",
    audioCues: {
      loop: [
        {
          frame: 360,
          commandHex: "a9040200",
          bank: "e1gachap",
          evidence: "tools/evidence/d000-gacha-audio.json",
        },
      ],
    },
  },
  {
    id: "vendingDrink",
    preserveEndPosition: true,
    label: "Drink from vending machine",
    motionFile: "M_DJUC.MOTN",
    entry: "AKI_IRERU_COIN",
    loop: "AKI_TORU_JUICE",
    exit: "AKI_NOMU_JUICE",
  },
  {
    id: "vendingCoffee",
    preserveEndPosition: true,
    label: "Drink coffee from vending machine",
    motionFile: "M_DJUC.MOTN",
    entry: "AKI_IRERU_COIN",
    loop: "AKI_TORU_JUICE",
    exit: "AKI_NOMU_JUICE_250",
  },
  {
    id: "cinemaSit",
    label: "Sit in cinema chair",
    loop: "AKI_AKI_SIT_CHAIR_DOWN_LP",
    holdLoopUntilMovement: true,
  },
]);
export const RUNTIME_EMOTES = Object.freeze([
  ...EMOTES,
  ...INTERACTION_EMOTES,
]);
export const NETWORK_EMOTE_IDS = new Set([
  ...PICKER_EMOTE_IDS,
  "vendingDrink",
  "vendingCoffee",
  "cinemaSit",
]);
export const EMOTE_BLEND_TICKS = 6;
export const LOCOMOTION_BLEND_SECONDS = 6 / GAME_TICKS_PER_SECOND;
export const LOCOMOTION_STATES = new Set([
  "idle",
  "walk",
  "backpedal",
  "turnLeft",
  "turnRight",
  "run",
  "combatAdvance",
  "combatRetreat",
  "combatStrafeLeft",
  "combatStrafeRight",
]);
export const SEQUENCES = Object.freeze({
  idle: "AKI_AKI_STAND_DOWN_LP",
  walk: "A_WALK_L_02",
  turnLeft: "AKI_AKI_TURN090_L",
  turnRight: "AKI_AKI_TURN090_R",
  run: "AKI_AKI_RUN_MID_LP",
  forkliftSit: "AKI_RIDE_FORKLIFT_LP_F",
  ...Object.fromEntries(RUNTIME_EMOTES.flatMap((emote) => (
    ["entry", "loop", "exit"]
      .filter((phase) => emote[phase])
      .map((phase) => [
        `${emote.id}:${phase}`,
        emote[phase],
      ])
  ))),
});
export const LOCOMOTION_MOTION_FILES = Object.freeze({
  forkliftSit: "M_FREE.BIN",
});
