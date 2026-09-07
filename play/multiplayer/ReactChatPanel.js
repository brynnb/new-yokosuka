import {
  appendChatMessage,
  useChatUiStore,
} from "../ui/react/chatStore.js";

export class ReactChatPanel {
  constructor({
    onSend,
    onTypingChange,
    onPlayerDirectoryRequest,
    canFocus = () => true,
  }) {
    this.onSend = onSend;
    this.onTypingChange = onTypingChange;
    this.onPlayerDirectoryRequest = onPlayerDirectoryRequest;
    this.canFocus = canFocus;
    useChatUiStore.setState({ controller: this });
    this.setConnected(false);
  }

  send(text) {
    return this.onSend(text);
  }

  setTyping(typing) {
    this.onTypingChange?.(typing);
  }

  setIdentity(identity) {
    useChatUiStore.setState({ identity });
  }

  setConnected(connected) {
    this.setConnectionStatus(connected ? "connected" : "offline");
  }

  setConnectionStatus(connectionState) {
    const normalizedState = ["connecting", "connected"].includes(
      connectionState,
    )
      ? connectionState
      : "offline";
    useChatUiStore.setState({
      connectionState: normalizedState,
      ...(normalizedState === "offline"
        ? {
            onlinePlayers: [],
            playerDirectoryStatus: "offline",
          }
        : {}),
    });
  }

  setPlayerCount(playerCount) {
    useChatUiStore.setState({
      playerCount: Math.max(
        0,
        Number.isFinite(playerCount) ? Math.trunc(playerCount) : 0,
      ),
    });
  }

  requestPlayerDirectory() {
    return this.onPlayerDirectoryRequest?.() || false;
  }

  setPlayerDirectory(players) {
    useChatUiStore.setState({
      onlinePlayers: Array.isArray(players) ? players : [],
      playerDirectoryStatus: "ready",
    });
  }

  addMessage(message) {
    if (!message?.text) return;
    appendChatMessage({
      id: crypto.randomUUID(),
      type: "chat",
      name: message.name || "Guest",
      text: message.text,
    });
  }

  addSystem(reason) {
    appendChatMessage({
      id: crypto.randomUUID(),
      type: "system",
      text: reason || "Message was not sent.",
    });
  }

  beginWorldSession(chatHistory = []) {
    this.clear();
    for (const message of chatHistory) this.addMessage(message);
    this.addSystem("Welcome to New Yokosuka!");
  }

  clear() {
    useChatUiStore.setState({ messages: [] });
  }

  dispose() {
    this.onTypingChange?.(false);
    useChatUiStore.setState({
      controller: null,
      onlinePlayers: [],
      playerDirectoryStatus: "offline",
    });
  }
}
