#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/../.." && pwd)"
build_root="${NEW_YOKOSUKA_DSF_BUILD_DIR:-${project_root}/.audio-tools/dsf-renderer}"
renderer="${build_root}/dsf-renderer"

highly_theoretical_commit="0e4c18c5b757b04dbcb68c572c5a4f6fd803283c"
psflib_commit="3bea757c8b45c5e68da1b5a7b736ad960a06a124"

mkdir -p "${build_root}"

clone_at_commit() {
  local repository="$1"
  local commit="$2"
  local destination="$3"
  if [[ ! -d "${destination}/.git" ]]; then
    git clone --filter=blob:none --no-checkout "${repository}" "${destination}"
  fi
  git -C "${destination}" fetch --depth 1 origin "${commit}"
  git -C "${destination}" checkout --detach "${commit}"
}

clone_at_commit \
  "https://gitlab.com/kode54/highly_theoretical.git" \
  "${highly_theoretical_commit}" \
  "${build_root}/highly-theoretical"
clone_at_commit \
  "https://gitlab.com/kode54/psflib.git" \
  "${psflib_commit}" \
  "${build_root}/psflib"

cc \
  -std=c11 \
  -O2 \
  -Wall \
  -Wextra \
  -Wno-unused-parameter \
  -Wno-unknown-pragmas \
  -Wno-sign-compare \
  -DEMU_COMPILE \
  -DEMU_LITTLE_ENDIAN \
  -DHAVE_STDINT_H \
  -DDISABLE_SSF \
  -I"${build_root}/highly-theoretical/Core" \
  -I"${build_root}/psflib" \
  "${script_dir}/dsf_renderer.c" \
  "${build_root}/highly-theoretical/Core/sega.c" \
  "${build_root}/highly-theoretical/Core/dcsound.c" \
  "${build_root}/highly-theoretical/Core/yam.c" \
  "${build_root}/highly-theoretical/Core/arm.c" \
  "${build_root}/psflib/psflib.c" \
  -lz \
  -o "${renderer}"

printf '%s\n' "${renderer}"
