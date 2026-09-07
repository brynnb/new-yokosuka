#!/usr/bin/env bash
set -euo pipefail

usage() {
    printf '%s\n' \
        'Usage: tools/emulator/run_shenmue2_animation_actor_capture.sh RAM.BIN CODE [CODE ...]' \
        '       tools/emulator/run_shenmue2_animation_actor_capture.sh RAM.BIN --missing-profiles' \
        '' \
        'Loads a copied Shenmue II save state in an isolated Flycast profile and waits' \
        'for exact native actor/controller bindings derived from RAM.BIN. The normal' \
        'interactive Flycast profile and process are not modified.' >&2
}

if (( $# < 2 )); then
    usage
    exit 2
fi

baseline_ram="$1"
shift
if [[ ! -f "${baseline_ram}" ]]; then
    echo "Baseline RAM does not exist: ${baseline_ram}" >&2
    exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
flycast_root="${FLYCAST_CAPTURE_ROOT:-$(dirname "${repo_root}")/flycast-pvr-capture}"
source_profile="${FLYCAST_S2_SOURCE_PROFILE:-${repo_root}/.flycast-pvr}"
validation_root="${FLYCAST_S2_ACTOR_VALIDATION_ROOT:-${source_profile}/actor-validation}"
disc_root="${FLYCAST_S2_DISC_IMAGE_ROOT:-${repo_root}/.disc-work/shenmue2-disc1-image}"
runtime_lib="${FLYCAST_S2_RUNTIME_LIB:-${repo_root}/.disc-work/flycast-runtime/local-lib}"
state_index="${FLYCAST_S2_ACTOR_STATE_INDEX:-1}"
host_timeout="${FLYCAST_S2_ACTOR_HOST_TIMEOUT:-3700}"
capture_count="${FLYCAST_S2_ACTOR_CAPTURE_COUNT:-12}"
capture_spacing="${FLYCAST_S2_ACTOR_CAPTURE_SPACING:-6}"
guest_timeout="${FLYCAST_S2_ACTOR_GUEST_TIMEOUT:-216000}"
survey_captures="${FLYCAST_S2_ACTOR_SURVEY_CAPTURES:-0}"
survey_spacing="${FLYCAST_S2_ACTOR_SURVEY_SPACING:-600}"
acquisition_task="${FLYCAST_S2_ACTOR_ACQUISITION_TASK:-}"

if ! [[ "${state_index}" =~ ^[0-9]+$ ]] \
    || ! [[ "${host_timeout}" =~ ^[1-9][0-9]*$ ]] \
    || ! [[ "${capture_count}" =~ ^[1-9][0-9]*$ ]] \
    || ! [[ "${capture_spacing}" =~ ^[1-9][0-9]*$ ]] \
    || ! [[ "${guest_timeout}" =~ ^[1-9][0-9]*$ ]] \
    || ! [[ "${survey_captures}" =~ ^[0-9]+$ ]] \
    || ! [[ "${survey_spacing}" =~ ^[1-9][0-9]*$ ]]; then
    echo "State index, timeouts, count, and spacing must be positive integers (state may be zero)" >&2
    exit 2
fi

flycast="${flycast_root}/build/flycast"
disc="${disc_root}/Shenmue II (Europe) (En,Fr,De,Es) (Disc 1).cue"
state_stem="Shenmue II (Europe) (En,Fr,De,Es) (Disc 1)"
source_state="${source_profile}/data/flycast/${state_stem}"
if (( state_index > 0 )); then
    source_state+="_${state_index}"
fi
source_state+=".state"

for required in "${flycast}" "${disc}" "${source_state}"; do
    if [[ ! -e "${required}" ]]; then
        echo "Required emulator input is missing: ${required}" >&2
        exit 1
    fi
done

config_home="${validation_root}/config"
data_home="${validation_root}/data"
control_root="${validation_root}/control"
log_root="${validation_root}/logs"
capture_root="${repo_root}/captures/pvr"
request_path="${control_root}/s2-animation-actor-capture.request"
frame_request_path="${control_root}/frame-capture.request"
memory_request_path="${control_root}/memory-write.request"
input_request_path="${control_root}/input-pulse.request"
log_path="${log_root}/flycast.log"
mkdir -p "${config_home}/flycast" "${data_home}/flycast" \
    "${control_root}" "${log_root}" "${capture_root}"

# Every file below is an isolated disposable copy. Refreshing it makes the
# selected source state explicit and prevents stale-state acquisition.
install -m 0644 "${source_profile}/config/flycast/emu.cfg" \
    "${config_home}/flycast/emu.cfg"
install -m 0644 "${repo_root}/tools/emulator/ryo_hallway_probe.lua" \
    "${config_home}/flycast/flycast.lua"
install -m 0644 "${source_state}" \
    "${data_home}/flycast/$(basename "${source_state}")"
for vmu in \
    "${source_profile}/data/flycast/MK-5118450_vmu_save_A1.bin" \
    "${source_profile}/data/flycast/vmu_save_A2.bin"; do
    if [[ -f "${vmu}" ]]; then
        install -m 0644 "${vmu}" "${data_home}/flycast/$(basename "${vmu}")"
    fi
done

rm -f "${request_path}" "${frame_request_path}" "${memory_request_path}" \
    "${input_request_path}" "${log_path}"
request_args=(
    "${baseline_ram}" "$@"
    --captures "${capture_count}"
    --spacing "${capture_spacing}"
    --timeout "${guest_timeout}"
)
if [[ -n "${acquisition_task}" ]]; then
    request_args+=(--acquisition-task "${acquisition_task}")
fi
request_args+=(--request "${request_path}")
node "${repo_root}/tools/emulator/request_shenmue2_animation_actor_capture.mjs" \
    "${request_args[@]}"
if (( survey_captures > 0 )); then
    printf 'captures %s\nspacing %s\n' \
        "${survey_captures}" "${survey_spacing}" > "${frame_request_path}"
fi

presentation=()
presentation_environment=()
if command -v xvfb-run >/dev/null 2>&1; then
    presentation=(xvfb-run -a -s "-screen 0 1280x960x24")
    video_driver=x11
elif [[ -n "${DISPLAY:-}" ]]; then
    video_driver="${FLYCAST_S2_VIDEO_DRIVER:-x11}"
    # GNOME's rootless Xwayland server does not normally export XAUTHORITY to
    # non-desktop shells. Locate the exact per-session cookie instead of
    # falling back to the unrelated ~/.Xauthority file. Without this, an
    # unattended capture aborts in SDL before Dreamcast execution starts.
    xauthority="${XAUTHORITY:-}"
    runtime_directory="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    if [[ -z "${xauthority}" && -d "${runtime_directory}" ]]; then
        xauthority="$(find "${runtime_directory}" -maxdepth 1 -type f \
            -name '.mutter-Xwaylandauth.*' -print -quit 2>/dev/null)"
    fi
    if [[ -n "${xauthority}" ]]; then
        presentation_environment+=(XAUTHORITY="${xauthority}")
    fi
else
    echo "xvfb-run or an existing DISPLAY is required" >&2
    exit 1
fi

echo "Launching isolated S2 actor capture from displayed slot $((state_index + 1))"
echo "  state SHA-256: $(sha256sum "${source_state}" | cut -d' ' -f1)"
echo "  log: ${log_path}"

set +e
timeout --signal=TERM --kill-after=10 "${host_timeout}" \
    "${presentation[@]}" env \
    "${presentation_environment[@]}" \
    SDL_VIDEODRIVER="${video_driver}" \
    SDL_AUDIODRIVER=dummy \
    LIBGL_ALWAYS_SOFTWARE=1 \
    LD_LIBRARY_PATH="${runtime_lib}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}" \
    XDG_CONFIG_HOME="${config_home}" \
    XDG_DATA_HOME="${data_home}" \
    FLYCAST_PVR_CAPTURE_DIR="${capture_root}" \
    FLYCAST_S2_ACTOR_CAPTURE_REQUEST="${request_path}" \
    FLYCAST_FRAME_CAPTURE_REQUEST="${frame_request_path}" \
    FLYCAST_MEMORY_WRITE_REQUEST="${memory_request_path}" \
    FLYCAST_INPUT_PULSE_REQUEST="${input_request_path}" \
    FLYCAST_EXIT_AFTER_S2_ACTOR_CAPTURE=1 \
    "${flycast}" -config \
    "config:pvr.rend=0,config:UseReios=yes,config:rend.Resolution=480,config:rend.ThreadedRendering=no,config:rend.DumpTextures=no,config:Dreamcast.AutoLoadState=yes,config:Dreamcast.AutoSaveState=no,config:Dreamcast.SavestateSlot=${state_index}" \
    "${disc}" >"${log_path}" 2>&1
status=$?
set -e

grep '\[S2_ACTOR_CAPTURE\]' "${log_path}" || true
if (( status == 124 )); then
    echo "Host timeout expired before the guest watcher exited" >&2
    exit 124
fi
if (( status != 0 )); then
    echo "Isolated Flycast exited with status ${status}; see ${log_path}" >&2
    exit "${status}"
fi
echo "Isolated S2 actor capture finished."
