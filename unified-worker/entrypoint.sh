#!/bin/bash
set -e

echo "Initializing worker environment..."
echo ""
echo "Worker ready. Authentication will be handled via API requests."

# Execute the main command
exec "$@"
