import express, { Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import http from 'http';

const app = express();
const PORT = process.env.PORT || 5000;
const GITHUB_PULL_API = process.env.GITHUB_PULL_API || 'http://github-pull-api:4000';
const CLAUDE_CODE_API = process.env.CLAUDE_CODE_API || 'http://claude-code-api:3000';

// Middleware
app.use(cors());
app.use(express.json());

// Track server status
let serverStatus: 'idle' | 'busy' = 'idle';

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    services: {
      githubPullApi: GITHUB_PULL_API,
      claudeCodeApi: CLAUDE_CODE_API,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Status endpoint
 */
app.get('/status', (req: Request, res: Response) => {
  res.json({
    status: serverStatus,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Make HTTP POST request and stream SSE response
 */
function streamSSE(url: string, data: any, onData: (data: string) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const payload = JSON.stringify(data);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (response) => {
      let buffer = '';
      let lastEventData: any = null;

      response.on('data', (chunk) => {
        buffer += chunk.toString();

        // Process complete SSE messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';  // Keep incomplete message in buffer

        for (const message of lines) {
          if (message.startsWith('data: ')) {
            const jsonStr = message.substring(6);
            try {
              const data = JSON.parse(jsonStr);
              lastEventData = data;
              onData(jsonStr);
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });

      response.on('end', () => {
        resolve(lastEventData);
      });

      response.on('error', reject);
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Workflow endpoint: Pull repo + Execute Claude Code
 * Request: { prompt, repoUrl, branch?, directory? }
 * Response: SSE stream with progress and results
 */
app.post('/api/workflow', async (req: Request, res: Response) => {
  const { prompt, repoUrl, branch, directory } = req.body;

  if (!prompt || !repoUrl) {
    res.status(400).json({ error: 'prompt and repoUrl are required' });
    return;
  }

  serverStatus = 'busy';
  const workflowId = randomUUID();

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    res.write(`data: ${JSON.stringify({
      type: 'workflow_started',
      workflowId,
      step: 1,
      stepName: 'pull_repository',
      prompt,
      repoUrl,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    // Step 1: Pull the repository using GitHub Pull API
    const pullUrl = `${GITHUB_PULL_API}/api/pull`;

    res.write(`data: ${JSON.stringify({
      type: 'message',
      message: `Pulling repository: ${repoUrl}`,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    let targetPath = '';
    await streamSSE(pullUrl, { repoUrl, branch, directory }, (data) => {
      // Forward pull progress to client
      res.write(`data: ${JSON.stringify({
        type: 'pull_progress',
        data: JSON.parse(data),
        timestamp: new Date().toISOString(),
      })}\n\n`);

      // Extract target path
      try {
        const parsed = JSON.parse(data);
        if (parsed.targetPath) {
          targetPath = parsed.targetPath;
        }
      } catch (e) {
        // Ignore
      }
    });

    res.write(`data: ${JSON.stringify({
      type: 'workflow_step_complete',
      step: 1,
      stepName: 'pull_repository',
      targetPath,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    // Step 2: Execute Claude Code with the prompt and workspace
    res.write(`data: ${JSON.stringify({
      type: 'workflow_started',
      workflowId,
      step: 2,
      stepName: 'execute_claude_code',
      prompt,
      workspace: targetPath,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    const executeUrl = `${CLAUDE_CODE_API}/api/execute`;

    res.write(`data: ${JSON.stringify({
      type: 'message',
      message: `Executing Claude Code in workspace: ${targetPath}`,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    await streamSSE(executeUrl, {
      prompt,
      workspace: targetPath,
      dangerouslySkipPermissions: true,
    }, (data) => {
      // Forward Claude Code progress to client
      res.write(`data: ${data}\n\n`);
    });

    res.write(`data: ${JSON.stringify({
      type: 'workflow_complete',
      workflowId,
      timestamp: new Date().toISOString(),
    })}\n\n`);

    res.end();

    // Exit process after completion (ephemeral container model)
    console.log('Workflow completed successfully. Exiting process...');
    setTimeout(() => process.exit(0), 1000);

  } catch (error) {
    console.error('Workflow error:', error);

    res.write(`data: ${JSON.stringify({
      type: 'workflow_error',
      workflowId,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })}\n\n`);

    res.end();

    // Exit process after error
    console.log('Workflow failed. Exiting process...');
    setTimeout(() => process.exit(1), 1000);
  }
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log(`🚀 Workflow API Server running on port ${PORT}`);
  console.log(`📊 Status: ${serverStatus}`);
  console.log(`\nConnected services:`);
  console.log(`  GitHub Pull API: ${GITHUB_PULL_API}`);
  console.log(`  Claude Code API: ${CLAUDE_CODE_API}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /status`);
  console.log(`  POST /api/workflow (exits process when complete)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
