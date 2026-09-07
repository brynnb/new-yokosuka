// Create missing functions at explicit addresses, then decompile them.
// Usage: <output-file> <hex-address> [<hex-address> ...]
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class CreateAndExportFunctions extends GhidraScript {
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
                Address address = toAddr(Long.decode(arguments[index]));
                Function function = getFunctionAt(address);
                if (function == null) {
                    function = createFunction(
                        address,
                        "FUN_" + address.toString()
                    );
                }

                output.println(
                    "\n===== " + arguments[index] + " @ " + address + " ====="
                );
                if (function == null) {
                    output.println("Unable to create function.");
                    continue;
                }
                output.println(
                    "Function: " + function.getName() + " entry=" +
                    function.getEntryPoint() + " body=" + function.getBody()
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
