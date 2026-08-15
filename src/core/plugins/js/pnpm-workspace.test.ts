import { describe, expect, it } from 'vitest';
import { resolvePnpmLockContext } from './pnpm-workspace.js';

describe('resolvePnpmLockContext', () => {
  it('resolves a standalone project against its own lockfile', () => {
    const repoFiles = ['app/package.json', 'app/pnpm-lock.yaml'];
    expect(resolvePnpmLockContext(repoFiles, 'app/package.json')).toEqual({
      lockfileDir: 'app',
      importerKey: '.',
    });
  });

  it('resolves the workspace root itself against its own lockfile', () => {
    const repoFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];
    expect(resolvePnpmLockContext(repoFiles, 'package.json')).toEqual({
      lockfileDir: '.',
      importerKey: '.',
    });
  });

  it('resolves a workspace member with no lockfile of its own against the workspace root', () => {
    const repoFiles = ['pnpm-workspace.yaml', 'pnpm-lock.yaml', 'packages/foo/package.json'];
    expect(resolvePnpmLockContext(repoFiles, 'packages/foo/package.json')).toEqual({
      lockfileDir: '.',
      importerKey: 'packages/foo',
    });
  });

  it('walks up through nested subpackage directories to find the workspace root', () => {
    const repoFiles = [
      'workspace/pnpm-workspace.yaml',
      'workspace/pnpm-lock.yaml',
      'workspace/packages/foo/bar/package.json',
    ];
    expect(resolvePnpmLockContext(repoFiles, 'workspace/packages/foo/bar/package.json')).toEqual({
      lockfileDir: 'workspace',
      importerKey: 'packages/foo/bar',
    });
  });

  it('returns null when there is no lockfile and no ancestor workspace', () => {
    expect(resolvePnpmLockContext(['app/package.json'], 'app/package.json')).toBeNull();
  });

  it('returns null when an ancestor declares a workspace but has no lockfile yet', () => {
    const repoFiles = ['pnpm-workspace.yaml', 'packages/foo/package.json'];
    expect(resolvePnpmLockContext(repoFiles, 'packages/foo/package.json')).toBeNull();
  });
});
