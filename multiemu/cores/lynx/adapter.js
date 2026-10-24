// Lynx コアアダプタ: Handy 0.97 (zlib, K. Wilkins / libretro版の lynx/) wasm (lynxcore.js) を共通コアIFに合わせる。エミュ作 2026-10-22。
// BIOS: 純正 Lynx BIOS (lynxboot.img) は使わない。Handy の HLE ブートのみ。
// 音声は Blip_Buffer(GPL/LGPL) を使わず自作の簡易バッファに置換。lynxdec.cpp(出典ライセンス不明) は不使用。
window.MultiEmuCores.lynx = async function createLynx(opts) {
  const M = await LynxCore();
  const b64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const W = 160, H = 102, rgba = new Uint32Array(W * H), rotBuf = new Uint32Array(W * H); let rotation = 0; const video = { width: W, height: H, aspect: W / H };
  const BIT = { a: 1, b: 2, opt2: 4, opt1: 8, left: 16, right: 32, up: 64, down: 128, start: 256 }; // start = PAUSE
  const DIRMAP = [null, { up: 'right', down: 'left', left: 'up', right: 'down' }, { up: 'left', down: 'right', left: 'down', right: 'up' }];
  const RATE = 48000; let romId = '', romData = null, resampleAcc = 0; const out = new Int16Array(8192);
  return {
    id: 'lynx', name: 'Lynx',
    fps: 60, // HLE既定のタイマー設定で約60Hz (1フレーム約796サンプル@48kHz で確認)。ROMがタイマーを変えると変わる
    video, // .lnx の向き (左/右) なら loadRom で 102×160 に変わる (フロントは loadRom の後で読む)
    romInfo: '',
    buttons: ['up', 'down', 'left', 'right', 'a', 'b', 'opt1', 'opt2', 'start'],
    pad: { face: ['b', 'a', 'opt1', 'opt2'], system: ['start'] },
    keymap: { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyX: 'a', KeyZ: 'b', KeyA: 'opt1', KeyS: 'opt2', Enter: 'start' },
    biosNote: 'HLEブート(純正Lynx BIOS不使用)・自作テストROM・実機未確認',
    licenseKey: 'lynx',
    init() { return true; },
    builtin() { return window.LYNX_ROMS ? [{ id: 'emutest', name: 'エミュ自作 Lynx テストROM' }, { id: 'eeprom', name: 'エミュ自作 EEPROM テストROM' }].filter(r => LYNX_ROMS[r.id]) : []; },
    loadRom(rom) {
      const data = rom.data || (window.LYNX_ROMS && LYNX_ROMS[rom.builtin] && b64(LYNX_ROMS[rom.builtin]));
      if (!data) throw new Error('ROMがありません');
      let ee = 1 /* BS93 は 93C46 16bit 既定 */, info = null;
      if (data.length >= 4 && data[0] === 0x4C && data[1] === 0x59 && data[2] === 0x4E && data[3] === 0x58) { // .lnx: 推測せず検査 (lnxhdr.js)
        const h = LnxHdr.parse(data); if (h.error) throw new Error(h.error); if (h.info.boot !== 'own') throw new Error(LnxHdr.UNSUP); info = h.info; ee = info.eeprom; }
      const p = M._lx_alloc(data.length); M.HEAPU8.set(data, p);
      const r = M._lx_load(p, data.length, ee); M._free(p);
      if (r === 2) throw new Error(LnxHdr.UNSUP); if (r === 3) throw new Error('.lnx 先頭の BS93 ローダーが不正です。');
      if (r !== 1) throw new Error('ROM読込失敗');
      rotation = info ? info.rotation : 0;
      if (rotation) { video.width = H; video.height = W; video.aspect = H / W; }
      this.romInfo = info ? '.lnx「' + info.name + '」' + info.maker + ' 向き:' + info.rotName + ' EEPROM:' + info.eeName : '';
      this.lnxInfo = info;
      romId = 'lynx-' + (rom.hash || rom.builtin); romData = data; return true;
    },
    reset() { M._lx_reset(); },
    // 十字キーの向き (第9回): 画面を回したときは、画面の上下左右を本体を倒して持ったときの本体の向きに直す。
    // 左 (反時計回り表示): 画面の上=本体の右 / 下=左 / 左=上 / 右=下。右 (時計回り表示): 上=左 / 下=右 / 左=下 / 右=上。
    // 表示の回転式 (getVideo) から機械的に求めたもの。キーボード・ゲームパッド・タッチはすべてここを通る。
    setInput(pressed) { const R = DIRMAP[rotation]; let m = 0; for (const k of pressed) m |= BIT[R && R[k] || k] || 0; M._lx_input(m); },
    runFrame() { M._lx_frame(); },
    getVideo() { const p = M._lx_video() >> 2, HU = M.HEAPU32;
      for (let i = 0; i < W * H; i++) { const c = HU[p + i]; rgba[i] = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff); }
      if (!rotation) return { data: rgba, width: W, height: H };
      // 1=左 (反時計回り): 本体を左に倒して持つ → 画像を 90° 反時計回りに回す。2=右 は時計回り。出力は 102×160。
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = rgba[y * W + x];
        if (rotation === 1) rotBuf[(W - 1 - x) * H + y] = c; else rotBuf[x * H + (H - 1 - y)] = c; }
      return { data: rotBuf, width: H, height: W }; },
    getAudio() { // コアは 48kHz 固定。フロントの sampleRate へ最近傍で変換
      const n = M._lx_audio_count() >> 1, p = M._lx_audio() >> 1, src = M.HEAP16;
      if (opts.sampleRate === RATE) return src.subarray(p, p + n * 2);
      const step = RATE / opts.sampleRate; let o = 0;
      for (; resampleAcc < n && o < out.length; resampleAcc += step) { const i = p + (resampleAcc | 0) * 2; out[o++] = src[i]; out[o++] = src[i + 1]; }
      resampleAcc -= n; return out.subarray(0, o); },
    saveId() { return romId; },
    // ステート (第10回)。Handy の ContextSave / ContextLoad (カートCRCも Handy 側で照合)。
    stateVersion: 'lynx/Handy-0.97/lynxwrap-state1',
    stateMigrations: [], stateNoMigrate: {}, // 第11回: 版を上げたらここに {from,to,run} を足す (docs/CORE_IF.md)
    romBytes() { return romData; },
    getState() { const n = M._lx_state_size(); if (n <= 0) return null; const p = M._malloc(n); const ok = M._lx_state_save(p, n); const r = M.HEAPU8.slice(p, p + n); M._free(p); return ok ? r : null; },
    setState(u8) { if (!u8 || !u8.length) return false; const p = M._malloc(u8.length); M.HEAPU8.set(u8, p); const ok = M._lx_state_load(p, u8.length); M._free(p); return ok === 1; },
    getSave() { const n = M._lx_ee_size(); return n ? M.HEAPU8.slice(M._lx_ee_ptr(), M._lx_ee_ptr() + n) : null; }, // EEPROM (IndexedDB へ)
    setSave(u8) { const n = M._lx_ee_size(); if (n && u8) M.HEAPU8.set(u8.subarray(0, n), M._lx_ee_ptr()); },
    debugMem() { const r = new Uint8Array(0x10000); for (let a = 0; a < 0x10000; a++) r[a] = M._lx_peek(a); return r; },
  };
};
