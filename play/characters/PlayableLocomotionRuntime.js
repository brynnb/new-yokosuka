const NATIVE_LOCOMOTION_PROFILES = new Map([
  [16, Object.freeze({
    idle: "CAT_CAT_TATI_LP",
    walk: "CAT_CAT_WALK_LP",
    // M_MOBJ has no separate cat run. Reuse the authored quadruped gait and
    // synchronize its cadence with the controller's run/walk speed ratio.
    run: "CAT_CAT_WALK_LP",
    scaleRunCadence: true,
  })],
  [18, Object.freeze({
    idle: "DOG_DOG_TATI_LP",
    walk: "DOG_DOG_WALK_LP",
    run: "DOG_DOG_RUN_LP",
    scaleRunCadence: false,
    modelYawOffset: Math.PI,
  })],
]);

const NATIVE_STATES = new Set(["idle", "walk", "run", "backpedal", "turnLeft", "turnRight"]);

export function supportsPlayableEmotes(character) {
  return !NATIVE_LOCOMOTION_PROFILES.has(character?.controllerFamily);
}

export function playableLocomotionModelYawOffset(character) {
  return NATIVE_LOCOMOTION_PROFILES.get(
    character?.controllerFamily,
  )?.modelYawOffset ?? 0;
}

export function nativeLocomotionSelection(
  controllerFamily,
  state,
  elapsedSeconds,
  { runCadenceScale = 1 } = {},
) {
  const profile = NATIVE_LOCOMOTION_PROFILES.get(controllerFamily);
  if (!profile || !NATIVE_STATES.has(state)) return null;
  // Animal rigs have no matching humanoid turn clip; keep their own footwork.
  const motionState = ["backpedal", "turnLeft", "turnRight"].includes(state) ? "walk" : state;
  const cadence = motionState === "run" && profile.scaleRunCadence
    ? Math.max(1, runCadenceScale)
    : 1;
  return {
    bank: "mobj",
    name: profile[motionState],
    loop: true,
    elapsedSeconds: Math.max(0, elapsedSeconds) * cadence,
  };
}

export class PlayableLocomotionRuntime {
  constructor({ motionRuntime }) {
    this.motionRuntime = motionRuntime;
    this.runCadenceScale = 1;
  }

  async configure() {
    await this.motionRuntime.loadNamedSelections(
      [...NATIVE_LOCOMOTION_PROFILES.values()].flatMap((profile) => (
        [
          [profile.idle, false],
          [profile.walk, true],
          [profile.run, true],
        ].map(([name, movement]) => ({
          bank: "mobj",
          name,
          movement,
        }))
      )),
    );
  }

  createModel(character, loader, renderRoot) {
    if (!NATIVE_LOCOMOTION_PROFILES.has(character?.controllerFamily)) {
      return null;
    }
    return {
      character,
      loader,
      renderRoot,
      modelCode: character.modelCode,
      humanoidControlRigs: new Map(),
      motionPoseWorkspace: null,
    };
  }

  setRunCadenceScale(scale) {
    this.runCadenceScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  apply(model, state, elapsedSeconds, options = {}) {
    const selection = nativeLocomotionSelection(
      model?.character?.controllerFamily,
      state,
      elapsedSeconds,
      {
        runCadenceScale: this.runCadenceScale,
        ...options,
      },
    );
    return selection
      ? this.motionRuntime.applyNamed(model, selection, elapsedSeconds)
      : false;
  }
}
