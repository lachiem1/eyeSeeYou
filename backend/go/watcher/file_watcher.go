package watcher

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
	awspackage "github.com/yourusername/eyeseeyou-backend/aws"
	"github.com/yourusername/eyeseeyou-backend/config"
)

// FileWatcher watches a directory for new video files
type FileWatcher struct {
	cfg        *config.Config
	s3Uploader *awspackage.S3Uploader
	snsPublisher *awspackage.SNSPublisher
	watcher    *fsnotify.Watcher
}

// NewFileWatcher creates a new file watcher
func NewFileWatcher(cfg *config.Config, s3Uploader *awspackage.S3Uploader, snsPublisher *awspackage.SNSPublisher) (*FileWatcher, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	return &FileWatcher{
		cfg:        cfg,
		s3Uploader: s3Uploader,
		snsPublisher: snsPublisher,
		watcher:    watcher,
	}, nil
}

// Watch starts watching the configured directory for new video files
func (fw *FileWatcher) Watch(ctx context.Context) error {
	// Ensure the video directory exists
	if err := os.MkdirAll(fw.cfg.VideoDir, 0755); err != nil {
		return err
	}

	// Add the directory to the watcher
	if err := fw.watcher.Add(fw.cfg.VideoDir); err != nil {
		return err
	}

	log.Printf("Watching directory: %s", fw.cfg.VideoDir)

	for {
		select {
		case <-ctx.Done():
			log.Println("File watcher shutting down...")
			fw.watcher.Close()
			return nil

		case event, ok := <-fw.watcher.Events:
			if !ok {
				return nil
			}
			if event.Op&fsnotify.Create == fsnotify.Create {
				if filepath.Ext(event.Name) == ".mp4" {
					log.Printf("New video detected: %s", event.Name)
					// Process in goroutine to avoid blocking the watcher
					go fw.processVideo(ctx, event.Name)
				}
			}

		case err, ok := <-fw.watcher.Errors:
			if !ok {
				return nil
			}
			log.Printf("Watcher error: %v", err)
		}
	}
}

// processVideo handles uploading a video to S3, publishing to SNS, and cleaning up
func (fw *FileWatcher) processVideo(ctx context.Context, filePath string) {
	// Wait a moment to ensure the file is fully written
	time.Sleep(1 * time.Second)

	log.Printf("Processing video: %s", filePath)

	// 1. Upload to S3
	s3Key, err := fw.s3Uploader.Upload(ctx, filePath)
	if err != nil {
		log.Printf("ERROR: Failed to upload %s: %v", filePath, err)
		return
	}

	// 2. Publish SNS notification
	if err := fw.snsPublisher.Publish(ctx, s3Key, fw.cfg.CloudFrontDomain); err != nil {
		log.Printf("ERROR: Failed to publish SNS for %s: %v", filePath, err)
		// Continue to cleanup even if SNS fails
	}

	// 3. Clean up local file
	if err := os.Remove(filePath); err != nil {
		log.Printf("ERROR: Failed to delete local file %s: %v", filePath, err)
	} else {
		log.Printf("Successfully processed and deleted: %s", filePath)
	}
}

// Close closes the file watcher
func (fw *FileWatcher) Close() error {
	return fw.watcher.Close()
}
