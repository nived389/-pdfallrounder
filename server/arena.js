// ArenaClash Server-Authoritative Physics & Match Engine
class ArenaEngine {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomCode -> roomData
    this.TICK_RATE = 30; // 30 updates per second
    this.TICK_INTERVAL = 1000 / this.TICK_RATE;
    this.MAP_WIDTH = 1600;
    this.MAP_HEIGHT = 1000;
    this.PLAYER_RADIUS = 22;
    this.BULLET_SPEED = 700; // px/sec
    this.BULLET_DAMAGE = 20;
    this.BULLET_LIFETIME = 1800; // ms
    this.PLAYER_SPEED = 240; // px/sec

    // Start global simulation ticker
    setInterval(() => this.tick(), this.TICK_INTERVAL);
  }

  // Pre-configured arena obstacle maps
  getMapObstacles(mapType) {
    if (mapType === 'bunker') {
      return [
        { x: 300, y: 250, w: 60, h: 500 },
        { x: 1240, y: 250, w: 60, h: 500 },
        { x: 550, y: 200, w: 500, h: 50 },
        { x: 550, y: 750, w: 500, h: 50 },
        { x: 700, y: 440, w: 200, h: 120 }
      ];
    } else if (mapType === 'colosseum') {
      return [
        { x: 400, y: 300, w: 100, h: 100 },
        { x: 1100, y: 300, w: 100, h: 100 },
        { x: 400, y: 600, w: 100, h: 100 },
        { x: 1100, y: 600, w: 100, h: 100 },
        { x: 740, y: 440, w: 120, h: 120 }
      ];
    }
    // Default 'cyber' arena
    return [
      { x: 350, y: 200, w: 80, h: 220 },
      { x: 350, y: 580, w: 80, h: 220 },
      { x: 1170, y: 200, w: 80, h: 220 },
      { x: 1170, y: 580, w: 80, h: 220 },
      { x: 720, y: 320, w: 160, h: 60 },
      { x: 720, y: 620, w: 160, h: 60 }
    ];
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return this.rooms.has(code) ? this.generateRoomCode() : code;
  }

  createRoom({ socket, nickname, skin, map, matchType }) {
    const roomCode = this.generateRoomCode();
    const mapType = map || 'cyber';
    const obstacles = this.getMapObstacles(mapType);

    const hostPlayer = {
      id: socket.id,
      nickname: (nickname || 'Commander').trim().substring(0, 16),
      skin: skin || '#ef4444',
      isHost: true,
      ready: true,
      x: 200,
      y: 500,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      health: 100,
      maxHealth: 100,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      isAlive: true,
      lastShotTime: 0,
      fireCooldown: 220, // ms
      speedBuffUntil: 0,
      shieldBuffUntil: 0,
      rapidBuffUntil: 0,
      input: { up: false, down: false, left: false, right: false, shoot: false, aimAngle: 0 }
    };

    const room = {
      roomCode,
      hostId: socket.id,
      map: mapType,
      matchType: matchType || 'LastManStanding', // 'LastManStanding' | 'KillRace' | 'TimedDeathmatch'
      status: 'lobby', // 'lobby' | 'in-progress' | 'finished'
      players: new Map([[socket.id, hostPlayer]]),
      obstacles,
      bullets: [],
      powerups: [],
      nextPowerupId: 1,
      lastPowerupSpawn: Date.now(),
      matchStartTime: 0,
      matchDuration: 90, // seconds for TimedDeathmatch
      targetKills: 8, // for KillRace
      winner: null
    };

    this.rooms.set(roomCode, room);
    socket.join(`arena_${roomCode}`);
    socket.arenaRoomCode = roomCode;

    socket.emit('arena:room-created', {
      roomCode,
      room: this.sanitizeRoom(room),
      isHost: true
    });
    console.log(`Arena room created: ${roomCode} by ${hostPlayer.nickname}`);
  }

  joinRoom({ socket, roomCode, nickname, skin }) {
    const code = (roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);

    if (!room) {
      return socket.emit('arena:error', 'Room not found! Check your code.');
    }
    if (room.status !== 'lobby') {
      return socket.emit('arena:error', 'Match already in progress.');
    }
    if (room.players.size >= 8) {
      return socket.emit('arena:error', 'Room is full (max 8 players).');
    }

    // Determine initial spawn position
    const spawnX = 200 + (room.players.size * 120);
    const spawnY = (room.players.size % 2 === 0) ? 300 : 700;

    const player = {
      id: socket.id,
      nickname: (nickname || `Player ${room.players.size + 1}`).trim().substring(0, 16),
      skin: skin || '#3b82f6',
      isHost: false,
      ready: false,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      health: 100,
      maxHealth: 100,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      isAlive: true,
      lastShotTime: 0,
      fireCooldown: 220,
      speedBuffUntil: 0,
      shieldBuffUntil: 0,
      rapidBuffUntil: 0,
      input: { up: false, down: false, left: false, right: false, shoot: false, aimAngle: 0 }
    };

    room.players.set(socket.id, player);
    socket.join(`arena_${code}`);
    socket.arenaRoomCode = code;

    socket.emit('arena:room-joined', {
      roomCode: code,
      room: this.sanitizeRoom(room),
      isHost: false
    });

    this.io.to(`arena_${code}`).emit('arena:room-update', {
      room: this.sanitizeRoom(room)
    });
  }

  toggleReady(socket) {
    const room = this.rooms.get(socket.arenaRoomCode);
    if (!room || room.status !== 'lobby') return;
    const player = room.players.get(socket.id);
    if (player && !player.isHost) {
      player.ready = !player.ready;
      this.io.to(`arena_${room.roomCode}`).emit('arena:room-update', {
        room: this.sanitizeRoom(room)
      });
    }
  }

  startMatch(socket) {
    const room = this.rooms.get(socket.arenaRoomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.status !== 'lobby') return;

    room.status = 'in-progress';
    room.matchStartTime = Date.now();
    room.bullets = [];
    room.powerups = [];
    room.winner = null;

    // Reset player combat stats and spawn locations
    const spawns = [
      { x: 180, y: 180 }, { x: 1420, y: 820 },
      { x: 1420, y: 180 }, { x: 180, y: 820 },
      { x: 800, y: 150 }, { x: 800, y: 850 },
      { x: 200, y: 500 }, { x: 1400, y: 500 }
    ];

    let spawnIdx = 0;
    room.players.forEach(p => {
      const pos = spawns[spawnIdx % spawns.length];
      spawnIdx++;
      p.x = pos.x;
      p.y = pos.y;
      p.vx = 0;
      p.vy = 0;
      p.health = 100;
      p.isAlive = true;
      p.kills = 0;
      p.deaths = 0;
      p.damageDealt = 0;
      p.speedBuffUntil = 0;
      p.shieldBuffUntil = 0;
      p.rapidBuffUntil = 0;
    });

    // Spawn 2 initial powerups
    this.spawnPowerup(room);
    this.spawnPowerup(room);

    this.io.to(`arena_${room.roomCode}`).emit('arena:match-started', {
      room: this.sanitizeRoom(room),
      obstacles: room.obstacles,
      map: room.map,
      matchType: room.matchType
    });

    console.log(`Arena match started in room ${room.roomCode} (${room.players.size} players)`);
  }

  handlePlayerInput(socket, input) {
    const room = this.rooms.get(socket.arenaRoomCode);
    if (!room || room.status !== 'in-progress') return;
    const player = room.players.get(socket.id);
    if (!player || !player.isAlive) return;

    // Store verified input
    player.input = {
      up: !!input.up,
      down: !!input.down,
      left: !!input.left,
      right: !!input.right,
      shoot: !!input.shoot,
      aimAngle: typeof input.aimAngle === 'number' ? input.aimAngle : 0
    };
    player.aimAngle = player.input.aimAngle;
  }

  spawnPowerup(room) {
    if (room.powerups.length >= 4) return;
    const types = ['health', 'speed', 'shield', 'rapid'];
    const type = types[Math.floor(Math.random() * types.length)];

    // Find non-colliding spot
    let x = 0, y = 0, valid = false, tries = 0;
    while (!valid && tries < 25) {
      x = Math.floor(Math.random() * (this.MAP_WIDTH - 200)) + 100;
      y = Math.floor(Math.random() * (this.MAP_HEIGHT - 200)) + 100;
      valid = true;
      for (const obs of room.obstacles) {
        if (x >= obs.x - 30 && x <= obs.x + obs.w + 30 &&
            y >= obs.y - 30 && y <= obs.y + obs.h + 30) {
          valid = false;
          break;
        }
      }
      tries++;
    }

    const powerup = {
      id: room.nextPowerupId++,
      type,
      x,
      y,
      radius: 16,
      createdAt: Date.now()
    };
    room.powerups.push(powerup);

    this.io.to(`arena_${room.roomCode}`).emit('arena:powerup-spawned', powerup);
  }

  // Authoritative Tick Loop
  tick() {
    const dt = this.TICK_INTERVAL / 1000;
    const now = Date.now();

    for (const [roomCode, room] of this.rooms.entries()) {
      if (room.status !== 'in-progress') continue;

      // 1. Process player movement & shooting
      for (const [id, p] of room.players.entries()) {
        if (!p.isAlive) continue;

        // Speed calculation (with speed buff)
        let speed = this.PLAYER_SPEED;
        if (p.speedBuffUntil > now) speed *= 1.45;

        let moveX = 0;
        let moveY = 0;
        if (p.input.up) moveY -= 1;
        if (p.input.down) moveY += 1;
        if (p.input.left) moveX -= 1;
        if (p.input.right) moveX += 1;

        if (moveX !== 0 && moveY !== 0) {
          // Normalize diagonal movement
          const invSqrt = 1 / 1.41421;
          moveX *= invSqrt;
          moveY *= invSqrt;
        }

        const nextX = p.x + moveX * speed * dt;
        const nextY = p.y + moveY * speed * dt;

        // Collision with map boundary
        const clampedX = Math.max(this.PLAYER_RADIUS, Math.min(this.MAP_WIDTH - this.PLAYER_RADIUS, nextX));
        const clampedY = Math.max(this.PLAYER_RADIUS, Math.min(this.MAP_HEIGHT - this.PLAYER_RADIUS, nextY));

        // Collision with obstacles
        if (!this.checkCircleRectsCollision(clampedX, p.y, this.PLAYER_RADIUS, room.obstacles)) {
          p.x = clampedX;
        }
        if (!this.checkCircleRectsCollision(p.x, clampedY, this.PLAYER_RADIUS, room.obstacles)) {
          p.y = clampedY;
        }

        // Shooting logic
        const cooldown = (p.rapidBuffUntil > now) ? (p.fireCooldown * 0.5) : p.fireCooldown;
        if (p.input.shoot && now - p.lastShotTime >= cooldown) {
          p.lastShotTime = now;
          const spawnDist = this.PLAYER_RADIUS + 8;
          const bulletX = p.x + Math.cos(p.aimAngle) * spawnDist;
          const bulletY = p.y + Math.sin(p.aimAngle) * spawnDist;

          room.bullets.push({
            id: Math.random().toString(36).substring(2, 9),
            ownerId: p.id,
            x: bulletX,
            y: bulletY,
            vx: Math.cos(p.aimAngle) * this.BULLET_SPEED,
            vy: Math.sin(p.aimAngle) * this.BULLET_SPEED,
            createdAt: now,
            damage: this.BULLET_DAMAGE
          });
        }

        // Check powerup pickups
        for (let i = room.powerups.length - 1; i >= 0; i--) {
          const pow = room.powerups[i];
          const distSq = (p.x - pow.x) ** 2 + (p.y - pow.y) ** 2;
          if (distSq <= (this.PLAYER_RADIUS + pow.radius) ** 2) {
            // Apply powerup
            if (pow.type === 'health') {
              p.health = Math.min(p.maxHealth, p.health + 40);
            } else if (pow.type === 'speed') {
              p.speedBuffUntil = now + 8000;
            } else if (pow.type === 'shield') {
              p.shieldBuffUntil = now + 10000;
            } else if (pow.type === 'rapid') {
              p.rapidBuffUntil = now + 8000;
            }

            this.io.to(`arena_${room.roomCode}`).emit('arena:powerup-collected', {
              playerId: p.id,
              powerupId: pow.id,
              type: pow.type
            });
            room.powerups.splice(i, 1);
          }
        }
      }

      // 2. Process bullets
      for (let i = room.bullets.length - 1; i >= 0; i--) {
        const b = room.bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Check boundary or lifetime expiration
        if (b.x < 0 || b.x > this.MAP_WIDTH || b.y < 0 || b.y > this.MAP_HEIGHT || now - b.createdAt > this.BULLET_LIFETIME) {
          room.bullets.splice(i, 1);
          continue;
        }

        // Check obstacle collision
        if (this.checkPointRectsCollision(b.x, b.y, room.obstacles)) {
          room.bullets.splice(i, 1);
          continue;
        }

        // Check player hits
        let hitPlayer = false;
        for (const [pId, target] of room.players.entries()) {
          if (pId === b.ownerId || !target.isAlive) continue;

          const distSq = (b.x - target.x) ** 2 + (b.y - target.y) ** 2;
          if (distSq <= this.PLAYER_RADIUS ** 2) {
            hitPlayer = true;
            let dmg = b.damage;
            if (target.shieldBuffUntil > now) dmg *= 0.5; // Shield reduces 50% damage

            target.health = Math.max(0, target.health - dmg);

            const shooter = room.players.get(b.ownerId);
            if (shooter) shooter.damageDealt += dmg;

            this.io.to(`arena_${room.roomCode}`).emit('arena:player-hit', {
              playerId: target.id,
              newHealth: target.health,
              damage: dmg,
              hitX: b.x,
              hitY: b.y
            });

            // Check elimination
            if (target.health <= 0) {
              target.isAlive = false;
              target.deaths++;
              if (shooter) shooter.kills++;

              this.io.to(`arena_${room.roomCode}`).emit('arena:player-eliminated', {
                eliminatedId: target.id,
                eliminatedName: target.nickname,
                killerId: shooter ? shooter.id : null,
                killerName: shooter ? shooter.nickname : 'Arena Hazard'
              });

              // In Timed Deathmatch or Kill Race, allow respawning after 3 seconds
              if (room.matchType === 'TimedDeathmatch' || room.matchType === 'KillRace') {
                setTimeout(() => {
                  if (room.status === 'in-progress' && room.players.has(target.id)) {
                    target.isAlive = true;
                    target.health = 100;
                    target.x = Math.floor(Math.random() * (this.MAP_WIDTH - 300)) + 150;
                    target.y = Math.floor(Math.random() * (this.MAP_HEIGHT - 300)) + 150;
                    this.io.to(`arena_${room.roomCode}`).emit('arena:player-respawned', {
                      playerId: target.id,
                      x: target.x,
                      y: target.y
                    });
                  }
                }, 3000);
              }
            }
            break;
          }
        }

        if (hitPlayer) {
          room.bullets.splice(i, 1);
        }
      }

      // 3. Periodic powerup spawning (every 14s)
      if (now - room.lastPowerupSpawn > 14000) {
        room.lastPowerupSpawn = now;
        this.spawnPowerup(room);
      }

      // 4. Win condition checks
      this.checkWinConditions(room);

      // 5. Broadcast state snapshot to room
      const stateUpdate = {
        time: now,
        timeLeft: Math.max(0, room.matchDuration - Math.floor((now - room.matchStartTime) / 1000)),
        players: Array.from(room.players.values()).map(p => ({
          id: p.id,
          nickname: p.nickname,
          skin: p.skin,
          x: Math.round(p.x),
          y: Math.round(p.y),
          aimAngle: Number(p.aimAngle.toFixed(3)),
          health: p.health,
          maxHealth: p.maxHealth,
          kills: p.kills,
          deaths: p.deaths,
          isAlive: p.isAlive,
          hasSpeed: p.speedBuffUntil > now,
          hasShield: p.shieldBuffUntil > now,
          hasRapid: p.rapidBuffUntil > now
        })),
        bullets: room.bullets.map(b => ({
          id: b.id,
          x: Math.round(b.x),
          y: Math.round(b.y)
        })),
        powerups: room.powerups
      };

      this.io.to(`arena_${room.roomCode}`).emit('arena:state-update', stateUpdate);
    }
  }

  checkWinConditions(room) {
    const now = Date.now();
    let winner = null;

    if (room.matchType === 'LastManStanding') {
      const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
      if (room.players.size > 1 && alivePlayers.length <= 1) {
        winner = alivePlayers[0] || null;
        this.endMatch(room, winner);
      }
    } else if (room.matchType === 'KillRace') {
      for (const p of room.players.values()) {
        if (p.kills >= room.targetKills) {
          winner = p;
          this.endMatch(room, winner);
          break;
        }
      }
    } else if (room.matchType === 'TimedDeathmatch') {
      const elapsed = (now - room.matchStartTime) / 1000;
      if (elapsed >= room.matchDuration) {
        // Highest kills wins, tiebreak by damage
        const sorted = Array.from(room.players.values()).sort((a, b) => {
          if (b.kills !== a.kills) return b.kills - a.kills;
          return b.damageDealt - a.damageDealt;
        });
        winner = sorted[0] || null;
        this.endMatch(room, winner);
      }
    }
  }

  endMatch(room, winner) {
    room.status = 'finished';
    room.winner = winner;

    const stats = Array.from(room.players.values())
      .sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt)
      .map((p, idx) => ({
        rank: idx + 1,
        id: p.id,
        nickname: p.nickname,
        skin: p.skin,
        kills: p.kills,
        deaths: p.deaths,
        damageDealt: Math.round(p.damageDealt),
        survivalTime: Math.round((Date.now() - room.matchStartTime) / 1000)
      }));

    this.io.to(`arena_${room.roomCode}`).emit('arena:match-ended', {
      winner: winner ? { id: winner.id, nickname: winner.nickname, skin: winner.skin } : null,
      stats
    });
    console.log(`Arena match ended in room ${room.roomCode}. Winner: ${winner ? winner.nickname : 'Draw'}`);
  }

  resetRoom(socket) {
    const room = this.rooms.get(socket.arenaRoomCode);
    if (!room || room.hostId !== socket.id) return;

    room.status = 'lobby';
    room.bullets = [];
    room.powerups = [];
    room.players.forEach(p => {
      p.health = 100;
      p.isAlive = true;
      p.kills = 0;
      p.deaths = 0;
      p.damageDealt = 0;
      p.ready = p.isHost;
    });

    this.io.to(`arena_${room.roomCode}`).emit('arena:room-update', {
      room: this.sanitizeRoom(room)
    });
  }

  handleDisconnect(socket) {
    const code = socket.arenaRoomCode;
    if (!code || !this.rooms.has(code)) return;
    const room = this.rooms.get(code);

    room.players.delete(socket.id);
    socket.leave(`arena_${code}`);
    socket.arenaRoomCode = null;

    if (room.players.size === 0) {
      this.rooms.delete(code);
      console.log(`Arena room ${code} deleted (empty)`);
      return;
    }

    if (room.hostId === socket.id) {
      const nextHost = room.players.values().next().value;
      room.hostId = nextHost.id;
      nextHost.isHost = true;
      nextHost.ready = true;
      this.io.to(`arena_${code}`).emit('arena:host-transferred', {
        newHostId: nextHost.id,
        newHostNickname: nextHost.nickname
      });
    }

    this.io.to(`arena_${code}`).emit('arena:room-update', {
      room: this.sanitizeRoom(room)
    });

    if (room.status === 'in-progress') {
      this.checkWinConditions(room);
    }
  }

  // Geometry Collision Utilities
  checkCircleRectsCollision(cx, cy, r, rects) {
    for (const rect of rects) {
      const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
      const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
      const distSq = (cx - closestX) ** 2 + (cy - closestY) ** 2;
      if (distSq < r * r) return true;
    }
    return false;
  }

  checkPointRectsCollision(px, py, rects) {
    for (const rect of rects) {
      if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
        return true;
      }
    }
    return false;
  }

  sanitizeRoom(room) {
    return {
      roomCode: room.roomCode,
      hostId: room.hostId,
      map: room.map,
      matchType: room.matchType,
      status: room.status,
      playerCount: room.players.size,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        nickname: p.nickname,
        skin: p.skin,
        isHost: p.isHost,
        ready: p.ready
      }))
    };
  }
}

module.exports = ArenaEngine;
