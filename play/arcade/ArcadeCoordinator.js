import { ArcadeScoreClient } from "../../src/ArcadeScoreClient.js";
import {
  DartsPhysicalRuntime,
  dartBoardIndexForInteraction,
} from "./DartsPhysicalRuntime.js";
import { PaddleReactionRuntime } from "./PaddleReactionRuntime.js";
import {
  setYouArcadeDartScoreVisibility,
  setYouArcadePaddleScoreVisibility,
  updateYouArcadeDartScores,
  updateYouArcadePaddleScores,
} from "./ArcadeFixtures.js";

export function arcadeMachineId(gameId, sessionContext = null) {
  if (gameId === "darts") {
    return `darts-${
      dartBoardIndexForInteraction(sessionContext?.interaction)
    }`;
  }
  if (gameId === "qte") return "qte-0";
  if (gameId === "paddles") return "qte-1";
  return null;
}

export class ArcadeCoordinator {
  constructor({
    accountSession,
    dom,
    getGames,
    scoreClient = new ArcadeScoreClient(),
    displays = {},
  }) {
    this.accountSession = accountSession;
    this.dom = dom;
    this.getGames = getGames;
    this.scoreClient = scoreClient;
    this.updateDartScores = displays.updateDartScores
      ?? updateYouArcadeDartScores;
    this.updatePaddleScores = displays.updatePaddleScores
      ?? updateYouArcadePaddleScores;
    this.dartsLastScores = [0, 0];
    this.dartsHighScores = [0, 0];
    this.paddleLastScore = 0;
    this.worldScoreLoad = null;

    this.paddleRuntime = new PaddleReactionRuntime({
      onScoreChanged: (score, state) => (
        this.syncPaddleScoreDisplays(score, state)
      ),
      onEndFlashChanged: displays.setPaddleScoreVisibility
        ?? setYouArcadePaddleScoreVisibility,
    });
    this.dartsRuntime = new DartsPhysicalRuntime({
      getScoreState: boardIndex => ({
        highScore: this.dartsHighScores[boardIndex],
        lastScore: this.dartsLastScores[boardIndex],
      }),
      onFlashChanged: displays.setDartScoreVisibility
        ?? setYouArcadeDartScoreVisibility,
      onStateChanged: (state, boardIndex) => {
        if (
          state.over
          && this.dartsLastScores[boardIndex] !== state.score
        ) {
          this.dartsLastScores[boardIndex] = state.score;
        }
        this.updateDartScores(boardIndex, {
          ...state,
          highScore: this.dartsHighScores[boardIndex],
          lastScore: this.dartsLastScores[boardIndex],
        });
      },
    });
  }

  bind(placedRoots) {
    this.paddleRuntime.bind(placedRoots);
    this.dartsRuntime.bind(placedRoots);
  }

  beginWorldLoad() {
    this.worldScoreLoad = this.scoreClient.refresh({ force: true });
    return this.worldScoreLoad;
  }

  async finishWorldLoad() {
    await this.worldScoreLoad;
    this.worldScoreLoad = null;
    this.applyServerScores();
  }

  applyServerScores() {
    for (let boardIndex = 0; boardIndex < 2; boardIndex += 1) {
      this.dartsHighScores[boardIndex] = this.scoreClient.highScore(
        `darts-${boardIndex}`,
        0,
      );
    }
  }

  syncPaddleScoreDisplays(score, paddleState = null) {
    const previousHighScore = this.scoreClient.highScore("qte-1", 0);
    const newHighScore = Boolean(
      paddleState?.over && score > previousHighScore,
    );
    if (paddleState?.over) {
      this.paddleLastScore = Math.min(
        99999,
        Math.max(0, Math.floor(score)),
      );
    }
    this.updatePaddleScores(
      score,
      previousHighScore,
      this.paddleLastScore,
    );
    return { newHighScore };
  }

  getHighScore(gameId, sessionContext) {
    const machineId = arcadeMachineId(gameId, sessionContext);
    return machineId ? this.scoreClient.highScore(machineId, 0) : 0;
  }

