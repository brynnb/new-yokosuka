import { create } from "zustand";

import {
  multiplayerStatusText,
  onlineChatTitle,
} from "../../../src/multiplayer/ChatText.js";

const MAX_MESSAGES = 50;

const playerDirectoryCallbacks = {
  onOpen: () => {},
  onClose: () => {},
};

export const useChatUiStore = create(() => ({
  controller: null,
  connectionState: "offline",
  identity: null,
  playerCount: 0,
  onlinePlayers: [],
  playerDirectoryOpen: false,
  playerDirectoryStatus: "idle",
  messages: [],
}));

export function configurePlayerDirectoryUi(nextCallbacks) {
  Object.assign(playerDirectoryCallbacks, nextCallbacks);
}

export function openPlayerDirectory() {
  const state = useChatUiStore.getState();
  if (state.playerDirectoryOpen) return;
  useChatUiStore.setState({
    playerDirectoryOpen: true,
    playerDirectoryStatus: state.connectionState === "connected"
      ? "loading"
      : "offline",
  });
  playerDirectoryCallbacks.onOpen();
}

export function closePlayerDirectory() {
  if (!useChatUiStore.getState().playerDirectoryOpen) return;
  useChatUiStore.setState({ playerDirectoryOpen: false });
  playerDirectoryCallbacks.onClose();
}

export function chatViewState(state) {
  return {
    connected: state.connectionState === "connected",
    title: onlineChatTitle(state.identity?.name),
    status: multiplayerStatusText(
      state.connectionState,
      state.playerCount,
    ),
  };
}

export function appendChatMessage(message) {
  useChatUiStore.setState((state) => ({
    messages: [...state.messages, message].slice(-MAX_MESSAGES),
  }));
}
