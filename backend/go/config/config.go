package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the backend
type Config struct {
	AWSRegion        string
	S3Bucket         string
	SNSTopicARN      string
	VideoDir         string
	CloudFrontDomain string
}

// LoadConfig loads configuration from environment variables
func LoadConfig() (*Config, error) {
	// Try to load .env file (optional, for development)
	_ = godotenv.Load()

	cfg := &Config{
		AWSRegion:        getEnv("AWS_REGION", "ap-southeast-2"),
		S3Bucket:         getEnv("S3_BUCKET", ""),
		SNSTopicARN:      getEnv("SNS_TOPIC_ARN", ""),
		VideoDir:         getEnv("VIDEO_DIR", "/tmp/videos"),
		CloudFrontDomain: getEnv("CLOUDFRONT_DOMAIN", ""),
	}

	// Validate required fields
	if cfg.S3Bucket == "" {
		return nil, fmt.Errorf("S3_BUCKET environment variable is required")
	}
	if cfg.SNSTopicARN == "" {
		return nil, fmt.Errorf("SNS_TOPIC_ARN environment variable is required")
	}
	if cfg.CloudFrontDomain == "" {
		return nil, fmt.Errorf("CLOUDFRONT_DOMAIN environment variable is required")
	}

	return cfg, nil
}

// getEnv gets an environment variable with a fallback default value
func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
