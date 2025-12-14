import Docker from "dockerode";
import * as path from "path";
import * as fs from "fs/promises";
import { logger } from "../utils/logger";
import { config } from "../config";
import { ClaudeCodeSession } from "../types";

export class DockerService {
  private docker: Docker;
  private sessions: Map<string, ClaudeCodeSession>;

  constructor() {
    this.docker = new Docker();
    this.sessions = new Map();
  }

  /**
   * Create a workspace directory for a session
   */
  private async createWorkspace(sessionId: string): Promise<string> {
    const workspacePath = path.join(config.docker.workspaceVolume, sessionId);
    await fs.mkdir(workspacePath, { recursive: true });
    logger.info("Workspace created", { sessionId, workspacePath });
    return workspacePath;
  }

  /**
   * Create and start a Claude Code container
   */
  async createSession(
    threadId: string,
    channelId: string,
    userId: string
  ): Promise<ClaudeCodeSession> {
    try {
      const sessionId = threadId;
      const workspacePath = await this.createWorkspace(sessionId);

      logger.info("Creating Claude Code container", { sessionId, threadId });

      // Create container
      const container = await this.docker.createContainer({
        Image: config.docker.imageName,
        name: sessionId,
        Env: [
          `ANTHROPIC_API_KEY=${config.claude.apiKey}`,
          `SESSION_ID=${sessionId}`,
          `THREAD_ID=${threadId}`,
        ],
        HostConfig: {
          Binds: [`${workspacePath}:/workspace`],
          AutoRemove: false,
          NetworkMode: "bridge",
        },
        WorkingDir: "/workspace",
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
      });

      const session: ClaudeCodeSession = {
        id: sessionId,
        containerId: container.id,
        threadId,
        channelId,
        userId,
        status: "running",
        createdAt: new Date(),
      };

      this.sessions.set(sessionId, session);

      // Start container
      await container.start();
      logger.info("Container started", {
        sessionId,
        containerId: container.id,
      });

      return session;
    } catch (error) {
      logger.error("Failed to create session", { error });
      throw error;
    }
  }

  /**
   * Execute a command in a running container
   */
  async executeCommand(
    sessionId: string,
    command: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const container = this.docker.getContainer(session.containerId);

      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
      });

      return new Promise((resolve, reject) => {
        exec.start({ hijack: true, stdin: false }, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }

          let stdout = "";
          let stderr = "";

          if (stream) {
            this.docker.modem.demuxStream(
              stream,
              {
                write: (chunk: Buffer) => {
                  stdout += chunk.toString();
                },
              } as any,
              {
                write: (chunk: Buffer) => {
                  stderr += chunk.toString();
                },
              } as any
            );

            stream.on("end", () => {
              resolve({ stdout, stderr });
            });

            stream.on("error", reject);
          }
        });
      });
    } catch (error) {
      logger.error("Failed to execute command", { error, sessionId });
      throw error;
    }
  }

  /**
   * Get container logs
   */
  async getLogs(sessionId: string): Promise<string> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const container = this.docker.getContainer(session.containerId);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        timestamps: false,
      });

      return logs.toString();
    } catch (error) {
      logger.error("Failed to get logs", { error, sessionId });
      throw error;
    }
  }

  /**
   * Stop and remove a container
   */
  async stopSession(sessionId: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        logger.warn("Session not found", { sessionId });
        return;
      }

      const container = this.docker.getContainer(session.containerId);

      // Stop container
      await container.stop({ t: 10 });
      logger.info("Container stopped", { sessionId });

      // Remove container
      await container.remove();
      logger.info("Container removed", { sessionId });

      // Update session status
      session.status = "completed";
      this.sessions.delete(sessionId);
    } catch (error) {
      logger.error("Failed to stop session", { error, sessionId });
      throw error;
    }
  }

  /**
   * Get workspace files
   */
  async getWorkspaceFiles(
    sessionId: string
  ): Promise<Array<{ path: string; content: string }>> {
    try {
      const workspacePath = path.join(config.docker.workspaceVolume, sessionId);
      const files: Array<{ path: string; content: string }> = [];

      const readDir = async (dir: string, baseDir: string = "") => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(baseDir, entry.name);

          if (entry.isDirectory()) {
            await readDir(fullPath, relativePath);
          } else {
            const content = await fs.readFile(fullPath, "utf-8");
            files.push({ path: relativePath, content });
          }
        }
      };

      await readDir(workspacePath);
      return files;
    } catch (error) {
      logger.error("Failed to get workspace files", { error, sessionId });
      throw error;
    }
  }

  /**
   * Clean up old sessions
   */
  async cleanupOldSessions(maxAgeHours: number = 24): Promise<void> {
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.createdAt.getTime();
      if (age > maxAge) {
        logger.info("Cleaning up old session", { sessionId, age });
        await this.stopSession(sessionId);
      }
    }
  }

  /**
   * Get session by thread ID
   */
  getSessionByThread(threadId: string): ClaudeCodeSession | undefined {
    return Array.from(this.sessions.values()).find(
      (session) => session.threadId === threadId
    );
  }

  /**
   * List all active sessions
   */
  listSessions(): ClaudeCodeSession[] {
    return Array.from(this.sessions.values());
  }
}
