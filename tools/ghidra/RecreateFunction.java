// Remove mistaken overlapping function entries, then recreate the function
// from its proven native prologue.
// Usage: <entry-address> [<stale-entry-address> ...]
// @category Shenmue

import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.SourceType;

public class RecreateFunction extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length == 0) {
            throw new IllegalArgumentException(
                "Expected <entry-address> [<stale-entry-address> ...]"
            );
        }

        Address entry = toAddr(Long.decode(arguments[0]));
        for (int index = 1; index < arguments.length; index += 1) {
            Address staleEntry = toAddr(Long.decode(arguments[index]));
            Function stale = getFunctionAt(staleEntry);
            if (stale != null) {
                currentProgram.getFunctionManager().removeFunction(
                    stale.getEntryPoint()
                );
            }
        }

        new DisassembleCommand(entry, null, true).applyTo(
            currentProgram,
            monitor
        );
        Function function = getFunctionAt(entry);
        if (function == null) {
            function = createFunction(entry, null);
        }
        if (function == null) {
            throw new IllegalStateException(
                "Could not create function at " + entry
            );
        }
        function.setName(
            "RecoveredFunction_" + entry.toString(),
            SourceType.USER_DEFINED
        );
        println("Recreated " + function.getName() + " " + function.getBody());
    }
}
