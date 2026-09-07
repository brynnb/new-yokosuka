export class StuckMovementDetector {
    constructor(options = {}) {
        this.durationSeconds = options.durationSeconds ?? 1;
        this.minimumDistance = options.minimumDistance ?? 0.5;
        this.minimumVisibleSeconds = options.minimumVisibleSeconds ?? 0.5;
        this.reset();
    }

    reset() {
        this.origin = null;
        this.elapsedSeconds = 0;
        this.stuck = false;
        this.visibleSecondsRemaining = 0;
        return this.stuck;
    }

    resetMovementWindow() {
        this.origin = null;
        this.elapsedSeconds = 0;
        this.stuck = false;
    }

    update({
        moving,
        noClip,
        position,
        deltaSeconds,
    }) {
        const elapsed = Math.max(0, deltaSeconds || 0);
        this.visibleSecondsRemaining = Math.max(
            0,
            this.visibleSecondsRemaining - elapsed,
        );
        if (!moving || noClip || !position) {
            this.resetMovementWindow();
            return this.visibleSecondsRemaining > 0;
        }

        if (!this.origin) {
            this.origin = {
                x: position.x,
                z: position.z,
            };
            this.elapsedSeconds = 0;
            this.stuck = false;
            return this.stuck;
        }

        this.elapsedSeconds += elapsed;
        const distance = Math.hypot(
            position.x - this.origin.x,
            position.z - this.origin.z,
        );
        if (distance >= this.minimumDistance) {
            this.origin = {
                x: position.x,
                z: position.z,
            };
            this.elapsedSeconds = 0;
            this.stuck = false;
            return this.visibleSecondsRemaining > 0;
        }

        const wasStuck = this.stuck;
        this.stuck = this.elapsedSeconds >= this.durationSeconds;
        if (this.stuck && !wasStuck) {
            this.visibleSecondsRemaining = this.minimumVisibleSeconds;
        }
        return this.stuck || this.visibleSecondsRemaining > 0;
    }
}
