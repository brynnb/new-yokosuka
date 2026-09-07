// Export decompiled functions containing explicit Dreamcast virtual addresses.
// Usage: <output-file> <hex-address> [<hex-address> ...]
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;

import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class ExportFunctionsAtAddresses extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <hex-address> [<hex-address> ...]"
            );
        }

        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);

        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            for (int index = 1; index < arguments.length; index++) {
                long value = Long.decode(arguments[index]);
                Address address = toAddr(value);
                Function function = getFunctionContaining(address);
                if (function == null) {
                    new DisassembleCommand(address, null, true).applyTo(
                        currentProgram,
                        monitor
                    );
                    function = getFunctionContaining(address);
                    if (function == null) {
                        function = createFunction(address, null);
                    }
                }

                output.println(
                    "\n===== " + arguments[index] + " @ " + address + " ====="
                );
                if (function == null) {
                    output.println("No containing function.");
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
