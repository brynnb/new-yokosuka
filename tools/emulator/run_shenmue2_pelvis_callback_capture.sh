#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${FLYCAST_ROOT:?set FLYCAST_ROOT to the instrumented Flycast checkout}"
flycast_root="${FLYCAST_ROOT}"
source_profile="${FLYCAST_S2_SOURCE_PROFILE:-${repo_root}/.flycast-pvr}"
validation_root="${FLYCAST_S2_VALIDATION_ROOT:-${source_profile}/animation-validation}"
disc_image_root="${FLYCAST_S2_DISC_IMAGE_ROOT:-${repo_root}/.disc-work/shenmue2-disc1-image}"
runtime_lib="${FLYCAST_S2_RUNTIME_LIB:-${repo_root}/.disc-work/flycast-runtime/local-lib}"
state_index="${FLYCAST_S2_VALIDATION_STATE_INDEX:-1}"
gdb_port="${FLYCAST_S2_VALIDATION_GDB_PORT:-3264}"
capture_count="${FLYCAST_S2_VALIDATION_CAPTURE_COUNT:-32}"
capture_timeout="${FLYCAST_S2_VALIDATION_TIMEOUT:-180}"
callback_kind="${FLYCAST_S2_VALIDATION_CALLBACK_KIND:-pelvis}"
output="${FLYCAST_S2_VALIDATION_OUTPUT:-${repo_root}/.disc-work/shenmue2-${callback_kind}-callback-trace.json}"
entry_trace_output="${FLYCAST_S2_VALIDATION_ENTRY_TRACE_OUTPUT:-}"
entry_trace_limit="${FLYCAST_S2_VALIDATION_ENTRY_TRACE_LIMIT:-30}"
entry_trace_wait_seconds="${FLYCAST_S2_VALIDATION_ENTRY_TRACE_WAIT_SECONDS:-120}"
entry_trace_match_callback="${FLYCAST_S2_VALIDATION_ENTRY_TRACE_MATCH_CALLBACK:-0}"

if ! [[ "${state_index}" =~ ^[0-9]+$ ]]; then
    echo "FLYCAST_S2_VALIDATION_STATE_INDEX must be nonnegative" >&2
    exit 2
fi
if ! [[ "${gdb_port}" =~ ^[0-9]+$ ]] \
    || (( gdb_port < 1 || gdb_port > 65535 )); then
    echo "FLYCAST_S2_VALIDATION_GDB_PORT must be a TCP port" >&2
    exit 2
fi
if ! [[ "${capture_count}" =~ ^[1-9][0-9]*$ ]]; then
    echo "FLYCAST_S2_VALIDATION_CAPTURE_COUNT must be positive" >&2
    exit 2
fi
if [[ "${callback_kind}" != "pelvis" && "${callback_kind}" != "head" ]]; then
    echo "FLYCAST_S2_VALIDATION_CALLBACK_KIND must be pelvis or head" >&2
    exit 2
fi
if ! [[ "${entry_trace_limit}" =~ ^[1-9][0-9]*$ ]] \
    || ! [[ "${entry_trace_wait_seconds}" =~ ^[1-9][0-9]*$ ]]; then
    echo "S2 entry-trace limit and wait must be positive integers" >&2
    exit 2
fi

flycast="${flycast_root}/build/flycast"
disc="${disc_image_root}/Shenmue II (Europe) (En,Fr,De,Es) (Disc 1).cue"
state_stem="Shenmue II (Europe) (En,Fr,De,Es) (Disc 1)"
source_state="${source_profile}/data/flycast/${state_stem}"
if (( state_index > 0 )); then
    source_state+="_${state_index}"
fi
source_state+=".state"

for required in "${flycast}" "${disc}" "${source_state}" "${runtime_lib}"; do
    if [[ ! -e "${required}" ]]; then
        echo "Required emulator input is missing: ${required}" >&2
        exit 1
    fi
done
if [[ ! -x "${flycast}" ]]; then
    echo "Flycast is not executable: ${flycast}" >&2
    exit 1
fi
presentation=()
if command -v xvfb-run >/dev/null 2>&1; then
    presentation=(xvfb-run -a -s "-screen 0 1280x960x24")
    video_driver=x11
elif [[ -z "${DISPLAY:-}" ]]; then
    echo "xvfb-run or an existing DISPLAY is required" >&2
    exit 1
