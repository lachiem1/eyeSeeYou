#!/bin/bash
# Download YOLOv7-tiny pretrained weights

set -e

WEIGHTS_DIR="$(dirname "$0")/../python"
WEIGHTS_FILE="$WEIGHTS_DIR/yolov7-tiny.pt"

echo "Downloading YOLOv7-tiny weights..."

if [ -f "$WEIGHTS_FILE" ]; then
    echo "Weights file already exists: $WEIGHTS_FILE"
    read -p "Do you want to re-download? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Using existing weights file."
        exit 0
    fi
fi

cd "$WEIGHTS_DIR"

wget -O yolov7-tiny.pt https://github.com/WongKinYiu/yolov7/releases/download/v0.1/yolov7-tiny.pt

echo "✓ YOLOv7-tiny weights downloaded successfully!"
echo "Location: $WEIGHTS_FILE"

ls -lh yolov7-tiny.pt
