# 🐦 STEALGULL
**Il gabbiano più ricercato della riviera.** Un arcade 2D per smartphone: tuffati, ruba il cibo ai turisti e sopravvivi al caos.

## Gioca
Dopo la prima pubblicazione: **https://ilboccia94.github.io/Stealgull/**

## Comandi
- **Tieni premuto** sullo schermo (o clic del mouse): picchiata.
- **Trascina** lateralmente per puntare al cibo.
- **Rilascia** per tornare in alto.
- Ruba prima dello scadere dei **75 secondi**, conserva le tue **3 vite**, fai combo e supera il record.
- Il livello di caos aumenta: turisti infuriati, oggetti lanciati e bagnino.

## Tecnologie
Phaser 3 + TypeScript + Vite; Vite PWA/Workbox; build & deploy su GitHub Pages. Nessun server, nessun account e nessuna risorsa esterna necessaria.

## Sviluppo locale
```sh
npm install
npm run dev
```
Build: `npm run build`; anteprima: `npm run preview`. Requisito Node.js 20+.

## Pubblicazione
1. Vai su **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Ogni push su `main` esegue `.github/workflows/deploy.yml` e pubblica la cartella `dist`.
3. Le icone PNG (192, 512, maskable e apple-touch) sono generate dal sorgente SVG in `public/icons/icon.svg` in fase di build.
4. Apri il gioco su Chrome Android o Safari iOS e scegli **Aggiungi alla schermata Home** per installarlo. Dopo il primo caricamento completo la PWA funziona anche offline.

## Note tecniche
Il path base Vite è `/Stealgull/` e corrisponde al nome esatto del repository. Record e mute sono salvati in `localStorage`; le partite non vengono tracciate né inviate a server. Le grafiche sono vettoriali originali/procedurali, create appositamente per Stealgull.

## M4 Art Pass v2
La nuova direzione artistica usa 13 asset SVG originali in `public/art/`: animazioni del gabbiano (volo, battito, picchiata, stordimento), alimenti, turisti, bagnino e fondale mediterraneo. Tutti vengono caricati dal motore Phaser e precacheati dalla PWA. L'HUD è stato rifinito in stile arcade/cartoon. Il gameplay e i salvataggi rimangono compatibili con la v1.

**MVP / primo playtest**. Bilanciamento e grafica saranno rifiniti dopo i test su dispositivo reale.

### M4.1 — Sprite illustrati autentici
Quattro pose originali del gabbiano (volo, battito d'ali, picchiata, danno) sono ritagliate dal concept illustrato e integrate come texture WebP trasparenti in `public/art/gull-*-illustrated.webp`. Rispetto alla v2 il gabbiano è stato ridimensionato da circa 200 px a circa 110 px su canvas 450 px, lasciando invariati i controlli touch e la logica del gioco. Gli SVG precedenti rimangono come sorgenti di fallback estetico ma non sono caricati per il protagonista.

Il mockup artistico originale è visibile come poster illustrato nella schermata iniziale (`public/art/illustrated-splash.webp`); non viene utilizzato direttamente come livello giocabile perché contiene personaggi e HUD già disegnati, che interferirebbero con gli elementi dinamici.

## M4 v4 — Art Pass illustrato integrato
La spiaggia ora è l'illustrazione originale `public/art/beach-illustrated.webp`.
I personaggi usano sprite estratti dagli atlanti illustrati (`public/art/npc-atlas.webp`):
bagnino in più pose; turista, turista uomo e turista anziano con reazioni visive ai furti.
Il HUD carica pannelli illustrati per punti, tempo, vite, barra caos e bottoni.
Gli atlanti sono sorgenti compatti: `scripts/build-art.mjs` genera automaticamente i singoli WebP
in `public/art/v4/` durante `npm run dev` e `npm run build`.
Tutti gli elementi rimangono ospitati localmente dal sito, senza dipendenze runtime esterne.
