// Find little-endian 16-bit literal-pool values and export code references to
// them. SH-4 commonly loads structure offsets from nearby word literals, so a
// scalar-operand search alone does not reveal the functions using an offset.
// Usage: <output-file> <hex-value> [<hex-value> ...]
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

public class ExportLiteralValueReferences extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <hex-value> [<hex-value> ...]"
            );
        }

        Set<Integer> values = new HashSet<>();
        for (int index = 1; index < arguments.length; index++) {
            values.add((int)(Long.decode(arguments[index]) & 0xffff));
        }

        Memory memory = currentProgram.getMemory();
        AddressSetView loaded = memory.getLoadedAndInitializedAddressSet();
        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            for (Address address : loaded.getAddresses(true)) {
                if (!address.getOffsetAsBigInteger().testBit(0)) {
                    int value;
                    try {
                        value = Short.toUnsignedInt(memory.getShort(address));
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
                            "value=0x" + Integer.toHexString(value)
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
}
