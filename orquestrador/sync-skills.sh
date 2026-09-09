#!/usr/bin/env bash
set -eo pipefail

# Orquestrador Maestro - Unix skill synchronizer
# Usage: bash ~/.orquestrador/sync-skills.sh [--check|--dry-run|--apply] [--home-path PATH]

MODE="check"
HOME_PATH="${HOME:-}"
ONLY_PROGRAMS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check)
      MODE="check"
      ;;
    --dry-run)
      MODE="dry-run"
      ;;
    --apply)
      MODE="apply"
      ;;
    --only)
      if [ "$#" -lt 2 ]; then
        echo "Error: --only requires a value." >&2
        exit 1
      fi
      IFS=',' read -r -a _only_parts <<< "$2"
      for _part in "${_only_parts[@]}"; do
        _part="$(printf '%s' "$_part" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        if [ -n "$_part" ]; then
          ONLY_PROGRAMS+=("$_part")
        fi
      done
      shift
      ;;
    --home-path)
      if [ "$#" -lt 2 ]; then
        echo "Error: --home-path requires a value." >&2
        exit 1
      fi
      HOME_PATH="$2"
      shift
      ;;
    --help|-h)
      sed -n '2,5p' "$0"
      exit 0
      ;;
    *)
      echo "Error: unknown parameter: $1" >&2
      exit 1
      ;;
  esac
  shift
done

should_sync_target() {
  local program="$1"
  if [ "${#ONLY_PROGRAMS[@]}" -eq 0 ]; then
    return 0
  fi
  for wanted in "${ONLY_PROGRAMS[@]}"; do
    if [ "$wanted" = "$program" ]; then
      return 0
    fi
  done
  return 1
}

if [ -z "$HOME_PATH" ]; then
  echo "Error: HOME is not set. Pass --home-path PATH." >&2
  exit 1
fi

mkdir -p "$HOME_PATH"
HOME_PATH="$(CDPATH= cd -- "$HOME_PATH" && pwd -P)"

resolve_home_relative() {
  local rel="$1"
  rel="${rel//\\//}"
  printf '%s/%s\n' "$HOME_PATH" "$rel"
}

POLICY_PATH="$HOME_PATH/.orquestrador/SKILL_INSTALL_POLICY.json"
COMMUNITY_LIBRARY="$(resolve_home_relative ".orquestrador/skill-library/community-skills")"
CODEX_LIBRARY="$(resolve_home_relative ".orquestrador/skill-library/codex-skills")"
DISABLED_NATIVE_ROOT="$(resolve_home_relative ".orquestrador/skill-library/disabled-native")"

TARGET_SPECS=(
  "codex|.codex/skills|64|.system,ask-claude,ask-gemini,autopilot,cancel,code-review,deep-interview,doctor,orquestrador-maestro,plan,ralplan,ralph,security-review,team,ultrawork,web-clone,worker"
  "opencode|.opencode/skills|48|orquestrador-maestro,code-review"
  "agents|.agents/skills|48|"
  "claude|.claude/skills|48|"
  "cursor|.cursor/skills|48|"
  "gemini|.gemini/skills|48|"
  "windsurf|.windsurf/skills|48|"
  "antigravity|.antigravity-skills/skills|48|"
)

if [ -f "$POLICY_PATH" ] && command -v node >/dev/null 2>&1; then
  PARSED_TARGET_SPECS=()
  while IFS= read -r entry; do
    case "$entry" in
      LIB\|*)
        value="${entry#LIB|}"
        if [ -z "${COMMUNITY_LIBRARY_SET:-}" ]; then
          COMMUNITY_LIBRARY="$(resolve_home_relative "$value")"
          COMMUNITY_LIBRARY_SET=true
        elif [ -z "${CODEX_LIBRARY_SET:-}" ]; then
          CODEX_LIBRARY="$(resolve_home_relative "$value")"
          CODEX_LIBRARY_SET=true
        else
          DISABLED_NATIVE_ROOT="$(resolve_home_relative "$value")"
        fi
        ;;
      TARGET\|*)
        PARSED_TARGET_SPECS+=("${entry#TARGET|}")
        ;;
    esac
  done < <(
    node -e '
      const fs = require("fs");
      const policy = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (policy.libraryRoots) {
        console.log("LIB|" + policy.libraryRoots.community);
        console.log("LIB|" + policy.libraryRoots.codex);
        console.log("LIB|" + policy.libraryRoots.disabledNative);
      }
      for (const [program, entry] of Object.entries(policy.nativeRoots || {})) {
        const allow = Array.isArray(entry.allowDirectories) ? entry.allowDirectories.join(",") : "";
        console.log(["TARGET", program, entry.path || "", String(entry.maxDirectories || 0), allow].join("|"));
      }
    ' "$POLICY_PATH"
  )
  if [ "${#PARSED_TARGET_SPECS[@]}" -gt 0 ]; then
    TARGET_SPECS=("${PARSED_TARGET_SPECS[@]}")
  fi
