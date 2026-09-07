// Find 32-bit little-endian pointer literals and decompile every function
// that references them. This is useful on SH-4 binaries, where global
// addresses are normally reached through nearby PC-relative literal pools.
// Usage: <output-file> <hex-value> [<hex-value> ...]
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.LinkedHashSet;
import java.util.Set;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

public class ExportPointerValueReferenceFunctions extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <hex-value> [<hex-value> ...]"
            );
        }

        Memory memory = currentProgram.getMemory();
        Address minimum = memory.getMinAddress();
        Address maximum = memory.getMaxAddress();
        Set<Function> functions = new LinkedHashSet<>();

        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            for (int index = 1; index < arguments.length; index++) {
                long value = Long.decode(arguments[index]) & 0xffffffffL;
                byte[] bytes = ByteBuffer.allocate(4)
                    .order(ByteOrder.LITTLE_ENDIAN)
                    .putInt((int)value)
                    .array();
                output.println(
                    "\n===== VALUE 0x" + Long.toHexString(value) + " ====="
                );
                Address cursor = minimum;
                while (cursor != null && cursor.compareTo(maximum) <= 0) {
                    Address literal = memory.findBytes(
                        cursor,
                        maximum,
                        bytes,
                        null,
                        true,
                        monitor
                    );
                    if (literal == null) break;
                    output.println("literal " + literal);
                    ReferenceIterator references = currentProgram
                        .getReferenceManager()
                        .getReferencesTo(literal);
                    while (references.hasNext()) {
                        Reference reference = references.next();
                        Function function = getFunctionContaining(
                            reference.getFromAddress()
                        );
                        output.println(
                            "  reference " + reference.getFromAddress()
                            + " (" + reference.getReferenceType() + ")"
                            + " function="
                            + (function == null
                                ? "<none>"
                                : function.getName())
                        );
                        if (function != null) functions.add(function);
                    }
                    cursor = literal.next();
                }
            }

            DecompInterface decompiler = new DecompInterface();
            decompiler.openProgram(currentProgram);
            try {
                for (Function function : functions) {
                    output.println(
                        "\n===== FUNCTION " + function.getName() + " @ "
                        + function.getEntryPoint() + " ====="
                    );
                    DecompileResults result = decompiler.decompileFunction(
                        function,
                        120,
                        monitor
                    );
                    if (result.decompileCompleted()) {
                        output.println(result.getDecompiledFunction().getC());
                    } else {
                        output.println(
                            "Decompile failed: " + result.getErrorMessage()
                        );
                    }
                }
            } finally {
                decompiler.dispose();
            }
        }
    }
}
