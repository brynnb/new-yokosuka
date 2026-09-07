import {
  ARCADE_GAMES,
  QTE_DIFFICULTIES,
  clamp,
  dartScoreFromRadius,
  dartTimeBonusForThrow,
  qteDifficulty,
  qtePromptDuration,
  qtePromptForIndex,
  qteReactionScore,
} from "./ArcadeGameCatalog.js";
import { renderArcadeGame } from "./ArcadeGameRenderers.js";

export {
  ARCADE_GAMES,
  QTE_DIFFICULTIES,
  dartScoreFromRadius,
  dartTimeBonusForThrow,
  qteDifficulty,
  qtePromptDuration,
  qtePromptForIndex,
  qteReactionScore,
} from "./ArcadeGameCatalog.js";

function loadArtwork(source) {
  if (typeof globalThis.Image !== "function") return null;
  const image = new globalThis.Image();
  image.decoding = "async";
  image.src = source;
  return image;
}

export function canReuseActiveEmulator(active, currentGame, requestedGame) {
  return Boolean(
    active
    && requestedGame?.mode === "emulator"
    && currentGame?.id === requestedGame.id
  );
}

export class ArcadeGames {
  constructor({
    overlay,
    canvas,
    title,
    instructions,
    score,
    highScore,
    status,
    closeButton,
    emulatorFrame = null,
    paddleRuntime = null,
    dartsRuntime = null,
    getHighScore = (gameId, _sessionContext, fallback) => fallback,
    submitScore = () => null,
    onActiveChange = () => {},
    onControlsChange = () => {},
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  }) {
    this.overlay = overlay;
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.titleElement = title;
    this.instructionsElement = instructions;
    this.scoreElement = score;
    this.highScoreElement = highScore;
    this.statusElement = status;
    this.closeButton = closeButton;
    this.emulatorFrame = emulatorFrame;
    this.paddleRuntime = paddleRuntime;
    this.dartsRuntime = dartsRuntime;
    this.getHighScore = getHighScore;
    this.submitScore = submitScore;
    this.onActiveChange = onActiveChange;
    this.onControlsChange = onControlsChange;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.active = false;
    this.focusReleased = false;
    this.game = null;
    this.state = null;
    this.sessionContext = null;
    this.keys = new Set();
    this.frameRequest = null;
    this.lastFrameAt = 0;
    this.lastScores = new Map();
    this.preloadedEmulatorId = null;
    this.preloadedEmulatorStarted = false;
    this.qteTitleArtwork = loadArtwork("/arcade/qte2/title.png");
    this.qteLifeArtwork = loadArtwork("/arcade/qte2/life.png");
    this.boundFrame = (time) => this.frame(time);
    this.boundKeyDown = (event) => this.keyDown(event);
    this.boundKeyUp = (event) => this.keyUp(event);
    this.boundPointer = (event) => this.pointer(event);
    this.boundMessage = (event) => this.message(event);
    closeButton.addEventListener("click", () => this.close());
    canvas.addEventListener("pointerdown", this.boundPointer);
    window.addEventListener("message", this.boundMessage);
  }

  start(gameId, sessionContext = null) {
    const game = ARCADE_GAMES[gameId];
    if (!game) return false;
    // Cabinet clicks can reach the interaction mesh while its iframe is
    // already active. Reusing that session avoids tearing down EmulatorJS's
    // mounted save filesystem and starting the same ROM again.
    if (canReuseActiveEmulator(this.active, this.game, game)) {
      this.sessionContext = sessionContext ?? this.sessionContext;
      return true;
    }
    this.close();
    this.overlay.classList.remove(
      "arcade-preloading",
      "cabinet-mode",
      "cabinet-transitioning",
      "physical-mode",
    );
    this.active = true;
    this.focusReleased = false;
    this.game = game;
    this.sessionContext = sessionContext;
    this.titleElement.textContent = game.title;
    this.instructionsElement.textContent = game.instructions;
    this.overlay.hidden = false;
    this.overlay.setAttribute("aria-hidden", "false");
    this.keys.clear();
    this.onActiveChange(true, game, sessionContext);
    this.onControlsChange(game);
    window.addEventListener("keydown", this.boundKeyDown, true);
    window.addEventListener("keyup", this.boundKeyUp, true);
    if (game.mode === "emulator") {
      this.startEmulator(gameId);
      return true;
    }
    if (game.mode === "physical") {
      if (!this.startPhysical(sessionContext)) return false;
      return true;
    }
    this.state = this.createState(gameId, sessionContext);
    this.canvas.hidden = false;
    if (this.emulatorFrame) this.emulatorFrame.hidden = true;
    this.scoreElement.hidden = false;
    this.highScoreElement.hidden = false;
    this.lastFrameAt = performance.now();
    this.resize();
    this.updateHud();
    this.frameRequest = this.requestFrame(this.boundFrame);
    return true;
  }

