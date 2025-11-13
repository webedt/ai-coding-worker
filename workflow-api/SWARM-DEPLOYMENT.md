# Docker Swarm Deployment - Full Workflow Stack

Complete orchestration stack with load-balanced, auto-restarting replicas.

## Architecture

```
                    Docker Swarm Ingress Load Balancer
                                  |
                    +-------------+-------------+
                    |             |             |
              Port 5000      Port 4000     Port 3000
                    |             |             |
        +-----------+   +---------+   +---------+
        |               |             |
   Workflow API    GitHub Pull   Claude Code
   5 Replicas      3 Replicas    3 Replicas
        |               |             |
        +---------------+-------------+
                        |
                Shared /workspace Volume
                        |
                Overlay Network
```

## Services

### Workflow API (5 replicas)
- **Port:** 5000
- **Function:** Orchestrates pull + execute workflow
- **Behavior:** Exits after each job, auto-restarts
- **Resources:** 1 CPU, 1G RAM

### GitHub Pull API (3 replicas)
- **Port:** 4000
- **Function:** Clones/pulls repositories
- **Behavior:** Exits after each job, auto-restarts
- **Resources:** 1 CPU, 1G RAM

### Claude Code API (3 replicas)
- **Port:** 3000
- **Function:** Executes Claude Code commands
- **Behavior:** Exits after each job, auto-restarts
- **Resources:** 1 CPU, 2G RAM

## Deployment

### Prerequisites
- Docker Swarm initialized
- Claude credentials in `../.env` file

### Deploy
```bash
cd workflow-api
chmod +x deploy-swarm.sh
./deploy-swarm.sh
```

This will:
1. Initialize Docker Swarm (if needed)
2. Load credentials from `../.env`
3. Create Docker secret for Claude credentials
4. Build all 3 images
5. Deploy stack with 11 total replicas

## Usage

### Simple Workflow Request
```bash
curl -X POST http://localhost:5000/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Add a README file",
    "repoUrl": "https://github.com/user/repo.git"
  }'
```

### Monitor Progress
The response is an SSE stream showing:
- Repository pull progress
- Claude Code execution progress
- Completion status

### Load Balancing
Send multiple concurrent requests - they'll be distributed across the 5 workflow-api replicas automatically.

## Ephemeral Container Model

Each service exits after completing its job:

1. **Request arrives** → Load balancer routes to idle replica
2. **Job executes** → Repo pulled, Claude runs
3. **Container exits** → Process terminates (exit code 0 or 1)
4. **Swarm restarts** → New container starts immediately
5. **Ready for next job** → Cycle repeats

This ensures:
- Clean state for each request
- No memory leaks
- Efficient resource usage
- Automatic recovery from errors

## Scaling

### Scale Individual Services
```bash
# Scale workflow API to 10 replicas
docker service scale workflow-stack_workflow-api=10

# Scale GitHub Pull API
docker service scale workflow-stack_github-pull-api=5

# Scale Claude Code API
docker service scale workflow-stack_claude-code-api=5
```

### Check Status
```bash
# List all services
docker service ls

# Check specific service replicas
docker service ps workflow-stack_workflow-api

# View logs
docker service logs workflow-stack_workflow-api -f
```

## Monitoring

### Service Health
```bash
# Check all services
docker service ls

# Expected output:
# workflow-stack_workflow-api      5/5
# workflow-stack_github-pull-api   3/3
# workflow-stack_claude-code-api   3/3
```

### Replica Status
```bash
# See which replicas are running/restarting
docker service ps workflow-stack_workflow-api

# Shows:
# - Running replicas
# - Recently completed (shutdown) replicas
# - Error states
```

### Logs
```bash
# All workflow API logs
docker service logs workflow-stack_workflow-api

# Follow logs in real-time
docker service logs workflow-stack_workflow-api -f

# Last 50 lines from all services
docker service logs workflow-stack_workflow-api --tail 50
```

## Resource Management

Current allocation per replica:

| Service | CPU Limit | RAM Limit | CPU Reserve | RAM Reserve |
|---------|-----------|-----------|-------------|-------------|
| Workflow API | 1.0 | 1G | 0.25 | 256M |
| GitHub Pull | 1.0 | 1G | 0.25 | 256M |
| Claude Code | 1.0 | 2G | 0.5 | 512M |

Total with current replicas:
- **CPU:** 11 cores max, 4.5 cores reserved
- **RAM:** 14G max, 4.3G reserved

## Troubleshooting

### Replicas keep restarting
```bash
# Check logs for errors
docker service logs workflow-stack_claude-code-api --tail 100

# Common issues:
# - Invalid API credentials
# - Missing Docker secret
# - Port conflicts
```

### No replicas starting
```bash
# Check Docker Swarm status
docker node ls

# Check service status
docker service ps workflow-stack_workflow-api --no-trunc

# Check secret exists
docker secret ls
```

### High restart count
This is **NORMAL**! Ephemeral containers exit after each job.

Each completed job = 1 restart. This is the expected behavior.

## Cleanup

### Remove Stack
```bash
docker stack rm workflow-stack
```

### Remove Secret
```bash
docker secret rm claude_credentials
```

### Leave Swarm
```bash
docker swarm leave --force
```

## Advanced Configuration

### Update swarm.yml

Edit replica counts:
```yaml
deploy:
  replicas: 10  # Increase to 10 workflow replicas
```

Edit resource limits:
```yaml
resources:
  limits:
    cpus: "2.0"      # More CPU per container
    memory: "4G"     # More RAM per container
```

### Update and Redeploy
```bash
# After editing swarm.yml
./deploy-swarm.sh
```

Swarm will perform a rolling update with zero downtime.

## Performance Tips

1. **Scale workflow-api first** - It's the entry point for all requests
2. **Monitor CPU usage** - Scale up if consistently >70%
3. **Monitor restart frequency** - High job volume = more restarts (expected)
4. **Shared workspace** - All replicas see the same `/workspace` volume

## Security Notes

- Credentials stored as Docker secrets (encrypted at rest)
- Secrets only accessible to claude-code-api service
- Non-root users in all containers
- Network isolation via overlay network
- No port conflicts between replicas

## Example Load Test

```bash
# Send 10 concurrent requests
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/workflow \
    -H "Content-Type: application/json" \
    -d "{
      \"prompt\": \"Create test${i}.txt\",
      \"repoUrl\": \"https://github.com/webedt/hello-world.git\"
    }" &
done
wait

# Watch replicas handle the load
watch -n 1 'docker service ps workflow-stack_workflow-api | head -20'
```

You'll see:
- Requests distributed across 5 replicas
- Containers exiting after completion
- New containers starting immediately
- All 5 replicas maintained
