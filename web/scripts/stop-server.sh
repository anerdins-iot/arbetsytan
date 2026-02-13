#!/bin/bash
# Stop server script for agents

PORT="${PORT:-3000}"
PID_FILE="/workspace/web/.server.pid"

# Function to get PID listening on port
get_port_pid() {
  ss -tlnp 2>/dev/null | grep ":$PORT " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1
}

# Kill from PID file
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping server (PID: $PID)..."
    kill -TERM "$PID" 2>/dev/null || true
    sleep 2
  fi
  rm -f "$PID_FILE"
fi

# Also kill anything on the port (safety)
LISTENING_PID=$(get_port_pid)
if [ -n "$LISTENING_PID" ]; then
  echo "Killing remaining process on port $PORT (PID: $LISTENING_PID)..."
  kill -TERM "$LISTENING_PID" 2>/dev/null || true
  sleep 1
fi

# Verify
LISTENING_PID=$(get_port_pid)
if [ -z "$LISTENING_PID" ]; then
  echo "Server stopped"
else
  echo "Warning: Process still running on port $PORT (PID: $LISTENING_PID)"
fi
