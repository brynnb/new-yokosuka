import {
  Box,
  Button,
  Card,
  Flex,
  IconButton,
  Separator,
  Slider,
  Text,
  Theme,
} from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";

import { AUDIO_EXIT_EVENT, AUDIO_TRACK_EVENT, resolveArchiveAudioUrl } from "./audioViewer.js";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function safeFilename(label, extension) {
  const stem = label.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "track";
  return `${stem}.${extension}`;
}

function PlayIcon({ paused }) {
  return paused ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
  );
}

export function AudioPlayerApp() {
  const audioRef = useRef(null);
  const volumeRef = useRef(100);
  const selectionRef = useRef(0);
  const [track, setTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const audio = audioRef.current;
    const syncTime = () => setCurrentTime(audio.currentTime || 0);
    const syncDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => setNotice("Audio could not load. Select the track again to retry.");
    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", syncTime);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    const onTrack = (event) => {
      const request = ++selectionRef.current;
      const nextTrack = event.detail;
      setTrack(nextTrack);
      setCurrentTime(0);
      setDuration(0);
      setNotice("");
      audio.pause();
      audio.src = resolveArchiveAudioUrl(nextTrack.ogg_url || nextTrack.url);
      audio.loop = nextTrack.loop !== false;
      audio.volume = volumeRef.current / 100;
      audio.play().catch(() => {
        if (request === selectionRef.current) setNotice("Press play to begin");
      });
    };
    const onExit = () => {
      ++selectionRef.current;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setTrack(null);
      setCurrentTime(0);
      setDuration(0);
      setNotice("");
    };
    window.addEventListener(AUDIO_TRACK_EVENT, onTrack);
    window.addEventListener(AUDIO_EXIT_EVENT, onExit);
    return () => {
      onExit();
      window.removeEventListener(AUDIO_TRACK_EVENT, onTrack);
      window.removeEventListener(AUDIO_EXIT_EVENT, onExit);
    };
  }, []);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!track) return;
    const request = selectionRef.current;
    setNotice("");
    if (audio.paused) audio.play().catch(() => {
      if (request === selectionRef.current) setNotice("Playback could not start");
    });
    else audio.pause();
  };

  const download = async (url, extension) => {
    if (!url) return;
    const request = selectionRef.current;
    setNotice(`Preparing ${extension.toUpperCase()} download...`);
    try {
      const response = await fetch(resolveArchiveAudioUrl(url), { signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        throw new Error(`Download returned ${response.status}: ${url}`);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = safeFilename(track.label, extension);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      if (request === selectionRef.current) setNotice("");
    } catch (error) {
      console.warn("[Audio Viewer] download failed", { url, error });
      if (request === selectionRef.current) setNotice(`${extension.toUpperCase()} download failed`);
    }
  };

  return (
    <Theme appearance="dark" accentColor="teal" grayColor="slate" radius="medium" hasBackground={false}>
      <audio ref={audioRef} preload="metadata" />
      <main className="audio-player-stage">
        <Card className="audio-player-card" size="4">
          {track ? (
            <Flex direction="column" gap="4">
              <Box>
                <Text as="div" size="1" color="gray" className="audio-kicker">Now playing</Text>
                <Text as="h2" size="6" weight="bold" mt="1">{track.label}</Text>
                <Text as="p" size="2" color="gray" mt="2">
                  {track.source?.file || "Rendered Shenmue soundtrack"}
                </Text>
              </Box>
              <Separator size="4" />
              <Box>
                <Slider
                  aria-label="Playback position"
                  min={0}
                  max={Math.max(duration, 1)}
                  step={0.1}
                  value={[Math.min(currentTime, duration || 1)]}
                  onValueChange={([nextTime]) => {
                    audioRef.current.currentTime = nextTime;
                    setCurrentTime(nextTime);
                  }}
                />
                <Flex justify="between" mt="2">
                  <Text size="1" color="gray">{formatTime(currentTime)}</Text>
                  <Text size="1" color="gray">{formatTime(duration)}</Text>
                </Flex>
              </Box>
              <Flex align="center" gap="4">
                <IconButton
                  className="audio-play-button"
                  size="4"
                  radius="full"
                  onClick={togglePlayback}
                  aria-label={playing ? "Pause" : "Play"}
                >
                  <PlayIcon paused={!playing} />
                </IconButton>
                <Box className="audio-volume-control">
                  <Text as="label" size="1" color="gray">Volume</Text>
                  <Slider
                    aria-label="Volume"
                    min={0}
                    max={100}
                    value={[volume]}
                    onValueChange={([nextVolume]) => {
                      volumeRef.current = nextVolume;
                      setVolume(nextVolume);
                      audioRef.current.volume = nextVolume / 100;
                    }}
                  />
                </Box>
                <Text size="1" color="gray" className="audio-volume-value">{volume}%</Text>
              </Flex>
              <Separator size="4" />
              <Flex justify="center" gap="3" wrap="wrap">
                <Button variant="soft" onClick={() => download(track.ogg_url || track.url, "ogg")}>Download OGG</Button>
                <Button variant="soft" disabled={!track.mp3_url} onClick={() => download(track.mp3_url, "mp3")}>Download MP3</Button>
              </Flex>
              {notice ? <Text align="center" size="2" color="amber">{notice}</Text> : null}
            </Flex>
          ) : (
            <Flex className="audio-empty-state" direction="column" align="center" gap="3">
              <span className="audio-disc" aria-hidden="true" />
              <Text as="h2" size="5" weight="bold">Shenmue Audio Archive</Text>
              <Text size="2" color="gray" align="center">
                Choose a track from the sidebar to begin playback.
              </Text>
            </Flex>
          )}
        </Card>
      </main>
    </Theme>
  );
}
