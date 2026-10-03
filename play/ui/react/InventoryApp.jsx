import {
  Card,
  Button,
  Box,
  Dialog,
  Flex,
  Grid,
  IconButton,
  ScrollArea,
  Text,
} from "@radix-ui/themes";
import { useRef } from "react";

import {
  closeInventory,
  refreshCollection,
  useInventoryStore,
} from "./inventoryStore.js";
import { INVENTORY_ITEMS } from "./inventoryItems.js";
import { CollectionPreviews } from './CollectionPreview.jsx';

export function InventoryApp() {
  const {open, view, items, status, error} = useInventoryStore();
  const collection = view === 'collection';
  const title = collection ? 'Collection' : 'Inventory';
  const closeRef = useRef(null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeInventory();
      }}
    >
      <Dialog.Content
        id="inventory-overlay"
        maxWidth="820px"
        aria-labelledby="inventory-title"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeRef.current?.focus();
        }}
      >
        <Flex align="center" justify="between" gap="4">
          <Dialog.Title
            id="inventory-title"
            as="h2"
            trim="normal"
            mb="0"
          >
            {title}
          </Dialog.Title>
          <Dialog.Close>
            <IconButton
              ref={closeRef}
              type="button"
              color="gray"
              variant="soft"
              aria-label={`Close ${title.toLowerCase()}`}
            >
              ×
            </IconButton>
          </Dialog.Close>
        </Flex>
        {collection && <>
          <Dialog.Description mt="3" size="2" color="gray">Capsule toys collected by this character. Duplicate toys are counted together.</Dialog.Description>
          <Box role="status" aria-live="polite" mt="3">
            {status === 'loading' && <Text color="gray">Loading collection…</Text>}
            {status === 'error' && <Flex gap="3" align="center" wrap="wrap">
              <Text color="gray">{error}</Text>
              <Button variant="soft" onClick={() => void refreshCollection()}>Retry</Button>
            </Flex>}
            {status === 'ready' && <Text color="gray" size="2">{items.length
              ? `${items.length} unique toys · ${items.reduce((sum, item) => sum + item.quantity, 0)} collected`
              : 'No toys collected yet. Try a capsule machine outside You Arcade (¥100 each).'}</Text>}
          </Box>
        </>}
        <ScrollArea type="auto" scrollbars="vertical" mt="4" style={{maxHeight: 'min(480px, 55dvh)'}}>
        {collection ? <Grid columns={{initial: '1', xs: '2', sm: '3'}} gap="2" aria-label="Collected capsule toys">
          {open && status === 'ready' && <CollectionPreviews items={items} />}
        </Grid> :
        <Grid
          columns="repeat(8, minmax(0, 1fr))"
          gap="2"
          aria-label="Inventory items"
        >
          {INVENTORY_ITEMS.map((item) => (
            <Card
              size="1"
              variant="surface"
              key={item.id}
              className="inventory-slot"
              title={item.name}
            >
              <img
                className="inventory-slot-icon"
                src={item.iconUrl}
                alt={item.name}
                width="256"
                height="256"
                decoding="async"
                draggable={false}
              />
            </Card>
          ))}
        </Grid>
        }
        </ScrollArea>
      </Dialog.Content>
    </Dialog.Root>
  );
}
