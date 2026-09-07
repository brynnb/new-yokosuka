export class DebugPanel {
  constructor({
    dom,
    enabled,
    trianglePicker,
    collisionPicker,
    collisionDebugger,
    lightDebugger,
    onTimeOfDay,
    onServerTimeOfDay,
    onLiveClock,
    onRunSpeed,
    persistRunSpeed,
    onNpcWalkSpeed,
    persistNpcWalkSpeed,
    onDownloadPoolReflection,
    onPhysicsTuning,
    persistPhysicsTuning,
    scriptScenarios = [],
    onApplyScriptScenario = async () => {},
    onResetScriptScenario = async () => {},
    onCutscenePauseToggle = () => false,
    onCutsceneSkip = () => false,
  }) {
    this.dom = dom;
    this.enabled = enabled;
    this.trianglePicker = trianglePicker;
    this.collisionPicker = collisionPicker;
    this.collisionDebugger = collisionDebugger;
    this.lightDebugger = lightDebugger;
    this.onTimeOfDay = onTimeOfDay;
    this.onServerTimeOfDay = onServerTimeOfDay;
    this.onLiveClock = onLiveClock;
    this.onRunSpeed = onRunSpeed;
    this.persistRunSpeed = persistRunSpeed;
    this.onNpcWalkSpeed = onNpcWalkSpeed;
    this.persistNpcWalkSpeed = persistNpcWalkSpeed;
    this.onDownloadPoolReflection = onDownloadPoolReflection;
    this.onPhysicsTuning = onPhysicsTuning;
    this.persistPhysicsTuning = persistPhysicsTuning;
    this.scriptScenarios = scriptScenarios;
    this.onApplyScriptScenario = onApplyScriptScenario;
    this.onResetScriptScenario = onResetScriptScenario;
    this.onCutscenePauseToggle = onCutscenePauseToggle;
    this.onCutsceneSkip = onCutsceneSkip;
  }

  initialize(savedPhysics, savedRunSpeed = 1, savedNpcWalkSpeed = 1) {
    if (!this.enabled) return;
    this.dom.debugPanel.hidden = false;
    for (const scenario of this.scriptScenarios) {
      const option = document.createElement("option");
      option.value = scenario.id;
      option.textContent = scenario.label;
      this.dom.debugScriptScenario.append(option);
    }
    const runScenarioAction = async (action) => {
      const buttons = [
        this.dom.debugApplyScriptScenario,
        this.dom.debugResetScriptScenario,
      ];
      buttons.forEach(button => { button.disabled = true; });
      try {
        const message = await action();
        this.dom.debugScriptScenarioStatus.textContent = message;
      } catch (error) {
        this.dom.debugScriptScenarioStatus.textContent = (
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        this.dom.debugApplyScriptScenario.disabled = false;
        this.dom.debugResetScriptScenario.disabled = false;
      }
    };
    this.dom.debugApplyScriptScenario.addEventListener("click", () => {
      void runScenarioAction(() => this.onApplyScriptScenario(
        this.dom.debugScriptScenario.value,
      ));
    });
    this.dom.debugResetScriptScenario.addEventListener("click", () => {
      void runScenarioAction(() => this.onResetScriptScenario());
    });
    for (const [button, seconds] of [
      [this.dom.debugCutsceneBack60, -60],
      [this.dom.debugCutsceneBack15, -15],
      [this.dom.debugCutsceneBack, -5],
      [this.dom.debugCutsceneForward, 5],
      [this.dom.debugCutsceneForward15, 15],
      [this.dom.debugCutsceneForward60, 60],
    ]) {
      button.addEventListener("click", () => this.onCutsceneSkip(seconds));
    }
    this.dom.debugCutscenePause.addEventListener(
      "click",
      () => this.onCutscenePauseToggle(),
    );
    this.trianglePicker.updateButtons();
    this.collisionPicker.updateButtons();
    this.dom.trianglePicker.addEventListener("click", () => {
      this.trianglePicker.setActive(!this.trianglePicker.active);
    });
    this.dom.copyTriangleSelection.addEventListener(
      "click",
      () => this.trianglePicker.copySelection(),
    );
    this.dom.collisionPicker.addEventListener("click", () => {
      this.collisionPicker.setActive(!this.collisionPicker.active);
    });
    this.dom.copyCollisionSelection.addEventListener(
      "click",
      () => this.collisionPicker.copySelection(),
    );
    this.dom.downloadPoolReflection.addEventListener("click", async () => {
      const button = this.dom.downloadPoolReflection;
      button.disabled = true;
      button.textContent = "Rendering reflection…";
      try {
        const downloaded = await this.onDownloadPoolReflection?.();
        button.textContent = downloaded ? "Reflection downloaded" : "MJQ only";
      } catch (error) {
        console.error(error);
        button.textContent = "Download failed";
      } finally {
        window.setTimeout(() => {
          button.textContent = "Download pool reflection";
          button.disabled = false;
        }, 1800);
      }
    });
    this.dom.debugTimeOfDay.addEventListener(
      "input",
      () => this.onTimeOfDay(Number(this.dom.debugTimeOfDay.value)),
    );
    this.dom.debugTimeOfDay.addEventListener("change", async () => {
      const value = Number(this.dom.debugTimeOfDay.value);
      this.dom.debugTimeOfDay.disabled = true;
      this.dom.debugTimeOfDayValue.value = "Updating NPCs…";
      try {
        const updated = await this.onServerTimeOfDay(value);
        if (!updated) this.dom.debugTimeOfDayValue.value = "Update failed";
      } catch {
        this.dom.debugTimeOfDayValue.value = "Update failed";
      } finally {
        this.dom.debugTimeOfDay.disabled = false;
      }
    });
    this.dom.debugLiveClock.addEventListener("click", this.onLiveClock);
    this.dom.debugRunSpeed.value = String(savedRunSpeed);
    this.dom.debugRunSpeedValue.value = `${savedRunSpeed}×`;
    this.onRunSpeed(savedRunSpeed);
    this.dom.debugRunSpeed.addEventListener("input", () => {
      const value = Number(this.dom.debugRunSpeed.value);
      this.dom.debugRunSpeedValue.value = `${value}×`;
      this.onRunSpeed(value);
      this.persistRunSpeed(value);
    });
    const applyNpcWalkSpeed = (value, { persist = true } = {}) => {
      this.dom.debugNpcWalkSpeed.value = String(value);
      this.dom.debugNpcWalkSpeedValue.value = `${value.toFixed(2)}×`;
      this.onNpcWalkSpeed(value);
      if (persist) this.persistNpcWalkSpeed(value);
    };
    applyNpcWalkSpeed(savedNpcWalkSpeed, { persist: false });
    this.dom.debugNpcWalkSpeed.addEventListener("input", () => {
      applyNpcWalkSpeed(Number(this.dom.debugNpcWalkSpeed.value));
    });
    this.dom.debugNpcWalkSpeedReset.addEventListener("click", (event) => {
      event.preventDefault();
      applyNpcWalkSpeed(1);
    });
    const controls = [
      ["centerOfMassHeight", this.dom.forkliftComHeight,
        this.dom.forkliftComHeightValue, (value) => `${value.toFixed(2)} m`],
      ["springRate", this.dom.forkliftSpringRate,
        this.dom.forkliftSpringRateValue, (value) => `${value}%`],
      ["shockDamping", this.dom.forkliftShockDamping,
        this.dom.forkliftShockDampingValue, (value) => `${value}%`],
      ["loadInfluence", this.dom.forkliftLoadInfluence,
        this.dom.forkliftLoadInfluenceValue, (value) => `${value}%`],
      ["tireGrip", this.dom.forkliftTireGrip,
        this.dom.forkliftTireGripValue, (value) => `${value}%`],
      ["brakeForce", this.dom.forkliftBrakeForce,
        this.dom.forkliftBrakeForceValue, (value) => `${value}%`],
      ["driveForce", this.dom.forkliftDriveForce,
        this.dom.forkliftDriveForceValue, (value) => `${value}%`],
      ["steeringResponse", this.dom.forkliftSteeringResponse,
        this.dom.forkliftSteeringResponseValue, (value) => `${value}%`],
      ["highSpeedSteering", this.dom.forkliftHighSpeedSteering,
        this.dom.forkliftHighSpeedSteeringValue, (value) => `${value}%`],
      ["rollStiffness", this.dom.forkliftRollStiffness,
        this.dom.forkliftRollStiffnessValue, (value) => `${value}%`],
    ];
    const applyPhysics = () => {
      this.onPhysicsTuning(Object.fromEntries(
        controls.map(([key, input]) => [key, Number(input.value)]),
      ));
    };
    for (const [key, input, output, format] of controls) {
      input.value = String(savedPhysics[key]);
      output.value = format(savedPhysics[key]);
      input.addEventListener("input", () => {
        output.value = format(Number(input.value));
        applyPhysics();
        this.persistPhysicsTuning();
      });
    }
    applyPhysics();
    this.dom.showCollisions.addEventListener("change", () => {
      if (
        !this.dom.showCollisions.checked
        && this.collisionPicker.active
      ) {
        this.collisionPicker.setActive(false);
      }
      this.dom.tintCollisions.disabled = !this.dom.showCollisions.checked;
      this.collisionDebugger.setVisible(this.dom.showCollisions.checked);
    });
    this.dom.showLights.addEventListener(
      "change",
      () => this.lightDebugger.setVisible(this.dom.showLights.checked),
    );
    for (const input of [
      this.dom.lightDebugIntensity,
      this.dom.lightDebugRange,
      this.dom.lightDebugAngle,
      this.dom.lightDebugExponent,
      this.dom.lightDebugPositionX,
      this.dom.lightDebugPositionY,
      this.dom.lightDebugPositionZ,
      this.dom.lightDebugDirectionX,
      this.dom.lightDebugDirectionY,
      this.dom.lightDebugDirectionZ,
    ]) {
      input.addEventListener(
        "input",
        () => this.lightDebugger.applySelected(),
      );
    }
    this.dom.copyLightDebug.addEventListener(
      "click",
      () => this.lightDebugger.copySelected(),
    );
    this.dom.tintCollisions.addEventListener("change", () => {
      this.collisionDebugger.applyTint(
        this.dom.showCollisions.checked && this.dom.tintCollisions.checked,
      );
    });
  }

  showNpc(identity) {
    if (!this.enabled || !identity) return;
    this.dom.debugNpcName.textContent = identity.name;
    this.dom.debugNpcId.textContent = identity.id;
    this.dom.debugNpcSelection.hidden = false;
  }

  updateCutsceneTransport(state) {
    if (!this.enabled) return;
    const active = Boolean(state?.active);
    this.dom.debugCutsceneTransport.hidden = !active;
    if (!active) return;
    const formatTime = (seconds) => {
      const tenths = Math.floor(Math.max(0, seconds) * 10 + 0.0001);
      const minutes = Math.floor(tenths / 600);
      const remainder = tenths % 600;
      return `${String(minutes).padStart(2, "0")}:${String(
        Math.floor(remainder / 10),
      ).padStart(2, "0")}.${remainder % 10}`;
    };
    this.dom.debugCutscenePosition.textContent = (
      `Track ${String(state.trackIndex).padStart(2, "0")} · `
      + `${formatTime(state.elapsedSeconds)} / ${formatTime(state.durationSeconds)}`
    );
    this.dom.debugCutscenePause.textContent = state.paused ? "Resume" : "Pause";
    this.dom.debugCutscenePause.setAttribute(
      "aria-pressed",
      state.paused ? "true" : "false",
    );
    for (const button of [
      this.dom.debugCutsceneBack60,
      this.dom.debugCutsceneBack15,
      this.dom.debugCutsceneBack,
      this.dom.debugCutscenePause,
      this.dom.debugCutsceneForward,
      this.dom.debugCutsceneForward15,
      this.dom.debugCutsceneForward60,
    ]) button.disabled = Boolean(state.seeking);
  }

  updateArcadePerformance(performance, screens) {
    if (!this.enabled) return;
    const active = Boolean(performance?.active);
    this.dom.debugArcadeMode.textContent = active
      ? performance.levelName
      : "Inactive";
    this.dom.debugArcadeFps.textContent = Number.isFinite(performance?.lastFps)
      ? performance.lastFps.toFixed(1)
      : "—";
    const videosEnabled = performance?.videosEnabled !== false;
    this.dom.debugArcadeVideos.textContent = videosEnabled
      ? "On"
      : "PAUSED (LOW FPS)";
    this.dom.debugArcadeVideos.classList.toggle(
      "debug-performance-disabled",
      !videosEnabled,
    );
    const lightsEnabled = performance?.lightsEnabled !== false;
    this.dom.debugArcadeLights.textContent = lightsEnabled
      ? "On"
      : "OFF (LOW FPS)";
    this.dom.debugArcadeLights.classList.toggle(
      "debug-performance-disabled",
      !lightsEnabled,
    );
    this.dom.debugArcadeScreens.textContent = [
      `${screens?.readyVideoCount || 0}/${screens?.videoCount || 0} ready`,
      `${screens?.playingVideoCount || 0} playing`,
      `${screens?.blockedVideoCount || 0} blocked`,
    ].join(" · ");
    this.dom.debugArcadeReason.textContent = performance?.lastReason || "—";
  }
}