  async submitScore(gameId, score, sessionContext) {
    const machineId = arcadeMachineId(gameId, sessionContext);
    const submittedScore = gameId === "darts"
      ? Number(score.toFixed(4))
      : Math.floor(score);
    const result = await this.scoreClient.submit(
      machineId,
      submittedScore,
      this.accountSession.character?.id,
    );
    if (!result) return null;
    if (gameId === "darts") {
      const boardIndex = dartBoardIndexForInteraction(
        sessionContext?.interaction,
      );
      this.dartsHighScores[boardIndex] = Number(result.score);
      this.updateDartScores(boardIndex, {
        ...(this.getGames()?.game?.id === "darts" ? this.getGames().state : {}),
        highScore: this.dartsHighScores[boardIndex],
        lastScore: this.dartsLastScores[boardIndex],
      });
    } else if (gameId === "paddles") {
      this.updatePaddleScores(this.paddleRuntime.game.state.score, Number(result.score), this.paddleLastScore);
    }
    return result;
  }

  async refreshActiveGame(game, sessionContext) {
    const machineId = arcadeMachineId(game.id, sessionContext);
    if (!machineId) return;
    try {
      await this.scoreClient.refresh();
      this.applyServerScores();
      const games = this.getGames();
      if (
        !games?.active
        || games.game !== game
        || games.sessionContext !== sessionContext
      ) return;
      const highScore = this.scoreClient.highScore(machineId, 0);
      if (games.state) {
        games.state.highScore = highScore;
        if (game.physicalKind === "darts") {
          games.state.startingHighScore = highScore;
        }
      }
      games.updateHud();
    } catch {
      this.dom.arcadeStatus.textContent = "High scores could not be refreshed";
    }
  }

  async refreshLoadedHighScores({ force = false } = {}) {
    await this.scoreClient.refresh({ force });
    this.redrawLoadedHighScores();
  }

  applyLiveHighScore(event) {
    if (!this.scoreClient.applyHighScore(event?.machineId, event?.score)) {
      return;
    }
    this.applyServerScores();
    const games = this.getGames();
    if (event.machineId === "qte-1") {
      this.updatePaddleScores(
        this.paddleRuntime.game.state.score,
        event.score,
        this.paddleLastScore,
      );
    } else if (event.machineId.startsWith("darts-")) {
      const boardIndex = Number(event.machineId.slice(-1));
      const activeState = this.dartsRuntime.activeBinding?.index === boardIndex
        ? games?.state
        : null;
      this.updateDartScores(boardIndex, {
        ...(activeState || {}),
        score: activeState?.score || 0,
        highScore: event.score,
        lastScore: this.dartsLastScores[boardIndex],
        timeBonus: activeState?.timeBonus ?? 10,
      });
    }
    if (
      games?.active
      && arcadeMachineId(games.game?.id, games.sessionContext)
        === event.machineId
    ) {
      games.state.highScore = event.score;
      if (games.game.physicalKind === "darts") {
        games.state.startingHighScore = event.score;
      }
      games.updateHud();
    }
  }

  redrawLoadedHighScores() {
    this.applyServerScores();
    const games = this.getGames();
    for (let boardIndex = 0; boardIndex < 2; boardIndex += 1) {
      const activeState = this.dartsRuntime.activeBinding?.index === boardIndex
        ? games?.state
        : null;
      this.updateDartScores(boardIndex, {
        ...(activeState || {}),
        score: activeState?.score || 0,
        highScore: this.dartsHighScores[boardIndex],
        lastScore: this.dartsLastScores[boardIndex],
        timeBonus: activeState?.timeBonus ?? 10,
      });
    }
    this.updatePaddleScores(
      this.paddleRuntime.game.state.score,
      this.scoreClient.highScore("qte-1", 0),
      this.paddleLastScore,
    );
    const machineId = arcadeMachineId(
      games?.game?.id,
      games?.sessionContext,
    );
    if (games?.active && machineId && games.state) {
      const highScore = this.scoreClient.highScore(machineId, 0);
      games.state.highScore = highScore;
      if (games.game.physicalKind === "darts") {
        games.state.startingHighScore = highScore;
      }
      games.updateHud();
    }
  }
}
