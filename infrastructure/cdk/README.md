# EyeSeeYou Infrastructure (AWS CDK)

This directory contains the AWS CDK infrastructure code for the EyeSeeYou Ring doorbell camera app.

## Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI configured (`aws configure`)
3. Node.js 18+ installed
4. Google OAuth credentials (for Cognito Google IDP)

## Stack Overview

- **EyeSeeYouStorage**: S3 buckets and CloudFront distributions for videos and frontend
- **EyeSeeYouMessaging**: SNS topic and SQS queue for notifications
- **EyeSeeYouAuth**: Cognito User Pool, Identity Pool, and pre-auth Lambda trigger
- **EyeSeeYouIAM**: IAM roles and users for Raspberry Pi backend

## Setup

### 1. Install Dependencies

```bash
cd infrastructure/cdk
npm install
```

### 2. Configure Email Whitelist

Edit `lib/auth-stack.ts` and update the `WHITELISTED_EMAILS` environment variable in the Lambda function:

```typescript
environment: {
  WHITELISTED_EMAILS: 'your-email@gmail.com,family@gmail.com',
},
```

### 3. Bootstrap CDK (First Time Only)

```bash
npm run cdk bootstrap
```

### 4. Deploy All Stacks

```bash
npm run deploy
```

This will deploy all 4 stacks and output important values like:
- S3 bucket names
- CloudFront URLs
- SNS Topic ARN
- SQS Queue URL
- Cognito User Pool ID and Client ID
- IAM credentials for Raspberry Pi

**IMPORTANT**: Save the outputs, especially:
- Backend Access Key ID and Secret Access Key (shown only once!)
- CloudFront domain for videos (needed in backend .env)
- Cognito User Pool ID, Client ID, Identity Pool ID (needed in frontend)

## Post-Deployment Steps

### 1. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized JavaScript origins: Your CloudFront URL
   - Authorized redirect URIs:
     - `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
     - `http://localhost:3000/callback` (for development)
5. Save the Client ID and Client Secret

### 2. Add Google IDP to Cognito

Option A: Via AWS Console
1. Go to Cognito > User Pools > eyeseeyou-users
2. Sign-in experience > Federated identity provider sign-in
3. Add identity provider > Google
4. Enter Client ID and Client Secret
5. Attributes: email, openid, profile

Option B: Uncomment code in `lib/auth-stack.ts`
```typescript
// Set environment variables
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"

// Then redeploy
npm run deploy
```

### 3. Update Frontend Callback URLs

After deploying, update the Cognito User Pool Client callback URLs with your CloudFront URL:

1. Go to AWS Console > Cognito > User Pools > eyeseeyou-users > App integration
2. Update callback URLs to include: `https://<cloudfront-domain>/callback`
3. Update logout URLs to include: `https://<cloudfront-domain>/`

Or edit `lib/auth-stack.ts` and redeploy.

### 4. Configure Raspberry Pi

Create `~/.aws/credentials` on your Pi with the output from `AWSCredentialsFileContent`:

```ini
[default]
aws_access_key_id = <AccessKeyId from output>
aws_secret_access_key = <SecretAccessKey from output>
role_arn = <BackendRoleArn from output>
```

## Useful Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and compile
- `npm run cdk synth` - Synthesize CloudFormation templates
- `npm run deploy` - Deploy all stacks
- `npm run destroy` - Destroy all stacks (WARNING: deletes resources!)
- `cdk diff` - Compare deployed stack with current state
- `cdk deploy <StackName>` - Deploy a specific stack

## Cost Optimization

All stacks are configured for cost optimization:
- S3 lifecycle policies (transition to IA after 7 days, delete after 30 days)
- CloudFront PriceClass_100 (US, Canada, Europe only)
- SQS long polling (reduces API calls)
- All services use free tier where available

Estimated monthly cost: ~$2-3

## Cleanup

To remove all resources:

```bash
npm run destroy
```

**WARNING**: This will delete:
- All videos in S3 (unless you change RemovalPolicy)
- Cognito users
- SQS messages
- CloudFront distributions

The videos bucket has `RETAIN` policy by default to prevent accidental data loss.

## Troubleshooting

### CDK Bootstrap Issues

If you get "Stack is in ROLLBACK_COMPLETE state and can not be updated":
```bash
aws cloudformation delete-stack --stack-name CDKToolkit
npm run cdk bootstrap
```

### Lambda Deployment Issues

If the Lambda function fails to deploy, check:
- `lambda/pre-auth-trigger/index.ts` compiles correctly
- No TypeScript errors

### Cognito Issues

If Google login doesn't work:
- Verify Google OAuth credentials are correct
- Check callback URLs match exactly
- Ensure Google+ API is enabled in Google Cloud Console
