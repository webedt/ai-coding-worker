# Workflow API

Orchestrator API that combines GitHub Pull API and Claude Code API into a single workflow.

## How It Works

1. **User sends request** with:
   - `prompt`: What you want Claude to do
   - `repoUrl`: GitHub repository to pull

2. **Workflow executes**:
   - Step 1: Pulls/clones the repository
   - Step 2: Executes Claude Code with the prompt in that workspace

3. **Response streamed** via Server-Sent Events (SSE)

## API Endpoints

### POST /api/workflow
Execute the full workflow: pull repo + run Claude Code

**Request Body:**
```json
{
  "prompt": "Add a README.md file explaining the project",
  "repoUrl": "https://github.com/user/repo.git",
  "branch": "main",
  "directory": "custom-folder-name"
}
```

**SSE Stream Events:**
```
data: {"type":"workflow_started","workflowId":"...","step":1,"stepName":"pull_repository"}

data: {"type":"pull_progress","message":"Cloning repository..."}

data: {"type":"workflow_step_complete","step":1,"targetPath":"/workspace/repo"}

data: {"type":"workflow_started","step":2,"stepName":"execute_claude_code"}

data: {"type":"claude_progress","message":"..."}

data: {"type":"workflow_complete","workflowId":"..."}
```

### GET /health
Health check for the workflow orchestrator

### GET /status
Check if the orchestrator is idle or busy

## Usage

### Using cURL
```bash
curl -X POST http://localhost:5000/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a hello.txt file with hello world",
    "repoUrl": "https://github.com/webedt/hello-world.git"
  }'
```

### Using JavaScript
```javascript
const eventSource = new EventSource('http://localhost:5000/api/workflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Add unit tests',
    repoUrl: 'https://github.com/user/repo.git'
  })
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

## Environment Variables

- `PORT` - Server port (default: 5000)
- `GITHUB_PULL_API` - GitHub Pull API URL (default: http://github-pull-api:4000)
- `CLAUDE_CODE_API` - Claude Code API URL (default: http://claude-code-api:3000)
- `NODE_ENV` - Node environment (default: production)

## Architecture

The Workflow API acts as an orchestrator:
```
User Request
    ↓
Workflow API (port 5000)
    ├→ GitHub Pull API (port 4000) - Clone/pull repo
    └→ Claude Code API (port 3000) - Execute prompt
    ↓
Streamed Response
```

All three services share the same `/workspace` volume, ensuring:
- GitHub Pull API writes repos to `/workspace/{repo-name}`
- Claude Code API reads from `/workspace/{repo-name}`
- Changes persist across container restarts

## Deployment

### Docker Compose (All Services)
```bash
cd docker-claude-code
docker-compose -f docker-compose-full.yml up --build
```

This starts all three services:
- Workflow API: http://localhost:5000
- Claude Code API: http://localhost:3000
- GitHub Pull API: http://localhost:4000

## Ephemeral Container Model

Like the individual APIs, the Workflow API exits after completing each workflow. Combined with Docker's restart policy, this ensures:
- Clean state for each workflow
- Efficient resource usage
- Automatic recovery from errors
