import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getPrompts, resolvePrompt } from '../../src/prompts/index.js';
import { itsmPrompts } from '../../src/prompts/itsm.js';
import { loadUserPrompts } from '../../src/prompts/user-prompts.js';

// loadUserPrompts reads <cwd>/servicenow-mcp.commands.json — drive cwd via a spy
// so tests are hermetic regardless of where vitest runs.
let tmpDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sn-prompts-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
});

afterEach(() => {
  cwdSpy.mockRestore();
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeCommands(content: string) {
  writeFileSync(join(tmpDir, 'servicenow-mcp.commands.json'), content);
}

describe('itsmPrompts (built-in catalog)', () => {
  it('every prompt has name, description and template', () => {
    expect(itsmPrompts.length).toBeGreaterThanOrEqual(11);
    for (const p of itsmPrompts) {
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.template).toBeTruthy();
    }
  });

  it('argument-bearing prompts declare well-formed arguments', () => {
    const withArgs = itsmPrompts.filter(p => p.arguments && p.arguments.length > 0);
    expect(withArgs.length).toBeGreaterThan(0);
    for (const p of withArgs) {
      for (const a of p.arguments!) {
        expect(a.name).toBeTruthy();
        expect(a.description).toBeTruthy();
      }
    }
  });

  it('has unique prompt names', () => {
    const names = itsmPrompts.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('getPrompts', () => {
  it('returns the built-in prompts when no user file is present', () => {
    const prompts = getPrompts();
    expect(prompts.length).toBe(itsmPrompts.length);
    expect(prompts.map(p => p.name)).toContain('morning-standup');
    // template must NOT leak into the public prompt list
    expect((prompts[0] as Record<string, unknown>).template).toBeUndefined();
  });

  it('merges user-defined prompts after the built-ins', () => {
    writeCommands(JSON.stringify([
      { name: 'my-runbook', description: 'team runbook', template: 'do the thing' },
    ]));
    const names = getPrompts().map(p => p.name);
    expect(names).toContain('my-runbook');
    expect(names.length).toBe(itsmPrompts.length + 1);
  });
});

describe('resolvePrompt', () => {
  it('resolves a built-in prompt to a user message', () => {
    const res = resolvePrompt('p1-alerts');
    expect(res).not.toBeNull();
    expect(res!.messages[0].role).toBe('user');
    expect(res!.messages[0].content.text).toContain('Priority 1');
  });

  it('returns null for an unknown prompt', () => {
    expect(resolvePrompt('does-not-exist')).toBeNull();
  });

  it('substitutes provided arguments into the template', () => {
    const res = resolvePrompt('knowledge-search', { topic: 'VPN setup' });
    expect(res!.messages[0].content.text).toContain('"VPN setup"');
    expect(res!.messages[0].content.text).not.toContain('{topic}');
  });

  it('replaces every occurrence and leaves unsupplied placeholders intact', () => {
    const res = resolvePrompt('create-incident', { description: 'printer down' });
    const text = res!.messages[0].content.text;
    expect(text).toContain('printer down');
    expect(text).toContain('{category}'); // not supplied → placeholder remains
  });

  it('resolves a user-defined prompt', () => {
    writeCommands(JSON.stringify([
      { name: 'my-runbook', description: 'team runbook', template: 'run {step}' },
    ]));
    const res = resolvePrompt('my-runbook', { step: '42' });
    expect(res!.messages[0].content.text).toBe('run 42');
  });
});

describe('loadUserPrompts', () => {
  it('returns [] when the commands file is absent', () => {
    expect(loadUserPrompts()).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    writeCommands('{ not valid json');
    expect(loadUserPrompts()).toEqual([]);
  });

  it('returns [] when the JSON is not an array', () => {
    writeCommands(JSON.stringify({ name: 'x', template: 'y' }));
    expect(loadUserPrompts()).toEqual([]);
  });

  it('keeps only well-formed entries (name + template strings)', () => {
    writeCommands(JSON.stringify([
      { name: 'ok', description: 'd', template: 't' },
      { name: 'missing-template' },
      { template: 'missing-name' },
      'not-an-object',
      null,
      { name: 123, template: 't' },
    ]));
    const result = loadUserPrompts();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ok');
  });
});