  startPhysical(sessionContext) {
    const isDarts = this.game?.physicalKind === "darts";
    const runtime = isDarts ? this.dartsRuntime : this.paddleRuntime;
    if (!runtime?.ready) {
      this.close();
      return false;
    }
    this.overlay.classList.add("physical-mode");
    this.canvas.hidden = true;
    if (this.emulatorFrame) this.emulatorFrame.hidden = true;
    this.scoreElement.hidden = true;
    this.highScoreElement.hidden = true;
    if (isDarts) {
      this.state = this.createState("darts", sessionContext);
      if (!runtime.start(sessionContext?.interaction, this.state)) {
        this.close();
        return false;
      }
    } else {
      this.state = runtime.start();
    }
    this.lastFrameAt = performance.now();
    this.updateHud();
    this.frameRequest = this.requestFrame(this.boundFrame);
    return true;
  }

  startEmulator(gameId) {
    this.state = null;
    this.canvas.hidden = true;
    this.scoreElement.hidden = true;
    this.highScoreElement.hidden = true;
    this.statusElement.textContent = "Loading original arcade hardware…";
    if (!this.emulatorFrame) {
      this.statusElement.textContent = "Arcade emulator is unavailable.";
      return;
    }
    this.emulatorFrame.hidden = false;
    this.emulatorFrame.title = `${this.game.title} arcade emulator`;
    this.preloadEmulator(gameId);
    this.emulatorFrame.hidden = false;
  }

  preloadEmulator(gameId) {
    const game = ARCADE_GAMES[gameId];
    if (
      game?.mode !== "emulator"
      || !this.emulatorFrame
      || this.preloadedEmulatorId === gameId
    ) return false;
    const parameters = new URLSearchParams({ game: gameId });
    this.overlay.classList.add("arcade-preloading");
    this.overlay.hidden = false;
    this.overlay.setAttribute("aria-hidden", "true");
    this.emulatorFrame.hidden = false;
    this.emulatorFrame.title = `${game.title} arcade emulator`;
    this.preloadedEmulatorId = gameId;
    this.preloadedEmulatorStarted = false;
    this.emulatorFrame.src = `/arcade/emulator.html?${parameters}`;
    return true;
  }

  stopPreloadedEmulator() {
    if (!this.emulatorFrame) return;
    this.emulatorFrame.src = "about:blank";
    this.emulatorFrame.hidden = true;
    this.preloadedEmulatorId = null;
    this.preloadedEmulatorStarted = false;
    this.overlay.classList.remove(
      "arcade-preloading",
      "cabinet-mode",
      "cabinet-transitioning",
    );
    this.overlay.hidden = true;
    this.overlay.setAttribute("aria-hidden", "true");
  }

  sendEmulatorInput(code, pressed) {
    if (
      !this.active
      || this.game?.mode !== "emulator"
      || !this.emulatorFrame?.contentWindow
    ) return false;
    this.emulatorFrame.contentWindow.postMessage({
      source: "new-yokosuka",
      type: "arcade-input",
      code,
      pressed: Boolean(pressed),
    }, window.location.origin);
    return true;
  }

