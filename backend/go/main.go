package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	awspackage "github.com/lachiem1/eyeSeeYou/backend/go/aws"
	"github.com/lachiem1/eyeSeeYou/backend/go/config"
	"github.com/lachiem1/eyeSeeYou/backend/go/watcher"
)

func main() {
	log.Println("Starting EyeSeeYou Backend...")

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	log.Printf("Configuration loaded:")
	log.Printf("  AWS Region: %s", cfg.AWSRegion)
	log.Printf("  S3 Bucket: %s", cfg.S3Bucket)
	log.Printf("  SNS Topic ARN: %s", cfg.SNSTopicARN)
	log.Printf("  Video Directory: %s", cfg.VideoDir)
	log.Printf("  CloudFront Domain: %s", cfg.CloudFrontDomain)

	// Create context that can be cancelled
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize CloudFront signer (fetches private key from SSM)
	cloudFrontSigner, err := awspackage.NewCloudFrontSigner(ctx, cfg.AWSRegion)
	if err != nil {
		log.Fatalf("Failed to create CloudFront signer: %v", err)
	}
	log.Println("CloudFront signer initialized")

	// Initialize S3 uploader
	s3Uploader, err := awspackage.NewS3Uploader(ctx, cfg.AWSRegion, cfg.S3Bucket)
	if err != nil {
		log.Fatalf("Failed to create S3 uploader: %v", err)
	}
	log.Println("S3 uploader initialized")

	// Initialize SNS publisher with CloudFront signer
	snsPublisher, err := awspackage.NewSNSPublisher(ctx, cfg.AWSRegion, cfg.SNSTopicARN, cloudFrontSigner)
	if err != nil {
		log.Fatalf("Failed to create SNS publisher: %v", err)
	}
	log.Println("SNS publisher initialized")

	// Initialize file watcher
	fileWatcher, err := watcher.NewFileWatcher(cfg, s3Uploader, snsPublisher)
	if err != nil {
		log.Fatalf("Failed to create file watcher: %v", err)
	}
	defer fileWatcher.Close()
	log.Println("File watcher initialized")

	// Start file watcher in a goroutine
	watcherErrors := make(chan error, 1)
	go func() {
		if err := fileWatcher.Watch(ctx); err != nil {
			watcherErrors <- err
		}
	}()

	// Setup signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	log.Println("EyeSeeYou Backend is running. Press Ctrl+C to stop.")

	// Wait for shutdown signal or watcher error
	select {
	case sig := <-sigChan:
		log.Printf("Received signal: %v. Shutting down gracefully...", sig)
		cancel()
	case err := <-watcherErrors:
		log.Printf("File watcher error: %v. Shutting down...", err)
		cancel()
	}

	log.Println("Shutdown complete.")
}
