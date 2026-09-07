// Export Ghidra's instruction listing for an address range.
// Usage: <output-file> <start-address> <end-address-exclusive>
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Instruction;

public class ExportListingRange extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length != 3) {
            throw new IllegalArgumentException(
                "Expected <output-file> <start-address> <end-address-exclusive>"
            );
        }
        Address start = toAddr(Long.decode(arguments[1]));
        Address end = toAddr(Long.decode(arguments[2]));
        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            Instruction instruction = getInstructionAt(start);
            if (instruction == null) instruction = getInstructionAfter(start);
            while (
                instruction != null
                && instruction.getAddress().compareTo(end) < 0
            ) {
                output.println(
                    instruction.getAddress() + "  "
                    + instruction.toString()
                );
                instruction = instruction.getNext();
            }
        }
    }
}