  close() {
    if (!this.active) return;
    if (this.game?.mode === "physical") {
      if (this.game.physicalKind === "darts") this.dartsRuntime?.stop();
      else this.paddleRuntime?.stop();
    }
    this.active = false;
    if (this.frameRequest !== null) this.cancelFrame(this.frameRequest);
    this.frameRequest = null;
    window.removeEventListener("keydown", this.boundKeyDown, true);
    window.removeEventListener("keyup", this.boundKeyUp, true);
    if (this.emulatorFrame) {
      this.emulatorFrame.src = "about:blank";
      this.emulatorFrame.hidden = true;
    }
    this.preloadedEmulatorId = null;
    this.preloadedEmulatorStarted = false;
    this.canvas.hidden = false;
    this.scoreElement.hidden = false;
    this.highScoreElement.hidden = false;
    this.overlay.classList.remove("arcade-preloading", "physical-mode");
    this.overlay.hidden = true;
    this.overlay.setAttribute("aria-hidden", "true");
    this.keys.clear();
    if (!this.focusReleased) {
      this.onControlsChange(null);
      this.onActiveChange(false, this.game, this.sessionContext);
    }
    this.focusReleased = false;
    this.sessionContext = null;
  }

  releaseFocus() {
    if (!this.active || this.focusReleased) return;
    this.focusReleased = true;
    window.removeEventListener("keydown", this.boundKeyDown, true);
    window.removeEventListener("keyup", this.boundKeyUp, true);
    this.keys.clear();
    this.onControlsChange(null);
    this.onActiveChange(false, this.game, this.sessionContext);
  }

  message(event) {
    if (
      event.source !== this.emulatorFrame?.contentWindow
      || event.origin !== window.location.origin
    ) return;
    const message = event.data;
    if (!message || message.source !== "new-yokosuka-arcade") return;
    if (message.type === "exit") {
      if (this.active && this.game?.mode === "emulator") this.close();
    } else if (message.type === "started") {
      this.preloadedEmulatorStarted = true;
      if (this.active) {
        this.statusElement.textContent = "Original arcade game running";
      }
    } else if (message.type === "error") {
      if (this.active) {
        this.statusElement.textContent = (
          message.message || "The game could not start."
        );
      }
    }
  }

