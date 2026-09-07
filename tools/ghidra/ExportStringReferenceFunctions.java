// Find strings, pointer literals, and decompile every referring function.
// Usage: <output-file> <ASCII-string> [<ASCII-string> ...]
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
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

public class ExportStringReferenceFunctions extends GhidraScript {
    private void collectReferenceFunctions(
        Address target,
        Set<Function> functions,
        PrintWriter output
    ) {
        ReferenceIterator references = currentProgram
            .getReferenceManager()
            .getReferencesTo(target);
        while (references.hasNext()) {
            Reference reference = references.next();
            output.println(
                "  reference " + reference.getFromAddress() + " -> " +
                target + " (" + reference.getReferenceType() + ")"
            );
            Function function = getFunctionContaining(reference.getFromAddress());
            if (function != null) functions.add(function);
        }
    }

    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <ASCII-string> [<ASCII-string> ...]"
            );
        }

        Memory memory = currentProgram.getMemory();
        Address minimum = memory.getMinAddress();
        Address maximum = memory.getMaxAddress();
        Set<Function> functions = new LinkedHashSet<>();

        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            for (int argumentIndex = 1;
                argumentIndex < arguments.length;
                argumentIndex++) {
                String text = arguments[argumentIndex];
                byte[] bytes = text.getBytes(StandardCharsets.US_ASCII);
                output.println("\n===== STRING " + text + " =====");
                Address cursor = minimum;
                while (cursor != null && cursor.compareTo(maximum) <= 0) {
                    Address found = memory.findBytes(
                        cursor,
                        maximum,
                        bytes,
                        null,
                        true,
                        monitor
                    );
                    if (found == null) break;
                    output.println("string address " + found);
                    collectReferenceFunctions(found, functions, output);

                    long value = found.getOffset();
                    byte[] pointerBytes = ByteBuffer.allocate(4)
                        .order(ByteOrder.LITTLE_ENDIAN)
                        .putInt((int) value)
                        .array();
                    Address pointerCursor = minimum;
                    while (
                        pointerCursor != null
                        && pointerCursor.compareTo(maximum) <= 0
                    ) {
                        Address pointer = memory.findBytes(
                            pointerCursor,
                            maximum,
                            pointerBytes,
                            null,
                            true,
                            monitor
                        );
                        if (pointer == null) break;
                        output.println("  pointer literal " + pointer);
                        collectReferenceFunctions(pointer, functions, output);
                        pointerCursor = pointer.next();
                    }
                    cursor = found.next();
                }
            }

            DecompInterface decompiler = new DecompInterface();
            decompiler.openProgram(currentProgram);
            try {
                for (Function function : functions) {
                    output.println(
                        "\n===== FUNCTION " + function.getName() + " @ " +
                        function.getEntryPoint() + " ====="
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
