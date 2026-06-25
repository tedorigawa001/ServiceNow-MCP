import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authLogout, authWhoami, getStoredToken } from '../../src/cli/auth.js';
import * as fs from 'fs';
import * as os from 'os';

vi.mock('fs');
vi.mock('os');

// Mock external deps to prevent hanging tests
vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
}));

vi.mock('ora', () => {
  return {
    default: () => ({
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
    })
  };
});

describe('auth', () => {
  const mockTokens = {
    tokens: {
      'test_service_now_com': {
        instanceUrl: 'https://test.service-now.com',
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        expiresAt: Date.now() + 3600000,
        snUser: 'test_user',
        snUserSysId: 'mock-sys-id'
      }
    }
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('getStoredToken', () => {
    it('returns token if exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockTokens));

      const token = getStoredToken('https://test.service-now.com');
      expect(token).toBeDefined();
      expect(token?.snUser).toBe('test_user');
    });

    it('returns undefined if not exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const token = getStoredToken('https://test.service-now.com');
      expect(token).toBeUndefined();
    });
  });

  describe('authLogout', () => {
    it('removes specific instance token', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockTokens));

      authLogout('https://test.service-now.com');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const writtenStore = JSON.parse(writeCall);
      expect(writtenStore.tokens['test_service_now_com']).toBeUndefined();
    });

    it('removes all tokens when no instance specified', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockTokens));

      authLogout();

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const writtenStore = JSON.parse(writeCall);
      expect(Object.keys(writtenStore.tokens).length).toBe(0);
    });
  });

  describe('authWhoami', () => {
    it('logs active tokens without throwing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockTokens));

      expect(() => authWhoami()).not.toThrow();
      expect(console.log).toHaveBeenCalled();
    });

    it('handles empty token store gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => authWhoami()).not.toThrow();
      expect(console.log).toHaveBeenCalled();
    });
  });
});
