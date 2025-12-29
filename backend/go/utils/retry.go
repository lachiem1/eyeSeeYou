package utils

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"
)

// RetryConfig holds retry configuration
type RetryConfig struct {
	MaxRetries      int
	InitialDelay    time.Duration
	MaxDelay        time.Duration
	OperationName   string
}

// DefaultRetryConfig returns default retry configuration
// Max retries: 4 (5 total attempts)
// Delays: 1s -> 2s -> 4s -> 8s (total ~15 seconds)
func DefaultRetryConfig(operationName string) RetryConfig {
	return RetryConfig{
		MaxRetries:    4,
		InitialDelay:  1 * time.Second,
		MaxDelay:      8 * time.Second,
		OperationName: operationName,
	}
}

// RetryWithBackoff executes a function with exponential backoff retry logic
// Returns error if all retries are exhausted
func RetryWithBackoff(ctx context.Context, config RetryConfig, fn func() error) error {
	var lastErr error

	for attempt := 0; attempt <= config.MaxRetries; attempt++ {
		// Check if context is cancelled
		select {
		case <-ctx.Done():
			return fmt.Errorf("%s cancelled: %w", config.OperationName, ctx.Err())
		default:
		}

		// Execute the function
		err := fn()
		if err == nil {
			// Success!
			if attempt > 0 {
				log.Printf("%s succeeded after %d retries", config.OperationName, attempt)
			}
			return nil
		}

		lastErr = err

		// If this was the last attempt, don't sleep
		if attempt == config.MaxRetries {
			break
		}

		// Calculate backoff delay with exponential backoff
		delay := time.Duration(float64(config.InitialDelay) * math.Pow(2, float64(attempt)))
		if delay > config.MaxDelay {
			delay = config.MaxDelay
		}

		log.Printf("%s failed (attempt %d/%d): %v. Retrying in %v...",
			config.OperationName, attempt+1, config.MaxRetries+1, err, delay)

		// Wait before retrying
		select {
		case <-ctx.Done():
			return fmt.Errorf("%s cancelled during backoff: %w", config.OperationName, ctx.Err())
		case <-time.After(delay):
			// Continue to next retry
		}
	}

	return fmt.Errorf("%s failed after %d attempts: %w",
		config.OperationName, config.MaxRetries+1, lastErr)
}
