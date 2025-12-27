import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

interface IamStackProps extends cdk.StackProps {
  videosBucket: s3.Bucket;
  snsTopic: sns.Topic;
}

export class IamStack extends cdk.Stack {
  public readonly backendRole: iam.Role;
  public readonly backendUser: iam.User;
  public readonly backendAccessKey: iam.CfnAccessKey;

  constructor(scope: Construct, id: string, props: IamStackProps) {
    super(scope, id, props);

    const { videosBucket, snsTopic } = props;

    // ========================================
    // IAM Role for Raspberry Pi Backend
    // ========================================
    this.backendRole = new iam.Role(this, 'BackendPiRole', {
      roleName: 'eyeseeyou-backend-pi-role',
      description: 'Role for EyeSeeYou backend running on Raspberry Pi',
      assumedBy: new iam.AccountRootPrincipal(), // Can be assumed by IAM users in this account
      maxSessionDuration: cdk.Duration.hours(12),
    });

    // Grant S3 permissions (upload videos)
    videosBucket.grantPut(this.backendRole);
    videosBucket.grantRead(this.backendRole);

    // Grant SNS permissions (publish notifications)
    snsTopic.grantPublish(this.backendRole);

    // ========================================
    // IAM User for Raspberry Pi
    // ========================================
    this.backendUser = new iam.User(this, 'BackendPiUser', {
      userName: 'eyeseeyou-backend-pi',
    });

    // Allow user to assume the backend role
    this.backendUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [this.backendRole.roleArn],
      })
    );

    // Create access key for the user
    this.backendAccessKey = new iam.CfnAccessKey(this, 'BackendPiAccessKey', {
      userName: this.backendUser.userName,
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'BackendRoleArn', {
      value: this.backendRole.roleArn,
      description: 'IAM Role ARN for backend (to be used in Pi credentials)',
      exportName: 'EyeSeeYouBackendRoleArn',
    });

    new cdk.CfnOutput(this, 'BackendUserName', {
      value: this.backendUser.userName,
      description: 'IAM User name for backend',
      exportName: 'EyeSeeYouBackendUserName',
    });

    new cdk.CfnOutput(this, 'BackendAccessKeyId', {
      value: this.backendAccessKey.ref,
      description: 'Access Key ID for backend user (SAVE THIS - shown only once)',
      exportName: 'EyeSeeYouBackendAccessKeyId',
    });

    new cdk.CfnOutput(this, 'BackendSecretAccessKey', {
      value: this.backendAccessKey.attrSecretAccessKey,
      description: 'Secret Access Key for backend user (SAVE THIS - shown only once)',
      exportName: 'EyeSeeYouBackendSecretAccessKey',
    });

    new cdk.CfnOutput(this, 'AWSCredentialsFileContent', {
      value: `[default]\naws_access_key_id = ${this.backendAccessKey.ref}\naws_secret_access_key = ${this.backendAccessKey.attrSecretAccessKey}\nrole_arn = ${this.backendRole.roleArn}\n`,
      description: 'Complete AWS credentials file content for ~/.aws/credentials on Pi',
    });
  }
}
