import { runtimeAssetUrl } from "../../src/RuntimeAssets.js";
import {
  MARTIAL_ARTS_FOLLOWUP_STAGES,
  MARTIAL_ARTS_MOVES,
  MARTIAL_ARTS_STRINGS,
  formatCombatCommand,
} from "../../src/MartialArtsCombat.js";
import {
  combatCommandGroups,
  maximumCombatCommandGroupCount,
  trimCombatCommandGroups,
} from "./CombatCommandDisplay.js";
import { bindCombatMoveWheel } from "./CombatMoveScroll.js";
const combatDragonUrl = runtimeAssetUrl("play/assets/combat/energy/bgdragon.png");
const combatGreenBeadUrl = runtimeAssetUrl("play/assets/combat/energy/tama12_G.png");
const combatEmptyBeadUrl = runtimeAssetUrl("play/assets/combat/energy/tama12_K.png");
const combatRedBeadUrl = runtimeAssetUrl("play/assets/combat/energy/tama12_R.png");
const combatYellowBeadUrl = runtimeAssetUrl("play/assets/combat/energy/tama12_Y.png");

const HEALTH_BEAD_COUNT = 20;
const MAX_VISIBLE_INPUTS = maximumCombatCommandGroupCount([
  ...Object.values(MARTIAL_ARTS_MOVES).map(
    move => move.displayInput || move.input,
  ),
  ...MARTIAL_ARTS_STRINGS.map(string => string.input),
  ...Object.values(MARTIAL_ARTS_FOLLOWUP_STAGES).map(stage => stage.input),
]);

export class CombatHud {
  constructor({ dom, getController, getEncounter }) {
    this.dom = dom;
    this.getController = getController;
    this.getEncounter = getEncounter;
  }

  initialize() {
    this.populateHealthGauge(this.dom.combatPlayerGauge);
    this.populateHealthGauge(this.dom.combatEnemyGauge);
    this.populateMoveList();
    bindCombatMoveWheel(this.dom.combatMoveList);
  }

  renderCommands(target, commands) {
    target.replaceChildren();
    commands.forEach((input, commandIndex) => {
      if (commandIndex > 0) {
        const arrow = document.createElement("span");
        arrow.className = "combat-command-arrow";
        arrow.textContent = "\u2192";
        target.append(arrow);
      }
      for (const group of combatCommandGroups(input)) {
        const keycap = document.createElement("span");
        keycap.className = "combat-keycap";
        keycap.textContent = formatCombatCommand(group);
        target.append(keycap);
      }
    });
    target.setAttribute(
      "aria-label",
      commands.length > 0
        ? commands.map(formatCombatCommand).join(" then ")
        : "No command entered",
    );
  }

  populateHealthGauge(gauge) {
    if (!gauge) return;
    const sigil = gauge.querySelector(".combat-health-sigil");
    const beads = gauge.querySelector(".combat-health-beads");
    sigil.src = combatDragonUrl;
    beads.replaceChildren();
    for (let index = 0; index < HEALTH_BEAD_COUNT; index += 1) {
      const bead = document.createElement("img");
      const angle = -Math.PI / 2 + (index / HEALTH_BEAD_COUNT) * Math.PI * 2;
      bead.className = "combat-health-bead";
      bead.alt = "";
      bead.draggable = false;
      bead.style.setProperty("--bead-x", `${48 + Math.cos(angle) * 39}px`);
      bead.style.setProperty("--bead-y", `${48 + Math.sin(angle) * 39}px`);
      beads.append(bead);
    }
  }

  updateHealthGauge(gauge, health, maximumHealth, healthyBeadUrl) {
    if (!gauge) return;
    const safeMaximum = Math.max(1, maximumHealth);
    const orbHealth = (
      Math.max(0, Math.min(safeMaximum, health)) / safeMaximum
    ) * HEALTH_BEAD_COUNT;
    const fullOrbs = Math.floor(orbHealth + 1e-6);
    const hasPartialOrb = orbHealth - fullOrbs > 1e-6;
    for (const [index, bead] of [
      ...gauge.querySelectorAll(".combat-health-bead"),
    ].entries()) {
      bead.src = index < fullOrbs
        ? healthyBeadUrl
        : index === fullOrbs && hasPartialOrb
          ? combatYellowBeadUrl
          : combatEmptyBeadUrl;
    }
    gauge.setAttribute("aria-valuemin", "0");
    gauge.setAttribute("aria-valuemax", String(maximumHealth));
    gauge.setAttribute("aria-valuenow", String(health));
    gauge.title = `${gauge.textContent.trim()} ${health} / ${maximumHealth}`;
  }

