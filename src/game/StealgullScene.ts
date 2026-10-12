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
  private clouds: Phaser.GameObjects.Ellipse[] = [];
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

  create(): void {
    this.makeTextures();
    this.makeBeach();
    this.makeTourists();
    this.shadow = this.add.ellipse(225, 664, 77, 16, 0x24453e, .2).setDepth(4);
    this.lifeguard = this.add.image(225, 570, 'lifeguard').setScale(.88).setDepth(8).setVisible(false);
    this.lifeguardWarning = this.add.text(225, 501, '⚠ BAGNINO!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffffff',
      fontStyle: '900', backgroundColor: '#d94b40', padding: { x: 7, y: 5 }
    }).setOrigin(.5).setDepth(10).setVisible(false);
    this.gull = this.add.image(225, FLIGHT_Y, 'gull-fly').setDepth(15);
    this.carried = this.add.image(0, 0, 'food-fries').setScale(.48).setDepth(16).setVisible(false);

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
    this.gull.setAngle(0).setScale(1);
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
    for (const cloud of this.clouds) {
      cloud.x += dt * (cloud.scaleX < 1 ? 4 : 7);
      if (cloud.x > WIDTH + 80) cloud.x = -90;
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
    this.gull.setTexture(this.hold ? 'gull-dive' : wingFrame);
    this.gull.setAngle(this.hold ? 14 : (this.gull.y > FLIGHT_Y + 10 ? -11 : -2));
    this.gull.setScale(this.invulnerable > 0 ? 1.02 : 1);
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
    this.add.circle(startX - 3, startY - 3, 3, 0xffe8af).setDepth(13);
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
    const sprite = this.add.image(x, homeY, 'food-' + choice.kind).setDepth(7).setScale(.94);
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
    const g = this.add.graphics().setDepth(0);
    // Warm Mediterranean sky
    g.fillStyle(0x7dd8e3).fillRect(0, 0, WIDTH, 360);
    g.fillStyle(0x9fe3e7).fillRect(0, 250, WIDTH, 92);
    g.fillStyle(0xffd778).fillCircle(364, 123, 54);
    g.fillStyle(0xffebad, .35).fillCircle(364, 123, 76);
    // Distant cove and pale cliffs
    g.fillStyle(0x4b97a3).fillPoints([
      new Phaser.Geom.Point(0, 332), new Phaser.Geom.Point(0, 286),
      new Phaser.Geom.Point(40, 303), new Phaser.Geom.Point(85, 288),
      new Phaser.Geom.Point(144, 334), new Phaser.Geom.Point(225, 329),
      new Phaser.Geom.Point(286, 300), new Phaser.Geom.Point(367, 330),
      new Phaser.Geom.Point(450, 295), new Phaser.Geom.Point(450, 350)
    ], true);
    g.fillStyle(0x267f90).fillRect(0, 337, WIDTH, 238);
    g.fillStyle(0x34a9b7).fillRect(0, 365, WIDTH, 188);
    g.fillStyle(0x4abdc4).fillRect(0, 437, WIDTH, 117);
    g.fillStyle(0x6cd5d0).fillRect(0, 527, WIDTH, 37);
    // Sea foam and rhythmic waves
    for (let row = 0; row < 9; row += 1) {
      g.lineStyle(row > 5 ? 3 : 2, row % 2 ? 0xb5f8e7 : 0xffffff, row > 5 ? .5 : .21);
      for (let i = 0; i < 6; i += 1) {
        const wx = (i * 93 + row * 31) % 485 - 26;
        const wy = 350 + row * 24;
        g.lineBetween(wx, wy, wx + 34 + row * 2, wy);
      }
    }
    // Shoreline and sand
    g.fillStyle(0xf6d584).fillRect(0, 574, WIDTH, 226);
    g.fillStyle(0xffe9ab).fillRect(0, 574, WIDTH, 8);
    g.fillStyle(0xefd07e).fillRect(0, 700, WIDTH, 100);
    g.lineStyle(4, 0xfff5ca, .9);
    for (let x = 0; x < WIDTH; x += 24) {
      g.lineBetween(x, 582 + (x % 40) / 8, x + 16, 584 + (x % 40) / 8);
    }
    // A few shells and sand flecks
    for (let i = 0; i < 43; i += 1) {
      const x = (i * 73 + 28) % WIDTH;
      const y = 666 + ((i * 47) % 134);
      g.fillStyle(i % 3 === 0 ? 0xffefbf : 0xdcb769, .7);
      g.fillEllipse(x, y, i % 3 + 2, 2);
    }
    // Small fishing boat
    g.fillStyle(0xffffff).fillTriangle(74, 361, 89, 313, 89, 361);
    g.fillStyle(0x153f60).fillTriangle(72, 363, 112, 363, 92, 374);
    g.lineStyle(2, 0xffffff).lineBetween(89, 314, 89, 366);
    // Parasols and towels in the back of the beach
    this.parasol(93, 740, 0xed665b, 0xffcb71);
    this.parasol(360, 750, 0x20a8a8, 0xfff0af);
    g.fillStyle(0xffffff, .6).fillRoundedRect(159, 754, 72, 16, 5);
    g.fillStyle(0x69c8bd, .5).fillRoundedRect(163, 757, 63, 8, 3);
    // Clouds sit in front of sky, behind gameplay
    this.addCloud(77, 136, 1);
    this.addCloud(217, 68, .76);
    this.addCloud(455, 203, 1.1);
  }

  private parasol(x: number, y: number, primary: number, secondary: number): void {
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(4, 0x7b7960, .9).lineBetween(x, y - 72, x, y + 35);
    g.fillStyle(0x456b67, .2).fillEllipse(x, y + 36, 120, 23);
    g.fillStyle(primary).fillSlice(x, y - 70, 69, Math.PI, Math.PI * 2, false);
    g.fillStyle(secondary).fillSlice(x, y - 70, 31, Math.PI, Math.PI * 2, false);
    g.lineStyle(3, 0x2b6471, .5).lineBetween(x - 65, y - 70, x + 65, y - 70);
  }

  private addCloud(x: number, y: number, size: number): void {
    const cloud = this.add.ellipse(x, y, 102, 26, 0xffffff, .62).setDepth(1).setScale(size);
    this.clouds.push(cloud);
    this.add.ellipse(x - 23, y - 8, 47, 29, 0xffffff, .22).setDepth(1).setScale(size);
  }

  private makeTourists(): void {
    const xs = [56, 161, 288, 407];
    for (let i = 0; i < xs.length; i += 1) {
      const tourist = this.add.image(xs[i], 725 + (i % 2) * 21, 'tourist-' + (i % 3))
        .setDepth(8).setScale(i % 2 === 0 ? .92 : .82);
      this.tourists.push(tourist);
    }
  }

  private makeTextures(): void {
    const g = this.add.graphics();
    const outline = 0x203e4b;
    for (const pose of ['fly', 'flap', 'dive'] as const) {
      g.clear();
      g.lineStyle(5, outline, 1);
      g.fillStyle(0xdbe9e7);
      g.fillTriangle(31, 57, 6, 37, 17, 76);
      g.fillStyle(0xf9fcf5);
      // Wings first: flapping silhouettes change every other frame.
      if (pose === 'dive') {
        g.fillEllipse(40, 61, 45, 26);
        g.fillTriangle(48, 58, 22, 93, 65, 82);
      } else if (pose === 'flap') {
        g.fillTriangle(41, 51, 25, 89, 73, 63);
        g.fillTriangle(66, 48, 73, 95, 100, 59);
      } else {
        g.fillTriangle(42, 52, 11, 28, 72, 67);
        g.fillTriangle(68, 54, 90, 13, 101, 68);
      }
      g.fillStyle(0xfafff9).fillEllipse(66, 57, 75, 51);
      g.lineStyle(5, outline, .9).strokeEllipse(66, 57, 75, 51);
      g.fillStyle(0xffffff).fillCircle(87, 42, 24);
      g.lineStyle(4, outline).strokeCircle(87, 42, 24);
      g.fillStyle(0x263b4b).fillEllipse(94, 39, 8, 14);
      g.fillStyle(0xffffff).fillCircle(96, 34, 2.8);
      // A thick suspicious eyebrow
      g.lineStyle(5, outline).lineBetween(83, 28, 101, 30);
      // Orange-yellow criminal beak
      g.fillStyle(0xffc75b).fillTriangle(103, 49, 127, 55, 104, 65);
      g.lineStyle(3, outline).lineBetween(106, 63, 120, 58);
      g.lineStyle(3, 0xe08c47).lineBetween(57, 76, 53, 93).lineBetween(80, 76, 84, 93);
      g.lineStyle(3, 0xe08c47).lineBetween(49, 93, 62, 93).lineBetween(81, 93, 94, 93);
      g.generateTexture('gull-' + pose, 132, 108);
    }
    // Human characters with separate t-shirt colors
    for (let i = 0; i < 3; i += 1) {
      g.clear();
      const shirt = [0xe86f60, 0x75b9c0, 0xf4ad58][i];
      g.fillStyle(0x7d5b4d).fillRect(24, 69, 11, 29).fillRect(44, 69, 11, 29);
      g.fillStyle(0x263b4b).fillEllipse(28, 98, 22, 9).fillEllipse(51, 98, 22, 9);
      g.fillStyle(0xffc293).fillRoundedRect(15, 43, 13, 36, 6)
        .fillRoundedRect(52, 43, 13, 36, 6);
      g.fillStyle(shirt).fillRoundedRect(20, 42, 40, 41, 9);
      g.fillStyle(0xfdd4a4).fillCircle(40, 27, 23);
      g.fillStyle(0x4d3e37).fillEllipse(39, 11, 41, 13);
      g.fillStyle(0x214155).fillRoundedRect(22, 24, 37, 10, 4);
      g.fillStyle(0xffffff).fillRect(23, 27, 6, 2).fillRect(45, 27, 6, 2);
      g.lineStyle(2, 0x874b45).lineBetween(36, 39, 45, 39);
      g.generateTexture('tourist-' + i, 80, 112);
    }
    g.clear();
    // Lifeguard: red uniform, peaked cap and whistle
    g.fillStyle(0xefae7f).fillRoundedRect(15, 46, 13, 34, 6).fillRoundedRect(54, 46, 13, 34, 6);
    g.fillStyle(0x24465c).fillRect(28, 75, 12, 27).fillRect(44, 75, 12, 27);
    g.fillStyle(0x264b5c).fillEllipse(30, 104, 24, 8).fillEllipse(52, 104, 24, 8);
    g.fillStyle(0xf15a56).fillRoundedRect(21, 43, 42, 40, 9);
    g.fillStyle(0xffffff).fillCircle(43, 62, 9);
    g.fillStyle(0xf1b88b).fillCircle(42, 30, 23);
    g.fillStyle(0xe64f51).fillEllipse(40, 14, 47, 17).fillRoundedRect(22, 15, 48, 7, 3);
    g.fillStyle(0x193d50).fillRoundedRect(23, 28, 38, 10, 4);
    g.fillStyle(0xffe9d4).fillRect(29, 30, 6, 2).fillRect(48, 30, 6, 2);
    g.generateTexture('lifeguard', 84, 116);
    // Four recognizable snack icons, individually illustrated
    g.clear();
    g.lineStyle(3, outline);
    for (const [x, h] of [[21, 25], [29, 31], [37, 27], [45, 33]]) {
      g.fillStyle(0xffdf69).fillRoundedRect(x, 5 + (33 - h), 7, h, 2);
    }
    g.fillStyle(0xe94d4e).fillPoints([
      new Phaser.Geom.Point(14, 27), new Phaser.Geom.Point(52, 27),
      new Phaser.Geom.Point(47, 57), new Phaser.Geom.Point(20, 57)
    ], true);
    g.fillStyle(0xffe7a0).fillCircle(33, 41, 8);
    g.generateTexture('food-fries', 66, 62);
    g.clear();
    g.fillStyle(0xd89752).fillTriangle(22, 29, 47, 29, 34, 60);
    g.lineStyle(2, 0xac7148).lineBetween(28, 38, 41, 38).lineBetween(29, 47, 38, 47);
    g.fillStyle(0xf2a8ba).fillCircle(34, 24, 16);
    g.fillStyle(0xffe7db).fillCircle(34, 12, 12);
    g.fillStyle(0xd63c60).fillCircle(36, 4, 4);
    g.generateTexture('food-gelato', 66, 64);
    g.clear();
    g.fillStyle(0xb78549).fillRoundedRect(9, 18, 50, 31, 5);
    g.fillStyle(0xf4cc82).fillRoundedRect(7, 12, 50, 32, 6);
    g.lineStyle(3, 0xe6a35b).strokeRoundedRect(7, 12, 50, 32, 6);
    for (const [x, y] of [[19, 24], [33, 18], [44, 29], [29, 36]]) {
      g.fillStyle(0x5c8851).fillEllipse(x, y, 6, 4);
    }
    g.generateTexture('food-focaccia', 66, 59);
    g.clear();
    g.fillStyle(0xf0bd76).fillTriangle(8, 12, 56, 12, 32, 57);
    g.fillStyle(0xffdf6b).fillTriangle(12, 14, 52, 14, 32, 51);
    g.lineStyle(5, 0xa97940).lineBetween(9, 13, 55, 13);
    for (const [x, y] of [[24, 26], [38, 27], [33, 39]]) {
      g.fillStyle(0xdb5753).fillCircle(x, y, 5);
    }
    g.generateTexture('food-pizza', 66, 65);
    g.destroy();
  }
}
