// ArenaClash 2D Canvas Engine, Particle System, and Bot AI
class ArenaEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.MAP_WIDTH = 1600;
    this.MAP_HEIGHT = 1000;
    this.PLAYER_RADIUS = 22;

    this.camera = { x: 800, y: 500, zoom: 1 };
    this.screenShake = 0;

    // Particles & Floating Text
    this.particles = [];
    this.damageTexts = [];

    // State holders
    this.myPlayerId = null;
    this.players = [];
    this.bullets = [];
    this.powerups = [];
    this.obstacles = [];

    // Resize observer
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight - 60;
  }

  updateState(state, myId) {
    this.myPlayerId = myId;
    this.players = state.players || [];
    this.bullets = state.bullets || [];
    this.powerups = state.powerups || [];
  }

  setObstacles(obstacles) {
    this.obstacles = obstacles || [];
  }

  addDamageNumber(x, y, amount, isCrit = false) {
    this.damageTexts.push({
      x,
      y,
      text: `-${Math.round(amount)}`,
      color: isCrit ? '#f59e0b' : '#ef4444',
      size: isCrit ? 22 : 16,
      opacity: 1,
      vy: -1.2,
      createdAt: Date.now()
    });
  }

  addSparks(x, y, color = '#38bdf8', count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        radius: Math.random() * 3 + 1.5,
        alpha: 1,
        decay: Math.random() * 0.03 + 0.02
      });
    }
  }

  addExplosion(x, y, color = '#ef4444') {
    this.screenShake = 12;
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: i % 2 === 0 ? color : '#f59e0b',
        radius: Math.random() * 5 + 2,
        alpha: 1,
        decay: Math.random() * 0.02 + 0.015
      });
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Follow my player
    const myPlayer = this.players.find(p => p.id === this.myPlayerId);
    if (myPlayer) {
      this.camera.x += (myPlayer.x - this.camera.x) * 0.12;
      this.camera.y += (myPlayer.y - this.camera.y) * 0.12;
    }

    // Clamp camera to map bounds
    const minCamX = w / 2;
    const maxCamX = Math.max(minCamX, this.MAP_WIDTH - w / 2);
    const minCamY = h / 2;
    const maxCamY = Math.max(minCamY, this.MAP_HEIGHT - h / 2);
    this.camera.x = Math.max(minCamX, Math.min(maxCamX, this.camera.x));
    this.camera.y = Math.max(minCamY, Math.min(maxCamY, this.camera.y));

    // Clear background
    ctx.fillStyle = '#060911';
    ctx.fillRect(0, 0, w, h);

    // Apply Screen Shake
    let shakeX = 0, shakeY = 0;
    if (this.screenShake > 0) {
      shakeX = (Math.random() - 0.5) * this.screenShake;
      shakeY = (Math.random() - 0.5) * this.screenShake;
      this.screenShake *= 0.9;
      if (this.screenShake < 0.2) this.screenShake = 0;
    }

    ctx.save();
    ctx.translate(w / 2 - this.camera.x + shakeX, h / 2 - this.camera.y + shakeY);

    // 1. Draw Map Floor Grid
    this.drawGrid(ctx);

    // 2. Draw Arena Boundaries
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, this.MAP_WIDTH, this.MAP_HEIGHT);

    // 3. Draw Obstacles
    this.drawObstacles(ctx);

    // 4. Draw Powerups
    this.drawPowerups(ctx);

    // 5. Draw Bullets
    this.drawBullets(ctx);

    // 6. Draw Players
    this.drawPlayers(ctx);

    // 7. Draw Particles & Damage Numbers
    this.drawParticles(ctx);

    ctx.restore();
  }

  drawGrid(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 80;

    for (let x = 0; x <= this.MAP_WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.MAP_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= this.MAP_HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.MAP_WIDTH, y);
      ctx.stroke();
    }
  }

  drawObstacles(ctx) {
    this.obstacles.forEach(obs => {
      // Base block
      ctx.fillStyle = '#141d30';
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

      // Border glow
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

      // Tech cross stripes
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.moveTo(obs.x, obs.y);
      ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
      ctx.stroke();
    });
  }

  drawPowerups(ctx) {
    const time = Date.now() * 0.003;
    this.powerups.forEach(p => {
      const bob = Math.sin(time + p.id) * 3;
      const y = p.y + bob;

      // Glow circle
      let color = '#10b981';
      let icon = '💚';
      if (p.type === 'speed') { color = '#38bdf8'; icon = '⚡'; }
      else if (p.type === 'shield') { color = '#06b6d4'; icon = '🛡️'; }
      else if (p.type === 'rapid') { color = '#f59e0b'; icon = '🔥'; }

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.arc(p.x, y, p.radius || 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Icon text
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, p.x, y);
      ctx.restore();
    });
  }

  drawBullets(ctx) {
    this.bullets.forEach(b => {
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  drawPlayers(ctx) {
    this.players.forEach(p => {
      if (!p.isAlive) return;

      ctx.save();
      ctx.translate(p.x, p.y);

      // Shield Aura
      if (p.hasShield) {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, this.PLAYER_RADIUS + 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Speed Ring
      if (p.hasSpeed) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.PLAYER_RADIUS + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Aim Gun / Turret
      ctx.save();
      ctx.rotate(p.aimAngle || 0);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(8, -4, 20, 8);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(24, -3, 6, 6);
      ctx.restore();

      // Player Body Chassis
      ctx.shadowColor = p.skin || '#ef4444';
      ctx.shadowBlur = 10;
      ctx.fillStyle = p.skin || '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, this.PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Inner Core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Overhead Nickname and Mini Health Bar
      ctx.save();
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(p.nickname, p.x, p.y - this.PLAYER_RADIUS - 14);

      // Health Bar
      const barW = 44;
      const barH = 5;
      const hpRatio = Math.max(0, p.health / p.maxHealth);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(p.x - barW / 2, p.y - this.PLAYER_RADIUS - 10, barW, barH);

      ctx.fillStyle = hpRatio > 0.5 ? '#10b981' : (hpRatio > 0.25 ? '#f59e0b' : '#ef4444');
      ctx.fillRect(p.x - barW / 2, p.y - this.PLAYER_RADIUS - 10, barW * hpRatio, barH);
      ctx.restore();
    });
  }

  drawParticles(ctx) {
    // Sparks & explosions
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.alpha -= pt.decay;

      if (pt.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.alpha);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Floating damage texts
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const dt = this.damageTexts[i];
      dt.y += dt.vy;
      dt.opacity -= 0.025;

      if (dt.opacity <= 0) {
        this.damageTexts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, dt.opacity);
      ctx.font = `bold ${dt.size}px monospace`;
      ctx.fillStyle = dt.color;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText(dt.text, dt.x, dt.y);
      ctx.restore();
    }
  }
}

// User Input Handler (Desktop WASD + Mouse Aim, Mobile Joystick)
class ArenaInputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = { up: false, down: false, left: false, right: false };
    this.mouse = { x: 0, y: 0, aimAngle: 0, isShooting: false };

    this.setupKeyboard();
    this.setupMouse();
  }

  setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') this.keys.up = true;
      if (key === 's' || key === 'arrowdown') this.keys.down = true;
      if (key === 'a' || key === 'arrowleft') this.keys.left = true;
      if (key === 'd' || key === 'arrowright') this.keys.right = true;
      if (key === ' ') this.mouse.isShooting = true;
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') this.keys.up = false;
      if (key === 's' || key === 'arrowdown') this.keys.down = false;
      if (key === 'a' || key === 'arrowleft') this.keys.left = false;
      if (key === 'd' || key === 'arrowright') this.keys.right = false;
      if (key === ' ') this.mouse.isShooting = false;
    });
  }

  setupMouse() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.mouse.aimAngle = Math.atan2(mouseY - centerY, mouseX - centerX);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.isShooting = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.isShooting = false;
    });
  }

  getInput() {
    return {
      up: this.keys.up,
      down: this.keys.down,
      left: this.keys.left,
      right: this.keys.right,
      shoot: this.mouse.isShooting,
      aimAngle: this.mouse.aimAngle
    };
  }
}

