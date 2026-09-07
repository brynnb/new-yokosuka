import * as BABYLON from "@babylonjs/core";

function assertAffineMatrix(matrix, label) {
    if (
        !Array.isArray(matrix)
        && !ArrayBuffer.isView(matrix)
    ) {
        throw new Error(`${label} must be an array-like matrix.`);
    }
    if (matrix.length !== 16) {
        throw new Error(`${label} must contain 16 values.`);
    }
}

export function interpolateAffineMatrix(start, end, amount) {
    assertAffineMatrix(start, "Start");
    assertAffineMatrix(end, "End");
    const gradient = Math.max(0, Math.min(1, amount));
    if (gradient === 0) return [...start];
    if (gradient === 1) return [...end];

    const interpolated = BABYLON.Matrix.DecomposeLerp(
        BABYLON.Matrix.FromArray(start),
        BABYLON.Matrix.FromArray(end),
        gradient,
    );
    return [...interpolated.asArray()];
}

export function interpolateMatrixRoutes(
    startPoseMatrices,
    endPoseMatrices,
    matrixRoutes,
    amount,
) {
    if (!Array.isArray(startPoseMatrices) || !Array.isArray(endPoseMatrices)) {
        throw new Error("Pose matrices must be arrays.");
    }
    return new Map([...matrixRoutes].map(([renderKey, matrixIndex]) => {
        const start = startPoseMatrices[matrixIndex];
        const end = endPoseMatrices[matrixIndex];
        if (!start || !end) {
            throw new Error(
                `Missing pose matrix ${matrixIndex} for render route ${renderKey}.`,
            );
        }
        return [
            renderKey,
            interpolateAffineMatrix(start, end, amount),
        ];
    }));
}

export function interpolateMatrixRouteMaps(startRoutes, endRoutes, amount) {
    if (!(startRoutes instanceof Map) || !(endRoutes instanceof Map)) {
        throw new Error("Matrix routes must be maps.");
    }
    return new Map([...endRoutes].map(([renderKey, end]) => {
        const start = startRoutes.get(renderKey);
        if (!start) {
            throw new Error(`Missing starting matrix for render route ${renderKey}.`);
        }
        return [renderKey, interpolateAffineMatrix(start, end, amount)];
    }));
}
