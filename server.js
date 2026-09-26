const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const ArenaEngine = require('./server/arena');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const arenaEngine = new ArenaEngine(io);

const JobQueue = require('./server/services/jobQueue');
const createConverterRoutes = require('./server/routes/converterApi');

const jobQueue = new JobQueue(io);
const converterRoutes = createConverterRoutes(io, jobQueue);

const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ extended: true, limit: '1000mb' }));
app.use('/api', converterRoutes);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/arena', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'arena.html'));
});

app.get('/quiz', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'quiz.html'));
});

// Load question bank
const questionsPath = path.join(__dirname, 'data', 'questions.json');
let questionBank = {};
try {
  const data = fs.readFileSync(questionsPath, 'utf8');
  questionBank = JSON.parse(data);
  console.log('Question bank loaded successfully.');
} catch (err) {
  console.error('Error loading questions.json:', err);
}

// Utility: get combined or categorized questions
function getQuestions(category = 'all', count = 10) {
  let pool = [];
  if (category === 'all' || !questionBank[category]) {
    for (const key of Object.keys(questionBank)) {
      pool = pool.concat(questionBank[key]);
    }
  } else {
    pool = [...questionBank[category]];
  }

  // Shuffle pool (Fisher-Yates)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, Math.min(count, pool.length));
}

// REST API for categories
app.get('/api/categories', (req, res) => {
  const categories = [
    { id: 'all', name: 'All Categories (Mixed)', count: Object.values(questionBank).flat().length },
    { id: 'general', name: 'General Knowledge', count: (questionBank.general || []).length },
    { id: 'science_tech', name: 'Science & Tech', count: (questionBank.science_tech || []).length },
    { id: 'pop_culture', name: 'Pop Culture & Movies', count: (questionBank.pop_culture || []).length },
    { id: 'sports', name: 'Sports', count: (questionBank.sports || []).length },
    { id: 'geography_history', name: 'History & Geography', count: (questionBank.geography_history || []).length }
  ];
  res.json(categories);
});

// REST API for solo practice mode
app.get('/api/questions', (req, res) => {
  const category = req.query.category || 'all';
  const count = parseInt(req.query.count, 10) || 5;
  const questions = getQuestions(category, count);
  res.json(questions);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// In-memory rooms store
const rooms = new Map();

// Helper to generate 6-character room codes (avoid ambiguous chars like O, 0, I, 1)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// Helper to get sanitized room object for clients
function getSanitizedRoom(room) {
  return {
    roomCode: room.roomCode,
    hostId: room.hostId,
    category: room.category,
    questionCount: room.questionCount,
    currentQuestionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    status: room.status,
    players: room.players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak,
      isHost: p.id === room.hostId,
      hasAnswered: p.hasAnswered
    }))
  };
}

// Question advancement handler
function sendNextQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.currentQuestionIndex++;

  if (room.currentQuestionIndex >= room.questions.length) {
    // Game is finished
    endGame(roomCode);
    return;
  }

  const currentQ = room.questions[room.currentQuestionIndex];
  room.status = 'in-progress';
  room.questionStartTime = Date.now();
  room.timeLimit = currentQ.timeLimit || 15;
  room.answeredCount = 0;

  // Reset answer states for players
  room.players.forEach(p => {
    p.hasAnswered = false;
    p.lastAnswer = null;
  });

  // Strip correctIndex to prevent client-side inspection/cheating
  const clientQuestion = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    category: currentQ.category,
    text: currentQ.text,
    options: currentQ.options,
    timeLimit: room.timeLimit
  };

  io.to(roomCode).emit('question-start', {
    question: clientQuestion,
    room: getSanitizedRoom(room)
  });

  // Set timeout for question expiration
  if (room.questionTimeout) clearTimeout(room.questionTimeout);
  room.questionTimeout = setTimeout(() => {
    endQuestion(roomCode);
  }, (room.timeLimit * 1000) + 500);
}

// End current question and show round leaderboard
function endQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'in-progress') return;

  if (room.questionTimeout) {
    clearTimeout(room.questionTimeout);
    room.questionTimeout = null;
  }

  room.status = 'question-end';
  const currentQ = room.questions[room.currentQuestionIndex];

  // Distribution of option choices
  const optionCounts = [0, 0, 0, 0];
  const playerResults = [];

  room.players.forEach(p => {
    if (p.lastAnswer && p.lastAnswer.answerIndex !== null && p.lastAnswer.answerIndex !== undefined) {
      if (optionCounts[p.lastAnswer.answerIndex] !== undefined) {
        optionCounts[p.lastAnswer.answerIndex]++;
      }
    }
    playerResults.push({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      pointsAwarded: p.lastAnswer ? p.lastAnswer.points : 0,
      isCorrect: p.lastAnswer ? p.lastAnswer.isCorrect : false,
      streak: p.streak
    });
  });

  // Sort leaderboard descending by score
  const leaderboard = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      pointsAwarded: p.lastAnswer ? p.lastAnswer.points : 0,
      isCorrect: p.lastAnswer ? p.lastAnswer.isCorrect : false,
      streak: p.streak
    }));

  io.to(roomCode).emit('question-end', {
    correctIndex: currentQ.correctIndex,
    correctOption: currentQ.options[currentQ.correctIndex],
    optionCounts,
    leaderboard,
    playerResults,
    isLastQuestion: room.currentQuestionIndex >= room.questions.length - 1
  });
}

