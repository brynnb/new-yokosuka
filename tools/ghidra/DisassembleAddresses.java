// Disassemble recursively from one or more explicit entry addresses.
// Usage: <hex-address> [<hex-address> ...]
// @category Shenmue

import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;

public class DisassembleAddresses extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length == 0) {
            throw new IllegalArgumentException(
                "Expected at least one hex address"
            );
        }
        for (String argument : arguments) {
            Address address = toAddr(Long.decode(argument));
            if (!new DisassembleCommand(address, null, true).applyTo(
                currentProgram,
                monitor
            )) {
                throw new IllegalStateException(
                    "Could not disassemble from " + address
                );
            }
        }
    }
}
