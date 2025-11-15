# Unified Worker API Documentation

This document describes the API endpoints for the Unified Worker backend service.

## Base URL

```
http://localhost:5001  # Local development
https://your-domain.com  # Production
```

## Authentication

Authentication is handled **per-request** via the `codingAssistantAuthentication` field in the request body. The backend does not require API keys for the worker endpoints themselves.

---

## Endpoints

### 1. Health Check

**GET** `/health`

Check if the service is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-15T22:33:40.244Z"
}
```

---

### 2. Worker Status

**GET** `/status`

Check if a worker is available to accept jobs.

**Response:**
```json
{
  "status": "idle",
  "timestamp": "2025-11-15T22:33:40.244Z"
}
```

or

```json
{
  "status": "busy",
  "timestamp": "2025-11-15T22:33:40.244Z"
}
```

**Status Codes:**
- `200` - Worker is idle and ready
- `429` - Worker is busy (try another worker or retry later)

---

### 3. Execute Coding Request

**POST** `/execute`

Execute a coding assistant request with real-time streaming output.

**Headers:**
```
Content-Type: application/json
```

**Request Body:**

```typescript
interface ExecuteRequest {
  // Required: The user's coding request
  userRequest: string;

  // Required: Provider to use
  codingAssistantProvider: "ClaudeAgentSDK" | "Codex";

  // Required: Authentication credentials (provider-specific format)
  codingAssistantAuthentication: string | object;

  // Optional: Resume from existing session
  resumeSessionId?: string;

  // Optional: GitHub integration
  github?: {
    repoUrl: string;      // e.g., "https://github.com/user/repo.git"
    branch?: string;      // Default: "main"
    accessToken: string;  // GitHub personal access token
  };

  // Optional: Auto-commit changes after execution
  autoCommit?: boolean;

  // Optional: Provider-specific options
  providerOptions?: {
    model?: string;           // e.g., "claude-sonnet-4-5-20250929"
    skipPermissions?: boolean;
    permissionMode?: "bypassPermissions" | "default";
  };

  // Optional: Database integration (for session tracking)
  database?: {
    sessionId: string;
    accessToken: string;
  };
}
```

**Example Request (New Session):**

```json
{
  "userRequest": "Create a hello.txt file with a greeting",
  "codingAssistantProvider": "ClaudeAgentSDK",
  "codingAssistantAuthentication": {
    "claudeAiOauth": {
      "accessToken": "sk-ant-oat01-...",
      "refreshToken": "sk-ant-ort01-...",
      "expiresAt": 1763273556157,
      "scopes": ["user:inference", "user:profile", "user:sessions:claude_code"],
      "subscriptionType": "max",
      "rateLimitTier": "default_claude_max_5x"
    }
  }
}
```

**Example Request (GitHub + Auto-commit):**

```json
{
  "userRequest": "Add a new feature to handle user authentication",
  "codingAssistantProvider": "ClaudeAgentSDK",
  "codingAssistantAuthentication": {
    "claudeAiOauth": { "..." }
  },
  "github": {
    "repoUrl": "https://github.com/myorg/myrepo.git",
    "branch": "main",
    "accessToken": "gho_..."
  },
  "autoCommit": true
}
```

**Example Request (Resume Session):**

```json
{
  "userRequest": "Now add unit tests for the authentication feature",
  "codingAssistantProvider": "ClaudeAgentSDK",
  "codingAssistantAuthentication": {
    "claudeAiOauth": { "..." }
  },
  "resumeSessionId": "9de73868-722a-4f1e-9c17-080ae9683442"
}
```

**Response:**

Server-Sent Events (SSE) stream with `Content-Type: text/event-stream`.

Each event is in the format:
```
data: <JSON object>\n\n
```

**Event Types:**

```typescript
// Connection established
{
  type: "connected";
  sessionId: string;
  timestamp: string;
}

// Session metadata
{
  type: "session_name";
  sessionName: string;
  branchName?: string;
  timestamp: string;
}

// Progress messages
{
  type: "message";
  message: string;
  timestamp: string;
}

// GitHub clone/pull progress
{
  type: "github_pull_progress";
  stage: "cloning" | "pulling" | "complete";
  message: string;
  targetPath?: string;
  timestamp: string;
}

// Branch created
{
  type: "branch_created";
  branchName: string;
  message: string;
  timestamp: string;
}

// Auto-commit progress
{
  type: "commit_progress";
  stage: "analyzing" | "generating" | "committing" | "committed" | "pushing" | "pushed" | "push_failed";
  message: string;
  commitHash?: string;
  error?: string;
  timestamp: string;
}

// Provider output (forwarded as-is from Claude/Codex)
{
  type: "assistant_message";
  // ... provider-specific fields
}

// Job completed
{
  type: "completed";
  sessionId: string;
  duration_ms: number;
  timestamp: string;
}

