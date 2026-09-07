import assert from "node:assert/strict";
import test from "node:test";
import {
  PADDLE_BETWEEN_ROUNDS_SECONDS,
  PADDLE_MAX_SCORE,
  PaddleReactionGame,
  PADDLE_REACTION_ROUNDS,
} from "../src/PaddleReactionGame.js";
import {
  PADDLE_END_FLASH_SECONDS,
  paddleEndFlashVisibility,
  paddleReactionIndexForMesh,
  paddleRoundLampStates,
} from "../play/arcade/PaddleReactionRuntime.js";

function activeGame(random = () => 0) {
  const game = new PaddleReactionGame({ random });
  game.start();
  game.update(0.75);
  return game;
}

test("physical paddle picking resolves only tagged mesh hierarchies", () => {
  const paddle = {
    metadata: { paddleReactionIndex: 1 },
    parent: null,
  };
  assert.equal(
    paddleReactionIndexForMesh({ metadata: {}, parent: paddle }),
    1,
  );
  assert.equal(paddleReactionIndexForMesh({ metadata: {}, parent: null }), null);
  assert.equal(
    paddleReactionIndexForMesh({
      metadata: { paddleReactionIndex: 9 },
      parent: null,
    }),
    null,
  );
});

test("all three round lamps flash during the two-second round break", () => {
  assert.equal(PADDLE_BETWEEN_ROUNDS_SECONDS, 2);
  assert.deepEqual(paddleRoundLampStates({
    phase: "between-rounds",
    round: 2,
    phaseTimeLeft: 2,
  }), [true, true, true]);
  assert.deepEqual(paddleRoundLampStates({
    phase: "between-rounds",
    round: 2,
    phaseTimeLeft: 1.7,
  }), [false, false, false]);
  assert.deepEqual(paddleRoundLampStates({
    phase: "playing",
    round: 2,
    phaseTimeLeft: 0,
  }), [true, true, false]);
});

test("the five-second game-over flash includes only a new high score", () => {
  assert.equal(PADDLE_END_FLASH_SECONDS, 5);
  assert.deepEqual(paddleEndFlashVisibility({
    endFlashElapsed: 0.3,
    newHighScore: false,
  }), {
    score: false,
    lastScore: false,
    highScore: true,
  });
  assert.deepEqual(paddleEndFlashVisibility({
    endFlashElapsed: 0.3,
    newHighScore: true,
  }), {
    score: false,
    lastScore: false,
    highScore: false,
  });
  assert.deepEqual(paddleRoundLampStates({
    over: true,
    endFlashElapsed: 0.3,
  }), [false, false, false]);
});

test("round one raises one paddle over half a second", () => {
  const game = activeGame(() => 0);
  assert.equal(game.state.group.targets.length, 1);
  assert.equal(game.state.group.targets[0].index, 0);
  game.update(0.25);
  assert.ok(Math.abs(game.state.paddlePoses[0] - 0.5) < 1e-9);
  game.update(0.25);
  assert.ok(Math.abs(game.state.paddlePoses[0] - 1) < 1e-9);
});

test("a hit returns its paddle in 0.1 seconds and faster hits score more", () => {
  const fast = activeGame(() => 0);
  fast.update(0.1);
  assert.equal(fast.press(0), true);
  const fastScore = fast.state.score;
  fast.update(0.1);
  assert.equal(fast.state.paddlePoses[0], 0);

  const slow = activeGame(() => 0);
  slow.update(1);
  assert.equal(slow.press(0), true);
  assert.ok(fastScore > slow.state.score);
});

test("an incorrect direction immediately ends the game", () => {
  const game = activeGame(() => 0);
  assert.equal(game.press(1), false);
  assert.equal(game.state.over, true);
  assert.equal(game.state.complete, false);
  assert.equal(game.state.message, "Wrong direction");
});

test("the next paddle waits one second from the successful hit", () => {
  const game = activeGame(() => 0);
  assert.equal(game.press(0), true);
  game.update(0.99);
  assert.equal(game.state.group, null);
  game.update(0.011);
  assert.ok(game.state.group);
});

test("score cannot exceed the five-digit display maximum", () => {
  const game = activeGame(() => 0);
  game.state.score = PADDLE_MAX_SCORE - 1;
  assert.equal(game.press(0), true);
  assert.equal(game.state.score, 99999);
});

test("a human-limit perfect three-round run reaches 99999", () => {
  const rounds = PADDLE_REACTION_ROUNDS.map((round) => ({
    ...round,
    duration: 0.4,
    riseDuration: 0.05,
    responseWindow: 0.3,
    doubleChance: 0,
  }));
  const game = new PaddleReactionGame({ rounds, random: () => 0 });
  game.start();
  for (let index = 0; index < 1000 && !game.state.over; index++) {
    game.update(0.01);
    const target = game.state.group?.targets.find(
      (entry) => entry.active && !entry.hit,
    );
    if (target) game.press(target.index);
  }
  assert.equal(game.state.complete, true);
  assert.equal(game.state.score, PADDLE_MAX_SCORE);
});

test("missing the 1.5 second round-one window ends the game", () => {
  const game = activeGame(() => 0);
  game.update(1.51);
  assert.equal(game.state.over, true);
  assert.equal(game.state.complete, false);
});

test("round two can schedule two distinct paddles 0.25 seconds apart", () => {
  const rounds = PADDLE_REACTION_ROUNDS.map((round, index) => ({
    ...round,
    duration: index === 0 ? 0.01 : round.duration,
  }));
  const values = [0, 0, 0, 0];
  const game = new PaddleReactionGame({
    rounds,
    random: () => values.shift() ?? 0,
  });
  game.start();
  game.update(0.75 + 0.01 + PADDLE_BETWEEN_ROUNDS_SECONDS + 0.1);
  assert.equal(game.state.round, 2);
  assert.equal(game.state.group.targets.length, 2);
  assert.notEqual(
    game.state.group.targets[0].index,
    game.state.group.targets[1].index,
  );
  assert.equal(game.state.group.targets[1].activationAt, 0.25);
  assert.equal(game.state.group.targets[1].active, false);
  game.update(0.25);
  assert.equal(game.state.group.targets[1].active, true);
});

test("round three uses the faster rise and one-second shared deadline", () => {
  assert.deepEqual(
    PADDLE_REACTION_ROUNDS.map(({ duration }) => duration),
    [20, 20, 20],
  );
  assert.equal(PADDLE_REACTION_ROUNDS[2].riseDuration, 0.25);
  assert.equal(PADDLE_REACTION_ROUNDS[2].responseWindow, 1);
  assert.equal(PADDLE_REACTION_ROUNDS[2].stagger, 0.25);
});
