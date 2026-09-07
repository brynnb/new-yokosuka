// Recover reproducible C-like output for the D000 capsule-toy routines.
// @category Shenmue

import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.SourceType;

public class D000GachaDecompile extends GhidraScript {
    private static final long[] ENTRIES = {
        0x4f978L, // select category model-token list
        0x4fe10L, // category/item-index to collectible lookup value
        0x50414L, // load and present selected prize model
        0x55288L, // debit 100 yen
        0x56ed4L, // prize category/index selection state machine
    };

    @Override
    protected void run() throws Exception {
        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);

        for (long offset : ENTRIES) {
            Address entry = toAddr(offset);
            DisassembleCommand command = new DisassembleCommand(
                entry,
                null,
                true
            );
            command.applyTo(currentProgram, monitor);

            Function function = getFunctionAt(entry);
            if (function == null) {
                function = createFunction(entry, "d000_" + Long.toHexString(offset));
            } else {
                function.setName(
                    "d000_" + Long.toHexString(offset),
                    SourceType.USER_DEFINED
                );
            }
            analyzeChanges(currentProgram);

            DecompileResults result = decompiler.decompileFunction(
                function,
                120,
                monitor
            );
            println("\n===== " + function.getName() + " =====");
            if (result.decompileCompleted()) {
                println(result.getDecompiledFunction().getC());
            } else {
                println("Decompile failed: " + result.getErrorMessage());
            }
        }
        decompiler.dispose();
    }
}
