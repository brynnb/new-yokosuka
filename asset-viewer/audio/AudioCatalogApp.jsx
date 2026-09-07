import * as Accordion from "@radix-ui/react-accordion";
import { useEffect, useState } from "react";

import { collapseAssetViewerSidebarOnMobile } from "../../src/ui.js";
import { shenmue2AreaPresentation } from "../../src/Shenmue2AssetOrganization.js";
import {
  AUDIO_MODE_EVENT,
  AUDIO_GAME_EVENT,
  getAudioGame,
  selectAudioGame,
  isAudioModeActive,
  loadAudioManifest,
  selectAudioTrack,
} from "./audioViewer.js";

const GROUP_ORDER = ["locations", "music", "free-roam", "event", "ambient", "provided", "other"];
const GROUP_LABELS = Object.freeze({
  locations: "Locations",
  music: "Music",
  "free-roam": "Free Roam",
  event: "Event",
  ambient: "Ambient",
  provided: "Provided Soundtrack",
  other: "Other",
});
const LOCATION_LABEL = /Hazuki|Yamanose|Sakuragaoka|Dobuita|Harbor|Warehouse|Forklift|Arcade|Aida|Bar\b|Bob|Capsule|MJQ|Russiya|Soba|Tomato|Slot\b|Smart|Sushi|Yokosuka|Tattoo|Newsstand|Lottery|Antique|Basement|Dojo|Main Menu/i;

function groupForTrack(track) {
  if (GROUP_ORDER.includes(track.category)) return track.category;
  const sourceFile = track.source?.file || track.id;
  if (/^AMB/i.test(sourceFile)) return "ambient";
  if (/^E15/i.test(sourceFile)) return "event";
  if (LOCATION_LABEL.test(track.label)) return "locations";
  if (/^BGM\d/i.test(sourceFile)) return "music";
  if (/^FRE\d/i.test(sourceFile)) return "free-roam";
  if (/^(TSM|TYM|YKM|RIM)\d/i.test(sourceFile)) return "event";
  if (track.source?.kind === "provided-audio-file") return "provided";
  return "other";
}

function compareTracks(left, right) {
  return left.label.localeCompare(right.label, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function groupTracks(manifest, disc, search) {
  const groups = new Map(GROUP_ORDER.map((group) => [group, []]));
  for (const [id, value] of Object.entries(manifest.tracks)) {
    const track = { id, ...value };
    if (manifest.game === "shenmue2" && !track.titleMapping) {
      // Reuse the scene browser's names only where the source filename gives
      // an explicit known area code. Numeric bank IDs are not guessed titles.
      const code = track.source?.file?.split("_")[0];
      const area = shenmue2AreaPresentation(code);
      if (!area.label.startsWith("Unidentified") && !area.library) {
        track.label = `${area.label} · ${track.label}`;
      }
    }
    if (disc && !track.discs?.includes(Number(disc))) continue;
    const text = `${track.label} ${track.source?.file || ""}`.toLowerCase();
    if (!search.toLowerCase().split(/\s+/).every((word) => text.includes(word))) continue;
    groups.get(groupForTrack(track)).push(track);
  }
  for (const tracks of groups.values()) tracks.sort(compareTracks);
  return groups;
}

export function AudioCatalogApp() {
  const [active, setActive] = useState(isAudioModeActive);
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [game, setGame] = useState(getAudioGame);
  const [disc, setDisc] = useState("");
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const onMode = (event) => {
      setActive(event.detail.active);
      if (!event.detail.active) setSelectedTrackId(null);
    };
    const onGame = (event) => {
      setGame(event.detail.game);
      setManifest(null);
      setError("");
      setSelectedTrackId(null);
      setDisc("");
      setSearch("");
    };
    window.addEventListener(AUDIO_MODE_EVENT, onMode);
    window.addEventListener(AUDIO_GAME_EVENT, onGame);
    return () => {
      window.removeEventListener(AUDIO_MODE_EVENT, onMode);
      window.removeEventListener(AUDIO_GAME_EVENT, onGame);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setError("");
    setManifest(null);
    loadAudioManifest(game).then((nextManifest) => {
      if (!cancelled) setManifest(nextManifest);
    }).catch((loadError) => {
      if (!cancelled) setError(loadError.message);
    });
    return () => { cancelled = true; };
  }, [active, game, attempt]);

  if (!active) return null;
  const groups = manifest ? groupTracks(manifest, disc, search) : null;
  return (
    <>
    <div className="game-selector audio-game-selector" role="group" aria-label="Audio game">
      {[["shenmue", "Shenmue I"], ["shenmue2", "Shenmue II"]].map(([id, label]) => (
        <button type="button" key={id} className={game === id ? "active" : ""}
          aria-pressed={game === id} onClick={() => selectAudioGame(id)}>{label}</button>
      ))}
    </div>
    <div className="audio-catalog-filters">
      <input type="search" aria-label="Search audio" placeholder="Search audio…"
        value={search} onChange={(event) => setSearch(event.target.value)} />
      {game === "shenmue2" ? <select aria-label="Audio disc" value={disc}
        onChange={(event) => setDisc(event.target.value)}>
        <option value="">All discs</option>
        {[1, 2, 3, 4].map((number) => <option key={number} value={number}>Disc {number}</option>)}
      </select> : null}
    </div>
    {error ? <p className="audio-catalog-message" role="alert">Audio catalog unavailable: {error} {" "}
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
    </p> : !manifest ? <p className="audio-catalog-message" role="status">Loading audio catalog…</p> : <>
    <p className="audio-catalog-message" role="status">
      {[...groups.values()].reduce((sum, tracks) => sum + tracks.length, 0)} tracks
      {game === "shenmue2" ? " · 3-minute renders" : ""}
    </p>
    <Accordion.Root
      key={`${game}:${disc}`}
      className="audio-catalog"
      type="multiple"
      defaultValue={game === "shenmue2" ? ["music"] : ["locations"]}
    >
      {GROUP_ORDER.map((group) => {
        const tracks = groups.get(group);
        if (!tracks.length) return null;
        return (
          <Accordion.Item className="audio-category" value={group} key={group}>
            <Accordion.Header className="audio-category-heading">
              <Accordion.Trigger className="audio-category-trigger">
                <span className="audio-category-chevron" aria-hidden="true">&#9656;</span>
                <span>{GROUP_LABELS[group]}</span>
                <span className="audio-category-count">{tracks.length}</span>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="audio-category-content">
              {tracks.map((track) => (
                <button
                  className={`model-item audio-track${selectedTrackId === track.id ? " active" : ""}`}
                  key={track.id}
                  type="button"
                  title={track.source?.file ? `Source: ${track.source.file}` : track.label}
                  onClick={() => {
                    setSelectedTrackId(track.id);
                    selectAudioTrack(track);
                    collapseAssetViewerSidebarOnMobile();
                  }}
                >
                  <span>{track.label}</span>
                  <small>{track.source?.file || "Audio file"}
                    {track.source?.track != null ? ` · Sequence ${track.source.track + 1}` : ""}
                    {track.titleMapping?.kind === "community-description" ? " · Community description" : ""}
                    {track.discs ? ` · Disc ${track.discs.join(", ")}` : ""}</small>
                </button>
              ))}
            </Accordion.Content>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
    </>}
    </>
  );
}
