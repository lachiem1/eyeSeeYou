#!/bin/bash
# Start both Python detector and Go backend processes

set -e

echo "Starting EyeSeeYou Backend..."
echo "=============================="

# Start Python detector in background
echo "[1/2] Starting Python detector..."
cd /app/python
python3 detector.py &
PYTHON_PID=$!
echo "Python detector started (PID: $PYTHON_PID)"

# Start Go backend
echo "[2/2] Starting Go backend..."
cd /app
./backend &
GO_PID=$!
echo "Go backend started (PID: $GO_PID)"

echo ""
echo "All services running!"
echo "  - Python detector: $PYTHON_PID"
echo "  - Go backend: $GO_PID"
echo ""

# Function to handle shutdown
cleanup() {
    echo ""
    echo "Shutting down services..."
    kill $PYTHON_PID 2>/dev/null || true
    kill $GO_PID 2>/dev/null || true
    echo "Shutdown complete."
    exit 0
}

# Trap SIGTERM and SIGINT
trap cleanup SIGTERM SIGINT

# Wait for both processes
wait $PYTHON_PID $GO_PID