fi

CANONICAL_SOURCES=(
  "$HOME_PATH/.orquestrador/skills"
  "$HOME_PATH/.global-skills"
  "$COMMUNITY_LIBRARY"
  "$HOME_PATH/.codex/skills"
  "$CODEX_LIBRARY"
)

CODEX_MANAGED_SOURCES=(
  "$HOME_PATH/.codex/skills"
  "$CODEX_LIBRARY"
)

filter_existing_dirs_into() {
  local __resultvar="$1"
  shift
  local result=()
  local path
  for path in "$@"; do
    [ -d "$path" ] && result+=("$path")
  done
  eval "$__resultvar=(\"\${result[@]}\")"
}

filter_existing_dirs_into CANONICAL_SOURCES "${CANONICAL_SOURCES[@]}"
filter_existing_dirs_into CODEX_MANAGED_SOURCES "${CODEX_MANAGED_SOURCES[@]}"

MANIFEST="$HOME_PATH/.orquestrador/SKILLS_MANIFEST.json"
if [ -f "$MANIFEST" ] && command -v node >/dev/null 2>&1; then
  MUST_HAVE=()
  while IFS= read -r skill_name; do
    [ -n "$skill_name" ] && MUST_HAVE+=("$skill_name")
  done < <(node -e 'const fs=require("fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); for (const [name, entry] of Object.entries(manifest.skills || {}).sort()) { if (entry.mirrorEverywhere) console.log(name); }' "$MANIFEST")
else
  MUST_HAVE=(
    "skill-saas-factory"
    "skill-saas-admin-dashboard"
    "skill-abacatepay-integration"
    "skill-stripe-integration"
    "skill-saas-core-limits"
    "skill-supabase-rls"
    "skill-saas-security-scan"
    "skill-saas-dast-recon"
    "skill-security-hooks"
    "skill-ai-orchestration"
    "skill-multiagent-orchestration"
    "skill-aionui-cowork-orchestration"
    "skill-evolution-api"
    "skill-frontend-ux-guardrails"
    "skill-modern-ui-patterns"
    "skill-open-design-ui"
    "skill-live-processing"
    "skill-manual-video-processing"
    "skill-smart-clip-detection"
    "skill-unified-analytics"
    "skill-elevenlabs-voice-cloning"
    "skill-google-workspace-sync"
  )
fi

# Keep the shared default skill available to every routed client.
MUST_HAVE=("orquestrador-maestro" "${MUST_HAVE[@]}")

