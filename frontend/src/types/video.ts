export interface VideoNotification {
  s3_key: string;
  timestamp: string; // ISO 8601 UTC
  event_type: 'human_detected';
  cloudfront_url: string;
}

export interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL: string;
}
