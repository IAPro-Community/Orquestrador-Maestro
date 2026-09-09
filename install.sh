#!/usr/bin/env bash
set -eo pipefail

# Orquestrador Maestro - Unix installer wrapper
# Usage: bash install.sh [--home-path PATH] [--no-force] [--no-tool-profiles] [--core-only] [--skip-community-skills] [--skip-skill-sync] [--only ID] [--dry-run] [--list-targets] [--uninstall] [--all-targets] [--non-interactive]

HOME_PATH="${HOME:-}"
FORCE=true
TOOL_PROFILES=true
CORE_ONLY=false
SKIP_COMMUNITY_SKILLS=false
SKIP_SKILL_SYNC=false
ONLY=()
DRY_RUN=false
LIST_TARGETS=false
UNINSTALL=false
NON_INTERACTIVE=false
ALL_TARGETS=false
VERBOSE_PATHS=false

if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ -z "${ORQUESTRADOR_ALLOW_ROOT_INSTALL:-}" ]; then
  echo "Error: installer was run as root via sudo." >&2
  echo "Run it again as the normal user, without sudo:" >&2
  echo "  orquestrador-maestro install" >&2
  exit 1
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --home-path)
      if [ "$#" -lt 2 ]; then
        echo "Error: --home-path requires a value." >&2
        exit 1
      fi
      HOME_PATH="$2"
      shift
      ;;
    --no-force)
      FORCE=false
      ;;
    --no-tool-profiles)
      TOOL_PROFILES=false
      ;;
    --core-only)
      CORE_ONLY=true
      ;;
    --skip-community-skills)
      SKIP_COMMUNITY_SKILLS=true
      ;;
    --skip-skill-sync)
      SKIP_SKILL_SYNC=true
      ;;
    --only)
      if [ "$#" -lt 2 ]; then
        echo "Error: --only requires a value." >&2
        exit 1
      fi
      ONLY+=("$2")
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --list-targets)
      LIST_TARGETS=true
      ;;
    --uninstall)
      UNINSTALL=true
      ;;
    --non-interactive)
      NON_INTERACTIVE=true
      ;;
    --all-targets)
      ALL_TARGETS=true
      ;;
    --verbose-paths)
      VERBOSE_PATHS=true
      ;;
    --help|-h)
      sed -n '2,4p' "$0"
      exit 0
      ;;
    *)
      echo "Error: unknown parameter: $1" >&2
      exit 1
      ;;
  esac
  shift
done

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ENGINE="$SCRIPT_DIR/scripts/install.sh"

if [ ! -f "$ENGINE" ]; then
  echo "Error: missing installer engine: $ENGINE" >&2
  exit 1
fi

ARGS=(--home-path "$HOME_PATH")

if [ "$FORCE" = true ]; then
  ARGS+=(--force)
fi
if [ "$TOOL_PROFILES" = true ] && [ "$CORE_ONLY" = false ]; then
  ARGS+=(--install-tool-profiles)
fi
if [ "$CORE_ONLY" = true ]; then
  ARGS+=(--skip-extra-skills)
fi
if [ "$SKIP_COMMUNITY_SKILLS" = true ]; then
  ARGS+=(--skip-community-skills)
fi
if [ "$SKIP_SKILL_SYNC" = true ]; then
  ARGS+=(--skip-skill-sync)
fi
for component in "${ONLY[@]}"; do
  ARGS+=(--only "$component")
done
if [ "$DRY_RUN" = true ]; then
  ARGS+=(--dry-run)
fi
if [ "$LIST_TARGETS" = true ]; then
  ARGS+=(--list-targets)
fi
if [ "$UNINSTALL" = true ]; then
  ARGS+=(--uninstall)
fi
if [ "$NON_INTERACTIVE" = true ]; then
  ARGS+=(--non-interactive)
fi
if [ "$ALL_TARGETS" = true ]; then
  ARGS+=(--all-targets)
fi
if [ "$VERBOSE_PATHS" = true ]; then
  ARGS+=(--verbose-paths)
fi

bash "$ENGINE" "${ARGS[@]+"${ARGS[@]}"}"
