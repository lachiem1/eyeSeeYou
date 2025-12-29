package aws

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/lachiem1/eyeSeeYou/backend/go/utils"
)

const (
	// S3 operation timeout
	s3UploadTimeout = 60 * time.Second

	// Failed upload directory
	failedUploadDir = "/tmp/videos-failed-upload"

	// Max size for failed upload directory (100 MB)
	maxFailedUploadDirSize = 100 * 1024 * 1024
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

// Upload uploads a video file to S3 with retry logic and verification
// Returns the S3 key on success, or error if upload/verification fails
func (u *S3Uploader) Upload(ctx context.Context, filePath string) (string, error) {
	filename := filepath.Base(filePath)
	key := "videos/" + filename

	log.Printf("Uploading %s to s3://%s/%s", filePath, u.bucket, key)

	// Create context with timeout for S3 operations
	uploadCtx, cancel := context.WithTimeout(ctx, s3UploadTimeout)
	defer cancel()

	// Retry configuration for S3 upload
	retryConfig := utils.DefaultRetryConfig(fmt.Sprintf("S3 upload %s", filename))

	// Upload with retry
	err := utils.RetryWithBackoff(uploadCtx, retryConfig, func() error {
		file, err := os.Open(filePath)
		if err != nil {
			return fmt.Errorf("failed to open file: %w", err)
		}
		defer file.Close()

		_, err = u.uploader.Upload(uploadCtx, &s3.PutObjectInput{
			Bucket:      aws.String(u.bucket),
			Key:         aws.String(key),
			Body:        file,
			ContentType: aws.String("video/mp4"),
		})

		return err
	})

	if err != nil {
		return "", fmt.Errorf("failed to upload to S3 after retries: %w", err)
	}

	log.Printf("Successfully uploaded %s to S3", key)

	// Verify upload with HeadObject
	if err := u.verifyUpload(uploadCtx, key); err != nil {
		log.Printf("ERROR: Upload verification failed for %s: %v", key, err)
		// Move file to failed upload directory
		if moveErr := u.moveToFailedDir(filePath); moveErr != nil {
			log.Printf("ERROR: Failed to move file to failed directory: %v", moveErr)
		}
		return "", fmt.Errorf("upload verification failed: %w", err)
	}

	log.Printf("Upload verification successful for %s", key)
	return key, nil
}

// verifyUpload checks if the uploaded file exists in S3 using HeadObject
func (u *S3Uploader) verifyUpload(ctx context.Context, key string) error {
	retryConfig := utils.RetryConfig{
		MaxRetries:    2, // Quick verification, only 2 retries
		InitialDelay:  500 * time.Millisecond,
		MaxDelay:      2 * time.Second,
		OperationName: fmt.Sprintf("S3 verify %s", key),
	}

	return utils.RetryWithBackoff(ctx, retryConfig, func() error {
		_, err := u.client.HeadObject(ctx, &s3.HeadObjectInput{
			Bucket: aws.String(u.bucket),
			Key:    aws.String(key),
		})
		return err
	})
}

// moveToFailedDir moves a file to the failed upload directory
// If directory exceeds size limit, it deletes all files before moving
func (u *S3Uploader) moveToFailedDir(filePath string) error {
	// Ensure failed upload directory exists
	if err := os.MkdirAll(failedUploadDir, 0755); err != nil {
		return fmt.Errorf("failed to create failed upload directory: %w", err)
	}

	// Check directory size
	dirSize, err := getDirSize(failedUploadDir)
	if err != nil {
		log.Printf("WARNING: Failed to get directory size, proceeding anyway: %v", err)
	} else if dirSize >= maxFailedUploadDirSize {
		log.Printf("Failed upload directory exceeds %d bytes, clearing it", maxFailedUploadDirSize)
		if err := clearDirectory(failedUploadDir); err != nil {
			return fmt.Errorf("failed to clear directory: %w", err)
		}
	}

	// Move file to failed directory
	filename := filepath.Base(filePath)
	destPath := filepath.Join(failedUploadDir, filename)

	log.Printf("Moving failed upload %s to %s", filePath, destPath)

	if err := os.Rename(filePath, destPath); err != nil {
		return fmt.Errorf("failed to move file: %w", err)
	}

	log.Printf("File moved to failed upload directory: %s", destPath)
	return nil
}

// getDirSize calculates the total size of all files in a directory
func getDirSize(dirPath string) (int64, error) {
	var totalSize int64

	err := filepath.WalkDir(dirPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			info, err := d.Info()
			if err != nil {
				return err
			}
			totalSize += info.Size()
		}
		return nil
	})

	return totalSize, err
}

// clearDirectory removes all files from a directory
func clearDirectory(dirPath string) error {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			filePath := filepath.Join(dirPath, entry.Name())
			if err := os.Remove(filePath); err != nil {
				log.Printf("WARNING: Failed to delete %s: %v", filePath, err)
			} else {
				log.Printf("Deleted: %s", filePath)
			}
		}
	}

	return nil
}
