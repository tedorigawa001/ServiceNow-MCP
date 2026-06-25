import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadConfig,
  saveConfig,
  addInstance,
  listInstances,
  getDefaultInstance,
  removeInstance,
  type InstanceConfig
} from '../../src/cli/config-store.js';
import * as fs from 'fs';
import * as os from 'os';

vi.mock('fs');
vi.mock('os');

describe('config-store', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home');
  });

  const mockInstance: InstanceConfig = {
    name: 'test',
    instanceUrl: 'https://test.service-now.com',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    addedAt: '2024-01-01T00:00:00.000Z'
  };

  describe('loadConfig', () => {
    it('returns default config when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const config = loadConfig();
      expect(config).toEqual({ version: 1, defaultInstance: '', instances: {} });
    });

    it('returns parsed config when file exists and is valid', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        defaultInstance: 'test',
        instances: { test: mockInstance }
      }));
      
      const config = loadConfig();
      expect(config.defaultInstance).toBe('test');
      expect(config.instances.test.name).toBe('test');
    });

    it('returns default config when file is invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');
      
      const config = loadConfig();
      expect(config).toEqual({ version: 1, defaultInstance: '', instances: {} });
    });
  });

  describe('saveConfig', () => {
    it('creates directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false); // For ensureDir
      
      saveConfig({ version: 1, defaultInstance: '', instances: {} });
      
      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/home/.config/servicenow-mcp', { recursive: true, mode: 0o700 });
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.chmodSync).toHaveBeenCalled();
    });

    it('writes config to file and sets permissions', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true); // Dir exists
      
      const config = { version: 1, defaultInstance: 'test', instances: { test: mockInstance } };
      saveConfig(config);
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/home/.config/servicenow-mcp/instances.json',
        JSON.stringify(config, null, 2),
        { encoding: 'utf8', mode: 0o600 }
      );
      expect(fs.chmodSync).toHaveBeenCalledWith('/mock/home/.config/servicenow-mcp/instances.json', 0o600);
    });
  });

  describe('addInstance', () => {
    it('adds instance and sets as default if none exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false); // No config exists
      
      addInstance(mockInstance);
      
      expect(fs.writeFileSync).toHaveBeenCalled();
      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenContent);
      
      expect(writtenConfig.defaultInstance).toBe('test');
      expect(writtenConfig.instances.test.name).toBe('test');
    });

    it('adds instance but does not overwrite default if one exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        defaultInstance: 'existing',
        instances: {
          existing: { ...mockInstance, name: 'existing' }
        }
      }));
      
      addInstance(mockInstance);
      
      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenContent);
      
      expect(writtenConfig.defaultInstance).toBe('existing');
      expect(writtenConfig.instances.test).toBeDefined();
    });
  });

  describe('listInstances', () => {
    it('returns array of instances', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        defaultInstance: 'test',
        instances: { test: mockInstance }
      }));
      
      const instances = listInstances();
      expect(instances).toHaveLength(1);
      expect(instances[0].name).toBe('test');
    });
  });

  describe('getDefaultInstance', () => {
    it('returns the default instance if it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        defaultInstance: 'test',
        instances: { test: mockInstance }
      }));
      
      const instance = getDefaultInstance();
      expect(instance).toBeDefined();
      expect(instance?.name).toBe('test');
    });

    it('returns undefined if default instance does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        defaultInstance: 'test2',
        instances: { test: mockInstance }
      }));
      
      const instance = getDefaultInstance();
      expect(instance).toBeUndefined();
    });
  });

  describe('removeInstance', () => {
    it('returns false if instance does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        defaultInstance: 'test',
        instances: { test: mockInstance }
      }));
      
      expect(removeInstance('not-found')).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('removes instance and returns true', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        defaultInstance: 'test2',
        instances: { 
          test: mockInstance,
          test2: { ...mockInstance, name: 'test2' }
        }
      }));
      
      expect(removeInstance('test')).toBe(true);
      
      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenContent);
      expect(writtenConfig.instances.test).toBeUndefined();
      expect(writtenConfig.instances.test2).toBeDefined();
      expect(writtenConfig.defaultInstance).toBe('test2');
    });

    it('changes default instance if the default is removed', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        defaultInstance: 'test',
        instances: { 
          test: mockInstance,
          test2: { ...mockInstance, name: 'test2' }
        }
      }));
      
      expect(removeInstance('test')).toBe(true);
      
      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenContent);
      expect(writtenConfig.instances.test).toBeUndefined();
      expect(writtenConfig.defaultInstance).toBe('test2');
    });

    it('clears default instance if the last one is removed', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        defaultInstance: 'test',
        instances: { test: mockInstance }
      }));
      
      expect(removeInstance('test')).toBe(true);
      
      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const writtenConfig = JSON.parse(writtenContent);
      expect(writtenConfig.instances.test).toBeUndefined();
      expect(writtenConfig.defaultInstance).toBe('');
    });
  });
});
