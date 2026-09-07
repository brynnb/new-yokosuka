import {
  Badge,
  Box,
  Card,
  Dialog,
  Flex,
  IconButton,
  ScrollArea,
  Text,
} from "@radix-ui/themes";
import { useEffect, useRef } from "react";

import {
  closePlayerDirectory,
  useChatUiStore,
} from "./chatStore.js";

const REFRESH_INTERVAL_MS = 5_000;

export function OnlinePlayersDialog() {
  const open = useChatUiStore((state) => state.playerDirectoryOpen);
  const status = useChatUiStore((state) => state.playerDirectoryStatus);
  const players = useChatUiStore((state) => state.onlinePlayers);
  const identity = useChatUiStore((state) => state.identity);
  const controller = useChatUiStore((state) => state.controller);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open || !controller) return undefined;
    const refresh = () => controller.requestPlayerDirectory();
    refresh();
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [controller, open]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closePlayerDirectory();
      }}
    >
      <Dialog.Content
        id="online-players-overlay"
        maxWidth="500px"
        aria-describedby="online-players-description"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeRef.current?.focus();
        }}
      >
        <Flex align="start" justify="between" gap="4">
          <Box>
            <Dialog.Title as="h2" trim="normal" mb="0">
              Players Online
            </Dialog.Title>
            <Dialog.Description
              id="online-players-description"
              size="2"
              color="gray"
              mt="1"
            >
              {players.length === 1
                ? "1 player is currently connected."
                : `${players.length} players are currently connected.`}
            </Dialog.Description>
          </Box>
          <Dialog.Close>
            <IconButton
              ref={closeRef}
              type="button"
              color="gray"
              variant="soft"
              aria-label="Close online players"
            >
              ×
            </IconButton>
          </Dialog.Close>
        </Flex>

        <ScrollArea
          type="auto"
          scrollbars="vertical"
          mt="4"
          style={{ maxHeight: "min(520px, 60dvh)" }}
        >
          <Flex direction="column" gap="2" pr="3">
            {status === "loading" && players.length === 0 && (
              <Card size="2">
                <Text size="2" color="gray">Loading players…</Text>
              </Card>
            )}
            {status === "offline" && (
              <Card size="2">
                <Text size="2" color="gray">
                  The multiplayer server is offline.
                </Text>
              </Card>
            )}
            {status === "ready" && players.length === 0 && (
              <Card size="2">
                <Text size="2" color="gray">No players are online.</Text>
              </Card>
            )}
            {players.map((player) => (
              <Card size="2" variant="surface" key={player.id}>
                <Flex align="center" justify="between" gap="4">
                  <Flex align="center" gap="2" minWidth="0">
                    <Text size="2" weight="bold" truncate>
                      {player.name}
                    </Text>
                    {player.id === identity?.id && (
                      <Badge size="1" color="teal" variant="soft">
                        You
                      </Badge>
                    )}
                  </Flex>
                  <Text size="2" color="gray" align="right">
                    {player.location}
                  </Text>
                </Flex>
              </Card>
            ))}
          </Flex>
        </ScrollArea>
      </Dialog.Content>
    </Dialog.Root>
  );
}
