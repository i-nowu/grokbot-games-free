// AudioWorklet: メインスレッドから Float32 ステレオ交互の塊を受け取り、リングバッファで再生する。
class EmuOut extends AudioWorkletProcessor {
  constructor() { super(); this.rb = new Float32Array(sampleRate * 2); this.w = 0; this.r = 0; this.muted = false;
    this.port.onmessage = e => { const d = e.data; if (d.mute !== undefined) { this.muted = d.mute; return; }
      const N = this.rb.length; if (this.fill() + d.length > N * 0.5) return;
      for (let i = 0; i < d.length; i++) { this.rb[this.w] = d[i]; this.w = (this.w + 1) % N; } }; }
  fill() { return (this.w - this.r + this.rb.length) % this.rb.length; }
  process(_, outs) { const L = outs[0][0], R = outs[0][1] || outs[0][0], N = this.rb.length;
    for (let i = 0; i < L.length; i++) { if (this.fill() >= 2) { const l = this.rb[this.r], r = this.rb[(this.r + 1) % N]; this.r = (this.r + 2) % N;
      L[i] = this.muted ? 0 : l; R[i] = this.muted ? 0 : r; } else L[i] = R[i] = 0; }
    return true; }
}
registerProcessor('emu-out', EmuOut);
