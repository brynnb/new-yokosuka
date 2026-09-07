import { zoneEntryMessage } from "../../src/multiplayer/ChatText.js";
import { ReactChatPanel } from "./ReactChatPanel.js";
import {
  MultiplayerClient,
} from "../../src/multiplayer/MultiplayerClient.js";
import {
  RemotePlayerManager,
} from "../../src/multiplayer/RemotePlayerManager.js";

const WARP_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseWarpCoordinates(input) {
  const parts = input.replaceAll(",", " ").trim().split(/\s+/);
  if (
    parts.length !== 3
    || parts.some((part) => !WARP_NUMBER_PATTERN.test(part))
  ) {
    return null;
  }
  const coordinates = parts.map(Number);
  return coordinates.every(Number.isFinite) ? coordinates : null;
}

export class MultiplayerSession {
  constructor({
    scene,
    dom,
    worlds,
    createAvatar,
    stopBlendSeconds,
    getWorld,
    getActor,
    getController,
    arcadeActive,
    callbacks,
    characterId,
  }) {
    this.worlds = worlds;
    this.getWorld = getWorld;
    this.getActor = getActor;
    this.getController = getController;
    this.callbacks = callbacks;
    this.initialZoneEntryAnnounced = false;
    this.hasConnected = false;
    this.remotePlayers = new RemotePlayerManager(scene, {
      createAvatar,
      stopBlendSeconds,
    });
    this.chat = new ReactChatPanel({
      canFocus: () => !arcadeActive(),
      onSend: (text) => this.#sendChatInput(text),
      onPlayerDirectoryRequest: () => this.client?.requestPlayerDirectory(),
      onTypingChange: (typing) => (
        this.getController()?.setMovementLocked(typing)
      ),
    });
    this.client = new MultiplayerClient({
      callbacks: this.#clientCallbacks(),
      characterId,
    });
  }

  #sendChatInput(text) {
    const command = text.trim();
    if (/^\/stuck$/i.test(command)) {
      try {
        const result = this.callbacks.onStuck?.();
        if (result?.recovered) {
          this.chat.addSystem(
            result.message || "Moved you back to a safe position.",
          );
        } else {
          this.chat.addSystem(
            result?.message || "No safe recovery position was available.",
          );
        }
      } catch (error) {
        console.error("Player recovery failed", error);
        this.chat.addSystem("Could not recover your position.");
      }
      return true;
    }
    if (/^\/warp(?:\s|$)/i.test(command)) {
      const coordinates = parseWarpCoordinates(
        command.replace(/^\/warp\b/i, ""),
      );
      if (!coordinates) {
        this.chat.addSystem(
          "Usage: /warp <x> <y> <z> (separate coordinates with spaces or commas).",
        );
        return true;
      }
      try {
        const result = this.callbacks.onWarp?.(coordinates);
        this.chat.addSystem(
          result?.message || (result?.warped
            ? `Warped to ${coordinates.join(", ")}.`
            : "Could not warp to that position."),
        );
      } catch (error) {
        console.error("Player warp failed", error);
        this.chat.addSystem("Could not warp to that position.");
      }
      return true;
    }
    if (/^\/forklift$/i.test(command)) {
      const actor = this.getActor();
      const yaw = actor.rotation.y;
      const distance = 2.2;
      const spawned = this.client?.spawnForklift({
        x: actor.position.x + Math.sin(yaw) * distance,
        y: actor.position.y,
        z: actor.position.z + Math.cos(yaw) * distance,
        yaw,
      });
      if (!spawned) {
        this.chat.addSystem(
          "The forklift command requires a server connection.",
        );
      }
      return true;
    }
    if (command.startsWith("/")) {
      this.chat.addSystem("Unknown command.");
      return true;
    }
    return this.client?.sendChat(text) || false;
  }

  #clientCallbacks() {
    const game = this.callbacks;
    return {
      onStatus: (status) => {
        if (status === "connecting") {
          this.chat.setConnectionStatus("connecting");
        } else if (status === "offline") {
          this.chat.setConnectionStatus("offline");
        }
      },
      onWelcome: (
        identity,
        worldState,
        connectedClients,
        character,
        inventory,
        dialogueState,
        chatHistory,
      ) => {
        const reconnected = this.hasConnected;
        this.hasConnected = true;
        game.onWorldState(worldState);
        this.chat.setIdentity(identity);
        this.chat.setPlayerCount(connectedClients);
        this.chat.setConnected(true);
        this.chat.beginWorldSession(chatHistory);
        game.onCharacterState?.(character, inventory, dialogueState);
        game.onConnected?.(reconnected);
        return undefined;
      },
      onClientCount: (count) => this.chat.setPlayerCount(count),
      onPlayerDirectory: (players) => this.chat.setPlayerDirectory(
        players.map((player) => ({
          ...player,
          location: this.worlds[player.worldId]?.label
            || player.worldId
            || "Joining the game…",
        })),
      ),
      onSnapshot: (players, forklifts, cargo, npcs) => {
        const selfId = this.client.identity?.id;
        this.remotePlayers.replaceSnapshot(
          players.filter((player) => player.id !== selfId),
        );
        game.onSnapshot(forklifts, cargo, npcs);
        if (!this.initialZoneEntryAnnounced) {
          this.initialZoneEntryAnnounced = true;
          const world = this.getWorld();
          this.chat.addSystem(
            "If you get stuck, type /stuck in chat to return to a safe position.",
          );
          this.chat.addSystem(zoneEntryMessage(
            this.client.identity?.name,
            world.label,
            this.client.identity?.name,
          ));
        }
      },
      onPlayerState: (player) => {
        if (player?.id === this.client.identity?.id) return;
        this.remotePlayers.upsert(player);
        game.onRemotePlayersChanged();
      },
      onPlayerEntered: (player) => {
        this.chat.addSystem(zoneEntryMessage(
          player.name,
          this.worlds[player.worldId]?.label || "the area",
        ));
      },
      onPlayerLeft: (playerId) => {
        this.remotePlayers.remove(playerId);
        game.onRemotePlayersChanged();
      },
      onChat: (message) => this.chat.addMessage(message),
      onChatRejected: (reason) => this.chat.addSystem(reason),
      onSystemMessage: (message) => this.chat.addSystem(message),
      onWorldState: game.onWorldState,
      onForkliftState: game.onForkliftState,
      onForkliftSound: game.onForkliftSound,
      onForkliftRemoved: game.onForkliftRemoved,
      onCargoState: game.onCargoState,
      onCargoRemoved: game.onCargoRemoved,
      onNPCState: game.onNPCState,
      onNPCRemoved: game.onNPCRemoved,
      onArcadeHighScore: game.onArcadeHighScore,
      onVendingResult: game.onVendingResult,
      onScriptEventYield: game.onScriptEventYield,
      onScriptEventRejected: game.onScriptEventRejected,
      onSessionReplaced: game.onSessionReplaced,
      onReset: () => {
        this.initialZoneEntryAnnounced = false;
        this.remotePlayers.clear();
        this.chat.clear();
        this.chat.setIdentity(null);
        this.chat.setPlayerCount(0);
        this.chat.setConnected(false);
        game.onReset();
      },
      onProtocolError: (version) => {
        console.warn(`[Multiplayer] unsupported protocol version: ${version}`);
      },
    };
  }

  connect() {
    this.client.connect();
  }
}
