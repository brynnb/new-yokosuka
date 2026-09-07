import nativeMirroring from "./data/native-motion-mirroring.json" with { type: "json" };

const CHANNEL_BITS = [
    ["tx", 0x0100],
    ["ty", 0x0080],
    ["tz", 0x0040],
    ["rx", 0x0020],
    ["ry", 0x0010],
    ["rz", 0x0008],
];
const MOTION_FRAMES_PER_SECOND = 30;

function toArrayBufferView(input) {
    if (input instanceof ArrayBuffer) {
        return { buffer: input, byteOffset: 0, byteLength: input.byteLength };
    }

    if (ArrayBuffer.isView(input)) {
        return {
            buffer: input.buffer,
            byteOffset: input.byteOffset,
            byteLength: input.byteLength,
        };
    }

    throw new TypeError("MOTN input must be an ArrayBuffer or typed array view.");
}

function isPrintableAscii(value) {
    return value === 0 || value === 9 || value === 10 || value === 13 || (value >= 0x20 && value <= 0x7e);
}

export function decodeHalfFloat(value) {
    const sign = (value & 0x8000) ? -1 : 1;
    const exponent = (value >> 10) & 0x1f;
    const fraction = value & 0x03ff;

    if (exponent === 0) {
        return sign * Math.pow(2, -14) * (fraction / 0x400);
    }

    if (exponent === 0x1f) {
        return fraction ? Number.NaN : sign * Infinity;
    }

    return sign * Math.pow(2, exponent - 15) * (1 + fraction / 0x400);
}

export class MotnLoader {
    constructor(buffer) {
        const view = toArrayBufferView(buffer);
        this.buffer = view.buffer;
        this.byteOffset = view.byteOffset;
        this.byteLength = view.byteLength;
        this.view = new DataView(this.buffer, this.byteOffset, this.byteLength);
    }

    static parse(buffer, options = {}) {
        return new MotnLoader(buffer).parse(options);
    }

    static sampleCurve(curve, frame) {
        return MotnLoader.poseValue(
            curve,
            MotnLoader.sampleCurveRaw(curve, frame),
        );
    }

    static sampleCurveRaw(curve, frame) {
        if (!curve?.samples?.length) return 0;

        const samples = curve.samples;
        if (frame <= samples[0].frame) {
            return samples[0].value || 0;
        }
        if (frame >= samples[samples.length - 1].frame) {
            return samples[samples.length - 1].value || 0;
        }

        let prev = samples[0];
        let next = samples[samples.length - 1];
        for (let i = 0; i < samples.length - 1; i++) {
            if (frame >= samples[i].frame && frame <= samples[i + 1].frame) {
                prev = samples[i];
                next = samples[i + 1];
                break;
            }
        }

        const span = next.frame - prev.frame;
        if (span <= 0) return next.value || 0;
        const t = (frame - prev.frame) / span;
        const t2 = t * t;
        const t3 = t2 * t;
        const seconds = span / MOTION_FRAMES_PER_SECOND;
        return (
            (2 * t3 - 3 * t2 + 1) * (prev.value || 0) +
            (t3 - 2 * t2 + t) * (prev.outgoingTangent || 0) * seconds +
            (-2 * t3 + 3 * t2) * (next.value || 0) +
            (t3 - t2) * (next.incomingTangent || 0) * seconds
        );
    }

    static poseValue(curve, value) {
        if (!curve?.channel?.startsWith("r")) return value;
        // MOTN Euler rotations are stored in turns, like MT5 rotations:
        // 0.25 is 90 degrees. Return principal-angle radians to renderers.
        const principalTurns = value - Math.round(value);
        return principalTurns * Math.PI * 2;
    }

    static evaluateSequence(sequence, frame) {
        const pose = new Map();
        const curves = sequence?.valueData?.curves || [];

        for (const curve of curves) {
            if (!pose.has(curve.boneId)) {
                pose.set(curve.boneId, {
                    boneId: curve.boneId,
                    tx: 0,
                    ty: 0,
                    tz: 0,
                    rx: 0,
                    ry: 0,
                    rz: 0,
                });
            }
            pose.get(curve.boneId)[curve.channel] = MotnLoader.sampleCurve(curve, frame);
        }

        return pose;
    }

    static samplePoseChannel(sequence, frame, boneId, channel) {
        const curve = sequence?.valueData?.curves
            ?.find((candidate) => candidate.boneId === boneId && candidate.channel === channel);
        return curve ? MotnLoader.sampleCurve(curve, frame) : 0;
    }

    static wrappedFrameDelta(sequence, fromFrame, toFrame) {
        const duration = Math.max(0, sequence?.durationFrames || 0);
        if (duration <= 0) return 0;
        if (toFrame >= fromFrame) return toFrame - fromFrame;
        const from = ((fromFrame % duration) + duration) % duration;
        const to = ((toFrame % duration) + duration) % duration;
        return (duration - from) + to;
    }

