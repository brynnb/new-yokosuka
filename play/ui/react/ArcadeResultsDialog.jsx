import { Badge, Box, Button, Dialog, Flex, IconButton, ScrollArea, Table, Text } from "@radix-ui/themes";
import { useRef } from "react";
import { closeArcadeResults, refreshArcadeResults, restoreArcadeResultsFocus, useArcadeResultsStore } from "./arcadeResultsStore.js";

const dateFormat = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

export function ArcadeResultsDialog() {
  const { open, title, score, decimalScores, characterId, entries, status, saveWarning } = useArcadeResultsStore();
  const closeRef = useRef(null);
  const formatScore = value => value.toLocaleString(undefined, { maximumFractionDigits: decimalScores ? 4 : 0 });
  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) closeArcadeResults(); }}>
      <Dialog.Content id="arcade-results-overlay" maxWidth="620px" onCloseAutoFocus={restoreArcadeResultsFocus} onOpenAutoFocus={event => {
        event.preventDefault();
        closeRef.current?.focus();
      }}>
        <Flex justify="between" align="start" gap="3">
          <Box>
            <Dialog.Title mb="1">{title} — High Scores</Dialog.Title>
            <Dialog.Description size="2" color="gray">Top 30 · Each character’s personal best</Dialog.Description>
          </Box>
          <Dialog.Close>
            <IconButton ref={closeRef} variant="soft" color="gray" aria-label="Close high scores">×</IconButton>
          </Dialog.Close>
        </Flex>
        <Text as="p" size="3" weight="bold" mt="4">Your score: {formatScore(score)}</Text>
        <Box role="status" aria-live="polite" mt="2">
          {saveWarning && <Text as="p" size="2" color="amber">{saveWarning}</Text>}
          {(status === "saving" || status === "loading") && <Text as="p" size="2" color="gray">{status === "saving" ? "Saving score…" : "Loading high scores…"}</Text>}
          {status === "error" && <Flex align="center" gap="3" wrap="wrap">
            <Text size="2" color="gray">High scores couldn’t be loaded.</Text>
            <Button variant="soft" onClick={() => void refreshArcadeResults()}>Retry</Button>
          </Flex>}
          {status === "ready" && entries.length === 0 && <Text as="p" size="2" color="gray">No scores recorded yet.</Text>}
        </Box>
        {status === "ready" && entries.length > 0 && (
          <ScrollArea type="auto" scrollbars="vertical" mt="3" style={{ maxHeight: "min(480px, 55dvh)" }}>
            <Table.Root size="1" layout="fixed">
              <Table.Header><Table.Row>
                <Table.ColumnHeaderCell width="36px">#</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Player</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell justify="end" width="96px">Score</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell width="96px">Date</Table.ColumnHeaderCell>
              </Table.Row></Table.Header>
              <Table.Body>{entries.map((entry, index) => (
                <Table.Row key={entry.characterId}>
                  <Table.Cell>{index + 1}</Table.Cell>
                  <Table.RowHeaderCell style={{ overflowWrap: "anywhere" }}>
                    {entry.playerName}{entry.characterId === characterId && <Badge size="1" ml="1">You</Badge>}
                  </Table.RowHeaderCell>
                  <Table.Cell justify="end">{formatScore(entry.score)}</Table.Cell>
                  <Table.Cell><time dateTime={entry.achievedAt} title={new Date(entry.achievedAt).toLocaleString()}>{dateFormat.format(new Date(entry.achievedAt))}</time></Table.Cell>
                </Table.Row>
              ))}</Table.Body>
            </Table.Root>
          </ScrollArea>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
