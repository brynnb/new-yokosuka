export const PADDLE_REACTION_ROUNDS = Object.freeze([
  Object.freeze({
    duration: 20,
    riseDuration: 0.5,
    responseWindow: 1.5,
    doubleChance: 0,
    stagger: 0,
  }),
  Object.freeze({
    duration: 20,
    riseDuration: 0.5,
    responseWindow: 1.5,
    doubleChance: 0.5,
    stagger: 0.25,
  }),
  Object.freeze({
    duration: 20,
    riseDuration: 0.25,
    responseWindow: 1,
    doubleChance: 0.5,
    stagger: 0.25,
  }),
]);

const PADDLE_COUNT = 3;
export const PADDLE_MAX_SCORE = 99999;
export const PADDLE_PERFECT_REACTION_SECONDS = 0.2;
const HIT_RETURN_SECONDS = 0.1;
const POST_HIT_PAUSE_SECONDS = 1;
export const PADDLE_BETWEEN_ROUNDS_SECONDS = 2;
const READY_SECONDS = 0.75;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function reactionQuality(elapsed, duration) {
  if (elapsed <= PADDLE_PERFECT_REACTION_SECONDS) return 1;
  const scoringWindow = Math.max(
    Number.EPSILON,
    duration - PADDLE_PERFECT_REACTION_SECONDS,
  );
  return clamp(
    1 - (elapsed - PADDLE_PERFECT_REACTION_SECONDS) / scoringWindow,
    0,
    1,
  );
}

export class PaddleReactionGame {
  constructor({
    random = Math.random,
    rounds = PADDLE_REACTION_ROUNDS,
  } = {}) {
    this.random = random;
    this.rounds = rounds;
    this.reset();
  }

  reset() {
    this.state = {
      score: 0,
      elapsed: 0,
      round: 1,
      roundTimeLeft: this.rounds[0]?.duration || 0,
      phase: "ready",
      phaseTimeLeft: READY_SECONDS,
      over: false,
      complete: false,
      message: "",
      paddlePoses: Array(PADDLE_COUNT).fill(0),
      group: null,
      nextEventIn: 0,
      reactionQualityTotal: 0,
      reactionHitCount: 0,
    };
    return this.state;
  }

  start() {
    return this.reset();
  }

  stop() {
    this.state.paddlePoses.fill(0);
    this.state.group = null;
  }

  press(paddleIndex) {
    if (
      this.state.over
      || this.state.phase !== "playing"
      || paddleIndex < 0
      || paddleIndex >= PADDLE_COUNT
    ) return false;
    const group = this.state.group;
    if (!group) return false;
    const target = group?.targets.find((entry) => (
      entry.index === paddleIndex
      && entry.active
      && !entry.hit
    ));
    if (!target) {
      this.gameOver("Wrong direction");
      return false;
    }

    target.hit = true;
    target.hitPose = this.state.paddlePoses[paddleIndex];
    target.returnElapsed = 0;
    const reactionElapsed = Math.max(
      0,
      group.elapsed - target.activationAt,
    );
    const quality = reactionQuality(
      reactionElapsed,
      group.config.responseWindow,
    );
    this.state.reactionQualityTotal += quality;
    this.state.reactionHitCount++;
    this.state.score = Math.min(
      PADDLE_MAX_SCORE,
      this.state.score + Math.round(10 + quality * 90),
    );
    return true;
  }

  finalizeScore() {
    if (this.state.reactionHitCount <= 0) {
      this.state.score = 0;
      return;
    }
    const averageQuality = (
      this.state.reactionQualityTotal / this.state.reactionHitCount
    );
    this.state.score = Math.min(
      PADDLE_MAX_SCORE,
      Math.round(PADDLE_MAX_SCORE * averageQuality),
    );
  }

