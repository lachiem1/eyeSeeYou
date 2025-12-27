# Multi-stage Dockerfile for EyeSeeYou Backend
# Stage 1: Build Go binary
# Stage 2: Python runtime with OpenCV and Go binary

# ========================================
# Stage 1: Go Builder
# ========================================
FROM golang:1.22-alpine AS go-builder

WORKDIR /build

# Copy Go module files
COPY go/go.mod go/go.sum ./
RUN go mod download

# Copy Go source code
COPY go/ ./

# Build the Go binary
RUN CGO_ENABLED=0 GOOS=linux go build -o backend main.go

# ========================================
# Stage 2: Python Runtime
# ========================================
FROM python:3.11-slim

# Install system dependencies for OpenCV, FFmpeg, and USB camera support
RUN apt-get update && apt-get install -y \
    libopencv-dev \
    python3-opencv \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    ffmpeg \
    v4l-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python detector code
COPY python/ ./python/

# Install Python dependencies
RUN pip install --no-cache-dir -r python/requirements.txt

# Copy Go binary from builder stage
COPY --from=go-builder /build/backend /app/backend

# Copy startup script
COPY scripts/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Create video directory
RUN mkdir -p /tmp/videos

# Environment variables (can be overridden at runtime)
ENV VIDEO_DIR=/tmp/videos
ENV AWS_REGION=ap-southeast-2

# No ports exposed - backend only makes outbound connections to AWS

# Run the startup script
CMD ["/app/start.sh"]
