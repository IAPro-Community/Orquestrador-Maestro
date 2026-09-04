#!/usr/bin/env bash
set -eo pipefail

# Orquestrador Maestro - Unix installer engine
# Usage: bash scripts/install.sh [--home-path PATH] [--force] [--skip-skill-sync] [--skip-extra-skills] [--skip-community-skills] [--install-tool-profiles] [--only ID] [--dry-run] [--list-targets] [--uninstall] [--all-targets] [--non-interactive]

HOME_PATH="${HOME:-}"
FORCE=false
SKIP_SKILL_SYNC=false
SKIP_EXTRA_SKILLS=false
SKIP_COMMUNITY_SKILLS=false
INSTALL_TOOL_PROFILES=false
ONLY_COMPONENTS=()
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
    --force)
      FORCE=true
      ;;
    --skip-skill-sync)
      SKIP_SKILL_SYNC=true
      ;;
    --skip-extra-skills)
      SKIP_EXTRA_SKILLS=true
      ;;
    --skip-community-skills)
      SKIP_COMMUNITY_SKILLS=true
      ;;
    --install-tool-profiles)
      INSTALL_TOOL_PROFILES=true
      ;;
    --only)
      if [ "$#" -lt 2 ]; then
        echo "Error: --only requires a value." >&2
        exit 1
      fi
      IFS=',' read -r -a only_parts <<< "$2"
      for only_part in "${only_parts[@]}"; do
        only_part="$(printf '%s' "$only_part" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        if [ -n "$only_part" ]; then
          ONLY_COMPONENTS+=("$only_part")
        fi
      done
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

if [ -z "$HOME_PATH" ]; then
  echo "Error: HOME is not set. Pass --home-path PATH." >&2
  exit 1
fi

if printf '%s' "$HOME_PATH" | grep -Eq '^[A-Za-z]:[\\/]'; then
  if command -v cygpath >/dev/null 2>&1; then
    HOME_PATH="$(cygpath -u "$HOME_PATH")"
  else
    echo "Error: Windows-style --home-path requires Git Bash/MSYS with cygpath, or use a Unix-style path." >&2
    exit 1
  fi
fi

if [ -d "$HOME_PATH" ]; then
  HOME_PATH="$(CDPATH= cd -- "$HOME_PATH" && pwd -P)"
else
  if [ "$DRY_RUN" = true ] || [ "$LIST_TARGETS" = true ]; then
    HOME_PARENT="$(dirname "$HOME_PATH")"
    HOME_LEAF="$(basename "$HOME_PATH")"
    if [ -d "$HOME_PARENT" ]; then
      HOME_PATH="$(CDPATH= cd -- "$HOME_PARENT" && pwd -P)/$HOME_LEAF"
    fi
  else
    mkdir -p "$HOME_PATH"
    HOME_PATH="$(CDPATH= cd -- "$HOME_PATH" && pwd -P)"
  fi
fi

if [ "$HOME_PATH" = "/" ]; then
  echo "Error: refusing to install into filesystem root." >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)"
SOURCE_ORQUESTRADOR="$REPO_ROOT/orquestrador"
SOURCE_AGENTS="$REPO_ROOT/home/AGENTS.md"
SOURCE_CODEX="$REPO_ROOT/codex"
SOURCE_COMMUNITY_SKILLS="$REPO_ROOT/skill-library/community-skills"
SOURCE_TOOL_PROFILES="$REPO_ROOT/tool-profiles"

TARGET_ORQUESTRADOR="$HOME_PATH/.orquestrador"
TARGET_SKILL_LIBRARY="$TARGET_ORQUESTRADOR/skill-library"
TARGET_AGENTS="$HOME_PATH/AGENTS.md"
BACKUP_ROOT="$HOME_PATH/.orquestrador-public-backups"
STAMP="$(date +"%Y%m%d-%H%M%S")"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
USER_NAME="$(basename "$HOME_PATH")"

TARGETS=()
FILE_TARGETS=()
BACKED_UP_DESTINATIONS=()

count_args() {
  echo "$#"
}

