#!/bin/bash

# Build Claude Code Docker image
echo "Building Claude Code Docker image..."

docker build -t claude-code-runner:latest -f docker/Dockerfile.claude-code .

if [ $? -eq 0 ]; then
    echo "✅ Claude Code image built successfully!"
    echo "Image: claude-code-runner:latest"
else
    echo "❌ Failed to build Claude Code image"
    exit 1
fi
