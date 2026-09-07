export class EmoteController {
  constructor({
    animation,
    closeMenu,
    setActiveEmote,
  }) {
    this.animation = animation;
    this.closeMenu = closeMenu;
    this.setActiveEmote = setActiveEmote;
  }

  get active() {
    return this.animation.activeEmote;
  }

  clear() {
    this.animation.clearEmote();
  }

  play(emote, option, context = null) {
    if (!this.animation.playEmote(emote, context)) return false;
    this.setActiveEmote(emote.id);
    this.closeMenu();
    return true;
  }
}
