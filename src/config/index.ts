import dotenv from 'dotenv';
import { Config } from '../types';

dotenv.config();

export const config: Config = {
  mattermost: {
    url: process.env.MATTERMOST_URL || 'http://localhost:8065',
    token: process.env.MATTERMOST_TOKEN || '',
    botToken: process.env.MATTERMOST_BOT_TOKEN || '',
    webhookSecret: process.env.MATTERMOST_WEBHOOK_SECRET || '',
    teamId: process.env.MATTERMOST_TEAM_ID || '',
  },
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',
  },
  docker: {
    imageName: process.env.DOCKER_IMAGE_NAME || 'claude-code-runner',
    workspaceVolume: process.env.WORKSPACE_VOLUME || '/tmp/claude-workspaces',
  },
  gitlab: {
    url: process.env.GITLAB_URL || 'https://gitlab.com',
    token: process.env.GITLAB_TOKEN || '',
    defaultProjectId: process.env.GITLAB_PROJECT_ID,
    defaultBranch: process.env.GITLAB_DEFAULT_BRANCH || 'main',
  },
};

// Validate required config
const requiredEnvVars = [
  'MATTERMOST_URL',
  'MATTERMOST_BOT_TOKEN',
  'ANTHROPIC_API_KEY',
];

const missingVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);

if (missingVars.length > 0) {
  console.warn(
    `Warning: Missing environment variables: ${missingVars.join(', ')}`
  );
}