selected_component() {
  local wanted candidate
  if [ -z "${ONLY_COMPONENTS[*]-}" ]; then
    return 0
  fi
  for wanted in "${ONLY_COMPONENTS[@]}"; do
    if [ "$wanted" = "all" ]; then
      return 0
    fi
    for candidate in "$@"; do
      if [ "$wanted" = "$candidate" ]; then
        return 0
      fi
    done
  done
  return 1
}

validate_only_components() {
  local component
  local allowed=" all core orquestrador global-agents skills community-skills codex agents claude opencode cursor gemini windsurf antigravity mimo kimi grok tool-profiles codex-skills codex-agents codex-prompts prompts "
  for component in "${ONLY_COMPONENTS[@]}"; do
    case "$allowed" in
      *" $component "*) ;;
      *)
        echo "Error: unknown component for --only: $component" >&2
        echo "Supported values:${allowed}" >&2
        exit 1
        ;;
    esac
  done
}

is_text_file() {
  local file="$1"
  local leaf ext
  leaf="$(basename "$file")"
  ext="${leaf##*.}"

  if [ "$leaf" = ".gitignore" ]; then return 0; fi
  if [ "$ext" = "$leaf" ]; then return 0; fi

  case "$ext" in
    md|mdc|txt|json|jsonl|toml|yaml|yml|ps1|cmd|sh|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|html|css|scss|svg|xsd|xml|csv|patch|template|rules|ini|cfg|conf|sql)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

copy_with_placeholders() {
  local src="$1"
  local dest="$2"
  local dest_dir home_for_text user_for_text full_name_for_text

  dest_dir="$(dirname "$dest")"
  mkdir -p "$dest_dir"

  if ! is_text_file "$src"; then
    cp "$src" "$dest"
    return
  fi

  home_for_text="$(escape_sed_replacement "$HOME_PATH")"
  user_for_text="$(escape_sed_replacement "$USER_NAME")"
  full_name_for_text="$user_for_text"

  sed -e "s|{{USER_HOME}}|$home_for_text|g" \
    -e "s|{{USER_NAME}}|$user_for_text|g" \
    -e "s|{{USER_FULL_NAME}}|$full_name_for_text|g" \
    "$src" > "$dest"
}

copy_tree_with_placeholders() {
  local src_dir="$1"
  local dest_dir="$2"
  local src_file relative dest_file

  [ -d "$src_dir" ] || return 0

  while IFS= read -r -d '' src_file; do
    relative="${src_file#$src_dir/}"
    dest_file="$dest_dir/$relative"
    copy_with_placeholders "$src_file" "$dest_file"
  done < <(find "$src_dir" -type f -print0)
}

path_under_root() {
  local path="$1"
  local root="$2"
  local resolved_path resolved_root

  if [ ! -d "$(dirname "$path")" ]; then
    return 1
  fi
  resolved_path="$(CDPATH= cd -- "$(dirname "$path")" && pwd -P)/$(basename "$path")"
  resolved_root="$(CDPATH= cd -- "$root" && pwd -P)"

  case "$resolved_path" in
    "$resolved_root")
      return 0
      ;;
    "$resolved_root"/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

backup_path() {
  local path="$1"
  local label="$2"
  local seen

  [ -e "$path" ] || return 0

  for seen in "${BACKED_UP_DESTINATIONS[@]+"${BACKED_UP_DESTINATIONS[@]}"}"; do
    if [ "$seen" = "$path" ]; then
      return 0
    fi
  done

  mkdir -p "$BACKUP_DIR"
  cp -R "$path" "$BACKUP_DIR/$label"
  BACKED_UP_DESTINATIONS+=("$path")
}

backup_mapped_directory() {
  local src_dir="$1"
  local dest_dir="$2"
  local label="$3"
  local src_file relative existing_file backup_file

  [ -d "$src_dir" ] || return 0
  [ -d "$dest_dir" ] || return 0

  while IFS= read -r -d '' src_file; do
    relative="${src_file#$src_dir/}"
    existing_file="$dest_dir/$relative"
    if [ -f "$existing_file" ] || [ -L "$existing_file" ]; then
      backup_file="$BACKUP_DIR/$label/$relative"
      mkdir -p "$(dirname "$backup_file")"
      cp -p "$existing_file" "$backup_file"
    fi
  done < <(find "$src_dir" -type f -print0)
}

