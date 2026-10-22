import {
  Button,
  Card,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Text,
} from "@radix-ui/themes";
import { useEffect, useRef } from "react";

import {
  closeJournal,
  turnJournalPage,
  useJournalStore,
} from "./journalStore.js";

export function JournalApp() {
  const open = useJournalStore((state) => state.open);
  const pageIndex = useJournalStore((state) => state.pageIndex);
  const pages = useJournalStore((state) => state.pages);
  const closeRef = useRef(null);
  const page = pages[pageIndex];
  const pageCount = Math.max(1, pages.length);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (["a", "A", "ArrowLeft"].includes(event.key)) {
        event.preventDefault();
        turnJournalPage(-1);
      } else if (["d", "D", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        turnJournalPage(1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeJournal();
      }}
    >
      <Dialog.Content
        id="journal-overlay"
        maxWidth="720px"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeRef.current?.focus();
        }}
      >
        <Flex align="center" justify="between" gap="4">
          <Dialog.Title
            id="journal-title"
            as="h2"
            trim="normal"
            mb="0"
          >
            Notebook
          </Dialog.Title>
          <Dialog.Close>
            <IconButton
              ref={closeRef}
              id="journal-close"
              type="button"
              color="gray"
              variant="soft"
              aria-label="Close notebook"
            >
              ×
            </IconButton>
          </Dialog.Close>
        </Flex>

        <Card className="journal-page" size="3" mt="4" aria-live="polite">
          <Heading id="journal-page-title" as="h3" size="3" color="gray">
            Page {pageIndex + 1}
          </Heading>
          <Text id="journal-page-copy" className="journal-page-copy" as="p" mt="4">
            {page?.text ?? "Your notebook is empty."}
          </Text>
        </Card>

        <Flex align="center" justify="between" gap="3" mt="4">
          <Button
            id="journal-previous"
            type="button"
            variant="soft"
            disabled={pageIndex === 0}
            onClick={() => turnJournalPage(-1)}
          >
            Previous
          </Button>
          <Text id="journal-page-number" size="2" color="gray">
            {pageIndex + 1} / {pageCount}
          </Text>
          <Button
            id="journal-next"
            type="button"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => turnJournalPage(1)}
          >
            Next
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
