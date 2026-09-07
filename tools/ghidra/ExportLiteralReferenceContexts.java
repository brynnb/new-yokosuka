// Export surrounding instructions for references to little-endian 16-bit
// literal-pool values. Useful for distinguishing structure-field reads from
// writes in SH-4 code.
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

public class ExportLiteralReferenceContexts extends GhidraScript {
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
                if (address.getOffsetAsBigInteger().testBit(0)) continue;
                int value;
                try {
                    value = Short.toUnsignedInt(memory.getShort(address));
                } catch (Exception exception) {
                    continue;
                }
                if (!values.contains(value)) continue;

                for (Reference reference :
                    currentProgram.getReferenceManager().getReferencesTo(address)) {
                    Instruction center = getInstructionAt(reference.getFromAddress());
                    if (center == null) continue;
                    Function function = getFunctionContaining(center.getAddress());
                    output.println(
                        "\nvalue=0x" + Integer.toHexString(value)
                        + " literal=" + address
                        + " reference=" + center.getAddress()
                        + " function=" + (function == null ? "none" : function.getName())
                    );
                    Instruction cursor = center;
                    for (int index = 0; index < 5 && cursor.getPrevious() != null; index++) {
                        cursor = cursor.getPrevious();
                    }
                    for (int index = 0; index < 12 && cursor != null; index++) {
                        output.println(
                            (cursor == center ? "=> " : "   ")
                            + cursor.getAddress() + "  " + cursor
                        );
                        cursor = cursor.getNext();
                    }
                }
            }
        }
    }
}
