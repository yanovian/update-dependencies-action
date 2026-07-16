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
});