// Client-Side Offline Bot Simulation for Solo Mode
class ArenaSoloSim {
  constructor(difficulty = 'medium', mapType = 'cyber') {
    this.difficulty = difficulty; // 'easy' | 'medium' | 'hard'
    this.mapType = mapType;
    this.MAP_WIDTH = 1600;
    this.MAP_HEIGHT = 1000;
    this.PLAYER_RADIUS = 22;
    this.BULLET_SPEED = 700;
    this.BULLET_DAMAGE = 20;

    this.obstacles = [
      { x: 350, y: 200, w: 80, h: 220 },
      { x: 350, y: 580, w: 80, h: 220 },
      { x: 1170, y: 200, w: 80, h: 220 },
      { x: 1170, y: 580, w: 80, h: 220 },
      { x: 720, y: 320, w: 160, h: 60 },
      { x: 720, y: 620, w: 160, h: 60 }
    ];

    this.players = [];
    this.bullets = [];
    this.powerups = [];
    this.matchStartTime = Date.now();
    this.duration = 90; // seconds

    this.initEntities();
  }

  initEntities() {
    // Player
    this.players = [
      {
        id: 'player_me',
        nickname: 'You',
        skin: '#06b6d4',
        x: 250,
        y: 500,
        aimAngle: 0,
        health: 100,
        maxHealth: 100,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        isAlive: true,
        lastShotTime: 0,
        speedBuffUntil: 0,
        shieldBuffUntil: 0,
        rapidBuffUntil: 0,
        input: { up: false, down: false, left: false, right: false, shoot: false, aimAngle: 0 }
      },
      // Bot 1
      {
        id: 'bot_1',
        nickname: 'Viper (AI)',
        skin: '#ef4444',
        x: 1350,
        y: 250,
        aimAngle: 0,
        health: 100,
        maxHealth: 100,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        isAlive: true,
        lastShotTime: 0,
        speedBuffUntil: 0,
        shieldBuffUntil: 0,
        rapidBuffUntil: 0,
        isBot: true,
        nextMoveTime: 0,
        botDir: { x: 0, y: 0 }
      },
      // Bot 2
      {
        id: 'bot_2',
        nickname: 'Titan (AI)',
        skin: '#f59e0b',
        x: 1350,
        y: 750,
        aimAngle: 0,
        health: 100,
        maxHealth: 100,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        isAlive: true,
        lastShotTime: 0,
        speedBuffUntil: 0,
        shieldBuffUntil: 0,
        rapidBuffUntil: 0,
        isBot: true,
        nextMoveTime: 0,
        botDir: { x: 0, y: 0 }
      },
      // Bot 3
      {
        id: 'bot_3',
        nickname: 'Ghost (AI)',
        skin: '#a855f7',
        x: 800,
        y: 180,
        aimAngle: 0,
        health: 100,
        maxHealth: 100,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        isAlive: true,
        lastShotTime: 0,
        speedBuffUntil: 0,
        shieldBuffUntil: 0,
        rapidBuffUntil: 0,
        isBot: true,
        nextMoveTime: 0,
        botDir: { x: 0, y: 0 }
      }
    ];

    // Spawn 2 powerups
    this.powerups = [
      { id: 1, type: 'health', x: 800, y: 500, radius: 16 },
      { id: 2, type: 'speed', x: 250, y: 250, radius: 16 }
    ];
  }

