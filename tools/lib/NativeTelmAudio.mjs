import { createHash } from "node:crypto";

export const EXECUTABLE_RUNTIME_BASE = 0x0c010000;
export const EXPECTED_EXECUTABLE_SHA256 = (
  "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
);
export const TELM_CONTROLLER_START = 0x0c16d40a;
export const TELM_CONTROLLER_END = 0x0c16fbc2;
export const TELM_STATE_TABLE = 0x0c16d6a4;
export const TELM_STATE_DISPATCH_BASE = 0x0c16d67e;
export const TELM_STATE_COUNT = 22;
// This interpreter accepts several typed native command families. TELM's
// calls at this address happen to carry AB audio commands, but JOMO's object
// manager also submits opcode-0x05a9 generated-room callbacks here.
export const NATIVE_TYPED_COMMAND_DISPATCHER = 0x0c17a91c;

function signed(value, bits) {
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

function assertRuntimeRange(data, address, length) {
  const offset = address - EXECUTABLE_RUNTIME_BASE;
  if (offset < 0 || offset + length > data.length) {
    throw new RangeError(
      `Runtime range 0x${address.toString(16)}..`
      + `0x${(address + length).toString(16)} is outside the executable`,
    );
  }
  return offset;
}

export function readUint16(data, address) {
  return data.readUInt16LE(assertRuntimeRange(data, address, 2));
}

export function readUint32(data, address) {
  return data.readUInt32LE(assertRuntimeRange(data, address, 4));
}

export function executableSha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function assertKnownExecutable(data) {
  const actual = executableSha256(data);
  if (actual !== EXPECTED_EXECUTABLE_SHA256) {
    throw new Error(
      `Unsupported 1ST_READ.BIN SHA-256 ${actual}; expected `
      + EXPECTED_EXECUTABLE_SHA256,
    );
  }
}

export function pcRelativeLiteralAddress(address, instruction) {
  if ((instruction & 0xf000) === 0xd000) {
    return ((address + 4) & ~3) + ((instruction & 0xff) * 4);
  }
  if ((instruction & 0xf000) === 0x9000) {
    return address + 4 + ((instruction & 0xff) * 2);
  }
  return null;
}

export function nativeCommandHex(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return bytes.toString("hex");
}

export function extractTelmStateTargets(data) {
  return Array.from({ length: TELM_STATE_COUNT }, (_, state) => {
    const relative = data.readInt16LE(
      assertRuntimeRange(data, TELM_STATE_TABLE + (state * 2), 2),
    );
    return {
      state,
      tableAddress: TELM_STATE_TABLE + (state * 2),
      relative,
      targetAddress: TELM_STATE_DISPATCH_BASE + relative,
    };
  });
}

function loadConstant(data, address, instruction) {
  const literal = pcRelativeLiteralAddress(address, instruction);
  if (literal !== null) {
    if ((instruction & 0xf000) === 0xd000) {
      return { literalAddress: literal, value: readUint32(data, literal) };
    }
    return { literalAddress: literal, value: readUint16(data, literal) };
  }
  if ((instruction & 0xf000) === 0xe000) {
    return { literalAddress: null, value: signed(instruction & 0xff, 8) };
  }
  return null;
}

export function extractTelmSoundCalls(data) {
  const calls = [];
  for (
    let address = TELM_CONTROLLER_START;
    address < TELM_CONTROLLER_END;
    address += 2
  ) {
    const instruction = readUint16(data, address);
    if ((instruction & 0xf000) !== 0xd000) continue;
    const dispatcherLiteral = pcRelativeLiteralAddress(address, instruction);
    if (
      readUint32(data, dispatcherLiteral)
      !== NATIVE_TYPED_COMMAND_DISPATCHER
    ) continue;

    const dispatcherRegister = (instruction >> 8) & 0xf;
    let callAddress = null;
    for (let cursor = address + 2; cursor <= address + 8; cursor += 2) {
      if (
        readUint16(data, cursor)
        === (0x400b | (dispatcherRegister << 8))
      ) {
        callAddress = cursor;
        break;
      }
    }
    if (callAddress === null) continue;

    let command = null;
    for (let cursor = address - 8; cursor <= callAddress; cursor += 2) {
      const candidate = readUint16(data, cursor);
      if (((candidate >> 8) & 0xf) !== 4) continue;
      const loaded = loadConstant(data, cursor, candidate);
      if (loaded) command = { address: cursor, ...loaded };
    }
    if (!command) {
      throw new Error(
        `Sound call at 0x${callAddress.toString(16)} has no constant r4 load`,
      );
    }
    calls.push({
      dispatcherLoadAddress: address,
      dispatcherLiteralAddress: dispatcherLiteral,
      callAddress,
      commandLoadAddress: command.address,
      commandLiteralAddress: command.literalAddress,
      commandWord: command.value >>> 0,
      commandHex: nativeCommandHex(command.value),
    });
  }
  return calls;
}

function resolvedRegisterConstant(data, address, register) {
  for (let cursor = address - 2; cursor >= address - 16; cursor -= 2) {
    const instruction = readUint16(data, cursor);
    if (((instruction >> 8) & 0xf) !== register) continue;
    return loadConstant(data, cursor, instruction)?.value ?? null;
  }
  return null;
}

export function reachableAddresses(data, startAddress) {
  const reached = new Set();
  const pending = [startAddress];
  const enqueue = (address) => {
    if (
      address >= TELM_CONTROLLER_START
      && address < TELM_CONTROLLER_END
      && !reached.has(address)
    ) {
      pending.push(address);
    }
  };

  while (pending.length > 0) {
    let address = pending.pop();
    while (
      address >= TELM_CONTROLLER_START
      && address < TELM_CONTROLLER_END
      && !reached.has(address)
    ) {
      reached.add(address);
      const instruction = readUint16(data, address);
      const family = instruction & 0xf000;

      if (family === 0xa000) {
        reached.add(address + 2);
        enqueue(address + 4 + (signed(instruction & 0xfff, 12) * 2));
        break;
      }
      if (family === 0xb000) {
        reached.add(address + 2);
        address += 4;
        continue;
      }
      if (
        (instruction & 0xff00) === 0x8900
        || (instruction & 0xff00) === 0x8b00
      ) {
        enqueue(address + 4 + (signed(instruction & 0xff, 8) * 2));
        address += 2;
        continue;
      }
      if (
        (instruction & 0xff00) === 0x8d00
        || (instruction & 0xff00) === 0x8f00
      ) {
        reached.add(address + 2);
        enqueue(address + 4 + (signed(instruction & 0xff, 8) * 2));
        enqueue(address + 4);
        break;
      }
      if (instruction === 0x000b || instruction === 0x002b) {
        reached.add(address + 2);
        break;
      }
      if ((instruction & 0xf0ff) === 0x402b) {
        reached.add(address + 2);
        const register = (instruction >> 8) & 0xf;
        const target = resolvedRegisterConstant(data, address, register);
        if (target !== null) enqueue(target);
        break;
      }
      if ((instruction & 0xf0ff) === 0x400b) {
        reached.add(address + 2);
        address += 4;
        continue;
      }
      if ((instruction & 0xf0ff) === 0x0023) {
        reached.add(address + 2);
        break;
      }
      address += 2;
    }
  }
  return reached;
}

export function assignCallsToTelmStates(data, calls, states) {
  const byCall = new Map(calls.map((call) => [call.callAddress, []]));
  const enrichedStates = states.map((state) => {
    const reached = reachableAddresses(data, state.targetAddress);
    const soundCallAddresses = calls
      .filter((call) => (
        reached.has(call.dispatcherLoadAddress)
        || reached.has(call.callAddress)
      ))
      .map((call) => call.callAddress);
    for (const callAddress of soundCallAddresses) {
      byCall.get(callAddress).push(state.state);
    }
    return { ...state, soundCallAddresses };
  });
  return {
    states: enrichedStates,
    calls: calls.map((call) => ({
      ...call,
      reachableFromStates: byCall.get(call.callAddress),
    })),
  };
}
