#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_repo="${SHENMUE_SOURCE_REPO:-${repo_root}}"
: "${FLYCAST_ROOT:?set FLYCAST_ROOT to the instrumented Flycast checkout}"
flycast_root="${FLYCAST_ROOT}"
validation_root="${FLYCAST_VALIDATION_ROOT:-${repo_root}/.flycast-pvr/validation}"
disc="${FLYCAST_VALIDATION_DISC:-1}"
state_index="${FLYCAST_VALIDATION_STATE_INDEX:-8}"
gdb_port="${FLYCAST_VALIDATION_GDB_PORT:-3264}"
auto_load_state="${FLYCAST_VALIDATION_AUTO_LOAD_STATE:-yes}"
dynarec="${FLYCAST_VALIDATION_DYNAREC:-no}"
resolution="${FLYCAST_VALIDATION_RESOLUTION:-480}"
threaded_rendering="${FLYCAST_VALIDATION_THREADED_RENDERING:-no}"
skip_frames="${FLYCAST_VALIDATION_SKIP_FRAMES:-0}"

if [[ "${disc}" != "1" && "${disc}" != "2" && "${disc}" != "3" ]]; then
    echo "FLYCAST_VALIDATION_DISC must be 1, 2, or 3" >&2
    exit 2
fi
if ! [[ "${state_index}" =~ ^[0-9]+$ ]]; then
    echo "FLYCAST_VALIDATION_STATE_INDEX must be a nonnegative integer" >&2
    exit 2
fi
if ! [[ "${gdb_port}" =~ ^[0-9]+$ ]] \
    || (( gdb_port < 1 || gdb_port > 65535 )); then
    echo "FLYCAST_VALIDATION_GDB_PORT must be a TCP port" >&2
    exit 2
fi
if [[ "${auto_load_state}" != "yes" && "${auto_load_state}" != "no" ]]; then
    echo "FLYCAST_VALIDATION_AUTO_LOAD_STATE must be yes or no" >&2
    exit 2
fi
if [[ "${dynarec}" != "yes" && "${dynarec}" != "no" ]]; then
    echo "FLYCAST_VALIDATION_DYNAREC must be yes or no" >&2
    exit 2
fi
if ! [[ "${resolution}" =~ ^[1-9][0-9]*$ ]]; then
    echo "FLYCAST_VALIDATION_RESOLUTION must be a positive integer" >&2
    exit 2
fi
if [[ "${threaded_rendering}" != "yes" \
    && "${threaded_rendering}" != "no" ]]; then
    echo "FLYCAST_VALIDATION_THREADED_RENDERING must be yes or no" >&2
    exit 2
fi
if ! [[ "${skip_frames}" =~ ^[0-6]$ ]]; then
    echo "FLYCAST_VALIDATION_SKIP_FRAMES must be between 0 and 6" >&2
    exit 2
fi

flycast="${flycast_root}/build/flycast"
gdi="${source_repo}/.disc-work/disc${disc}.gdi"
source_profile="${source_repo}/.flycast-pvr"
source_state="${source_profile}/data/flycast/Shenmue (USA) (Disc ${disc})"
if (( state_index > 0 )); then
    source_state+="_${state_index}"
fi
source_state+=".state"

for required in "${flycast}" "${gdi}" "${source_state}"; do
    if [[ ! -e "${required}" ]]; then
        echo "Required emulator input is missing: ${required}" >&2
        exit 1
    fi
done
if [[ ! -x "${flycast}" ]]; then
    echo "Flycast is not executable: ${flycast}" >&2
    exit 1
fi
if ! command -v xvfb-run >/dev/null 2>&1; then
    echo "xvfb-run is required for isolated emulator presentation" >&2
    exit 1
fi

config_home="${validation_root}/config"
data_home="${validation_root}/data"
output_root="${validation_root}/output"
control_root="${validation_root}/control"
mkdir -p \
    "${config_home}/flycast" \
    "${data_home}/flycast" \
    "${output_root}" \
    "${control_root}"

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

copy_immutable \
    "${source_profile}/config/flycast/emu.cfg" \
    "${config_home}/flycast/emu.cfg"
install -m 0644 \
    "${repo_root}/tools/emulator/flycast_validation_control.lua" \
    "${config_home}/flycast/flycast.lua"
state_name="disc${disc}"
if (( state_index > 0 )); then
    state_name+="_${state_index}"
fi
copy_immutable "${source_state}" "${data_home}/flycast/${state_name}.state"

if [[ "${FLYCAST_VALIDATION_COPY_ALL_STATES:-no}" == "yes" ]]; then
    state_prefix="Shenmue (USA) (Disc ${disc})"
    for available_state in \
        "${source_profile}/data/flycast/${state_prefix}.state" \
        "${source_profile}/data/flycast/${state_prefix}"_*.state; do
        [[ -f "${available_state}" ]] || continue
        available_name="$(basename "${available_state}")"
        state_suffix="${available_name#"${state_prefix}"}"
        state_suffix="${state_suffix%.state}"
        if [[ -n "${state_suffix}" && ! "${state_suffix}" =~ ^_[0-9]+$ ]]; then
            echo "Unexpected save-state suffix: ${available_name}" >&2
            exit 1
        fi
        copy_immutable \
            "${available_state}" \
            "${data_home}/flycast/disc${disc}${state_suffix}.state"
    done
fi

for vmu in \
    "${source_profile}/data/flycast/MK-51059_vmu_save_A1.bin" \
    "${source_profile}/data/flycast/vmu_save_A2.bin"; do
    if [[ -f "${vmu}" ]]; then
        copy_immutable "${vmu}" "${data_home}/flycast/$(basename "${vmu}")"
    fi
done

echo "Launching isolated Flycast validation:"
echo "  disc: ${gdi}"
echo "  state index: ${state_index}"
echo "  auto-load state: ${auto_load_state}"
echo "  dynarec before debugger attachment: ${dynarec}"
echo "  render resolution: ${resolution}"
echo "  threaded rendering: ${threaded_rendering}"
echo "  skipped frames between renders: ${skip_frames}"
echo "  source state SHA-256: $(sha256sum "${source_state}" | cut -d' ' -f1)"
echo "  GDB port: ${gdb_port}"
echo "  profile: ${validation_root}"

exec xvfb-run -a -s "-screen 0 1280x960x24" \
    env \
    SDL_VIDEODRIVER=x11 \
    SDL_AUDIODRIVER=dummy \
    LIBGL_ALWAYS_SOFTWARE=1 \
    XDG_CONFIG_HOME="${config_home}" \
    XDG_DATA_HOME="${data_home}" \
    FLYCAST_VALIDATION_INPUT_REQUEST="${control_root}/input.request" \
    "${flycast}" \
    -config \
    "config:pvr.rend=0,config:ta.skip=${skip_frames},config:UseReios=yes,config:rend.Resolution=${resolution},config:rend.ThreadedRendering=${threaded_rendering},config:rend.DumpTextures=no,config:Debug.GDBEnabled=yes,config:Debug.GDBWaitForConnection=no,config:Debug.GDBPort=${gdb_port},config:Dreamcast.AutoLoadState=${auto_load_state},config:Dreamcast.AutoSaveState=no,config:Dreamcast.SavestateSlot=${state_index},config:Dynarec.Enabled=${dynarec}" \
    "${gdi}"
