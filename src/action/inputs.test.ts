import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getInputMock, getBooleanInputMock } = vi.hoisted(() => ({
  getInputMock: vi.fn(),
  getBooleanInputMock: vi.fn(),
}));

vi.mock('@actions/core', () => ({
  getInput: getInputMock,
  getBooleanInput: getBooleanInputMock,
}));

const { readActionInputs } = await import('./inputs.js');

beforeEach(() => {
  getInputMock.mockReset().mockReturnValue('');
  getBooleanInputMock.mockReset().mockReturnValue(true);
});

describe('readActionInputs', () => {
  it('defaults branchName to chore/update-deps/<update-strategy> when branch-name is not set', () => {
    getInputMock.mockImplementation((name: string) =>
      name === 'update-strategy' ? 'breaking' : '',
    );
    expect(readActionInputs().branchName).toBe('chore/update-deps/breaking');
  });

  it('uses branch-name as-is when it is set', () => {
    getInputMock.mockImplementation((name: string) =>
      name === 'branch-name' ? 'custom-prefix' : '',
    );
    expect(readActionInputs().branchName).toBe('custom-prefix');
  });

  it('defaults min-release-age-days to 3', () => {
    expect(readActionInputs().minReleaseAgeDays).toBe(3);
  });

  it('parses min-release-age-days when set, including 0 to disable it', () => {
    getInputMock.mockImplementation((name: string) => (name === 'min-release-age-days' ? '0' : ''));
    expect(readActionInputs().minReleaseAgeDays).toBe(0);
  });

  it('rejects a negative min-release-age-days', () => {
    getInputMock.mockImplementation((name: string) =>
      name === 'min-release-age-days' ? '-1' : '',
    );
    expect(() => readActionInputs()).toThrow('min-release-age-days');
  });

  it('rejects a non-numeric min-release-age-days', () => {
    getInputMock.mockImplementation((name: string) =>
      name === 'min-release-age-days' ? 'soon' : '',
    );
    expect(() => readActionInputs()).toThrow('min-release-age-days');
  });
});
