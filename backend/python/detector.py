#!/usr/bin/env python3
"""
YOLOv7 Human Detection and Video Recorder
Continuously monitors webcam feed for humans and records video clips when detected.
"""

import cv2
import torch
import numpy as np
import os
import subprocess
from datetime import datetime
import time
import pytz

# Configuration
VIDEO_DIR = os.getenv('VIDEO_DIR', '/tmp/videos')
CAMERA_INDEX = 0  # /dev/video0
FRAME_WIDTH = 640
FRAME_HEIGHT = 480
FPS = 30
RECORDING_DURATION_SEC = 5  # Record 5 seconds
TARGET_DURATION_SEC = 3  # Speed up to 3 seconds
CONFIDENCE_THRESHOLD = 0.45
PERSON_CLASS_ID = 0  # COCO dataset class ID for 'person'
COOLDOWN_PERIOD_SEC = 30  # Wait 30 seconds between detections
PROCESS_EVERY_N_FRAMES = 5  # Only run detection every 5th frame for performance

class HumanDetector:
    def __init__(self, model_path='yolov7-tiny.pt'):
        """Initialize the human detector with YOLOv7 model."""
        print("Loading YOLOv7 model...")

        # Check if model exists
        if not os.path.exists(model_path):
            print(f"ERROR: Model file not found: {model_path}")
            print("Please download YOLOv7-tiny weights:")
            print("  wget https://github.com/WongKinYiu/yolov7/releases/download/v0.1/yolov7-tiny.pt")
            raise FileNotFoundError(f"Model file not found: {model_path}")

        # Load YOLOv7 model (CPU only for Raspberry Pi)
        self.model = torch.hub.load('WongKinYiu/yolov7', 'custom', model_path, trust_repo=True)
        self.model.conf = CONFIDENCE_THRESHOLD
        self.model.cpu()  # Force CPU mode
        self.model.eval()

        print(f"Model loaded successfully (confidence threshold: {CONFIDENCE_THRESHOLD})")

        # Ensure video directory exists
        os.makedirs(VIDEO_DIR, exist_ok=True)
        print(f"Video directory: {VIDEO_DIR}")

        self.last_detection_time = 0

    def detect_human(self, frame):
        """
        Detect humans in a frame using YOLOv7.
        Returns True if a human is detected with sufficient confidence.
        """
        # Run inference
        results = self.model(frame)

        # Check detections
        detections = results.xyxy[0].cpu().numpy()  # x1, y1, x2, y2, confidence, class

        for detection in detections:
            class_id = int(detection[5])
            confidence = detection[4]

            if class_id == PERSON_CLASS_ID and confidence >= CONFIDENCE_THRESHOLD:
                print(f"Human detected! Confidence: {confidence:.2f}")
                return True

        return False

    def record_video(self, cap):
        """
        Record a 5-second video clip from the webcam.
        Returns the path to the temporary raw video file.
        """
        timestamp = datetime.now(pytz.UTC).strftime('%d-%m-%Y_%H-%M-%S')
        temp_filename = f'person_detected_{timestamp}_temp.mp4'
        temp_filepath = os.path.join(VIDEO_DIR, temp_filename)

        print(f"Recording video: {temp_filename}")

        # Define codec and create VideoWriter
        # Use 'avc1' (H.264) codec for macOS compatibility
        fourcc = cv2.VideoWriter_fourcc(*'avc1')
        out = cv2.VideoWriter(temp_filepath, fourcc, FPS, (FRAME_WIDTH, FRAME_HEIGHT))

        # Check if VideoWriter opened successfully
        if not out.isOpened():
            print(f"ERROR: Failed to open VideoWriter with avc1 codec, trying mp4v...")
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(temp_filepath, fourcc, FPS, (FRAME_WIDTH, FRAME_HEIGHT))

            if not out.isOpened():
                print(f"ERROR: Failed to open VideoWriter with any codec!")
                return None

        num_frames = int(RECORDING_DURATION_SEC * FPS)
        frames_recorded = 0

        start_time = time.time()

        while frames_recorded < num_frames:
            ret, frame = cap.read()
            if not ret:
                print("WARNING: Failed to read frame during recording")
                break

            out.write(frame)
            frames_recorded += 1

        out.release()

        elapsed = time.time() - start_time
        print(f"Recorded {frames_recorded} frames in {elapsed:.2f} seconds")

        # Verify file was created and has content
        if not os.path.exists(temp_filepath):
            print(f"ERROR: Video file was not created: {temp_filepath}")
            return None

        file_size = os.path.getsize(temp_filepath)
        print(f"Video file created: {file_size} bytes")

        if file_size == 0:
            print(f"ERROR: Video file is empty: {temp_filepath}")
            os.remove(temp_filepath)
            return None

        return temp_filepath

    def speed_up_video(self, input_path):
        """
        Speed up a 5-second video to 3 seconds using FFmpeg.
        Returns the path to the final sped-up video file.
        """
        # Calculate speed factor: 5s -> 3s = 1.67x speed
        speed_factor = RECORDING_DURATION_SEC / TARGET_DURATION_SEC
        pts_factor = 1.0 / speed_factor  # PTS factor is inverse of speed

        # Generate output filename
        output_filename = input_path.replace('_temp.mp4', '.mp4')

        print(f"Speeding up video {speed_factor:.2f}x: {input_path} -> {output_filename}")

        # Use FFmpeg to speed up video
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-filter:v', f'setpts={pts_factor:.3f}*PTS',
            '-an',  # Remove audio (webcam likely has no audio anyway)
            '-y',  # Overwrite output file
            output_filename
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                print(f"ERROR: FFmpeg failed: {result.stderr}")
                # If FFmpeg fails, just rename the temp file as fallback
                os.rename(input_path, output_filename)
                return output_filename
        except subprocess.TimeoutExpired:
            print("ERROR: FFmpeg timeout")
            os.rename(input_path, output_filename)
            return output_filename
        except Exception as e:
            print(f"ERROR: FFmpeg exception: {e}")
            os.rename(input_path, output_filename)
            return output_filename

        # Clean up temporary file
        if os.path.exists(input_path):
            os.remove(input_path)

        print(f"Video ready: {output_filename}")
        return output_filename

    def run(self):
        """Main loop: capture frames, detect humans, record videos."""
        print("Opening webcam...")
        cap = cv2.VideoCapture(CAMERA_INDEX)

        if not cap.isOpened():
            raise RuntimeError(f"Failed to open camera at index {CAMERA_INDEX}")

        # Set camera properties
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
        cap.set(cv2.CAP_PROP_FPS, FPS)

        print(f"Webcam opened successfully: {FRAME_WIDTH}x{FRAME_HEIGHT} @ {FPS} FPS")
        print("Starting detection loop...")
        print(f"Cooldown period: {COOLDOWN_PERIOD_SEC} seconds between detections")

        frame_count = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    print("WARNING: Failed to read frame, retrying...")
                    time.sleep(0.1)
                    continue

                frame_count += 1

                # Only process every Nth frame for performance
                if frame_count % PROCESS_EVERY_N_FRAMES != 0:
                    continue

                # Check cooldown period
                current_time = time.time()
                if current_time - self.last_detection_time < COOLDOWN_PERIOD_SEC:
                    continue

                # Detect humans
                if self.detect_human(frame):
                    # Human detected! Record video
                    temp_video_path = self.record_video(cap)

                    if temp_video_path is None:
                        print("ERROR: Failed to record video, skipping...")
                        continue

                    # Speed up the video
                    final_video_path = self.speed_up_video(temp_video_path)

                    print(f"✓ Human detection complete: {final_video_path}")

                    # Update last detection time (cooldown)
                    self.last_detection_time = time.time()

                    # Wait a moment before resuming detection
                    time.sleep(2)

        except KeyboardInterrupt:
            print("\nStopping detector...")

        finally:
            cap.release()
            print("Webcam released. Goodbye!")

def main():
    """Entry point for the detector."""
    print("=" * 60)
    print("EyeSeeYou - Human Detection & Video Recorder")
    print("=" * 60)
    print()

    detector = HumanDetector()
    detector.run()

if __name__ == '__main__':
    main()
