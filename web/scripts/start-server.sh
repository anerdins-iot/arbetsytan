#!/bin/bash
# Start server script for agents
# Automatically kills any existing process on the port before starting

set -e

PORT="${PORT:-3000}"
PID_FILE="/workspace/web/.server.pid"

# Function to get PID listening on port
get_port_pid() {
  ss -tlnp 2>/dev/null | grep ":$PORT " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1
}

# Kill existing process from PID file if it exists
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Killing previous server (PID: $OLD_PID)..."
    kill -TERM "$OLD_PID" 2>/dev/null || true
    sleep 2
  fi
  rm -f "$PID_FILE"
fi

# Kill any process listening on the port
LISTENING_PID=$(get_port_pid)
if [ -n "$LISTENING_PID" ]; then
  echo "Killing process on port $PORT (PID: $LISTENING_PID)..."
  kill -TERM "$LISTENING_PID" 2>/dev/null || true
  sleep 2
fi

# Build application
cd /workspace/web
echo "Building application..."
npm run build

# Load .env explicitly (override any empty container env vars like ANTHROPIC_API_KEY)
if [ -f ".env" ]; then
  set -a
  source .env
  set +a
  echo "Loaded .env"
fi

# Start the server
echo "Starting server on port $PORT..."
NODE_ENV=production npx tsx server.ts > /tmp/server.log 2>&1 &

# Wait for server to be ready and capture the actual server PID
echo "Waiting for server to be ready..."
for i in {1..30}; do
  SERVER_PID=$(get_port_pid)
  if [ -n "$SERVER_PID" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" != "000" ]; then
      echo "$SERVER_PID" > "$PID_FILE"
      echo "Server is ready (PID: $SERVER_PID)"
      exit 0
    fi
  fi
  sleep 1
done

echo "Warning: Server may not be fully ready"
SERVER_PID=$(get_port_pid)
if [ -n "$SERVER_PID" ]; then
  echo "$SERVER_PID" > "$PID_FILE"
  echo "Process running (PID: $SERVER_PID)"
fi
exit 0
