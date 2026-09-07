#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: frontend-release.sh <stage|activate|rollback|prune> APP_DIR RELEASE_ID [KEEP]" >&2
  exit 2
}

[[ $# -ge 3 ]] || usage

operation=$1
app_dir=${2%/}
release_id=$3
release_root="$app_dir/releases"
release_dir="$release_root/$release_id"

if [[ "$app_dir" != /* || "$app_dir" == "/" ]]; then
  echo "refusing unsafe application directory: $app_dir" >&2
  exit 2
fi
if [[ ! "$release_id" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "invalid release id: $release_id" >&2
  exit 2
fi

retain_previous_assets() {
  local staging_dir=$1 prior relative live_target previous_target="" asset_directory
  # Record only this build's files, before linking older assets. Copying each
  # prior directory wholesale would accumulate every past build indefinitely.
  live_target=$(readlink -f "$app_dir/dist" 2>/dev/null || true)
  if [[ -f "$app_dir/.previous-frontend-release" ]]; then
    previous_target=$(<"$app_dir/.previous-frontend-release")
  fi
  # Public media URLs also belong to already-open clients. Retain them under
  # the same bounded two-release policy while newer clients use pinned R2 URLs.
  for asset_directory in assets audio music; do
    mkdir -p "$staging_dir/$asset_directory"
    find "$staging_dir/$asset_directory" -type f -printf '%P\0' | sort -z > "$staging_dir/.native-$asset_directory"
    for prior in "$live_target" "$previous_target"; do
      [[ -n "$prior" && -d "$prior/$asset_directory" ]] || continue
      [[ "$prior" == "$release_root/"* || "$prior" == "$app_dir/dist" ]] || {
        echo "refusing previous assets outside application releases: $prior" >&2
        exit 1
      }
      if [[ ! -f "$prior/.native-$asset_directory" ]]; then
        # Bootstrap releases made before build-native manifests existed.
        find "$prior/$asset_directory" -type f -printf '%P\0' | sort -z > "$prior/.native-$asset_directory"
      fi
      while IFS= read -r -d '' relative; do
        [[ "$relative" != /* && "/$relative/" != *"/../"* ]] || exit 1
        [[ -f "$prior/$asset_directory/$relative" ]] || { echo "missing retained asset: $relative" >&2; exit 1; }
        [[ ! -e "$staging_dir/$asset_directory/$relative" ]] || continue
        mkdir -p "$(dirname "$staging_dir/$asset_directory/$relative")"
        # Releases share a filesystem. Hard links keep old URLs alive without
        # duplicating large assets, even when an expired release dir is pruned.
        ln "$prior/$asset_directory/$relative" "$staging_dir/$asset_directory/$relative"
      done < "$prior/.native-$asset_directory"
    done
  done
}

stage_release() {
  local staging_dir="$release_root/.staging-$release_id"

  mkdir -p "$release_root"
  if [[ -e "$release_dir" ]]; then
    echo "release already staged: $release_dir"
    return
  fi

  rm -rf -- "$staging_dir"
  mkdir -p "$staging_dir"
  trap 'rm -rf -- "$staging_dir"' EXIT
  tar xzf - -C "$staging_dir"
  retain_previous_assets "$staging_dir"
  mkdir -p "$staging_dir/motion"
  cp \
    "$app_dir/assets/MOTION.BIN" \
    "$app_dir/assets/M_FGT1.BIN" \
    "$staging_dir/motion/"
  mv "$staging_dir" "$release_dir"
  trap - EXIT
}

activate_release() {
  local live_link="$app_dir/dist"
  local next_link="$app_dir/.dist-next"
  local previous_marker="$app_dir/.previous-frontend-release"
  local previous_target=""

  [[ -d "$release_dir" ]] || {
    echo "release is not staged: $release_dir" >&2
    exit 1
  }

  mkdir -p "$release_root"
  if [[ -d "$live_link" && ! -L "$live_link" ]]; then
    local legacy_dir="$release_root/legacy-before-$release_id"
    [[ ! -e "$legacy_dir" ]] || {
      echo "legacy release path already exists: $legacy_dir" >&2
      exit 1
    }
    mv "$live_link" "$legacy_dir"
    previous_target="$legacy_dir"
  elif [[ -L "$live_link" ]]; then
    previous_target=$(readlink -f "$live_link")
  elif [[ -e "$live_link" && ! -L "$live_link" ]]; then
    echo "live frontend path is neither a directory nor a symlink: $live_link" >&2
    exit 1
  fi

  if [[ -n "$previous_target" ]]; then
    printf '%s\n' "$previous_target" > "$previous_marker.next"
    mv -Tf "$previous_marker.next" "$previous_marker"
  fi

  rm -f -- "$next_link"
  ln -s "$release_dir" "$next_link"
  mv -Tf "$next_link" "$live_link"
}

rollback_release() {
  local live_link="$app_dir/dist"
  local next_link="$app_dir/.dist-next"
  local previous_marker="$app_dir/.previous-frontend-release"
  local previous_target

  [[ -f "$previous_marker" ]] || {
    echo "no previous frontend release was recorded" >&2
    exit 1
  }
  previous_target=$(<"$previous_marker")
  if [[ "$previous_target" != "$release_root/"* || ! -d "$previous_target" ]]; then
    echo "invalid previous frontend release: $previous_target" >&2
    exit 1
  fi

  rm -f -- "$next_link"
  ln -s "$previous_target" "$next_link"
  mv -Tf "$next_link" "$live_link"
}

prune_releases() {
  local keep=${4:-3}
  local live_target
  local -a releases

  [[ "$keep" =~ ^[1-9][0-9]*$ ]] || {
    echo "invalid release retention count: $keep" >&2
    exit 2
  }
  live_target=$(readlink -f "$app_dir/dist")
  mapfile -t releases < <(
    find "$release_root" -mindepth 1 -maxdepth 1 -type d \
      ! -name '.staging-*' -printf '%T@ %p\n' \
      | sort -nr \
      | cut -d' ' -f2-
  )

  local retained=0
  local candidate
  for candidate in "${releases[@]}"; do
    [[ "$candidate" == "$release_root/"* ]] || {
      echo "refusing release outside retention root: $candidate" >&2
      exit 1
    }
    if [[ "$(readlink -f "$candidate")" == "$live_target" ]]; then
      continue
    fi
    retained=$((retained + 1))
    if (( retained >= keep )); then
      rm -rf -- "$candidate"
    fi
  done
}

case "$operation" in
  stage) stage_release ;;
  activate) activate_release ;;
  rollback) rollback_release ;;
  prune) prune_releases "$@" ;;
  *) usage ;;
esac
