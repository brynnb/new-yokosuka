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
  JOURNAL_PAGES,
  turnJournalPage,
  useJournalStore,
} from "./journalStore.js";

export function JournalApp() {
  const open = useJournalStore((state) => state.open);
  const pageIndex = useJournalStore((state) => state.pageIndex);
  const closeRef = useRef(null);
  const page = JOURNAL_PAGES[pageIndex];

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

        <Card size="3" mt="4" aria-live="polite">
          <Heading id="journal-page-title" as="h3" size="5">
            {page.title}
          </Heading>
          <Text id="journal-page-copy" as="p" color="gray" mt="3">
            {page.copy}
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
            {pageIndex + 1} / {JOURNAL_PAGES.length}
          </Text>
          <Button
            id="journal-next"
            type="button"
            disabled={pageIndex === JOURNAL_PAGES.length - 1}
            onClick={() => turnJournalPage(1)}
          >
            Next
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
