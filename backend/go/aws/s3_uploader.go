package aws

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Uploader handles uploading videos to S3
type S3Uploader struct {
	client   *s3.Client
	uploader *manager.Uploader
	bucket   string
}

// NewS3Uploader creates a new S3 uploader
func NewS3Uploader(ctx context.Context, awsRegion, bucket string) (*S3Uploader, error) {
	// Load AWS SDK config (uses IAM role credentials from ~/.aws/credentials)
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(awsRegion),
	)
	if err != nil {
		return nil, fmt.Errorf("unable to load AWS SDK config: %w", err)
	}

	client := s3.NewFromConfig(cfg)
	uploader := manager.NewUploader(client)

	return &S3Uploader{
		client:   client,
		uploader: uploader,
		bucket:   bucket,
	}, nil
}

// Upload uploads a video file to S3 and returns the S3 key
func (u *S3Uploader) Upload(ctx context.Context, filePath string) (string, error) {
	// Open the file
	file, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open file %s: %w", filePath, err)
	}
	defer file.Close()

	// Get file info for content type
	filename := filepath.Base(filePath)
	key := "videos/" + filename

	log.Printf("Uploading %s to s3://%s/%s", filePath, u.bucket, key)

	// Upload to S3
	_, err = u.uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(u.bucket),
		Key:         aws.String(key),
		Body:        file,
		ContentType: aws.String("video/mp4"),
	})

	if err != nil {
		return "", fmt.Errorf("failed to upload to S3: %w", err)
	}

	log.Printf("Successfully uploaded %s to S3", key)
	return key, nil
}
