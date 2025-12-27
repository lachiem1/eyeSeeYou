import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // Pre-Authentication Lambda Trigger
    // ========================================
    const preAuthTrigger = new lambda.Function(this, 'PreAuthTrigger', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/pre-auth-trigger')),
      functionName: 'eyeseeyou-pre-auth-whitelist',
      description: 'Email whitelist enforcement for EyeSeeYou',
      timeout: cdk.Duration.seconds(10),
      environment: {
        // TODO: Replace with your whitelisted emails
        WHITELISTED_EMAILS: 'your-email@gmail.com,family-member@gmail.com',
      },
    });

    // ========================================
    // Cognito User Pool
    // ========================================
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'eyeseeyou-users',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: false,
          mutable: true,
        },
        familyName: {
          required: false,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep user data
      lambdaTriggers: {
        preAuthentication: preAuthTrigger,
      },
    });

    // Grant Cognito permission to invoke the Lambda
    preAuthTrigger.grantInvoke(
      new iam.ServicePrincipal('cognito-idp.amazonaws.com', {
        conditions: {
          ArnLike: {
            'aws:SourceArn': this.userPool.userPoolArn,
          },
        },
      })
    );

    // ========================================
    // User Pool Client
    // ========================================
    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'eyeseeyou-web-client',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'http://localhost:3000/callback',
          'http://localhost:3000/',
          // TODO: Add your CloudFront URL after deployment
          // 'https://d1234567890.cloudfront.net/callback',
        ],
        logoutUrls: [
          'http://localhost:3000/',
          // TODO: Add your CloudFront URL after deployment
          // 'https://d1234567890.cloudfront.net/',
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        // TODO: Add Google after configuring Google OAuth app
        // cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
      generateSecret: false, // Required for browser-based apps
    });

    // ========================================
    // User Pool Domain
    // ========================================
    const userPoolDomain = this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `eyeseeyou-${this.account}`,
      },
    });

    // ========================================
    // Google Identity Provider
    // ========================================
    // NOTE: You need to create a Google OAuth app first and get client ID/secret
    // Then create this provider manually or use environment variables

    // Example (uncomment and fill in after getting Google credentials):
    /*
    new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      userPool: this.userPool,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scopes: ['email', 'openid', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
      },
    });
    */

    // ========================================
    // Cognito Identity Pool (for SQS access)
    // ========================================
    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: 'eyeseeyou-identity-pool',
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // Authenticated role for SQS access
    const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    // Grant SQS access to authenticated users
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'sqs:ReceiveMessage',
          'sqs:DeleteMessage',
          'sqs:GetQueueAttributes',
          'sqs:GetQueueUrl',
        ],
        resources: [
          `arn:aws:sqs:${this.region}:${this.account}:eyeseeyou-frontend-notifications`,
        ],
      })
    );

    // Attach role to identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'EyeSeeYouUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'EyeSeeYouUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: 'EyeSeeYouIdentityPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: userPoolDomain.domainName,
      description: 'Cognito User Pool Domain',
      exportName: 'EyeSeeYouUserPoolDomain',
    });

    new cdk.CfnOutput(this, 'OAuthURL', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito OAuth URL',
      exportName: 'EyeSeeYouOAuthURL',
    });
  }
}