  update(dt, playerInput, onEvent) {
    const now = Date.now();
    const me = this.players[0];

    // 1. Update Human Player
    if (me.isAlive) {
      let speed = 240;
      if (me.speedBuffUntil > now) speed *= 1.45;

      let mx = 0, my = 0;
      if (playerInput.up) my -= 1;
      if (playerInput.down) my += 1;
      if (playerInput.left) mx -= 1;
      if (playerInput.right) mx += 1;
      if (mx !== 0 && my !== 0) {
        mx *= 0.7071;
        my *= 0.7071;
      }

      me.x = Math.max(this.PLAYER_RADIUS, Math.min(this.MAP_WIDTH - this.PLAYER_RADIUS, me.x + mx * speed * dt));
      me.y = Math.max(this.PLAYER_RADIUS, Math.min(this.MAP_HEIGHT - this.PLAYER_RADIUS, me.y + my * speed * dt));
      me.aimAngle = playerInput.aimAngle;

      const cooldown = (me.rapidBuffUntil > now) ? 110 : 220;
      if (playerInput.shoot && now - me.lastShotTime >= cooldown) {
        me.lastShotTime = now;
        this.bullets.push({
          id: Math.random().toString(),
          ownerId: me.id,
          x: me.x + Math.cos(me.aimAngle) * 30,
          y: me.y + Math.sin(me.aimAngle) * 30,
          vx: Math.cos(me.aimAngle) * this.BULLET_SPEED,
          vy: Math.sin(me.aimAngle) * this.BULLET_SPEED,
          damage: this.BULLET_DAMAGE,
          createdAt: now
        });
        if (onEvent) onEvent('shoot');
      }
    }

    // 2. Update AI Bots
    for (let i = 1; i < this.players.length; i++) {
      const bot = this.players[i];
      if (!bot.isAlive) continue;

      // Bot decision making
      if (now > bot.nextMoveTime) {
        bot.nextMoveTime = now + (this.difficulty === 'hard' ? 400 : 800);
        // Move towards human or powerup
        const target = me.isAlive ? me : this.powerups[0] || { x: 800, y: 500 };
        const angle = Math.atan2(target.y - bot.y, target.x - bot.x);
        bot.botDir = {
          x: Math.cos(angle + (Math.random() - 0.5) * 0.4),
          y: Math.sin(angle + (Math.random() - 0.5) * 0.4)
        };
      }

      let botSpeed = this.difficulty === 'easy' ? 140 : (this.difficulty === 'hard' ? 220 : 180);
      bot.x = Math.max(this.PLAYER_RADIUS, Math.min(this.MAP_WIDTH - this.PLAYER_RADIUS, bot.x + bot.botDir.x * botSpeed * dt));
      bot.y = Math.max(this.PLAYER_RADIUS, Math.min(this.MAP_HEIGHT - this.PLAYER_RADIUS, bot.y + bot.botDir.y * botSpeed * dt));

      // Aim at player
      if (me.isAlive) {
        const dx = me.x - bot.x;
        const dy = me.y - bot.y;
        bot.aimAngle = Math.atan2(dy, dx);

        const shootChance = this.difficulty === 'hard' ? 0.08 : (this.difficulty === 'medium' ? 0.04 : 0.015);
        if (Math.random() < shootChance && now - bot.lastShotTime >= 400) {
          bot.lastShotTime = now;
          this.bullets.push({
            id: Math.random().toString(),
            ownerId: bot.id,
            x: bot.x + Math.cos(bot.aimAngle) * 30,
            y: bot.y + Math.sin(bot.aimAngle) * 30,
            vx: Math.cos(bot.aimAngle) * this.BULLET_SPEED,
            vy: Math.sin(bot.aimAngle) * this.BULLET_SPEED,
            damage: this.BULLET_DAMAGE,
            createdAt: now
          });
        }
      }
    }

    // 3. Update Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < 0 || b.x > this.MAP_WIDTH || b.y < 0 || b.y > this.MAP_HEIGHT || now - b.createdAt > 1800) {
        this.bullets.splice(i, 1);
        continue;
      }