    static rootMotionSummary(sequence, options = {}) {
        const boneId = options.boneId ?? 0;
        const channel = options.channel || "tz";
        const duration = Math.max(0, sequence?.durationFrames || 0);
        const start = MotnLoader.samplePoseChannel(sequence, 0, boneId, channel);
        const end = MotnLoader.samplePoseChannel(sequence, duration, boneId, channel);
        const displacement = end - start;

        return {
            boneId,
            channel,
            durationFrames: duration,
            start,
            end,
            displacement,
            distance: Math.abs(displacement),
            unitsPerSecond: duration > 0 ? Math.abs(displacement) * 30 / duration : 0,
        };
    }

    static rootMotionDelta(sequence, fromFrame, toFrame, options = {}) {
        const mode = options.mode || "cycle";
        const boneId = options.boneId ?? 0;
        const channel = options.channel || "tz";
        const duration = Math.max(0, sequence?.durationFrames || 0);
        if (duration <= 0) return 0;

        if (mode === "sampled") {
            const from = ((fromFrame % duration) + duration) % duration;
            const to = ((toFrame % duration) + duration) % duration;
            const start = MotnLoader.samplePoseChannel(sequence, 0, boneId, channel);
            const end = MotnLoader.samplePoseChannel(sequence, duration, boneId, channel);
            const fromValue = MotnLoader.samplePoseChannel(sequence, from, boneId, channel);
            const toValue = MotnLoader.samplePoseChannel(sequence, to, boneId, channel);
            return to >= from
                ? toValue - fromValue
                : (end - fromValue) + (toValue - start);
        }

        const summary = MotnLoader.rootMotionSummary(sequence, { boneId, channel });
        return summary.displacement * MotnLoader.wrappedFrameDelta(sequence, fromFrame, toFrame) / duration;
    }

    static evaluateSequenceMotionTracks(sequence, frame, options = {}) {
        const pose = new Map();
        const curves = sequence?.motionTrackData?.valueData?.curves || [];
        const includeRoot = options.includeRoot === true;

        for (const curve of curves) {
            if (curve.trackKind === "root" && !includeRoot) continue;
            if (curve.boneId === null || curve.boneId === undefined) continue;

            if (!pose.has(curve.boneId)) {
                pose.set(curve.boneId, {
                    boneId: curve.boneId,
                    tx: 0,
                    ty: 0,
                    tz: 0,
                    rx: 0,
                    ry: 0,
                    rz: 0,
                });
            }
            pose.get(curve.boneId)[curve.channel] = MotnLoader.sampleCurve(curve, frame);
        }

        return pose;
    }

    readUInt32(offset) {
        if (offset < 0 || offset + 4 > this.byteLength) return 0;
        return this.view.getUint32(offset, true);
    }

    readUInt16(offset) {
        if (offset < 0 || offset + 2 > this.byteLength) return 0;
        return this.view.getUint16(offset, true);
    }

    readInt16(offset) {
        if (offset < 0 || offset + 2 > this.byteLength) return 0;
        return this.view.getInt16(offset, true);
    }

    readByte(offset) {
        if (offset < 0 || offset >= this.byteLength) return 0;
        return this.view.getUint8(offset);
    }

    readBytes(offset, length) {
        const start = Math.max(0, offset);
        const end = Math.min(this.byteLength, start + Math.max(0, length));
        return Array.from(new Uint8Array(this.buffer, this.byteOffset + start, end - start));
    }

    readCString(offset, maxLength = 256) {
        if (offset < 0 || offset >= this.byteLength) return "";

        let end = offset;
        const limit = Math.min(this.byteLength, offset + maxLength);
        while (end < limit && this.readByte(end) !== 0) {
            end++;
        }

        let result = "";
        for (let i = offset; i < end; i++) {
            const value = this.readByte(i);
            result += isPrintableAscii(value) ? String.fromCharCode(value) : "";
        }
        return result;
    }

