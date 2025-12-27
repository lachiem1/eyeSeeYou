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
)

// SNSPublisher handles publishing notifications to SNS
type SNSPublisher struct {
	client   *sns.Client
	topicARN string
}

// VideoNotification represents a video detection notification
type VideoNotification struct {
	S3Key         string `json:"s3_key"`
	Timestamp     string `json:"timestamp"`
	EventType     string `json:"event_type"`
	CloudFrontURL string `json:"cloudfront_url"`
}

// NewSNSPublisher creates a new SNS publisher
func NewSNSPublisher(ctx context.Context, awsRegion, topicARN string) (*SNSPublisher, error) {
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(awsRegion),
	)
	if err != nil {
		return nil, fmt.Errorf("unable to load AWS SDK config: %w", err)
	}

	return &SNSPublisher{
		client:   sns.NewFromConfig(cfg),
		topicARN: topicARN,
	}, nil
}

// Publish publishes a video notification to SNS
func (p *SNSPublisher) Publish(ctx context.Context, s3Key, cloudFrontDomain string) error {
	// Construct CloudFront URL
	cloudFrontURL := fmt.Sprintf("https://%s/%s", cloudFrontDomain, s3Key)

	notification := VideoNotification{
		S3Key:         s3Key,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		EventType:     "human_detected",
		CloudFrontURL: cloudFrontURL,
	}

	messageBytes, err := json.Marshal(notification)
	if err != nil {
		return fmt.Errorf("failed to marshal notification: %w", err)
	}

	log.Printf("Publishing notification to SNS: %s", string(messageBytes))

	_, err = p.client.Publish(ctx, &sns.PublishInput{
		TopicArn: aws.String(p.topicARN),
		Message:  aws.String(string(messageBytes)),
		Subject:  aws.String("Human Detected"),
	})

	if err != nil {
		return fmt.Errorf("failed to publish to SNS: %w", err)
	}

	log.Printf("Successfully published notification to SNS")
	return nil
}
