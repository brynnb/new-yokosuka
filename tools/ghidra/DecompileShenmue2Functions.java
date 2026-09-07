// Disassembles and decompiles selected Shenmue II Xbox functions.
// Usage: DecompileShenmue2Functions.java OUTPUT ADDRESS...
// @category NewYokosuka

import java.io.PrintWriter;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class DecompileShenmue2Functions extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 2) {
            throw new IllegalArgumentException("Expected OUTPUT ADDRESS...");
        }

        for (int index = 1; index < args.length; index++) {
            Address address = toAddr(Long.decode(args[index]));
            disassemble(address);
            Function function = getFunctionAt(address);
            if (function == null) {
                function = getFunctionContaining(address);
            }
            if (function == null) {
                function = createFunction(address, null);
            }
            if (function == null) {
                throw new IllegalStateException("Could not create function at " + address);
            }
        }
        DecompInterface decompiler = new DecompInterface();
        decompiler.toggleCCode(true);
        decompiler.toggleSyntaxTree(true);
        if (!decompiler.openProgram(currentProgram)) {
            throw new IllegalStateException(decompiler.getLastMessage());
        }

        try (PrintWriter output = new PrintWriter(args[0])) {
            for (int index = 1; index < args.length; index++) {
                Address address = toAddr(Long.decode(args[index]));
                Function function = getFunctionContaining(address);
                if (function == null) {
                    function = getFunctionAt(address);
                }
                if (function == null) {
                    output.printf("/* No function at %s */%n%n", address);
                    continue;
                }
                output.printf("/* %s at %s */%n", function.getName(), function.getEntryPoint());
                DecompileResults result = decompiler.decompileFunction(function, 120, monitor);
                if (!result.decompileCompleted()) {
                    output.println("/* DECOMPILE FAILED: " + result.getErrorMessage() + " */");
                } else {
                    output.println(result.getDecompiledFunction().getC());
                }
                output.println();
            }
        } finally {
            decompiler.dispose();
        }
    }
}
