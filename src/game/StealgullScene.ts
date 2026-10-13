import Phaser from 'phaser';

export type SoundEffect = 'grab' | 'combo' | 'hit' | 'throw' | 'finish' | 'poop' | 'splat';
export type GameSnapshot = {
  score: number; timeLeft: number; lives: number; chaos: number; multiplier: number; shieldTimeLeft: number; poopCooldown: number;
};
export type EndResult = {
  score: number; reason: 'time' | 'caught'; newRecord: boolean;
};
type Hooks = {
  onUpdate: (snapshot: GameSnapshot) => void;
  onEnd: (result: EndResult) => void;
  onToast: (message: string) => void;
  onSound: (effect: SoundEffect) => void;
  onHit: () => void;
};
type FoodKind = 'fries' | 'gelato' | 'focaccia' | 'pizza';
type PickupKind = 'life' | 'shield';
type CollectibleKind = FoodKind | PickupKind;
const SHIELD_DURATION = 6;
const POOP_COOLDOWN = 7;
const LIFEGUARD_STUN_DURATION = 3;
const POOP_GRAVITY = 1050;
const MAX_LIVES = 3;
type Food = {
  sprite: Phaser.GameObjects.Image;
  kind: CollectibleKind;
  score: number;
  seed: number;
  homeY: number;
  expiresAt?: number;
};
type Projectile = {
  sprite: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  ttl: number;
};
type PoopShot = {
  sprite: Phaser.GameObjects.Image;
  vy: number;
  vx: number;
};
const FOODS: { kind: FoodKind; points: number }[] = [
  { kind: 'fries', points: 25 },
  { kind: 'gelato', points: 35 },
  { kind: 'focaccia', points: 45 },
  { kind: 'pizza', points: 55 }
];
const WIDTH = 450;
const HEIGHT = 800;
const FLIGHT_Y = 205;
const DIVE_LIMIT = 669;
const clamp = Phaser.Math.Clamp;
const between = Phaser.Math.Between;

export class StealgullScene extends Phaser.Scene {
  private readonly hooks: Hooks;
  private state: 'home' | 'playing' | 'paused' | 'over' = 'home';
  private gull!: Phaser.GameObjects.Image;
  private carried!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private shieldAura!: Phaser.GameObjects.Arc;
  private lifeguard!: Phaser.GameObjects.Image;
  private lifeguardWarning!: Phaser.GameObjects.Text;
  private tourists: Phaser.GameObjects.Image[] = [];
  private touristReactions = new Map<Phaser.GameObjects.Image, { idle: string; angry: string }>();
  private foods: Food[] = [];
  private projectiles: Projectile[] = [];
  private poopShots: PoopShot[] = [];
  private poopCooldown = 0;
  private lifeguardStunned = 0;
  private score = 0;
  private bestAtStart = 0;
  private lives = 3;
  private timeLeft = 75;
  private chaos = 0;
  private chain = 0;
  private comboWindow = 0;
  private hold = false;
  private didGrab = false;
  private targetX = WIDTH / 2;
  private verticalSpeed = 0;
  private invulnerable = 0;
  private throwClock = 4;
  private elapsed = 0;
  private uiClock = 0;
  private runSerial = 0;
  private lifeguardAlertShown = false;
  private carriedKind: FoodKind | null = null;
  private shieldTimeLeft = 0;
  private nextLifeThreshold = 1000;
  private pendingLifePickups = 0;
  private shieldSpawnCountdown = 16;
  private shieldInterceptionCooldown = 0;

  constructor(hooks: Hooks) {
    super({ key: 'StealgullScene' });
    this.hooks = hooks;
  }

