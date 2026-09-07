import {
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Heading,
  Text,
} from "@radix-ui/themes";
import { useEffect, useState } from "react";

import {
  choosePoolMode,
  closePoolChooser,
  poolUiActions,
  usePoolStore,
} from "./poolStore.js";

function ModeChooser() {
  const open = usePoolStore((state) => state.chooserOpen);
  const [choosingOpponent, setChoosingOpponent] = useState(false);
  useEffect(() => {
    if (!open) setChoosingOpponent(false);
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) closePoolChooser();
    }}>
      <Dialog.Content
        maxWidth="420px"
        aria-describedby="pool-mode-description"
        style={{ boxShadow: "0 24px 80px rgb(0 0 0 / 0.48)" }}
      >
        <Dialog.Title>
          {choosingOpponent ? "Choose an opponent" : "Play Nine-Ball"}
        </Dialog.Title>
        <Dialog.Description id="pool-mode-description" size="2" color="gray">
          {choosingOpponent
            ? "Each opponent approaches the table differently."
            : "Take a few shots on your own, or challenge an opponent."}
        </Dialog.Description>
        <Flex direction="column" gap="3" mt="5">
          {choosingOpponent ? (
            <>
              <Button size="3" onClick={() => choosePoolMode("rookie")}>
                Fuku-san · Relaxed
              </Button>
              <Button size="3" onClick={() => choosePoolMode("steady")}>
                Goro · Steady
              </Button>
              <Button size="3" onClick={() => choosePoolMode("ace")}>
                Chai · Expert
              </Button>
            </>
          ) : (
            <>
              <Button size="3" onClick={() => setChoosingOpponent(true)}>
                Challenge
              </Button>
              <Button
                size="3"
                variant="soft"
                onClick={() => choosePoolMode("practice")}
              >
                Practice
              </Button>
            </>
          )}
          <Dialog.Close>
            <Button size="3" variant="soft">Cancel</Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function PoolHud() {
  const state = usePoolStore();
  if (!state.active) return null;
  return (
    <>
      <Box className="pool-score-hud" aria-label="Pool scores">
        {state.players.map((player) => (
          <Flex
            className={`pool-score-row${player.name === state.currentPlayerName ? " active" : ""}`}
            justify="between"
            align="center"
            gap="3"
            key={player.name}
          >
            <Text size="1">{player.name}</Text>
            <Flex align="center" gap="2">
              {player.name === state.currentPlayerName && state.targetBallNumber !== null ? (
                <span
                  className="pool-target-ball"
                  data-ball={state.targetBallNumber}
                  aria-label={`Target ball ${state.targetBallNumber}`}
                />
              ) : null}
              <Text size="1">{player.pots}</Text>
            </Flex>
          </Flex>
        ))}
      </Box>
      <Box className="pool-action-hud">
        <Card size="2" variant="surface" className="pool-radix-hud">
          <Flex direction="column" gap="3">
            {state.foul ? (
              <Box className="pool-foul-notice">
                <Text size="1" weight="bold" color="red">Foul · {state.foul}</Text>
              </Box>
            ) : null}
            {state.placing ? (
              <Box className="pool-placement-controls">
                <Flex justify="between" align="center" gap="3">
                  <Box>
                    <Text size="2" weight="bold">Place the cue ball</Text>
                    <Text as="p" size="1" color="gray">
                      Choose any highlighted valid position on the table.
                    </Text>
                  </Box>
                  <Button
                    disabled={!state.placementValid}
                    onClick={poolUiActions.confirmPlacement}
                  >
                    Confirm
                  </Button>
                </Flex>
              </Box>
            ) : null}
            <Flex className="pool-action-buttons" gap="2" justify="center" wrap="wrap">
              <Button
                size="2"
                disabled={state.placing || (!state.canShoot && state.viewMode !== "standing")}
                onClick={poolUiActions.primaryAction}
              >
                {state.viewMode === "standing" ? "Line up" : "Shoot"}
              </Button>
              <Button
                size="2"
                color="gray"
                variant="soft"
                onClick={poolUiActions.leave}
              >
                Leave
              </Button>
            </Flex>
            {state.winner ? (
              <Box className="pool-winner-controls">
                <Flex justify="between" align="center" gap="3">
                  <Heading as="h3" size="2">{state.winner} wins</Heading>
                  <Flex gap="2">
                    <Button size="2" onClick={poolUiActions.restart}>New rack</Button>
                  </Flex>
                </Flex>
              </Box>
            ) : null}
          </Flex>
        </Card>
      </Box>
    </>
  );
}

export function PoolApp() {
  return (
    <>
      <ModeChooser />
      <PoolHud />
    </>
  );
}
