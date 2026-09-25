// ArenaClash UI Controller and Client Socket Manager
document.addEventListener('DOMContentLoaded', () => {
  // Screens
  const screens = {
    home: document.getElementById('screen-arena-home'),
    soloSetup: document.getElementById('screen-arena-solo-setup'),
    create: document.getElementById('screen-arena-create'),
    join: document.getElementById('screen-arena-join'),
    lobby: document.getElementById('screen-arena-lobby'),
    gameplay: document.getElementById('screen-arena-gameplay'),
    results: document.getElementById('screen-arena-results')
  };

  function showScreen(key) {
    Object.values(screens).forEach(s => s && s.classList.remove('active'));
    if (screens[key]) screens[key].classList.add('active');
    if (key === 'gameplay' && engine) {
      engine.resize();
    }
  }

  // Toast
  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'arena-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  // Canvas & Engine
  const canvas = document.getElementById('arena-canvas');
  const engine = new ArenaEngine(canvas);
  const inputHandler = new ArenaInputHandler(canvas);

  // State
  let mode = null; // 'solo' | 'multiplayer'
  let socket = null;
  let currentRoom = null;
  let isHost = false;
  let myId = null;
  let selectedSkin = '#06b6d4';
  let soloSim = null;
  let gameLoopId = null;

  // Sound FX Helper
  function playSound(type) {
    if (!window.soundFX) return;
    if (type === 'shoot') window.soundFX.playTone(600, 'square', 0.04, 0.05);
    else if (type === 'hit') window.soundFX.playTone(180, 'sawtooth', 0.08, 0.1);
    else if (type === 'eliminated') window.soundFX.playTone(120, 'sawtooth', 0.25, 0.2);
    else if (type === 'powerup') window.soundFX.playCorrect();
    else if (type === 'victory') window.soundFX.playFanfare();
  }

  // Audio Toggle
  const btnAudio = document.getElementById('btn-arena-audio');
  btnAudio.addEventListener('click', () => {
    if (window.soundFX) {
      const muted = window.soundFX.toggleMute();
      btnAudio.textContent = muted ? '🔇' : '🔊';
      showToast(muted ? 'Sound Muted' : 'Sound Active');
    }
  });

  // Skin pickers
  function initSkinPickers() {
    document.querySelectorAll('.skin-circle').forEach(circle => {
      circle.addEventListener('click', () => {
        circle.parentElement.querySelectorAll('.skin-circle').forEach(c => c.classList.remove('selected'));
        circle.classList.add('selected');
        selectedSkin = circle.dataset.skin;
      });
    });
  }
  initSkinPickers();

  // Navigation Links
  document.getElementById('arena-logo').addEventListener('click', () => {
    if (confirm('Return to ArenaClash Home?')) {
      stopGameLoop();
      showScreen('home');
    }
  });

  document.getElementById('card-arena-solo').addEventListener('click', () => {
    mode = 'solo';
    showScreen('soloSetup');
  });

  document.getElementById('card-arena-create').addEventListener('click', () => {
    mode = 'multiplayer';
    showScreen('create');
  });

  document.getElementById('card-arena-join').addEventListener('click', () => {
    mode = 'multiplayer';
    showScreen('join');
  });

  document.getElementById('solo-back-btn').addEventListener('click', () => showScreen('home'));
  document.getElementById('create-back-btn').addEventListener('click', () => showScreen('home'));
  document.getElementById('join-back-btn').addEventListener('click', () => showScreen('home'));

  // ==========================================
  // SOLO MODE IMPLEMENTATION
  // ==========================================
  document.getElementById('btn-start-solo-match').addEventListener('click', () => {
    const diff = document.getElementById('solo-difficulty').value;
    const map = document.getElementById('solo-map').value;

    showScreen('gameplay');
    soloSim = new ArenaSoloSim(diff, map);
    engine.setObstacles(soloSim.obstacles);
    myId = 'player_me';

    document.getElementById('hud-mode-text').textContent = `Solo vs Bots (${diff.toUpperCase()})`;

    startGameLoop((dt) => {
      const input = inputHandler.getInput();
      const state = soloSim.update(dt, input, (evType, data) => {
        if (evType === 'shoot') playSound('shoot');
        else if (evType === 'hit') {
          playSound('hit');
          engine.addDamageNumber(data.x, data.y, data.damage);
          engine.addSparks(data.x, data.y, '#f59e0b', 6);
        } else if (evType === 'eliminated') {
          playSound('eliminated');
          engine.addExplosion(data.target.x, data.target.y, data.target.skin);
          addKillFeedMsg(data.killer.nickname, data.target.nickname);
        } else if (evType === 'powerup') {
          playSound('powerup');
        }
      });

      engine.updateState(state, myId);
      updateHUD(state);

      if (state.timeLeft <= 0) {
        endSoloMatch(state);
      }
    });
  });

  function endSoloMatch(state) {
    stopGameLoop();
    playSound('victory');
    showScreen('results');

    const me = state.players[0];
    const sorted = [...state.players].sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt);
    renderResultsTable(sorted);
  }

  // ==========================================
  // MULTIPLAYER MODE VIA SOCKET.IO
  // ==========================================
  function initSocket() {
    if (socket) return socket;
    socket = io();

    socket.on('connect', () => {
      myId = socket.id;
      console.log('Connected to ArenaClash server:', myId);
    });

    socket.on('arena:error', (msg) => showToast(msg));

    socket.on('arena:room-created', ({ roomCode, room, isHost: h }) => {
      currentRoom = room;
      isHost = h;
      renderLobby(room);
      showScreen('lobby');
      showToast(`Arena Room Created: ${roomCode}`);
    });

    socket.on('arena:room-joined', ({ roomCode, room, isHost: h }) => {
      currentRoom = room;
      isHost = h;
      renderLobby(room);
      showScreen('lobby');
      showToast(`Joined Arena ${roomCode}`);
    });

    socket.on('arena:room-update', ({ room }) => {
      currentRoom = room;
      renderLobby(room);
    });

    socket.on('arena:match-started', ({ room, obstacles, map, matchType }) => {
      currentRoom = room;
      engine.setObstacles(obstacles);
      showScreen('gameplay');
      document.getElementById('hud-mode-text').textContent = matchType;

      // Start client physics/rendering tick
      startGameLoop((dt) => {
        // Send input to server ~30-40 times/sec
        if (socket && socket.connected) {
          socket.emit('arena:player-input', inputHandler.getInput());
        }
      });
    });

    socket.on('arena:state-update', (state) => {
      engine.updateState(state, myId);
      updateHUD(state);
    });

    socket.on('arena:player-hit', ({ playerId, newHealth, damage, hitX, hitY }) => {
      playSound('hit');
      engine.addDamageNumber(hitX, hitY, damage);
      engine.addSparks(hitX, hitY, '#f59e0b', 6);
    });

    socket.on('arena:player-eliminated', ({ eliminatedName, killerName }) => {
      playSound('eliminated');
      addKillFeedMsg(killerName, eliminatedName);
    });

    socket.on('arena:powerup-collected', ({ type }) => {
      playSound('powerup');
    });

    socket.on('arena:match-ended', ({ winner, stats }) => {
      stopGameLoop();
      playSound('victory');
      showScreen('results');
      renderResultsTable(stats);

      if (isHost) {
        document.getElementById('btn-arena-rematch').style.display = 'block';
      } else {
        document.getElementById('btn-arena-rematch').style.display = 'none';
      }
    });

    return socket;
  }

  // Create Room
  document.getElementById('btn-create-arena-submit').addEventListener('click', () => {
    const nickname = document.getElementById('arena-create-nickname').value.trim() || 'Commander';
    const map = document.getElementById('arena-create-map').value;
    const matchType = document.getElementById('arena-create-type').value;

    const s = initSocket();
    s.emit('arena:create-room', {
      nickname,
      skin: selectedSkin,
      map,
      matchType
    });
  });

  // Join Room
  document.getElementById('btn-join-arena-submit').addEventListener('click', () => {
    const code = document.getElementById('arena-join-code').value.trim().toUpperCase();
    const nickname = document.getElementById('arena-join-nickname').value.trim() || 'Player';

    if (!code || code.length !== 6) {
      showToast('Enter 6-character room code');
      return;
    }

    const s = initSocket();
    s.emit('arena:join-room', {
      roomCode: code,
      nickname,
      skin: selectedSkin
    });
  });

  // Copy Lobby Code
  document.getElementById('btn-copy-arena-code').addEventListener('click', () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.roomCode);
    showToast('Arena code copied!');
  });

  // Lobby Ready / Start buttons
  document.getElementById('btn-arena-start').addEventListener('click', () => {
    if (!currentRoom || !isHost) return;
    if (socket) socket.emit('arena:start-match');
  });

  document.getElementById('btn-arena-ready').addEventListener('click', () => {
    if (socket) socket.emit('arena:toggle-ready');
  });

  // Rematch
  document.getElementById('btn-arena-rematch').addEventListener('click', () => {
    if (socket && isHost) {
      socket.emit('arena:rematch');
      showScreen('lobby');
    }
  });

  document.getElementById('btn-arena-exit-home').addEventListener('click', () => {
    stopGameLoop();
    if (socket && currentRoom) {
      socket.emit('arena:leave-room');
    }
    currentRoom = null;
    showScreen('home');
  });

  // Lobby Render
  function renderLobby(room) {
    document.getElementById('arena-lobby-code').textContent = room.roomCode;
    document.getElementById('arena-lobby-map').textContent = room.map.toUpperCase();
    document.getElementById('arena-lobby-mode').textContent = room.matchType;
    document.getElementById('arena-lobby-count').textContent = room.players.length;

    const grid = document.getElementById('arena-lobby-players-grid');
    grid.innerHTML = '';

    room.players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'lobby-player-card';
      card.innerHTML = `
        <div class="player-preview-dot" style="background:${p.skin};"></div>
        <div style="font-weight:800; font-size:0.95rem;">${escapeHtml(p.nickname)}</div>
        <div style="font-size:0.75rem; color:${p.isHost ? '#f59e0b' : (p.ready ? '#10b981' : '#94a3b8')};">
          ${p.isHost ? '👑 HOST' : (p.ready ? 'READY' : 'WAITING')}
        </div>
      `;
      grid.appendChild(card);
    });

    if (isHost) {
      document.getElementById('host-match-actions').style.display = 'block';
      document.getElementById('guest-match-actions').style.display = 'none';
    } else {
      document.getElementById('host-match-actions').style.display = 'none';
      document.getElementById('guest-match-actions').style.display = 'block';
    }
  }

  // HUD Update
  function updateHUD(state) {
    // 1. My Player Health
    const me = state.players.find(p => p.id === myId);
    if (me) {
      const hpPct = Math.max(0, (me.health / me.maxHealth) * 100);
      document.getElementById('hud-hp-bar').style.width = `${hpPct}%`;
      document.getElementById('hud-hp-text').textContent = `${Math.ceil(me.health)} / ${me.maxHealth}`;

      // Buffs
      const buffsEl = document.getElementById('hud-active-buffs');
      buffsEl.innerHTML = '';
      if (me.hasSpeed) buffsEl.innerHTML += '<span class="buff-badge" style="color:#38bdf8;">⚡ SPEED</span>';
      if (me.hasShield) buffsEl.innerHTML += '<span class="buff-badge" style="color:#06b6d4;">🛡️ SHIELD</span>';
      if (me.hasRapid) buffsEl.innerHTML += '<span class="buff-badge" style="color:#f59e0b;">🔥 RAPID</span>';
    }

    // 2. Timer
    if (state.timeLeft !== undefined) {
      const mins = Math.floor(state.timeLeft / 60);
      const secs = state.timeLeft % 60;
      document.getElementById('hud-timer').textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // 3. Mini Leaderboard
    const lbRows = document.getElementById('hud-leaderboard-rows');
    lbRows.innerHTML = '';
    const sorted = [...state.players].sort((a, b) => b.kills - a.kills);
    sorted.slice(0, 4).forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = `hud-lb-row ${p.id === myId ? 'me' : ''}`;
      row.innerHTML = `
        <span>#${idx + 1} ${escapeHtml(p.nickname)}</span>
        <span>${p.kills} 🎯</span>
      `;
      lbRows.appendChild(row);
    });
  }

  function addKillFeedMsg(killer, victim) {
    const feed = document.getElementById('hud-kill-feed');
    const msg = document.createElement('div');
    msg.className = 'kill-msg';
    msg.innerHTML = `⚔️ <strong>${escapeHtml(killer)}</strong> eliminated <strong>${escapeHtml(victim)}</strong>`;
    feed.appendChild(msg);
    setTimeout(() => msg.remove(), 4000);
  }

  // Render Final Results Table
  function renderResultsTable(stats) {
    const tbody = document.getElementById('arena-results-tbody');
    tbody.innerHTML = '';
    stats.forEach((p, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:800; color:${idx === 0 ? '#f59e0b' : '#fff'};">#${idx + 1}</td>
        <td><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${p.skin}; margin-right:6px;"></span>${escapeHtml(p.nickname)}</td>
        <td style="font-weight:700; color:#38bdf8;">${p.kills}</td>
        <td>${p.deaths || 0}</td>
        <td>${p.damageDealt}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // 60FPS Game Loop
  let lastTime = performance.now();
  function startGameLoop(onTick) {
    stopGameLoop();
    lastTime = performance.now();

    function loop(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (onTick) onTick(dt);
      engine.render();

      gameLoopId = requestAnimationFrame(loop);
    }
    gameLoopId = requestAnimationFrame(loop);
  }

  function stopGameLoop() {
    if (gameLoopId) {
      cancelAnimationFrame(gameLoopId);
      gameLoopId = null;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }
});
