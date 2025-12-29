package main

import (
	"context"
	"fmt"
	"log"

	awspackage "github.com/lachiem1/eyeSeeYou/backend/go/aws"
)

func main() {
	log.Println("Testing CloudFront URL signing...")

	ctx := context.Background()

	// Create signer (will fetch from SSM)
	signer, err := awspackage.NewCloudFrontSigner(ctx, "ap-southeast-2")
	if err != nil {
		log.Fatalf("Failed to create signer: %v", err)
	}

	// Test URL
	testURL := "https://dg8wly73l929p.cloudfront.net/videos/test_video.mp4"

	// Sign it
	signedURL, err := signer.SignURL(testURL)
	if err != nil {
		log.Fatalf("Failed to sign URL: %v", err)
	}

	fmt.Println("\n=== Signed URL Test ===")
	fmt.Println("Original URL:", testURL)
	fmt.Println("\nSigned URL:", signedURL)
	fmt.Println("\n✓ URL signing successful!")
	fmt.Println("\nURL parameters added:")
	fmt.Println("  - Expires: Timestamp when URL becomes invalid")
	fmt.Println("  - Signature: Cryptographic signature")
	fmt.Println("  - Key-Pair-Id: Public key identifier")
}
