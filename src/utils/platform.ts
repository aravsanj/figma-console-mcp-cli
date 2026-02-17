import os from 'node:os';
import path from 'node:path';

export type Platform = 'macos' | 'windows' | 'linux';

export function getPlatform(): Platform {
  switch (os.platform()) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'linux';
  }
}

export function getHomedir(): string {
  return os.homedir();
}

export function resolveConfigPath(...segments: string[]): string {
  return path.join(getHomedir(), ...segments);
}

export function getAppDataPath(): string {
  const platform = getPlatform();
  if (platform === 'windows') {
    return process.env.APPDATA || path.join(getHomedir(), 'AppData', 'Roaming');
  }
  if (platform === 'macos') {
    return path.join(getHomedir(), 'Library', 'Application Support');
  }
  return path.join(getHomedir(), '.config');
}

export function getLocalAppDataPath(): string {
  return (
    process.env.LOCALAPPDATA || path.join(getHomedir(), 'AppData', 'Local')
  );
}

export function expandPath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return path.join(getHomedir(), inputPath.slice(1));
  }
  return inputPath;
}
