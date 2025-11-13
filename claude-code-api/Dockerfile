# Use Node.js LTS as base image
FROM node:20-slim

# Install system dependencies and Claude Code
RUN apt-get update && apt-get install -y \
    curl \
    git \
    jq \
    bash \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI (using bash since the script requires it)
RUN curl -fsSL https://claude.ai/install.sh | bash

# Create a non-root user
RUN useradd -m -u 1001 -s /bin/bash claude

# Set working directory for the application
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install Node.js dependencies (including Claude Agent SDK)
RUN npm install

# Copy application source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Copy entrypoint script and fix line endings
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

# Create workspace directory
RUN mkdir -p /workspace && chown -R claude:claude /workspace /app

# Switch to non-root user
USER claude

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV WORKSPACE_DIR=/workspace

# Expose API port
EXPOSE 3000

# Use entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