add_target() {
  local src="$1"
  local dest="$2"
  local label="$3"
  local component="${4:-}"
  if [ -d "$src" ]; then
    TARGETS+=("$src|$dest|$label|$component|directory")
  fi
}

add_file_target() {
  local src="$1"
  local dest="$2"
  local label="$3"
  local component="${4:-}"
  if [ -f "$src" ]; then
    FILE_TARGETS+=("$src|$dest|$label|$component|file")
  fi
}

print_target_row() {
  local mode="$1"
  local label="$2"
  local component="$3"
  local kind="$4"
  local dest="$5"
  local src="${6:-}"
  local exists=false
  if [ -e "$dest" ]; then
    exists=true
  fi
  if [ "$VERBOSE_PATHS" = true ]; then
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$mode" "$label" "$component" "$kind" "$exists" "$src" "$dest"
  else
    printf '%s\t%s\t%s\t%s\t%s\n' "$mode" "$label" "$component" "$kind" "$exists"
  fi
}

list_install_plan() {
  local mode="$1"
  local entry src dest label component kind
  if [ "$VERBOSE_PATHS" = true ]; then
    printf 'Mode\tTarget\tComponent\tKind\tExists\tSource\tDestination\n'
  else
    printf 'Mode\tTarget\tComponent\tKind\tExists\n'
  fi
  if [ "$INCLUDE_CORE" = true ]; then
    print_target_row "$mode" ".orquestrador" "core" "directory" "$TARGET_ORQUESTRADOR" "$SOURCE_ORQUESTRADOR"
    print_target_row "$mode" "AGENTS.md" "core" "file" "$TARGET_AGENTS" "$SOURCE_AGENTS"
  fi
  for entry in "${TARGETS[@]+"${TARGETS[@]}"}"; do
    IFS='|' read -r src dest label component kind <<EOF
$entry
EOF
    print_target_row "$mode" "$label" "$component" "$kind" "$dest" "$src"
  done
  for entry in "${FILE_TARGETS[@]+"${FILE_TARGETS[@]}"}"; do
    IFS='|' read -r src dest label component kind <<EOF
$entry
EOF
    print_target_row "$mode" "$label" "$component" "$kind" "$dest" "$src"
  done
}