// End entire game and emit podium rankings
function endGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.questionTimeout) clearTimeout(room.questionTimeout);

  room.status = 'finished';

  const finalRankings = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map((p, index) => ({
      rank: index + 1,
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak
    }));

  io.to(roomCode).emit('game-ended', {
    rankings: finalRankings,
    podium: {
      first: finalRankings[0] || null,
      second: finalRankings[1] || null,
      third: finalRankings[2] || null
    }
  });
}

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create Room
  socket.on('create-room', ({ nickname, avatar, category, questionCount }) => {
    try {
      const roomCode = generateRoomCode();
      const count = Math.min(Math.max(parseInt(questionCount, 10) || 5, 3), 20);
      const cat = category || 'all';

      const hostPlayer = {
        id: socket.id,
        nickname: (nickname || 'Host').trim().substring(0, 16),
        avatar: avatar || '🦊',
        score: 0,
        streak: 0,
        hasAnswered: false,
        lastAnswer: null
      };

      const room = {
        roomCode,
        hostId: socket.id,
        category: cat,
        questionCount: count,
        questions: [],
        currentQuestionIndex: -1,
        questionStartTime: 0,
        timeLimit: 15,
        questionTimeout: null,
        players: [hostPlayer],
        status: 'lobby',
        answeredCount: 0
      };

      rooms.set(roomCode, room);
      socket.join(roomCode);
      socket.roomCode = roomCode;

      socket.emit('room-created', {
        roomCode,
        room: getSanitizedRoom(room),
        isHost: true
      });
      console.log(`Room created: ${roomCode} by ${hostPlayer.nickname}`);
    } catch (err) {
      console.error('Error creating room:', err);
      socket.emit('error-message', 'Failed to create room. Please try again.');
    }
  });

  // Join Room
  socket.on('join-room', ({ roomCode, nickname, avatar }) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        return socket.emit('error-message', 'Room not found! Please check the code.');
      }

      if (room.status !== 'lobby') {
        return socket.emit('error-message', 'This game has already started or finished.');
      }

      if (room.players.length >= 8) {
        return socket.emit('error-message', 'This room is full (maximum 8 players).');
      }

      const player = {
        id: socket.id,
        nickname: (nickname || `Player ${room.players.length + 1}`).trim().substring(0, 16),
        avatar: avatar || '🐱',
        score: 0,
        streak: 0,
        hasAnswered: false,
        lastAnswer: null
      };

      room.players.push(player);
      socket.join(code);
      socket.roomCode = code;

      socket.emit('room-joined', {
        roomCode: code,
        room: getSanitizedRoom(room),
        isHost: socket.id === room.hostId
      });

      // Broadcast update to all other players in room
      socket.to(code).emit('player-joined', {
        player,
        room: getSanitizedRoom(room)
      });

      console.log(`Player ${player.nickname} joined room ${code}`);
    } catch (err) {
      console.error('Error joining room:', err);
      socket.emit('error-message', 'Failed to join room.');
    }
  });

  // Host starts the game
  socket.on('start-game', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (socket.id !== room.hostId) {
      return socket.emit('error-message', 'Only the host can start the game.');
    }

    if (room.players.length < 1) {
      return socket.emit('error-message', 'Need at least 1 player to start.');
    }

    // Select questions
    room.questions = getQuestions(room.category, room.questionCount);
    if (room.questions.length === 0) {
      return socket.emit('error-message', 'No questions available for this category.');
    }

    room.status = 'countdown';
    room.currentQuestionIndex = -1;
    room.players.forEach(p => {
      p.score = 0;
      p.streak = 0;
      p.hasAnswered = false;
      p.lastAnswer = null;
    });

    // Notify room of game start countdown
    io.to(roomCode).emit('game-starting', {
      countdownSeconds: 3,
      totalQuestions: room.questions.length
    });

    // After 3-second countdown, launch question 1
    setTimeout(() => {
      sendNextQuestion(roomCode);
    }, 3200);
  });

  // Submit Answer
  socket.on('submit-answer', ({ roomCode, answerIndex }) => {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'in-progress') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hasAnswered) return;

    const currentQ = room.questions[room.currentQuestionIndex];
    if (!currentQ) return;

    const timeTakenMs = Math.min(Date.now() - room.questionStartTime, room.timeLimit * 1000);
    const timeRemainingSec = Math.max(0, (room.timeLimit * 1000 - timeTakenMs) / 1000);
    const fraction = timeRemainingSec / room.timeLimit;

    const isCorrect = (answerIndex === currentQ.correctIndex);
    let points = 0;

    if (isCorrect) {
      // Points: base 500 + up to 500 based on speed + streak bonus
      points = Math.round(500 + (500 * fraction));
      player.streak = (player.streak || 0) + 1;
      if (player.streak >= 2) {
        points += 100 * Math.min(player.streak, 5); // streak bonus capped at +500
      }
      player.score += points;
    } else {
      player.streak = 0;
    }

    player.hasAnswered = true;
    player.lastAnswer = {
      answerIndex,
      isCorrect,
      points,
      timeTakenMs
    };

    room.answeredCount = room.players.filter(p => p.hasAnswered).length;

    // Confirm to this player
    socket.emit('answer-confirmed', {
      answerIndex,
      isCorrect,
      points,
      totalScore: player.score,
      streak: player.streak
    });

    // Notify room of answer count progress
    io.to(roomCode).emit('player-answered-update', {
      answeredCount: room.answeredCount,
      totalPlayers: room.players.length
    });

    // If all players have answered, conclude round early
    if (room.answeredCount >= room.players.length) {
      endQuestion(roomCode);
    }
  });

  // Host advances to next question manually or from leaderboard
  socket.on('next-question', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;
    if (room.status !== 'question-end') return;

    sendNextQuestion(roomCode);
  });

  // Play Again (same room)
  socket.on('play-again', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;

    room.status = 'lobby';
    room.currentQuestionIndex = -1;
    room.questions = [];
    room.players.forEach(p => {
      p.score = 0;
      p.streak = 0;
      p.hasAnswered = false;
      p.lastAnswer = null;
    });

    io.to(roomCode).emit('room-reset', {
      room: getSanitizedRoom(room)
    });
  });

  // Player leaves room explicitly
  socket.on('leave-room', () => {
    handlePlayerDisconnect(socket);
  });

  // ==========================================
  // ARENACLASH SOCKET EVENTS
  // ==========================================
  socket.on('arena:create-room', (data) => {
    arenaEngine.createRoom({ socket, ...data });
  });

  socket.on('arena:join-room', (data) => {
    arenaEngine.joinRoom({ socket, ...data });
  });

  socket.on('arena:toggle-ready', () => {
    arenaEngine.toggleReady(socket);
  });

  socket.on('arena:start-match', () => {
    arenaEngine.startMatch(socket);
  });

  socket.on('arena:player-input', (input) => {
    arenaEngine.handlePlayerInput(socket, input);
  });

  socket.on('arena:rematch', () => {
    arenaEngine.resetRoom(socket);
  });

  socket.on('arena:leave-room', () => {
    arenaEngine.handleDisconnect(socket);
  });

  // Disconnection
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    handlePlayerDisconnect(socket);
    arenaEngine.handleDisconnect(socket);
  });
});

