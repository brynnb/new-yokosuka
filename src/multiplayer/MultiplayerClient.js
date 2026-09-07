import { validForkliftId } from "../VehicleSpawns.js";

export const MULTIPLAYER_PROTOCOL_VERSION = 8;
export const MULTIPLAYER_SEND_INTERVAL_MS = 100;
export const MULTIPLAYER_FORCE_INTERVAL_MS = 2000;

const POSITION_EPSILON_SQUARED = 0.0004;
const YAW_EPSILON = 0.02;
const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 8000;
const CARGO_ID_PATTERN = /^cargo-[a-z0-9-]{1,40}$/;
const VENDING_TIMEOUT_MS = 10_000;
const TRANSITION_TIMEOUT_MS = 10_000;
const CLIENT_FORKLIFT_SOUND_CUES = new Set(["horn", "flip_impact"]);

function normalizedQuaternion(values, fallbackYaw = 0) {
  if (values.every(Number.isFinite)) {
    const length = Math.hypot(...values);
    if (length >= 0.5 && length <= 1.5) {
      return values.map((value) => value / length);
    }
  }
  return [0, Math.sin(fallbackYaw / 2), 0, Math.cos(fallbackYaw / 2)];
}

export function multiplayerUrl(locationLike = window.location, override = "") {
  const configured = String(override || "").trim();
  if (configured) return configured;
  const protocol = locationLike.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${locationLike.host}/ws`;
}

export function multiplayerHttpUrl(webSocketUrl, path) {
  const url = new URL(
    webSocketUrl,
    globalThis.location?.href || "http://localhost/",
  );
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function normalizeLocalPresence(state) {
  if (!state?.worldId) return null;
  const values = [state.x, state.y, state.z, state.yaw];
  if (!values.every(Number.isFinite)) return null;
  const vehicleId = validForkliftId(state.vehicleId)
    ? state.vehicleId
    : null;
  const vehicleOrientation = vehicleId
    ? normalizedQuaternion([
      state.vehicleQx,
      state.vehicleQy,
      state.vehicleQz,
      state.vehicleQw,
    ], state.yaw)
    : [0, 0, 0, 1];
  return {
    worldId: String(state.worldId),
    avatarId: String(state.avatarId || state.characterId || "ryo"),
    x: state.x,
    y: state.y,
    z: state.z,
    yaw: state.yaw,
    movement: ["idle", "walk", "backpedal", "run", "turnLeft", "turnRight"].includes(state.movement)
      ? state.movement
      : "idle",
    animationId: state.animationId ? String(state.animationId) : null,
    animationRevision: Number.isSafeInteger(state.animationRevision)
      ? state.animationRevision
      : 0,
    vehicleId,
    vehicleLift: Number.isFinite(state.vehicleLift) ? state.vehicleLift : 0,
    vehicleSteering: Number.isFinite(state.vehicleSteering)
      ? state.vehicleSteering
      : 0,
    vehicleWheelRoll: Number.isFinite(state.vehicleWheelRoll)
      ? state.vehicleWheelRoll
      : 0,
    vehicleQx: vehicleOrientation[0],
    vehicleQy: vehicleOrientation[1],
    vehicleQz: vehicleOrientation[2],
    vehicleQw: vehicleOrientation[3],
  };
}

export function presenceChanged(current, previous) {
  if (!previous) return true;
  if (
    current.worldId !== previous.worldId
    || current.avatarId !== previous.avatarId
    || current.movement !== previous.movement
    || current.animationId !== previous.animationId
    || current.animationRevision !== previous.animationRevision
    || current.vehicleId !== previous.vehicleId
    || Math.abs(current.vehicleLift - previous.vehicleLift) >= 0.01
    || Math.abs(current.vehicleSteering - previous.vehicleSteering) >= 0.01
    || Math.abs(current.vehicleWheelRoll - previous.vehicleWheelRoll) >= 0.04
    || Math.abs(current.vehicleQx - previous.vehicleQx) >= 0.005
    || Math.abs(current.vehicleQy - previous.vehicleQy) >= 0.005
    || Math.abs(current.vehicleQz - previous.vehicleQz) >= 0.005
    || Math.abs(current.vehicleQw - previous.vehicleQw) >= 0.005
  ) {
    return true;
  }
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const dz = current.z - previous.z;
  return (
    dx * dx + dy * dy + dz * dz >= POSITION_EPSILON_SQUARED
    || Math.abs(current.yaw - previous.yaw) >= YAW_EPSILON
  );
}

export function priorityPresenceChanged(current, previous) {
  return Boolean(previous) && (
    current.worldId !== previous.worldId
    || current.avatarId !== previous.avatarId
    || current.movement !== previous.movement
    || current.animationId !== previous.animationId
    || current.animationRevision !== previous.animationRevision
    || current.vehicleId !== previous.vehicleId
  );
}

export class MultiplayerClient {
  constructor({
    url = multiplayerUrl(
      window.location,
      import.meta.env.VITE_MULTIPLAYER_URL,
    ),
    callbacks = {},
    WebSocketClass = window.WebSocket,
    now = () => performance.now(),
    random = Math.random,
    fetchImpl = (...args) => globalThis.fetch(...args),
    characterId = null,
  } = {}) {
    const connectionUrl = new URL(
      url,
      globalThis.location?.href || "http://localhost/",
    );
    if (characterId) {
      connectionUrl.searchParams.set("characterId", String(characterId));
    }
    this.url = connectionUrl.toString();
    this.callbacks = callbacks;
    this.WebSocketClass = WebSocketClass;
    this.now = now;
    this.random = random;
    this.fetchImpl = fetchImpl;
    this.socket = null;
    this.connected = false;
    this.welcomed = false;
    this.intentionalClose = false;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.identity = null;
    this.latestPresence = null;
    this.lastSentPresence = null;
    this.lastSentAt = -Infinity;
    this.sequence = 0;
    this.pendingVending = new Map();
    this.pendingTransitions = new Map();
    this.pendingTransitionCommits = new Map();
    this.sessionReplaced = false;
  }

  connect() {
    if (this.sessionReplaced) return;
    if (
      this.socket
      && (
        this.socket.readyState === this.WebSocketClass.OPEN
        || this.socket.readyState === this.WebSocketClass.CONNECTING
      )
    ) {
      return;
    }
    this.intentionalClose = false;
    this.setStatus("connecting");
    let socket;
    try {
      socket = new this.WebSocketClass(this.url);
    } catch {
      this.setStatus("offline");
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      this.connected = true;
      this.reconnectAttempt = 0;
      this.setStatus("connected");
    });
    socket.addEventListener("message", (event) => {
      if (socket !== this.socket) return;
      this.handleMessage(event.data);
    });
    socket.addEventListener("close", () => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.connected = false;
      this.welcomed = false;
      this.identity = null;
      this.lastSentPresence = null;
      this.rejectPendingVending(
        new Error("The multiplayer connection was lost."),
      );
      this.rejectPendingTransitions(
        new Error("The multiplayer connection was lost."),
      );
      this.callbacks.onReset?.();
      this.setStatus("offline");
      if (!this.intentionalClose) this.scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      if (socket === this.socket) socket.close();
    });
  }

  setLocalPresence(state, { force = false } = {}) {
    const normalized = normalizeLocalPresence(state);
    if (!normalized) return false;
    const previousLatest = this.latestPresence;
    this.latestPresence = normalized;
    if (!this.canSend()) return false;
    const now = this.now();
    const priority = priorityPresenceChanged(normalized, previousLatest)
      || priorityPresenceChanged(normalized, this.lastSentPresence);
    if (
      !force
      && !priority
      && now - this.lastSentAt < MULTIPLAYER_SEND_INTERVAL_MS
    ) {
      return false;
    }
    if (
      !force
      && !presenceChanged(normalized, this.lastSentPresence)
      && now - this.lastSentAt < MULTIPLAYER_FORCE_INTERVAL_MS
    ) {
      return false;
    }
    return this.sendPresence(now);
  }

  forcePresence() {
    if (!this.latestPresence || !this.canSend()) return false;
    return this.sendPresence(this.now());
  }

  leaveWorld() {
    this.latestPresence = null;
    this.lastSentPresence = null;
    if (!this.canSend()) return false;
    return this.send({ v: MULTIPLAYER_PROTOCOL_VERSION, type: "leave_world" });
  }

  requestTransition(transition, requestId = crypto.randomUUID()) {
    if (!this.canSend()) {
      return Promise.reject(
        new Error("This entrance requires a server connection."),
      );
    }
    const normalizedRequest = String(requestId || "").trim();
    const transitionId = String(
      transition?.id || transition?.transitionId || "",
    ).trim();
    const sourceWorldId = String(
      transition?.source?.worldId || transition?.sourceWorldId || "",
    ).trim();
    const destinationWorldId = String(
      transition?.destination?.worldId
      || transition?.destinationWorldId
      || "",
    ).trim();
    const doorSelector = Number(
      transition?.source?.doorSelector ?? transition?.doorSelector,
    );
    if (
      !normalizedRequest
      || !transitionId
      || !sourceWorldId
      || !destinationWorldId
      || !Number.isInteger(doorSelector)
    ) {
      return Promise.reject(new Error("Invalid entrance request."));
    }
    if (this.pendingTransitions.has(normalizedRequest)) {
      return this.pendingTransitions.get(normalizedRequest).promise;
    }
    const pending = this.createPendingTransition(
      this.pendingTransitions,
      normalizedRequest,
      "The entrance did not respond.",
    );
    const sent = this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "transition_request",
      requestId: normalizedRequest,
      transitionId,
      doorSelector,
      sourceWorldId,
      destinationWorldId,
    });
    if (!sent) {
      this.rejectPendingTransition(
        this.pendingTransitions,
        normalizedRequest,
        new Error("The entrance request could not be sent."),
      );
    }
    return pending.promise;
  }

  commitTransition(authorization) {
    if (!this.canSend()) {
      return Promise.reject(
        new Error("The multiplayer connection was lost before travel."),
      );
    }
    const requestId = String(authorization?.requestId || "").trim();
    const authorizationId = String(
      authorization?.authorizationId || "",
    ).trim();
    if (!requestId || !authorizationId) {
      return Promise.reject(new Error("Invalid entrance authorization."));
    }
    if (this.pendingTransitionCommits.has(requestId)) {
      return this.pendingTransitionCommits.get(requestId).promise;
    }
    const pending = this.createPendingTransition(
      this.pendingTransitionCommits,
      requestId,
      "Travel could not be committed.",
    );
    const sent = this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "transition_commit",
      requestId,
      authorizationId,
    });
    if (!sent) {
      this.rejectPendingTransition(
        this.pendingTransitionCommits,
        requestId,
        new Error("Travel could not be committed."),
      );
    }
    return pending.promise;
  }

  sendChat(text) {
    if (!this.canSend()) return false;
    const value = String(text || "").trim();
    if (!value) return false;
    return this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "chat",
      text: value,
    });
  }

  startScriptEvent(
    { kind, actor = "", object = "", activity = "" },
    requestId = crypto.randomUUID(),
  ) {
    if (!this.canSend()) return false;
    return this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "script_event_start",
      requestId: String(requestId),
      kind: String(kind || ""),
      actor: String(actor || ""),
      object: String(object || ""),
      activity: String(activity || ""),
    });
  }

  advanceScriptEvent(
    runId,
    action,
    { optionId = null, requestId = crypto.randomUUID() } = {},
  ) {
    if (!this.canSend() || !Number.isSafeInteger(runId) || runId <= 0) {
      return false;
    }
    return this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "script_event_advance",
      requestId: String(requestId),
      runId,
      action: String(action || ""),
      ...(optionId === null ? {} : { optionId }),
    });
  }

  sendClientDiagnostic(scope, payload, { runId = null } = {}) {
    if (!this.canSend() || !payload || typeof payload !== "object") {
      return false;
    }
    return this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "client_diagnostic",
      scope: String(scope || ""),
      ...(Number.isSafeInteger(runId) && runId > 0 ? { runId } : {}),
      payload,
    });
  }

  purchaseVending(machineId, drinkKey, requestId = crypto.randomUUID()) {
    if (!this.canSend()) {
      return Promise.reject(
        new Error("The vending machine requires a server connection."),
      );
    }
    const normalizedMachine = String(machineId || "").trim();
    const normalizedDrink = String(drinkKey || "").trim();
    const normalizedRequest = String(requestId || "").trim();
    if (!normalizedMachine || !normalizedDrink || !normalizedRequest) {
      return Promise.reject(new Error("Invalid vending selection."));
    }
    if (this.pendingVending.has(normalizedRequest)) {
      return this.pendingVending.get(normalizedRequest).promise;
    }
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const timer = globalThis.setTimeout(() => {
      const pending = this.pendingVending.get(normalizedRequest);
      if (!pending) return;
      this.pendingVending.delete(normalizedRequest);
      pending.reject(new Error("The vending machine did not respond."));
    }, VENDING_TIMEOUT_MS);
    this.pendingVending.set(normalizedRequest, {
      promise,
      resolve,
      reject,
      timer,
    });
    const sent = this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "vending_purchase",
      requestId: normalizedRequest,
      machineId: normalizedMachine,
      drinkKey: normalizedDrink,
    });
    if (!sent) {
      globalThis.clearTimeout(timer);
      this.pendingVending.delete(normalizedRequest);
      reject(new Error("The vending request could not be sent."));
    }
    return promise;
  }

  async saveDialogueState(snapshot) {
    const characterId = Number(this.identity?.characterId);
    if (!Number.isSafeInteger(characterId) || characterId <= 0) {
      throw new Error("Dialogue progress requires a saved character.");
    }
    const response = await this.fetchImpl(multiplayerHttpUrl(
      this.url,
      `/api/characters/${characterId}/dialogue`,
    ), {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      // Preserve a useful generic error when a proxy returns a non-JSON body.
    }
    if (!response.ok) {
      const error = new Error(body?.error || "Dialogue progress could not be saved.");
      error.status = response.status;
      error.dialogueState = body?.dialogueState || null;
      throw error;
    }
    return body;
  }

  sendForkliftUpdate(state, { release = false } = {}) {
    if (!this.canSend() || !validForkliftId(state?.id)) return false;
    const orientation = normalizedQuaternion([
      state.qx,
      state.qy,
      state.qz,
      state.qw,
    ], state.yaw);
    const numbers = [
      state.x,
      state.y,
      state.z,
      state.yaw,
      state.lift,
      state.steering,
      state.wheelRoll,
      Number(state.velocityX) || 0,
      Number(state.velocityY) || 0,
      Number(state.velocityZ) || 0,
      Number(state.angularVelocityX) || 0,
      Number(state.angularVelocityY) || 0,
      Number(state.angularVelocityZ) || 0,
      ...orientation,
    ];
    if (!numbers.every(Number.isFinite)) return false;
    return this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "forklift_update",
      id: state.id,
      x: state.x,
      y: state.y,
      z: state.z,
      yaw: state.yaw,
      lift: state.lift,
      steering: state.steering,
      wheelRoll: state.wheelRoll,
      velocityX: Number(state.velocityX) || 0,
      velocityY: Number(state.velocityY) || 0,
      velocityZ: Number(state.velocityZ) || 0,
      angularVelocityX: Number(state.angularVelocityX) || 0,
      angularVelocityY: Number(state.angularVelocityY) || 0,
      angularVelocityZ: Number(state.angularVelocityZ) || 0,
      qx: orientation[0],
      qy: orientation[1],
      qz: orientation[2],
      qw: orientation[3],
      release: Boolean(release),
      righting: Boolean(state.righting),
    });
  }

  sendForkliftSound(forkliftId, cue) {
    if (
      !this.canSend()
      || !validForkliftId(forkliftId)
      || !CLIENT_FORKLIFT_SOUND_CUES.has(cue)
    ) {
      return false;
    }
    return this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "forklift_sound",
      forkliftId,
      cue,
    });
  }

  spawnForklift({ x, y, z, yaw }) {
    if (
      !this.canSend()
      || ![x, y, z, yaw].every(Number.isFinite)
    ) {
      return false;
    }
    return this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "forklift_spawn",
      x,
      y,
      z,
      yaw,
    });
  }

  claimCargo(cargoId) {
    if (!this.canSend() || !CARGO_ID_PATTERN.test(cargoId)) return false;
    return this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "cargo_claim",
      cargoId,
    });
  }

  sendCargoUpdate(state, { touching = true } = {}) {
    if (!this.canSend() || !CARGO_ID_PATTERN.test(state?.id)) return false;
    const orientation = normalizedQuaternion([
      state.qx,
      state.qy,
      state.qz,
      state.qw,
    ]);
    const numbers = [
      state.x,
      state.y,
      state.z,
      state.velocityX,
      state.velocityY,
      state.velocityZ,
      state.angularVelocityX,
      state.angularVelocityY,
      state.angularVelocityZ,
      ...orientation,
    ];
    if (!numbers.every(Number.isFinite)) return false;
    return this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "cargo_update",
      id: state.id,
      x: state.x,
      y: state.y,
      z: state.z,
      qx: orientation[0],
      qy: orientation[1],
      qz: orientation[2],
      qw: orientation[3],
      velocityX: state.velocityX,
      velocityY: state.velocityY,
      velocityZ: state.velocityZ,
      angularVelocityX: state.angularVelocityX,
      angularVelocityY: state.angularVelocityY,
      angularVelocityZ: state.angularVelocityZ,
      sleeping: Boolean(state.sleeping),
      touching: Boolean(touching),
    });
  }

  close() {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close(1000, "page closing");
    this.socket = null;
    this.connected = false;
    this.welcomed = false;
  }

  canSend() {
    return Boolean(
      this.connected
      && this.welcomed
      && this.socket?.readyState === this.WebSocketClass.OPEN,
    );
  }

  sendPresence(now) {
    this.sequence += 1;
    const state = this.latestPresence;
    const sent = this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "presence",
      ...state,
      sequence: this.sequence,
    });
    if (sent) {
      this.lastSentPresence = { ...state };
      this.lastSentAt = now;
    }
    return sent;
  }

  requestPlayerDirectory() {
    return this.send({
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type: "player_directory_request",
    });
  }

  send(message) {
    if (!this.canSend()) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message?.v !== MULTIPLAYER_PROTOCOL_VERSION) {
      this.callbacks.onProtocolError?.(message?.v);
      this.socket?.close(1002, "unsupported protocol version");
      return;
    }
    switch (message.type) {
      case "welcome":
        this.identity = message.self || null;
        this.welcomed = true;
        {
          const welcomeResult = this.callbacks.onWelcome?.(
            message.self,
            message.worldState,
            message.connectedClients,
            message.character || null,
            message.inventory || [],
            message.dialogueState || null,
            message.chatHistory || [],
          );
          if (welcomeResult?.then) {
            Promise.resolve(welcomeResult).then(
              () => this.forcePresence(),
              () => this.forcePresence(),
            );
          } else {
            this.forcePresence();
          }
        }
        break;
      case "session_replaced":
        this.sessionReplaced = true;
        this.intentionalClose = true;
        if (this.reconnectTimer !== null) {
          window.clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.callbacks.onSessionReplaced?.(
          message.message
          || "This character was opened in another browser or tab.",
        );
        this.socket?.close(1008, "session replaced");
        break;
      case "client_count":
        this.callbacks.onClientCount?.(message.connectedClients);
        break;
      case "player_directory":
        this.callbacks.onPlayerDirectory?.(message.players || []);
        break;
      case "snapshot":
        this.callbacks.onSnapshot?.(
          message.players || [],
          message.forklifts || [],
          message.cargo || [],
          message.npcs || [],
        );
        break;
      case "player_state":
        this.callbacks.onPlayerState?.(message.player);
        break;
      case "player_entered":
        this.callbacks.onPlayerEntered?.({
          id: message.playerId,
          name: message.name,
          worldId: message.worldId,
        });
        break;
      case "player_left":
        this.callbacks.onPlayerLeft?.(message.playerId, message.updatedAt);
        break;
      case "chat":
        this.callbacks.onChat?.(message.message);
        break;
      case "chat_rejected":
        this.callbacks.onChatRejected?.(message.reason);
        break;
      case "system_message":
        this.callbacks.onSystemMessage?.(message.text, message.sentAt);
        break;
      case "world_state":
        this.callbacks.onWorldState?.(message.worldState);
        break;
      case "transition_result": {
        const pending = this.pendingTransitions.get(message.requestId);
        if (pending) {
          globalThis.clearTimeout(pending.timer);
          this.pendingTransitions.delete(message.requestId);
          pending.resolve(message);
        }
        this.callbacks.onTransitionResult?.(message);
        break;
      }
      case "transition_commit_result": {
        const pending = this.pendingTransitionCommits.get(message.requestId);
        if (pending) {
          globalThis.clearTimeout(pending.timer);
          this.pendingTransitionCommits.delete(message.requestId);
          pending.resolve(message);
        }
        this.callbacks.onTransitionCommitResult?.(message);
        break;
      }
      case "forklift_state":
        this.callbacks.onForkliftState?.(message.forklift);
        break;
      case "forklift_sound":
        this.callbacks.onForkliftSound?.({
          forkliftId: message.forkliftId,
          cue: message.cue,
        });
        break;
      case "forklift_removed":
        this.callbacks.onForkliftRemoved?.(message.forkliftId);
        break;
      case "cargo_state":
        this.callbacks.onCargoState?.(message.cargo);
        break;
      case "cargo_removed":
        this.callbacks.onCargoRemoved?.(message.cargoId);
        break;
      case "npc_state":
        this.callbacks.onNPCState?.(message.npc);
        break;
      case "npc_removed":
        this.callbacks.onNPCRemoved?.(
          message.npcId,
          message.worldId,
          message.revision,
          message.updatedAt,
        );
        break;
      case "arcade_high_score":
        this.callbacks.onArcadeHighScore?.({
          machineId: message.machineId,
          score: message.score,
          playerName: message.playerName,
          achievedAt: message.achievedAt,
        });
        break;
      case "vending_result": {
        const pending = this.pendingVending.get(message.requestId);
        if (pending) {
          globalThis.clearTimeout(pending.timer);
          this.pendingVending.delete(message.requestId);
          if (message.outcome === "purchased") {
            pending.resolve(message);
          } else {
            const error = new Error(
              message.message || "The vending purchase failed.",
            );
            error.outcome = message.outcome;
            error.result = message;
            pending.reject(error);
          }
        }
        this.callbacks.onVendingResult?.(message);
        break;
      }
      case "script_event_yield":
        this.callbacks.onScriptEventYield?.(message);
        break;
      case "script_event_rejected":
        this.callbacks.onScriptEventRejected?.(message);
        break;
      default:
        break;
    }
  }

  rejectPendingVending(error) {
    for (const pending of this.pendingVending.values()) {
      globalThis.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingVending.clear();
  }

  createPendingTransition(collection, requestId, timeoutMessage) {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const timer = globalThis.setTimeout(() => {
      const pending = collection.get(requestId);
      if (!pending) return;
      collection.delete(requestId);
      pending.reject(new Error(timeoutMessage));
    }, TRANSITION_TIMEOUT_MS);
    const pending = { promise, resolve, reject, timer };
    collection.set(requestId, pending);
    return pending;
  }

  rejectPendingTransition(collection, requestId, error) {
    const pending = collection.get(requestId);
    if (!pending) return;
    globalThis.clearTimeout(pending.timer);
    collection.delete(requestId);
    pending.reject(error);
  }

  rejectPendingTransitions(error) {
    for (const collection of [
      this.pendingTransitions,
      this.pendingTransitionCommits,
    ]) {
      for (const pending of collection.values()) {
        globalThis.clearTimeout(pending.timer);
        pending.reject(error);
      }
      collection.clear();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer !== null || this.intentionalClose) return;
    const base = Math.min(
      MAX_RECONNECT_DELAY_MS,
      INITIAL_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt,
    );
    const delay = Math.round(base * (0.8 + this.random() * 0.4));
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  setStatus(status) {
    this.callbacks.onStatus?.(status);
  }
}
