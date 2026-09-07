import {
  Box,
  Card,
  Dialog,
  Flex,
  Grid,
  IconButton,
} from "@radix-ui/themes";
import { useRef } from "react";

import {
  closeInventory,
  useInventoryStore,
} from "./inventoryStore.js";
import {
  INVENTORY_PLACEHOLDER_SHEET,
} from "./inventoryPlaceholderAssets.js";

const PLACEHOLDER_ITEMS = Object.freeze(
  Array.from({ length: 16 }, (_, index) => ({
    id: `placeholder-item-${index + 1}`,
    column: index % 4,
    row: Math.floor(index / 4),
  })),
);

function spritePosition(offset) {
  return `${(offset / 3) * 100}%`;
}

export function InventoryApp() {
  const open = useInventoryStore((state) => state.open);
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
            Inventory
          </Dialog.Title>
          <Dialog.Close>
            <IconButton
              ref={closeRef}
              type="button"
              color="gray"
              variant="soft"
              aria-label="Close inventory"
            >
              ×
            </IconButton>
          </Dialog.Close>
        </Flex>
        <Grid
          columns="repeat(8, minmax(0, 1fr))"
          gap="2"
          mt="4"
          aria-label="Inventory items"
        >
          {PLACEHOLDER_ITEMS.map((item, index) => (
            <Card
              size="1"
              variant="surface"
              key={item.id}
              style={{
                "--card-background-color": "var(--gray-3)",
                aspectRatio: "1",
                padding: 0,
              }}
            >
              <Box
                role="img"
                aria-label={`Inventory item ${index + 1}`}
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundImage: `url(${INVENTORY_PLACEHOLDER_SHEET})`,
                  backgroundPosition: [
                    spritePosition(item.column),
                    spritePosition(item.row),
                  ].join(" "),
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "400% 400%",
                  imageRendering: "pixelated",
                }}
              />
            </Card>
          ))}
        </Grid>
      </Dialog.Content>
    </Dialog.Root>
  );
}
