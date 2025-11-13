#!/bin/bash
set -e

echo "🚀 Deploying Full Workflow Stack to Docker Swarm"
echo ""

# Check if Docker Swarm is initialized
if ! docker info | grep -q "Swarm: active"; then
    echo "⚠️  Docker Swarm is not initialized. Initializing..."
    docker swarm init
    echo "✅ Docker Swarm initialized"
else
    echo "✅ Docker Swarm is already active"
fi

# Load environment variables from parent .env file
if [ -f ../.env ]; then
    echo ""
    echo "📋 Loading environment variables from ../.env file..."
    set -a  # Mark all variables for export
    source ../.env
    set +a  # Stop marking variables for export
    echo "✅ Environment variables loaded"
else
    echo "⚠️  Warning: ../.env file not found. Make sure CLAUDE_CODE_CREDENTIALS_JSON is set."
fi

# Create or update Docker secret with credentials
if [ -n "$CLAUDE_CODE_CREDENTIALS_JSON" ]; then
    echo ""
    echo "🔐 Setting up Docker secret for Claude credentials..."
    # Remove existing secret if it exists (ignore error if it doesn't)
    docker secret rm claude_credentials 2>/dev/null || true
    # Create new secret (use printf to avoid newlines)
    printf "%s" "$CLAUDE_CODE_CREDENTIALS_JSON" | docker secret create claude_credentials -
    echo "✅ Docker secret created"
fi

# Build all images
echo ""
echo "🔨 Building Docker images..."
echo "  Building workflow-api..."
docker build -t workflow-api:latest .
echo "  Building github-pull-api..."
docker build -t github-pull-api:latest ../github-pull-api
echo "  Building claude-code-api..."
docker build -t claude-code-api:latest ../claude-code-api

# Deploy the stack
echo ""
echo "📦 Deploying full workflow stack..."
echo "   - 5 workflow-api replicas"
echo "   - 3 github-pull-api replicas"
echo "   - 3 claude-code-api replicas"
docker stack deploy -c swarm.yml workflow-stack

# Wait a moment for deployment
echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Show status
echo ""
echo "📊 Service Status:"
docker service ls

echo ""
echo "📋 Replica Status:"
echo ""
echo "=== Workflow API Replicas ==="
docker service ps workflow-stack_workflow-api | head -10

echo ""
echo "=== GitHub Pull API Replicas ==="
docker service ps workflow-stack_github-pull-api | head -10

echo ""
echo "=== Claude Code API Replicas ==="
docker service ps workflow-stack_claude-code-api | head -10

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📡 Services available:"
echo "   Workflow API:    http://localhost:5000"
echo "   GitHub Pull API: http://localhost:4000"
echo "   Claude Code API: http://localhost:3000"
echo ""
echo "📊 To check service status:"
echo "   docker service ls"
echo "   docker service ps workflow-stack_workflow-api"
echo ""
echo "📝 To view logs:"
echo "   docker service logs workflow-stack_workflow-api -f"
echo ""
echo "🔄 To scale replicas:"
echo "   docker service scale workflow-stack_workflow-api=10"
echo ""
echo "🗑️  To remove the stack:"
echo "   docker stack rm workflow-stack"
