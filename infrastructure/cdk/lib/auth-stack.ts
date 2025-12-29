import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // SSM Parameter: Whitelisted Google Emails
    // ========================================
    const allowedEmailsParam = new ssm.StringParameter(this, 'AllowedGoogleEmails', {
      parameterName: '/eyeseeyou/allowed-google-emails',
      stringValue: 'your-email@gmail.com,family-member@gmail.com,another-email@gmail.com', // TODO: Replace with actual emails
      description: 'Comma-separated list of allowed Google emails for EyeSeeYou',
      tier: ssm.ParameterTier.STANDARD, // Free tier
    });

    // ========================================
    // Pre-SignUp Lambda Trigger (Email Whitelist)
    // ========================================
    const preAuthTrigger = new lambda.Function(this, 'PreAuthTrigger', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/pre-auth-trigger')),
      functionName: 'eyeseeyou-pre-auth-whitelist',
      description: 'Email whitelist enforcement for EyeSeeYou',
      timeout: cdk.Duration.seconds(10),
      environment: {
        WHITELISTED_EMAILS_PARAM: allowedEmailsParam.parameterName,
      },
    });

    // Grant Lambda permission to read SSM parameter
    allowedEmailsParam.grantRead(preAuthTrigger);

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
        preSignUp: preAuthTrigger,
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
          'http://localhost:3000/callback-handler.html',
          'https://eyeseeyou.mcleod-studios-s3-service.com/callback-handler.html',
        ],
        logoutUrls: [
          'http://localhost:3000/',
          'https://eyeseeyou.mcleod-studios-s3-service.com/',
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
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
    // Get Google OAuth credentials from environment variables
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (googleClientId && googleClientSecret) {
      new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
        userPool: this.userPool,
        clientId: googleClientId,
        clientSecretValue: cdk.SecretValue.unsafePlainText(googleClientSecret),
        scopes: ['email', 'openid', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
        },
      });
    } else {
      console.warn('Google OAuth credentials not provided. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }

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

    // Grant S3 read access to authenticated users
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:ListBucket',
        ],
        resources: [
          `arn:aws:s3:::eyeseeyou-videos-${this.account}`,
          `arn:aws:s3:::eyeseeyou-videos-${this.account}/*`,
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

    new cdk.CfnOutput(this, 'AllowedEmailsParameterName', {
      value: allowedEmailsParam.parameterName,
      description: 'SSM Parameter storing allowed Google emails',
      exportName: 'EyeSeeYouAllowedEmailsParameter',
    });

    new cdk.CfnOutput(this, 'PreAuthLambdaFunctionName', {
      value: preAuthTrigger.functionName,
      description: 'Pre-authentication Lambda function name',
      exportName: 'EyeSeeYouPreAuthLambda',
    });
  }
}
