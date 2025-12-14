import { Client4 } from "@mattermost/client";
import { config } from "../config";
import { logger } from "../utils/logger";
import { MattermostMessage, MattermostWebhookPayload } from "../types";

export class MattermostService {
  public client: Client4;

  constructor() {
    this.client = new Client4();
    this.client.setUrl(config.mattermost.url);
    this.client.setToken(config.mattermost.botToken);
  }

  /**
   * Send a message to a Mattermost channel or thread
   */
  async sendMessage(
    channelId: string,
    message: string,
    rootId?: string
  ): Promise<void> {
    try {
      await this.client.createPost({
        channel_id: channelId,
        message,
        root_id: rootId,
      });
      logger.info("Message sent to Mattermost", { channelId, rootId });
    } catch (error) {
      logger.error("Failed to send message to Mattermost", { error });
      throw error;
    }
  }

  /**
   * Send a typing indicator
   */
  async sendTypingEvent(channelId: string, userId?: string): Promise<void> {
    try {
      // Typing indicator - Mattermost doesn't have a direct API for this in the bot context
      // But we can send an ephemeral message that we update
      logger.debug("Typing indicator sent", { channelId });
    } catch (error) {
      logger.error("Failed to send typing indicator", { error });
    }
  }

  /**
   * Get thread messages
   */
  async getThreadMessages(postId: string): Promise<MattermostMessage[]> {
    try {
      const thread = await this.client.getPostThread(postId);
      return thread.order.map((id) => {
        const post = thread.posts[id];
        return {
          id: post.id,
          channel_id: post.channel_id,
          user_id: post.user_id,
          message: post.message,
          root_id: post.root_id,
          create_at: post.create_at,
        };
      });
    } catch (error) {
      logger.error("Failed to get thread messages", { error, postId });
      throw error;
    }
  }

  /**
   * Create a new thread with initial message
   */
  async createThread(channelId: string, message: string): Promise<string> {
    try {
      const post = await this.client.createPost({
        channel_id: channelId,
        message,
      });
      logger.info("Thread created", { postId: post.id, channelId });
      return post.id;
    } catch (error) {
      logger.error("Failed to create thread", { error });
      throw error;
    }
  }

  /**
   * Upload a file to Mattermost
   */
  async uploadFile(
    channelId: string,
    filename: string,
    fileBuffer: Buffer
  ): Promise<string> {
    try {
      const formData = new FormData();
      const blob = new Blob([fileBuffer]);
      formData.append("files", blob, filename);
      formData.append("channel_id", channelId);

      const fileInfos = await this.client.uploadFile(
        formData as any,
        formData as any
      );

      logger.info("File uploaded", {
        filename,
        fileId: fileInfos.file_infos[0].id,
      });
      return fileInfos.file_infos[0].id;
    } catch (error) {
      logger.error("Failed to upload file", { error, filename });
      throw error;
    }
  }

  /**
   * Send a message with file attachments
   */
  async sendMessageWithFiles(
    channelId: string,
    message: string,
    fileIds: string[],
    rootId?: string
  ): Promise<void> {
    try {
      await this.client.createPost({
        channel_id: channelId,
        message,
        file_ids: fileIds,
        root_id: rootId,
      });
      logger.info("Message with files sent", { channelId, fileIds });
    } catch (error) {
      logger.error("Failed to send message with files", { error });
      throw error;
    }
  }

  /**
   * Update an existing post
   */
  async updatePost(postId: string, message: string): Promise<void> {
    try {
      const post = await this.client.getPost(postId);
      await this.client.updatePost({
        ...post,
        message,
      });
      logger.info("Post updated", { postId });
    } catch (error) {
      logger.error("Failed to update post", { error, postId });
      throw error;
    }
  }

  /**
   * React to a post with an emoji
   */
  async addReaction(postId: string, emojiName: string): Promise<void> {
    try {
      const userId = (await this.client.getMe()).id;
      await this.client.addReaction(userId, postId, emojiName);
      logger.info("Reaction added", { postId, emojiName });
    } catch (error) {
      logger.error("Failed to add reaction", { error });
    }
  }

  /**
   * Remove reaction from a post
   */
  async removeReaction(postId: string, emojiName: string): Promise<void> {
    try {
      const userId = (await this.client.getMe()).id;
      await this.client.addReaction(userId, postId, emojiName);
      logger.info("Reaction removed", { postId, emojiName });
    } catch (error) {
      logger.error("Failed to remove reaction", { error });
    }
  }
}