    parse(options = {}) {
        const header = {
            sequenceTableOffset: this.readUInt32(0x00),
            sequenceNameTableOffset: this.readUInt32(0x04),
            sequenceDataOffset: this.readUInt32(0x08),
            attributes: this.readUInt32(0x0c),
            fileSize: this.readUInt32(0x10),
        };
        // Most MOTN packages store a one-based sequence-table length in the
        // low byte. Some cutscene subsets OR package flags into that same
        // byte (DJHN_MOT uses 0x15/0x25 for four-entry packages), so the
        // distance from the name-pointer table to its first string is the
        // authoritative count whenever that layout is self-consistent.
        header.attributeSequenceCount = Math.max(
            0,
            (header.attributes & 0xff) - 1,
        );
        header.sequenceCount = this.inferSequenceCount(header);
        header.motionDataEnd = this.findBuildTimestampOffset(
            Math.min(header.fileSize || this.byteLength, this.byteLength),
        );

        if (!this.hasStandardNamePointerTable(header)) {
            const error = new Error("Unsupported MOTN name table layout.");
            error.header = header;
            throw error;
        }

        const dataOffsets = [];
        const actionMetadataOffsets = [];
        for (let i = 0; i < header.sequenceCount; i++) {
            const tableEntryOffset = header.sequenceTableOffset + i * 8;
            dataOffsets.push(header.sequenceDataOffset + this.readUInt32(tableEntryOffset));
            actionMetadataOffsets.push(this.readUInt32(tableEntryOffset + 4));
        }
        const uniqueDataOffsets = [...new Set(dataOffsets)]
            .filter((offset) => offset >= 0 && offset < this.byteLength)
            .sort((a, b) => a - b);
        const uniqueActionMetadataOffsets = [...new Set(actionMetadataOffsets)]
            .filter((offset) => (
                offset >= 0
                && offset < header.sequenceDataOffset
                && offset < this.byteLength
            ))
            .sort((a, b) => a - b);

        const sequenceEndFor = (dataOffset) => {
            const next = uniqueDataOffsets.find((offset) => offset > dataOffset);
            return next || header.motionDataEnd;
        };
        const actionMetadataEndFor = (metadataOffset) => {
            const next = uniqueActionMetadataOffsets.find(
                (offset) => offset > metadataOffset,
            );
            return next || Math.min(header.sequenceDataOffset, this.byteLength);
        };

        const requestedNames = options.sequenceNames
            ? new Set(options.sequenceNames)
            : null;
        const requestedIndices = options.sequenceIndices
            ? new Set(options.sequenceIndices)
            : null;
        const sequences = [];
        for (let i = 0; i < header.sequenceCount; i++) {
            if (
                (requestedNames || requestedIndices)
                && !requestedIndices?.has(i)
                && !requestedNames?.has(this.parseName(header, i).name)
            ) {
                continue;
            }
            sequences.push(
                this.parseSequence(
                    header,
                    i,
                    sequenceEndFor(dataOffsets[i]),
                    actionMetadataEndFor(actionMetadataOffsets[i]),
                ),
            );
        }

        return {
            format: "MOTN",
            header,
            sequences,
            findSequences(pattern) {
                const regex = pattern instanceof RegExp
                    ? pattern
                    : new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
                return sequences.filter((sequence) => regex.test(sequence.name));
            },
            getSequence(name) {
                return sequences.find((sequence) => sequence.name === name) || null;
            },
        };
    }

    findBuildTimestampOffset(limit) {
        // Dreamcast MOTN files end their motion payload with an ASCII compiler
        // timestamp (for example "Sat Sep 25 21:09:25 1999\n"). It is not
        // half-float curve data. Multi-sequence files usually provide a later
        // sequence boundary, while single-sequence files rely on this marker.
        const start = Math.max(0, limit - 128);
        let text = "";
        for (let offset = start; offset < limit; offset++) {
            const value = this.readByte(offset);
            text += value >= 0x20 && value <= 0x7e
                ? String.fromCharCode(value)
                : value === 0x0a
                    ? "\n"
                    : "\0";
        }
        const match = text.match(
            /(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) [A-Z][a-z]{2} {1,2}\d{1,2} \d{2}:\d{2}:\d{2} \d{4}\n/,
        );
        return match ? start + match.index : limit;
    }

    parseName(header, index) {
        const pointerOffset = header.sequenceNameTableOffset + index * 4;
        const rawPointer = this.readUInt32(pointerOffset);

        const absoluteName = rawPointer >= header.sequenceNameTableOffset
            ? this.readCString(rawPointer)
            : "";
        if (absoluteName) {
            return {
                name: absoluteName,
                nameOffset: rawPointer,
                namePointerMode: "absolute",
            };
        }

        const relativeOffset = header.sequenceNameTableOffset + rawPointer;
        return {
            name: this.readCString(relativeOffset),
            nameOffset: relativeOffset,
            namePointerMode: "relative",
        };
    }

    inferSequenceCount(header) {
        const fallback = header.attributeSequenceCount;
        if (
            header.sequenceNameTableOffset <= 0
            || header.sequenceNameTableOffset + 4 > this.byteLength
        ) {
            return fallback;
        }

        const firstPointer = this.readUInt32(header.sequenceNameTableOffset);
        const candidates = [];
        if (
            firstPointer > header.sequenceNameTableOffset
            && firstPointer < this.byteLength
            && (firstPointer - header.sequenceNameTableOffset) % 4 === 0
            && this.readCString(firstPointer, 96)
        ) {
            candidates.push({
                count: (firstPointer - header.sequenceNameTableOffset) / 4,
                mode: "absolute-name-table-span",
            });
        }
        const relativeOffset = header.sequenceNameTableOffset + firstPointer;
        if (
            firstPointer > 0
            && firstPointer % 4 === 0
            && relativeOffset < this.byteLength
            && this.readCString(relativeOffset, 96)
        ) {
            candidates.push({
                count: firstPointer / 4,
                mode: "relative-name-table-span",
            });
        }

        const inferred = candidates.find(
            ({ count }) => (
                count > 0
                && count <= 0x4000
                && header.sequenceTableOffset + count * 8
                    <= header.sequenceNameTableOffset
            ),
        );
        header.sequenceCountMode = inferred?.mode || "attributes-low-byte";
        return inferred?.count ?? fallback;
    }

