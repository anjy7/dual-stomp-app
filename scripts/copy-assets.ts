import { copyFile, cp } from 'node:fs/promises';
// Run the compiled script; all destinations are relative to dist/.
for (const name of ['index.html', 'style.css']) {
 await copyFile(new URL('../../public/' + name, import.meta.url), new URL('../public/' + name, import.meta.url));
}
await cp(new URL('../../test/fixtures/', import.meta.url), new URL('../test/fixtures/', import.meta.url), { recursive: true });
