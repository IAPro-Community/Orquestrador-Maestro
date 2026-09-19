#!/usr/bin/env bash
set -eo pipefail

# Orquestrador Maestro - Unix install verification
# Usage: bash scripts/verify-install.sh [--home-path PATH] [--skip-tool-profiles] [--core-only]

HOME_PATH="${HOME:-}"
SKIP_TOOL_PROFILES=false
CORE_ONLY=false
VERBOSE_PATHS=false
ISSUES=()

if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ -z "${ORQUESTRADOR_ALLOW_ROOT_INSTALL:-}" ]; then
  echo "Warning: verification is running as root via sudo and may inspect /var/root." >&2
  echo "Run it again as the normal user or pass --home-path explicitly." >&2
fi

count_args() {
  echo "$#"
}

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
    --skip-tool-profiles)
      SKIP_TOOL_PROFILES=true
      ;;
    --core-only)
      CORE_ONLY=true
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

HOME_PATH="$(CDPATH= cd -- "$HOME_PATH" && pwd -P)"

add_issue() {
  ISSUES+=("$1")
}

assert_path() {
  local path="$1"
  local label="$2"
  if [ ! -e "$path" ]; then
    add_issue "$label missing: $path"
  fi
}

assert_file_contains() {
  local path="$1"
  local pattern="$2"
  local label="$3"
  if [ ! -f "$path" ]; then return 0; fi
  if ! grep -Eq "$pattern" "$path"; then
    add_issue "$label does not include expected content: $path"
  fi
}

assert_file_line_count_at_most() {
  local path="$1"
  local max_lines="$2"
  local label="$3"
  local line_count
  if [ ! -f "$path" ]; then return 0; fi
  line_count="$(wc -l < "$path" | tr -d ' ')"
  if [ "${line_count:-0}" -gt "$max_lines" ]; then
    add_issue "$label is too large for a compact hook router ($line_count lines > $max_lines): $path"
  fi
}

assert_file_not_contains() {
  local path="$1"
  local pattern="$2"
  local label="$3"
  if [ ! -f "$path" ]; then return 0; fi
  if grep -Eqi "$pattern" "$path"; then
    add_issue "$label still contains a legacy hook catalog marker: $path"
  fi
}

count_dirs() {
  local path="$1"
  if [ ! -d "$path" ]; then echo 0; return 0; fi
  find "$path" -maxdepth 1 -type d ! -path "$path" | wc -l | tr -d ' '
}

count_files() {
  local path="$1"
  if [ ! -d "$path" ]; then echo 0; return 0; fi
  find "$path" -maxdepth 1 -type f | wc -l | tr -d ' '
}

if [ -d "$HOME_PATH/.orquestrador-maestro" ]; then
  ORQUESTRADOR="$HOME_PATH/.orquestrador-maestro"
else
  ORQUESTRADOR="$HOME_PATH/.orquestrador"
fi
MAESTRO_REFERENCE=".orquestrador-maestro"
if [ "$(basename "$ORQUESTRADOR")" = ".orquestrador" ]; then MAESTRO_REFERENCE=".orquestrador"; fi
CODEX="$HOME_PATH/.codex"
INSTALL_POLICY="$ORQUESTRADOR/SKILL_INSTALL_POLICY.json"
NATIVE_ROOT_SPECS=(
  "codex|$HOME_PATH/.codex/skills|40"
  "opencode|$HOME_PATH/.opencode/skills|30"
  "agents|$HOME_PATH/.agents/skills|30"
  "claude|$HOME_PATH/.claude/skills|30"
  "cursor|$HOME_PATH/.cursor/skills|30"
  "gemini|$HOME_PATH/.gemini/skills|30"
  "windsurf|$HOME_PATH/.windsurf/skills|30"
  "antigravity|$HOME_PATH/.antigravity-skills/skills|30"
)

if [ -f "$INSTALL_POLICY" ] && command -v node >/dev/null 2>&1; then
  NATIVE_ROOT_SPECS=()
  while IFS='|' read -r program rel_path max_dirs; do
    [ -z "$program" ] && continue
    rel_path="${rel_path//\\//}"
    NATIVE_ROOT_SPECS+=("$program|$HOME_PATH/$rel_path|$max_dirs")
  done < <(
    node -e '
      const fs = require("fs");
      const policy = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      for (const [program, entry] of Object.entries(policy.nativeRoots || {})) {
        console.log([program, entry.path || "", String(entry.maxDirectories || 0)].join("|"));
      }
    ' "$INSTALL_POLICY"
  )
