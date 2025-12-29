import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export class StorageStack extends cdk.Stack {
  public readonly videosBucket: s3.Bucket;
  public readonly frontendBucket: s3.Bucket;
  public readonly videosDistribution: cloudfront.Distribution;
  public readonly frontendDistribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // Videos S3 Bucket
    // ========================================
    this.videosBucket = new s3.Bucket(this, 'VideosBucket', {
      bucketName: `eyeseeyou-videos-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep videos even if stack is deleted
      lifecycleRules: [
        {
          id: 'delete-old-videos',
          enabled: true,
          expiration: cdk.Duration.days(30), // Delete videos after 30 days
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'], // CloudFront will handle CORS
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });

    // ========================================
    // CloudFront Distribution for Videos
    // ========================================
    const videosOriginAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'VideosOAI',
      {
        comment: 'OAI for EyeSeeYou videos bucket',
      }
    );

    // Grant CloudFront OAI read access to videos bucket
    this.videosBucket.grantRead(videosOriginAccessIdentity);

    // Import the existing key group for signed URLs
    const keyGroup = cloudfront.KeyGroup.fromKeyGroupId(
      this,
      'VideosKeyGroup',
      '2ab12976-4f29-4726-ba41-193138b2af9f'
    );

    this.videosDistribution = new cloudfront.Distribution(this, 'VideosDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.videosBucket, {
          originAccessIdentity: videosOriginAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        trustedKeyGroups: [keyGroup], // Require signed URLs
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, Canada, Europe only (cost optimization)
      comment: 'EyeSeeYou Videos CDN',
    });

    // ========================================
    // Frontend S3 Bucket
    // ========================================
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `eyeseeyou-frontend-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Can safely delete frontend assets
      autoDeleteObjects: true,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: '404.html',
    });

    // ========================================
    // CloudFront Distribution for Frontend
    // ========================================
    const frontendOriginAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'FrontendOAI',
      {
        comment: 'OAI for EyeSeeYou frontend bucket',
      }
    );

    this.frontendBucket.grantRead(frontendOriginAccessIdentity);

    // Custom cache policy for SPA - no caching for HTML to support OAuth callbacks
    const spaCachePolicy = new cloudfront.CachePolicy(this, 'SPACachePolicy', {
      cachePolicyName: 'EyeSeeYou-SPA-Cache-Policy',
      comment: 'Cache policy for SPA with OAuth - minimal HTML caching',
      defaultTtl: cdk.Duration.seconds(0), // No caching by default
      minTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.days(1),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(), // Pass all query params (important for OAuth code)
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Import the ACM certificate for custom domain (from environment variable)
    const certificateArn = process.env.CDK_ACM_CERT_ARN;
    if (!certificateArn) {
      throw new Error('CDK_ACM_CERT_ARN environment variable must be set');
    }

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'FrontendCertificate',
      certificateArn
    );

    this.frontendDistribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.frontendBucket, {
          originAccessIdentity: frontendOriginAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        cachePolicy: spaCachePolicy,
      },
      domainNames: ['eyeseeyou.mcleod-studios-s3-service.com'],
      certificate: certificate,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      comment: 'EyeSeeYou Frontend CDN',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'VideosBucketName', {
      value: this.videosBucket.bucketName,
      description: 'S3 bucket for video storage',
      exportName: 'EyeSeeYouVideosBucketName',
    });

    new cdk.CfnOutput(this, 'VideosCloudFrontDomain', {
      value: this.videosDistribution.distributionDomainName,
      description: 'CloudFront domain for videos',
      exportName: 'EyeSeeYouVideosCloudFrontDomain',
    });

    new cdk.CfnOutput(this, 'VideosCloudFrontURL', {
      value: `https://${this.videosDistribution.distributionDomainName}`,
      description: 'CloudFront URL for videos',
      exportName: 'EyeSeeYouVideosCloudFrontURL',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'S3 bucket for frontend hosting',
      exportName: 'EyeSeeYouFrontendBucketName',
    });

    new cdk.CfnOutput(this, 'FrontendCloudFrontDomain', {
      value: this.frontendDistribution.distributionDomainName,
      description: 'CloudFront domain for frontend',
      exportName: 'EyeSeeYouFrontendCloudFrontDomain',
    });

    new cdk.CfnOutput(this, 'FrontendURL', {
      value: `https://${this.frontendDistribution.distributionDomainName}`,
      description: 'Frontend URL',
      exportName: 'EyeSeeYouFrontendURL',
    });

    new cdk.CfnOutput(this, 'FrontendDistributionId', {
      value: this.frontendDistribution.distributionId,
      description: 'CloudFront distribution ID for cache invalidation',
      exportName: 'EyeSeeYouFrontendDistributionId',
    });
  }
}
