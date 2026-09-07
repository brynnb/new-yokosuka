import {
  createScriptEventPresentationCatalog,
} from "./ScriptEventPresentationCatalog.js";

function requireStringArgument(arguments_, index, command) {
  const argument = arguments_?.[index];
  if (
    argument?.type !== "string"
    || argument.isStatic !== true
    || typeof argument.value !== "string"
    || !argument.value
  ) {
    throw new Error(`${command} requires a static string argument`);
  }
  return argument.value;
}

export class ScriptEventPresentationRuntime {
  constructor({
    catalog = createScriptEventPresentationCatalog(),
    adapters,
  } = {}) {
    const required = [
      "begin", "startCamera", "stopCamera", "playPlayerMotion",
      "lookAtActor", "clearActorLook", "playSequence", "startActivity", "commit",
      "rollback", "update",
    ];
    if (required.some(name => typeof adapters?.[name] !== "function")) {
      throw new TypeError("script presentation runtime requires complete adapters");
    }
    this.catalog = catalog;
    this.adapters = adapters;
    this.transaction = null;
  }

  begin(context) {
    if (this.transaction) {
      throw new Error("a script presentation transaction is already active");
    }
    this.transaction = this.adapters.begin(context);
    return true;
  }

  async execute(event) {
    if (!this.transaction) {
      throw new Error("script presentation transaction is not active");
    }
    const args = event?.arguments || [];
    switch (event?.name) {
    case "start_camera": {
      const id = requireStringArgument(args, 0, event.name);
      const camera = this.catalog.camera(id);
      if (!camera) throw new Error(`unknown authored camera ${id}`);
      return this.requireAccepted(
        await this.adapters.startCamera(camera, this.transaction),
        `camera ${id}`,
      );
    }
    case "stop_camera":
      return this.requireAccepted(
        await this.adapters.stopCamera(this.transaction),
        "camera cleanup",
      );
    case "play_player_motion": {
      const id = requireStringArgument(args, 0, event.name);
      const motion = this.catalog.playerMotion(id);
      if (!motion) throw new Error(`unknown authored player motion ${id}`);
      return this.requireAccepted(
        await this.adapters.playPlayerMotion(motion, this.transaction),
        `player motion ${id}`,
      );
    }
    case "look_at_actor":
      return this.requireAccepted(await this.adapters.lookAtActor({
        actorCode: requireStringArgument(args, 0, event.name),
        targetActorCode: requireStringArgument(args, 1, event.name),
      }, this.transaction), "actor look target");
    case "clear_actor_look":
      return this.requireAccepted(await this.adapters.clearActorLook({
        actorCode: requireStringArgument(args, 0, event.name),
      }, this.transaction), "actor look cleanup");
    case "play_sequence": {
      const id = requireStringArgument(args, 0, event.name);
      const sequence = this.catalog.sequence(id);
      if (!sequence) throw new Error(`unknown authored sequence ${id}`);
      if (sequence.executable !== true) {
        throw new Error(
          `authored sequence ${id} has unresolved native presentation steps`,
        );
      }
      return this.requireAccepted(
        await this.adapters.playSequence(sequence, this.transaction),
        `sequence ${id}`,
      );
    }
    case "start_activity": {
      const id = requireStringArgument(args, 0, event.name);
      const activity = this.catalog.activity(id);
      if (!activity) throw new Error(`unknown specialized activity ${id}`);
      return this.requireAccepted(
        await this.adapters.startActivity(activity, this.transaction),
        `activity ${id}`,
      );
    }
    default:
      throw new Error(`unsupported presentation command ${event?.name}`);
    }
  }

  update(deltaSeconds) {
    if (!this.transaction) return false;
    return this.adapters.update(this.transaction, deltaSeconds);
  }

  commit() {
    if (!this.transaction) return false;
    const transaction = this.transaction;
    const result = this.adapters.commit(transaction);
    this.transaction = null;
    return result;
  }

  rollback(reason = "cancelled") {
    if (!this.transaction) return false;
    const transaction = this.transaction;
    try {
      return this.adapters.rollback(transaction, reason);
    } finally {
      this.transaction = null;
    }
  }

  requireAccepted(value, label) {
    if (value !== true) throw new Error(`${label} was rejected by its adapter`);
    return true;
  }
}

export function createScriptEventPresentationRuntime(options) {
  return new ScriptEventPresentationRuntime(options);
}