    hasStandardNamePointerTable(header) {
        if (
            header.sequenceNameTableOffset <= 0 ||
            header.sequenceNameTableOffset + 4 > this.byteLength ||
            header.sequenceCount <= 0 ||
            header.sequenceCount > 0x4000
        ) {
            return false;
        }

        const firstPointer = this.readUInt32(header.sequenceNameTableOffset);
        const absoluteName = firstPointer >= 0 && firstPointer < this.byteLength
            ? this.readCString(firstPointer, 96)
            : "";
        if (absoluteName) return true;

        const relativeOffset = header.sequenceNameTableOffset + firstPointer;
        return relativeOffset >= 0
            && relativeOffset < this.byteLength
            && this.readCString(relativeOffset, 96).length > 0;
    }

    parseSequence(header, index, dataEnd, actionMetadataEnd) {
        const tableEntryOffset = header.sequenceTableOffset + index * 8;
        const dataRelativeOffset = this.readUInt32(tableEntryOffset);
        const extraRelativeOffset = this.readUInt32(tableEntryOffset + 4);
        const dataOffset = header.sequenceDataOffset + dataRelativeOffset;
        const extraDataOffset = header.sequenceDataOffset + extraRelativeOffset;
        // The second sequence-table word is also an absolute offset into the
        // MOTION action-metadata region. Most battle motions place an opcode
        // 0x02 phase-frame record after its 12-byte metadata header. Keep the
        // historical extraDataOffset field for compatibility while exposing
        // the source-backed interpretation separately.
        const actionMetadataOffset = extraRelativeOffset;
        const nameInfo = this.parseName(header, index);

        const sequence = {
            index,
            name: nameInfo.name,
            nameOffset: nameInfo.nameOffset,
            namePointerMode: nameInfo.namePointerMode,
            tableEntryOffset,
            dataRelativeOffset,
            extraRelativeOffset,
            dataOffset,
            extraDataOffset,
            actionMetadataOffset,
            actionMetadataEnd,
            dataEnd,
            rawDataLength: Math.max(0, dataEnd - dataOffset),
            valid: dataOffset >= 0 && dataOffset + 12 <= this.byteLength,
        };

        if (!sequence.valid) {
            return sequence;
        }

        sequence.flag = this.readUInt32(dataOffset);
        sequence.durationFrames = this.readUInt16(dataOffset);
        sequence.flagHigh = this.readUInt16(dataOffset + 0x02);
        sequence.actionMetadata = this.parseActionMetadata(
            actionMetadataOffset,
            actionMetadataEnd,
        );
        // The executable reads this halfword at motion metadata +0x02,
        // masks off bit 15, and uses the remaining value as an index into
        // the 21-entry controller-family table at 0x0c293ea4.
        sequence.controllerFamilyIndex = sequence.flagHigh & 0x7fff;
        sequence.controllerFamilyFlags = sequence.flagHigh & 0x8000;
        sequence.blockOffsets = {
            block1End: this.readUInt16(dataOffset + 0x04),
            block2End: this.readUInt16(dataOffset + 0x06),
            block3End: this.readUInt16(dataOffset + 0x08),
            block4End: this.readUInt16(dataOffset + 0x0a),
        };
        sequence.standardBlockLayout = this.hasStandardBlockLayout(sequence.blockOffsets, dataOffset, dataEnd);
        sequence.layoutWarnings = sequence.standardBlockLayout
            ? []
            : this.describeBlockLayoutWarnings(sequence.blockOffsets, dataOffset, dataEnd);

        if (this.hasLegacyFrame32Layout(sequence)) {
            sequence.layoutKind = "legacy-frame32";
            sequence.legacyFrameData = this.parseLegacyFrame32Data(sequence);
            sequence.blocks = {
                descriptor: { entries: [] },
                counts: [],
                frames: [],
                attributes: [],
                valueHalfwordsPreview: [],
            };
            sequence.blockSpans = null;
            sequence.channels = [];
            sequence.boneIds = [];
            sequence.channelCount = 0;
            sequence.frameData = null;
            sequence.valueData = null;
            sequence.motionTracks = [];
            sequence.motionBoneIds = [];
            sequence.motionTrackData = null;
            sequence.valuePreview = [];
            return sequence;
        }

        const blockSpans = this.getBlockSpans(dataOffset, dataEnd, sequence.blockOffsets);
        sequence.blocks = {
            descriptor: this.parseDescriptors(blockSpans.descriptor.start, blockSpans.descriptor.end),
            counts: this.readBytes(blockSpans.counts.start, blockSpans.counts.length),
            frames: this.readBytes(blockSpans.frames.start, blockSpans.frames.length),
            attributes: this.readBytes(blockSpans.attributes.start, blockSpans.attributes.length),
            valueHalfwordsPreview: this.parseValueHalfwords(blockSpans.values.start, blockSpans.values.end, 24),
        };
        sequence.blockSpans = blockSpans;
        sequence.channels = this.expandChannels(sequence.blocks.descriptor.entries, sequence.blocks.counts);
        sequence.boneIds = [...new Set(sequence.channels.map((channel) => channel.boneId))].sort((a, b) => a - b);
        sequence.channelCount = sequence.channels.length;
        sequence.frameData = this.parseFrameData(sequence.channels, blockSpans.counts, blockSpans.frames, sequence.durationFrames);
        sequence.valueData = this.parseValueData(sequence.frameData.groups, blockSpans.attributes, blockSpans.values);
        sequence.motionTracks = this.expandMotionTracks(sequence.blocks.descriptor.entries);
        sequence.motionBoneIds = [...new Set(sequence.motionTracks
            .filter((track) => track.trackKind === "motionBone")
            .map((track) => track.boneId))]
            .sort((a, b) => a - b);
        sequence.motionTrackData = {
            frameData: this.parseFrameData(sequence.motionTracks, blockSpans.counts, blockSpans.frames, sequence.durationFrames),
            valueData: null,
        };
        sequence.motionTrackData.valueData = this.parseValueData(sequence.motionTrackData.frameData.groups, blockSpans.attributes, blockSpans.values);
        sequence.valuePreview = sequence.blocks.valueHalfwordsPreview.map((raw) => ({
            raw,
            float: decodeHalfFloat(raw),
        }));

        return sequence;
    }

