import { updateGameUi } from "./react/gameUiStore.js";

const MONTHS = Object.freeze([
  "Jan.",
  "Feb.",
  "Mar.",
  "Apr.",
  "May",
  "Jun.",
  "Jul.",
  "Aug.",
  "Sep.",
  "Oct.",
  "Nov.",
  "Dec.",
]);
const WEEKDAYS = Object.freeze([
  "Sun.",
  "Mon.",
  "Tue.",
  "Wed.",
  "Thu.",
  "Fri.",
  "Sat.",
]);

export function formatGameTime(date) {
  const hour = date.getUTCHours();
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "pm" : "am"}`;
}

export function formatGameDate(date) {
  return [
    `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()},`,
    date.getUTCFullYear(),
    `(${WEEKDAYS[date.getUTCDay()]})`,
  ].join(" ");
}

export class WorldHud {
  constructor(dom) {
    this.dom = dom;
  }

  setLoadingDate(date) {
    this.dom.loadingTime.textContent = formatGameTime(date);
    this.dom.loadingTime.dateTime = date.toISOString();
    this.dom.loadingDate.textContent = formatGameDate(date);
    this.dom.loadingDate.dateTime = date.toISOString().slice(0, 10);
  }

  setWorldDate(date) {
    updateGameUi({
      gameTime: [
        formatGameTime(date),
        `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`,
      ].join(" · "),
    });
  }

  setWorld(world) {
    updateGameUi({ location: world.label });
  }
}
