import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider, ProviderOptions, ProviderStreamEvent } from './BaseProvider';
import { CredentialManager } from '../utils/credentialManager';

/**
 * Claude Code provider implementation
 */
export class ClaudeCodeProvider extends BaseProvider {
  private model: string;

  constructor(authentication: string, workspace: string, model?: string) {
    super(authentication, workspace);
    this.model = model || 'claude-sonnet-4-5-20250929';

    // Write authentication to ~/.claude/.credentials.json
    CredentialManager.writeClaudeCredentials(authentication);
  }

  /**
   * Execute a user request using Claude Code
   */
  async execute(
    userRequest: string,
    options: ProviderOptions,
    onEvent: (event: ProviderStreamEvent) => void
  ): Promise<void> {
    const queryOptions = this.createQueryOptions(options);

    try {
      const queryStream = query({
        prompt: userRequest,
        options: queryOptions
      });

      // Stream messages from Claude Code
      for await (const message of queryStream) {
        onEvent({
          type: 'assistant_message',
          data: message
        });
      }

      // Success - no explicit completion event needed
      // The orchestrator will handle completion
    } catch (error) {
      // Re-throw to let orchestrator handle
      throw error;
    }
  }

  /**
   * Validate Claude Code authentication
   * Verifies that credentials are written to ~/.claude/.credentials.json
   */
  async validateToken(): Promise<boolean> {
    try {
      const credPath = CredentialManager.getClaudeCredentialPath();
      return CredentialManager.credentialFileExists(credPath);
    } catch (error) {
      console.error('[ClaudeCodeProvider] Token validation failed:', error);
      return false;
    }
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return 'claude-code';
  }

  /**
   * Create Claude Code query options
   */
  private createQueryOptions(options: ProviderOptions): Options {
    const { resumeSessionId, providerOptions = {} } = options;

    const skipPermissions = providerOptions.skipPermissions ?? true;

    const queryOptions: Options = {
      model: providerOptions.model || this.model,
      cwd: this.workspace,
      systemPrompt: `You are Claude Code, running in a containerized environment. The working directory is ${this.workspace}.`,
      allowDangerouslySkipPermissions: skipPermissions,
      permissionMode: skipPermissions ? 'bypassPermissions' : 'default',
    };

    // Add resume option if session ID is provided
    if (resumeSessionId) {
      queryOptions.resume = resumeSessionId;
    }

    return queryOptions;
  }
}