  update(snapshot) {
    const { dom } = this;
    if (!dom.combatHud) return;
    const controlsActive = Boolean(snapshot.active && snapshot.controlsActive);
    dom.app.classList.toggle("combat-controls-active", controlsActive);
    dom.combatHud.hidden = !controlsActive;
    dom.combatPlayerGauge.hidden = !controlsActive;
    dom.combatEnemyGauge.hidden = !controlsActive;
    if (dom.combatModeControlLabel) {
      dom.combatModeControlLabel.textContent = "Toggle Combat";
    }
    const controller = this.getController();
    if (controller) {
      controller.options.inputContext = controlsActive
        ? "combat"
        : "exploration";
      controller.keys.clear();
      controller.options.runEnabled = true;
      controller.options.toggleRun = !controlsActive;
      controller.options.toggleAutoRunKey = controlsActive ? null : "KeyQ";
      if (controlsActive) controller.autoRun = false;
    }
    for (const button of dom.combatMoveList?.querySelectorAll(
      "button[data-position-condition]",
    ) || []) {
      const available = (
        button.dataset.positionCondition === snapshot.playerOpponentPosition
      );
      button.classList.toggle("position-unavailable", !available);
      button.setAttribute("aria-disabled", String(!available));
    }
    this.updateHealthGauge(
      dom.combatPlayerGauge,
      snapshot.playerHealth,
      snapshot.playerMaxHealth,
      combatGreenBeadUrl,
    );
    this.updateHealthGauge(
      dom.combatEnemyGauge,
      snapshot.enemyHealth,
      snapshot.enemyMaxHealth,
      combatRedBeadUrl,
    );
    if (!dom.combatCommandFeedback) return;
    const inputTokens = trimCombatCommandGroups(
      snapshot.playerInputTokens || [],
      MAX_VISIBLE_INPUTS,
    );
    this.renderCommands(
      dom.combatCommandKeys,
      inputTokens.length > 0 ? [inputTokens] : [],
    );
    dom.combatCommandMove.textContent = snapshot.playerResolvedMoveLabel || "";
    const commandMissed = Boolean(snapshot.playerCommandMissed);
    const commandConnected = Boolean(snapshot.playerCommandConnected);
    if (dom.combatCommandResult) {
      dom.combatCommandResult.textContent = commandMissed
        ? "MISSED"
        : commandConnected && Number.isFinite(snapshot.playerCommandDamage)
          ? `${snapshot.playerCommandDamage} DAMAGE`
          : "";
    }
    dom.combatCommandFeedback.classList.toggle(
      "locked",
      Boolean(snapshot.playerCommandLocked)
        && !commandConnected
        && !commandMissed,
    );
    dom.combatCommandFeedback.classList.toggle("connected", commandConnected);
    dom.combatCommandFeedback.classList.toggle("missed", commandMissed);
    dom.combatCommandFeedback.hidden = !controlsActive;
  }

  populateMoveList() {
    const { dom } = this;
    if (!dom.combatMoveList) return;
    dom.combatMoveList.replaceChildren();
    if (dom.combatMoveCount) dom.combatMoveCount.textContent = "Moves List";
    const commandWithFollowups = (move) => {
      const commands = [move.displayInput];
      let parentMoveId = move.id;
      const visited = new Set();
      while (!visited.has(parentMoveId)) {
        visited.add(parentMoveId);
        const stage = Object.values(MARTIAL_ARTS_FOLLOWUP_STAGES).find(
          candidate => candidate.parentMoveId === parentMoveId,
        );
        if (!stage) break;
        if (stage.input.length > 0) commands.push(stage.input);
        parentMoveId = stage.id;
      }
      return commands;
    };
    for (const category of ["hand", "leg", "throw"]) {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = `${category} moves`;
      const list = document.createElement("ol");
      for (const move of Object.values(MARTIAL_ARTS_MOVES)) {
        if (move.category !== category) continue;
        const item = document.createElement("li");
        const label = document.createElement("button");
        const command = document.createElement("code");
        label.type = "button";
        label.textContent = move.label;
        label.title = `Perform ${move.label}`;
        if (move.positionCondition) {
          label.dataset.positionCondition = move.positionCondition;
        }
        label.onclick = () => this.getEncounter()?.performPlayerMove(move.id);
        this.renderCommands(command, commandWithFollowups(move));
        item.append(label, command);
        list.append(item);
      }
      section.append(heading, list);
      dom.combatMoveList.append(section);
    }
    const stringsSection = document.createElement("section");
    const stringsHeading = document.createElement("h3");
    const stringsList = document.createElement("ol");
    stringsHeading.textContent = "Combo strings";
    for (const string of MARTIAL_ARTS_STRINGS) {
      const item = document.createElement("li");
      const label = document.createElement("button");
      const command = document.createElement("code");
      label.type = "button";
      label.textContent = string.label;
      label.title = `Perform ${string.label}`;
      label.onclick = () => this.getEncounter()?.performPlayerString(string.id);
      this.renderCommands(command, [string.input]);
      item.append(label, command);
      stringsList.append(item);
    }
    stringsSection.append(stringsHeading, stringsList);
    dom.combatMoveList.append(stringsSection);
  }
}