    parseActionMetadata(offset, end = this.byteLength) {
        const headerLength = 12;
        const recordOffset = offset + headerLength;
        if (
            offset < 0
            || recordOffset + 8 > this.byteLength
        ) {
            return null;
        }
        const headerBytes = this.readBytes(offset, headerLength);
        const opcode = this.readByte(recordOffset);
        const padding = this.readByte(recordOffset + 1);
        const directHitPhaseFrames = opcode === 0x02 && padding === 0
            ? [
                this.readUInt16(recordOffset + 2),
                this.readUInt16(recordOffset + 4),
                this.readUInt16(recordOffset + 6),
            ]
            : null;
        // Opcode 0x04 normally follows the eight-byte phase record. Its
        // first three payload bytes are copied to fighter +0x2ac..+0x2ae by
        // FUN_0c1ad670. The hit evaluator uses +0x2ac as an attack-class
        // table index, +0x2ad as a proficiency/scaling selector, and +0x2ae
        // as the authored base damage before its runtime multipliers.
        const attackRecordOffset = directHitPhaseFrames
            ? recordOffset + 8
            : recordOffset;
        const attackOpcode = this.readByte(attackRecordOffset);
        const directAttackParameters = (
            attackOpcode === 0x04
            && attackRecordOffset + 20 <= this.byteLength
        )
            ? {
                offset: attackRecordOffset,
                attackClassIndex: this.readByte(attackRecordOffset + 1),
                proficiencySelector: this.readByte(attackRecordOffset + 2),
                baseDamage: this.readByte(attackRecordOffset + 3),
                rawBytes: this.readBytes(attackRecordOffset, 20),
            }
            : null;
        // A small number of catalogue motions put setup/padding records ahead
        // of the same adjacent 0x02/0x04 pair. Preserve this separately from
        // the strict metadata+0x0c form so callers do not confuse a staged
        // stream with the 44 direct entries.
        let embeddedHitPhaseFrames = null;
        let embeddedAttackParameters = null;
        if (!directHitPhaseFrames) {
            for (
                let candidateOffset = recordOffset + 4;
                candidateOffset <= recordOffset + 52;
                candidateOffset += 4
            ) {
                if (
                    this.readByte(candidateOffset) !== 0x02
                    || this.readByte(candidateOffset + 1) !== 0
                    || this.readByte(candidateOffset + 8) !== 0x04
                    || candidateOffset + 28 > this.byteLength
                ) {
                    continue;
                }
                const candidateFrames = [
                    this.readUInt16(candidateOffset + 2),
                    this.readUInt16(candidateOffset + 4),
                    this.readUInt16(candidateOffset + 6),
                ];
                if (
                    candidateFrames[0] > candidateFrames[1]
                    || candidateFrames[1] > candidateFrames[2]
                ) {
                    continue;
                }
                embeddedHitPhaseFrames = candidateFrames;
                embeddedAttackParameters = {
                    offset: candidateOffset + 8,
                    attackClassIndex: this.readByte(candidateOffset + 9),
                    proficiencySelector: this.readByte(candidateOffset + 10),
                    baseDamage: this.readByte(candidateOffset + 11),
                    rawBytes: this.readBytes(candidateOffset + 8, 20),
                };
                break;
            }
        }
        return {
            offset,
            end,
            headerBytes,
            firstRecordOffset: recordOffset,
            firstOpcode: opcode,
            mirrorSetup: this.parseMotionMirrorSetup(recordOffset, end),
            directHitPhaseFrames,
            directAttackParameters,
            embeddedHitPhaseFrames,
            embeddedAttackParameters,
            soundCues: this.parseActionMetadataSoundCues(offset, end),
            surfaceSoundCues: this.parseActionMetadataSurfaceSoundCues(
                offset,
                end,
            ),
        };
    }

