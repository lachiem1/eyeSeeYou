import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { cognitoAuth } from '@/lib/auth/cognitoAuth';

let sqsClient: SQSClient | null = null;

async function getSQSClient(): Promise<SQSClient> {
  if (!sqsClient) {
    const region = process.env.NEXT_PUBLIC_AWS_REGION || 'ap-southeast-2';

    // Get temporary credentials from Cognito Identity Pool
    const credentials = await cognitoAuth.getAWSCredentials();

    sqsClient = new SQSClient({
      region,
      credentials,
    });
  }

  return sqsClient;
}

export async function receiveMessage() {
  try {
    const client = await getSQSClient();
    const queueUrl = process.env.NEXT_PUBLIC_SQS_QUEUE_URL;

    if (!queueUrl) {
      throw new Error('SQS Queue URL not configured');
    }

    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
      AttributeNames: ['All'],
    });

    const response = await client.send(command);
    return response;
  } catch (error) {
    throw error;
  }
}

export async function deleteMessage(receiptHandle: string) {
  try {
    const client = await getSQSClient();
    const queueUrl = process.env.NEXT_PUBLIC_SQS_QUEUE_URL;

    if (!queueUrl) {
      throw new Error('SQS Queue URL not configured');
    }

    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });

    await client.send(command);
  } catch (error) {
    throw error;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
