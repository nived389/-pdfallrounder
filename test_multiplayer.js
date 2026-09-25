const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

async function runMultiplayerTest() {
  console.log('Testing multiplayer flow...');

  const hostSocket = io(SERVER_URL);
  let testRoomCode = null;

  await new Promise((resolve) => {
    function onConnected() {
      console.log('Host connected to server');
      hostSocket.emit('create-room', {
        nickname: 'AliceHost',
        avatar: '🦊',
        category: 'general',
        questionCount: 3
      });
    }

    if (hostSocket.connected) {
      onConnected();
    } else {
      hostSocket.on('connect', onConnected);
    }

    hostSocket.on('room-created', ({ roomCode }) => {
      console.log('Room created with code:', roomCode);
      testRoomCode = roomCode;
      resolve();
    });
  });

  const guestSocket = io(SERVER_URL);

  await new Promise((resolve) => {
    function onGuestConnect() {
      console.log('Guest connected to server');
      guestSocket.emit('join-room', {
        roomCode: testRoomCode,
        nickname: 'BobGuest',
        avatar: '🐼'
      });
    }

    if (guestSocket.connected) {
      onGuestConnect();
    } else {
      guestSocket.on('connect', onGuestConnect);
    }

    guestSocket.on('room-joined', ({ room }) => {
      console.log('Guest joined successfully. Player count:', room.players.length);
      resolve();
    });
  });

  // Host starts game
  await new Promise((resolve) => {
    hostSocket.emit('start-game', { roomCode: testRoomCode });
    console.log('Host clicked start game');

    guestSocket.on('game-starting', ({ countdownSeconds }) => {
      console.log(`Received game-starting event with ${countdownSeconds}s countdown`);
    });

    guestSocket.on('question-start', ({ question }) => {
      console.log(`Question received: "${question.text}" (Correct index hidden: ${question.correctIndex === undefined})`);
      resolve();
    });
  });

  // Both submit an answer
  await new Promise((resolve) => {
    hostSocket.emit('submit-answer', { roomCode: testRoomCode, answerIndex: 1 });
    guestSocket.emit('submit-answer', { roomCode: testRoomCode, answerIndex: 2 });

    hostSocket.on('question-end', ({ leaderboard, correctOption }) => {
      console.log('Question concluded! Correct option:', correctOption);
      console.log('Round Leaderboard:', leaderboard.map(p => `${p.nickname}: ${p.score}pts`));
      resolve();
    });
  });

  console.log('Multiplayer test passed successfully! Closing test sockets.');
  hostSocket.disconnect();
  guestSocket.disconnect();
  process.exit(0);
}

runMultiplayerTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
