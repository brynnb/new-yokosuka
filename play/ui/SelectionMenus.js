import {
  configureSidebarMenus,
  setSidebarPickerOpen,
  useSidebarStore,
} from "./react/sidebarStore.js";

export class SelectionMenus {
  constructor({
    emotes,
    characters,
    getActiveCharacterId,
    getDefaultCharacterId = getActiveCharacterId,
    onTravel,
    onCutscene,
    onEmote,
    onCharacter,
    onSelectionCommitted,
  }) {
    this.initialState = {
      emotes,
      characters,
      activeCharacterId: getActiveCharacterId(),
      defaultCharacterId: getDefaultCharacterId(),
      onTravel,
      onCutscene,
      onEmote,
      onCharacter,
      onSelectionCommitted,
    };
  }

  setAnimationOpen(open) {
    this.setPickerOpen("animation", open);
  }

  setTravelOpen(open) {
    this.setPickerOpen("travel", open);
  }

  setCutsceneOpen(open) {
    this.setPickerOpen("cutscene", open);
  }

  setCharacterOpen(open) {
    this.setPickerOpen("character", open);
  }

  setPickerOpen(picker, open) {
    setSidebarPickerOpen(picker, open);
  }

  prepare() {
    configureSidebarMenus(this.initialState);
  }

  setActiveEmote(activeEmoteId) {
    useSidebarStore.setState({ activeEmoteId });
  }

  setActiveCharacter(activeCharacterId) {
    useSidebarStore.setState({ activeCharacterId });
  }

  setAnimationDisabled(animationDisabled, animationDisabledReason = null) {
    useSidebarStore.setState({
      animationDisabled,
      animationDisabledReason: animationDisabled
        ? animationDisabledReason
        : null,
    });
  }

  setCharacterDisabled(characterDisabled) {
    useSidebarStore.setState({ characterDisabled });
  }
}