  resize() {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const width = Math.max(480, Math.floor(this.canvas.clientWidth * ratio));
    const height = Math.max(320, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  createState(gameId, sessionContext = null) {
    const common = {
      score: 0,
      highScore: this.getHighScore(
        gameId,
        sessionContext,
        0,
      ),
      lastScore: this.lastScores.get(gameId) || 0,
      elapsed: 0,
      over: false,
      message: "",
    };
    if (gameId === "hangon") {
      return {
        ...common,
        timeLeft: 45,
        riderX: 0,
        speed: 0,
        distance: 0,
        nextCheckpoint: 260,
        checkpoint: 0,
        obstacles: [],
        spawnIn: 0.7,
      };
    }
    if (gameId === "harrier") {
      return {
        ...common,
        timeLeft: 60,
        playerX: 0.5,
        playerY: 0.78,
        lives: 3,
        enemies: [],
        shots: [],
        spawnIn: 0.5,
        shotCooldown: 0,
      };
    }
    if (gameId === "qte") {
      return {
        ...common,
        lives: 3,
        promptIndex: 0,
        prompt: qtePromptForIndex(0),
        difficultyIndex: 1,
        difficultyId: null,
        promptLeft: 1,
        promptDuration: 1,
        phase: "title",
        resultLeft: 0,
        resultPoints: null,
        frozenTimerFraction: 1,
      };
    }
    return {
      ...common,
      throwsLeft: 5,
      aimTime: 0,
      timeBonus: 10,
      lastThrow: null,
      throwCooldown: 0,
    };
  }

  keyDown(event) {
    if (!this.active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
      return;
    }
    if (this.game?.mode === "emulator") {
      const accepted = [
        "KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "KeyV",
        "KeyX", "Space", "Enter",
      ].includes(event.code);
      if (!accepted) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) this.sendEmulatorInput(event.code, true);
      this.keys.add(event.code);
      return;
    }
    const code = event.code;
    const accepted = [
      "ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft",
      "KeyW", "KeyA", "KeyS", "KeyD", "KeyB", "Space", "Enter",
    ].includes(code);
    if (!accepted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) this.press(code);
    this.keys.add(code);
  }

  keyUp(event) {
    if (!this.active) return;
    if (this.game?.mode === "emulator") {
      if (!this.keys.has(event.code)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.sendEmulatorInput(event.code, false);
    }
    this.keys.delete(event.code);
  }

  pointer(event) {
    if (!this.active) return;
    event.preventDefault();
    if (this.game.id === "harrier") {
      const bounds = this.canvas.getBoundingClientRect();
      this.state.playerX = clamp((event.clientX - bounds.left) / bounds.width, 0.06, 0.94);
      this.state.playerY = clamp((event.clientY - bounds.top) / bounds.height, 0.15, 0.9);
      this.fireHarrierShot();
    } else if (this.game.id === "darts") {
      this.throwDart();
    } else if (this.game.id === "qte") {
      if (this.state.phase === "title") {
        this.press("Enter");
      } else if (this.state.phase === "difficulty") {
        const bounds = this.canvas.getBoundingClientRect();
        const y = (event.clientY - bounds.top) / bounds.height;
        const selected = Math.round((y - 0.48) / 0.1);
        this.state.difficultyIndex = clamp(
          selected,
          0,
          QTE_DIFFICULTIES.length - 1,
        );
        this.press("Enter");
      } else {
        this.press(this.state.prompt);
      }
    }
  }

  press(code) {
    if (this.state.over) {
      if (code === "Space" || code === "Enter") {
        const context = this.sessionContext;
        this.start(this.game.id, context);
      }
      return;
    }
    if (this.game.mode === "physical") {
      if (this.game.physicalKind === "darts") {
        if (code === "Space" || code === "Enter") this.throwDart();
        return;
      }
      const paddleIndex = {
        KeyA: 0,
        KeyW: 1,
        KeyD: 2,
      }[code];
      if (paddleIndex !== undefined) this.paddleRuntime.press(paddleIndex);
      return;
    }
    if (this.game.id === "qte") {
      if (this.state.phase === "title") {
        if (code === "Space" || code === "Enter") {
          this.state.phase = "difficulty";
        }
        return;
      }
      if (this.state.phase === "difficulty") {
        const direction = (
          code === "ArrowDown" || code === "KeyS"
            ? 1
            : (code === "ArrowUp" || code === "KeyW" ? -1 : 0)
        );
        if (direction) {
          this.state.difficultyIndex = clamp(
            this.state.difficultyIndex + direction,
            0,
            QTE_DIFFICULTIES.length - 1,
          );
        } else if (code === "Space" || code === "Enter") {
          this.beginQte();
        }
        return;
      }
      if (this.state.phase !== "prompt") return;
      if (code === this.state.prompt) {
        const points = qteReactionScore(
          this.state.promptLeft,
          this.state.promptDuration,
        );
        this.state.score += points;
        this.state.phase = "result";
        this.state.resultLeft = 0.48;
        this.state.resultPoints = points;
        this.state.frozenTimerFraction = clamp(
          this.state.promptLeft / this.state.promptDuration,
          0,
          1,
        );
      } else if (code !== "Space" && code !== "Enter") {
        this.missQte();
      }
    } else if (this.game.id === "harrier" && (code === "Space" || code === "Enter")) {
      this.fireHarrierShot();
    } else if (this.game.id === "darts" && (code === "Space" || code === "Enter")) {
      this.throwDart();
    }
  }

  beginQte() {
    const difficulty = qteDifficulty(this.state.difficultyIndex);
    this.state.difficultyId = difficulty.id;
    this.state.promptIndex = 0;
    this.state.prompt = qtePromptForIndex(0);
    this.state.promptDuration = qtePromptDuration(
      this.state.difficultyIndex,
      0,
    );
    this.state.promptLeft = this.state.promptDuration;
    this.state.phase = "prompt";
    this.state.elapsed = 0;
  }

  advanceQte() {
    this.state.promptIndex++;
    this.state.prompt = qtePromptForIndex(
      this.state.promptIndex + Math.floor(this.state.score / 300),
    );
    this.state.promptDuration = qtePromptDuration(
      this.state.difficultyIndex,
      this.state.promptIndex,
    );
    this.state.promptLeft = this.state.promptDuration;
    this.state.phase = "prompt";
    this.state.resultLeft = 0;
    this.state.resultPoints = null;
    this.state.frozenTimerFraction = 1;
  }

  missQte() {
    this.state.lives--;
    if (this.state.lives <= 0) {
      this.finish("Game over");
    } else {
      this.state.phase = "result";
      this.state.resultLeft = 0.42;
      this.state.resultPoints = 0;
      this.state.frozenTimerFraction = 0;
    }
  }

  fireHarrierShot() {
    if (this.state.shotCooldown > 0 || this.state.over) return;
    this.state.shots.push({
      x: this.state.playerX,
      y: this.state.playerY - 0.045,
    });
    this.state.shotCooldown = 0.13;
  }

  throwDart() {
    if (
      this.state.over
      || this.state.throwsLeft <= 0
      || this.state.throwCooldown > 0
    ) return;
    const aimX = Math.sin(this.state.aimTime * 2.17) * 0.72;
    const aimY = Math.sin(this.state.aimTime * 2.83 + 0.8) * 0.72;
    const radius = Math.hypot(aimX, aimY);
    const points = dartScoreFromRadius(radius);
    const timeBonus = dartTimeBonusForThrow(points, this.state.timeBonus);
    this.state.score += points + timeBonus;
    this.state.throwsLeft--;
    this.state.lastThrow = {
      x: aimX,
      y: aimY,
      points,
      timeBonus,
    };
    this.state.throwCooldown = 0.55;
    this.dartsRuntime?.noteThrow(this.state.lastThrow);
    if (this.state.throwsLeft > 0) this.state.timeBonus = 10;
    if (this.state.throwsLeft === 0) {
      window.setTimeout(() => {
        if (this.active && this.game.id === "darts") {
          this.finish("Set complete");
        }
      }, 500);
    }
  }

  finish(message) {
    if (this.state.over) return;
    this.state.over = true;
    if (this.game?.physicalKind === "darts") {
      this.state.newHighScore = (
        this.state.score > (Number(this.state.startingHighScore) || 0)
      );
      this.state.endFlashElapsed = 0;
    }
    this.state.message = `${message} · Press Space to play again`;
    this.lastScores.set(
      this.game.id,
      this.game.decimalScores
        ? this.state.score
        : Math.floor(this.state.score),
    );
    this.state.lastScore = this.lastScores.get(this.game.id);
    const finishedState = this.state;
    const game = this.game;
    const sessionContext = this.sessionContext;
    Promise.resolve(this.submitScore(
      game.id,
      finishedState.score,
      sessionContext,
    )).then((result) => {
      const serverHighScore = Number(result?.score);
      if (!Number.isFinite(serverHighScore)) return;
      finishedState.highScore = serverHighScore;
      if (
        this.active
        && this.game?.id === game.id
        && this.sessionContext === sessionContext
      ) {
        this.state.highScore = serverHighScore;
        this.updateHud();
      }
    }).catch(() => {
      if (
        this.active
        && this.game?.id === game.id
        && this.sessionContext === sessionContext
      ) {
        this.statusElement.textContent = "Score could not be saved";
      }
    });
    this.updateHud();
    if (this.game?.physicalKind === "darts") this.releaseFocus();
  }

  frame(time) {
    if (!this.active) return;
    const elapsed = Math.max(0, (time - this.lastFrameAt) / 1000);
    const delta = this.game.mode === "physical"
      ? elapsed
      : clamp(elapsed, 0, 0.05);
    this.lastFrameAt = time;
    if (this.game.mode !== "physical") this.resize();
    if (!this.state.over || this.game.mode === "physical") this.update(delta);
    if (this.game.mode !== "physical") this.render();
    this.updateHud();
    if (
      this.game.mode === "physical"
      && this.game.physicalKind === "paddles"
      && this.state.over
      && this.paddleRuntime.endFlashComplete
    ) {
      this.close();
      return;
    }
    if (
      this.game.mode === "physical"
      && this.game.physicalKind === "darts"
      && this.state.over
      && this.state.endFlashElapsed >= 3
    ) {
      this.dartsRuntime?.resetLiveDisplays(this.state);
      this.state.score = 0;
      this.state.timeBonus = 10;
      this.close();
      return;
    }
    this.frameRequest = this.requestFrame(this.boundFrame);
  }

  update(delta) {
    if (this.game.mode === "physical") {
      if (this.game.physicalKind === "darts") {
        this.state.elapsed += delta;
        this.updateDarts(delta);
        this.dartsRuntime.update(this.state, delta);
      } else {
        this.state = this.paddleRuntime.update(delta);
      }
      return;
    }
    this.state.elapsed += delta;
    if (this.game.id === "hangon") this.updateHangOn(delta);
    else if (this.game.id === "harrier") this.updateHarrier(delta);
    else if (this.game.id === "qte") this.updateQte(delta);
    else this.updateDarts(delta);
  }

  updateHangOn(delta) {
    const accelerating = this.keys.has("KeyW") || this.keys.has("ArrowUp");
    const braking = this.keys.has("KeyS") || this.keys.has("ArrowDown");
    const steer = (
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0)
      - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0)
    );
    this.state.speed = clamp(
      this.state.speed + (accelerating ? 0.85 : -0.24) * delta
        - (braking ? 1.5 * delta : 0),
      0,
      1,
    );
    this.state.riderX = clamp(
      this.state.riderX + steer * delta * (0.85 + this.state.speed * 0.65),
      -1,
      1,
    );
    this.state.distance += this.state.speed * delta * 42;
    this.state.timeLeft -= delta;
    this.state.spawnIn -= delta;
    if (this.state.spawnIn <= 0) {
      this.state.obstacles.push({
        x: Math.sin(this.state.distance * 0.31) * 0.78,
        depth: 1,
      });
      this.state.spawnIn = 0.65 + (1 - this.state.speed) * 0.65;
    }
    for (const obstacle of this.state.obstacles) {
      obstacle.depth -= delta * (0.25 + this.state.speed * 0.9);
      if (
        obstacle.depth < 0.12
        && obstacle.depth > -0.03
        && Math.abs(obstacle.x - this.state.riderX) < 0.22
      ) {
        obstacle.depth = -1;
        this.state.speed *= 0.25;
        this.state.timeLeft = Math.max(0, this.state.timeLeft - 2);
      }
    }
    this.state.obstacles = this.state.obstacles.filter((obstacle) => obstacle.depth > -0.1);
    if (this.state.distance >= this.state.nextCheckpoint) {
      this.state.checkpoint++;
      this.state.nextCheckpoint += 260;
      this.state.timeLeft += 12;
      this.state.score += 1000;
      if (this.state.checkpoint >= 3) {
        this.state.score += Math.round(this.state.timeLeft * 100);
        this.finish("Course clear");
      }
    }
    this.state.score = Math.max(
      this.state.score,
      Math.floor(this.state.distance * 3),
    );
    if (this.state.timeLeft <= 0) this.finish("Time over");
  }

