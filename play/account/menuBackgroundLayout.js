export const MENU_BACKGROUND_COLOR = Object.freeze({
  red: 76 / 255,
  green: 115 / 255,
  blue: 241 / 255,
});

export function menuBackgroundLayout(width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const aspect = safeWidth / safeHeight;
  return {
    aspect,
    logoSize: Math.min(1.46, aspect * 1.66),
    wordmarkWidth: Math.min(1.72, aspect * 1.8),
    orthoLeft: -aspect,
    orthoRight: aspect,
    orthoBottom: -1,
    orthoTop: 1,
  };
}
