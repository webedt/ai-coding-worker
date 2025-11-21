import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';

/**
 * Helper for making one-off LLM requests for commit message generation
 * Uses Haiku for fast, cost-effective responses
 * Supports both API keys and OAuth tokens
 */
export class LLMHelper {
  private client: Anthropic;

  constructor(authToken: string) {
    // Detect if OAuth token (starts with sk-ant-oat) or API key (starts with sk-ant-api)
    if (authToken.startsWith('sk-ant-oat')) {
      // OAuth token - use authToken parameter
      this.client = new Anthropic({ authToken });
    } else {
      // API key - use apiKey parameter
      this.client = new Anthropic({ apiKey: authToken });
    }
  }

  /**
   * Generate a commit message from git diff output
   */
  async generateCommitMessage(gitStatus: string, gitDiff: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `Analyze the following git changes and generate a concise, conventional commit message. Follow these rules:
- Use conventional commit format (e.g., "feat:", "fix:", "refactor:", "docs:", etc.)
- Keep the summary line under 72 characters
- Be specific about what changed
- Only return the commit message, nothing else

Git status:
${gitStatus}

Git diff:
${gitDiff.substring(0, 4000)}

Commit message:`
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from LLM');
      }

      const commitMessage = content.text.trim();

      logger.info('Generated commit message', {
        component: 'LLMHelper',
        commitMessage
      });

      return commitMessage;
    } catch (error) {
      logger.error('Failed to generate commit message', error, {
        component: 'LLMHelper'
      });
      // Fallback commit message
      return 'chore: auto-commit changes';
    }
  }
}
