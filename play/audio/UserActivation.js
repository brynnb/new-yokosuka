// Sticky activation is not proof of playback permission. Keep capture alive
// after the first gesture so background interruptions can be recovered too.
let activated = false;
const subscribers = new Set();
const gestureSubscribers = new Set();
let listening = false;

export function isAudioActivationGesture(event) {
  if (!event.isTrusted) return false;
  if (event.type === "keydown") return !event.repeat && event.key !== "Escape";
  if (event.type === "pointerdown") return event.pointerType === "mouse";
  if (event.type === "pointerup") return event.pointerType !== "mouse";
  return event.type === "touchend" || event.type === "click";
}

function activate(event) {
  if (!isAudioActivationGesture(event)) return;
  // Issue backend play()/resume() inside capture, before awaits or React work.
  for (const subscriber of gestureSubscribers) subscriber(event);
  if (activated) return;
  activated = true;
  const pending = [...subscribers];
  subscribers.clear();
  for (const subscriber of pending) subscriber();
}

export function installUserActivationCapture() {
  if (listening || !globalThis.window) return;
  listening = true;
  for (const type of ["pointerdown", "pointerup", "touchend", "keydown", "click"]) {
    window.addEventListener(type, activate, { capture: true });
  }
}

export function subscribeToAudioGesture(subscriber) {
  gestureSubscribers.add(subscriber);
  installUserActivationCapture();
  return () => gestureSubscribers.delete(subscriber);
}

export function subscribeToUserActivation(subscriber) {
  if (activated) {
    subscriber();
    return () => {};
  }
  subscribers.add(subscriber);
  installUserActivationCapture();
  return () => subscribers.delete(subscriber);
}

installUserActivationCapture();
