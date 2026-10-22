import {readFile,writeFile} from 'node:fs/promises';
const base='https://phirawitas-hub.github.io/pim-photo-studio/';
const root=new URL('../',import.meta.url);
const html=(await readFile(new URL('index.html',root),'utf8')).replaceAll('href="./','href="'+base).replaceAll('src="./','src="'+base);
await writeFile(new URL('apps-script/Index.html',root),html);
