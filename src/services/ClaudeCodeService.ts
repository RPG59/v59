import { logger } from "../utils/logger";
import { DockerService } from "./DockerService";
import { MattermostService } from "./MattermostService";
import { GitLabService } from "./GitLabService";
import { ClaudeCodeResponse } from "../types";
import * as path from "path";

export class ClaudeCodeService {
  private dockerService: DockerService;
  private mattermostService: MattermostService;
  private gitlabService: GitLabService;

  constructor(
    dockerService: DockerService,
    mattermostService: MattermostService,
    gitlabService: GitLabService
  ) {
    this.dockerService = dockerService;
    this.mattermostService = mattermostService;
    this.gitlabService = gitlabService;
  }

  /**
   * Process a user message from Mattermost
   */
  async processMessage(
    channelId: string,
    threadId: string,
    userId: string,
    message: string
  ): Promise<void> {
    try {
      logger.info("Processing message", { channelId, threadId, message });

      // Check if session exists for this thread
      let session = this.dockerService.getSessionByThread(threadId);

      // If no session exists, create one
      if (!session) {
        await this.mattermostService.addReaction(threadId, "hourglass");
        session = await this.dockerService.createSession(
          threadId,
          channelId,
          userId
        );
        await this.mattermostService.sendMessage(
          channelId,
          "🤖 Starting Code-Generation session...",
          threadId
        );
      }

      // Send typing indicator
      await this.mattermostService.addReaction(threadId, "eyes");

      // Execute the message in Claude Code
      const response = await this.executeClaudeCode(session.id, message);

      // Remove working indicator
      await this.mattermostService.removeReaction(threadId, "eyes");

      // Send response back to Mattermost
      if (response.success && response.output) {
        await this.mattermostService.sendMessage(
          channelId,
          response.output,
          threadId
        );
      }

      // Handle artifacts (files created by Claude Code)
      if (response.artifacts && response.artifacts.length > 0) {
        await this.handleArtifacts(
          session.id,
          channelId,
          threadId,
          response.artifacts
        );
      }

      // Add completion reaction
      await this.mattermostService.addReaction(threadId, "white_check_mark");

      if (response.error) {
        await this.mattermostService.sendMessage(
          channelId,
          `❌ Error: ${response.error}`,
          threadId
        );
        await this.mattermostService.addReaction(threadId, "x");
      }
    } catch (error) {
      logger.error("Failed to process message", { error });
      await this.mattermostService.sendMessage(
        channelId,
        `❌ An error occurred: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        threadId
      );
      await this.mattermostService.addReaction(threadId, "x");
    }
  }

  /**
   * Execute Claude Code command
   */
  private async executeClaudeCode(
    sessionId: string,
    userMessage: string
  ): Promise<ClaudeCodeResponse> {
    try {
      // Write user message to a file in the workspace
      const messageFile = `/workspace/user_message_${Date.now()}.txt`;
      await this.dockerService.executeCommand(sessionId, [
        "sh",
        "-c",
        `echo "${userMessage.replace(/"/g, '\\"')}" > ${messageFile}`,
      ]);

      // Execute Claude Code with the message
      const result = await this.dockerService.executeCommand(sessionId, [
        "ccr",
        "code",
        "--allowedTools",
        "Bash,Read",
        "--permission-mode",
        "acceptEdits",
        "-p",
        userMessage,
      ]);

      // Get workspace files to check for artifacts
      const files = await this.dockerService.getWorkspaceFiles(sessionId);

      return {
        success: !result.stderr,
        output: result.stdout,
        error: result.stderr || undefined,
        artifacts: files.map((file) => ({
          type: this.getFileType(file.path),
          path: file.path,
          content: file.content,
        })),
      };
    } catch (error) {
      logger.error("Failed to execute Claude Code", { error, sessionId });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Handle artifacts created by Claude Code
   */
  private async handleArtifacts(
    sessionId: string,
    channelId: string,
    threadId: string,
    artifacts: Array<{ type: "file" | "code"; path: string; content: string }>
  ): Promise<void> {
    try {
      logger.info("Handling artifacts", { sessionId, count: artifacts.length });

      if (artifacts.length === 0) {
        return;
      }

      // Import config here to avoid circular dependency
      const { config } = await import("../config");

      // Group artifacts by type
      const codeFiles = artifacts.filter(
        (a) => a.type === "code" || this.isCodeFile(a.path)
      );
      const otherFiles = artifacts.filter(
        (a) => a.type === "file" && !this.isCodeFile(a.path)
      );

      let message = "📦 **Generated Files:**\n\n";

      // Add code files with preview and links
      if (codeFiles.length > 0) {
        message += "**Code Files:**\n";
        for (const artifact of codeFiles) {
          const fileUrl = `${config.server.publicUrl}/workspace/${threadId}/${artifact.path}`;
          message += `- [${artifact.path}](${fileUrl})\n`;
        }
        message += "\n";
      }

      // Add other files with links
      if (otherFiles.length > 0) {
        message += "**Other Files:**\n";
        for (const artifact of otherFiles) {
          const fileUrl = `${config.server.publicUrl}/workspace/${threadId}/${artifact.path}`;
          message += `- [${artifact.path}](${fileUrl})\n`;
        }
        message += "\n";
      }

      message += `\nTotal: ${artifacts.length} file(s)\n`;
      message += `\n📁 [Browse all files](${config.server.publicUrl}/workspace/${threadId}/)`;

      await this.mattermostService.sendMessage(channelId, message, threadId);

      // Send message with GitLab push button
      if (config.gitlab.defaultProjectId && config.gitlab.token) {
        await this.sendMessageWithGitLabButton(channelId, threadId);
      }

      // Optionally, show a code preview for the first code file
      if (codeFiles.length > 0) {
        const firstFile = codeFiles[0];
        const extension = path.extname(firstFile.path).substring(1);
        // Limit preview to 50 lines
        const lines = firstFile.content.split("\n");
        const preview =
          lines.length > 50
            ? lines.slice(0, 50).join("\n") + "\n... (truncated)"
            : firstFile.content;
        const codeBlock = `\`\`\`${extension}\n${preview}\n\`\`\``;

        await this.mattermostService.sendMessage(
          channelId,
          `**Preview of ${firstFile.path}:**\n${codeBlock}`,
          threadId
        );
      }
    } catch (error) {
      logger.error("Failed to handle artifacts", { error });
    }
  }

  /**
   * Determine if a file is a code file based on extension
   */
  private isCodeFile(filePath: string): boolean {
    const codeExtensions = [
      ".ts",
      ".js",
      ".tsx",
      ".jsx",
      ".py",
      ".java",
      ".c",
      ".cpp",
      ".go",
      ".rs",
      ".rb",
      ".php",
      ".swift",
      ".kt",
      ".cs",
      ".html",
      ".css",
      ".scss",
      ".json",
      ".yaml",
      ".yml",
      ".toml",
      ".md",
      ".sh",
      ".bash",
    ];
    return codeExtensions.some((ext) => filePath.endsWith(ext));
  }

  /**
   * Get file type based on extension
   */
  private getFileType(filePath: string): "file" | "code" {
    return this.isCodeFile(filePath) ? "code" : "file";
  }

  /**
   * Send message with GitLab push button
   */
  private async sendMessageWithGitLabButton(
    channelId: string,
    threadId: string
  ): Promise<void> {
    try {
      const { config } = await import("../config");

      // Mattermost message attachments with actions
      const attachment = {
        text: "Want to push these files to GitLab?",
        actions: [
          {
            name: "Push to GitLab",
            integration: {
              url: `${config.server.publicUrl}/interactive`,
              // url: `http://host.docker.internal:3000/interactive`,
              context: {
                action: "push_to_gitlab",
                thread_id: threadId,
              },
            },
          },
        ],
      };

      // Send post with attachment
      await this.mattermostService.client.createPost({
        channel_id: channelId,
        root_id: threadId,
        message: "🚀 **GitLab Integration**",
        props: {
          attachments: [attachment],
        },
      });

      logger.info("GitLab button sent", { channelId, threadId });
    } catch (error) {
      logger.error("Failed to send GitLab button", { error });
    }
  }

  /**
   * Stop a session
   */
  async stopSession(threadId: string): Promise<void> {
    const session = this.dockerService.getSessionByThread(threadId);
    if (session) {
      await this.dockerService.stopSession(session.id);
      logger.info("Session stopped", { threadId, sessionId: session.id });
    }
  }

  /**
   * Clean up old sessions periodically
   */
  startCleanupJob(intervalHours: number = 1, maxAgeHours: number = 24): void {
    setInterval(async () => {
      logger.info("Running cleanup job");
      await this.dockerService.cleanupOldSessions(maxAgeHours);
    }, intervalHours * 60 * 60 * 1000);
  }
}