  update(deltaSeconds) {
    if (this.state.over) return this.state;
    let remaining = Math.max(0, Number(deltaSeconds) || 0);
    // Consume long updates across phase boundaries so tab throttling does not
    // make a 30-second round last for minutes.
    while (remaining > 0 && !this.state.over) {
      const step = Math.min(remaining, 0.05);
      remaining -= step;
      this.updateStep(step);
    }
    return this.state;
  }

  updateStep(delta) {
    this.state.elapsed += delta;
    if (this.state.phase === "ready") {
      this.state.phaseTimeLeft -= delta;
      if (this.state.phaseTimeLeft <= 0) {
        this.state.phase = "playing";
        this.beginEvent();
      }
      return;
    }
    if (this.state.phase === "between-rounds") {
      this.state.phaseTimeLeft -= delta;
      if (this.state.phaseTimeLeft <= 0) {
        this.state.phase = "playing";
        this.beginEvent();
      }
      return;
    }
    if (this.state.phase !== "playing") return;

    this.state.roundTimeLeft -= delta;
    if (this.state.roundTimeLeft <= 0) {
      this.advanceRound();
      return;
    }
    if (!this.state.group) {
      this.state.nextEventIn -= delta;
      if (this.state.nextEventIn <= 0) this.beginEvent();
      return;
    }

    const group = this.state.group;
    group.elapsed += delta;
    for (const target of group.targets) {
      if (!target.active && group.elapsed >= target.activationAt) {
        target.active = true;
      }
      if (!target.active) continue;
      if (target.hit) {
        target.returnElapsed += delta;
        this.state.paddlePoses[target.index] = (
          target.hitPose
          * (1 - clamp(target.returnElapsed / HIT_RETURN_SECONDS, 0, 1))
        );
      } else {
        this.state.paddlePoses[target.index] = clamp(
          (group.elapsed - target.activationAt) / group.config.riseDuration,
          0,
          1,
        );
      }
    }

    if (
      group.elapsed >= group.config.responseWindow
      && group.targets.some((target) => !target.hit)
    ) {
      this.gameOver("Too slow");
      return;
    }
    if (
      group.targets.every((target) => (
        target.hit && target.returnElapsed >= HIT_RETURN_SECONDS
      ))
    ) {
      this.state.group = null;
      this.state.nextEventIn = Math.max(
        0,
        POST_HIT_PAUSE_SECONDS - HIT_RETURN_SECONDS,
      );
    }
  }

  beginEvent() {
    const config = this.rounds[this.state.round - 1];
    const targetCount = this.random() < config.doubleChance ? 2 : 1;
    const available = [0, 1, 2];
    const targets = [];
    for (let index = 0; index < targetCount; index++) {
      const selected = Math.min(
        available.length - 1,
        Math.floor(this.random() * available.length),
      );
      targets.push({
        index: available.splice(selected, 1)[0],
        activationAt: index * config.stagger,
        active: index === 0,
        hit: false,
        hitPose: 0,
        returnElapsed: 0,
      });
    }
    this.state.group = {
      config,
      elapsed: 0,
      targets,
    };
    this.state.nextEventIn = 0;
  }

  advanceRound() {
    this.state.paddlePoses.fill(0);
    this.state.group = null;
    if (this.state.round >= this.rounds.length) {
      this.state.roundTimeLeft = 0;
      this.finalizeScore();
      this.state.over = true;
      this.state.complete = true;
      this.state.phase = "complete";
      this.state.message = "Three rounds complete";
      return;
    }
    this.state.round++;
    this.state.roundTimeLeft = this.rounds[this.state.round - 1].duration;
    this.state.phase = "between-rounds";
    this.state.phaseTimeLeft = PADDLE_BETWEEN_ROUNDS_SECONDS;
  }

  gameOver(message) {
    this.state.over = true;
    this.state.complete = false;
    this.state.phase = "game-over";
    this.state.message = message;
    this.state.group = null;
    this.state.paddlePoses.fill(0);
  }
}
