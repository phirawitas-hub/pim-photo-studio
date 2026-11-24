import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const [directory, release] = process.argv.slice(2);
if (!directory || !/^[a-f0-9]{40}$/.test(release)) throw Error('Expected a build directory and commit SHA');

for (const name of await readdir(directory)) {
  if (!/\.(html|mjs|js)$/.test(name)) continue;
  const file = join(directory, name);
  const source = await readFile(file, 'utf8');
  // Use the same release for static imports, dynamic imports and worker URLs.
  const stamped = source.replace(/(["'])(\.\/[\w./-]+\.(?:m?js|css))(?:\?v=[\w-]+)?\1/g,
    (_, quote, asset) => quote + asset + '?v=' + release + quote);
  await writeFile(file, stamped);
}
await writeFile(join(directory, 'release.json'), JSON.stringify({release}) + '\n');
