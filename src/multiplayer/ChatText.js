export function onlinePlayerStatus(playerCount) {
  const count = Math.max(
    1,
    Number.isFinite(playerCount) ? Math.trunc(playerCount) : 1,
  );
  return `Online - ${count} ${count === 1 ? "player" : "players"}`;
}

export function multiplayerStatusText(connectionState, playerCount) {
  if (connectionState === "connecting") return "Connecting";
  if (connectionState === "connected") {
    return onlinePlayerStatus(playerCount);
  }
  return "Server Offline";
}

export function zoneEntryMessage(name, worldLabel, currentName = null) {
  const area = worldLabel || "the area";
  if (name && currentName && name === currentName) {
    return `You have entered ${area}`;
  }
  return `${name || "Guest"} has entered ${area}`;
}

export function onlineChatTitle(name) {
  return name
    ? `Online Chat - Chatting as ${name}`
    : "Online Chat";
}
