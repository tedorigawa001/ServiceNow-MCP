import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeClientConfig } from '../../../src/cli/writers/index.js';
import type { DetectedClient, WriteMethod } from '../../../src/cli/detect-clients.js';
import type { InstanceConfig } from '../../../src/cli/config-store.js';
import * as fs from 'fs';
import * as child_process from 'child_process';

vi.mock('fs');
vi.mock('child_process');

describe('writers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockInstance: InstanceConfig = {
    name: 'test',
    instanceUrl: 'https://test.service-now.com',
    clientId: 'test-client',
    clientSecret: 'test-secret',
    addedAt: '2024-01-01',
    writeEnabled: true,
    toolPackage: 'full'
  };

  const createClient = (writeMethod: WriteMethod): DetectedClient => ({
    id: 'test-client',
    name: 'Test Client',
    detected: true,
    configPath: '/mock/path/config.json',
    configKey: 'mcpServers',
    writeMethod,
    requiresRestart: false
  });

  describe('writeMcpServersJson', () => {
    it('creates new config if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const client = createClient('json-mcpServers');
      const result = writeClientConfig(client, mockInstance);
      
      expect(result.success).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/path', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalled();
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenJson = JSON.parse(writeCall[1] as string);
      
      expect(writtenJson.mcpServers['servicenow-mcp'].env.SERVICENOW_INSTANCE_URL).toBe('https://test.service-now.com');
      expect(writtenJson.mcpServers['servicenow-mcp'].env.WRITE_ENABLED).toBe('true');
    });

    it('merges into existing config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          otherServer: { command: 'other' }
        }
      }));
      
      const client = createClient('json-mcpServers');
      const result = writeClientConfig(client, mockInstance);
      
      expect(result.success).toBe(true);
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenJson = JSON.parse(writeCall[1] as string);
      
      expect(writtenJson.mcpServers.otherServer).toBeDefined();
      expect(writtenJson.mcpServers['servicenow-mcp']).toBeDefined();
    });

    it('returns false on error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => { throw new Error('Permission denied'); });
      
      const client = createClient('json-mcpServers');
      const result = writeClientConfig(client, mockInstance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to write');
    });
  });

  describe('writeVsCodeJson', () => {
    it('writes vscode-specific config format', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const client = createClient('json-servers');
      const result = writeClientConfig(client, mockInstance);
      
      expect(result.success).toBe(true);
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenJson = JSON.parse(writeCall[1] as string);
      
      expect(writtenJson.servers['servicenow-mcp'].type).toBe('stdio');
      expect(writtenJson.servers['servicenow-mcp'].env.SERVICENOW_INSTANCE_URL).toBe('https://test.service-now.com');
    });
  });

  describe('writeClaudeCode', () => {
    it('executes claude mcp add command', () => {
      vi.mocked(child_process.execSync).mockReturnValue(Buffer.from(''));
      
      const client = createClient('command');
      const result = writeClientConfig(client, mockInstance);
      
      expect(result.success).toBe(true);
      expect(child_process.execSync).toHaveBeenCalled();
      
      const execCall = vi.mocked(child_process.execSync).mock.calls[0][0] as string;
      expect(execCall).toContain('claude mcp add servicenow-mcp');
      expect(execCall).toContain('--env SERVICENOW_INSTANCE_URL=https://test.service-now.com');
    });

    it('returns false on execution failure', () => {
      vi.mocked(child_process.execSync).mockImplementation(() => { throw new Error('Command failed'); });
      
      const client = createClient('command');
      const result = writeClientConfig(client, mockInstance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('claude mcp add failed');
    });
  });

  describe('writeDotEnv', () => {
    it('writes key=value pairs to file', () => {
      const client = createClient('env');
      const result = writeClientConfig(client, mockInstance);
      
      expect(result.success).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = writeCall[1] as string;
      
      expect(writtenContent).toContain('SERVICENOW_INSTANCE_URL=https://test.service-now.com');
      expect(writtenContent).toContain('SERVICENOW_OAUTH_CLIENT_ID=test-client');
      expect(writtenContent).toContain('WRITE_ENABLED=true');
    });
  });
  
  describe('unknown method', () => {
    it('returns false for unknown write method', () => {
      const client = createClient('unknown' as WriteMethod);
      const result = writeClientConfig(client, mockInstance);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown write method');
    });
  });
});
