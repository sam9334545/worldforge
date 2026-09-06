/**
 * Ambient Audio & SFX Synthesizer
 * Pure Web Audio API synthesis (Zero external audio assets or network downloads)
 * Section 11 Compliance: MUTED by default with explicit toggle.
 */

class AudioSystem {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true;
  private windGain: GainNode | null = null;

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    } catch {
      // AudioContext not supported
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): boolean {
    this.isMuted = muted;
    if (!this.isMuted && !this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended' && !this.isMuted) {
      this.ctx.resume();
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.04, this.ctx?.currentTime || 0, 0.1);
    }
    return this.isMuted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.isMuted);
  }

  public playPlacementSound() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignore audio glitches
    }
  }

  public playThunderSound() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      // Synthesize low-frequency thunder rumble using white noise buffer
      const bufferSize = this.ctx.sampleRate * 1.5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.6));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      // Lowpass filter for deep thunder roar
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, now);
      filter.frequency.linearRampToValueAtTime(60, now + 1.2);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + 1.4);
    } catch {
      // Ignore
    }
  }
}

export const audioSystem = new AudioSystem();
