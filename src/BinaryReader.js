export class BinaryReader {
    constructor(buffer) {
        this.view = new DataView(buffer);
        this.offset = 0;
        this.size = buffer.byteLength;
        this.buffer = buffer;
    }

    canRead(len) {
        return this.offset + len <= this.size;
    }

    readUInt32() {
        if (!this.canRead(4)) {
            this.offset = this.size;
            return 0;
        }
        const val = this.view.getUint32(this.offset, true);
        this.offset += 4;
        return val;
    }

    readInt32() {
        if (!this.canRead(4)) {
            this.offset = this.size;
            return 0;
        }
        const val = this.view.getInt32(this.offset, true);
        this.offset += 4;
        return val;
    }

    readUInt16() {
        if (!this.canRead(2)) {
            this.offset = this.size;
            return 0;
        }
        const val = this.view.getUint16(this.offset, true);
        this.offset += 2;
        return val;
    }

    readUInt16At(pos) {
        if (pos + 2 > this.size) return 0;
        return this.view.getUint16(pos, true);
    }

    readUInt8() {
        if (!this.canRead(1)) {
            this.offset = this.size;
            return 0;
        }
        const val = this.view.getUint8(this.offset);
        this.offset += 1;
        return val;
    }

    readInt16() {
        if (!this.canRead(2)) {
            this.offset = this.size;
            return 0;
        }
        const val = this.view.getInt16(this.offset, true);
        this.offset += 2;
        return val;
    }

    readShort() { return this.readInt16(); }
    readUShort() { return this.readUInt16(); }

    readFloat32() {
        if (!this.canRead(4)) {
            this.offset = this.size;
            return 0;
        }
        const val = this.view.getFloat32(this.offset, true);
        this.offset += 4;
        return val;
    }

    readBytes(len) {
        const actualLen = Math.min(len, this.size - this.offset);
        if (actualLen <= 0) return new Uint8Array(0);
        const bytes = new Uint8Array(this.buffer, this.view.byteOffset + this.offset, actualLen);
        this.offset += actualLen;
        return bytes;
    }

    readString(len) {
        let str = "";
        for (let i = 0; i < len; i++) {
            if (!this.canRead(1)) break;
            const charCode = this.readUInt8();
            if (charCode === 0) {
                this.offset += (len - i - 1);
                break;
            }
            str += String.fromCharCode(charCode);
        }
        return str;
    }

    seek(pos) {
        this.offset = Math.max(0, Math.min(pos, this.size));
    }

    skip(len) {
        this.seek(this.offset + len);
    }

    tell() {
        return this.offset;
    }
}
