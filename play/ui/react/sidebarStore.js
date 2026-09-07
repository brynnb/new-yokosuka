import { create } from "zustand";

const callbacks = {
  onTravel: () => {},
  onCutscene: () => {},
  onEmote: () => {},
  onCharacter: () => {},
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
  onSelectionCommitted,
}) {
  travelSelectionCommitted = false;
  Object.assign(callbacks, {
    onTravel,
    onCutscene,
    onEmote,
    onCharacter,
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
  setSidebarPickerOpen("cutscene", false);
  callbacks.onCutscene(cutsceneId);
}

export function selectSidebarEmote(emoteId) {
  const state = useSidebarStore.getState();
  if (state.animationDisabled) return;
  const emote = state.emotes.find(
    ({ id }) => id === emoteId,
  );
  if (!emote) return;
  callbacks.onEmote(emote);
}

export function selectSidebarCharacter(characterId) {
  const state = useSidebarStore.getState();
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
