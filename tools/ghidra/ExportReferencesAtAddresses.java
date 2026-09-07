// Export Ghidra references to explicit Dreamcast virtual addresses.
// Usage: <output-file> <hex-address> [<hex-address> ...]
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

public class ExportReferencesAtAddresses extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <hex-address> [<hex-address> ...]"
            );
        }

        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            for (int index = 1; index < arguments.length; index++) {
                Address address = toAddr(Long.decode(arguments[index]));
                output.println(
                    "\n===== " + arguments[index] + " @ " + address + " ====="
                );
                ReferenceIterator references = currentProgram
                    .getReferenceManager()
                    .getReferencesTo(address);
                boolean found = false;
                while (references.hasNext()) {
                    Reference reference = references.next();
                    found = true;
                    output.println(
                        reference.getFromAddress() + " " +
                        reference.getReferenceType() + " " +
                        reference.getSource()
                    );
                }
                if (!found) {
                    output.println("No references.");
                }
            }
        }
    }
}
