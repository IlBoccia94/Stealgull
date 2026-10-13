import Phaser from 'phaser';

export type SoundEffect = 'grab' | 'combo' | 'hit' | 'throw' | 'finish';
export type GameSnapshot = {
  score: number; timeLeft: number; lives: number; chaos: number; multiplier: number;
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
type Food = {
  sprite: Phaser.GameObjects.Image;
  kind: FoodKind;
  score: number;
  seed: number;
  homeY: number;
};
type Projectile = {
  sprite: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  ttl: number;
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
  private lifeguard!: Phaser.GameObjects.Image;
  private lifeguardWarning!: Phaser.GameObjects.Text;
  private foamLines: Phaser.GameObjects.Rectangle[] = [];
  private tourists: Phaser.GameObjects.Image[] = [];
  private foods: Food[] = [];
  private projectiles: Projectile[] = [];
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

  constructor(hooks: Hooks) {
    super({ key: 'StealgullScene' });
    this.hooks = hooks;
  }

  preload(): void {
    const files = [
      'gull-fly', 'gull-flap', 'gull-dive', 'gull-hit',
      'tourist-0', 'tourist-1', 'tourist-2', 'lifeguard',
      'food-fries', 'food-gelato', 'food-focaccia', 'food-pizza', 'bg-beach'
    ] as const;
    for (const file of files) {
      this.load.svg(file, import.meta.env.BASE_URL + 'art/' + file + '.svg');
    }
  }

  create(): void {
    this.makeBeach();
    this.makeTourists();
    this.shadow = this.add.ellipse(225, 677, 95, 20, 0x24453e, .2).setDepth(4);
    this.lifeguard = this.add.image(225, 570, 'lifeguard').setScale(.7).setDepth(8).setVisible(false);
    this.lifeguardWarning = this.add.text(225, 501, '⚠ BAGNINO!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffffff',
      fontStyle: '900', backgroundColor: '#d94b40', padding: { x: 7, y: 5 }
    }).setOrigin(.5).setDepth(10).setVisible(false);
    this.gull = this.add.image(225, FLIGHT_Y, 'gull-fly').setScale(.78).setDepth(15);
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

  startRun(bestAtStart: number): void {
    if (!this.gull) return;
    this.runSerial += 1;
    this.foods.forEach(item => item.sprite.destroy());
    this.foods = [];
    this.projectiles.forEach(item => item.sprite.destroy());
    this.projectiles = [];
    this.score = 0;
    this.bestAtStart = bestAtStart;
    this.lives = 3;
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
    this.lifeguard.setVisible(false);
    this.lifeguardWarning.setVisible(false);
    this.gull.setPosition(225, FLIGHT_Y).setTexture('gull-fly').clearTint().setAlpha(1);
    this.gull.setAngle(0).setScale(.78);
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
    this.lifeguard.setVisible(false);
    this.lifeguardWarning.setVisible(false);
    this.foods.forEach(item => item.sprite.destroy());
    this.foods = [];
    this.projectiles.forEach(item => item.sprite.destroy());
    this.projectiles = [];
    this.gull.setPosition(225, FLIGHT_Y).clearTint().setTexture('gull-fly').setAlpha(1).setAngle(0);
  }

  update(_: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, .04);
    for (let i = 0; i < this.foamLines.length; i += 1) {
      const line = this.foamLines[i];
      line.setAlpha(.12 + .05 * Math.sin(this.time.now / 620 + i * 1.9));
    }
    if (this.state === 'home' || this.state === 'over') {
      this.gull.y = FLIGHT_Y + Math.sin(this.time.now / 320) * 5;
      this.gull.setTexture('gull-fly');
      return;
    }
    if (this.state !== 'playing') return;

    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.uiClock += dt;
    this.comboWindow -= dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.chaos = Math.max(0, this.chaos - dt * 1.25);
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
    this.gull.setScale(this.invulnerable > 0 ? .76 : .78);
    if (this.invulnerable > 0) {
      this.gull.setAlpha(Math.floor(this.elapsed * 15) % 2 === 0 ? .55 : 1);
    } else {
      this.gull.setAlpha(1).clearTint();
    }
    const shadowSize = 1.15 - (DIVE_LIMIT - this.gull.y) / 900;
    this.shadow.setPosition(this.gull.x, 677).setScale(Math.max(.55, shadowSize));
    if (this.carried.visible) this.carried.setPosition(this.gull.x + 44, this.gull.y + 22);

    for (const food of this.foods) {
      food.sprite.y = food.homeY + Math.sin(this.elapsed * 3 + food.seed) * 3;
      if (this.hold && !this.didGrab &&
        Math.abs(this.gull.x - food.sprite.x) < 39 &&
        Math.abs(this.gull.y - food.sprite.y) < 42) {
        this.steal(food);
        break;
      }
    }
    this.updateProjectiles(dt);
    this.updateLifeguard();
    this.throwClock -= dt;
    if (this.chaos > 10 && this.throwClock <= 0) {
      this.launchProjectile();
      this.throwClock = Math.max(1.45, 5 - this.chaos * .035) + Math.random() * .55;
    }
    if (this.uiClock >= .09) { this.uiClock = 0; this.report(); }
  }

  private steal(food: Food): void {
    this.didGrab = true;
    this.chain = this.comboWindow > 0 ? this.chain + 1 : 1;
    this.comboWindow = 6;
    const multiplier = this.multiplier();
    const points = food.score * multiplier;
    this.score += points;
    this.chaos = Math.min(100, this.chaos + 10 + multiplier * 1.6);
    this.carriedKind = food.kind;
    this.carried.setTexture('food-' + food.kind).setVisible(true);
    this.carried.setPosition(this.gull.x + 43, this.gull.y + 16);
    this.popNumber(food.sprite.x, food.sprite.y - 35, '+' + points, 0xffec9d);
    this.crumbs(food.sprite.x, food.sprite.y, 0xffe5a3, 9);
    this.angryTourist(food.sprite.x);
    this.hooks.onSound(this.chain > 1 ? 'combo' : 'grab');
    if (this.chain === 2) this.hooks.onToast('LADRO SERIALE!');
    if (this.chain === 4) this.hooks.onToast('FUORILEGGE DEL MARE!');
    if (this.chain === 7) this.hooks.onToast('RE DELLA FOCACCIA!');
    if (this.score > this.bestAtStart && this.bestAtStart > 0 &&
      this.score - points <= this.bestAtStart) this.hooks.onToast('NUOVO RECORD!');
    const index = this.foods.indexOf(food);
    if (index >= 0) this.foods.splice(index, 1);
    food.sprite.destroy();
    const serial = this.runSerial;
    this.time.delayedCall(650 + between(0, 520), () => {
      if (serial === this.runSerial && this.state === 'playing') this.spawnFood();
    });
    this.report();
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
      if (this.invulnerable <= 0 &&
        Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, this.gull.x, this.gull.y) < 32) {
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
        this.damage();
        continue;
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
    if (this.chaos < 46) {
      this.lifeguard.setVisible(false);
      this.lifeguardWarning.setVisible(false);
      return;
    }
    if (!this.lifeguardAlertShown) {
      this.lifeguardAlertShown = true;
      this.hooks.onToast('⚠ ARRIVA IL BAGNINO!');
    }
    this.lifeguard.setVisible(true);
    this.lifeguard.x = 225 + Math.sin(this.elapsed * 1.34) * 169;
    this.lifeguard.y = 570 + Math.sin(this.elapsed * 2.2) * 4;
    this.lifeguardWarning.setPosition(this.lifeguard.x, 493).setVisible(true);
    if (this.invulnerable <= 0 &&
      Math.abs(this.gull.x - this.lifeguard.x) < 33 &&
      Math.abs(this.gull.y - this.lifeguard.y) < 54) {
      this.damage();
    }
  }

  private damage(): void {
    if (this.invulnerable > 0 || this.state !== 'playing') return;
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
      multiplier: this.multiplier()
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

  private makeBeach(): void {
    this.add.image(WIDTH / 2, HEIGHT / 2, 'bg-beach').setDisplaySize(WIDTH, HEIGHT).setDepth(0);
    // Subtle breathing sea foam complements the static hand-drawn scenery.
    for (let i = 0; i < 5; i += 1) {
      this.foamLines.push(
        this.add.rectangle(WIDTH / 2, 343 + i * 28, WIDTH - 28, 2, 0xffffff, .13).setDepth(1)
      );
    }
  }

  private makeTourists(): void {
    const placements: Array<[number, number, string, number]> = [
      [56, 750, 'tourist-0', .78],
      [161, 766, 'tourist-1', .72],
      [288, 766, 'tourist-2', .74],
      [407, 749, 'tourist-1', .73]
    ];
    for (const [x, y, texture, size] of placements) {
      const tourist = this.add.image(x, y, texture)
        .setOrigin(.5, 1).setScale(size).setDepth(8);
      this.tourists.push(tourist);
    }
  }
}
