import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';

const folder = new URL('../public/icons/', import.meta.url);
await mkdir(folder, { recursive: true });
const svg = await readFile(new URL('icon.svg', folder));
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['maskable-512.png', 512],
  ['apple-touch-icon.png', 180]
]) {
  await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toFile(new URL(name, folder).pathname);
  console.log('Generated ' + name);
}
