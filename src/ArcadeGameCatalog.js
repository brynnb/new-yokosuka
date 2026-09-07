export const ARCADE_GAMES = Object.freeze({
  hangon: Object.freeze({
    id: "hangon",
    title: "Hang-On",
    mode: "emulator",
    instructions: "Insert a coin, then press Start",
    controls: Object.freeze([
      Object.freeze({ keys: Object.freeze(["A", "D"]), label: "Steer" }),
      Object.freeze({ keys: Object.freeze(["W"]), label: "Accelerate" }),
      Object.freeze({ keys: Object.freeze(["S"]), label: "Brake" }),
      Object.freeze({ keys: Object.freeze(["V"]), label: "Insert Coin" }),
      Object.freeze({ keys: Object.freeze(["Enter"]), label: "Start" }),
      Object.freeze({ keys: Object.freeze(["Esc"]), label: "Exit Game" }),
    ]),
  }),
  harrier: Object.freeze({
    id: "harrier",
    title: "Space Harrier",
    mode: "emulator",
    instructions: "Insert a coin, then press Start",
    controls: Object.freeze([
      Object.freeze({
        keys: Object.freeze(["W", "A", "S", "D"]),
        label: "Move",
      }),
      Object.freeze({ keys: Object.freeze(["Space"]), label: "Fire" }),
      Object.freeze({ keys: Object.freeze(["V"]), label: "Insert Coin" }),
      Object.freeze({ keys: Object.freeze(["Enter"]), label: "Start" }),
      Object.freeze({ keys: Object.freeze(["Esc"]), label: "Exit Game" }),
    ]),
  }),
  astrob: Object.freeze({
    id: "astrob",
    title: "Astro Blaster",
    mode: "emulator",
    instructions: "Insert a coin, then press Start",
    controls: Object.freeze([
      Object.freeze({ keys: Object.freeze(["A", "D"]), label: "Move" }),
      Object.freeze({ keys: Object.freeze(["Space"]), label: "Fire" }),
      Object.freeze({ keys: Object.freeze(["C"]), label: "Warp" }),
      Object.freeze({ keys: Object.freeze(["V"]), label: "Insert Coin" }),
      Object.freeze({ keys: Object.freeze(["Enter"]), label: "Start" }),
      Object.freeze({ keys: Object.freeze(["Esc"]), label: "Exit Game" }),
    ]),
  }),
  pacman: Object.freeze({
    id: "pacman",
    title: "Pac-Man",
    mode: "emulator",
    instructions: "Insert a coin, then press Start",
    controls: Object.freeze([
      Object.freeze({
        keys: Object.freeze(["W", "A", "S", "D"]),
        label: "Move",
      }),
      Object.freeze({ keys: Object.freeze(["V"]), label: "Insert Coin" }),
      Object.freeze({ keys: Object.freeze(["Enter"]), label: "Start" }),
      Object.freeze({ keys: Object.freeze(["Esc"]), label: "Exit Game" }),
    ]),
  }),
  invaders: Object.freeze({
    id: "invaders",
    title: "Space Invaders",
    mode: "emulator",
    instructions: "Insert a coin, then press Start",
    controls: Object.freeze([
      Object.freeze({ keys: Object.freeze(["A", "D"]), label: "Move" }),
      Object.freeze({ keys: Object.freeze(["Space"]), label: "Fire" }),
      Object.freeze({ keys: Object.freeze(["V"]), label: "Insert Coin" }),
      Object.freeze({ keys: Object.freeze(["Enter"]), label: "Start" }),
      Object.freeze({ keys: Object.freeze(["Esc"]), label: "Exit Game" }),
    ]),
  }),
  qte: Object.freeze({
    id: "qte",
    title: "Excite QTE",
    instructions: (
      "Press Start, choose a difficulty, then match each prompt"
    ),
    controls: Object.freeze([
      Object.freeze({
        keys: Object.freeze(["↑", "↓", "←", "→"]),
        label: "Directions",
      }),
      Object.freeze({ keys: Object.freeze(["A", "B"]), label: "Buttons" }),
      Object.freeze({ keys: Object.freeze(["Enter"]), label: "Start" }),
      Object.freeze({ keys: Object.freeze(["Esc"]), label: "Exit Game" }),
    ]),
  }),
  paddles: Object.freeze({
    id: "paddles",
    title: "Paddle Game",
    mode: "physical",
    physicalKind: "paddles",
    instructions: "Hit each raised paddle before time runs out",
    controls: Object.freeze([
      Object.freeze({ keys: Object.freeze(["A"]), label: "Left" }),
      Object.freeze({ keys: Object.freeze(["W"]), label: "Center" }),
      Object.freeze({ keys: Object.freeze(["D"]), label: "Right" }),
      Object.freeze({ keys: Object.freeze(["Esc"]), label: "Exit Game" }),
    ]),
  }),
  darts: Object.freeze({
    id: "darts",
    title: "Darts Seven",
    mode: "physical",
    physicalKind: "darts",
    decimalScores: true,
    instructions: "Press Space or click to throw · 5 darts",
    controls: Object.freeze([
      Object.freeze({ keys: Object.freeze(["Space"]), label: "Throw" }),
      Object.freeze({ keys: Object.freeze(["Esc"]), label: "Exit Game" }),
    ]),
  }),
});

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function qtePromptForIndex(index) {
  const prompts = [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "KeyA",
    "KeyB",
  ];
  return prompts[((index % prompts.length) + prompts.length) % prompts.length];
}

export const QTE_DIFFICULTIES = Object.freeze([
  Object.freeze({
    id: "easy",
    label: "EASY",
    initialSeconds: 1.5,
    minimumSeconds: 0.9,
    decayPerPrompt: 0.006,
  }),
  Object.freeze({
    id: "normal",
    label: "NORMAL",
    initialSeconds: 1,
    minimumSeconds: 0.65,
    decayPerPrompt: 0.006,
  }),
  Object.freeze({
    id: "hard",
    label: "HARD",
    initialSeconds: 0.75,
    minimumSeconds: 0.5,
    decayPerPrompt: 0.006,
  }),
  Object.freeze({
    id: "super-hard",
    label: "SUPER HARD",
    initialSeconds: 0.5,
    minimumSeconds: 0.34,
    decayPerPrompt: 0.006,
  }),
]);

export function qteDifficulty(index) {
  const normalized = Math.max(
    0,
    Math.min(QTE_DIFFICULTIES.length - 1, Math.trunc(index) || 0),
  );
  return QTE_DIFFICULTIES[normalized];
}

export function qtePromptDuration(difficultyIndex, promptIndex) {
  const difficulty = qteDifficulty(difficultyIndex);
  return Math.max(
    difficulty.minimumSeconds,
    difficulty.initialSeconds
      - Math.max(0, Math.trunc(promptIndex) || 0)
        * difficulty.decayPerPrompt,
  );
}

export function qteReactionScore(remaining, duration) {
  if (!(duration > 0)) return 0;
  const fraction = clamp(remaining / duration, 0, 1);
  return Math.round(20 + fraction * 80);
}

export function dartScoreFromRadius(radius) {
  if (radius <= 0.055) return 50;
  if (radius <= 0.12) return 25;
  if (radius <= 0.3) return 20;
  if (radius <= 0.52) return 10;
  if (radius <= 0.82) return 5;
  return 0;
}

export function dartTimeBonusForThrow(points, timeBonus) {
  return points > 0 ? Math.max(0, Number(timeBonus) || 0) : 0;
}