    parseMotionMirrorSetup(start, end) {
        // FUN_0c10c460 scans setup records by the native size table and stops
        // at 0/8. A byte search would mistake command payloads for opcode 0x13.
        let mirrored = false;
        const stop = Math.min(end, this.byteLength);
        for (let offset = start; offset < stop;) {
            const opcode = this.readByte(offset);
            if (opcode === 0 || opcode === 8) return { mirrored, complete: true };
            const size = nativeMirroring.setupRecordSizes[opcode];
            if (!size || offset + size > stop) {
                return { mirrored, complete: false, offset, opcode };
            }
            if (opcode === 0x13) mirrored = true;
            offset += size;
        }
        return { mirrored, complete: false, offset: stop };
    }

    parseActionMetadataSurfaceSoundCues(offset, end) {
        const cues = [];
        const scanStart = Math.max(0, offset + 12);
        const scanEnd = Math.min(this.byteLength, end);

        // Ryo's ordinary locomotion does not embed a DTPK command directly.
        // Instead, its 04 05 records select the native surface-sound handler:
        //
        //   uint16 frame
        //   uint8  operation (0x04)
        //   uint8  operation family (0x05)
        //   uint8  contact kind (0x00..0x07)
        //   uint8  reserved (0x00)
        //   uint8  reserved (0x00)
        //   uint8  enabled (0x01)
        //
        // 1ST_READ.BIN FUN_0c17bb14 resolves the collision material beneath
        // the actor, indexes the command table at 0x0c29c068, and adds a
        // native random variant to the table's AB03 base track.
        for (
            let recordOffset = scanStart;
            recordOffset + 8 <= scanEnd;
            recordOffset += 4
        ) {
            const contactKind = this.readByte(recordOffset + 4);
            if (
                this.readByte(recordOffset + 2) !== 0x04
                || this.readByte(recordOffset + 3) !== 0x05
                || contactKind > 0x07
                || this.readByte(recordOffset + 5) !== 0
                || this.readByte(recordOffset + 6) !== 0
                || this.readByte(recordOffset + 7) !== 1
            ) {
                continue;
            }
            cues.push({
                offset: recordOffset,
                frame: this.readUInt16(recordOffset),
                operation: 0x04,
                operationFamily: 0x05,
                contactKind,
                rawBytes: this.readBytes(recordOffset, 8),
            });
        }
        return cues;
    }

    parseActionMetadataSoundCues(offset, end) {
        const cues = [];
        const scanStart = Math.max(0, offset + 12);
        const scanEnd = Math.min(this.byteLength, end);

        // Native motion metadata stores authored sound events as:
        //   uint16 frame
        //   uint8  operation (0x04)
        //   uint8  operation family (0x05)
        //   uint8  DTPK command class (0xab)
        //   uint8  DTPK group/bank
        //   uint8  track
        //   uint8  command terminator (0x00)
        //
        // Records and metadata blocks are four-byte aligned. Restricting the
        // scan to the exact per-sequence metadata span prevents curve/sample
        // bytes in the later motion-data region from being misclassified.
        for (
            let recordOffset = scanStart;
            recordOffset + 8 <= scanEnd;
            recordOffset += 4
        ) {
            if (
                this.readByte(recordOffset + 2) !== 0x04
                || this.readByte(recordOffset + 3) !== 0x05
                || this.readByte(recordOffset + 4) !== 0xab
                || this.readByte(recordOffset + 7) !== 0x00
            ) {
                continue;
            }
            const group = this.readByte(recordOffset + 5);
            const track = this.readByte(recordOffset + 6);
            cues.push({
                offset: recordOffset,
                frame: this.readUInt16(recordOffset),
                operation: 0x04,
                operationFamily: 0x05,
                commandClass: 0xab,
                group,
                track,
                commandHex: `ab${group.toString(16).padStart(2, "0")}${
                    track.toString(16).padStart(2, "0")
                }00`,
                rawBytes: this.readBytes(recordOffset, 8),
            });
        }
        return cues;
    }

    hasLegacyFrame32Layout(sequence) {
        const offsets = sequence.blockOffsets;
        const frameCount = sequence.durationFrames || 0;
        const payloadLength = sequence.rawDataLength - 0x0e;
        return sequence.flagHigh === 0x8000
            && offsets.block1End === 0x20
            && offsets.block2End === 0
            && offsets.block3End === 0x8000
            && offsets.block4End === 0x15
            && frameCount > 0
            && payloadLength === frameCount * 32;
    }

