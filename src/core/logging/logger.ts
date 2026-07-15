import * as core from '@actions/core';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  group<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

export function createActionsLogger(): Logger {
  return {
    info: (message: string) => core.info(message),
    warn: (message: string) => core.warning(message),
    error: (message: string) => core.error(message),
    group: <T>(name: string, fn: () => Promise<T>) => core.group(name, fn),
  };
}
