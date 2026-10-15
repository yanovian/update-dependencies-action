import { describe, expect, it } from 'vitest';
import { parseTagVersion, pickTargetTag } from './action-tags.js';

const TAGS = [
  'v3',
  'v3.5.3',
  'v4',
  'v4.1',
  'v4.1.0',
  'v4.2.2',
  'v5',
  'v5.0.0',
  'v5.0.0-beta.1',
  'main',
];

describe('parseTagVersion', () => {
  it('parses major, minor, and full versions with or without a v prefix', () => {
    expect(parseTagVersion('v4')).toEqual({ prefix: 'v', parts: [4] });
    expect(parseTagVersion('4.1')).toEqual({ prefix: '', parts: [4, 1] });
    expect(parseTagVersion('v4.1.0')).toEqual({ prefix: 'v', parts: [4, 1, 0] });
  });

  it('rejects branches and pre-release tags', () => {
    expect(parseTagVersion('main')).toBeNull();
    expect(parseTagVersion('v5.0.0-beta.1')).toBeNull();
  });
});

describe('pickTargetTag', () => {
  it('moves a floating major tag to the newest major in breaking mode', () => {
    expect(pickTargetTag('v3', TAGS, 'breaking')).toBe('v5');
  });

  it('leaves a floating major tag alone in non-breaking mode', () => {
    expect(pickTargetTag('v4', TAGS, 'non-breaking')).toBeNull();
  });

  it('keeps a full version within its major in non-breaking mode', () => {
    expect(pickTargetTag('v4.1.0', TAGS, 'non-breaking')).toBe('v4.2.2');
  });

  it('keeps the same precision and never picks a pre-release', () => {
    expect(pickTargetTag('v4.1.0', TAGS, 'breaking')).toBe('v5.0.0');
    expect(pickTargetTag('v4.1', TAGS, 'breaking')).toBeNull();
  });

  it('compares numerically, not as strings', () => {
    expect(pickTargetTag('v9', ['v9', 'v10'], 'breaking')).toBe('v10');
  });

  it('returns null for a ref that is not a version', () => {
    expect(pickTargetTag('main', TAGS, 'breaking')).toBeNull();
  });
});