fi

assert_path "$ORQUESTRADOR/rules.md" "Orquestrador rules"
assert_path "$ORQUESTRADOR/maestro.md" "Orquestrador maestro"
assert_path "$ORQUESTRADOR/PERSISTENCE.md" "Orquestrador persistence contract"
assert_path "$ORQUESTRADOR/PROJECT_DEV_HIERARCHY.md" "Project DEV hierarchy"
assert_path "$ORQUESTRADOR/bin/init-project-dev.sh" "Project DEV Unix initializer"
assert_path "$ORQUESTRADOR/bin/init-project-dev.ps1" "Project DEV Windows initializer"
assert_path "$ORQUESTRADOR/bin/compact-worklog.sh" "Project DEV Unix worklog compactor"
assert_path "$ORQUESTRADOR/bin/compact-worklog.ps1" "Project DEV Windows worklog compactor"
assert_path "$ORQUESTRADOR/bin/check-dev-gates.sh" "Project DEV Unix gate checker"
assert_path "$ORQUESTRADOR/bin/check-dev-gates.ps1" "Project DEV Windows gate checker"
assert_path "$ORQUESTRADOR/bin/dev-context-tools.js" "Project DEV context helper"
assert_path "$ORQUESTRADOR/sync-skills.sh" "Unix skill synchronizer"
assert_path "$ORQUESTRADOR/sync-skills.ps1" "Windows skill synchronizer"
assert_path "$ORQUESTRADOR/SKILLS_INDEX.md" "Orquestrador skills index"
assert_path "$ORQUESTRADOR/SKILLS_ROUTER.json" "Orquestrador skills router"
assert_path "$ORQUESTRADOR/SKILL_INSTALL_POLICY.json" "Orquestrador skill install policy"
assert_path "$ORQUESTRADOR/skills" "Orquestrador canonical skills"
assert_path "$HOME_PATH/AGENTS.md" "Global AGENTS.md"

assert_file_contains "$HOME_PATH/AGENTS.md" "DEV/" "Global AGENTS.md"
assert_file_contains "$HOME_PATH/AGENTS.md" "DEV/WORKLOG\\.md" "Global AGENTS.md"
assert_file_contains "$ORQUESTRADOR/rules.md" "DEV/WORKLOG\\.md" "Orquestrador rules"
assert_file_contains "$ORQUESTRADOR/maestro.md" "PERSISTENCE\\.md" "Orquestrador maestro"
assert_file_contains "$ORQUESTRADOR/PROJECT_DEV_HIERARCHY.md" "DEV/WORKLOG\\.md" "Project DEV hierarchy"

if [ "$CORE_ONLY" = false ]; then
  assert_path "$CODEX/skills" "Codex skills"
  assert_path "$CODEX/agents" "Codex agents"
  assert_path "$CODEX/prompts" "Codex prompts"

  for spec in "${NATIVE_ROOT_SPECS[@]+"${NATIVE_ROOT_SPECS[@]}"}"; do
    IFS='|' read -r program root_path max_dirs <<EOF
$spec
EOF
    assert_path "$root_path" "Native skill root $program"
    dir_count="$(count_dirs "$root_path")"
    if [ "${dir_count:-0}" -gt "${max_dirs:-0}" ]; then
      add_issue "Native skill root $program is oversized for low-token operation ($dir_count directories > $max_dirs): $root_path"
    fi
  done
  assert_path "$HOME_PATH/.agents/skills/orquestrador-maestro/SKILL.md" "Freebuff shared Maestro skill"
fi

