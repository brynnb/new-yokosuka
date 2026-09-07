import net from "node:net";

export const MAX_PORT_SCAN_STEPS = 100;

export function requestedPort(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535
    ? parsed
    : fallback;
}

export function portFromAddress(address, fallback) {
  const match = String(address || "").match(/:(\d+)$/);
  return requestedPort(match?.[1], fallback);
}

export function tcpPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export async function nextAvailablePort(
  startPort,
  isAvailable = tcpPortAvailable,
  maxScanSteps = MAX_PORT_SCAN_STEPS,
) {
  for (let offset = 0; offset <= maxScanSteps; offset += 1) {
    const candidate = startPort + offset;
    if (candidate > 65535) break;
    if (await isAvailable(candidate)) return candidate;
  }
  throw new Error(
    `No available port found from ${startPort} `
    + `to ${Math.min(65535, startPort + maxScanSteps)}`,
  );
}
