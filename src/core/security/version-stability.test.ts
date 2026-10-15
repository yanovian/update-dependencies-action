import { describe, expect, it } from 'vitest';
import type { EcosystemId } from '../types/ecosystem-plugin.js';
import { findUnstableMarker, isUnstableVersion, unstableVersionsOf } from './version-stability.js';

describe('findUnstableMarker', () => {
  it.each<[EcosystemId, string, string]>([
    // Shared word list, any ecosystem, any case.
    ['npm', '2.0.0-beta.1', 'beta'],
    ['npm', '2.0.0-BETA', 'beta'],
    ['npm', '19.0.0-canary-abc', 'canary'],
    ['npm', '15.0.0-next.4', 'next'],
    ['npm', '1.0.0-nightly.20260101', 'nightly'],
    ['nuget', '8.0.0-preview.7.23375.6', 'preview'],
    ['cargo', '1.0.0-alpha.2', 'alpha'],
    ['maven', '5.0.0-RC2', 'rc'],
    ['maven', '1.0.0-SNAPSHOT', 'snapshot'],
    ['composer', 'dev-main', 'dev'],
    ['composer', '2.0.x-dev', 'dev'],
    ['go', 'v2.0.0-rc.1', 'rc'],
    // Each ecosystem's own pre-release rule, for tags with none of the words.
    ['npm', '1.0.0-0', '0'],
    ['nuget', '6.0.0-ci.5', 'ci.5'],
    ['go', 'v1.5.0-20.x', '20.x'],
    ['pip', '1.0a1', 'a'],
    ['pip', '1.0b2', 'b'],
    ['pip', '1.0c1', 'c'],
    ['pip', '1.0.dev3', 'dev'],
    ['rubygems', '1.0.0.a', 'a'],
    ['maven', '6.0.0-M1', 'M1'],
    ['gradle', '1.0-a1', 'a1'],
    ['maven', '5.4.0.CR1', 'CR1'],
    ['maven', '21-ea', 'ea'],
    ['composer', '1.0.0-b2', 'b2'],
  ])('%s: flags %s as unstable (%s)', (ecosystem, version, marker) => {
    expect(findUnstableMarker(ecosystem, version)).toBe(marker);
  });

  it.each<[EcosystemId, string]>([
    ['npm', '1.2.3'],
    ['npm', '1.2.3+build.5'],
    ['cargo', '1.0.0+wasi-0.2.4'],
    ['go', 'v1.2.3'],
    ['go', 'v0.0.0-20240101120000-abcdef123456'],
    ['go', 'v1.2.4-0.20240101120000-abcdef123456'],
    ['pip', '1.0.post1'],
    ['pip', '2024.1'],
    ['maven', '33.0.0-jre'],
    ['maven', '33.0.0-android'],
    ['maven', '2.0.0.Final'],
    ['maven', '5.3.0.RELEASE'],
    ['maven', '1.0.0-express'],
    ['maven', '1.2.3.SP1'],
    ['composer', '1.0.0-p1'],
    ['rubygems', '7.1.3'],
  ])('%s: treats %s as stable', (ecosystem, version) => {
    expect(isUnstableVersion(ecosystem, version)).toBe(false);
  });
});

describe('unstableVersionsOf', () => {
  it('keeps only the unstable versions', () => {
    expect(unstableVersionsOf('npm', ['1.0.0', '1.1.0-beta', '1.1.0'])).toEqual(
      new Set(['1.1.0-beta']),
    );
  });
});
