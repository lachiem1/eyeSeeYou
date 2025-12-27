# EyeSeeYou Backend

The backend for the EyeSeeYou Ring doorbell camera app. Consists of:
- **Python**: YOLOv7 human detection and video recording
- **Go**: File watching, S3 upload, and SNS notifications

## Quick Start

### 1. Download YOLOv7 Weights

```bash
cd backend
./scripts/download_weights.sh
```

This will download `yolov7-tiny.pt` (~12MB) to the `python/` directory.

### 2. Configure Environment

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` and fill in the values from your CDK deployment outputs:

```bash
AWS_REGION=ap-southeast-2
S3_BUCKET=eyeseeyou-videos-123456789012
SNS_TOPIC_ARN=arn:aws:sns:ap-southeast-2:123456789012:eyeseeyou-video-notifications
VIDEO_DIR=/tmp/videos
CLOUDFRONT_DOMAIN=d1234567890abc.cloudfront.net
```

### 3. Configure AWS Credentials

On your Mac (for development):
```bash
aws configure
# Enter your AWS credentials
```

On Raspberry Pi (for production):
Create `~/.aws/credentials` with the content from CDK output `AWSCredentialsFileContent`:

```ini
[default]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
role_arn = arn:aws:iam::ACCOUNT:role/eyeseeyou-backend-pi-role
```

### 4. Run with Docker Compose (Development)

```bash
# Build and start
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### 5. Run on Raspberry Pi (Production)

```bash
# Build image
docker build -t eyeseeyou-backend .

# Run container
docker run -d \
  --name eyeseeyou \
  --restart unless-stopped \
  --device /dev/video0:/dev/video0 \
  -v /tmp/videos:/tmp/videos \
  -v ~/.aws:/root/.aws:ro \
  --env-file .env \
  eyeseeyou-backend

# View logs
docker logs -f eyeseeyou

# Stop
docker stop eyeseeyou
docker rm eyeseeyou
```

## Architecture

### Flow

1. **Python Detector** (`python/detector.py`):
   - Captures frames from USB webcam
   - Runs YOLOv7 inference every 5th frame
   - When human detected (confidence > 0.45):
     - Records 5-second video clip
     - Speeds up to 3 seconds using FFmpeg
     - Saves to `/tmp/videos/person_detected_DD-MM-YYYY_HH-MM-SS.mp4`
   - Waits 30 seconds (cooldown) before next detection

2. **Go File Watcher** (`go/watcher/file_watcher.go`):
   - Watches `/tmp/videos` for new `.mp4` files
   - When new file detected:
     - Uploads to S3 (`videos/filename.mp4`)
     - Publishes SNS notification with CloudFront URL
     - Deletes local file

### Performance Optimizations

For Raspberry Pi 5:
- Uses YOLOv7-tiny (lighter model)
- Processes every 5th frame only
- 30-second cooldown between detections
- 640x480 resolution
- CPU inference (no GPU needed)

## Development

### Testing Python Detector Locally

```bash
cd python
pip install -r requirements.txt

# Download weights if not done already
cd ../scripts && ./download_weights.sh && cd ../python

# Run detector
python detector.py
```

Press `Ctrl+C` to stop.

### Testing Go Backend Locally

```bash
cd go

# Initialize Go modules
go mod download

# Run
go run main.go
```

Create test video files in `/tmp/videos` to trigger upload:

```bash
# Create a dummy video file
ffmpeg -f lavfi -i testsrc=duration=3:size=640x480:rate=30 /tmp/videos/test.mp4
```

### Building Go Binary

```bash
cd go
go build -o backend main.go
./backend
```

## Troubleshooting

### Camera Not Found

```bash
# List available cameras
ls -l /dev/video*

# Test camera
ffmpeg -f v4l2 -i /dev/video0 -frames 1 test.jpg
```

### YOLOv7 Model Errors

Make sure you've downloaded the weights:
```bash
./scripts/download_weights.sh
```

### AWS Permission Errors

Check that your IAM role has:
- `s3:PutObject` on the videos bucket
- `sns:Publish` on the SNS topic

Verify credentials:
```bash
aws sts get-caller-identity
```

### Docker Issues

Camera access requires `privileged: true` or `--privileged` flag.

On Linux, you may also need:
```bash
sudo usermod -aG video $USER
sudo chmod 666 /dev/video0
```

## Logs

View backend logs:
```bash
# Docker Compose
docker-compose logs -f

# Docker run
docker logs -f eyeseeyou
```

## Monitoring

The Go backend logs all operations:
- File watcher events
- S3 uploads (success/failure)
- SNS publications
- File cleanups

The Python detector logs:
- Model loading
- Detection events
- Video recording
- FFmpeg operations

## Next Steps

1. Deploy the CDK infrastructure (see `infrastructure/cdk/README.md`)
2. Configure this backend with the CDK outputs
3. Build and test locally
4. Deploy to Raspberry Pi 5
5. Deploy frontend (see `frontend/README.md`)
