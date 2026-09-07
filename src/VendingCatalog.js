import vendingManifest from "../play/data/vending-machines.json" with {
  type: "json",
};

const positionEpsilon = 0.001;

export const VENDING_MANIFEST = Object.freeze(vendingManifest);
export const VENDING_PRODUCTS = Object.freeze(
  vendingManifest.products.map((product) => Object.freeze({ ...product })),
);
export const VENDING_PRODUCT_BY_KEY = new Map(
  VENDING_PRODUCTS.map((product) => [product.key, product]),
);
export const VENDING_MACHINE_BY_ID = new Map(
  vendingManifest.machines.map((machine) => [
    machine.id,
    Object.freeze({ ...machine }),
  ]),
);

export function isVendingMachineModel(model) {
  return /(?:^|_)JIHS5(?:GT|KR)G\.MT5$/i.test(String(model || ""));
}

export function vendingMachineForPlacement(worldId, placement) {
  if (!worldId || !placement || !isVendingMachineModel(placement.model)) {
    return null;
  }
  return vendingManifest.machines.find((machine) => (
    machine.worldId === worldId
    && machine.model === placement.model
    && machine.position.every((value, index) => (
      Math.abs(value - Number(placement.position?.[index])) <= positionEpsilon
    ))
  )) || null;
}

export function vendingProduct(key) {
  return VENDING_PRODUCT_BY_KEY.get(key) || null;
}

export function vendingDisplayProduct(result) {
  if (result?.winningCan) return vendingManifest.prize;
  return vendingProduct(result?.drinkKey);
}
