import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectClients } from '../../src/cli/detect-clients.js';
import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';

vi.mock('fs');
vi.mock('os');
vi.mock('child_process');

describe('detect-clients', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    Object.defineProperty(process, 'env', { value: { APPDATA: '/mock/appdata', LOCALAPPDATA: '/mock/localappdata' } });
    vi.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');
  });

  it('returns all clients with expected properties', () => {
    // Default mocks: nothing exists
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(child_process.execSync).mockImplementation(() => { throw new Error(); });

    const clients = detectClients();
    expect(clients).toHaveLength(7);
    
    // dotenv should always be detected
    const dotenv = clients.find(c => c.id === 'dotenv');
    expect(dotenv?.detected).toBe(true);
    
    // Others should not be detected
    const claude = clients.find(c => c.id === 'claude-desktop');
    expect(claude?.detected).toBe(false);
  });

  it('detects Claude Desktop via config file on macOS', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p.toString().includes('claude_desktop_config.json');
    });
    vi.mocked(child_process.execSync).mockImplementation(() => { throw new Error(); });

    const clients = detectClients();
    const claude = clients.find(c => c.id === 'claude-desktop');
    expect(claude?.detected).toBe(true);
  });

  it('detects Claude Desktop via app path on macOS', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p.toString().includes('/Applications/Claude.app');
    });
    vi.mocked(child_process.execSync).mockImplementation(() => { throw new Error(); });

    const clients = detectClients();
    const claude = clients.find(c => c.id === 'claude-desktop');
    expect(claude?.detected).toBe(true);
  });

  it('detects VS Code via app path on macOS', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p.toString().includes('/Applications/Visual Studio Code.app');
    });
    vi.mocked(child_process.execSync).mockImplementation(() => { throw new Error(); });

    const clients = detectClients();
    const vscode = clients.find(c => c.id === 'vscode');
    expect(vscode?.detected).toBe(true);
  });

  it('detects Claude Code CLI via which command', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(child_process.execSync).mockImplementation((cmd) => {
      if (cmd.toString().includes('claude')) {
        return Buffer.from('/usr/local/bin/claude');
      }
      throw new Error();
    });

    const clients = detectClients();
    const claudeCode = clients.find(c => c.id === 'claude-code');
    expect(claudeCode?.detected).toBe(true);
  });

  describe('windows detection', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
    });

    it('detects Cursor via config file on Windows', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p.toString().includes('Cursor') && p.toString().includes('mcp.json');
      });
      vi.mocked(child_process.execSync).mockImplementation(() => { throw new Error(); });

      const clients = detectClients();
      const cursor = clients.find(c => c.id === 'cursor');
      expect(cursor?.detected).toBe(true);
      expect(cursor?.configPath).toContain('Cursor');
    });

    it('detects Claude Code CLI using where command', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(child_process.execSync).mockImplementation((cmd) => {
        if (cmd.toString() === 'where claude') {
          return Buffer.from('C:\\bin\\claude.exe');
        }
        throw new Error();
      });

      const clients = detectClients();
      const claudeCode = clients.find(c => c.id === 'claude-code');
      expect(claudeCode?.detected).toBe(true);
    });
  });
});
