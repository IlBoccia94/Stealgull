import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { StealgullScene, type GameSnapshot, type EndResult, type SoundEffect } from './game/StealgullScene';
import './style.css';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing UI element: ' + id);
  return el as T;
};
const startScreen = $('startOverlay');
const pauseScreen = $('pauseOverlay');
const overScreen = $('overOverlay');
const hud = $('hud');
const controls = $('topControls');
const tips = $('tipBanner');
const toastNode = $('toast');
const muteButton = $<HTMLButtonElement>('muteBtn');

function readStorage(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeStorage(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private browsing */ }
}
let best = Number(readStorage('stealgull-best-v1', '0')) || 0;
let muted = readStorage('stealgull-muted-v1', 'false') === 'true';
let toastTimer = 0;
let tipsTimer = 0;
let audio: AudioContext | null = null;
$('bestStart').textContent = best.toLocaleString('it-IT');

function setScreen(screen: 'start' | 'pause' | 'over' | 'none'): void {
  startScreen.classList.toggle('hidden', screen !== 'start');
  pauseScreen.classList.toggle('hidden', screen !== 'pause');
  overScreen.classList.toggle('hidden', screen !== 'over');
  hud.classList.toggle('hidden', screen === 'start');
  controls.classList.toggle('hidden', screen === 'start');
  tips.classList.add('hidden');
}
function toast(message: string): void {
  toastNode.textContent = message;
  toastNode.classList.remove('show');
  void toastNode.offsetWidth;
  toastNode.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastNode.classList.remove('show'), 1050);
}
function updateMute(): void {
  muteButton.textContent = muted ? '♪̸' : '♫';
  muteButton.setAttribute('aria-label', muted ? 'Attiva audio' : 'Disattiva audio');
}
function initAudio(): void {
  if (muted) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch { audio = null; }
}
function tone(freq: number, endFreq: number, duration: number, when: number, volume = 0.06, wave: OscillatorType = 'sine'): void {
  if (!audio || muted) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(freq, when);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, endFreq), when + duration);
  gain.gain.setValueAtTime(volume, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(when);
  oscillator.stop(when + duration + .01);
}
function sound(effect: SoundEffect): void {
  if (!audio || muted) return;
  const now = audio.currentTime;
  if (effect === 'grab') { tone(500, 920, .13, now); tone(760, 1320, .15, now + .09, .04); }
  if (effect === 'combo') { tone(670, 880, .12, now); tone(920, 1240, .16, now + .11); }
  if (effect === 'hit') { tone(280, 85, .34, now, .11, 'sawtooth'); }
  if (effect === 'throw') { tone(180, 350, .16, now, .018, 'triangle'); }
  if (effect === 'finish') { tone(380, 160, .3, now, .07, 'triangle'); }
}
function vibrate(ms: number): void {
  if ('vibrate' in navigator) navigator.vibrate(ms);
}
const hooks = {
  onUpdate: (state: GameSnapshot) => {
    $('score').textContent = state.score.toLocaleString('it-IT');
    $('timer').textContent = Math.floor(state.timeLeft / 60) + ':' + String(Math.ceil(state.timeLeft % 60)).padStart(2, '0');
    $('lives').textContent = '♥ '.repeat(Math.max(0, state.lives)).trimEnd();
    $('lives').setAttribute('aria-label', state.lives + ' vite rimaste');
    $('chaosFill').style.width = state.chaos + '%';
    $('chaosValue').textContent = Math.round(state.chaos) + '%';
    $('combo').textContent = 'COMBO ×' + state.multiplier;
  },
  onEnd: (result: EndResult) => {
    best = Math.max(best, result.score);
    writeStorage('stealgull-best-v1', String(best));
    $('finalScore').textContent = result.score.toLocaleString('it-IT');
    $('finalBest').textContent = best.toLocaleString('it-IT');
    $('overEyebrow').textContent = result.newRecord ? '🏆 NUOVO RECORD!' : 'FINE DEL COLPO';
    $('overTitle').textContent = result.reason === 'time' ? 'FUGA RIUSCITA!' : 'BECCATO!';
    $('finalMessage').textContent = result.reason === 'time'
      ? 'Hai seminato il panico sulla riviera!'
      : 'Ti hanno preso con il becco nella focaccia.';
    setScreen('over');
  },
  onToast: toast,
  onSound: sound,
  onHit: () => vibrate(75)
};
const scene = new StealgullScene(hooks);
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 450,
  height: 800,
  backgroundColor: '#4fbccc',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 450, height: 800 },
  render: { pixelArt: false, antialias: true, transparent: false },
  scene: [scene],
  fps: { target: 60 }
});
function play(): void {
  initAudio();
  scene.startRun(best);
  setScreen('none');
  tips.classList.remove('hidden');
  clearTimeout(tipsTimer);
  tipsTimer = window.setTimeout(() => tips.classList.add('hidden'), 5200);
}
$('playBtn').addEventListener('click', play);
$('restartBtn').addEventListener('click', play);
$('pauseBtn').addEventListener('click', () => {
  scene.pauseRun();
  if (scene.isPaused()) setScreen('pause');
});
$('resumeBtn').addEventListener('click', () => {
  scene.resumeRun();
  setScreen('none');
});
function goHome(): void {
  scene.returnHome();
  $('bestStart').textContent = best.toLocaleString('it-IT');
  setScreen('start');
}
$('quitBtn').addEventListener('click', goHome);
$('menuBtn').addEventListener('click', goHome);
muteButton.addEventListener('click', () => {
  muted = !muted;
  writeStorage('stealgull-muted-v1', String(muted));
  updateMute();
  if (!muted) { initAudio(); sound('grab'); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && scene.isPlaying()) { scene.pauseRun(); setScreen('pause'); }
});
updateMute();
registerSW({ immediate: true, onNeedRefresh: () => toast('Nuova versione disponibile al prossimo avvio!') });