    parseLegacyFrame32Data(sequence) {
        const frameCount = sequence.durationFrames || 0;
        const frameEntrySize = 32;
        const componentCount = 16;
        const dataStart = sequence.dataOffset + 0x0e;
        const dataEnd = Math.min(sequence.dataEnd, dataStart + frameCount * frameEntrySize);
        const componentRanges = Array.from({ length: componentCount }, (_, index) => ({
            index,
            min: Infinity,
            max: -Infinity,
        }));
        const previewIndexes = [...new Set([
            0,
            Math.floor(frameCount / 2),
            frameCount - 1,
        ])].filter((index) => index >= 0 && index < frameCount);
        const previewIndexSet = new Set(previewIndexes);
        const framesPreview = [];
        let repeatedPreviousFrameCount = 0;
        let previous = null;

        for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
            const frameOffset = dataStart + frameIndex * frameEntrySize;
            if (frameOffset + frameEntrySize > dataEnd) break;

            const components = [];
            for (let componentIndex = 0; componentIndex < componentCount; componentIndex++) {
                const value = this.readInt16(frameOffset + componentIndex * 2);
                components.push(value);
                componentRanges[componentIndex].min = Math.min(componentRanges[componentIndex].min, value);
                componentRanges[componentIndex].max = Math.max(componentRanges[componentIndex].max, value);
            }

            if (previous && previous.every((value, index) => value === components[index])) {
                repeatedPreviousFrameCount++;
            }
            previous = components;

            if (previewIndexSet.has(frameIndex)) {
                framesPreview.push({
                    frame: frameIndex,
                    components,
                });
            }
        }

