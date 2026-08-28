// Web Audio API Ringtone & Call Sound Effects Synthesizer

class RingtoneSynthesizer {
  constructor() {
    this.audioCtx = null;
    this.ringInterval = null;
    this.isPlaying = false;
  }

  initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Incoming Phone Ringtone
  startIncomingRing() {
    this.stopRingtone();
    this.initContext();
    if (!this.audioCtx) return;

    this.isPlaying = true;
    const playBurst = () => {
      if (!this.isPlaying || !this.audioCtx) return;
      const now = this.audioCtx.currentTime;

      // Tone 1: 440 Hz (Standard A4)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 1.8);

      // Tone 2: 480 Hz
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);
      gain2.gain.setValueAtTime(0.15, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now);
      osc2.stop(now + 1.8);
    };

    playBurst();
    this.ringInterval = setInterval(playBurst, 2800);
  }

  // Outgoing Dialing Beep
  startOutgoingDialTone() {
    this.stopRingtone();
    this.initContext();
    if (!this.audioCtx) return;

    this.isPlaying = true;
    const playBeep = () => {
      if (!this.isPlaying || !this.audioCtx) return;
      const now = this.audioCtx.currentTime;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(425, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    };

    playBeep();
    this.ringInterval = setInterval(playBeep, 3500);
  }

  // Connected Call Soft Chime
  playCallConnected() {
    this.stopRingtone();
    this.initContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    const osc1 = this.audioCtx.createOscillator();
    const gain1 = this.audioCtx.createGain();
    osc1.frequency.setValueAtTime(523.25, now); // C5
    gain1.gain.setValueAtTime(0.1, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(this.audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = this.audioCtx.createOscillator();
    const gain2 = this.audioCtx.createGain();
    osc2.frequency.setValueAtTime(659.25, now + 0.15); // E5
    gain2.gain.setValueAtTime(0.12, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(this.audioCtx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  }

  // Call Disconnected Tone
  playCallEnded() {
    this.stopRingtone();
    this.initContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    [480, 400, 320].forEach((freq, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const startTime = now + idx * 0.12;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.1, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.15);
    });
  }

  stopRingtone() {
    this.isPlaying = false;
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }
}

export const ringtoneSynth = new RingtoneSynthesizer();
