const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const DEFAULT_LINE_HEIGHT = 16;

export function combatMoveWheelPixels(event, pageHeight) {
  if (!Number.isFinite(event?.deltaY)) return 0;
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    return event.deltaY * DEFAULT_LINE_HEIGHT;
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) {
    return event.deltaY * Math.max(1, pageHeight);
  }
  return event.deltaY;
}

export function bindCombatMoveWheel(element) {
  if (!element?.addEventListener) return () => {};
  const onWheel = (event) => {
    const maximum = Math.max(
      0,
      Number(element.scrollHeight) - Number(element.clientHeight),
    );
    if (maximum <= 0) return;
    const delta = combatMoveWheelPixels(event, element.clientHeight);
    if (delta === 0) return;
    element.scrollTop = Math.max(
      0,
      Math.min(maximum, Number(element.scrollTop) + delta),
    );
    // A wheel gesture over the move list belongs to the list, including at
    // either edge; it must never fall through to the combat camera zoom.
    event.preventDefault();
    event.stopPropagation();
  };
  element.addEventListener("wheel", onWheel, { passive: false });
  return () => element.removeEventListener("wheel", onWheel);
}
