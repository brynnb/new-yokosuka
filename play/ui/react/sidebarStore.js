import { create } from "zustand";

const callbacks = {
  onTravel: () => {},
  onCutscene: () => {},
  onEmote: () => {},
  onCharacter: () => {},
  onPlayMode: () => {},
  onStoryWait: () => {},
  onSelectionCommitted: () => {},
};
let travelSelectionCommitted = false;

export const DEFAULT_APPEARANCE_VALUE = "default";

export function focusGameAfterSidebarSelect(event) {
  event?.preventDefault?.();
  callbacks.onSelectionCommitted();
}

export const useSidebarStore = create(() => ({
  emotes: [],
  characters: [],
  activeEmoteId: null,
  activeCharacterId: null,
  defaultCharacterId: null,
  animationDisabled: true,
  animationDisabledReason: null,
  characterDisabled: true,
  openPicker: null,
  playMode: "free_roam",
  modeBusy: false,
  modeError: null,
}));

export function configureSidebarMenus({
  emotes,
  characters,
  activeCharacterId,
  defaultCharacterId,
  onTravel,
  onCutscene,
  onEmote,
  onCharacter,
  onPlayMode = () => {},
  onStoryWait = () => {},
  onSelectionCommitted,
}) {
  travelSelectionCommitted = false;
  Object.assign(callbacks, {
    onTravel,
    onCutscene,
    onEmote,
    onCharacter,
    onPlayMode,
    onStoryWait,
    onSelectionCommitted,
  });
  useSidebarStore.setState({
    emotes,
    characters,
    activeCharacterId,
    defaultCharacterId,
  });
}

export function setSidebarPickerOpen(picker, open) {
  if (picker === "travel" && open) travelSelectionCommitted = false;
  useSidebarStore.setState({
    openPicker: open ? picker : null,
  });
}

export function selectSidebarTravel(worldId) {
  if (useSidebarStore.getState().modeBusy) return false;
  // Radix may publish another value while a controlled Select is closing.
  // Treat each explicit opening as one transaction so that a stale second
  // value cannot start another world load after the intended teleport.
  if (travelSelectionCommitted) return false;
  travelSelectionCommitted = true;
  setSidebarPickerOpen("travel", false);
  callbacks.onTravel(worldId);
  return true;
}

export function selectSidebarCutscene(cutsceneId) {
  if (useSidebarStore.getState().modeBusy) return false;
  setSidebarPickerOpen("cutscene", false);
  callbacks.onCutscene(cutsceneId);
}

export function selectSidebarEmote(emoteId) {
  const state = useSidebarStore.getState();
  if (state.animationDisabled || state.modeBusy) return;
  const emote = state.emotes.find(
    ({ id }) => id === emoteId,
  );
  if (!emote) return;
  callbacks.onEmote(emote);
}

export function selectSidebarCharacter(characterId) {
  const state = useSidebarStore.getState();
  if (state.characterDisabled || state.playMode === "story" || state.modeBusy) return;
  const selectedId = characterId === DEFAULT_APPEARANCE_VALUE
    ? state.defaultCharacterId
    : characterId;
  const character = state.characters.find(
    ({ id }) => id === selectedId,
  );
  if (!character) return;
  setSidebarPickerOpen("character", false);
  callbacks.onCharacter(character);
}

export function selectSidebarPlayMode(mode) {
  if (useSidebarStore.getState().modeBusy) return;
  void callbacks.onPlayMode(mode);
}

export function selectSidebarStoryWait(id) {
  const state = useSidebarStore.getState();
  if (state.playMode !== "story" || state.modeBusy) return false;
  setSidebarPickerOpen("wait",false);
  void callbacks.onStoryWait(id);
  return true;
}
