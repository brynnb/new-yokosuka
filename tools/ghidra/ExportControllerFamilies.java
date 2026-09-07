// Export Shenmue's authored controller-family table as machine-readable JSON.
//
// Usage:
//   <output-file> <table-address> <family-count>
//
// Each table entry is three little-endian pointers:
//   node-count byte, 0x24-byte node descriptor array, auxiliary family data.
//
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;
import java.util.Locale;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.mem.Memory;

public class ExportControllerFamilies extends GhidraScript {
    private Memory memory;

    private Address pointerAt(Address address) throws Exception {
        long value = Integer.toUnsignedLong(memory.getInt(address));
        return toAddr(value);
    }

    private String quotedAddress(Address address) {
        return "\"0x" + address.toString() + "\"";
    }

    private String rawHex(Address address, int length) throws Exception {
        StringBuilder result = new StringBuilder(length * 2);
        for (int index = 0; index < length; index++) {
            result.append(String.format(
                Locale.ROOT,
                "%02x",
                Byte.toUnsignedInt(memory.getByte(address.add(index)))
            ));
        }
        return result.toString();
    }

    private int unsignedByte(Address address) throws Exception {
        return Byte.toUnsignedInt(memory.getByte(address));
    }

    private int signedShort(Address address) throws Exception {
        return memory.getShort(address);
    }

    private float floatAt(Address address) throws Exception {
        return Float.intBitsToFloat(memory.getInt(address));
    }

    private String jsonFloat(float value) {
        if (!Float.isFinite(value)) {
            return "null";
        }
        return Float.toString(value);
    }

    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length != 3) {
            throw new IllegalArgumentException(
                "Expected <output-file> <table-address> <family-count>"
            );
        }

        memory = currentProgram.getMemory();
        Address tableAddress = toAddr(Long.decode(arguments[1]));
        int familyCount = Integer.decode(arguments[2]);

        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            output.println("{");
            output.println("  \"format\": \"shenmue-controller-families-v1\",");
            output.println("  \"program\": \"" + currentProgram.getName() + "\",");
            output.println("  \"tableAddress\": " + quotedAddress(tableAddress) + ",");
            output.println("  \"familyCount\": " + familyCount + ",");
            output.println("  \"families\": [");

            for (int familyIndex = 0; familyIndex < familyCount; familyIndex++) {
                Address entryAddress = tableAddress.add(familyIndex * 12L);
                Address countAddress = pointerAt(entryAddress);
                Address descriptorAddress = pointerAt(entryAddress.add(4));
                Address auxiliaryAddress = pointerAt(entryAddress.add(8));
                int nodeCount = unsignedByte(countAddress);

                output.println("    {");
                output.println("      \"familyIndex\": " + familyIndex + ",");
                output.println("      \"entryAddress\": " + quotedAddress(entryAddress) + ",");
                output.println("      \"countAddress\": " + quotedAddress(countAddress) + ",");
                output.println("      \"descriptorAddress\": " + quotedAddress(descriptorAddress) + ",");
                output.println("      \"auxiliaryAddress\": " + quotedAddress(auxiliaryAddress) + ",");
                output.println("      \"nodeCount\": " + nodeCount + ",");
                output.println("      \"nodes\": [");

                for (int nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
                    Address nodeAddress = descriptorAddress.add(nodeIndex * 0x24L);
                    int childCount = unsignedByte(nodeAddress.add(5));
                    Address childAddress = pointerAt(nodeAddress.add(0x20));

                    output.println("        {");
                    output.println("          \"nodeIndex\": " + nodeIndex + ",");
                    output.println("          \"address\": " + quotedAddress(nodeAddress) + ",");
                    output.println("          \"raw\": \"" + rawHex(nodeAddress, 0x24) + "\",");
                    output.print("          \"headerBytes\": [");
                    for (int byteIndex = 0; byteIndex < 8; byteIndex++) {
                        if (byteIndex > 0) {
                            output.print(", ");
                        }
                        output.print(unsignedByte(nodeAddress.add(byteIndex)));
                    }
                    output.println("],");
                    output.println(
                        "          \"defaultPosition\": ["
                        + jsonFloat(floatAt(nodeAddress.add(8))) + ", "
                        + jsonFloat(floatAt(nodeAddress.add(0xc))) + ", "
                        + jsonFloat(floatAt(nodeAddress.add(0x10))) + "],"
                    );
                    output.println(
                        "          \"defaultRotationS16\": ["
                        + signedShort(nodeAddress.add(0x14)) + ", "
                        + signedShort(nodeAddress.add(0x18)) + ", "
                        + signedShort(nodeAddress.add(0x1c)) + "],"
                    );
                    output.println("          \"childCount\": " + childCount + ",");
                    output.println("          \"childIndexAddress\": " + quotedAddress(childAddress) + ",");
                    output.print("          \"childIndices\": [");
                    for (int childIndex = 0; childIndex < childCount; childIndex++) {
                        if (childIndex > 0) {
                            output.print(", ");
                        }
                        output.print(unsignedByte(childAddress.add(childIndex)));
                    }
                    output.println("]");
                    output.print("        }");
                    output.println(nodeIndex + 1 < nodeCount ? "," : "");
                }

                output.println("      ]");
                output.print("    }");
                output.println(familyIndex + 1 < familyCount ? "," : "");
            }

            output.println("  ]");
            output.println("}");
        }
    }
}
