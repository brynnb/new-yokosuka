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
  refreshInventory,
  readInventoryScroll,
  useInventoryStore,
} from "./inventoryStore.js";
import { inventoryArtworkFor } from "./inventoryItems.js";
import { CollectionPreviews } from './CollectionPreview.jsx';

export function InventoryApp() {
  const {open, view, items, status, error, readingKey, readError} = useInventoryStore();
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
        <>
          <Dialog.Description mt="3" size="2" color="gray">{collection ? 'Capsule toys collected by this character. Duplicate toys are counted together.' : 'Items owned by this character. Story possessions are saved by the server.'}</Dialog.Description>
          <Box role="status" aria-live="polite" mt="3">
            {readingKey && <Text color="gray">Reading scroll…</Text>}
            {readError && <Text color="gray">{readError}</Text>}
            {status === 'loading' && <Text color="gray">Loading {collection ? 'collection' : 'inventory'}…</Text>}
            {status === 'error' && <Flex gap="3" align="center" wrap="wrap">
              <Text color="gray">{error}</Text>
              <Button variant="soft" onClick={() => void refreshInventory()}>Retry</Button>
            </Flex>}
            {collection && status === 'ready' && <Text color="gray" size="2">{items.length
              ? `${items.length} unique toys · ${items.reduce((sum, item) => sum + item.quantity, 0)} collected`
              : 'No toys collected yet. Try a capsule machine outside You Arcade (¥100 each).'}</Text>}
            {!collection && status === 'ready' && !items.length && <Text color="gray" size="2">No items yet.</Text>}
          </Box>
        </>
        <ScrollArea type="auto" scrollbars="vertical" mt="4" style={{maxHeight: 'min(480px, 55dvh)'}}>
        {collection ? <Grid columns={{initial: '1', xs: '2', sm: '3'}} gap="2" aria-label="Collected capsule toys">
          {open && status === 'ready' && <CollectionPreviews items={items} />}
        </Grid> :
        <Grid
          columns={{initial:"3",sm:"6",lg:"8"}}
          gap="2"
          aria-label="Inventory items"
        >
          {status === 'ready' && items.map((item) => {
            const art=inventoryArtworkFor(item.key);
            return (
            <Box key={item.key}>
            <Card
              size="1"
              variant="surface"
              className="inventory-slot"
              title={item.description || item.name}
            >
              {art && <img
                className="inventory-slot-icon"
                src={art.iconUrl}
                alt={item.name}
                width="256"
                height="256"
                decoding="async"
                draggable={false}
              />}
            </Card>
              <Text as="div" size="1" weight="bold" align="center" mt="1">{item.name}</Text>
              {item.quantity > 1 && <Text as="div" size="1" color="gray" align="center">×{item.quantity}</Text>}
              {item.scrollReadable && <Button type="button" size="1" variant="soft" mt="2"
                disabled={Boolean(readingKey)} onClick={()=>void readInventoryScroll(item.key)} aria-label={`Read ${item.name}`}>Read</Button>}
              {item.scrollLearned ? <Text as="div" size="1" align="center" color="gray">Learned</Text> :
                item.scrollReadReason && <Text as="div" size="1" align="center" color="gray">{item.scrollReadReason}</Text>}
            </Box>
          );})}
        </Grid>
        }
        </ScrollArea>
      </Dialog.Content>
    </Dialog.Root>
  );
}
