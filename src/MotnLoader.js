const CHANNEL_BITS = [
    ["tx", 0x0100],
    ["ty", 0x0080],
    ["tz", 0x0040],
    ["rx", 0x0020],
    ["ry", 0x0010],
    ["rz", 0x0008],
];

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

    static parse(buffer) {
        return new MotnLoader(buffer).parse();
    }

    static sampleCurve(curve, frame) {
        if (!curve?.samples?.length) return 0;

        const samples = curve.samples;
        if (frame <= samples[0].frame) return samples[0].value || 0;
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
        return (prev.value || 0) + ((next.value || 0) - (prev.value || 0)) * t;
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

    parse() {
        const header = {
            sequenceTableOffset: this.readUInt32(0x00),
            sequenceNameTableOffset: this.readUInt32(0x04),
            sequenceDataOffset: this.readUInt32(0x08),
            attributes: this.readUInt32(0x0c),
            fileSize: this.readUInt32(0x10),
        };
        header.sequenceCount = header.attributes & 0x0fff;

        if (!this.hasStandardNamePointerTable(header)) {
            const error = new Error("Unsupported MOTN name table layout.");
            error.header = header;
            throw error;
        }

        const dataOffsets = [];
        for (let i = 0; i < header.sequenceCount; i++) {
            const tableEntryOffset = header.sequenceTableOffset + i * 8;
            dataOffsets.push(header.sequenceDataOffset + this.readUInt32(tableEntryOffset));
        }
        const uniqueDataOffsets = [...new Set(dataOffsets)]
            .filter((offset) => offset >= 0 && offset < this.byteLength)
            .sort((a, b) => a - b);

        const sequenceEndFor = (dataOffset) => {
            const next = uniqueDataOffsets.find((offset) => offset > dataOffset);
            return next || Math.min(header.fileSize || this.byteLength, this.byteLength);
        };

        const sequences = [];
        for (let i = 0; i < header.sequenceCount; i++) {
            sequences.push(this.parseSequence(header, i, sequenceEndFor(dataOffsets[i])));
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

    parseSequence(header, index, dataEnd) {
        const tableEntryOffset = header.sequenceTableOffset + index * 8;
        const dataRelativeOffset = this.readUInt32(tableEntryOffset);
        const extraRelativeOffset = this.readUInt32(tableEntryOffset + 4);
        const dataOffset = header.sequenceDataOffset + dataRelativeOffset;
        const extraDataOffset = header.sequenceDataOffset + extraRelativeOffset;
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
                keyFrames: [0, ...frames, durationFrames],
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
                    value: components.reduce((sum, value) => sum + value, 0),
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

        return {
            attributeBytesRead,
            attributeByteCount: attributeSpan.length,
            unusedAttributeBytes,
            valueHalfwordsRead: valueCursor,
            valueHalfwordCount,
            complete: valueCursor === valueHalfwordCount
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
