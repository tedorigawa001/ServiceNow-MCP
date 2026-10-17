/** Offline-only. The input file must already have been obtained through an authorized path. */
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { reviewUpdateSetPayload } from '../src/review/payload-review.js';

try {
  const [mode, path, ...extra] = process.argv.slice(2);
  if (mode !== '--review' || !path || extra.length) throw new Error('usage');
  const maxBytes = 3 * 1024 * 1024;
  const fd = openSync(path, 'r');
  let raw: string;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('input_limit');
    const bytes = Buffer.alloc(maxBytes + 1);
    let length = 0, read = 0;
    do {
      read = readSync(fd, bytes, length, bytes.length - length, null);
      length += read;
    } while (read > 0 && length < bytes.length);
    if (length > maxBytes) throw new Error('input_limit');
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
  } finally { closeSync(fd); }
  const output = reviewUpdateSetPayload(JSON.parse(raw));
  console.log(JSON.stringify(output, null, 2));
  if (output.status === 'rejected') process.exitCode = 1;
} catch {
  // Parser/file errors may contain code, paths or credentials: never echo them.
  console.error('BP-3 input rejected. Usage: --review <local JSON file>; regular UTF-8 JSON file, maximum 3 MiB.');
  process.exitCode = 1;
}
