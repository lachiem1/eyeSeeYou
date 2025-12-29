import { User } from '@/types/auth';

const STORAGE_KEY = 'eyeseeyou_auth';
const TOKEN_EXPIRY_DAYS = 7;

export const mockAuth = {
  login: (): User => {
    const mockUser: User = {
      id: 'mock-user-' + Date.now(),
      email: 'user@gmail.com',
      name: 'Eye See You User',
      picture: 'https://i.pravatar.cc/150?img=5',
    };

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + TOKEN_EXPIRY_DAYS);

    const authData = {
      user: mockUser,
      expiryDate: expiryDate.toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
    return mockUser;
  },

  logout: (): void => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('eyeseeyou_latest_video');
  },

  getUser: (): User | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;

      const authData = JSON.parse(data);
      const expiryDate = new Date(authData.expiryDate);

      // Check if token has expired
      if (expiryDate < new Date()) {
        mockAuth.logout();
        return null;
      }

      return authData.user;
    } catch (error) {
      return null;
    }
  },

  isAuthenticated: (): boolean => {
    return mockAuth.getUser() !== null;
  },
};
