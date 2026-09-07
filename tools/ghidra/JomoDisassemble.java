// Disassemble the native SH-4 SCN3 payload embedded in JOMO MAPINFO.BIN.
// @category Shenmue

import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class JomoDisassemble extends GhidraScript {
    @Override
    protected void run() throws Exception {
        Address entry = toAddr(0x38);
        Address codeEnd = toAddr(0x8fd9b);
        clearListing(entry, codeEnd);
        DisassembleCommand command = new DisassembleCommand(entry, null, true);
        command.applyTo(currentProgram, monitor);
        Function function = getFunctionAt(entry);
        if (function == null) {
            function = createFunction(entry, "jomo_scn3_entry");
        } else {
            function.setName(
                "jomo_scn3_entry",
                ghidra.program.model.symbol.SourceType.USER_DEFINED
            );
        }
        analyzeAll(currentProgram);
        int functionCount = 0;
        for (Function ignored : currentProgram.getFunctionManager().getFunctions(true)) {
            functionCount++;
        }
        println("JOMO SH-4 functions: " + functionCount);
        println("Entry body: " + function.getBody());
    }
}
