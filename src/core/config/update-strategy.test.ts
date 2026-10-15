import { describe, expect, it } from 'vitest';
import { configSchema } from './config-schema.js';
import { resolveUpdateMode } from './update-strategy.js';

describe('resolveUpdateMode', () => {
  it('uses the run-wide mode for an ecosystem with no default or override', () => {
    const config = configSchema.parse({});
    expect(resolveUpdateMode('npm', 'non-breaking', config)).toBe('non-breaking');
    expect(resolveUpdateMode('npm', 'breaking', config)).toBe('breaking');
  });

  it('defaults GitHub Actions to breaking regardless of the run-wide mode', () => {
    const config = configSchema.parse({});
    expect(resolveUpdateMode('github-actions', 'non-breaking', config)).toBe('breaking');
  });

  it('lets the config file override an ecosystem default', () => {
    const config = configSchema.parse({ updateStrategies: { 'github-actions': 'non-breaking' } });
    expect(resolveUpdateMode('github-actions', 'breaking', config)).toBe('non-breaking');
  });

  it('keeps the GitHub Actions default when only another ecosystem is overridden', () => {
    const config = configSchema.parse({ updateStrategies: { npm: 'breaking' } });
    expect(resolveUpdateMode('npm', 'non-breaking', config)).toBe('breaking');
    expect(resolveUpdateMode('github-actions', 'non-breaking', config)).toBe('breaking');
  });

  it('rejects an unknown strategy', () => {
    expect(() => configSchema.parse({ updateStrategies: { npm: 'major' } })).toThrow();
  });
});
