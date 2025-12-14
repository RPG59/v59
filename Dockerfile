# Dockerfile for backend service
FROM node:24-bullseye

# Install Docker CLI to manage containers
RUN curl -fsSL https://get.docker.com -o get-docker.sh && \
    sh get-docker.sh && \
    rm get-docker.sh

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Create workspace volume directory
RUN mkdir -p /tmp/claude-workspaces

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
