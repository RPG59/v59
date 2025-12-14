import express, { Request, Response } from "express";
import { config } from "./config";
import { logger } from "./utils/logger";
import { MattermostService } from "./services/MattermostService";
import { DockerService } from "./services/DockerService";
import { ClaudeCodeService } from "./services/ClaudeCodeService";
import { GitLabService } from "./services/GitLabService";
import { MattermostWebhookPayload } from "./types";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize services
const mattermostService = new MattermostService();
const dockerService = new DockerService();
const gitlabService = new GitLabService();
const claudeCodeService = new ClaudeCodeService(
  dockerService,
  mattermostService,
  gitlabService
);

// Start cleanup job
claudeCodeService.startCleanupJob(1, 24);

/**
 * Health check endpoint
 */
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Webhook endpoint for Mattermost
 */
app.post("/webhook/mattermost", async (req: Request, res: Response) => {
  try {
    const payload = req.body as MattermostWebhookPayload;

    logger.info("Received webhook", {
      channel: payload.channel_name,
      user: payload.user_name,
      text: payload.text,
    });

    // Verify webhook token if configured
    if (
      config.mattermost.webhookSecret &&
      payload.token !== config.mattermost.webhookSecret
    ) {
      logger.warn("Invalid webhook token");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Respond immediately to Mattermost
    res.status(200);
    // res.status(200).json({ text: "Processing your request..." });

    // Process message asynchronously
    const threadId = payload.root_id || payload.post_id;
    const channelId = payload.channel_id;
    const userId = payload.user_id;
    const message = payload.text;

    // Process in background
    setImmediate(async () => {
      try {
        await claudeCodeService.processMessage(
          channelId,
          threadId,
          userId,
          message
        );
      } catch (error) {
        logger.error("Error processing message in background", { error });
      }
    });
  } catch (error) {
    logger.error("Error handling webhook", { error });
    res.status(500);
    // res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Slash command endpoint for Mattermost
 */
app.post("/command/claude", async (req: Request, res: Response) => {
  try {
    const payload = req.body as MattermostWebhookPayload;

    logger.info("Received slash command", {
      channel: payload.channel_name,
      user: payload.user_name,
      text: payload.text,
    });

    // Parse command
    const commandParts = payload.text.trim().split(" ");
    const action = commandParts[0];

    if (action === "stop") {
      // Stop the current session
      const threadId = payload.root_id || payload.post_id;
      await claudeCodeService.stopSession(threadId);
      res.json({
        response_type: "in_channel",
        text: "✅ Claude Code session stopped.",
      });
      return;
    }

    if (action === "help") {
      res.json({
        response_type: "ephemeral",
        text: `**Claude Code Commands:**
- Just mention the bot or reply in a thread to interact with Claude Code
- \`/claude stop\` - Stop the current Claude Code session
- \`/claude help\` - Show this help message`,
      });
      return;
    }

    // Default: treat as a message to Claude Code
    const threadId = payload.root_id || payload.post_id;
    const channelId = payload.channel_id;
    const userId = payload.user_id;
    const message = payload.text;

    res.json({
      response_type: "in_channel",
      text: "Processing your request...",
    });

    // Process in background
    setImmediate(async () => {
      try {
        await claudeCodeService.processMessage(
          channelId,
          threadId,
          userId,
          message
        );
      } catch (error) {
        logger.error("Error processing slash command in background", { error });
      }
    });
  } catch (error) {
    logger.error("Error handling slash command", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Admin endpoint to list active sessions
 */
app.get("/admin/sessions", (req: Request, res: Response) => {
  try {
    const sessions = dockerService.listSessions();
    res.json({
      count: sessions.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        threadId: s.threadId,
        channelId: s.channelId,
        status: s.status,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    logger.error("Error listing sessions", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Admin endpoint to stop a session
 */
app.post(
  "/admin/sessions/:sessionId/stop",
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      await dockerService.stopSession(sessionId);
      res.json({ success: true, message: "Session stopped" });
    } catch (error) {
      logger.error("Error stopping session", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * Admin endpoint to stop all active sessions
 */
app.post("/admin/sessions/stop-all", async (req: Request, res: Response) => {
  try {
    const sessions = dockerService.listSessions();
    logger.info("Stopping all sessions", { count: sessions.length });

    const results = await Promise.allSettled(
      sessions.map(async (session) => {
        await dockerService.stopSession(session.id);
        return session.id;
      })
    );

    const stopped = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    res.json({
      success: true,
      message: "All sessions processed",
      total: sessions.length,
      stopped,
      failed,
    });
  } catch (error) {
    logger.error("Error stopping all sessions", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Interactive button handler for Mattermost
 */
app.post("/interactive", async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};

    logger.info("Received interactive button", {
      action: payload.context?.action,
      threadId: payload.context?.thread_id,
    });

    const action = payload.context?.action;
    const threadId = payload.context?.thread_id;
    const channelId = payload.channel_id;

    console.log(req.body);

    if (action === "push_to_gitlab") {
      // Respond immediately and disable the button by removing attachments
      res.json({
        update: {
          message: "🔄 Pushing to GitLab...",
          props: {
            attachments: [],
          },
        },
      });

      // Process in background
      setImmediate(async () => {
        try {
          const projectId = config.gitlab.defaultProjectId;
          if (!projectId) {
            await mattermostService.sendMessage(
              channelId,
              "❌ GitLab project ID not configured",
              threadId
            );
            return;
          }

          const result = await gitlabService.pushWorkspaceToRepo(
            threadId,
            projectId
          );

          if (result.success) {
            await mattermostService.sendMessage(
              channelId,
              `✅ Successfully pushed to GitLab!\n\n` +
                `📦 Commit: ${result.commitId}\n` +
                `🔗 [View commit](${result.webUrl})`,
              threadId
            );
          } else {
            await mattermostService.sendMessage(
              channelId,
              `❌ Failed to push to GitLab: ${result.error}`,
              threadId
            );
          }
        } catch (error) {
          logger.error("Error processing GitLab push", { error });
          await mattermostService.sendMessage(
            channelId,
            `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            threadId
          );
        }
      });
    } else {
      res.json({ text: "Unknown action" });
    }
  } catch (error) {
    logger.error("Error handling interactive button", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Serve files from specific thread workspace
 */
app.get("/workspace/:threadId/*", (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const filePath = req.params[0]; // Everything after threadId
    const fullPath = `${config.docker.workspaceVolume}/${threadId}/${filePath}`;

    logger.info("Serving workspace file", { threadId, filePath, fullPath });
    res.sendFile(fullPath, (err) => {
      if (err) {
        logger.error("Error sending file", { error: err, fullPath });
        res.status(404).json({ error: "File not found" });
      }
    });
  } catch (error) {
    logger.error("Error serving workspace file", { error });
    res.status(404).json({ error: "File not found" });
  }
});

// Start server
app.listen(config.server.port, config.server.host, () => {
  logger.info(`Server started on ${config.server.host}:${config.server.port}`);
  logger.info("Environment:", {
    mattermostUrl: config.mattermost.url,
    dockerImage: config.docker.imageName,
    workspaceVolume: config.docker.workspaceVolume,
    publicUrl: config.server.publicUrl,
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  // Clean up all sessions
  const sessions = dockerService.listSessions();
  for (const session of sessions) {
    await dockerService.stopSession(session.id);
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  // Clean up all sessions
  const sessions = dockerService.listSessions();
  for (const session of sessions) {
    await dockerService.stopSession(session.id);
  }
  process.exit(0);
});
