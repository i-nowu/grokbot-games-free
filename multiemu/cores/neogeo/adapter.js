// ネオジオ コアアダプタ: Geolith (BSD-3) wasm (neocore.js) を共通コアIFに合わせる。
// BIOS は自作 TEST BIOS のみ (roms.local.js 内蔵)。SNK / Universe BIOS は受け付けない。
window.MultiEmuCores.neogeo = async function createNeoGeo(opts) {
  const sys = opts.variant === 'aes' ? 'aes' : 'mvs';
  const M = await NeoCore();
  const b64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const put = u => { const p = M._ng_alloc(u.length); M.HEAPU8.set(u, p); return [p, u.length]; };
  const W = 304, H = 224, rgba = new Uint32Array(W * H);
  const P1 = { up: 1, down: 2, left: 4, right: 8, a: 16, b: 32, c: 64, d: 128 }, SY = { start: 1, select: 2, coin: 4 };
  const NVRAM = 4, MEMCARD = 7; // GEO_MEMTYPE_*
  const saveType = sys === 'aes' ? MEMCARD : NVRAM;
  let romId = '', romData = null;
  const cardIn = new URLSearchParams(location.search).get('card') !== '0';
  function memView(t) { const sz = M._malloc(4); const p = M._ng_mem(t, sz); const n = M.HEAPU32[sz >> 2]; M._free(sz); return p && n ? M.HEAPU8.subarray(p, p + n) : null; }
  // 第5回: 既定は自作TEST BIOS v0.4。?bios=v03 で v0.3 (比較用)
  // 第7回 (2026-10-23): 既定は v0.5 (公開形式のメモリーカード)。?bios=v04 / ?bios=v03 で旧版 (独自形式カード) と比較。
  // 第27回 (2026-10-24): 既定は v0.6 (= v0.5 + 無償配布の文。コードは同じ)。?bios=v05 / v04 / v03 で旧版。
  // 公開版 (window.NEO_RELEASE) は ?bios を見ない (古い BIOS は入っていない)。
  const BQ = window.NEO_RELEASE ? null : new URLSearchParams(location.search).get('bios');
  const HAS = k => !!(window.NEO_ROMS && NEO_ROMS[k]);
  const BIOSV = (BQ === 'v03' && HAS('bios_mvs_v03')) ? 'v0.3' : (BQ === 'v04' && HAS('bios_mvs_v04')) ? 'v0.4' : (BQ === 'v05' && HAS('bios_mvs_v05')) ? 'v0.5' : 'v0.6';
  const BSUF = { 'v0.3': '_v03', 'v0.4': '_v04', 'v0.5': '_v05', 'v0.6': '' }[BIOSV];
  const BKEY = (sys === 'aes' ? 'bios_aes' : 'bios_mvs') + BSUF;
  // BIOS が内蔵されていないとき (予備): opts.bios (利用者が読み込んだ BIOS の zip) を使う。無ければ needBios。
  const userBios = opts.bios || null;
  const hasBios = () => HAS(BKEY) || !!userBios;
  // 旧独自形式 (GBMCARD1) のカードは v0.5 では公開形式に移し替える (旧版で起動したときはそのまま)
  let migrated = null;
  const fixCard = c => { if ((BIOSV !== 'v0.5' && BIOSV !== 'v0.6') || !window.NeoCardFmt || !NeoCardFmt.isOld(c)) return c; const m = NeoCardFmt.migrate(c); migrated = { moved: m.moved, dropped: m.dropped }; console.log('[card] 旧形式 GBMCARD1 → 公開形式に移し替え', JSON.stringify(migrated)); return m.card; };
  return {
    id: 'neogeo', name: 'ネオジオ ' + sys.toUpperCase(),
    variants: [{ id: 'mvs', name: 'MVS' }, { id: 'aes', name: 'AES' }],
    fps: sys === 'aes' ? 59.599 : 59.1856,
    video: { width: W, height: H, aspect: 4 / 3 },
    buttons: ['up', 'down', 'left', 'right', 'a', 'b', 'c', 'd', 'start', 'select', 'coin'],
    pad: { face: ['a', 'b', 'c', 'd'], system: ['coin', 'select', 'start'] },
    keymap: { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyZ: 'a', KeyX: 'b', KeyA: 'c', KeyS: 'd', Enter: 'start', Digit1: 'start', ShiftRight: 'select', Digit5: 'coin', KeyC: 'coin' },
    biosNote: (sys === 'mvs' ? (cardIn ? 'MVSカードスロットあり・' : 'MVSカードなし・') : '') + (HAS(BKEY) ? '自作TEST BIOS ' + BIOSV + (BIOSV === 'v0.6' ? ' (無償配布版)' : '') + '使用・SNK/Universe BIOS不使用・実機未確認' : '利用者のBIOSを使用・実機未確認'),
    licenseKey: 'neogeo',
    needBios() { return !hasBios(); }, biosSlot: 'bios-neogeo-' + sys,
    init() { M._ng_init(sys === 'aes' ? 0 : 1, sys === 'aes' ? 1 : 3, opts.sampleRate); M._ng_card(cardIn ? 1 : 0); return true; },
    builtin() { return HAS('neo') ? [{ id: 'simgunma', name: 'シム群馬' }] : []; },
    loadRom(rom) {
      // rom: {builtin:'simgunma'} のみ (BIOS は常に自作 TEST BIOS)
      if (!window.NEO_ROMS && !rom.data) throw new Error('内蔵ROMがありません');
      if (!hasBios()) throw new Error('BIOSが必要です。自分で正規に入手したものを読み込んでね');
      if (!M._ng_load_bios(...put(HAS(BKEY) ? b64(NEO_ROMS[BKEY]) : userBios))) throw new Error('BIOS読込失敗');
      const neo = rom.data || (HAS('neo') && b64(NEO_ROMS.neo));
      if (!neo) throw new Error('内蔵ROMがありません');
      if (!M._ng_load_neo(...put(neo))) throw new Error('ROM読込失敗 (.neo 形式のみ)');
      romId = 'neogeo-' + sys + '-' + (rom.hash || rom.builtin); romData = neo;
      return true;
    },
    reset() { M._ng_reset(0); },
    setInput(pressed /* Set<string> */) {
      let p = 0, y = 0; for (const k of pressed) { p |= P1[k] || 0; y |= SY[k] || 0; }
      if ((p & 3) === 3) p &= ~3; if ((p & 12) === 12) p &= ~12;
      M._ng_input(p, y);
    },
    runFrame() { M._ng_frame(); },
    getVideo() {
      const p = M._ng_video() >> 2, pitch = M._ng_video_pitch(), HU = M.HEAPU32; let o = 0;
      for (let y = 0; y < H; y++) { let s = p + y * pitch;
        for (let x = 0; x < W; x++) { const c = HU[s++]; rgba[o++] = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff); } }
      return { data: rgba, width: W, height: H };
    },
    getAudio() { const n = M._ng_audio_count(); const p = M._ng_audio() >> 1; return M.HEAP16.subarray(p, p + n); }, // int16 ステレオ交互
    saveId() { return romId; },
    // ステート (第10回)。Geolith の geo_state_save_raw / geo_state_load_raw。自作BIOSの版とMVS/AESも版に含める。
    stateVersion: 'neogeo/Geolith/core-state1/bios-' + BIOSV,
    stateVariant: sys + (cardIn ? '+card' : ''),
    // 第11回: 自作BIOSの版が違うステートは移し替えない (BIOS の中身と RAM の使い方が違い、正しく直す方法がないため)
    stateMigrations: BIOSV === 'v0.6' ? [{ from: 'neogeo/Geolith/core-state1/bios-v0.5', to: 'neogeo/Geolith/core-state1/bios-v0.6', run(b) { return { body: b }; } }] : [],
    stateNoMigrate: Object.fromEntries(['v0.3', 'v0.4', 'v0.5', 'v0.6'].filter(v => v !== BIOSV && !(BIOSV === 'v0.6' && v === 'v0.5')).map(v => ['neogeo/Geolith/core-state1/bios-' + v, '自作TEST BIOS の版 (' + v + ' → ' + BIOSV + ') が違い、BIOS の中身とRAMの使い方が合わない'])),
    romBytes() { return romData; },
    getState() { const n = M._ng_state_size(); const p = M._ng_state_save(); return n > 0 && p ? M.HEAPU8.slice(p, p + n) : null; },
    setState(u8) { if (!u8 || u8.length !== M._ng_state_size()) return false; const p = M._malloc(u8.length); M.HEAPU8.set(u8, p); const ok = M._ng_state_load(p); M._free(p); return ok === 1; },
    // v3 (エミュ 2026-10-22): MVS もカードスロットあり。MVS のセーブ = NVRAM(64KB) + カード(2KB) を続けて1つに保存 (旧形式 NVRAM だけ も読める)。?card=0 でカードを抜く。
    getSave() { const v = memView(saveType); if (!v) return null; if (sys === 'aes') return v.slice();
      const c = cardIn && memView(MEMCARD); if (!c) return v.slice(); const t = new Uint8Array(v.length + c.length); t.set(v); t.set(c, v.length); return t; },
    setSave(u8) { const v = memView(saveType); if (!v || !u8) return;
      if (sys === 'aes') { v.set(fixCard(u8.subarray(0, v.length))); return; }
      v.set(u8.subarray(0, v.length));
      if (u8.length > v.length) { const c = memView(MEMCARD); if (c) c.set(fixCard(u8.subarray(v.length, v.length + c.length))); } },
    cardMigrated() { return migrated; },
    debugMem(t) { return memView(t); },
  };
};