      // Check collision with players
      for (const target of this.players) {
        if (target.id === b.ownerId || !target.isAlive) continue;
        const distSq = (b.x - target.x) ** 2 + (b.y - target.y) ** 2;
        if (distSq <= this.PLAYER_RADIUS ** 2) {
          target.health = Math.max(0, target.health - b.damage);
          const shooter = this.players.find(p => p.id === b.ownerId);
          if (shooter) shooter.damageDealt += b.damage;

          if (onEvent) onEvent('hit', { target, shooter, x: b.x, y: b.y, damage: b.damage });

          if (target.health <= 0) {
            target.isAlive = false;
            target.deaths++;
            if (shooter) shooter.kills++;
            if (onEvent) onEvent('eliminated', { target, shooter });

            // Respawn bot after 3 seconds
            setTimeout(() => {
              target.isAlive = true;
              target.health = 100;
              target.x = Math.floor(Math.random() * 1200) + 200;
              target.y = Math.floor(Math.random() * 700) + 150;
            }, 3000);
          }

          this.bullets.splice(i, 1);
          break;
        }
      }
    }

    // 4. Powerup collection
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pow = this.powerups[i];
      for (const p of this.players) {
        if (!p.isAlive) continue;
        const distSq = (p.x - pow.x) ** 2 + (p.y - pow.y) ** 2;
        if (distSq <= (this.PLAYER_RADIUS + pow.radius) ** 2) {
          if (pow.type === 'health') p.health = Math.min(p.maxHealth, p.health + 40);
          if (pow.type === 'speed') p.speedBuffUntil = now + 8000;
          if (onEvent) onEvent('powerup', { p, pow });
          this.powerups.splice(i, 1);
          break;
        }
      }
    }

    // Spawn new powerup if none
    if (this.powerups.length === 0 && Math.random() < 0.02) {
      this.powerups.push({
        id: Math.random(),
        type: Math.random() > 0.5 ? 'health' : 'speed',
        x: Math.floor(Math.random() * 1200) + 200,
        y: Math.floor(Math.random() * 700) + 150,
        radius: 16
      });
    }

    return {
      players: this.players,
      bullets: this.bullets,
      powerups: this.powerups,
      timeLeft: Math.max(0, this.duration - Math.floor((now - this.matchStartTime) / 1000))
    };
  }
}

window.ArenaEngine = ArenaEngine;
window.ArenaInputHandler = ArenaInputHandler;
window.ArenaSoloSim = ArenaSoloSim;