        return {
            interpretation: "legacy-flag-0x8000-frame32",
            dataStart,
            dataEnd,
            frameCount,
            frameEntrySize,
            componentCount,
            payloadLength: Math.max(0, dataEnd - dataStart),
            repeatedPreviousFrameCount,
            componentRanges: componentRanges.map((range) => ({
                ...range,
                min: Number.isFinite(range.min) ? range.min : 0,
                max: Number.isFinite(range.max) ? range.max : 0,
            })),
            framesPreview,
        };
    }

    hasStandardBlockLayout(offsets, dataOffset, dataEnd) {
        return offsets.block1End >= 0x0c
            && offsets.block2End >= offsets.block1End
            && offsets.block3End >= offsets.block2End
            && offsets.block4End >= offsets.block3End
            && dataOffset + offsets.block4End <= dataEnd;
    }

    describeBlockLayoutWarnings(offsets, dataOffset, dataEnd) {
        const warnings = [];
        if (offsets.block1End < 0x0c) warnings.push("descriptor-end-before-header");
        if (offsets.block2End < offsets.block1End) warnings.push("counts-end-before-descriptor-end");
        if (offsets.block3End < offsets.block2End) warnings.push("frames-end-before-counts-end");
        if (offsets.block4End < offsets.block3End) warnings.push("attributes-end-before-frames-end");
        if (dataOffset + offsets.block4End > dataEnd) warnings.push("attributes-end-after-sequence-end");
        return warnings;
    }

    getBlockSpans(dataOffset, dataEnd, offsets) {
        const descriptorStart = dataOffset + 0x0c;
        const block1End = dataOffset + offsets.block1End;
        const block2End = dataOffset + offsets.block2End;
        const block3End = dataOffset + offsets.block3End;
        const block4End = dataOffset + offsets.block4End;

        return {
            descriptor: { start: descriptorStart, end: block1End, length: Math.max(0, block1End - descriptorStart) },
            counts: { start: block1End, end: block2End, length: Math.max(0, block2End - block1End) },
            frames: { start: block2End, end: block3End, length: Math.max(0, block3End - block2End) },
            attributes: { start: block3End, end: block4End, length: Math.max(0, block4End - block3End) },
            values: { start: block4End, end: dataEnd, length: Math.max(0, dataEnd - block4End) },
        };
    }

    parseDescriptors(start, end) {
        const entries = [];
        for (let offset = start; offset + 2 <= end; offset += 2) {
            const raw = this.readUInt16(offset);
            if (raw === 0) continue;

            const channels = CHANNEL_BITS
                .filter(([, bit]) => (raw & bit) !== 0)
                .map(([name]) => name);

            entries.push({
                raw,
                boneId: raw >> 9,
                candidateNodeId: raw >> 9,
                flags: raw & 0x01ff,
                channels,
                reserved: raw & 0x0007,
            });
        }

        return { entries };
    }

    readVariableUInts(start, end, entrySize, limit = Infinity) {
        const values = [];
        const step = entrySize === 2 ? 2 : 1;
        for (let offset = start; offset + step <= end && values.length < limit; offset += step) {
            values.push(step === 2 ? this.readUInt16(offset) : this.readByte(offset));
        }
        return values;
    }

    expandChannels(entries, countBytes) {
        const channels = [];
        let countIndex = 0;

        for (const entry of entries) {
            for (const channel of entry.channels) {
                channels.push({
                    boneId: entry.boneId,
                    channel,
                    dataPointHint: countBytes[countIndex] ?? null,
                });
                countIndex++;
            }
        }

        return channels;
    }

    expandMotionTracks(entries) {
        const tracks = [];
        const axes = ["rx", "ry", "rz"];

        for (let i = 0; i < 3; i++) {
            tracks.push({
                boneId: null,
                channel: axes[i],
                trackIndex: tracks.length,
                trackKind: "root",
                motionGroupIndex: 0,
                motionBoneRaw: null,
                candidateNodeId: null,
            });
        }

        entries.forEach((entry, entryIndex) => {
            for (let i = 0; i < 3; i++) {
                tracks.push({
                    boneId: entry.candidateNodeId,
                    channel: axes[i],
                    trackIndex: tracks.length,
                    trackKind: "motionBone",
                    motionGroupIndex: entryIndex + 1,
                    motionBoneRaw: entry.raw,
                    candidateNodeId: entry.candidateNodeId,
                    flags: entry.flags,
                });
            }
        });

        return tracks;
    }

    parseFrameData(channels, countSpan, frameSpan, durationFrames = 0) {
        const countEntrySize = countSpan.length >= channels.length * 2 ? 2 : 1;
        const counts = this.readVariableUInts(countSpan.start, countSpan.end, countEntrySize, channels.length);
        const frameCount = counts.reduce((sum, count) => sum + count, 0);
        const frameEntrySize = frameCount > 0 && frameSpan.length >= frameCount * 2 ? 2 : 1;
        const frameValues = this.readVariableUInts(frameSpan.start, frameSpan.end, frameEntrySize, frameCount);
        // The runtime stores a duration as a sample count. Its terminal
        // duplicate key is evaluated at the final sample index (N - 1), not
        // one frame beyond it at N. This is visible in the SH-4 sampler, which
        // decrements the duration before converting it to seconds.
        const terminalFrame = Math.max(0, durationFrames - 1);
        let frameCursor = 0;

        const groups = channels.map((channel, index) => {
            const count = counts[index] || 0;
            const frames = frameValues.slice(frameCursor, frameCursor + count);
            frameCursor += count;
            return {
                ...channel,
                boneId: channel.boneId,
                channel: channel.channel,
                count,
                frames,
                keyFrames: [0, ...frames, terminalFrame],
            };
        });

        return {
            countEntrySize,
            frameEntrySize,
            frameCount,
            groups,
        };
    }

    parseValueData(groups, attributeSpan, valueSpan) {
        const valueHalfwordCount = Math.floor(valueSpan.length / 2);
        const valueHalfwords = this.parseValueHalfwords(valueSpan.start, valueSpan.end);
        let attributeCursor = attributeSpan.start;
        let valueCursor = 0;

        const curves = groups.map((group) => {
            const flagByteCount = Math.max(1, Math.ceil(group.keyFrames.length / 4));
            const flagBytes = this.readBytes(attributeCursor, flagByteCount);
            attributeCursor += flagByteCount;

            const samples = group.keyFrames.map((frame, index) => {
                const flagByte = flagBytes[Math.floor(index / 4)] || 0;
                const bitIndex = 3 - (index % 4);
                const componentCount = (flagByte >> (bitIndex * 2)) & 0x03;
                const rawComponents = [];
                const components = [];

                for (let i = 0; i < componentCount && valueCursor < valueHalfwords.length; i++) {
                    const raw = valueHalfwords[valueCursor++];
                    rawComponents.push(raw);
                    components.push(decodeHalfFloat(raw));
                }

                return {
                    frame,
                    componentCount,
                    rawComponents,
                    components,
                    // The terminal half-float is the keyed pose value. With
                    // three components the first two are incoming/outgoing
                    // derivatives; with two, one derivative is shared.
                    interpolationComponents: components.slice(0, -1),
                    incomingTangent: componentCount >= 2 ? components[0] : 0,
                    outgoingTangent: componentCount === 3
                        ? components[1]
                        : (componentCount === 2 ? components[0] : 0),
                    value: components.at(-1) ?? 0,
                };
            });

            return {
                trackIndex: group.trackIndex,
                trackKind: group.trackKind,
                motionGroupIndex: group.motionGroupIndex,
                motionBoneRaw: group.motionBoneRaw,
                candidateNodeId: group.candidateNodeId,
                flags: group.flags,
                boneId: group.boneId,
                channel: group.channel,
                count: group.count,
                flagBytes,
                samples,
            };
        });

        const attributeBytesRead = Math.max(0, attributeCursor - attributeSpan.start);
        const unusedAttributeBytes = this.readBytes(
            attributeCursor,
            Math.max(0, attributeSpan.end - attributeCursor),
        );
        // Sequence payloads are four-byte aligned. Half-float curve values
        // can therefore be followed by exactly one zero halfword; anything
        // larger or nonzero remains unconsumed authored data and is not
        // considered complete.
        const unusedValueHalfwords = valueHalfwords.slice(valueCursor);

        return {
            attributeBytesRead,
            attributeByteCount: attributeSpan.length,
            unusedAttributeBytes,
            valueHalfwordsRead: valueCursor,
            valueHalfwordCount,
            unusedValueHalfwords,
            complete: unusedValueHalfwords.length <= 1
                && unusedValueHalfwords.every((value) => value === 0)
                && unusedAttributeBytes.every((value) => value === 0),
            curves,
        };
    }

    parseValueHalfwords(start, end, limit = Infinity) {
        const values = [];
        for (let offset = start; offset + 2 <= end && values.length < limit; offset += 2) {
            values.push(this.readUInt16(offset));
        }
        return values;
    }
}
