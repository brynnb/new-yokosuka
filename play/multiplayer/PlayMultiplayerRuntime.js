import { MultiplayerSession } from "./MultiplayerSession.js";

export class PlayMultiplayerRuntime {
  constructor({
    getSessionOptions,
    getCallbacks,
    canPublishPresence,
    getPlayerPresence,
    getVehiclePresence,
    onSessionReplaced,
    createSession = options => new MultiplayerSession(options),
  }) {
    this.getSessionOptions = getSessionOptions;
    this.getCallbacks = getCallbacks;
    this.canPublishPresence = canPublishPresence;
    this.getPlayerPresence = getPlayerPresence;
    this.getVehiclePresence = getVehiclePresence;
    this.onSessionReplaced = onSessionReplaced;
    this.createSession = createSession;
    this.session = null;
    this.forcePresence = false;
    this.sessionReplaced = false;
  }

  get client() { return this.session?.client ?? null; }
  get remotePlayers() { return this.session?.remotePlayers ?? null; }
  get chat() { return this.session?.chat ?? null; }

  initialize() {
    if (this.session) return this.session;
    const callbacks = this.getCallbacks();
    this.session = this.createSession({
      ...this.getSessionOptions(),
      callbacks: {
        ...callbacks,
        onSessionReplaced: message => this.replaceSession(message),
      },
    });
    this.publishPresence();
    this.session.connect();
    return this.session;
  }

  replaceSession(message) {
    if (this.sessionReplaced) return false;
    this.sessionReplaced = true;
    this.onSessionReplaced(message);
    return true;
  }

  markPresenceDirty() {
    this.forcePresence = true;
  }

  publishPresence(force = false) {
    if (!this.client || !this.canPublishPresence()) return false;
    const player = this.getPlayerPresence();
    const vehicle = this.getVehiclePresence();
    const position = vehicle?.position ?? player.position;
    const sent = this.client.setLocalPresence({
      worldId: player.worldId,
      avatarId: player.avatarId,
      x: position.x,
      y: position.y,
      z: position.z,
      yaw: player.yaw,
      movement: player.movement,
      animationId: player.animationId,
      animationRevision: player.animationRevision,
      vehicleId: vehicle?.id ?? null,
      vehicleLift: vehicle?.lift ?? 0,
      vehicleSteering: vehicle?.steering ?? 0,
      vehicleWheelRoll: vehicle?.wheelRoll ?? 0,
      vehicleQx: vehicle?.orientation.x ?? 0,
      vehicleQy: vehicle?.orientation.y ?? 0,
      vehicleQz: vehicle?.orientation.z ?? 0,
      vehicleQw: vehicle?.orientation.w ?? 1,
    }, {
      force: force || this.forcePresence,
    });
    this.forcePresence = false;
    return sent;
  }

  leaveWorld() { this.client?.leaveWorld(); }
  close() { this.client?.close(); }
  dispose() {
    this.close();
    this.chat?.dispose();
    this.remotePlayers?.dispose();
  }
}
