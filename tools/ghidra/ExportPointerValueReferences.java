// Find little-endian 32-bit pointer literals and export code references to
// their literal-pool locations.
// Usage: <output-file> <hex-pointer> [<hex-pointer> ...]
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;
import java.util.HashSet;
import java.util.Set;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressSetView;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.symbol.Reference;

public class ExportPointerValueReferences extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <hex-pointer> [<hex-pointer> ...]"
            );
        }
        Set<Integer> values = new HashSet<>();
        for (int index = 1; index < arguments.length; index++) {
            values.add((int)(Long.decode(arguments[index]) & 0xffffffffL));
        }

        Memory memory = currentProgram.getMemory();
        AddressSetView loaded = memory.getLoadedAndInitializedAddressSet();
        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            for (Address address : loaded.getAddresses(true)) {
                if (
                    address.getOffsetAsBigInteger()
                        .and(java.math.BigInteger.valueOf(3))
                        .signum() != 0
                ) {
                    continue;
                }
                int value;
                try {
                    value = memory.getInt(address);
                } catch (Exception exception) {
                    continue;
                }
                if (!values.contains(value)) continue;
                for (Reference reference :
                    currentProgram.getReferenceManager()
                        .getReferencesTo(address)) {
                    Instruction instruction = getInstructionAt(
                        reference.getFromAddress()
                    );
                    if (instruction == null) continue;
                    Function function = getFunctionContaining(
                        reference.getFromAddress()
                    );
                    output.println(
                        "value=0x" + Integer.toUnsignedString(value, 16)
                        + " literal=" + address
                        + " from=" + reference.getFromAddress()
                        + " instruction=\"" + instruction + "\""
                        + " function="
                        + (function == null ? "none" : function.getName())
                        + " entry="
                        + (function == null ? "none"
                            : function.getEntryPoint())
                    );
                }
            }
        }
    }
}
