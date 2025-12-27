import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export class MessagingStack extends cdk.Stack {
  public readonly snsTopic: sns.Topic;
  public readonly sqsQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // SNS Topic for Video Notifications
    // ========================================
    this.snsTopic = new sns.Topic(this, 'VideoNotificationsTopic', {
      displayName: 'EyeSeeYou Video Notifications',
      topicName: 'eyeseeyou-video-notifications',
    });

    // ========================================
    // SQS Queue for Frontend Polling
    // ========================================
    this.sqsQueue = new sqs.Queue(this, 'FrontendNotificationsQueue', {
      queueName: 'eyeseeyou-frontend-notifications',
      visibilityTimeout: cdk.Duration.seconds(30),
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      retentionPeriod: cdk.Duration.days(1), // Keep messages for 24 hours
      deliveryDelay: cdk.Duration.seconds(0),
    });

    // ========================================
    // Subscribe SQS to SNS
    // ========================================
    this.snsTopic.addSubscription(
      new subscriptions.SqsSubscription(this.sqsQueue, {
        rawMessageDelivery: false, // Keep SNS wrapper for message metadata
      })
    );

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'SNSTopicArn', {
      value: this.snsTopic.topicArn,
      description: 'SNS Topic ARN for video notifications',
      exportName: 'EyeSeeYouSNSTopicArn',
    });

    new cdk.CfnOutput(this, 'SQSQueueUrl', {
      value: this.sqsQueue.queueUrl,
      description: 'SQS Queue URL for frontend polling',
      exportName: 'EyeSeeYouSQSQueueUrl',
    });

    new cdk.CfnOutput(this, 'SQSQueueArn', {
      value: this.sqsQueue.queueArn,
      description: 'SQS Queue ARN',
      exportName: 'EyeSeeYouSQSQueueArn',
    });
  }
}
