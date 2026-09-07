// Export raw little-endian values at named Ghidra symbols.
// This is useful for SH-4 literal pools where adjacent 16-bit constants
// overlap when read as a single 32-bit value.
// Usage: <output-file> <symbol-name> [<symbol-name> ...]
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.symbol.Symbol;

public class ExportSymbolWidths extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <symbol-name> [<symbol-name> ...]"
            );
        }

        Memory memory = currentProgram.getMemory();
        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            for (int index = 1; index < arguments.length; index++) {
                Symbol symbol = null;
                for (Symbol candidate : currentProgram.getSymbolTable()
                    .getSymbols(arguments[index])) {
                    symbol = candidate;
                    break;
                }
                if (symbol == null) {
                    output.println(arguments[index] + " missing");
                    continue;
                }

                Address address = symbol.getAddress();
                int byteValue = Byte.toUnsignedInt(memory.getByte(address));
                int shortValue = Short.toUnsignedInt(memory.getShort(address));
                long intValue = Integer.toUnsignedLong(memory.getInt(address));
                output.println(
                    arguments[index] + " " + address
                    + " byte=0x" + Integer.toHexString(byteValue)
                    + " ushort=0x" + Integer.toHexString(shortValue)
                    + " uint=0x" + Long.toHexString(intValue)
                );
            }
        }
    }
}
