import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityClient, GetCredentialsForIdentityCommand } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import type { User } from '@/types/auth';

interface CognitoUser {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  email: string;
  name?: string;
}

class CognitoAuth {
  private userPoolId: string;
  private clientId: string;
  private identityPoolId: string;
  private region: string;
  private cognitoDomain: string;

  constructor() {
    this.userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '';
    this.clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '';
    this.identityPoolId = process.env.NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID || '';
    this.region = process.env.NEXT_PUBLIC_AWS_REGION || 'ap-southeast-2';
    this.cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '';
  }

  /**
   * Initiate Google OAuth login by redirecting to Cognito hosted UI
   */
  initiateGoogleLogin(): void {
    if (!this.cognitoDomain || !this.clientId) {
      throw new Error('Cognito configuration missing. Set NEXT_PUBLIC_COGNITO_DOMAIN and NEXT_PUBLIC_COGNITO_CLIENT_ID');
    }

    const redirectUri = `${typeof window !== 'undefined' ? window.location.origin : ''}/callback-handler.html`;
    const authUrl = `https://${this.cognitoDomain}.auth.${this.region}.amazoncognito.com/oauth2/authorize?` +
      `client_id=${this.clientId}&` +
      `response_type=code&` +
      `scope=email+openid+profile&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `identity_provider=Google`;

    window.location.href = authUrl;
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleOAuthCallback(code: string): Promise<void> {
    if (!this.cognitoDomain || !this.clientId) {
      throw new Error('Cognito configuration missing');
    }

    const redirectUri = window.location.origin + '/callback';
    const tokenUrl = `https://${this.cognitoDomain}.auth.${this.region}.amazoncognito.com/oauth2/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${error}`);
    }

    const tokens = await response.json();
    this.storeTokens(tokens);
  }

  /**
   * Store tokens in localStorage
   */
  private storeTokens(tokens: any): void {
    localStorage.setItem('eyeseeyou_id_token', tokens.id_token);
    localStorage.setItem('eyeseeyou_access_token', tokens.access_token);
    if (tokens.refresh_token) {
      localStorage.setItem('eyeseeyou_refresh_token', tokens.refresh_token);
    }
  }

  /**
   * Get the ID token (for authenticating with Cognito Identity Pool)
   * Checks sessionStorage first (for OAuth callback flow), then localStorage
   */
  getIdToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('eyeseeyou_id_token') || localStorage.getItem('eyeseeyou_id_token');
  }

  /**
   * Get the access token
   * Checks sessionStorage first (for OAuth callback flow), then localStorage
   */
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('eyeseeyou_access_token') || localStorage.getItem('eyeseeyou_access_token');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.getIdToken() !== null;
  }

  /**
   * Check if the ID token is expired or about to expire (within 5 minutes)
   */
  isTokenExpired(): boolean {
    const idToken = this.getIdToken();
    if (!idToken) return true;

    try {
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      const expirationTime = payload.exp * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      // Return true if token expires within 5 minutes
      return expirationTime - currentTime < fiveMinutes;
    } catch (error) {
      return true; // If we can't parse the token, consider it expired
    }
  }

  /**
   * Get refresh token from storage
   */
  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('eyeseeyou_refresh_token') || localStorage.getItem('eyeseeyou_refresh_token');
  }

  /**
   * Refresh the ID and access tokens using the refresh token
   * Returns true if refresh was successful, false otherwise
   */
  async refreshTokens(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    if (!this.cognitoDomain || !this.clientId) {
      return false;
    }

    try {
      const tokenUrl = `https://${this.cognitoDomain}.auth.${this.region}.amazoncognito.com/oauth2/token`;

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const tokens = await response.json();

      // Update tokens in storage (same location as original tokens)
      if (sessionStorage.getItem('eyeseeyou_id_token')) {
        sessionStorage.setItem('eyeseeyou_id_token', tokens.id_token);
        sessionStorage.setItem('eyeseeyou_access_token', tokens.access_token);
      } else {
        localStorage.setItem('eyeseeyou_id_token', tokens.id_token);
        localStorage.setItem('eyeseeyou_access_token', tokens.access_token);
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Migrate tokens from sessionStorage to localStorage
   * Called by AuthContext on mount to persist tokens across browser sessions
   */
  migrateTokensToLocalStorage(): boolean {
    if (typeof window === 'undefined') return false;

    const idToken = sessionStorage.getItem('eyeseeyou_id_token');
    const accessToken = sessionStorage.getItem('eyeseeyou_access_token');
    const refreshToken = sessionStorage.getItem('eyeseeyou_refresh_token');

    if (idToken && accessToken) {
      try {
        localStorage.setItem('eyeseeyou_id_token', idToken);
        localStorage.setItem('eyeseeyou_access_token', accessToken);
        if (refreshToken) {
          localStorage.setItem('eyeseeyou_refresh_token', refreshToken);
        }

        // Clear sessionStorage after successful migration
        sessionStorage.removeItem('eyeseeyou_id_token');
        sessionStorage.removeItem('eyeseeyou_access_token');
        sessionStorage.removeItem('eyeseeyou_refresh_token');

        return true;
      } catch (error) {
        // localStorage write failed, keep in sessionStorage
        return false;
      }
    }

    return false;
  }

  /**
   * Get current user info from ID token (decoded)
   */
  getCurrentUser(): User | null {
    const idToken = this.getIdToken();
    if (!idToken) return null;

    try {
      // Decode JWT (payload is second part, separated by dots)
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Logout user
   */
  logout(): void {
    // Clear both localStorage and sessionStorage
    localStorage.removeItem('eyeseeyou_id_token');
    localStorage.removeItem('eyeseeyou_access_token');
    localStorage.removeItem('eyeseeyou_refresh_token');
    localStorage.removeItem('eyeseeyou_latest_video');

    sessionStorage.removeItem('eyeseeyou_id_token');
    sessionStorage.removeItem('eyeseeyou_access_token');
    sessionStorage.removeItem('eyeseeyou_refresh_token');

    // Redirect to Cognito logout URL
    if (this.cognitoDomain && this.clientId) {
      const logoutUrl = `https://${this.cognitoDomain}.auth.${this.region}.amazoncognito.com/logout?` +
        `client_id=${this.clientId}&` +
        `logout_uri=${encodeURIComponent(window.location.origin + '/')}`;
      window.location.href = logoutUrl;
    }
  }

  /**
   * Get temporary AWS credentials from Cognito Identity Pool
   * These are used for SQS/S3 access
   */
  async getAWSCredentials() {
    const idToken = this.getIdToken();
    if (!idToken) {
      throw new Error('User not authenticated - no ID token found');
    }

    if (!this.identityPoolId) {
      throw new Error('Cognito Identity Pool ID not configured. Set NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID');
    }

    if (!this.userPoolId) {
      throw new Error('Cognito User Pool ID not configured. Set NEXT_PUBLIC_COGNITO_USER_POOL_ID');
    }

    const loginKey = `cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`;

    const credentials = fromCognitoIdentityPool({
      clientConfig: { region: this.region },
      identityPoolId: this.identityPoolId,
      logins: {
        [loginKey]: idToken,
      },
    });

    return credentials;
  }
}

export const cognitoAuth = new CognitoAuth();