else
    echo "xvfb-run unavailable; using existing display ${DISPLAY}"
    if [[ -n "${FLYCAST_S2_VIDEO_DRIVER:-}" ]]; then
        video_driver="${FLYCAST_S2_VIDEO_DRIVER}"
    elif [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
        video_driver=wayland
    else
        video_driver=x11
    fi
fi

config_home="${validation_root}/config"
data_home="${validation_root}/data"
control_root="${validation_root}/control"
log_root="${validation_root}/logs"
mkdir -p \
    "${config_home}/flycast" \
    "${data_home}/flycast" \
    "${control_root}" \
    "${log_root}" \
    "$(dirname "${output}")"
if [[ -n "${entry_trace_output}" ]]; then
    mkdir -p "$(dirname "${entry_trace_output}")"
    rm -f "${entry_trace_output}"
fi

copy_immutable() {
    local source="$1"
    local destination="$2"
    if [[ -e "${destination}" ]]; then
        if ! cmp -s "${source}" "${destination}"; then
            echo "Refusing to overwrite differing isolated copy: ${destination}" >&2
            exit 1
        fi
        return
    fi
    install -m 0644 "${source}" "${destination}"
}

# Flycast rewrites its isolated config on clean exit. Refresh that disposable
# copy each run; only save-state and VMU evidence inputs are immutable.
install -m 0644 \
    "${source_profile}/config/flycast/emu.cfg" \
    "${config_home}/flycast/emu.cfg"
install -m 0644 \
    "${repo_root}/tools/emulator/flycast_s2_animation_validation_control.lua" \
    "${config_home}/flycast/flycast.lua"
copy_immutable \
    "${source_state}" \
    "${data_home}/flycast/$(basename "${source_state}")"
for vmu in \
    "${source_profile}/data/flycast/MK-5118450_vmu_save_A1.bin" \
    "${source_profile}/data/flycast/vmu_save_A2.bin"; do
    if [[ -f "${vmu}" ]]; then
        copy_immutable "${vmu}" "${data_home}/flycast/$(basename "${vmu}")"
    fi
done

control_request="${control_root}/control.request"
flycast_log="${log_root}/flycast.log"
rm -f "${control_request}"
flycast_pid=""

cleanup() {
    if [[ -n "${flycast_pid}" ]] && kill -0 "${flycast_pid}" 2>/dev/null; then
        printf 'exit\n' > "${control_request}"
        for _ in $(seq 1 50); do
            kill -0 "${flycast_pid}" 2>/dev/null || break
            sleep 0.1
        done
        if kill -0 "${flycast_pid}" 2>/dev/null; then
            kill "${flycast_pid}" 2>/dev/null || true
            for _ in $(seq 1 20); do
                kill -0 "${flycast_pid}" 2>/dev/null || break
                sleep 0.1
            done
        fi
        # A GDB-detached SH-4 may remain paused and never process SIGTERM.
        # This PID belongs to the isolated profile launched above, never the
        # user's interactive Flycast process.
        if kill -0 "${flycast_pid}" 2>/dev/null; then
            kill -KILL "${flycast_pid}" 2>/dev/null || true
        fi
        wait "${flycast_pid}" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

echo "Launching isolated S2 native callback capture:"
echo "  state index: ${state_index} (displayed slot $((state_index + 1)))"
echo "  state SHA-256: $(sha256sum "${source_state}" | cut -d' ' -f1)"
echo "  executable SHA-256: $(sha256sum "${flycast}" | cut -d' ' -f1)"
echo "  GDB port: ${gdb_port}"
echo "  output: ${output}"

debug_config="config:Debug.GDBEnabled=yes,config:Debug.GDBWaitForConnection=no,config:Debug.GDBPort=${gdb_port}"
trace_environment=()
if [[ -n "${entry_trace_output}" ]]; then
    debug_config="config:Debug.GDBEnabled=no"
    trace_environment=(
        FLYCAST_FORCE_INTERPRETER=1
        FLYCAST_SH4_ENTRY_TRACE_PC=0x0c1e0040
        FLYCAST_SH4_ENTRY_TRACE_PC2=0x0c1dff90
        FLYCAST_SH4_ENTRY_TRACE_PC3=0x0c1dfed0
        FLYCAST_SH4_ENTRY_TRACE_LIMIT="${entry_trace_limit}"
        FLYCAST_SH4_ENTRY_TRACE_OUTPUT="${entry_trace_output}"
    )
    echo "  interpreter axis trace: ${entry_trace_output}"
fi

"${presentation[@]}" \
    env \
    "${trace_environment[@]}" \
    SDL_VIDEODRIVER="${video_driver}" \
    SDL_AUDIODRIVER=dummy \
    LIBGL_ALWAYS_SOFTWARE=1 \
    LD_LIBRARY_PATH="${runtime_lib}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}" \
    XDG_CONFIG_HOME="${config_home}" \
    XDG_DATA_HOME="${data_home}" \
    FLYCAST_S2_ANIMATION_VALIDATION_REQUEST="${control_request}" \
    "${flycast}" \
    -config \
    "config:pvr.rend=0,config:UseReios=yes,config:rend.Resolution=480,config:rend.ThreadedRendering=no,config:rend.DumpTextures=no,${debug_config},config:Dreamcast.AutoLoadState=yes,config:Dreamcast.AutoSaveState=no,config:Dreamcast.SavestateSlot=${state_index},config:Dynarec.Enabled=no" \
    "${disc}" >"${flycast_log}" 2>&1 &
flycast_pid="$!"

if [[ -n "${entry_trace_output}" ]]; then
    trace_ready=no
    for _ in $(seq 1 $((entry_trace_wait_seconds * 10))); do
        if ! kill -0 "${flycast_pid}" 2>/dev/null; then
            echo "Isolated Flycast exited before completing the trace; see ${flycast_log}" >&2
            exit 1
        fi
        trace_lines=0
        if [[ -f "${entry_trace_output}" ]]; then
            trace_lines="$(wc -l < "${entry_trace_output}")"
        fi
        callback_rows=0
        if [[ "${entry_trace_match_callback}" == "1" \
            && -f "${entry_trace_output}" ]]; then
            callback_rows="$(awk -F, '
                $3 ~ /^(8c|0c)0e7f(ba|cc|de)$/ { count++ }
                END { print count + 0 }
            ' "${entry_trace_output}")"
        fi
        if [[ "${entry_trace_match_callback}" == "1" \
            && "${callback_rows}" -ge 3 ]]; then
            trace_ready=yes
            break
        elif [[ "${entry_trace_match_callback}" != "1" ]] \
            && (( trace_lines >= entry_trace_limit + 1 )); then
            trace_ready=yes
            break
        fi
        sleep 0.1
    done
    printf 'exit\n' > "${control_request}"
    wait "${flycast_pid}" || true
    flycast_pid=""
    if [[ "${trace_ready}" != "yes" ]]; then
        echo "Timed out waiting for native pelvis-axis rows" >&2
        exit 1
    fi
    echo "Native pelvis-axis entry trace written to ${entry_trace_output}"
    exit 0
fi

port_ready=no
port_hex="$(printf '%04X' "${gdb_port}")"
for _ in $(seq 1 300); do
    if ! kill -0 "${flycast_pid}" 2>/dev/null; then
        echo "Isolated Flycast exited before opening GDB; see ${flycast_log}" >&2
        exit 1
    fi
    if grep -Eqi ":${port_hex}[[:space:]].*[[:space:]]0A[[:space:]]" \
        /proc/net/tcp /proc/net/tcp6; then
        port_ready=yes
        break
    fi
    sleep 0.1
done
if [[ "${port_ready}" != "yes" ]]; then
    echo "Timed out waiting for Flycast GDB port ${gdb_port}" >&2
    exit 1
fi

controller_args=()
if [[ -n "${FLYCAST_S2_VALIDATION_CONTROLLER:-}" ]]; then
    controller_args+=(--controller "${FLYCAST_S2_VALIDATION_CONTROLLER}")
fi
cd "${repo_root}"
capture_module="tools.emulator.capture_shenmue2_${callback_kind}_callback"
python3 -m "${capture_module}" \
    --port "${gdb_port}" \
    --timeout "${capture_timeout}" \
    --count "${capture_count}" \
    --output "${output}" \
    --emulator "${flycast}" \
    --disc "${disc}" \
    --state "${source_state}" \
    --state-index "${state_index}" \
    --resolve-actors \
    "${controller_args[@]}"

printf 'exit\n' > "${control_request}"
cleanup
flycast_pid=""
echo "Native callback evidence written to ${output}"
