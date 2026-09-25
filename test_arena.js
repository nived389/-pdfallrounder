const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

async function runArenaClashTest() {
  console.log('Testing ArenaClash multiplayer lifecycle...');

  const hostSocket = io(SERVER_URL);
  let testRoomCode = null;

  // 1. Host creates room
  await new Promise((resolve) => {
    function onConnected() {
      console.log('Host connected to server');
      hostSocket.emit('arena:create-room', {
        nickname: 'ViperHost',
        skin: '#ef4444',
        map: 'cyber',
        matchType: 'LastManStanding'
      });
    }

    if (hostSocket.connected) onConnected();
    else hostSocket.on('connect', onConnected);

    hostSocket.on('arena:room-created', ({ roomCode }) => {
      console.log('Arena room created with code:', roomCode);
      testRoomCode = roomCode;
      resolve();
    });
  });

  // 2. Guest joins room
  const guestSocket = io(SERVER_URL);
  await new Promise((resolve) => {
    function onGuestConnect() {
      console.log('Guest connected to server');
      guestSocket.emit('arena:join-room', {
        roomCode: testRoomCode,
        nickname: 'TitanGuest',
        skin: '#06b6d4'
      });
    }

    if (guestSocket.connected) onGuestConnect();
    else guestSocket.on('connect', onGuestConnect);

    guestSocket.on('arena:room-joined', ({ room }) => {
      console.log('Guest joined arena room! Total players:', room.playerCount);
      resolve();
    });
  });

  // 3. Host starts match
  await new Promise((resolve) => {
    hostSocket.emit('arena:start-match');
    console.log('Host emitted arena:start-match');

    guestSocket.on('arena:match-started', ({ room, obstacles }) => {
      console.log(`Arena match started! Map: ${room.map}, Obstacles count: ${obstacles.length}`);
      resolve();
    });
  });

  // 4. Send movement & shooting inputs
  await new Promise((resolve) => {
    hostSocket.emit('arena:player-input', {
      up: true,
      down: false,
      left: false,
      right: true,
      shoot: true,
      aimAngle: 0.5
    });

    guestSocket.emit('arena:player-input', {
      up: false,
      down: true,
      left: true,
      right: false,
      shoot: false,
      aimAngle: -1.2
    });

    // Wait for state-update verifying simulation
    guestSocket.on('arena:state-update', (state) => {
      console.log(`Received state-update at tick: ${state.time}`);
      console.log(`Players in arena: ${state.players.length}, Active Bullets: ${state.bullets.length}`);
      resolve();
    });
  });

  console.log('ArenaClash test passed successfully! Closing sockets.');
  hostSocket.disconnect();
  guestSocket.disconnect();
  process.exit(0);
}

runArenaClashTest().catch(err => {
  console.error('ArenaClash test failed:', err);
  process.exit(1);
});
