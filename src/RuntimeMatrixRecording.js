function hexFloat(word) {
    const bytes = new ArrayBuffer(4);
    const view = new DataView(bytes);
    view.setUint32(0, Number.parseInt(word, 16), false);
    return view.getFloat32(0, false);
}

// Recovered from Shenmue's 0x0C12D736 -> 0x0C1D1A42 render-matrix copy.
// Each pair is [signed low-16 MT5 render key, final control-matrix index].
export const RYO_YK_RENDER_MATRIX_ROUTES = Object.freeze([
    Object.freeze([-0x43, 22]),
    Object.freeze([-0x42, 30]),
    Object.freeze([-0x41, 36]),
    Object.freeze([0x01, 19]),
    Object.freeze([0x05, 33]),
    Object.freeze([0x06, 34]),
    Object.freeze([0x0a, 27]),
    Object.freeze([0x0b, 28]),
    Object.freeze([0x0e, 2]),
    Object.freeze([0x10, 6]),
    Object.freeze([0x11, 7]),
    Object.freeze([0x15, 13]),
    Object.freeze([0x16, 14]),
]);

export function parseRuntimeMatrixRecording(text) {
    const lines = text.trim().split(/\r?\n/);
    const metadata = Object.fromEntries(lines
        .filter((line) => line.startsWith("# "))
        .map((line) => {
            const separator = line.indexOf("=");
            return separator < 0
                ? [line.slice(2), true]
                : [line.slice(2, separator), line.slice(separator + 1)];
        }));
    const rows = lines.filter((line) => !line.startsWith("#"));
    if (rows.length < 2) throw new Error("Runtime matrix recording has no frames.");

    const header = rows.shift().split(",");
    const matrixColumns = header.length - 3;
    if (matrixColumns <= 0 || matrixColumns % 16 !== 0) {
        throw new Error(`Expected 16 values per matrix; found ${matrixColumns} matrix columns.`);
    }
    const matrixCount = matrixColumns / 16;
    const frames = rows.map((line, rowIndex) => {
        const values = line.split(",");
        if (values.length !== header.length) {
            throw new Error(
                `Runtime matrix row ${rowIndex + 1} has ${values.length} values; ` +
                `expected ${header.length}.`,
            );
        }
        const matrices = [];
        for (let matrixIndex = 0; matrixIndex < matrixCount; matrixIndex++) {
            const start = 3 + matrixIndex * 16;
            matrices.push(values.slice(start, start + 16).map(hexFloat));
        }
        return {
            frame: Number.parseInt(values[0], 10),
            phase: values[1],
            dpadButtons: Number.parseInt(values[2], 10),
            matrices,
        };
    });

    return { metadata, header, matrixCount, frames };
}

function controlBytes(words) {
    const bytes = new ArrayBuffer(words.length * 4);
    const view = new DataView(bytes);
    words.forEach((word, index) => {
        view.setUint32(index * 4, Number.parseInt(word, 16), true);
    });
    return view;
}

function decodeRuntimeControl(words, index) {
    const view = controlBytes(words);
    return {
        index,
        type: view.getUint8(0),
        solverClass: view.getUint8(1),
        solverSubtype: view.getUint8(2),
        rotationRaw: [
            view.getInt16(10, true),
            view.getInt16(12, true),
            view.getInt16(14, true),
        ],
        position: [
            view.getFloat32(16, true),
            view.getFloat32(20, true),
            view.getFloat32(24, true),
        ],
        translationCurveAddress: view.getUint32(28, true),
        rotationCurveAddress: view.getUint32(32, true),
        blendWeight: view.getFloat32(60, true),
        translationScale: view.getFloat32(64, true),
    };
}

export function parseRuntimeControlRecording(text) {
    const lines = text.trim().split(/\r?\n/);
    const metadata = Object.fromEntries(lines
        .filter((line) => line.startsWith("# "))
        .map((line) => {
            const separator = line.indexOf("=");
            return separator < 0
                ? [line.slice(2), true]
                : [line.slice(2, separator), line.slice(separator + 1)];
        }));
    const rows = lines.filter((line) => !line.startsWith("#"));
    if (rows.length < 2) throw new Error("Runtime control recording has no frames.");

    const header = rows.shift().split(",");
    const controlColumns = header.length - 3;
    if (controlColumns <= 0 || controlColumns % 18 !== 0) {
        throw new Error(`Expected 18 words per control; found ${controlColumns} control columns.`);
    }
    const controlCount = controlColumns / 18;
    const frames = rows.map((line, rowIndex) => {
        const values = line.split(",");
        if (values.length !== header.length) {
            throw new Error(
                `Runtime control row ${rowIndex + 1} has ${values.length} values; ` +
                `expected ${header.length}.`,
            );
        }
        const controls = [];
        for (let controlIndex = 0; controlIndex < controlCount; controlIndex++) {
            const start = 3 + controlIndex * 18;
            controls.push(decodeRuntimeControl(
                values.slice(start, start + 18),
                controlIndex,
            ));
        }
        return {
            frame: Number.parseInt(values[0], 10),
            phase: values[1],
            dpadButtons: Number.parseInt(values[2], 10),
            controls,
        };
    });

    return { metadata, header, controlCount, frames };
}