function handlePlayerDisconnect(socket) {
  const roomCode = socket.roomCode;
  if (!roomCode || !rooms.has(roomCode)) return;

  const room = rooms.get(roomCode);
  const playerIndex = room.players.findIndex(p => p.id === socket.id);

  if (playerIndex !== -1) {
    const departingPlayer = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    socket.leave(roomCode);
    socket.roomCode = null;

    console.log(`Player ${departingPlayer.nickname} left room ${roomCode}`);

    if (room.players.length === 0) {
      if (room.questionTimeout) clearTimeout(room.questionTimeout);
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} deleted (empty)`);
      return;
    }

    // If host left, transfer host to next player
    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
      io.to(roomCode).emit('host-transferred', {
        newHostId: room.hostId,
        newHostNickname: room.players[0].nickname
      });
    }

    io.to(roomCode).emit('player-left', {
      playerId: socket.id,
      playerNickname: departingPlayer.nickname,
      room: getSanitizedRoom(room)
    });

    // Check if in progress and all remaining players have answered
    if (room.status === 'in-progress') {
      const answered = room.players.filter(p => p.hasAnswered).length;
      if (answered >= room.players.length) {
        endQuestion(roomCode);
      }
    }
  }
}

server.listen(PORT, () => {
  console.log(`🚀 DocuVex Pro Suite (by NxD) running on http://localhost:${PORT}`);
  console.log(`📁 API endpoints mounted at http://localhost:${PORT}/api`);
  console.log(`⚔️ Arcade Arena: http://localhost:${PORT}/arena | ⚡ QuizRoom: http://localhost:${PORT}/quiz`);
});