remove_empty_parents_under_root() {
  local path="$1"
  local root="$2"
  local current root_resolved
  [ -d "$path" ] || return 0
  current="$(CDPATH= cd -- "$path" && pwd -P)"
  root_resolved="$(CDPATH= cd -- "$root" && pwd -P)"
  while [ -d "$current" ] && [ "$current" != "$root_resolved" ]; do
    case "$current" in
      "$root_resolved"/*) ;;
      *) break ;;
    esac
    if find "$current" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
      break
    fi
    rmdir "$current"
    current="$(dirname "$current")"
  done
}

uninstall_mapped_directory() {
  local src_dir="$1"
  local dest_dir="$2"
  local src_file relative dest_file
  [ -d "$dest_dir" ] || return 0
  if ! path_under_root "$dest_dir" "$HOME_PATH"; then
    echo "Error: refusing to uninstall target outside home: $dest_dir" >&2
    exit 1
  fi
  while IFS= read -r -d '' src_file; do
    relative="${src_file#$src_dir/}"
    dest_file="$dest_dir/$relative"
    if [ -f "$dest_file" ]; then
      rm -f "$dest_file"
      remove_empty_parents_under_root "$(dirname "$dest_file")" "$dest_dir"
    fi
  done < <(find "$src_dir" -type f -print0)
  remove_empty_parents_under_root "$dest_dir" "$HOME_PATH"
}

validate_only_components
if [ "$UNINSTALL" = true ]; then
  if selected_component core orquestrador global-agents; then
    INCLUDE_CORE=true
  else
    INCLUDE_CORE=false
  fi
else
  INCLUDE_CORE=true
fi

if [ ! -d "$SOURCE_ORQUESTRADOR" ]; then
  echo "Error: missing generated snapshot: $SOURCE_ORQUESTRADOR" >&2
  exit 1
fi
if [ ! -f "$SOURCE_AGENTS" ]; then
  echo "Error: missing home AGENTS template: $SOURCE_AGENTS" >&2
  exit 1
fi

if [ -e "$TARGET_ORQUESTRADOR" ] && [ "$FORCE" = false ] && [ "$DRY_RUN" = false ] && [ "$LIST_TARGETS" = false ] && [ "$UNINSTALL" = false ]; then
  echo "Error: target already exists: $TARGET_ORQUESTRADOR. Re-run with --force to overwrite after backup." >&2
  exit 1
fi
if [ -e "$TARGET_AGENTS" ] && [ "$FORCE" = false ] && [ "$DRY_RUN" = false ] && [ "$LIST_TARGETS" = false ] && [ "$UNINSTALL" = false ]; then
  echo "Error: target already exists: $TARGET_AGENTS. Re-run with --force to overwrite after backup." >&2
  exit 1
fi

if [ "$SKIP_EXTRA_SKILLS" = false ]; then
  if [ "$SKIP_COMMUNITY_SKILLS" = false ]; then
    if selected_component skills community-skills codex agents claude opencode cursor gemini windsurf antigravity mimo kimi grok; then
      add_target "$SOURCE_COMMUNITY_SKILLS" "$TARGET_SKILL_LIBRARY/community-skills" ".orquestrador__skill-library__community-skills" "community-skills"
    fi
  fi

  if selected_component codex codex-skills skills; then
    add_target "$SOURCE_CODEX/skills" "$TARGET_SKILL_LIBRARY/codex-skills" ".orquestrador__skill-library__codex-skills" "codex"
  fi
  if selected_component codex codex-agents agents; then
    add_target "$SOURCE_CODEX/agents" "$HOME_PATH/.codex/agents" ".codex__agents" "codex"
  fi
  if selected_component codex codex-prompts prompts; then
    add_target "$SOURCE_CODEX/prompts" "$HOME_PATH/.codex/prompts" ".codex__prompts" "codex"
  fi
fi

if [ "$INSTALL_TOOL_PROFILES" = true ]; then
  tool_is_present() {
    local tool_cmd="$1"
    local tool_config_dir="$2"
    if [ -n "$tool_cmd" ] && command -v "$tool_cmd" >/dev/null 2>&1; then
      return 0
    fi
    if [ -n "$tool_config_dir" ] && [ -d "$HOME_PATH/$tool_config_dir" ]; then
      if [ -f "$HOME_PATH/$tool_config_dir/.maestro-managed" ]; then
        return 1
      fi
      return 0
    fi
    return 1
  }

  tool_should_install() {
    local component="$1"
    local tool_cmd="$2"
    local tool_config_dir="$3"
    if [ "$ALL_TARGETS" = true ]; then
      return 0
    fi
    if [ "$NON_INTERACTIVE" = true ]; then
      tool_is_present "$tool_cmd" "$tool_config_dir"
      return $?
    fi
    return 0
  }

  TOOL_PROFILES=(
    "codex|.codex|.codex__profile|codex|codex"
    "opencode|.opencode|.opencode|opencode|opencode"
    "opencode-global|.config/opencode|.config__opencode|opencode|opencode"
    "claude|.claude|.claude|claude|claude"
    "cursor|.cursor|.cursor|cursor|"
    "gemini|.gemini|.gemini|gemini|gemini"
    "windsurf|.windsurf|.windsurf|windsurf|"
    "windsurf-global|.codeium/windsurf/memories|.codeium__windsurf__memories|windsurf|"
    "antigravity|.antigravity|.antigravity|antigravity|"
    "ai-standards|.ai-standards|.ai-standards|antigravity|"
    "mimo|.mimo|.mimo|mimo|mimo"
    "kimi|.kimi-code|.kimi-code|kimi|kimi"
    "grok|.grok|.grok|grok|grok"
  )
  for entry in "${TOOL_PROFILES[@]}"; do
    IFS='|' read -r src_sub dest_sub label component tool_cmd <<< "$entry"
    if selected_component tool-profiles "$component"; then
      config_dir=""
      case "$component" in
        codex) config_dir=".codex" ;;
        opencode) config_dir=".opencode" ;;
        claude) config_dir=".claude" ;;
        cursor) config_dir=".cursor" ;;
        gemini) config_dir=".gemini" ;;
        windsurf) config_dir=".windsurf" ;;
        antigravity) config_dir=".antigravity" ;;
        mimo) config_dir=".mimo" ;;
        kimi) config_dir=".kimi-code" ;;
        grok) config_dir=".grok" ;;
      esac
      if tool_should_install "$component" "$tool_cmd" "$config_dir"; then
        add_target "$SOURCE_TOOL_PROFILES/$src_sub" "$HOME_PATH/$dest_sub" "$label" "$component"
      fi
    fi
  done

  if selected_component tool-profiles antigravity; then
    if tool_should_install "antigravity" "" ".antigravity"; then
      add_file_target "$SOURCE_TOOL_PROFILES/antigravity-home/antigravity-rules.json" "$HOME_PATH/antigravity-rules.json" "antigravity-rules.json" "antigravity"
    fi
  fi
fi

if [ "$LIST_TARGETS" = true ] || [ "$DRY_RUN" = true ]; then
  if [ "$UNINSTALL" = true ]; then
    list_install_plan "uninstall-plan"
  elif [ "$DRY_RUN" = true ]; then
    list_install_plan "dry-run"
  else
    list_install_plan "list"
  fi
  exit 0
fi

if [ "$UNINSTALL" = true ]; then
  if [ "$INCLUDE_CORE" = true ]; then
    backup_path "$TARGET_ORQUESTRADOR" ".orquestrador"
    backup_path "$TARGET_AGENTS" "AGENTS.md"
  fi

  for entry in "${TARGETS[@]+"${TARGETS[@]}"}"; do
    IFS='|' read -r src dest label _component _kind <<EOF
$entry
EOF
    backup_mapped_directory "$src" "$dest" "$label"
  done

  for entry in "${FILE_TARGETS[@]+"${FILE_TARGETS[@]}"}"; do
    IFS='|' read -r _src dest label _component _kind <<EOF
$entry
EOF
    backup_path "$dest" "$label"
  done

  if [ "$INCLUDE_CORE" = true ] && [ -d "$TARGET_ORQUESTRADOR" ]; then
    if ! path_under_root "$TARGET_ORQUESTRADOR" "$HOME_PATH"; then
      echo "Error: refusing to remove target outside home: $TARGET_ORQUESTRADOR" >&2
      exit 1
    fi
    rm -rf "$TARGET_ORQUESTRADOR"
  fi
  if [ "$INCLUDE_CORE" = true ] && [ -f "$TARGET_AGENTS" ]; then
    if ! path_under_root "$TARGET_AGENTS" "$HOME_PATH"; then
      echo "Error: refusing to remove target outside home: $TARGET_AGENTS" >&2
      exit 1
    fi
    rm -f "$TARGET_AGENTS"
  fi

  for entry in "${TARGETS[@]+"${TARGETS[@]}"}"; do
    IFS='|' read -r src dest _label _component _kind <<EOF
$entry
EOF
    uninstall_mapped_directory "$src" "$dest"
  done

  for entry in "${FILE_TARGETS[@]+"${FILE_TARGETS[@]}"}"; do
    IFS='|' read -r _src dest _label _component _kind <<EOF
$entry
EOF
    if [ -f "$dest" ]; then
      if ! path_under_root "$dest" "$HOME_PATH"; then
        echo "Error: refusing to remove target outside home: $dest" >&2
        exit 1
      fi
      rm -f "$dest"
    fi
  done

  echo "Uninstall complete."
  if [ "$VERBOSE_PATHS" = true ]; then
    echo "HomePath: $HOME_PATH"
  else
    echo "HomePath: [redacted]"
  fi
  echo "UninstalledCore: $INCLUDE_CORE"
  if [ -d "$BACKUP_DIR" ]; then
    if [ "$VERBOSE_PATHS" = true ]; then
      echo "Backup: $BACKUP_DIR"
    else
      echo "Backup: [created]"
    fi
  fi
  echo "ExtraTargets: $(count_args "${TARGETS[@]+"${TARGETS[@]}"}")"
  echo "FileTargets: $(count_args "${FILE_TARGETS[@]+"${FILE_TARGETS[@]}"}")"
  exit 0
fi

backup_path "$TARGET_ORQUESTRADOR" ".orquestrador"
backup_path "$TARGET_AGENTS" "AGENTS.md"

for entry in "${TARGETS[@]+"${TARGETS[@]}"}"; do
  IFS='|' read -r src dest label _component _kind <<EOF
$entry
EOF
  backup_mapped_directory "$src" "$dest" "$label"
done

for entry in "${FILE_TARGETS[@]+"${FILE_TARGETS[@]}"}"; do
  IFS='|' read -r _src dest label _component _kind <<EOF
$entry
EOF
  backup_path "$dest" "$label"
done

if [ -d "$TARGET_ORQUESTRADOR" ]; then
  if ! path_under_root "$TARGET_ORQUESTRADOR" "$HOME_PATH"; then
    echo "Error: refusing to remove target outside home: $TARGET_ORQUESTRADOR" >&2
    exit 1
  fi
  rm -rf "$TARGET_ORQUESTRADOR"
fi

copy_tree_with_placeholders "$SOURCE_ORQUESTRADOR" "$TARGET_ORQUESTRADOR"
copy_with_placeholders "$SOURCE_AGENTS" "$TARGET_AGENTS"
mkdir -p "$TARGET_ORQUESTRADOR/logs"

for entry in "${TARGETS[@]+"${TARGETS[@]}"}"; do
  IFS='|' read -r src dest _label _component _kind <<EOF
$entry
EOF
  copy_tree_with_placeholders "$src" "$dest"
done

for entry in "${FILE_TARGETS[@]+"${FILE_TARGETS[@]}"}"; do
  IFS='|' read -r src dest _label _component _kind <<EOF
$entry
EOF
  copy_with_placeholders "$src" "$dest"
done

chmod +x \
  "$TARGET_ORQUESTRADOR/sync-skills.sh" \
  "$TARGET_ORQUESTRADOR/bin/init-project-dev.sh" \
  "$TARGET_ORQUESTRADOR/bin/compact-worklog.sh" \
  "$TARGET_ORQUESTRADOR/bin/check-dev-gates.sh" 2>/dev/null || true

if [ "$SKIP_SKILL_SYNC" = false ]; then
  SYNC_SCRIPT="$TARGET_ORQUESTRADOR/sync-skills.sh"
  if [ -f "$SYNC_SCRIPT" ]; then
    bash "$SYNC_SCRIPT" --apply --home-path "$HOME_PATH"
  fi
fi

echo "Installation complete."
if [ "$VERBOSE_PATHS" = true ]; then
  echo "HomePath: $HOME_PATH"
  echo "InstalledOrquestrador: $TARGET_ORQUESTRADOR"
  echo "InstalledAgents: $TARGET_AGENTS"
else
  echo "HomePath: [redacted]"
  echo "InstalledOrquestrador: .orquestrador"
  echo "InstalledAgents: AGENTS.md"
fi
if [ -d "$BACKUP_DIR" ]; then
  if [ "$VERBOSE_PATHS" = true ]; then
    echo "Backup: $BACKUP_DIR"
  else
    echo "Backup: [created]"
  fi
fi
echo "SkillSync: $([ "$SKIP_SKILL_SYNC" = false ] && echo true || echo false)"
echo "ToolProfiles: $INSTALL_TOOL_PROFILES"
echo "ExtraSkillTargets: $(count_args "${TARGETS[@]+"${TARGETS[@]}"}")"