if [ "$CORE_ONLY" = false ] && [ "$SKIP_TOOL_PROFILES" = false ]; then
  assert_path "$HOME_PATH/.codex/AGENTS.md" "Codex AGENTS profile"
  assert_path "$HOME_PATH/.config/opencode/AGENTS.md" "OpenCode global AGENTS profile"
  assert_path "$HOME_PATH/.config/opencode/opencode.json" "OpenCode global config"
  assert_path "$HOME_PATH/.opencode/default-skill.json" "OpenCode default skill profile"
  assert_path "$HOME_PATH/.opencode/hooks.md" "OpenCode hooks profile"
  assert_path "$HOME_PATH/.claude/CLAUDE.md" "Claude global memory"
  assert_path "$HOME_PATH/.claude/hooks.md" "Claude hooks profile"
  assert_path "$HOME_PATH/.cursor/AGENTS.md" "Cursor AGENTS profile"
  assert_path "$HOME_PATH/.cursor/rules/orquestrador-maestro.mdc" "Cursor Orquestrador rule"
  assert_path "$HOME_PATH/.cursor/commands/maestro.md" "Cursor Maestro command"
  assert_path "$HOME_PATH/.cursor/hooks.md" "Cursor hooks profile"
  assert_path "$HOME_PATH/.gemini/GEMINI.md" "Gemini global context"
  assert_path "$HOME_PATH/.gemini/hooks.md" "Gemini hooks profile"
  assert_path "$HOME_PATH/.codeium/windsurf/memories/global_rules.md" "Windsurf global rules"
  assert_path "$HOME_PATH/.windsurf/hooks.md" "Windsurf hooks profile"
  assert_path "$HOME_PATH/.mimo/AGENTS.md" "MiMo Code global AGENTS profile"
  assert_path "$HOME_PATH/.kimi-code/AGENTS.md" "Kimi Code global AGENTS profile"
  assert_path "$HOME_PATH/.kimi-code/config.toml" "Kimi Code global config"
  assert_path "$HOME_PATH/.grok/config.toml" "Grok global config"
  assert_path "$HOME_PATH/antigravity-rules.json" "Antigravity global rules"
  assert_path "$HOME_PATH/.antigravity/antigravity.json" "Antigravity integration config"
  assert_path "$HOME_PATH/.antigravity/settings.json" "Antigravity settings"
  assert_path "$HOME_PATH/.ai-standards/core/rules.md" "Antigravity AI standards rules"
  assert_path "$HOME_PATH/.ai-standards/core/workflow.md" "Antigravity AI standards workflow"

  assert_file_contains "$HOME_PATH/.codex/AGENTS.md" "DEV/WORKLOG\\.md" "Codex AGENTS profile"
  assert_file_contains "$HOME_PATH/.codex/AGENTS.md" "PERSISTENCE\\.md" "Codex AGENTS profile"
  assert_file_contains "$HOME_PATH/.config/opencode/AGENTS.md" "DEV/WORKLOG\\.md" "OpenCode global AGENTS profile"
  assert_file_contains "$HOME_PATH/.config/opencode/AGENTS.md" "PERSISTENCE\\.md" "OpenCode global AGENTS profile"
  assert_file_contains "$HOME_PATH/.claude/CLAUDE.md" "DEV/WORKLOG\\.md" "Claude global memory"
  assert_file_contains "$HOME_PATH/.claude/CLAUDE.md" "PERSISTENCE\\.md" "Claude global memory"
  assert_file_contains "$HOME_PATH/.cursor/AGENTS.md" "DEV/WORKLOG\\.md" "Cursor AGENTS profile"
  assert_file_contains "$HOME_PATH/.cursor/AGENTS.md" "PERSISTENCE\\.md" "Cursor AGENTS profile"
  assert_file_contains "$HOME_PATH/.cursor/rules/orquestrador-maestro.mdc" "DEV/WORKLOG\\.md" "Cursor Orquestrador rule"
  assert_file_contains "$HOME_PATH/.cursor/commands/maestro.md" "DEV/HANDOFF\\.md" "Cursor Maestro command"
  assert_file_contains "$HOME_PATH/.gemini/GEMINI.md" "DEV/WORKLOG\\.md" "Gemini global context"
  assert_file_contains "$HOME_PATH/.gemini/GEMINI.md" "PERSISTENCE\\.md" "Gemini global context"
  assert_file_contains "$HOME_PATH/.codeium/windsurf/memories/global_rules.md" "DEV/WORKLOG\\.md" "Windsurf global rules"
  assert_file_contains "$HOME_PATH/.codeium/windsurf/memories/global_rules.md" "PERSISTENCE\\.md" "Windsurf global rules"
  assert_file_contains "$HOME_PATH/.mimo/AGENTS.md" "PERSISTENCE\\.md" "MiMo Code global AGENTS profile"
  assert_file_contains "$HOME_PATH/.kimi-code/AGENTS.md" "PERSISTENCE\\.md" "Kimi Code global AGENTS profile"
  assert_file_contains "$HOME_PATH/.kimi-code/config.toml" "extra_skill_dirs" "Kimi Code global config"
  assert_file_contains "$HOME_PATH/.grok/config.toml" "\\.agents/skills" "Grok global config"
  assert_file_contains "$HOME_PATH/antigravity-rules.json" "\\.ai-standards" "Antigravity global rules"
  assert_file_contains "$HOME_PATH/.antigravity/antigravity.json" "\\.orquestrador" "Antigravity integration config"
  assert_file_contains "$HOME_PATH/.ai-standards/core/rules.md" "DEV/WORKLOG\\.md" "Antigravity AI standards rules"

  HOOK_CHECKS=(
    "$ORQUESTRADOR/hooks.md|80|Orquestrador hooks profile"
    "$HOME_PATH/.opencode/hooks.md|30|OpenCode hooks profile"
    "$HOME_PATH/.claude/hooks.md|20|Claude hooks profile"
    "$HOME_PATH/.cursor/hooks.md|20|Cursor hooks profile"
    "$HOME_PATH/.gemini/hooks.md|20|Gemini hooks profile"
    "$HOME_PATH/.windsurf/hooks.md|20|Windsurf hooks profile"
  )

  for hook_check in "${HOOK_CHECKS[@]}"; do
    IFS='|' read -r hook_path hook_max hook_label <<< "$hook_check"
    assert_file_contains "$hook_path" "SKILLS_ROUTER\\.json" "$hook_label"
    assert_file_line_count_at_most "$hook_path" "$hook_max" "$hook_label"
    assert_file_not_contains "$hook_path" "(GLOBAL SKILLS HOOKS|Complete Skill Reference with Descriptions)" "$hook_label"
  done

  OPENCODE_CONFIG="$HOME_PATH/.config/opencode/opencode.json"
  if [ -f "$OPENCODE_CONFIG" ]; then
    if ! grep -q "~/$MAESTRO_REFERENCE/rules.md" "$OPENCODE_CONFIG"; then
      add_issue "OpenCode global config does not include Orquestrador rules: $OPENCODE_CONFIG"
    fi
    if ! grep -q "~/$MAESTRO_REFERENCE/maestro.md" "$OPENCODE_CONFIG"; then
      add_issue "OpenCode global config does not include Orquestrador maestro: $OPENCODE_CONFIG"
    fi
  fi