  preload(): void {
    const files = [
      'food-fries', 'food-gelato', 'food-focaccia', 'food-pizza', 'power-life', 'power-shield'
    ] as const;
    for (const file of files) {
      this.load.svg(file, import.meta.env.BASE_URL + 'art/' + file + '.svg');
    }
    this.load.image('bg-beach-v5', import.meta.env.BASE_URL + 'art/beach-clean-v5.webp');
    for (const name of [
      'guard-idle', 'guard-whistle', 'guard-run-right', 'guard-run-left',
      'guard-point', 'guard-grab',
      'woman-idle', 'woman-shout', 'woman-attack',
      'man-idle', 'man-shout', 'man-attack',
      'elder-idle', 'elder-shout', 'elder-attack'
    ]) {
      this.load.image('npc-' + name, import.meta.env.BASE_URL + 'art/v4/' + name + '.webp');
    }
    // The illustrated raster poses are extracted from the approved concept sheet.
    for (const pose of ['fly', 'flap', 'dive', 'hit'] as const) {
      this.load.image('gull-' + pose, import.meta.env.BASE_URL + 'art/gull-' + pose + '-illustrated.webp');
    }
  }

  create(): void {
    this.makeBeach();
    this.makePoopTexture();
    this.makeTourists();
    this.shadow = this.add.ellipse(225, 677, 72, 15, 0x24453e, .2).setDepth(4);
    this.shieldAura = this.add.circle(225, FLIGHT_Y, 47, 0x70ebff, .13)
      .setStrokeStyle(4, 0xa1f9ff, .9).setDepth(14).setVisible(false);
    this.lifeguard = this.add.image(225, 570, 'npc-guard-idle').setScale(.80).setDepth(8).setVisible(false);
    this.lifeguardWarning = this.add.text(225, 501, '⚠ BAGNINO!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffffff',
      fontStyle: '900', backgroundColor: '#d94b40', padding: { x: 7, y: 5 }
    }).setOrigin(.5).setDepth(10).setVisible(false);
    this.gull = this.add.image(225, FLIGHT_Y, 'gull-fly').setScale(.86).setDepth(15);
    this.carried = this.add.image(0, 0, 'food-fries').setScale(.42).setDepth(16).setVisible(false);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.state !== 'playing') return;
      this.hold = true;
      this.didGrab = false;
      this.targetX = clamp(pointer.worldX, 43, WIDTH - 43);
      this.verticalSpeed = 0;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.state === 'playing' && this.hold && pointer.isDown) {
        this.targetX = clamp(pointer.worldX, 43, WIDTH - 43);
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => { this.hold = false; });
    this.input.on(Phaser.Input.Events.GAME_OUT, () => { this.hold = false; });
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.state === 'playing') { this.hold = true; this.didGrab = false; }
    });
    this.input.keyboard?.on('keyup-SPACE', () => { this.hold = false; });
  }

  isPlaying(): boolean { return this.state === 'playing'; }
  isPaused(): boolean { return this.state === 'paused'; }

  // An independent action; the player can drop a bomb without changing flight controls.
  dropPoop(): boolean {
    if (this.state !== 'playing' || this.poopCooldown > 0 || !this.gull.active) return false;
    this.poopCooldown = POOP_COOLDOWN;
    const sprite = this.add.image(this.gull.x, Math.min(HEIGHT - 12, this.gull.y + 25), 'poop-bomb')
      .setDepth(17).setScale(.9);
    this.poopShots.push({ sprite, vx: 0, vy: 45 });
    this.hooks.onSound('poop');
    this.report();
    return true;
  }

  startRun(bestAtStart: number): void {
    if (!this.gull) return;
    this.runSerial += 1;
    this.foods.forEach(item => item.sprite.destroy());
    this.foods = [];
    this.projectiles.forEach(item => item.sprite.destroy());
    this.projectiles = [];
    this.clearPoopShots();
    this.poopCooldown = 0;
    this.lifeguardStunned = 0;
    this.lifeguard.clearTint();
    this.score = 0;
    this.bestAtStart = bestAtStart;
    this.lives = MAX_LIVES;
    this.shieldTimeLeft = 0;
    this.nextLifeThreshold = 1000;
    this.pendingLifePickups = 0;
    this.shieldSpawnCountdown = between(12, 18);
    this.shieldInterceptionCooldown = 0;
    this.shieldAura.setVisible(false);
    this.timeLeft = 75;
    this.chaos = 0;
    this.chain = 0;
    this.comboWindow = 0;
    this.hold = false;
    this.didGrab = false;
    this.carriedKind = null;
    this.carried.setVisible(false);
    this.targetX = WIDTH / 2;
    this.verticalSpeed = 0;
    this.invulnerable = 0;
    this.throwClock = 4;
    this.elapsed = 0;
    this.uiClock = 0;
    this.lifeguardAlertShown = false;
    this.lifeguard.setVisible(false).setTexture('npc-guard-idle');
    this.lifeguardWarning.setVisible(false);
    this.touristReactions.forEach((poses, tourist) => tourist.setTexture(poses.idle));
    this.gull.setPosition(225, FLIGHT_Y).setTexture('gull-fly').clearTint().setAlpha(1);
    this.gull.setAngle(0).setScale(.86);
    this.state = 'playing';
    for (let i = 0; i < 4; i += 1) this.spawnFood();
    this.report();
  }

  pauseRun(): void {
    if (this.state === 'playing') { this.state = 'paused'; this.hold = false; }
  }
  resumeRun(): void {
    if (this.state === 'paused') { this.state = 'playing'; this.hold = false; }
  }
  returnHome(): void {
    this.state = 'home';
    this.hold = false;
    this.carried.setVisible(false);
    this.shieldTimeLeft = 0;
    this.shieldAura.setVisible(false);
    this.lifeguard.setVisible(false);
    this.lifeguardWarning.setVisible(false);
    this.foods.forEach(item => item.sprite.destroy());
    this.foods = [];
    this.projectiles.forEach(item => item.sprite.destroy());
    this.projectiles = [];
    this.clearPoopShots();
    this.poopCooldown = 0;
    this.lifeguardStunned = 0;
    this.lifeguard.clearTint();
    this.gull.setPosition(225, FLIGHT_Y).clearTint().setTexture('gull-fly').setScale(.86).setAlpha(1).setAngle(0);
  }

  update(_: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, .04);
    if (this.state === 'home' || this.state === 'over') {
      this.gull.y = FLIGHT_Y + Math.sin(this.time.now / 320) * 5;
      this.gull.setTexture('gull-fly');
      return;
    }
    if (this.state !== 'playing') return;

    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.poopCooldown = Math.max(0, this.poopCooldown - dt);
    this.lifeguardStunned = Math.max(0, this.lifeguardStunned - dt);
    this.uiClock += dt;
    this.comboWindow -= dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shieldTimeLeft = Math.max(0, this.shieldTimeLeft - dt);
    this.shieldInterceptionCooldown = Math.max(0, this.shieldInterceptionCooldown - dt);
    this.shieldAura.setVisible(this.shieldTimeLeft > 0);
    this.chaos = Math.max(0, this.chaos - dt * 1.25);
    this.shieldSpawnCountdown -= dt;
    if (this.shieldSpawnCountdown <= 0) {
      if (this.shieldTimeLeft <= 0 && !this.foods.some(item => item.kind === 'shield') &&
          this.replaceRandomFood('shield')) {
        this.shieldSpawnCountdown = between(17, 26);
        this.hooks.onToast('🛡️ SCUDO IN SPIAGGIA!');
      } else {
        this.shieldSpawnCountdown = 3;
      }
    }
    if (this.comboWindow <= 0 && this.chain > 0) this.chain = 0;
    if (this.timeLeft <= 0) { this.finish('time'); return; }

    const glide = Math.min(1, dt * (this.hold ? 8.3 : 5.5));
    this.gull.x = Phaser.Math.Linear(this.gull.x, this.targetX, glide);
    if (this.hold) {
      this.verticalSpeed = Math.min(850, this.verticalSpeed + dt * 1850);
      this.gull.y = Math.min(DIVE_LIMIT, this.gull.y + this.verticalSpeed * dt);
    } else {
      this.verticalSpeed = 0;
      this.gull.y = Math.max(FLIGHT_Y, this.gull.y - 740 * dt);
      if (this.gull.y <= FLIGHT_Y + 1 && this.carriedKind) {
        this.carriedKind = null;
        this.carried.setVisible(false);
      }
    }
    const wingFrame = Math.floor(this.elapsed * 9) % 2 === 0 ? 'gull-fly' : 'gull-flap';
    this.gull.setTexture(this.invulnerable > 1.3 ? 'gull-hit' : this.hold ? 'gull-dive' : wingFrame);
    this.gull.setAngle(this.hold ? 14 : (this.gull.y > FLIGHT_Y + 10 ? -11 : -2));
    this.gull.setScale(this.invulnerable > 0 ? .84 : .86);
    if (this.invulnerable > 0) {
      this.gull.setAlpha(Math.floor(this.elapsed * 15) % 2 === 0 ? .55 : 1);
    } else {
      this.gull.setAlpha(1).clearTint();
    }
    this.shieldAura.setPosition(this.gull.x, this.gull.y);
    this.shieldAura.setAlpha(this.shieldTimeLeft < 1.5 && Math.floor(this.elapsed * 8) % 2 === 0 ? .45 : 1);
    this.shieldAura.setScale(1 + Math.sin(this.elapsed * 6) * .04);
    const shadowSize = 1.15 - (DIVE_LIMIT - this.gull.y) / 900;
    this.shadow.setPosition(this.gull.x, 677).setScale(Math.max(.55, shadowSize));
    if (this.carried.visible) this.carried.setPosition(this.gull.x + 29, this.gull.y + 19);

    for (const food of [...this.foods]) {
      if (food.expiresAt !== undefined && this.elapsed >= food.expiresAt) {
        this.removeCollectible(food);
        this.spawnFood();
        continue;
      }
      food.sprite.y = food.homeY + Math.sin(this.elapsed * 3 + food.seed) * 3;
      if (food.kind === 'life' || food.kind === 'shield') {
        food.sprite.setAngle(Math.sin(this.elapsed * 2.4 + food.seed) * 9);
      }
      if (this.hold && !this.didGrab &&
        Math.abs(this.gull.x - food.sprite.x) < 39 &&
        Math.abs(this.gull.y - food.sprite.y) < 42) {
        if (food.kind === 'life' || food.kind === 'shield') this.collectPowerup(food);
        else this.steal(food);
        break;
      }
    }
    this.updateProjectiles(dt);
    this.updateLifeguard();
    this.updatePoopShots(dt);
    this.throwClock -= dt;
    if (this.chaos > 10 && this.throwClock <= 0) {
      this.launchProjectile();
      this.throwClock = Math.max(1.45, 5 - this.chaos * .035) + Math.random() * .55;
    }
    if (this.uiClock >= .09) { this.uiClock = 0; this.report(); }
  }

  private steal(food: Food): void {
    // The collector already routes power-ups elsewhere. This narrowing keeps
    // the inventory strictly limited to edible items.
    if (food.kind === 'life' || food.kind === 'shield') return;
    this.didGrab = true;
    this.chain = this.comboWindow > 0 ? this.chain + 1 : 1;
    this.comboWindow = 6;
    const multiplier = this.multiplier();
    const points = food.score * multiplier;
    this.score += points;
    this.chaos = Math.min(100, this.chaos + 10 + multiplier * 1.6);
    this.carriedKind = food.kind;
    this.carried.setTexture('food-' + food.kind).setVisible(true);
    this.carried.setPosition(this.gull.x + 29, this.gull.y + 19);
    this.popNumber(food.sprite.x, food.sprite.y - 35, '+' + points, 0xffec9d);
    this.crumbs(food.sprite.x, food.sprite.y, 0xffe5a3, 9);
    this.angryTourist(food.sprite.x);
    this.hooks.onSound(this.chain > 1 ? 'combo' : 'grab');
    if (this.chain === 2) this.hooks.onToast('LADRO SERIALE!');
    if (this.chain === 4) this.hooks.onToast('FUORILEGGE DEL MARE!');
    if (this.chain === 7) this.hooks.onToast('RE DELLA FOCACCIA!');
    if (this.score > this.bestAtStart && this.bestAtStart > 0 &&
      this.score - points <= this.bestAtStart) this.hooks.onToast('NUOVO RECORD!');
    this.removeCollectible(food);
    this.scheduleReplacement();
    this.queueLifeRewards();
    this.report();
  }

  private queueLifeRewards(): void {
    while (this.score >= this.nextLifeThreshold) {
      this.pendingLifePickups++;
      this.nextLifeThreshold += 1000;
    }
    if (this.pendingLifePickups > 0 && !this.foods.some(item => item.kind === 'life')) {
      if (this.replaceRandomFood('life')) this.hooks.onToast('❤️ VITA BONUS!');
    }
  }

  private removeCollectible(item: Food): void {
    const i = this.foods.indexOf(item);
    if (i !== -1) this.foods.splice(i, 1);
    item.sprite.destroy();
  }

  private scheduleReplacement(): void {
    const serial = this.runSerial;
    this.time.delayedCall(650 + between(0, 520), () => {
      if (serial === this.runSerial && this.state === 'playing') this.spawnFood();
    });
  }

  private collectPowerup(item: Food): void {
    this.didGrab = true;
    this.removeCollectible(item);
    if (item.kind === 'life') {
      if (this.lives < MAX_LIVES) {
        this.lives++;
        this.hooks.onToast('❤️ +1 VITA!');
        this.popNumber(this.gull.x, this.gull.y - 44, '+1 ♥', 0xff90ae);
      } else {
        this.hooks.onToast('❤️ VITE AL MASSIMO!');
      }
      this.hooks.onSound('combo');
      this.crumbs(this.gull.x, this.gull.y, 0xff768e, 13);
    } else {
      this.shieldTimeLeft = SHIELD_DURATION;
      this.shieldAura.setVisible(true).setPosition(this.gull.x, this.gull.y);
      this.hooks.onToast('🛡️ SCUDO ATTIVO!');
      this.hooks.onSound('combo');
      this.crumbs(this.gull.x, this.gull.y, 0x70f1ff, 13);
    }
    this.scheduleReplacement();
    this.report();
  }

  private replaceRandomFood(kind: PickupKind): boolean {
    if (kind === 'life' && this.pendingLifePickups <= 0) return false;
    if (kind === 'life' && this.foods.some(item => item.kind === 'life')) return false;
    const candidates = this.foods.filter(item => item.kind !== 'life' && item.kind !== 'shield');
    if (!candidates.length) return false;
    const target = candidates[between(0, candidates.length - 1)];
    const x = target.sprite.x;
    const y = target.homeY;
    this.removeCollectible(target);
    this.spawnPickup(kind, x, y);
    return true;
  }

  private spawnPickup(kind: PickupKind, x: number, homeY: number): void {
    const sprite = this.add.image(x, homeY, 'power-' + kind).setDepth(9).setScale(.85);
    this.foods.push({
      sprite, kind, score: 0, seed: Math.random() * 10, homeY,
      expiresAt: kind === 'shield' ? this.elapsed + 9 : undefined
    });
    this.crumbs(x, homeY, kind === 'life' ? 0xff7b93 : 0x76ebff, 8);
    if (kind === 'life') this.pendingLifePickups--;
  }

  private multiplier(): number {
    return Math.min(4, 1 + Math.floor(Math.max(0, this.chain - 1) / 2));
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.ttl -= dt;
      if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, this.gull.x, this.gull.y) < 37) {
        if (this.shieldTimeLeft > 0) {
          p.sprite.destroy();
          this.projectiles.splice(i, 1);
          this.crumbs(this.gull.x, this.gull.y, 0x7eeeff, 6);
          continue;
        }
        if (this.invulnerable <= 0) {
          p.sprite.destroy();
          this.projectiles.splice(i, 1);
          this.damage();
          continue;
        }
      }
      if (p.ttl <= 0 || p.sprite.y < -30 || p.sprite.y > HEIGHT + 25 ||
        p.sprite.x < -30 || p.sprite.x > WIDTH + 30) {
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private launchProjectile(): void {
    if (!this.tourists.length) return;
    const tourist = this.tourists[between(0, this.tourists.length - 1)];
    const startX = tourist.x;
    const startY = tourist.y - 67;
    const aimX = this.gull.x + between(-24, 24);
    const aimY = this.gull.y + between(-12, 12);
    const angle = Math.atan2(aimY - startY, aimX - startX);
    const speed = 265 + this.chaos;
    const sprite = this.add.circle(startX, startY, 11, 0xf5aa55)
      .setStrokeStyle(3, 0x7a482c).setDepth(12);
    this.projectiles.push({ sprite, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ttl: 4 });
    this.popNumber(startX, startY - 28, 'HEY!', 0xff7d5a);
    this.hooks.onSound('throw');
  }

  private updateLifeguard(): void {
    if (this.chaos < 46 && this.lifeguardStunned <= 0) {
      this.lifeguard.clearTint();
      this.lifeguard.setVisible(false);
      this.lifeguardWarning.setVisible(false);
      return;
    }
    if (!this.lifeguardAlertShown) {
      this.lifeguardAlertShown = true;
      this.hooks.onToast('⚠ ARRIVA IL BAGNINO!');
    }
    this.lifeguard.setVisible(true);
    if (this.lifeguardStunned > 0) {
      this.lifeguard.setTexture('npc-guard-whistle').setTint(0x8ee9ed);
      this.lifeguardWarning.setPosition(this.lifeguard.x, 493).setText('💫 STORDITO!').setVisible(true);
      return;
    }
    this.lifeguard.clearTint();
    this.lifeguardWarning.setText('⚠ BAGNINO!');
    this.lifeguard.x = 225 + Math.sin(this.elapsed * 1.34) * 169;
    this.lifeguard.y = 570 + Math.sin(this.elapsed * 2.2) * 4;
    this.lifeguard.setTexture(Math.cos(this.elapsed * 1.34) > 0 ? 'npc-guard-run-right' : 'npc-guard-run-left');
    this.lifeguardWarning.setPosition(this.lifeguard.x, 493).setVisible(true);
    if (Math.abs(this.gull.x - this.lifeguard.x) < 33 &&
        Math.abs(this.gull.y - this.lifeguard.y) < 54) {
      if (this.shieldTimeLeft > 0) {
        if (this.shieldInterceptionCooldown <= 0) {
          this.crumbs(this.gull.x, this.gull.y, 0x7eeeff, 8);
          this.shieldInterceptionCooldown = .8;
        }
      } else if (this.invulnerable <= 0) {
        this.damage();
      }
    }
  }

  private damage(): void {
    if (this.invulnerable > 0 || this.shieldTimeLeft > 0 || this.state !== 'playing') return;
    this.invulnerable = 1.9;
    this.lives -= 1;
    this.chain = 0;
    this.comboWindow = 0;
    this.chaos = Math.min(100, this.chaos + 7);
    this.hold = false;
    this.verticalSpeed = 0;
    this.carriedKind = null;
    this.carried.setVisible(false);
    this.gull.setTint(0xff6464);
    this.cameras.main.shake(130, .007);
    this.crumbs(this.gull.x, this.gull.y, 0xff7782, 12);
    this.popNumber(this.gull.x, this.gull.y - 52, 'OUCH!', 0xff7181);
    this.hooks.onSound('hit');
    this.hooks.onHit();
    this.report();
    if (this.lives <= 0) this.finish('caught');
  }

  private finish(reason: 'time' | 'caught'): void {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.hold = false;
    this.carried.setVisible(false);
    this.shieldTimeLeft = 0;
    this.shieldAura.setVisible(false);
    this.clearPoopShots();
    this.lifeguardWarning.setVisible(false);
    this.hooks.onSound('finish');
    this.hooks.onEnd({
      score: this.score,
      reason,
      newRecord: this.score > this.bestAtStart && this.score > 0
    });
  }

  private report(): void {
    this.hooks.onUpdate({
      score: this.score,
      timeLeft: this.timeLeft,
      lives: this.lives,
      chaos: this.chaos,
      multiplier: this.multiplier(),
      shieldTimeLeft: this.shieldTimeLeft,
      poopCooldown: this.poopCooldown
    });
  }

  private spawnFood(): void {
    if (this.foods.length >= 4) return;
    const occupied = this.foods.map(food => food.sprite.x);
    const slots = [55, 145, 235, 325, 405].filter(x =>
      !occupied.some(there => Math.abs(x - there) < 65));
    const x = slots.length ? slots[between(0, slots.length - 1)] : between(45, 405);
    const choice = FOODS[between(0, FOODS.length - 1)];
    const homeY = between(609, 647);
    if (this.pendingLifePickups > 0 && !this.foods.some(item => item.kind === 'life')) {
      this.spawnPickup('life', x, homeY);
      return;
    }
    const sprite = this.add.image(x, homeY, 'food-' + choice.kind).setDepth(7).setScale(.58);
    this.foods.push({ sprite, kind: choice.kind, score: choice.points, seed: Math.random() * 10, homeY });
    const halo = this.add.circle(x, homeY + 5, 21, 0xffffff, .1).setDepth(5);
    this.tweens.add({
      targets: halo, alpha: 0, scale: 2.5, duration: 650,
      onComplete: () => halo.destroy()
    });
  }

  private angryTourist(x: number): void {
    if (!this.tourists.length) return;
    const nearest = this.tourists.reduce((a, b) =>
      Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b);
    const frames = this.touristReactions.get(nearest);
    if (frames) {
      nearest.setTexture(frames.angry);
      const run = this.runSerial;
      this.time.delayedCall(650, () => {
        if (run === this.runSerial && nearest.active) nearest.setTexture(frames.idle);
      });
    }
    this.popNumber(nearest.x, nearest.y - 95, ['?!', 'EHI!', 'LADRO!'][between(0, 2)], 0xff6d5b);
    this.tweens.add({
      targets: nearest, angle: -7, yoyo: true, repeat: 3, duration: 80,
      onComplete: () => { nearest.setAngle(0); }
    });
  }

  private popNumber(x: number, y: number, value: string, color: number): void {
    const text = this.add.text(x, y, value, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: value.startsWith('+') ? '24px' : '16px',
      fontStyle: '900',
      color: '#' + color.toString(16).padStart(6, '0'),
      stroke: '#16455a', strokeThickness: 5
    }).setOrigin(.5).setDepth(25);
    this.tweens.add({
      targets: text, y: y - 65, alpha: 0, duration: 830, ease: 'Cubic.easeOut',
      onComplete: () => text.destroy()
    });
  }

  private crumbs(x: number, y: number, color: number, amount: number): void {
    for (let i = 0; i < amount; i += 1) {
      const particle = this.add.circle(x, y, between(2, 5), color).setDepth(22);
      this.tweens.add({
        targets: particle, x: x + between(-55, 55), y: y + between(-65, 40),
        alpha: 0, scale: .2, duration: between(260, 620),
        onComplete: () => particle.destroy()
      });
    }
  }



  private makePoopTexture(): void {
    if (this.textures.exists('poop-bomb')) return;
    const g = this.add.graphics();
    // Original compact hand-drawn "poop bomb" with two highlights.
    g.fillStyle(0x38231f).fillEllipse(18, 27, 30, 16);
    g.fillStyle(0x75462b).fillEllipse(18, 24, 25, 15);
    g.fillStyle(0x895233).fillEllipse(18, 17, 18, 15);
    g.fillStyle(0x9e6340).fillEllipse(18, 11, 11, 11);
    g.fillStyle(0xf7d9a0).fillEllipse(13, 12, 4, 3);
    g.fillStyle(0xf7d9a0).fillEllipse(11, 23, 4, 3);
    g.generateTexture('poop-bomb', 36, 36);
    g.destroy();
  }

  private clearPoopShots(): void {
    for (const shot of this.poopShots) shot.sprite.destroy();
    this.poopShots.length = 0;
  }

  private updatePoopShots(dt: number): void {
    for (let i = this.poopShots.length - 1; i >= 0; i -= 1) {
      const shot = this.poopShots[i];
      const beforeY = shot.sprite.y;
      shot.vy += POOP_GRAVITY * dt;
      shot.sprite.y += shot.vy * dt;
      shot.sprite.x += shot.vx * dt;
      shot.sprite.angle += dt * 140;

      // Segment-crossing checks avoid missing a hit at high falling velocity.
      if (this.lifeguard.visible && this.lifeguardStunned <= 0 &&
          Math.abs(shot.sprite.x - this.lifeguard.x) < 32 &&
          beforeY <= this.lifeguard.y - 27 &&
          shot.sprite.y >= this.lifeguard.y - 27) {
        this.lifeguardStunned = LIFEGUARD_STUN_DURATION;
        this.lifeguard.setTexture('npc-guard-whistle').setTint(0x8ee9ed);
        this.chaos = Math.min(100, this.chaos + 12);
        this.hooks.onToast('💩 BAGNINO STORDITO!');
        this.splat(shot.sprite.x, this.lifeguard.y - 26, true);
        this.removePoopShot(i);
        continue;
      }

      let hitTourist: Phaser.GameObjects.Image | null = null;
      for (const tourist of this.tourists) {
        const hitY = tourist.y - 53;
        if (Math.abs(shot.sprite.x - tourist.x) < 29 &&
            beforeY <= hitY && shot.sprite.y >= hitY) {
          hitTourist = tourist;
          break;
        }
      }
      if (hitTourist) {
        const person = hitTourist;
        this.score += 50;
        this.chaos = Math.min(100, this.chaos + 7);
        this.popNumber(person.x, person.y - 103, '+50 💩', 0xffeb97);
        this.angryTourist(person.x);
        this.splat(shot.sprite.x, person.y - 53, true);
        this.removePoopShot(i);
        this.queueLifeRewards(); // Poop points also count toward 1,000-point life rewards.
        this.report();
        continue;
      }

      if (shot.sprite.y >= 712 || shot.sprite.x < -30 || shot.sprite.x > WIDTH + 30) {
        this.splat(clamp(shot.sprite.x, 0, WIDTH), 712, false);
        this.removePoopShot(i);
      }
    }
  }

  private removePoopShot(index: number): void {
    this.poopShots[index].sprite.destroy();
    this.poopShots.splice(index, 1);
  }

  private splat(x: number, y: number, onTarget: boolean): void {
    this.hooks.onSound('splat');
    this.crumbs(x, y, 0x905635, onTarget ? 12 : 7);
    const mark = this.add.ellipse(x, y, onTarget ? 27 : 36, onTarget ? 12 : 9,
      0x6f3d28, .82).setDepth(12);
    this.tweens.add({ targets: mark, alpha: 0, scaleX: 1.5, duration: 1100,
      onComplete: () => mark.destroy() });
    if (!onTarget) this.popNumber(x, y - 22, 'PLOP!', 0xe2d39f);
  }

  private makeBeach(): void {
    this.add.image(WIDTH / 2, HEIGHT / 2, 'bg-beach-v5').setDisplaySize(WIDTH, HEIGHT).setDepth(0);
  }

  private makeTourists(): void {
    const placements: Array<[number, number, string, string, number]> = [
      [53, 738, 'woman-idle', 'woman-shout', .76],
      [160, 755, 'man-idle', 'man-shout', .76],
      [292, 743, 'elder-idle', 'elder-shout', .79],
      [404, 759, 'woman-idle', 'woman-attack', .77]
    ];
    for (const [x, y, idle, angry, scale] of placements) {
      const tourist = this.add.image(x, y, 'npc-' + idle)
        .setOrigin(.5, 1).setScale(scale).setDepth(8);
      this.touristReactions.set(tourist, { idle: 'npc-' + idle, angry: 'npc-' + angry });
      this.tourists.push(tourist);
    }
  }
}