get_skill_source() {
  local name="$1"
  local root candidate
  for root in "${CANONICAL_SOURCES[@]}"; do
    candidate="$root/$name"
    if [ -f "$candidate/SKILL.md" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

get_dir_source() {
  local name="$1"
  local root candidate
  for root in "${CODEX_MANAGED_SOURCES[@]}"; do
    candidate="$root/$name"
    if [ -d "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

skill_different() {
  local src="$1"
  local dest="$2"
  if [ ! -d "$dest" ]; then
    return 0
  fi
  if diff -qr "$src" "$dest" >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

path_under_root() {
  local path="$1"
  local root="$2"
  local resolved_path resolved_root

  mkdir -p "$(dirname "$path")"
  resolved_path="$(CDPATH= cd -- "$(dirname "$path")" && pwd -P)/$(basename "$path")"
  resolved_root="$(CDPATH= cd -- "$root" && pwd -P)"

  case "$resolved_path" in
    "$resolved_root"|"$resolved_root"/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

copy_managed_dir() {
  local src="$1"
  local dest="$2"
  local target_root="$3"
  if [ -d "$dest" ]; then
    if ! path_under_root "$dest" "$target_root"; then
      echo "Refusing to remove destination outside target root: $dest" >&2
      return 1
    fi
    rm -rf "$dest"
  fi
  mkdir -p "$dest"
  cp -R "$src"/. "$dest"/
}

move_native_extra() {
  local src="$1"
  local target_root="$2"
  local disabled_root="$3"
  local program="$4"
  local stamp="$5"
  local leaf destination suffix

  if ! path_under_root "$src" "$target_root"; then
    echo "Refusing to move native skill outside target root: $src" >&2
    return 1
  fi

  mkdir -p "$disabled_root/$program/$stamp"
  leaf="$(basename "$src")"
  destination="$disabled_root/$program/$stamp/$leaf"
  suffix=1
  while [ -e "$destination" ]; do
    destination="$disabled_root/$program/$stamp/${leaf}-${suffix}"
    suffix=$((suffix + 1))
  done

  if ! path_under_root "$destination" "$disabled_root"; then
    echo "Refusing to move native skill outside disabled root: $destination" >&2
    return 1
  fi

  mv "$src" "$destination"
  printf '%s\n' "$destination"
}

is_allowed_item() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    [ "$needle" = "$item" ] && return 0
  done
  return 1
}

stamp="$(date +%Y%m%d-%H%M%S)"

printf 'Program\tType\tItem\tAction\tTarget\tDetail\n'

for entry in "${TARGET_SPECS[@]}"; do
  IFS='|' read -r program relative_root _max_dirs allow_csv <<EOF
$entry
EOF

  if ! should_sync_target "$program"; then
    continue
  fi

  target_root="$(resolve_home_relative "$relative_root")"
  target_exists=false
  [ -d "$target_root" ] && target_exists=true

  for skill in "${MUST_HAVE[@]}"; do
    src="$(get_skill_source "$skill" || true)"
    dest="$target_root/$skill"
    action="ok"

    if [ -z "$src" ]; then
      action="missing-source"
    elif [ "$target_exists" = false ]; then
      action="missing-target"
    elif [ ! -f "$dest/SKILL.md" ]; then
      action="copy"
    elif skill_different "$src" "$dest"; then
      action="update"
    fi

    if [ "$MODE" = "apply" ] && [ -n "$src" ] && [[ "$action" =~ ^(missing-target|copy|update)$ ]]; then
      mkdir -p "$target_root"
      copy_managed_dir "$src" "$dest" "$target_root"
      target_exists=true
      action="applied"
    fi

    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$program" "canonical" "$skill" "$action" "$target_root" ""
  done

  if [ -n "$allow_csv" ]; then
    IFS=',' read -r -a allow_items <<< "$allow_csv"
    for name in "${allow_items[@]}"; do
      [ -z "$name" ] && continue
      if [ "$program" = "codex" ]; then
        src="$(get_dir_source "$name" || true)"
      else
        src="$(get_skill_source "$name" || true)"
      fi
      dest="$target_root/$name"
      action="ok"

      if [ -z "$src" ]; then
        action="missing-source"
      elif [ "$target_exists" = false ]; then
        action="missing-target"
      elif [ ! -d "$dest" ]; then
        action="copy"
      elif skill_different "$src" "$dest"; then
        action="update"
      fi

      if [ "$MODE" = "apply" ] && [ -n "$src" ] && [[ "$action" =~ ^(missing-target|copy|update)$ ]]; then
        mkdir -p "$target_root"
        copy_managed_dir "$src" "$dest" "$target_root"
        target_exists=true
        action="applied"
      fi

      printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$program" "native-compatibility" "$name" "$action" "$target_root" ""
    done
  else
    allow_items=()
  fi

  if [ -d "$target_root" ]; then
    while IFS= read -r native_dir; do
      [ -z "$native_dir" ] && continue
      native_name="$(basename "$native_dir")"
      if is_allowed_item "$native_name" "${MUST_HAVE[@]}" "${allow_items[@]:-}"; then
        continue
      fi

      action="extra-native"
      detail=""
      if [ "$MODE" = "apply" ]; then
        detail="$(move_native_extra "$native_dir" "$target_root" "$DISABLED_NATIVE_ROOT" "$program" "$stamp")"
        action="offloaded"
      fi

      printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$program" "native-prune" "$native_name" "$action" "$target_root" "$detail"
    done < <(find "$target_root" -mindepth 1 -maxdepth 1 -type d | sort)
  fi
done
