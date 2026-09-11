# Memory Scopes

This reference explains where episodic observations are visible and why a branch does not accidentally leak context into another workspace. Start with the [operating guide](ai-agent-operating-guide.md) for the everyday workflow.

This document describes the memory scope system in Orquestrador Maestro.

## Scope Levels

### Repository Scope
- **Visibility**: All branches and worktrees in the repository
- **Use case**: Decisions, discoveries, and implementations that apply to the entire project
- **Example**: "Use TypeScript for the project", "Adopt JWT authentication"
- **Required fields**: `level`, `repositoryId`

### Branch Scope
- **Visibility**: Only the specific branch
- **Use case**: Branch-specific work, experiments, feature development
- **Example**: "Fixed login bug on feat-auth", "Added test coverage for API"
- **Required fields**: `level`, `repositoryId`, `branch`

### Workspace Scope
- **Visibility**: Only the current worktree/checkout
- **Use case**: Worktree-specific local changes, temporary experiments
- **Example**: "Local debug session", "Workaround for build issue"
- **Required fields**: `level`, `repositoryId`, `workspaceId`

### Commit Scope
- **Visibility**: Tied to specific commit hash
- **Use case**: Commit-specific notes, temporary context, detached HEAD observations
- **Example**: "Changed in commit abc123", "Reverted in def456"
- **Required fields**: `level`, `repositoryId`, `headCommit`

### Task Scope
- **Visibility**: Tied to specific task ID
- **Use case**: Task-specific observations, cross-session continuity
- **Example**: "Refresh token fix progress", "API migration status"
- **Required fields**: `level`, `repositoryId`, `taskId`

## Default Scope by Type

When no explicit scope is provided, observations are scoped based on their type:

| Type | Default Scope | Notes |
|------|---------------|-------|
| `decision` | branch | Falls back to commit if detached HEAD |
| `discovery` | branch | Falls back to commit if detached HEAD |
| `problem` | branch | Falls back to commit if detached HEAD |
| `implementation` | branch | Falls back to commit if detached HEAD |
| `verification` | branch | Falls back to commit if detached HEAD |
| `risk` | branch | Falls back to commit if detached HEAD |
| `dependency` | branch | Falls back to commit if detached HEAD |
| `failure` | branch | Falls back to commit if detached HEAD |
| `attempt` | task | Falls back to branch (or commit if detached) if no taskId |
| `environment` | workspace | Always workspace |
| `workaround` | workspace | Always workspace |

## Detached HEAD Behavior

When HEAD is detached (`git checkout <SHA>`):
- `branch` = `null`
- `detached` = `true`
- Default scope for branch-eligible types becomes `commit` (not `branch`)
- Observations are tied to the specific HEAD commit
- Visibility requires matching `headCommit`

## Visibility Matrix

| Observation Scope | Same Branch | Other Branch | Same Repo | Other Repo |
|-------------------|-------------|--------------|-----------|------------|
| Repository        | ✓           | ✓            | ✓         | ✗          |
| Branch            | ✓           | ✗            | ✗         | ✗          |
| Workspace         | Current WS  | ✗            | ✗         | ✗          |
| Commit            | Same/Ancestor| ✗           | Limited   | ✗          |
| Task              | Matching    | ✗            | ✗         | ✗          |

## Branch Isolation

When working on branch `feat-a`:
- Repository-scoped observations: **visible**
- Branch `feat-a` observations: **visible**
- Branch `feat-b` observations: **hidden**

This prevents context leakage between parallel features.

## Worktree Isolation

Each worktree has a unique workspace ID:
- Repository ID remains the same
- Workspace ID changes per worktree
- Branch reflects the worktree's current branch
- HEAD points to the worktree's commit

## Promotion

Promotion writes the observation content to canonical DEV files and marks the historical observation as promoted:

```bash
# Dry-run (preview)
orquestrador-maestro memory promote --id obs_abc123 --destination DEV/DECISIONS.md

# Apply
orquestrador-maestro memory promote --id obs_abc123 --destination DEV/DECISIONS.md --apply
```

### What Promotion Does
1. Writes the observation content to the specified DEV file
2. Marks the historical observation with `scope.promoted = true`
3. The observation retains its original scope (does not change to repository)
4. Promoted observations are exempt from age-based retention

### Safe Destinations
- `DEV/CONTEXT.md`
- `DEV/DECISIONS.md`
- `DEV/ARCHITECTURE.md`
- `DEV/RUNBOOKS`

### Promotion Rules
1. Only verified observations can be promoted
2. Path traversal is blocked
3. Symlink escape is blocked
4. Destination must be within project root
5. Destination must be in safe destinations list

## Consolidation

Consolidation combines multiple observations into one. It requires:

1. **Same scope level**: Cannot consolidate branch-scoped with repository-scoped
2. **Same scope values**: Cannot consolidate observations from different branches
3. **No automatic widening**: Consolidation never changes the scope level

Example: Two branch-scoped observations on `feat-a` can be consolidated.
Example: One branch-scoped on `feat-a` and one on `feat-b` **cannot** be consolidated.

## Merge

When merging branches:
1. Branch-scoped observations remain on their original branch
2. Repository-scoped observations are shared
3. No automatic merging of branch observations
4. Manual promotion required for branch-specific insights

## Branch Deletion

When a branch is deleted:
1. Observations remain in the memory store
2. They become historical records
3. Searchable via explicit branch filter
4. No data loss, but no longer actively surfaced

## Rebase

After rebase:
1. Branch name remains the same
2. Commit hashes change
3. Observations tied to branch name persist
4. Observations tied to specific commits may become orphaned

## Precedence

Canonical documentation (DEV/) takes precedence over memory:
- Memory provides historical context
- Canonical files provide current truth
- Conflicts are resolved in favor of canonical
- Memory cannot silently override decisions

## CLI Examples

### Record with scope
```bash
# Default scope (branch for most types, commit if detached)
orquestrador-maestro memory record --type decision --summary "Use React"

# Explicit branch scope
orquestrador-maestro memory record --type discovery --summary "Found bug" --scope branch

# Workspace scope
orquestrador-maestro memory record --type implementation --summary "Fixed issue" --scope workspace

# Record in a different project
orquestrador-maestro memory record --project /path/to/other-repo --type decision --summary "Belongs to other repo"
```

### Search with branch filter
```bash
# Search current branch only
orquestrador-maestro memory search --branch feat-a

# Search repository scope only
orquestrador-maestro memory search --scope repository
```

### View memory status
```bash
orquestrador-maestro memory status
```

Output:
```json
{
  "repository": "IAPro-Community/Orquestrador-Maestro",
  "repositoryId": "repo_abc123...",
  "workspaceId": "ws_xyz789...",
  "branch": "feat/context-memory-benchmark",
  "detached": false,
  "headCommit": "543b520...",
  "vcs": "git",
  "memory": {
    "repository": 4,
    "byType": { "decision": 2, "discovery": 1, "implementation": 1 },
    "verified": 3
  }
}
```
