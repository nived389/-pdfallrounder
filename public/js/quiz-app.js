// QuizRoom Main Application Logic
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const screens = {
    home: document.getElementById('screen-home'),
    soloSetup: document.getElementById('screen-solo-setup'),
    createRoom: document.getElementById('screen-create-room'),
    joinRoom: document.getElementById('screen-join-room'),
    lobby: document.getElementById('screen-lobby'),
    countdown: document.getElementById('screen-countdown'),
    gameplay: document.getElementById('screen-gameplay'),
    roundLeaderboard: document.getElementById('screen-round-leaderboard'),
    gameOver: document.getElementById('screen-game-over'),
    soloResults: document.getElementById('screen-solo-results')
  };

  // Header Elements
  const brandLogo = document.getElementById('brand-logo');
  const btnAudioToggle = document.getElementById('btn-audio-toggle');
  const btnHowToPlay = document.getElementById('btn-how-to-play');
  const btnLeaveRoom = document.getElementById('btn-leave-room');
  const howToPlayModal = document.getElementById('how-to-play-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const toastContainer = document.getElementById('toast-container');

  // Solo Setup Elements
  const cardSolo = document.getElementById('card-solo');
  const soloBack = document.getElementById('solo-back');
  const btnStartSolo = document.getElementById('btn-start-solo');
  const soloCategorySelect = document.getElementById('solo-category');
  const soloCountSelect = document.getElementById('solo-count');

  // Create Room Elements
  const cardCreate = document.getElementById('card-create');
  const createBack = document.getElementById('create-back');
  const createNicknameInput = document.getElementById('create-nickname');
  const createAvatarPicker = document.getElementById('create-avatar-picker');
  const createCategorySelect = document.getElementById('create-category');
  const createCountSelect = document.getElementById('create-count');
  const btnCreateSubmit = document.getElementById('btn-create-submit');

  // Join Room Elements
  const cardJoin = document.getElementById('card-join');
  const joinBack = document.getElementById('join-back');
  const joinCodeInput = document.getElementById('join-code');
  const joinNicknameInput = document.getElementById('join-nickname');
  const joinAvatarPicker = document.getElementById('join-avatar-picker');
  const btnJoinSubmit = document.getElementById('btn-join-submit');

  // Lobby Elements
  const lobbyRoomCode = document.getElementById('lobby-room-code');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const lobbyCategoryName = document.getElementById('lobby-category-name');
  const lobbyQCount = document.getElementById('lobby-q-count');
  const lobbyPlayerCount = document.getElementById('lobby-player-count');
  const lobbyPlayersGrid = document.getElementById('lobby-players-grid');
  const hostControls = document.getElementById('host-controls');
  const guestControls = document.getElementById('guest-controls');
  const btnStartGame = document.getElementById('btn-start-game');

  // Gameplay Elements
  const gameCategoryTag = document.getElementById('game-category-tag');
  const gameProgressText = document.getElementById('game-progress-text');
  const timerCircleProgress = document.getElementById('timer-progress');
  const timerCount = document.getElementById('timer-count');
  const playerLiveScore = document.getElementById('player-live-score');
  const streakIndicator = document.getElementById('streak-indicator');
  const streakCount = document.getElementById('streak-count');
  const gameQuestionText = document.getElementById('game-question-text');
  const gameAnswerStatus = document.getElementById('game-answer-status');
  const answersGrid = document.getElementById('answers-grid');
  const answerBtns = Array.from(document.querySelectorAll('.answer-btn'));
  const feedbackBanner = document.getElementById('feedback-banner');
  const feedbackMsg = document.getElementById('feedback-msg');

  // Round Leaderboard Elements
  const roundCorrectAnswer = document.getElementById('round-correct-answer');
  const roundLeaderboardList = document.getElementById('round-leaderboard-list');
  const btnNextQuestion = document.getElementById('btn-next-question');
  const roundAutoAdvance = document.getElementById('round-auto-advance');
  const intermissionCountdown = document.getElementById('intermission-countdown');

  // Game Over Elements
  const podiumFirst = document.getElementById('podium-first');
  const podiumSecond = document.getElementById('podium-second');
  const podiumThird = document.getElementById('podium-third');
  const finalLeaderboardList = document.getElementById('final-leaderboard-list');
  const btnPlayAgain = document.getElementById('btn-play-again');
  const btnFinalHome = document.getElementById('btn-final-home');

  // Solo Results Elements
  const soloResultIcon = document.getElementById('solo-result-icon');
  const soloResultHeading = document.getElementById('solo-result-heading');
  const soloFinalScore = document.getElementById('solo-final-score');
  const soloFinalAccuracy = document.getElementById('solo-final-accuracy');
  const soloBestStreak = document.getElementById('solo-best-streak');
  const btnSoloRetry = document.getElementById('btn-solo-retry');
  const btnSoloHome = document.getElementById('btn-solo-home');

  // State
  let currentMode = null; // 'solo' | 'multiplayer'
  let socket = null;
  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let selectedAvatar = '🦊';
  let myScore = 0;
  let myStreak = 0;
  let timerInterval = null;
  let intermissionInterval = null;

  // Solo State
  let soloQuestions = [];
  let soloIndex = 0;
  let soloCorrectAnswers = 0;
  let soloBestStreakCount = 0;
  let soloQuestionStartTime = 0;
  let soloHasAnswered = false;

  // Audio mute icon setup
  function updateAudioButton() {
    if (window.soundFX) {
      btnAudioToggle.textContent = window.soundFX.isMuted() ? '🔇' : '🔊';
    }
  }
  updateAudioButton();

  btnAudioToggle.addEventListener('click', () => {
    if (window.soundFX) {
      const muted = window.soundFX.toggleMute();
      btnAudioToggle.textContent = muted ? '🔇' : '🔊';
      showToast(muted ? 'Sound muted' : 'Sound unmuted');
    }
  });

  // Modal handlers
  btnHowToPlay.addEventListener('click', () => {
    howToPlayModal.classList.add('open');
  });
  btnCloseModal.addEventListener('click', () => {
    howToPlayModal.classList.remove('open');
  });
  howToPlayModal.addEventListener('click', (e) => {
    if (e.target === howToPlayModal) howToPlayModal.classList.remove('open');
  });

  // Toast notification helper
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 3000);
  }

  // Navigation Router
  function showScreen(screenKey) {
    Object.values(screens).forEach(screen => {
      if (screen) screen.classList.remove('active');
    });
    if (screens[screenKey]) {
      screens[screenKey].classList.add('active');
    }

    // Header leave button visibility
    if (screenKey === 'lobby' || screenKey === 'gameplay' || screenKey === 'roundLeaderboard') {
      btnLeaveRoom.style.display = 'flex';
    } else {
      btnLeaveRoom.style.display = 'none';
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Brand logo click
  brandLogo.addEventListener('click', () => {
    if (currentMode === 'multiplayer' && currentRoom) {
      if (confirm('Leave current multiplayer room and go to Home?')) {
        leaveCurrentGame();
        showScreen('home');
      }
    } else {
      leaveCurrentGame();
      showScreen('home');
    }
  });

  // Leave room button
  btnLeaveRoom.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave this game?')) {
      leaveCurrentGame();
      showScreen('home');
    }
  });

  function leaveCurrentGame() {
    stopConfetti();
    if (timerInterval) clearInterval(timerInterval);
    if (intermissionInterval) clearInterval(intermissionInterval);

    if (socket && currentRoom) {
      socket.emit('leave-room');
    }
    currentRoom = null;
    isHost = false;
    currentMode = null;
  }

  // Avatar Picker Setup
  function setupAvatarPicker(container, onSelect) {
    const opts = container.querySelectorAll('.avatar-opt');
    opts.forEach(opt => {
      opt.addEventListener('click', () => {
        opts.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        const avatar = opt.dataset.avatar;
        onSelect(avatar);
      });
    });
  }

  setupAvatarPicker(createAvatarPicker, (avatar) => {
    selectedAvatar = avatar;
  });
  setupAvatarPicker(joinAvatarPicker, (avatar) => {
    selectedAvatar = avatar;
  });

  // Home Screen Navigations
  cardSolo.addEventListener('click', () => {
    currentMode = 'solo';
    showScreen('soloSetup');
  });
  soloBack.addEventListener('click', () => showScreen('home'));

  cardCreate.addEventListener('click', () => {
    currentMode = 'multiplayer';
    showScreen('createRoom');
  });
  createBack.addEventListener('click', () => showScreen('home'));

  cardJoin.addEventListener('click', () => {
    currentMode = 'multiplayer';
    showScreen('joinRoom');
  });
  joinBack.addEventListener('click', () => showScreen('home'));

  // Auto-fill room code from URL parameters if available (e.g. ?room=AB12CD)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    joinCodeInput.value = roomParam.toUpperCase().substring(0, 6);
    showScreen('joinRoom');
  }

  // Socket.IO Setup
  function initSocket() {
    if (socket) return socket;
    socket = io();

    socket.on('connect', () => {
      myPlayerId = socket.id;
      console.log('Connected to QuizRoom server with socket ID:', myPlayerId);
    });

    socket.on('error-message', (msg) => {
      showToast(msg);
    });

    socket.on('room-created', ({ roomCode, room, isHost: hostStatus }) => {
      currentRoom = room;
      isHost = hostStatus;
      renderLobby(room);
      showScreen('lobby');
      showToast(`Room created! Code: ${roomCode}`);
    });

    socket.on('room-joined', ({ roomCode, room, isHost: hostStatus }) => {
      currentRoom = room;
      isHost = hostStatus;
      renderLobby(room);
      showScreen('lobby');
      showToast(`Joined room ${roomCode}!`);
    });

    socket.on('player-joined', ({ player, room }) => {
      currentRoom = room;
      renderLobby(room);
      if (window.soundFX) window.soundFX.playJoin();
      showToast(`${player.nickname} joined the room!`);
    });

    socket.on('player-left', ({ playerNickname, room }) => {
      currentRoom = room;
      renderLobby(room);
      showToast(`${playerNickname} left the room.`);
    });

    socket.on('host-transferred', ({ newHostId, newHostNickname }) => {
      if (myPlayerId === newHostId) {
        isHost = true;
        showToast('You are now the room host!');
      } else {
        showToast(`${newHostNickname} is now the host.`);
      }
      if (currentRoom) {
        currentRoom.hostId = newHostId;
        renderLobby(currentRoom);
      }
    });

    socket.on('game-starting', ({ countdownSeconds }) => {
      startCountdown(countdownSeconds);
    });

    socket.on('question-start', ({ question, room }) => {
      currentRoom = room;
      renderMultiplayerQuestion(question);
    });

    socket.on('player-answered-update', ({ answeredCount, totalPlayers }) => {
      gameAnswerStatus.textContent = `${answeredCount} of ${totalPlayers} players have locked in!`;
    });

    socket.on('answer-confirmed', ({ isCorrect, points, totalScore, streak }) => {
      myScore = totalScore;
      myStreak = streak;
      playerLiveScore.textContent = myScore;
      updateStreakDisplay(myStreak);

      gameAnswerStatus.textContent = isCorrect 
        ? `Locked in! Correct! (+${points} pts)` 
        : `Locked in! Keep going!`;
    });

    socket.on('question-end', (data) => {
      handleMultiplayerQuestionEnd(data);
    });

    socket.on('game-ended', ({ rankings, podium }) => {
      handleMultiplayerGameOver(rankings, podium);
    });

    socket.on('room-reset', ({ room }) => {
      currentRoom = room;
      myScore = 0;
      myStreak = 0;
      renderLobby(room);
      showScreen('lobby');
      showToast('New game round started! Waiting for players.');
    });

    return socket;
  }

  // Create Room Submission
  btnCreateSubmit.addEventListener('click', () => {
    const nickname = createNicknameInput.value.trim() || 'Host';
    const category = createCategorySelect.value;
    const questionCount = parseInt(createCountSelect.value, 10) || 5;

    const s = initSocket();
    s.emit('create-room', {
      nickname,
      avatar: selectedAvatar,
      category,
      questionCount
    });
  });

  // Join Room Submission
  btnJoinSubmit.addEventListener('click', () => {
    const code = joinCodeInput.value.trim().toUpperCase();
    const nickname = joinNicknameInput.value.trim() || 'Player';

    if (!code || code.length !== 6) {
      showToast('Please enter a valid 6-character room code');
      return;
    }

    const s = initSocket();
    s.emit('join-room', {
      roomCode: code,
      nickname,
      avatar: selectedAvatar
    });
  });

  // Copy buttons in Lobby
  btnCopyCode.addEventListener('click', () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.roomCode);
    showToast('Room code copied to clipboard!');
  });

  btnCopyLink.addEventListener('click', () => {
    if (!currentRoom) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoom.roomCode}`;
    navigator.clipboard.writeText(shareUrl);
    showToast('Direct invite link copied!');
  });

  // Start Game Button (Host only)
  btnStartGame.addEventListener('click', () => {
    if (!currentRoom || !isHost) return;
    if (socket) {
      socket.emit('start-game', { roomCode: currentRoom.roomCode });
    }
  });

  // Render Lobby State
  function renderLobby(room) {
    lobbyRoomCode.textContent = room.roomCode;
    lobbyCategoryName.textContent = formatCategoryName(room.category);
    lobbyQCount.textContent = room.questionCount;
    lobbyPlayerCount.textContent = room.players.length;

    lobbyPlayersGrid.innerHTML = '';
    room.players.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      chip.innerHTML = `
        ${p.isHost ? '<span class="player-host-tag" title="Host">👑</span>' : ''}
        <div class="player-avatar">${p.avatar || '🦊'}</div>
        <div class="player-name">${escapeHtml(p.nickname)}</div>
      `;
      lobbyPlayersGrid.appendChild(chip);
    });

    if (isHost) {
      hostControls.style.display = 'block';
      guestControls.style.display = 'none';
    } else {
      hostControls.style.display = 'none';
      guestControls.style.display = 'block';
    }
  }

  // Pre-game Countdown
  function startCountdown(seconds = 3) {
    showScreen('countdown');
    const countdownNum = document.getElementById('countdown-num');
    let count = seconds;
    countdownNum.textContent = count;
    if (window.soundFX) window.soundFX.playStart();

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        countdownNum.textContent = count;
        if (window.soundFX) window.soundFX.playTick();
      } else {
        clearInterval(interval);
        countdownNum.textContent = 'GO!';
      }
    }, 1000);
  }

  // Circular Timer Animator
  const fullDashArray = 200; // circumference ~ 2 * pi * 32
  function updateTimerCircle(remainingSec, totalSec) {
    const fraction = Math.max(0, remainingSec / totalSec);
    const dashoffset = fullDashArray * (1 - fraction);
    timerCircleProgress.style.strokeDashoffset = dashoffset;

    // Shift color from emerald -> amber -> red
    if (fraction > 0.5) {
      timerCircleProgress.style.stroke = 'var(--option-green)';
    } else if (fraction > 0.25) {
      timerCircleProgress.style.stroke = 'var(--option-yellow)';
    } else {
      timerCircleProgress.style.stroke = 'var(--option-red)';
    }
    timerCount.textContent = Math.ceil(remainingSec);
  }

  function updateStreakDisplay(streak) {
    if (streak >= 2) {
      streakIndicator.style.display = 'inline-flex';
      streakCount.textContent = streak;
    } else {
      streakIndicator.style.display = 'none';
    }
  }

  // Render Multiplayer Question
  function renderMultiplayerQuestion(q) {
    showScreen('gameplay');
    feedbackBanner.className = 'feedback-banner';
    feedbackBanner.style.display = 'none';
    gameAnswerStatus.textContent = 'Select your answer before the timer runs out!';

    gameCategoryTag.textContent = q.category;
    gameProgressText.textContent = `Q ${q.questionIndex + 1} of ${q.totalQuestions}`;
    gameQuestionText.textContent = q.text;

    answerBtns.forEach((btn, idx) => {
      btn.className = `answer-btn btn-option-${idx}`;
      btn.disabled = false;
      const optText = document.getElementById(`opt-text-${idx}`);
      if (optText) optText.textContent = q.options[idx];

      btn.onclick = () => {
        if (btn.disabled) return;
        // Lock all buttons
        answerBtns.forEach(b => {
          b.disabled = true;
          b.classList.remove('selected-locked');
        });
        btn.classList.add('selected-locked');

        if (socket && currentRoom) {
          socket.emit('submit-answer', {
            roomCode: currentRoom.roomCode,
            answerIndex: idx
          });
        }
      };
    });

    // Run timer
    const totalSec = q.timeLimit || 15;
    let remainingSec = totalSec;
    updateTimerCircle(remainingSec, totalSec);

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      remainingSec -= 0.1;
      updateTimerCircle(remainingSec, totalSec);

      // Sound ticks
      if (Math.abs(remainingSec - Math.round(remainingSec)) < 0.05 && remainingSec > 0) {
        if (remainingSec <= 3) {
          if (window.soundFX) window.soundFX.playUrgentTick();
        } else {
          if (window.soundFX) window.soundFX.playTick();
        }
      }

      if (remainingSec <= 0) {
        clearInterval(timerInterval);
        answerBtns.forEach(b => b.disabled = true);
        gameAnswerStatus.textContent = "Time's up! Calculating results...";
      }
    }, 100);
  }

  // Handle Question End & Leaderboard
  function handleMultiplayerQuestionEnd({ correctIndex, correctOption, leaderboard, isLastQuestion }) {
    if (timerInterval) clearInterval(timerInterval);

    // Reveal correct answer on gameplay grid
    answerBtns.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === correctIndex) {
        btn.classList.add('correct-reveal');
      } else {
        btn.classList.add('wrong-reveal');
      }
    });

    const myResult = leaderboard.find(p => p.id === myPlayerId);
    if (myResult) {
      if (myResult.isCorrect) {
        feedbackBanner.className = 'feedback-banner correct show';
        feedbackMsg.textContent = `Correct! +${myResult.pointsAwarded} pts 🎉`;
        if (window.soundFX) window.soundFX.playCorrect();
      } else {
        feedbackBanner.className = 'feedback-banner wrong show';
        feedbackMsg.textContent = `Wrong! The correct answer was: ${correctOption}`;
        if (window.soundFX) window.soundFX.playWrong();
      }
    }

    // Transition to Round Leaderboard after 2.5 seconds
    setTimeout(() => {
      showScreen('roundLeaderboard');
      roundCorrectAnswer.innerHTML = `Correct Answer: <strong style="color: #34d399;">${escapeHtml(correctOption)}</strong>`;
      
      // Render Leaderboard list
      roundLeaderboardList.innerHTML = '';
      leaderboard.forEach(p => {
        const row = document.createElement('div');
        row.className = `leaderboard-row ${p.id === myPlayerId ? 'current-player' : ''}`;
        row.innerHTML = `
          <div class="row-left">
            <span class="row-rank ${p.rank <= 3 ? 'top-' + p.rank : ''}">#${p.rank}</span>
            <div class="row-player">
              <span>${p.avatar || '🦊'}</span>
              <span>${escapeHtml(p.nickname)}</span>
              ${p.streak >= 2 ? `<span style="font-size:0.85rem; color:#f59e0b;">🔥${p.streak}</span>` : ''}
            </div>
          </div>
          <div class="row-right">
            ${p.pointsAwarded > 0 ? `<span class="row-delta">+${p.pointsAwarded}</span>` : ''}
            <span class="row-score">${p.score} pts</span>
          </div>
        `;
        roundLeaderboardList.appendChild(row);
      });

      // Advance control
      if (isHost) {
        btnNextQuestion.style.display = 'block';
        btnNextQuestion.textContent = isLastQuestion ? 'View Final Results 🏆' : 'Next Question ➔';
        btnNextQuestion.onclick = () => {
          if (intermissionInterval) clearInterval(intermissionInterval);
          if (socket && currentRoom) {
            socket.emit('next-question', { roomCode: currentRoom.roomCode });
          }
        };
      } else {
        btnNextQuestion.style.display = 'none';
      }

      // Auto countdown advance
      let countdown = 5;
      intermissionCountdown.textContent = countdown;
      roundAutoAdvance.style.display = 'block';

      if (intermissionInterval) clearInterval(intermissionInterval);
      intermissionInterval = setInterval(() => {
        countdown--;
        intermissionCountdown.textContent = countdown;
        if (countdown <= 0) {
          clearInterval(intermissionInterval);
          if (isHost && socket && currentRoom) {
            socket.emit('next-question', { roomCode: currentRoom.roomCode });
          }
        }
      }, 1000);

    }, 2400);
  }

  // Handle Game Over & Podium
  function handleMultiplayerGameOver(rankings, podium) {
    if (intermissionInterval) clearInterval(intermissionInterval);
    showScreen('gameOver');

    if (window.soundFX) window.soundFX.playFanfare();
    startConfetti();

    // 1st place
    if (podium.first) {
      podiumFirst.querySelector('.podium-avatar').textContent = podium.first.avatar || '🥇';
      podiumFirst.querySelector('.podium-name').textContent = podium.first.nickname;
      podiumFirst.querySelector('.podium-score').textContent = `${podium.first.score} pts`;
      podiumFirst.style.visibility = 'visible';
    } else {
      podiumFirst.style.visibility = 'hidden';
    }

    // 2nd place
    if (podium.second) {
      podiumSecond.querySelector('.podium-avatar').textContent = podium.second.avatar || '🥈';
      podiumSecond.querySelector('.podium-name').textContent = podium.second.nickname;
      podiumSecond.querySelector('.podium-score').textContent = `${podium.second.score} pts`;
      podiumSecond.style.visibility = 'visible';
    } else {
      podiumSecond.style.visibility = 'hidden';
    }

    // 3rd place
    if (podium.third) {
      podiumThird.querySelector('.podium-avatar').textContent = podium.third.avatar || '🥉';
      podiumThird.querySelector('.podium-name').textContent = podium.third.nickname;
      podiumThird.querySelector('.podium-score').textContent = `${podium.third.score} pts`;
      podiumThird.style.visibility = 'visible';
    } else {
      podiumThird.style.visibility = 'hidden';
    }

    // Full rankings list
    finalLeaderboardList.innerHTML = '';
    rankings.forEach(p => {
      const row = document.createElement('div');
      row.className = `leaderboard-row ${p.id === myPlayerId ? 'current-player' : ''}`;
      row.innerHTML = `
        <div class="row-left">
          <span class="row-rank ${p.rank <= 3 ? 'top-' + p.rank : ''}">#${p.rank}</span>
          <div class="row-player">
            <span>${p.avatar || '🦊'}</span>
            <span>${escapeHtml(p.nickname)}</span>
          </div>
        </div>
        <div class="row-right">
          <span class="row-score">${p.score} pts</span>
        </div>
      `;
      finalLeaderboardList.appendChild(row);
    });

    if (isHost) {
      btnPlayAgain.style.display = 'block';
      btnPlayAgain.onclick = () => {
        stopConfetti();
        if (socket && currentRoom) {
          socket.emit('play-again', { roomCode: currentRoom.roomCode });
        }
      };
    } else {
      btnPlayAgain.style.display = 'none';
    }

    btnFinalHome.onclick = () => {
      stopConfetti();
      leaveCurrentGame();
      showScreen('home');
    };
  }

  // ==========================================
  // SOLO PRACTICE MODE IMPLEMENTATION
  // ==========================================
  btnStartSolo.addEventListener('click', async () => {
    const category = soloCategorySelect.value;
    const count = parseInt(soloCountSelect.value, 10) || 5;

    try {
      btnStartSolo.disabled = true;
      btnStartSolo.textContent = 'Loading Questions...';

      const res = await fetch(`/api/questions?category=${category}&count=${count}`);
      if (!res.ok) throw new Error('Failed to load questions');
      soloQuestions = await res.json();

      if (!soloQuestions || soloQuestions.length === 0) {
        showToast('No questions found for this category.');
        btnStartSolo.disabled = false;
        btnStartSolo.textContent = 'Start Solo Challenge 🚀';
        return;
      }

      soloIndex = 0;
      myScore = 0;
      myStreak = 0;
      soloCorrectAnswers = 0;
      soloBestStreakCount = 0;
      playerLiveScore.textContent = '0';
      updateStreakDisplay(0);

      btnStartSolo.disabled = false;
      btnStartSolo.textContent = 'Start Solo Challenge 🚀';

      startCountdown(3);
      setTimeout(() => {
        runSoloQuestion();
      }, 3200);

    } catch (err) {
      console.error(err);
      showToast('Error loading questions. Please try again.');
      btnStartSolo.disabled = false;
      btnStartSolo.textContent = 'Start Solo Challenge 🚀';
    }
  });

  function runSoloQuestion() {
    if (soloIndex >= soloQuestions.length) {
      finishSoloGame();
      return;
    }

    const q = soloQuestions[soloIndex];
    soloHasAnswered = false;
    soloQuestionStartTime = Date.now();

    showScreen('gameplay');
    feedbackBanner.className = 'feedback-banner';
    feedbackBanner.style.display = 'none';
    gameAnswerStatus.textContent = 'Select your answer before the timer runs out!';

    gameCategoryTag.textContent = q.category;
    gameProgressText.textContent = `Q ${soloIndex + 1} of ${soloQuestions.length}`;
    gameQuestionText.textContent = q.text;

    answerBtns.forEach((btn, idx) => {
      btn.className = `answer-btn btn-option-${idx}`;
      btn.disabled = false;
      const optText = document.getElementById(`opt-text-${idx}`);
      if (optText) optText.textContent = q.options[idx];

      btn.onclick = () => {
        if (soloHasAnswered) return;
        soloHasAnswered = true;
        handleSoloAnswer(idx, q);
      };
    });

    const totalSec = q.timeLimit || 15;
    let remainingSec = totalSec;
    updateTimerCircle(remainingSec, totalSec);

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      remainingSec -= 0.1;
      updateTimerCircle(remainingSec, totalSec);

      if (Math.abs(remainingSec - Math.round(remainingSec)) < 0.05 && remainingSec > 0) {
        if (remainingSec <= 3) {
          if (window.soundFX) window.soundFX.playUrgentTick();
        } else {
          if (window.soundFX) window.soundFX.playTick();
        }
      }

      if (remainingSec <= 0) {
        clearInterval(timerInterval);
        if (!soloHasAnswered) {
          soloHasAnswered = true;
          handleSoloAnswer(-1, q); // timeout
        }
      }
    }, 100);
  }

  function handleSoloAnswer(selectedIndex, q) {
    if (timerInterval) clearInterval(timerInterval);

    answerBtns.forEach(b => b.disabled = true);

    const isCorrect = (selectedIndex === q.correctIndex);
    const timeTakenMs = Math.min(Date.now() - soloQuestionStartTime, q.timeLimit * 1000);
    const fraction = Math.max(0, (q.timeLimit * 1000 - timeTakenMs) / (q.timeLimit * 1000));

    answerBtns.forEach((btn, idx) => {
      if (idx === q.correctIndex) {
        btn.classList.add('correct-reveal');
      } else if (idx === selectedIndex) {
        btn.classList.add('wrong-reveal');
      } else {
        btn.classList.add('wrong-reveal');
      }
    });

    if (isCorrect) {
      soloCorrectAnswers++;
      myStreak++;
      if (myStreak > soloBestStreakCount) soloBestStreakCount = myStreak;

      const points = Math.round(500 + (500 * fraction)) + (myStreak >= 2 ? myStreak * 100 : 0);
      myScore += points;
      playerLiveScore.textContent = myScore;
      updateStreakDisplay(myStreak);

      feedbackBanner.className = 'feedback-banner correct show';
      feedbackMsg.textContent = `Correct! +${points} pts 🎉`;
      if (window.soundFX) window.soundFX.playCorrect();
    } else {
      myStreak = 0;
      updateStreakDisplay(0);

      feedbackBanner.className = 'feedback-banner wrong show';
      feedbackMsg.textContent = selectedIndex === -1 
        ? `Time's Up! Correct answer: ${q.options[q.correctIndex]}`
        : `Wrong! The correct answer was: ${q.options[q.correctIndex]}`;
      if (window.soundFX) window.soundFX.playWrong();
    }

    // Advance to next question after 2.2 seconds
    setTimeout(() => {
      soloIndex++;
      runSoloQuestion();
    }, 2200);
  }

  function finishSoloGame() {
    showScreen('soloResults');
    startConfetti();
    if (window.soundFX) window.soundFX.playFanfare();

    const total = soloQuestions.length;
    const accuracy = Math.round((soloCorrectAnswers / total) * 100);

    soloFinalScore.textContent = myScore;
    soloFinalAccuracy.textContent = `${accuracy}%`;
    soloBestStreak.textContent = soloBestStreakCount;

    if (accuracy >= 80) {
      soloResultIcon.textContent = '🏆';
      soloResultHeading.textContent = 'Trivia Master!';
    } else if (accuracy >= 50) {
      soloResultIcon.textContent = '👏';
      soloResultHeading.textContent = 'Great Effort!';
    } else {
      soloResultIcon.textContent = '📚';
      soloResultHeading.textContent = 'Keep Practicing!';
    }
  }

  btnSoloRetry.addEventListener('click', () => {
    stopConfetti();
    showScreen('soloSetup');
  });

  btnSoloHome.addEventListener('click', () => {
    stopConfetti();
    showScreen('home');
  });

  // Confetti Particle Engine
  let confettiAnimId = null;
  const confettiCanvas = document.getElementById('confetti-canvas');
  const ctx = confettiCanvas.getContext('2d');
  let particles = [];

  function resizeCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function startConfetti() {
    stopConfetti();
    resizeCanvas();
    const colors = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
    particles = [];
    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * confettiCanvas.width,
        y: Math.random() * -confettiCanvas.height,
        w: Math.random() * 10 + 6,
        h: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        velX: Math.random() * 4 - 2,
        velY: Math.random() * 5 + 3,
        rot: Math.random() * 360,
        rotSpeed: Math.random() * 6 - 3
      });
    }

    function render() {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      particles.forEach(p => {
        p.x += p.velX;
        p.y += p.velY;
        p.rot += p.rotSpeed;

        if (p.y > confettiCanvas.height) {
          p.y = -20;
          p.x = Math.random() * confettiCanvas.width;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      confettiAnimId = requestAnimationFrame(render);
    }

    render();
  }

  function stopConfetti() {
    if (confettiAnimId) {
      cancelAnimationFrame(confettiAnimId);
      confettiAnimId = null;
    }
    if (ctx) ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }

  // Helper Utilities
  function formatCategoryName(cat) {
    const map = {
      all: 'All Categories (Mixed)',
      general: 'General Knowledge',
      science_tech: 'Science & Technology',
      pop_culture: 'Pop Culture & Movies',
      sports: 'Sports',
      geography_history: 'History & Geography'
    };
    return map[cat] || cat;
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
