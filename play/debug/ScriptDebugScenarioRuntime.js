export class ScriptDebugScenarioRuntime {
  constructor({
    scenarios,
    scenarioById,
    worlds,
    worldRuntime,
    getController,
    actorRoot,
    dialoguePersistence,
    scriptEventController,
    nativeScriptedEvents,
    selectWorld,
    enabled,
  }) {
    Object.assign(this, {
      scenarios,
      scenarioById,
      worlds,
      worldRuntime,
      getController,
      actorRoot,
      dialoguePersistence,
      scriptEventController,
      nativeScriptedEvents,
      selectWorld,
      enabled,
    });
    this.session = null;
  }

  get definitions() {
    return this.scenarios;
  }

  get idle() {
    return this.scriptEventController?.status === "idle"
      && this.nativeScriptedEvents.status === "idle";
  }

  async apply(scenarioId) {
    if (!this.enabled) throw new Error("Script scenarios are local-debug only.");
    const scenario = this.scenarioById(scenarioId);
    if (!scenario) throw new Error("Select a valid script scenario.");
    if (!this.idle) throw new Error("Finish or cancel the current script first.");
    const world = this.worlds[scenario.worldId];
    if (!world) {
      throw new Error(`Scenario world is unavailable: ${scenario.worldId}`);
    }
    const controller = this.getController();
    if (!this.session) {
      this.session = {
        world,
        originalWorld: this.worldRuntime.activeWorld,
        originalPosition: controller
          ? controller.collider.position.asArray()
          : null,
        originalYaw: this.actorRoot.rotation.y,
      };
    } else {
      this.dialoguePersistence.endSandbox();
    }
    this.dialoguePersistence.beginSandbox();
    const dialogueState = this.dialoguePersistence
      .gameplayState()?.dialogueState;
    if (!dialogueState) {
      this.dialoguePersistence.endSandbox();
      this.session = null;
      throw new Error("Player script state has not loaded yet.");
    }
    for (const write of scenario.nativeDialogueWrites) {
      dialogueState.write(write.bank, write.index, write.value);
    }
    const loaded = await this.selectWorld(world, {
      debugSpawn: scenario.spawn,
      persistLocation: false,
    });
    if (!loaded) {
      this.dialoguePersistence.endSandbox();
      this.session = null;
      throw new Error(`Could not load ${world.label}.`);
    }
    this.session.world = world;
    console.info("[Script scenario applied]", {
      id: scenario.id,
      script: scenario.script,
      world: world.nativeArea,
      spawn: scenario.spawn,
    });
    return `${scenario.label} applied. Interact with ${scenario.script.objectTag}.`;
  }

  async reset() {
    const session = this.session;
    if (!session) return "No script scenario is active.";
    if (!this.idle) throw new Error("Finish or cancel the current script first.");
    this.dialoguePersistence.endSandbox();
    this.session = null;
    if (session.originalPosition) {
      await this.selectWorld(session.originalWorld, {
        debugSpawn: {
          position: session.originalPosition,
          yaw: session.originalYaw,
        },
        persistLocation: false,
      });
    }
    return "Original location and script state restored.";
  }
}
