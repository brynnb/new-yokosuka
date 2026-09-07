/*
 * Headless Dreamcast Sound Format renderer for New Yokosuka.
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This program is intentionally a small adapter around psflib and the
 * Highly Theoretical Sega sound core. It loads a DSF/minidsf dependency
 * chain, runs the original Dreamcast AICA program, and writes stereo
 * 16-bit PCM at the AICA's native 44.1 kHz output rate.
 *
 * Build instructions and pinned upstream sources live in
 * tools/audio-renderer/build.sh.
 */

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "psflib.h"
#include "sega.h"

#define SAMPLE_RATE 44100U
#define CHANNELS 2U
#define BITS_PER_SAMPLE 16U
#define BLOCK_SAMPLES 2048U
#define DREAMCAST_VERSION 2U
#define AICA_CYCLES_PER_SAMPLE 128

static void write_u16le(FILE *file, uint16_t value) {
    unsigned char bytes[2] = {
        (unsigned char)(value & 0xff),
        (unsigned char)((value >> 8) & 0xff),
    };
    fwrite(bytes, sizeof(bytes), 1, file);
}

static void write_u32le(FILE *file, uint32_t value) {
    unsigned char bytes[4] = {
        (unsigned char)(value & 0xff),
        (unsigned char)((value >> 8) & 0xff),
        (unsigned char)((value >> 16) & 0xff),
        (unsigned char)((value >> 24) & 0xff),
    };
    fwrite(bytes, sizeof(bytes), 1, file);
}

static int write_wav_header(FILE *file, uint32_t data_size) {
    const uint32_t byte_rate = (
        SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE / 8
    );
    const uint16_t block_align = CHANNELS * BITS_PER_SAMPLE / 8;

    if (fseek(file, 0, SEEK_SET) != 0) return -1;
    fwrite("RIFF", 4, 1, file);
    write_u32le(file, 36U + data_size);
    fwrite("WAVE", 4, 1, file);
    fwrite("fmt ", 4, 1, file);
    write_u32le(file, 16);
    write_u16le(file, 1);
    write_u16le(file, CHANNELS);
    write_u32le(file, SAMPLE_RATE);
    write_u32le(file, byte_rate);
    write_u16le(file, block_align);
    write_u16le(file, BITS_PER_SAMPLE);
    fwrite("data", 4, 1, file);
    write_u32le(file, data_size);
    return ferror(file) ? -1 : 0;
}

static void *stdio_open(void *context, const char *path) {
    (void)context;
    return fopen(path, "rb");
}

static size_t stdio_read(
    void *buffer,
    size_t size,
    size_t count,
    void *handle
) {
    return fread(buffer, size, count, (FILE *)handle);
}

static int stdio_seek(void *handle, int64_t offset, int origin) {
    return fseek((FILE *)handle, (long)offset, origin);
}

static int stdio_close(void *handle) {
    return fclose((FILE *)handle);
}

static long stdio_tell(void *handle) {
    return ftell((FILE *)handle);
}

static int upload_program(
    void *context,
    const uint8_t *program,
    size_t program_size,
    const uint8_t *reserved,
    size_t reserved_size
) {
    (void)reserved;
    (void)reserved_size;
    if (program_size > UINT32_MAX) return -1;
    return sega_upload_program(
        context,
        (void *)program,
        (uint32)program_size
    );
}

static int parse_duration(const char *text, double *seconds) {
    char *end = NULL;
    errno = 0;
    const double value = strtod(text, &end);
    if (
        errno != 0
        || end == text
        || *end != '\0'
        || value <= 0
        || value > 3600
    ) {
        return -1;
    }
    *seconds = value;
    return 0;
}

int main(int argc, char **argv) {
    if (argc != 4) {
        fprintf(
            stderr,
            "Usage: %s INPUT.dsf OUTPUT.wav SECONDS\n",
            argv[0]
        );
        return 2;
    }

    double duration_seconds = 0;
    if (parse_duration(argv[3], &duration_seconds) != 0) {
        fprintf(stderr, "Invalid render duration: %s\n", argv[3]);
        return 2;
    }
    const uint64_t target_samples = (
        (uint64_t)(duration_seconds * SAMPLE_RATE + 0.5)
    );
    const uint64_t target_bytes = (
        target_samples * CHANNELS * sizeof(int16_t)
    );
    if (target_bytes > UINT32_MAX) {
        fprintf(stderr, "WAV output would exceed the RIFF size limit.\n");
        return 2;
    }

    if (sega_init() != 0) {
        fprintf(stderr, "Highly Theoretical initialization failed.\n");
        return 1;
    }

    const uint32_t state_size = sega_get_state_size(DREAMCAST_VERSION);
    void *state = malloc(state_size);
    if (!state) {
        fprintf(stderr, "Could not allocate %u-byte AICA state.\n", state_size);
        return 1;
    }
    sega_clear_state(state, DREAMCAST_VERSION);

    const psf_file_callbacks callbacks = {
        .path_separators = "/\\",
        .context = NULL,
        .fopen = stdio_open,
        .fread = stdio_read,
        .fseek = stdio_seek,
        .fclose = stdio_close,
        .ftell = stdio_tell,
    };
    const int version = psf_load(
        argv[1],
        &callbacks,
        0x12,
        upload_program,
        state,
        NULL,
        NULL,
        0,
        NULL,
        NULL
    );
    if (version != 0x12) {
        fprintf(stderr, "Could not load Dreamcast DSF: %s\n", argv[1]);
        free(state);
        return 1;
    }

    FILE *output = fopen(argv[2], "wb+");
    if (!output) {
        fprintf(stderr, "Could not create WAV: %s\n", argv[2]);
        free(state);
        return 1;
    }
    if (write_wav_header(output, 0) != 0) {
        fprintf(stderr, "Could not write WAV header.\n");
        fclose(output);
        free(state);
        return 1;
    }

    int16_t buffer[BLOCK_SAMPLES * CHANNELS];
    uint64_t rendered_samples = 0;
    while (rendered_samples < target_samples) {
        uint32_t requested = BLOCK_SAMPLES;
        const uint64_t remaining = target_samples - rendered_samples;
        if (remaining < requested) requested = (uint32_t)remaining;
        uint32_t generated = requested;
        const int32_t executed = sega_execute(
            state,
            (int32_t)(requested * AICA_CYCLES_PER_SAMPLE),
            buffer,
            &generated
        );
        if (executed < 0 || generated == 0) {
            fprintf(
                stderr,
                "AICA execution stopped after %.3f seconds.\n",
                (double)rendered_samples / SAMPLE_RATE
            );
            fclose(output);
            free(state);
            return 1;
        }
        if (
            fwrite(
                buffer,
                sizeof(int16_t) * CHANNELS,
                generated,
                output
            ) != generated
        ) {
            fprintf(stderr, "Could not write PCM output.\n");
            fclose(output);
            free(state);
            return 1;
        }
        rendered_samples += generated;
    }

    const uint32_t data_size = (
        (uint32_t)(rendered_samples * CHANNELS * sizeof(int16_t))
    );
    if (write_wav_header(output, data_size) != 0 || fclose(output) != 0) {
        fprintf(stderr, "Could not finalize WAV output.\n");
        free(state);
        return 1;
    }
    free(state);

    fprintf(
        stdout,
        "Rendered %.3f seconds to %s\n",
        (double)rendered_samples / SAMPLE_RATE,
        argv[2]
    );
    return 0;
}
