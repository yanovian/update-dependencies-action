import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function writeTempFile(
  dirPrefix: string,
  filename: string,
  contents: string,
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), dirPrefix));
  const filePath = path.join(dir, filename);
  await writeFile(filePath, contents, 'utf8');
  return filePath;
}
