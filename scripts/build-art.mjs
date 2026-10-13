import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const src = (file) => fileURLToPath(new URL('../public/art/' + file, import.meta.url));
const outputDir = fileURLToPath(new URL('../public/art/v4/', import.meta.url));
await mkdir(outputDir, { recursive: true });
const frames = {"npc":{"guard-idle":[32,6,72,128],"guard-whistle":[162,6,84,128],"guard-run-right":[278,10,124,119],"guard-run-left":[414,6,124,127],"guard-point":[6,146,123,128],"guard-grab":[142,163,124,94],"woman-idle":[278,154,124,112],"woman-shout":[422,146,107,128],"man-idle":[6,297,124,105],"man-shout":[142,288,124,123],"elder-idle":[300,286,80,128],"elder-shout":[420,286,111,128],"woman-attack":[17,426,102,128],"man-attack":[146,426,115,128],"elder-attack":[278,442,124,95],"guard-attack":[414,451,124,78]},"hud":{"score":[0,0,176,90],"timer":[180,0,176,90],"lives":[360,0,176,90],"chaos":[0,100,354,72],"combo":[360,96,180,145],"pause":[0,185,66,66],"mute":[70,185,66,66],"trophy":[140,184,184,105],"warning":[0,255,134,52],"panel":[330,251,206,57]}};

for (const [name, [left, top, width, height]] of Object.entries(frames.npc)) {
  await sharp(src('npc-atlas.webp')).extract({ left, top, width, height })
    .webp({ quality:84, effort:4 }).toFile(outputDir + name + '.webp');
}
console.log('M4 illustrated NPC sprites generated: ' + Object.keys(frames.npc).length + ' assets');
