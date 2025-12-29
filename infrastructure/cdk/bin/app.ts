#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import { StorageStack } from '../lib/storage-stack';
import { MessagingStack } from '../lib/messaging-stack';
import { AuthStack } from '../lib/auth-stack';
import { IamStack } from '../lib/iam-stack';

// Load environment variables from .env file
dotenv.config();

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
};

// Deploy all stacks
const storageStack = new StorageStack(app, 'EyeSeeYouStorage', { env });
const messagingStack = new MessagingStack(app, 'EyeSeeYouMessaging', { env });
const authStack = new AuthStack(app, 'EyeSeeYouAuth', { env });
const iamStack = new IamStack(app, 'EyeSeeYouIAM', {
  env,
  videosBucket: storageStack.videosBucket,
  snsTopic: messagingStack.snsTopic,
});

// Add dependencies
messagingStack.addDependency(storageStack);
authStack.addDependency(messagingStack);
iamStack.addDependency(storageStack);
iamStack.addDependency(messagingStack);

// Add tags to all stacks for easy identification in AWS Console
cdk.Tags.of(app).add('Project', 'EyeSeeYou');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('Environment', 'Production');

app.synth();