fi

if [ "$(count_args "${ISSUES[@]+"${ISSUES[@]}"}")" -gt 0 ]; then
  echo "Install verification failed:"
  for issue in "${ISSUES[@]+"${ISSUES[@]}"}"; do
    echo "  - $issue"
  done
  exit 1
fi

if [ "$CORE_ONLY" = true ] || [ "$SKIP_TOOL_PROFILES" = true ]; then
  TOOL_PROFILES_CHECKED=false
else
  TOOL_PROFILES_CHECKED=true
fi

echo "Install verification passed."
if [ "$VERBOSE_PATHS" = true ]; then
  echo "HomePath: $HOME_PATH"
else
  echo "HomePath: [redacted]"
fi
echo "OrquestradorSkills: $(count_dirs "$ORQUESTRADOR/skills")"
echo "CodexSkills: $(count_dirs "$CODEX/skills")"
echo "CodexAgents: $(count_files "$CODEX/agents")"
echo "CodexPrompts: $(count_files "$CODEX/prompts")"
echo "AgentSkills: $(count_dirs "$HOME_PATH/.agents/skills")"
echo "ClaudeSkills: $(count_dirs "$HOME_PATH/.claude/skills")"
echo "OpenCodeSkills: $(count_dirs "$HOME_PATH/.opencode/skills")"
echo "CursorSkills: $(count_dirs "$HOME_PATH/.cursor/skills")"
echo "GeminiSkills: $(count_dirs "$HOME_PATH/.gemini/skills")"
echo "WindsurfSkills: $(count_dirs "$HOME_PATH/.windsurf/skills")"
echo "AntigravitySkills: $(count_dirs "$HOME_PATH/.antigravity-skills/skills")"
echo "ToolProfilesChecked: $TOOL_PROFILES_CHECKED"
echo "CoreOnly: $CORE_ONLY"
