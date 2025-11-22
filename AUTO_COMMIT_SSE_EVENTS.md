# Auto-Commit SSE Event Flow

This document describes the Server-Sent Events (SSE) that are sent during the auto-commit process.

## Event Sequence

When auto-commit is enabled (default for GitHub repositories), the following SSE events are sent in order:

### 1. **Analyzing Changes**
```json
{
  "type": "commit_progress",
  "stage": "analyzing",
  "message": "Analyzing changes for auto-commit...",
  "branch": "claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET",
  "timestamp": "2025-11-22T10:30:00.000Z"
}
```

### 2. **Generating Commit Message**
```json
{
  "type": "commit_progress",
  "stage": "generating_message",
  "message": "Generating commit message...",
  "branch": "claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET",
  "timestamp": "2025-11-22T10:30:01.000Z"
}
```

### 3. **Attempting Commit**
```json
{
  "type": "commit_progress",
  "stage": "committing",
  "message": "Attempting to commit changes to branch: claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET",
  "branch": "claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET",
  "commitMessage": "feat: Add SSE progress events for auto-commit process",
  "timestamp": "2025-11-22T10:30:03.000Z"
}
```

### 4. **Commit Success**
```json
{
  "type": "commit_progress",
  "stage": "committed",
  "message": "Changes committed successfully",
  "branch": "claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET",
  "commitMessage": "feat: Add SSE progress events for auto-commit process",
  "commitHash": "abc123def456",
  "timestamp": "2025-11-22T10:30:04.000Z"
}
```

### 5. **Attempting Push**
```json
{
  "type": "commit_progress",
  "stage": "pushing",
  "message": "Attempting to push branch claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET to remote...",
  "branch": "claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET",
  "commitHash": "abc123def456",
  "timestamp": "2025-11-22T10:30:05.000Z"
}
```

### 6a. **Push Success** (if push succeeds)
```json
{
  "type": "commit_progress",
  "stage": "pushed",
  "message": "Successfully pushed branch claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET to remote",
  "branch": "claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET",
  "commitHash": "abc123def456",
  "timestamp": "2025-11-22T10:30:07.000Z"
}
```

### 6b. **Push Failed** (if push fails)
```json
{
  "type": "commit_progress",
  "stage": "push_failed",
  "message": "Failed to push branch claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET to remote (commit saved locally)",
  "branch": "claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET",
  "error": "Error: Authentication failed",
  "timestamp": "2025-11-22T10:30:07.000Z"
}
```

### 7. **Completion**
```json
{
  "type": "commit_progress",
  "stage": "completed",
  "message": "Auto-commit process completed",
  "branch": "claude/auto-commit-sse-progress-01BEUZZtczXe7YZVpNCPvxET",
  "timestamp": "2025-11-22T10:30:08.000Z"
}
```

## Error Handling

If the entire auto-commit process fails (before commit is created):

```json
{
  "type": "commit_progress",
  "stage": "completed",
  "message": "Auto-commit failed (non-critical)",
  "error": "Error: Unable to generate commit message",
  "timestamp": "2025-11-22T10:30:08.000Z"
}
```

## Event Fields

All events include:
- **type**: Always `"commit_progress"`
- **stage**: Current stage of the process (see stages below)
- **message**: Human-readable description
- **branch**: Git branch name (when available)
- **timestamp**: ISO 8601 timestamp

Optional fields based on stage:
- **commitMessage**: The generated commit message (stages: committing, committed)
- **commitHash**: The commit SHA hash (stages: committed, pushing, pushed)
- **error**: Error message if something failed (stages: push_failed, completed with error)

## Stages

1. `analyzing` - Checking for changes
2. `generating_message` - Using LLM to create commit message
3. `committing` - Attempting to create commit
4. `committed` - Commit created successfully
5. `pushing` - Attempting to push to remote
6. `pushed` - Successfully pushed to remote
7. `push_failed` - Failed to push (non-critical, commit still saved)
8. `completed` - Process finished (success or failure)

## Implementation Location

- **Type Definition**: `src/types.ts:116-124` (CommitProgressEvent interface)
- **Event Generation**: `src/orchestrator.ts:288-435` (Auto-commit logic)
- **Git Operations**: `src/utils/gitHelper.ts` (GitHelper class)
- **Commit Message Generation**: `src/utils/llmHelper.ts` (LLMHelper class)

## Testing

To test the auto-commit SSE events:

```bash
curl -X POST http://localhost:5000/execute \
  -H "Content-Type: application/json" \
  -d @test-github.json \
  --no-buffer
```

Ensure your test request includes:
- `github.repoUrl` - Repository to clone
- `github.accessToken` - GitHub token with push permissions
- `autoCommit: true` - Enable auto-commit (default for GitHub repos)

The `--no-buffer` flag is critical for seeing real-time SSE events.
