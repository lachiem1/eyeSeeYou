package aws

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"log"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
)

const (
	// SSM parameter name for CloudFront private key
	cloudFrontPrivateKeyParam = "/eyeseeyou/cloudfront-private-key"

	// CloudFront public key ID
	cloudFrontKeyPairID = "KB3JCDFGZQN4L"

	// URL expiration duration (30 days - matches S3 lifecycle)
	urlExpirationDuration = 30 * 24 * time.Hour
)

// CloudFrontSigner handles signing CloudFront URLs
type CloudFrontSigner struct {
	privateKey  *rsa.PrivateKey
	keyPairID   string
	ssmClient   *ssm.Client
}

// NewCloudFrontSigner creates a new CloudFront URL signer
func NewCloudFrontSigner(ctx context.Context, awsRegion string) (*CloudFrontSigner, error) {
	// Load AWS SDK config
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(awsRegion),
	)
	if err != nil {
		return nil, fmt.Errorf("unable to load AWS SDK config: %w", err)
	}

	ssmClient := ssm.NewFromConfig(cfg)

	// Fetch private key from SSM
	log.Printf("Fetching CloudFront private key from SSM parameter: %s", cloudFrontPrivateKeyParam)
	paramName := cloudFrontPrivateKeyParam
	result, err := ssmClient.GetParameter(ctx, &ssm.GetParameterInput{
		Name:           &paramName,
		WithDecryption: boolPtr(true),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get private key from SSM: %w", err)
	}

	// Parse private key PEM
	privateKey, err := parsePrivateKey(*result.Parameter.Value)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	log.Printf("CloudFront signer initialized with key pair ID: %s", cloudFrontKeyPairID)

	return &CloudFrontSigner{
		privateKey: privateKey,
		keyPairID:  cloudFrontKeyPairID,
		ssmClient:  ssmClient,
	}, nil
}

// SignURL creates a signed CloudFront URL that expires after urlExpirationDuration
func (s *CloudFrontSigner) SignURL(rawURL string) (string, error) {
	// Parse the URL
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("failed to parse URL: %w", err)
	}

	// Calculate expiration timestamp
	expirationTime := time.Now().Add(urlExpirationDuration).Unix()

	// Create the policy statement
	policy := fmt.Sprintf(`{"Statement":[{"Resource":"%s","Condition":{"DateLessThan":{"AWS:EpochTime":%d}}}]}`,
		rawURL, expirationTime)

	// Sign the policy
	signature, err := s.signPolicy(policy)
	if err != nil {
		return "", fmt.Errorf("failed to sign policy: %w", err)
	}

	// Build the signed URL
	query := parsedURL.Query()
	query.Set("Expires", strconv.FormatInt(expirationTime, 10))
	query.Set("Signature", signature)
	query.Set("Key-Pair-Id", s.keyPairID)
	parsedURL.RawQuery = query.Encode()

	return parsedURL.String(), nil
}

// signPolicy signs the CloudFront policy using RSA-SHA1
func (s *CloudFrontSigner) signPolicy(policy string) (string, error) {
	// Hash the policy
	hash := sha1.Sum([]byte(policy))

	// Sign the hash
	signature, err := rsa.SignPKCS1v15(nil, s.privateKey, crypto.SHA1, hash[:])
	if err != nil {
		return "", fmt.Errorf("failed to sign: %w", err)
	}

	// Base64 encode and make URL-safe
	encoded := base64.StdEncoding.EncodeToString(signature)
	encoded = strings.ReplaceAll(encoded, "+", "-")
	encoded = strings.ReplaceAll(encoded, "=", "_")
	encoded = strings.ReplaceAll(encoded, "/", "~")

	return encoded, nil
}

// parsePrivateKey parses a PEM-encoded RSA private key
func parsePrivateKey(pemData string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemData))
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	// Try PKCS1
	privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err == nil {
		return privateKey, nil
	}

	// Try PKCS8
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("key is not RSA private key")
	}

	return rsaKey, nil
}

func boolPtr(b bool) *bool {
	return &b
}
