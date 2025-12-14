export interface MattermostMessage {
  id: string;
  channel_id: string;
  user_id: string;
  message: string;
  root_id?: string; // For thread replies
  create_at: number;
}

export interface MattermostWebhookPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  timestamp: number;
  user_id: string;
  user_name: string;
  post_id: string;
  text: string;
  trigger_word: string;
  file_ids?: string;
  root_id?: string;
}

export interface ClaudeCodeSession {
  id: string;
  containerId: string;
  threadId: string;
  channelId: string;
  userId: string;
  status: 'running' | 'completed' | 'failed';
  createdAt: Date;
}

export interface ClaudeCodeResponse {
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: Array<{
    type: 'file' | 'code';
    path: string;
    content: string;
  }>;
}

export interface Config {
  mattermost: {
    url: string;
    token: string;
    botToken: string;
    webhookSecret: string;
    teamId: string;
  };
  claude: {
    apiKey: string;
  };
  openrouter: {
    apiKey: string;
  }
  server: {
    port: number;
    host: string;
    publicUrl: string;
  };
  docker: {
    imageName: string;
    workspaceVolume: string;
  };
  gitlab: {
    url: string;
    token: string;
    defaultProjectId?: string;
    defaultBranch: string;
  };
}
