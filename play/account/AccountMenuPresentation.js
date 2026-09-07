export const ACCOUNT_MENU_VISIBILITY_EVENT =
  "new-yokosuka:account-menu-visibility";
export const ACCOUNT_MENU_FADE_SECONDS = 0.18;

export function accountMenuIsVisible() {
  return document.body.classList.contains("account-menu-visible");
}

export function setAccountMenuVisible(visible) {
  const nextVisible = Boolean(visible);
  document.body.classList.toggle("account-menu-visible", nextVisible);
  globalThis.window?.dispatchEvent(new CustomEvent(ACCOUNT_MENU_VISIBILITY_EVENT, {
    detail: { visible: nextVisible },
  }));
}