// Error occurred
{
  type: "error";
  error: string;
  code: "VALIDATION_ERROR" | "GITHUB_ERROR" | "PROVIDER_ERROR" | "EXECUTION_ERROR" | "UNKNOWN_ERROR";
  timestamp: string;
}
```

**Status Codes:**
- `200` - Success, streaming started
- `400` - Invalid request
- `429` - Worker is busy
- `500` - Internal server error

**JavaScript Example (Fetch API):**

```javascript
const response = await fetch('http://localhost:5001/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userRequest: 'Create a hello.txt file',
    codingAssistantProvider: 'ClaudeAgentSDK',
    codingAssistantAuthentication: {
      claudeAiOauth: {
        accessToken: 'sk-ant-oat01-...',
        refreshToken: 'sk-ant-ort01-...',
        expiresAt: 1763273556157,
        scopes: ['user:inference', 'user:profile', 'user:sessions:claude_code'],
        subscriptionType: 'max',
        rateLimitTier: 'default_claude_max_5x'
      }
    }
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      const event = JSON.parse(data);

      // Handle event based on type
      if (event.type === 'connected') {
        console.log('Session ID:', event.sessionId);
      } else if (event.type === 'message') {
        console.log('Message:', event.message);
      } else if (event.type === 'completed') {
        console.log('Completed in', event.duration_ms, 'ms');
      } else if (event.type === 'error') {
        console.error('Error:', event.error);
      }
    }
  }
}
```

---

### 4. List Sessions

**GET** `/sessions`

Get a list of all sessions stored in MinIO.

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "9de73868-722a-4f1e-9c17-080ae9683442",
      "lastModified": "2025-11-15T22:33:40.244Z"
    }
  ]
}
```

---

### 5. Get Session Details

**GET** `/sessions/:sessionId`

Get metadata for a specific session.

**Response:**
```json
{
  "sessionId": "9de73868-722a-4f1e-9c17-080ae9683442",
  "provider": "ClaudeAgentSDK",
  "providerSessionId": "01JCQM8YXS8WC3VNBK0PXNFWW7",
  "createdAt": "2025-11-15T22:33:35.123Z",
  "updatedAt": "2025-11-15T22:33:42.844Z",
  "github": {
    "repoUrl": "https://github.com/webedt/hello-world.git",
    "branch": "main",
    "clonedPath": "/tmp/session-9de73868-722a-4f1e-9c17-080ae9683442/hello-world"
  }
}
```

**Status Codes:**
- `200` - Success
- `404` - Session not found

---

### 6. Get Session Stream Events

**GET** `/sessions/:sessionId/stream`

Retrieve the stream events (SSE history) for a session.

**Response:**

Array of SSE events that occurred during the session execution.

```json
[
  {
    "type": "connected",
    "sessionId": "9de73868-722a-4f1e-9c17-080ae9683442",
    "timestamp": "2025-11-15T22:33:35.123Z"
  },
  {
    "type": "session_name",
    "sessionName": "Add a hello.txt file with a greeting",
    "branchName": "webedt/add-a-hello-txt-file-with-a-greeting-9de73868",
    "timestamp": "2025-11-15T22:33:35.456Z"
  },
  {
    "type": "completed",
    "sessionId": "9de73868-722a-4f1e-9c17-080ae9683442",
    "duration_ms": 7600,
    "timestamp": "2025-11-15T22:33:42.723Z"
  }
]
```

**Status Codes:**
- `200` - Success
- `404` - Session not found

---

## Error Handling

All errors follow this format:

```json
{
  "error": "Error message description",
  "code": "ERROR_CODE"
}
```

**Error Codes:**
- `VALIDATION_ERROR` - Invalid request parameters
- `GITHUB_ERROR` - GitHub operation failed
- `PROVIDER_ERROR` - Coding assistant provider error
- `EXECUTION_ERROR` - Execution failed
- `UNKNOWN_ERROR` - Unexpected error

---

## Authentication Formats

### ClaudeAgentSDK

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1763273556157,
    "scopes": ["user:inference", "user:profile", "user:sessions:claude_code"],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_5x"
  }
}
```

To obtain Claude OAuth credentials:
1. Visit https://claude.ai
2. Open browser DevTools → Network tab
3. Look for API requests with Authorization headers
4. Extract OAuth credentials

See [CREDENTIALS.md](CREDENTIALS.md) for detailed instructions.

### Codex (Coming Soon)

```json
{
  "apiKey": "your-codex-api-key"
}
```

---

## Rate Limiting

The backend uses Docker Swarm with multiple worker replicas. Each worker can handle one job at a time. If all workers are busy, requests will receive a `429` status.

**Recommended Client Behavior:**
1. Check `/status` before sending requests
2. Implement retry logic with exponential backoff
3. Handle `429` responses by retrying after a delay

---

## Session Persistence

Sessions are stored in MinIO object storage with the following structure:

```
sessions/
└── session-{uuid}/
    ├── .session-metadata.json    # Session metadata
    ├── response/
    │   └── stream-events.jsonl   # SSE event log (JSONL format)
    ├── .claude/                  # Claude state (if using ClaudeAgentSDK)
    └── {repo-name}/              # Cloned repository (if GitHub integration used)
```

Sessions persist across worker restarts and can be resumed using `resumeSessionId`.

---

## Examples

See the `test-*.json` files in the repository for more examples:
- `test-request.json` - Basic execution
- `test-github.json` - GitHub integration
- `test-github-autocommit.json` - GitHub with auto-commit
- `test-resume.json` - Resume existing session

---

## CORS

CORS is enabled for all origins in development. Configure CORS settings via environment variables for production deployments.

---

## Production Deployment

For production, ensure:
1. Use HTTPS for all endpoints
2. Configure proper CORS origins
3. Set up authentication/authorization if needed
4. Use secure MinIO credentials
5. Monitor worker health and scale replicas as needed

See [CLAUDE.md](CLAUDE.md) for deployment instructions.