  updateHarrier(delta) {
    const horizontal = (
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0)
      - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0)
    );
    const vertical = (
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0)
      - (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0)
    );
    this.state.playerX = clamp(this.state.playerX + horizontal * delta * 0.75, 0.06, 0.94);
    this.state.playerY = clamp(this.state.playerY + vertical * delta * 0.75, 0.15, 0.9);
    this.state.timeLeft -= delta;
    this.state.spawnIn -= delta;
    this.state.shotCooldown = Math.max(0, this.state.shotCooldown - delta);
    if (this.keys.has("Space")) this.fireHarrierShot();
    if (this.state.spawnIn <= 0) {
      this.state.enemies.push({
        x: 0.08 + Math.random() * 0.84,
        y: -0.05,
        phase: Math.random() * Math.PI * 2,
      });
      this.state.spawnIn = Math.max(0.2, 0.62 - this.state.elapsed * 0.004);
    }
    for (const shot of this.state.shots) shot.y -= delta * 1.25;
    for (const enemy of this.state.enemies) {
      enemy.y += delta * (0.22 + this.state.elapsed * 0.0015);
      enemy.x += Math.sin(this.state.elapsed * 2.5 + enemy.phase) * delta * 0.08;
    }
    for (const shot of this.state.shots) {
      for (const enemy of this.state.enemies) {
        if (!enemy.hit && Math.hypot(shot.x - enemy.x, shot.y - enemy.y) < 0.055) {
          enemy.hit = true;
          shot.hit = true;
          this.state.score += 100;
        }
      }
    }
    for (const enemy of this.state.enemies) {
      if (
        !enemy.hit
        && !enemy.passed
        && enemy.y > this.state.playerY - 0.06
        && Math.abs(enemy.x - this.state.playerX) < 0.075
      ) {
        enemy.passed = true;
        this.state.lives--;
        if (this.state.lives <= 0) this.finish("Game over");
      }
    }
    this.state.shots = this.state.shots.filter((shot) => !shot.hit && shot.y > -0.1);
    this.state.enemies = this.state.enemies.filter((enemy) => !enemy.hit && enemy.y < 1.1);
    if (this.state.timeLeft <= 0) this.finish("Stage clear");
  }

  updateQte(delta) {
    if (
      this.state.phase === "title"
      || this.state.phase === "difficulty"
    ) return;
    if (this.state.phase === "result") {
      this.state.resultLeft -= delta;
      if (this.state.resultLeft <= 0) this.advanceQte();
      return;
    }
    this.state.promptLeft -= delta;
    if (this.state.promptLeft <= 0) this.missQte();
  }

  updateDarts(delta) {
    this.state.aimTime += delta;
    const cooldownBeforeUpdate = this.state.throwCooldown;
    this.state.throwCooldown = Math.max(0, this.state.throwCooldown - delta);
    const aimingDelta = Math.max(0, delta - cooldownBeforeUpdate);
    if (this.state.throwsLeft > 0) {
      this.state.timeBonus = Math.max(
        0,
        this.state.timeBonus - aimingDelta,
      );
    }
  }

  updateHud() {
    if (this.game.mode === "physical") {
      if (this.game.physicalKind === "darts") {
        this.statusElement.textContent = this.state.over
          ? this.state.message
          : (
            `Score ${Math.floor(this.state.score)}`
            + ` · Darts ${this.state.throwsLeft}`
          );
      } else {
        this.statusElement.textContent = this.state.over
          ? this.state.message
          : `Round ${this.state.round}`;
      }
      return;
    }
    this.scoreElement.textContent = `Score ${Math.floor(this.state.score)}`;
    this.highScoreElement.textContent = `Best ${Math.floor(this.state.highScore)}`;
    if (this.state.over) {
      this.statusElement.textContent = this.state.message;
    } else if (this.game.id === "hangon") {
      this.statusElement.textContent = (
        `Checkpoint ${this.state.checkpoint}/3 · ${Math.max(0, this.state.timeLeft).toFixed(1)}s`
      );
    } else if (this.game.id === "harrier") {
      this.statusElement.textContent = (
        `Lives ${this.state.lives} · ${Math.max(0, this.state.timeLeft).toFixed(1)}s`
      );
    } else if (this.game.id === "qte") {
      if (this.state.phase === "title") {
        this.statusElement.textContent = "Press Enter to start";
      } else if (this.state.phase === "difficulty") {
        this.statusElement.textContent = (
          "Choose difficulty · Enter to confirm"
        );
      } else {
        this.statusElement.textContent = (
          `${qteDifficulty(this.state.difficultyIndex).label}`
          + ` · Chances ${this.state.lives}`
        );
      }
    } else {
      this.statusElement.textContent = `Darts ${this.state.throwsLeft}`;
    }
  }

  render() {
    renderArcadeGame(this);
  }
}
