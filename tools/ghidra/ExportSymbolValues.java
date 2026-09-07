// Export addresses and little-endian values for named Ghidra symbols.
// Usage: <output-file> <symbol-name> [<symbol-name> ...]
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.symbol.Symbol;

public class ExportSymbolValues extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <symbol-name> [<symbol-name> ...]"
            );
        }
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
                long value = Integer.toUnsignedLong(
                    currentProgram.getMemory().getInt(address)
                );
                output.println(
                    arguments[index] + " " + address + " -> 0x"
                    + Long.toHexString(value)
                );
            }
        }
    }
}
