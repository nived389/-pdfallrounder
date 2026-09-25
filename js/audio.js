// Web Audio API Synthesizer for QuizRoom (Zero external asset dependencies)
class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('quizroom_muted') === 'true';
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('quizroom_muted', this.muted);
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  playTone(freq, type = 'sine', duration = 0.15, gain = 0.1, delay = 0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);

    gainNode.gain.setValueAtTime(gain, this.ctx.currentTime + delay);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + delay + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(this.ctx.currentTime + delay);
    osc.stop(this.ctx.currentTime + delay + duration);
  }

  playTick() {
    this.playTone(800, 'triangle', 0.05, 0.04);
  }

  playUrgentTick() {
    this.playTone(1200, 'square', 0.08, 0.07);
  }

  playJoin() {
    this.playTone(523.25, 'sine', 0.1, 0.1); // C5
    this.playTone(659.25, 'sine', 0.2, 0.1, 0.1); // E5
  }

  playStart() {
    this.playTone(440, 'triangle', 0.12, 0.15); // A4
    this.playTone(554.37, 'triangle', 0.12, 0.15, 0.12); // C#5
    this.playTone(659.25, 'triangle', 0.12, 0.15, 0.24); // E5
    this.playTone(880, 'triangle', 0.35, 0.2, 0.36); // A5
  }

  playCorrect() {
    this.playTone(587.33, 'triangle', 0.1, 0.15); // D5
    this.playTone(739.99, 'triangle', 0.1, 0.15, 0.1); // F#5
    this.playTone(880, 'triangle', 0.35, 0.2, 0.2); // A5
  }

  playWrong() {
    this.playTone(220, 'sawtooth', 0.2, 0.15); // A3
    this.playTone(196, 'sawtooth', 0.3, 0.15, 0.18); // G3
  }

  playFanfare() {
    const notes = [
      { f: 523.25, d: 0.15, t: 0 },
      { f: 659.25, d: 0.15, t: 0.15 },
      { f: 783.99, d: 0.15, t: 0.3 },
      { f: 1046.50, d: 0.5, t: 0.45 }
    ];
    notes.forEach(n => this.playTone(n.f, 'triangle', n.d, 0.2, n.t));
  }
}

window.soundFX = new SoundFX();
