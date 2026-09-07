import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Card,
  Flex,
  Grid,
  Text,
} from "@radix-ui/themes";

import { useGameUiStore } from "./gameUiStore.js";

export function playerHealthValues(value) {
  const match = String(value ?? "").match(
    /^(?:HP\s*)?(\d+)\s*\/\s*(\d+)$/i,
  );
  return match
    ? { current: Number(match[1]), maximum: Number(match[2]) }
    : { current: value ?? "—", maximum: null };
}

export function formatPlayerMoney(value) {
  const numeric = typeof value === "number"
    ? value
    : Number(String(value ?? "").replace(/[$¥,\s]/g, ""));
  return Number.isFinite(numeric)
    ? `$${numeric.toLocaleString("en-US")}`
    : String(value ?? "—");
}

export function PlayerStatus() {
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const closeRef = useRef(null);
  const playerName = useGameUiStore((state) => state.playerName);
  const level = useGameUiStore((state) => state.level);
  const location = useGameUiStore((state) => state.location);
  const gameTime = useGameUiStore((state) => state.gameTime);
  const hp = useGameUiStore((state) => state.hp);
  const yen = useGameUiStore((state) => state.yen);
  const mobileGameTime = gameTime.split("·", 1)[0].trim();
  const health = playerHealthValues(hp);
  const money = formatPlayerMoney(yen);

  useEffect(() => {
    if (!mobileDetailsOpen) return undefined;
    closeRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setMobileDetailsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [mobileDetailsOpen]);

  return (
    <>
      <aside
        className="player-status-hud"
        id="player-status-hud"
        role="status"
        aria-label="Player status"
      >
        <Card className="player-status-card" size="1" variant="surface">
          <Flex className="player-status-heading" direction="column" gap="1">
            <Flex className="player-status-identity" direction="column" gap="1">
              <Text
                as="div"
                className="player-status-name"
                id="player-name"
                size="2"
                weight="bold"
              >
                {playerName}
              </Text>
              <Text
                as="div"
                className="player-status-location"
                id="current-map-name"
                size="1"
                color="teal"
                weight="medium"
              >
                {location}
              </Text>
            </Flex>
            <time className="player-status-time" id="world-game-time">
              {gameTime}
            </time>
          </Flex>
          <Grid className="player-status-resources" columns="3" gap="2">
            <Badge
              className="player-status-resource player-status-level"
              id="player-level"
              color="blue"
              variant="soft"
              size="2"
              highContrast
            >
              Level {level}
            </Badge>
            <Badge
              className="player-status-resource player-status-hp"
              id="player-hp"
              color="green"
              variant="soft"
              size="2"
              highContrast
              aria-label={health.maximum === null
                ? `Health ${health.current}`
                : `Health ${health.current} of ${health.maximum}`}
            >
              HP: {health.current}{health.maximum === null
                ? ""
                : `/${health.maximum}`}
            </Badge>
            <Badge
              className="player-status-resource player-status-yen"
              id="player-yen"
              color="amber"
              variant="soft"
              size="2"
              highContrast
            >
              {money}
            </Badge>
          </Grid>
        </Card>
      </aside>

      <div className="mobile-player-status">
        <time className="mobile-player-time">
          {mobileGameTime}
        </time>
        <button
          className="mobile-player-info-button"
          type="button"
          aria-label="Show player information"
          aria-haspopup="dialog"
          aria-expanded={mobileDetailsOpen}
          onClick={() => setMobileDetailsOpen(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5"></circle>
            <path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6"></path>
          </svg>
        </button>
      </div>

      <div
        className="player-info-overlay"
        aria-hidden={mobileDetailsOpen ? "false" : "true"}
        hidden={!mobileDetailsOpen}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setMobileDetailsOpen(false);
          }
        }}
      >
        <section
          className="player-info-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-info-title"
        >
          <header className="player-info-header">
            <h2 id="player-info-title">Player Information</h2>
            <button
              className="player-info-close"
              type="button"
              aria-label="Close player information"
              ref={closeRef}
              onClick={() => setMobileDetailsOpen(false)}
            >
              ×
            </button>
          </header>
          <dl className="player-info-details">
            <div>
              <dt>Name</dt>
              <dd>{playerName}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{location}</dd>
            </div>
            <div>
              <dt>Health</dt>
              <dd className="player-info-hp">
                {health.maximum === null
                  ? health.current
                  : `${health.current} / ${health.maximum}`}
              </dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>{level}</dd>
            </div>
            <div>
              <dt>Money</dt>
              <dd className="player-info-yen">{money}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{gameTime}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}
