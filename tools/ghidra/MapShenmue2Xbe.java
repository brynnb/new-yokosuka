// Maps a raw-imported Shenmue II Default.xbe into its authored virtual sections.
// @category NewYokosuka

import java.nio.charset.StandardCharsets;
import java.util.List;

import ghidra.app.script.GhidraScript;
import ghidra.program.database.mem.FileBytes;
import ghidra.program.model.address.Address;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryBlock;

public class MapShenmue2Xbe extends GhidraScript {
    private long u32(Memory memory, Address base, long offset) throws Exception {
        byte[] bytes = new byte[4];
        memory.getBytes(base.add(offset), bytes);
        return Integer.toUnsignedLong(
            (bytes[0] & 0xff)
            | ((bytes[1] & 0xff) << 8)
            | ((bytes[2] & 0xff) << 16)
            | ((bytes[3] & 0xff) << 24)
        );
    }

    private String cString(Memory memory, Address address) throws Exception {
        byte[] bytes = new byte[64];
        int length = 0;
        while (length < bytes.length) {
            byte value = memory.getByte(address.add(length));
            if (value == 0) break;
            bytes[length++] = value;
        }
        return new String(bytes, 0, length, StandardCharsets.US_ASCII);
    }

    @Override
    protected void run() throws Exception {
        Memory memory = currentProgram.getMemory();
        List<FileBytes> fileBytesList = memory.getAllFileBytes();
        if (fileBytesList.isEmpty()) {
            throw new IllegalStateException("Raw XBE import has no FileBytes backing store");
        }
        FileBytes fileBytes = fileBytesList.get(0);
        MemoryBlock raw = memory.getBlocks()[0];
        Address rawBase = raw.getStart();

        byte[] signature = new byte[4];
        memory.getBytes(rawBase, signature);
        if (!"XBEH".equals(new String(signature, StandardCharsets.US_ASCII))) {
            throw new IllegalArgumentException("Input is not an XBE image");
        }

        long imageBase = u32(memory, rawBase, 0x104);
        long headerSize = u32(memory, rawBase, 0x108);
        long sectionCount = u32(memory, rawBase, 0x11c);
        long sectionTableAddress = u32(memory, rawBase, 0x120);
        long sectionTableOffset = sectionTableAddress - imageBase;

        record Section(
            String name,
            long flags,
            long virtualAddress,
            long virtualSize,
            long rawOffset,
            long rawSize
        ) {}
        Section[] sections = new Section[(int)sectionCount];
        for (int index = 0; index < sections.length; index++) {
            long entry = sectionTableOffset + index * 0x38L;
            long flags = u32(memory, rawBase, entry);
            long virtualAddress = u32(memory, rawBase, entry + 4);
            long virtualSize = u32(memory, rawBase, entry + 8);
            long rawOffset = u32(memory, rawBase, entry + 12);
            long rawSize = u32(memory, rawBase, entry + 16);
            long nameAddress = u32(memory, rawBase, entry + 20);
            String name = cString(memory, rawBase.add(nameAddress - imageBase));
            sections[index] = new Section(
                name, flags, virtualAddress, virtualSize, rawOffset, rawSize
            );
        }

        memory.removeBlock(raw, monitor);
        MemoryBlock headers = memory.createInitializedBlock(
            "XBE_HEADERS",
            toAddr(imageBase),
            fileBytes,
            0,
            headerSize,
            false
        );
        headers.setRead(true);
        headers.setWrite(false);
        headers.setExecute(false);

        for (int index = 0; index < sections.length; index++) {
            Section section = sections[index];
            if (section.rawSize() == 0) continue;
            String name = section.name().isBlank()
                ? "XBE_SECTION_" + index
                : section.name();
            MemoryBlock block = memory.createInitializedBlock(
                name,
                toAddr(section.virtualAddress()),
                fileBytes,
                section.rawOffset(),
                section.rawSize(),
                false
            );
            block.setRead(true);
            block.setWrite((section.flags() & 0x01) != 0);
            block.setExecute(
                name.equals(".text")
                || name.endsWith("_CODE")
                || name.equals("D3D")
                || name.equals("DSOUND")
                || name.equals("D3DX")
                || name.equals("XGRPH")
                || name.equals("XPP")
            );
            println(String.format(
                "%s VA=0x%x raw=0x%x size=0x%x flags=0x%x",
                name,
                section.virtualAddress(),
                section.rawOffset(),
                section.rawSize(),
                section.flags()
            ));
        }
    }
}
