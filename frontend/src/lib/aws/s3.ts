import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { cognitoAuth } from '@/lib/auth/cognitoAuth';
import type { VideoNotification } from '@/types/video';

let s3Client: S3Client | null = null;

async function getS3Client(): Promise<S3Client> {
  if (!s3Client) {
    const region = process.env.NEXT_PUBLIC_AWS_REGION || 'ap-southeast-2';

    // Get temporary credentials from Cognito Identity Pool
    const credentials = await cognitoAuth.getAWSCredentials();

    s3Client = new S3Client({
      region,
      credentials,
    });
  }

  return s3Client;
}

export async function getMostRecentVideo(): Promise<VideoNotification | null> {
  try {
    const client = await getS3Client();
    const bucketName = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;
    const cloudFrontUrl = process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN_VIDEOS;

    if (!cloudFrontUrl || !bucketName) {
      return null;
    }

    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'videos/',
      MaxKeys: 100,
    });

    const response = await client.send(command);

    if (!response.Contents || response.Contents.length === 0) {
      return null;
    }

    // Sort by LastModified descending to get the most recent
    const sortedObjects = response.Contents.sort(
      (a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0)
    );

    const mostRecentObject = sortedObjects[0];

    if (!mostRecentObject.Key) {
      return null;
    }

    // Extract timestamp from filename (format: videos/person_detected_DD-MM-YYYY_HH-MM-SS.mp4)
    const filename = mostRecentObject.Key.split('/').pop() || '';
    const match = filename.match(/person_detected_(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})/);

    let timestamp = '';
    if (match) {
      const [, day, month, year, hour, minute, second] = match;
      // Convert DD-MM-YYYY HH-MM-SS to ISO format YYYY-MM-DDTHH:MM:SSZ
      timestamp = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
    } else {
      // Fallback to S3 LastModified
      timestamp = mostRecentObject.LastModified?.toISOString() || new Date().toISOString();
    }

    const cloudFrontVideoUrl = `${cloudFrontUrl}/${mostRecentObject.Key}`;

    return {
      s3_key: mostRecentObject.Key,
      timestamp,
      event_type: 'human_detected',
      cloudfront_url: cloudFrontVideoUrl,
    };
  } catch (error) {
    // Fail silently - no error logging per security requirement
    return null;
  }
}
