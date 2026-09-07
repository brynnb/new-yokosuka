let activated = Boolean(
  globalThis.navigator?.userActivation?.hasBeenActive,
);
const subscribers = new Set();
let listening = false;

function stopListening() {
  if (!listening || !globalThis.window) return;
  listening = false;
  window.removeEventListener("pointerdown", activate, true);
  window.removeEventListener("keydown", activate, true);
}

function activate() {
  if (activated) return;
  activated = true;
  stopListening();
  for (const subscriber of subscribers) subscriber();
  subscribers.clear();
}

export function installUserActivationCapture() {
  if (activated || listening || !globalThis.window) return;
  listening = true;
  window.addEventListener("pointerdown", activate, {
    capture: true,
    once: true,
  });
  window.addEventListener("keydown", activate, {
    capture: true,
    once: true,
  });
}

export function subscribeToUserActivation(subscriber) {
  if (activated || globalThis.navigator?.userActivation?.hasBeenActive) {
    activated = true;
    subscriber();
    return () => {};
  }
  subscribers.add(subscriber);
  installUserActivationCapture();
  return () => subscribers.delete(subscriber);
}

installUserActivationCapture();
