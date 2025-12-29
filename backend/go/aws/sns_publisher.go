package aws

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	"github.com/lachiem1/eyeSeeYou/backend/go/utils"
)

const (
	// SNS operation timeout
	snsPublishTimeout = 15 * time.Second
)

// SNSPublisher handles publishing notifications to SNS
type SNSPublisher struct {
	client          *sns.Client
	topicARN        string
	cloudFrontSigner *CloudFrontSigner
}

// VideoNotification represents a video detection notification
type VideoNotification struct {
	S3Key         string `json:"s3_key"`
	Timestamp     string `json:"timestamp"`
	EventType     string `json:"event_type"`
	CloudFrontURL string `json:"cloudfront_url"`
}

// NewSNSPublisher creates a new SNS publisher
func NewSNSPublisher(ctx context.Context, awsRegion, topicARN string, signer *CloudFrontSigner) (*SNSPublisher, error) {
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(awsRegion),
	)
	if err != nil {
		return nil, fmt.Errorf("unable to load AWS SDK config: %w", err)
	}

	return &SNSPublisher{
		client:          sns.NewFromConfig(cfg),
		topicARN:        topicARN,
		cloudFrontSigner: signer,
	}, nil
}

// Publish publishes a video notification to SNS with retry logic
func (p *SNSPublisher) Publish(ctx context.Context, s3Key, cloudFrontDomain string) error {
	// Construct CloudFront URL
	cloudFrontURL := fmt.Sprintf("https://%s/%s", cloudFrontDomain, s3Key)

	// Sign the CloudFront URL
	signedURL, err := p.cloudFrontSigner.SignURL(cloudFrontURL)
	if err != nil {
		return fmt.Errorf("failed to sign CloudFront URL: %w", err)
	}

	log.Printf("Signed CloudFront URL (expires in 30 days)")

	notification := VideoNotification{
		S3Key:         s3Key,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		EventType:     "human_detected",
		CloudFrontURL: signedURL, // Use signed URL
	}

	messageBytes, err := json.Marshal(notification)
	if err != nil {
		return fmt.Errorf("failed to marshal notification: %w", err)
	}

	message := string(messageBytes)
	log.Printf("Publishing notification to SNS: %s", message)

	// Create context with timeout for SNS operations
	publishCtx, cancel := context.WithTimeout(ctx, snsPublishTimeout)
	defer cancel()

	// Retry configuration for SNS publish
	retryConfig := utils.DefaultRetryConfig("SNS publish")

	// Publish with retry
	err = utils.RetryWithBackoff(publishCtx, retryConfig, func() error {
		_, err := p.client.Publish(publishCtx, &sns.PublishInput{
			TopicArn: aws.String(p.topicARN),
			Message:  aws.String(message),
			Subject:  aws.String("Human Detected"),
		})
		return err
	})

	if err != nil {
		return fmt.Errorf("failed to publish to SNS after retries: %w", err)
	}

	log.Printf("Successfully published notification to SNS")
	return nil
}
