// GB/GBC コアアダプタ: SameBoy (MIT) wasm (gbcore.js) を共通コアIFに合わせる。エミュ作 2026-10-22。
// ブートROMは SameBoy 同梱のオープン版 (MIT) を wasm に内蔵。純正ブートROMは使わない・受け付けない。
window.MultiEmuCores.gb = async function createGB(opts) {
  const M = await GBCore();
  const b64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const W = 160, H = 144, rgba = new Uint32Array(W * H);
  const BIT = { right: 1, left: 2, up: 4, down: 8, a: 16, b: 32, select: 64, start: 128 };
  const LIST = [{ id: 'gunma', name: 'グンマー教の野望 (GB)' }, { id: 'babanuki', name: 'ババ抜き (GB)' }, { id: 'blockfall', name: 'ブロックフォール・ブレイカー (GBC)' }];
  let romId = '', romData = null, model = opts.variant || 'auto';
  return {
    id: 'gb', name: 'ゲームボーイ',
    variants: [{ id: 'auto', name: '自動' }, { id: 'dmg', name: 'GB' }, { id: 'cgb', name: 'GBC' }],
    fps: 4194304 / 70224,
    video: { width: W, height: H, aspect: W / H },
    buttons: ['up', 'down', 'left', 'right', 'a', 'b', 'select', 'start'],
    pad: { face: ['b', 'a'], system: ['select', 'start'] },
    keymap: { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyX: 'a', KeyZ: 'b', Enter: 'start', ShiftRight: 'select', Backspace: 'select' },
    biosNote: 'SameBoyオープンブートROM(MIT)使用・純正ブートROM不使用・実機未確認',
    licenseKey: 'gb',
    init() { return true; },
    builtin() { return window.GB_ROMS ? LIST.filter(r => GB_ROMS[r.id]) : []; },
    loadRom(rom) {
      const data = rom.data || (window.GB_ROMS && GB_ROMS[rom.builtin] && b64(GB_ROMS[rom.builtin]));
      if (!data || data.length < 0x150) throw new Error('ROMがありません');
      const cgb = model === 'cgb' || (model === 'auto' && (data[0x143] & 0x80) !== 0);
      M._gbw_init(cgb ? 1 : 0, opts.sampleRate);
      const p = M._gbw_alloc(data.length); M.HEAPU8.set(data, p); M._gbw_load(p, data.length);
      romId = 'gb-' + (cgb ? 'cgb' : 'dmg') + '-' + (rom.hash || rom.builtin); romData = data; this.stateVariant = cgb ? 'cgb' : 'dmg';
      this.name = cgb ? 'ゲームボーイカラー' : 'ゲームボーイ';
      return true;
    },
    reset() { M._gbw_reset(); },
    setInput(pressed) { let m = 0; for (const k of pressed) m |= BIT[k] || 0; if ((m & 3) === 3) m &= ~3; if ((m & 12) === 12) m &= ~12; M._gbw_input(m); },
    runFrame() { M._gbw_frame(); },
    getVideo() { const p = M._gbw_video() >> 2; rgba.set(M.HEAPU32.subarray(p, p + W * H)); return { data: rgba, width: W, height: H }; },
    getAudio() { const n = M._gbw_audio_count(); const p = M._gbw_audio() >> 1; return M.HEAP16.subarray(p, p + n); },
    saveId() { return romId; },
    // ステート (第10回, docs/CORE_IF.md)。SameBoy の GB_save_state_to_buffer / GB_load_state_from_buffer を使う。
    stateVersion: 'gb/SameBoy-core/gbwrap-state1',
    stateMigrations: [], stateNoMigrate: {}, // 第11回: 版を上げたらここに {from,to,run} を足す (docs/CORE_IF.md)
    romBytes() { return romData; },
    getState() { const n = M._gbw_state_size(); if (n <= 0) return null; const p = M._malloc(n); M._gbw_state_save(p); const r = M.HEAPU8.slice(p, p + n); M._free(p); return r; },
    setState(u8) { if (!u8 || !u8.length) return false; const p = M._malloc(u8.length); M.HEAPU8.set(u8, p); const ok = M._gbw_state_load(p, u8.length); M._free(p); return ok === 1; },
    getSave() { const n = M._gbw_save_size(); if (n <= 0) return null; const p = M._malloc(n); M._gbw_save(p, n); const r = M.HEAPU8.slice(p, p + n); M._free(p); return r; },
    setSave(u8) { if (!u8 || !u8.length) return; const p = M._malloc(u8.length); M.HEAPU8.set(u8, p); M._gbw_load_save(p, u8.length); M._free(p); },
    debugMem() { const r = new Uint8Array(0x10000); for (let a = 0; a < 0x10000; a++) r[a] = M._gbw_peek(a); return r; },
  };
};
