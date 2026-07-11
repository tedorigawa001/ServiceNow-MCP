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
    const lastWrittenJson = () => {
      const calls = vi.mocked(fs.writeFileSync).mock.calls;
      return JSON.parse(calls[calls.length - 1][1] as string);
    };

    it('writes vscode-specific config format under the servers key', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const client = createClient('json-servers');
      const result = writeClientConfig(client, mockInstance);

      expect(result.success).toBe(true);
      const server = lastWrittenJson().servers['servicenow-mcp'];
      expect(server.type).toBe('stdio');
      expect(server.env.SERVICENOW_INSTANCE_URL).toBe('https://test.service-now.com');
    });

    it('launches via npx server subcommand instead of an absolute dist path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      writeClientConfig(createClient('json-servers'), mockInstance);

      const server = lastWrittenJson().servers['servicenow-mcp'];
      expect(server.command).toBe('npx');
      expect(server.args).toEqual(['-y', '@tedorigawa001/servicenow-mcp', 'server']);
      expect(JSON.stringify(server.args)).not.toContain('dist/server.js');
    });

    it('replaces the client secret with a VS Code input placeholder (no plaintext secret)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      writeClientConfig(createClient('json-servers'), mockInstance);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const raw = writeCall[1] as string;
      const written = JSON.parse(raw);

      expect(written.servers['servicenow-mcp'].env.SERVICENOW_OAUTH_CLIENT_SECRET).toBe(
        '${input:servicenow-client-secret}'
      );
      expect(raw).not.toContain('test-secret');

      expect(written.inputs).toEqual([
        {
          type: 'promptString',
          id: 'servicenow-client-secret',
          description: expect.stringContaining('https://test.service-now.com'),
          password: true,
        },
      ]);
    });

    it('also moves the OAuth password to an input when the instance has one', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      writeClientConfig(createClient('json-servers'), {
        ...mockInstance,
        oauthUsername: 'integration.user',
        oauthPassword: 'super-secret-pass',
      });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const raw = writeCall[1] as string;
      const written = JSON.parse(raw);

      expect(written.servers['servicenow-mcp'].env.SERVICENOW_OAUTH_PASSWORD).toBe(
        '${input:servicenow-oauth-password}'
      );
      expect(raw).not.toContain('super-secret-pass');
      expect(written.inputs.map((i: { id: string }) => i.id)).toEqual([
        'servicenow-client-secret',
        'servicenow-oauth-password',
      ]);
      expect(written.inputs[1].password).toBe(true);
      expect(written.inputs[1].description).toContain('integration.user');
    });

    it('omits the password env and input when the instance has no OAuth password', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      writeClientConfig(createClient('json-servers'), mockInstance);

      const written = lastWrittenJson();
      expect(written.servers['servicenow-mcp'].env.SERVICENOW_OAUTH_PASSWORD).toBeUndefined();
      expect(written.inputs).toHaveLength(1);
    });

    it('merges into an existing mcp.json, preserving other servers and inputs', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          servers: { otherServer: { type: 'stdio', command: 'other' } },
          inputs: [{ type: 'promptString', id: 'other-secret', password: true }],
        })
      );

      const result = writeClientConfig(createClient('json-servers'), mockInstance);

      expect(result.success).toBe(true);
      const written = lastWrittenJson();
      expect(written.servers.otherServer).toEqual({ type: 'stdio', command: 'other' });
      expect(written.servers['servicenow-mcp']).toBeDefined();
      expect(written.inputs.map((i: { id: string }) => i.id)).toEqual([
        'other-secret',
        'servicenow-client-secret',
      ]);
    });

    it('does not duplicate inputs when run twice over the same config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          servers: { 'servicenow-mcp': { type: 'stdio', command: 'node', args: ['old'] } },
          inputs: [
            { type: 'promptString', id: 'servicenow-client-secret', description: 'old', password: true },
          ],
        })
      );

      writeClientConfig(createClient('json-servers'), mockInstance);

      const written = lastWrittenJson();
      expect(written.inputs).toHaveLength(1);
      // entry itself is overwritten with the current launch config
      expect(written.servers['servicenow-mcp'].command).toBe('npx');
    });

    it('recovers from a corrupt existing mcp.json by rewriting a fresh structure', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ not json');

      const result = writeClientConfig(createClient('json-servers'), mockInstance);

      expect(result.success).toBe(true);
      const written = lastWrittenJson();
      expect(written.servers['servicenow-mcp'].command).toBe('npx');
      expect(written.inputs).toHaveLength(1);
    });

    it('returns false when the directory cannot be created', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = writeClientConfig(createClient('json-servers'), mockInstance);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to write');
    });
  });

  describe('writeClaudeCode', () => {
    it('executes claude mcp add command', () => {
      vi.mocked(child_process.execFileSync).mockReturnValue(Buffer.from(''));
      
      const client = createClient('command');
      const result = writeClientConfig(client, mockInstance);
      
      expect(result.success).toBe(true);
      expect(child_process.execFileSync).toHaveBeenCalled();
      
      const [command, args] = vi.mocked(child_process.execFileSync).mock.calls[0];
      expect(command).toBe('claude');
      expect(args).toEqual(expect.arrayContaining(['mcp', 'add', 'servicenow-mcp']));
      expect(args).toEqual(expect.arrayContaining(['--env', 'SERVICENOW_INSTANCE_URL=https://test.service-now.com']));
    });

    it('passes shell metacharacters as a single argument', () => {
      vi.mocked(child_process.execFileSync).mockReturnValue(Buffer.from(''));
      writeClientConfig(createClient('command'), { ...mockInstance, group: 'team; touch /tmp/pwned' });
      const [, args] = vi.mocked(child_process.execFileSync).mock.calls[0];
      expect(args).toContain('SN_INSTANCE_GROUP=team; touch /tmp/pwned');
    });

    it('uses the Windows command shim without enabling a shell', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
      vi.mocked(child_process.execFileSync).mockReturnValue(Buffer.from(''));
      writeClientConfig(createClient('command'), mockInstance);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        'claude.cmd',
        expect.any(Array),
        { stdio: 'pipe' }
      );
    });

    it('returns false on execution failure', () => {
      vi.mocked(child_process.execFileSync).mockImplementation(() => { throw new Error('Command failed'); });
      
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
