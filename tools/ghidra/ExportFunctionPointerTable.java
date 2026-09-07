// Export and decompile functions referenced by a pointer table.
// Usage: <output-file> <table-address> <entry-count> [<stride>]
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;
import java.util.LinkedHashMap;
import java.util.Map;

import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class ExportFunctionPointerTable extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 3 || arguments.length > 4) {
            throw new IllegalArgumentException(
                "Expected <output-file> <table-address> <entry-count> [<stride>]"
            );
        }

        Address table = toAddr(Long.decode(arguments[1]));
        int entryCount = Integer.decode(arguments[2]);
        int stride = arguments.length == 4 ? Integer.decode(arguments[3]) : 4;
        if (entryCount < 1 || stride < 4) {
            throw new IllegalArgumentException(
                "entry-count must be positive and stride must be at least four"
            );
        }

        Map<Address, StringBuilder> indicesByTarget = new LinkedHashMap<>();
        for (int index = 0; index < entryCount; index++) {
            Address entry = table.add((long) index * stride);
            long pointer = Integer.toUnsignedLong(
                currentProgram.getMemory().getInt(entry)
            );
            Address target = toAddr(pointer);
            indicesByTarget.computeIfAbsent(
                target,
                ignored -> new StringBuilder()
            ).append(
                indicesByTarget.getOrDefault(target, new StringBuilder()).length()
                    == 0 ? "" : ", "
            ).append(String.format("0x%02x", index));
        }

        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            output.println(
                "Table " + table + " entries=" + entryCount +
                " stride=" + stride
            );
            for (Map.Entry<Address, StringBuilder> entry
                : indicesByTarget.entrySet()) {
                Address target = entry.getKey();
                Function function = getFunctionAt(target);
                if (function == null) {
                    new DisassembleCommand(target, null, true).applyTo(
                        currentProgram,
                        monitor
                    );
                    function = getFunctionAt(target);
                    if (function == null && currentProgram.getMemory().contains(target)) {
                        function = createFunction(
                            target,
                            "FUN_" + target.toString()
                        );
                    }
                }

                output.println(
                    "\n===== opcodes " + entry.getValue() +
                    " target=" + target + " ====="
                );
                if (function == null) {
                    output.println("No function at target.");
                    continue;
                }
                output.println(
                    "Function: " + function.getName() +
                    " entry=" + function.getEntryPoint() +
                    " body=" + function.getBody()
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
