#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${FLYCAST_ROOT:?set FLYCAST_ROOT to the instrumented Flycast checkout}"
flycast_root="${FLYCAST_ROOT}"
flycast_bin="${FLYCAST_BIN:-${flycast_root}/build/flycast}"
disc_image="${SHENMUE_DISC1:-${repo_root}/.disc-work/disc1.gdi}"
profile_root="${FLYCAST_CAPTURE_PROFILE:-${repo_root}/.flycast-pvr/op02-cloth-capture-real}"
save_state="${OP02_SAVE_STATE:-${profile_root}/data/flycast/Shenmue (USA) (Disc 1)_3.state}"
game_executable="${SHENMUE_EXECUTABLE:-${repo_root}/extracted_files/data/1ST_READ.BIN}"
output="${OP02_CLOTH_OUTPUT:-${repo_root}/play/assets/introduction/op02/MGR_CLOTH_TRACK.bin}"
evidence="${OP02_CLOTH_EVIDENCE:-${repo_root}/tools/evidence/op02-mgr-cloth-track.json}"
instrumentation_patch="${repo_root}/tools/patches/flycast-op02-native-cloth-capture.patch"
flycast_source_commit="$(git -C "${flycast_root}" rev-parse HEAD)"

for required in "${flycast_bin}" "${disc_image}" "${save_state}" "${game_executable}" "${instrumentation_patch}"; do
  if [[ ! -f "${required}" ]]; then
    echo "required capture input is unavailable: ${required}" >&2
    exit 1
  fi
done

capture_dir="$(mktemp -d /var/tmp/new-yokosuka-cloth-capture.XXXXXX)"
capture_track="${capture_dir}/MGR_CLOTH_TRACK.bin"
launcher_pid=""
cleanup() {
  if [[ -n "${launcher_pid}" ]] && kill -0 "${launcher_pid}" 2>/dev/null; then
    kill -TERM -- "-${launcher_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

setsid xvfb-run -a -s "-screen 0 1280x960x24" env \
  SDL_VIDEODRIVER=x11 \
  SDL_AUDIODRIVER=dummy \
  LIBGL_ALWAYS_SOFTWARE=1 \
  FLYCAST_CLOTH_TRACK_OUTPUT="${capture_track}" \
  FLYCAST_CLOTH_TRACK_MODEL=0x2052474d \
  FLYCAST_CLOTH_TRACK_ROWS=8 \
  FLYCAST_CLOTH_TRACK_COLUMNS=20 \
  FLYCAST_CLOTH_TRACK_TERMINAL_SLOT=5 \
  FLYCAST_CLOTH_TRACK_TERMINAL_FRAME=57 \
  XDG_CONFIG_HOME="${profile_root}/config" \
  XDG_DATA_HOME="${profile_root}/data" \
  "${flycast_bin}" \
    -config config:pvr.rend=0,config:UseReios=yes,config:rend.Resolution=480,config:rend.ThreadedRendering=no,config:Debug.GDBEnabled=no,config:Dreamcast.AutoLoadState=yes,config:Dreamcast.AutoSaveState=no,config:Dreamcast.SavestateSlot=3,config:Dynarec.Enabled=yes \
    "${disc_image}" &
launcher_pid=$!

deadline=$((SECONDS + 180))
while [[ ! -f "${capture_track}.done" ]]; do
  if ! kill -0 "${launcher_pid}" 2>/dev/null; then
    echo "Flycast exited before completing the native cloth track" >&2
    exit 1
  fi
  if (( SECONDS >= deadline )); then
    echo "native cloth capture timed out" >&2
    exit 1
  fi
  sleep 1
done

cleanup
launcher_pid=""
cd "${repo_root}"
python3 -m tools.emulator.capture_shenmue1_cloth_track \
  --instrumented-track "${capture_track}" \
  --emulator-source-commit "${flycast_source_commit}" \
  --emulator-binary "${flycast_bin}" \
  --instrumentation-patch "${instrumentation_patch}" \
  --maximum-frames 2400 \
  --minimum-frames 300 \
  --model MGR \
  --terminal-slot 5 \
  --terminal-frame 57 \
  --executable "${game_executable}" \
  --save-state "${save_state}" \
  --output "${output}" \
  --metadata-output "${evidence}"

echo "captured OP02 native cloth track to ${output}"
