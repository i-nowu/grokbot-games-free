// ユーザーROM読込 (ファイル選択 / ドラッグ&ドロップ)。ROMはこのブラウザ内 (メモリとIndexedDB) だけで扱い、どこにも送信しない。エミュ作 2026-10-22
// 機種は拡張子とヘッダから自動判定。ZIP は中のROMを取り出して判定し、複数なら選ばせる。BIOS/ブートROMは受け付けない (各コアはチーム自作/オープンのものに固定)。
window.RomLoad = (() => {
  const ext = n => (n.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const asc = (u, o, n) => String.fromCharCode(...u.subarray(o, o + n));
  const PENDING = { pce: 'PCエンジン', gg: 'ゲームギア', sms: 'ゲームギア', rom: 'MSX', mx1: 'MSX', mx2: 'MSX', vec: '光速船 (Vectrex)', j64: 'Jaguar', jag: 'Jaguar', z64: 'N64', n64: 'N64', v64: 'N64' };
  // 戻り値 {core, variant?, why} または {error}
  function detect(name, u) {
    const e = ext(name);
    if (isZip(u)) return { error: 'ZIPの中にZIPがあります。中のZIPは読みません。' };
    if (u.length >= 4096 && asc(u, 0, 3) === 'NEO' && u[3] === 1) return { core: 'neogeo', why: 'ヘッダ NEO\\1 (.neo)' };
    if (u.length >= 4 && asc(u, 0, 4) === 'LYNX' || e === 'lnx') { // .lnx: ヘッダを検査し、壊れた/未対応の値は止める (lnxhdr.js)
      const h = LnxHdr.parse(u); if (h.error) return { error: h.error }; if (h.info.boot !== 'own') return { error: LnxHdr.UNSUP };
      return { core: 'lynx', why: 'ヘッダ LYNX (.lnx「' + h.info.name + '」/' + h.info.maker + ' 向き:' + h.info.rotName + ' EEPROM:' + h.info.eeName + ')' }; }
    if (u.length >= 10 && asc(u, 6, 4) === 'BS93') return { core: 'lynx', why: 'ヘッダ BS93 (自作/homebrew .o)' };
    // GB: $104 のロゴ先頭4バイトとヘッダチェックサム ($14D) で判定
    if (u.length >= 0x150 && u[0x104] === 0xCE && u[0x105] === 0xED && u[0x106] === 0x66 && u[0x107] === 0x66) {
      let x = 0; for (let i = 0x134; i <= 0x14C; i++) x = (x - u[i] - 1) & 0xff;
      if (x === u[0x14D]) return { core: 'gb', why: 'GBヘッダ' + ((u[0x143] & 0x80) ? ' (GBC対応)' : '') };
    }
    if (e === 'gb' || e === 'gbc' || e === 'sgb') return { core: 'gb', why: '拡張子 .' + e };
    if (e === 'o' || e === 'lyx') return { core: 'lynx', why: '拡張子 .' + e };
    if (e === 'neo') return { error: '.neo のヘッダが正しくありません。' };
    if (/bios|boot|lynxboot|sp-s|neo-epo|000-lo|sfix/i.test(name)) return { error: 'BIOSファイルは使いません (各機種はチーム自作/オープンのBIOSに固定)。' };
    if (PENDING[e]) return { error: PENDING[e] + ' はまだ準備中です。' };
    return { error: '機種を判定できませんでした (対応: .gb .gbc .lnx .o .neo と、それを入れた .zip、ネオジオのMAME形式ZIP)。' };
  }
  // ---- ZIP (エミュ作 2026-10-22): 中央ディレクトリを自前で読み、deflate はブラウザの DecompressionStream('deflate-raw') で展開。外部ライブラリなし。
  // v3 (2026-10-22): ZIP64 (EOCD64 / 拡張フィールド 0x0001) と 分割ZIP (.z01 … .zip を結合、ディスク番号から絶対位置を計算) に対応。仕様は PKWARE APPNOTE (公開仕様) のみ参照。
  const isZip = u => u.length >= 4 && u[0] === 0x50 && u[1] === 0x4B && ((u[2] === 3 && u[3] === 4) || (u[2] === 7 && u[3] === 8) || (u[2] === 5 && u[3] === 6));
  const le16 = (u, o) => u[o] | u[o + 1] << 8, le32 = (u, o) => (u[o] | u[o + 1] << 8 | u[o + 2] << 16 | u[o + 3] << 24) >>> 0;
  const le64 = (u, o) => { const hi = le32(u, o + 4); if (hi > 0x1fffff) throw new Error('ZIP64 の値が大きすぎます。'); return hi * 4294967296 + le32(u, o); };
  // starts: 各ディスク(分割の各ファイル)の結合後の先頭位置。普通のZIPは [0]
  function zipList(u, starts) {
    starts = starts || [0];
    let e = -1; for (let i = u.length - 22; i >= Math.max(0, u.length - 22 - 65535); i--) if (le32(u, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('ZIPの終わりが見つかりません (壊れているか、分割ZIPの途中のファイルです)。');
    let disk = le16(u, e + 4), cdDisk = le16(u, e + 6), n = le16(u, e + 10), cdOff = le32(u, e + 16);
    const loc = e - 20;
    if (loc >= 0 && le32(u, loc) === 0x07064b50) { // ZIP64
      const z = le64(u, loc + 8) + (starts[le32(u, loc + 4)] ?? 0);
      if (z < 0 || z >= u.length || le32(u, z) !== 0x06064b50) throw new Error('ZIP64 の終わりの記録が壊れています。');
      disk = le32(u, z + 16); cdDisk = le32(u, z + 20); n = le64(u, z + 32); cdOff = le64(u, z + 48);
    }
    if (disk + 1 > starts.length) throw new Error('分割ZIPです (全' + (disk + 1) + 'ファイル)。.z01 … .zip を全部まとめて選んでください。');
    let o = starts[cdDisk] + cdOff; const out = [];
    for (let k = 0; k < n; k++) {
      if (le32(u, o) !== 0x02014b50) throw new Error('ZIPの目次が壊れています。');
      const flag = le16(u, o + 8), method = le16(u, o + 10);
      let csize = le32(u, o + 20), usize = le32(u, o + 24);
      const nl = le16(u, o + 28), xl = le16(u, o + 30), cl = le16(u, o + 32);
      let dsk = le16(u, o + 34), lho = le32(u, o + 42);
      // ZIP64 拡張フィールド: 0xFFFFFFFF の項目だけが usize, csize, lho, disk の順に入る
      for (let x = o + 46 + nl, xe = x + xl; x + 4 <= xe;) {
        const id = le16(u, x), sz = le16(u, x + 2);
        if (id === 1) { let p = x + 4;
          if (usize === 0xffffffff) { usize = le64(u, p); p += 8; }
          if (csize === 0xffffffff) { csize = le64(u, p); p += 8; }
          if (lho === 0xffffffff) { lho = le64(u, p); p += 8; }
          if (dsk === 0xffff) { dsk = le32(u, p); } }
        x += 4 + sz;
      }
      if (dsk >= starts.length) throw new Error('分割ZIPのファイルが足りません。');
      const name = new TextDecoder('utf-8').decode(u.subarray(o + 46, o + 46 + nl));
      if (!name.endsWith('/')) out.push({ name, flag, method, csize, usize, lho: starts[dsk] + lho });
      o += 46 + nl + xl + cl;
    }
    return out;
  }
  async function zipRead(u, f) {
    if (f.flag & 1) throw new Error(f.name + ': 暗号化されたZIPは読めません。');
    if (f.usize > MAX) throw new Error(f.name + ': 大きすぎます (64MBまで)。');
    if (le32(u, f.lho) !== 0x04034b50) throw new Error('ZIPのファイル見出しが壊れています。');
    const st = f.lho + 30 + le16(u, f.lho + 26) + le16(u, f.lho + 28), c = u.subarray(st, st + f.csize);
    let d;
    if (f.method === 0) d = c.slice();
    else if (f.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('このブラウザは ZIP の展開 (DecompressionStream) に対応していません。展開してから読み込んでください。');
      d = new Uint8Array(await new Response(new Blob([c]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    } else throw new Error(f.name + ': 未対応の圧縮方式 (' + f.method + ') です。');
    if (d.length !== f.usize) throw new Error(f.name + ': 展開した大きさが合いません。');
    return d;
  }
  // ---- ネオジオ MAME形式セット → .neo 組立 (エミュ作 2026-10-22)
  // 対応表はファイル名の規則 (xxx-p1.p1 / -s1 / -m1 / -v1.. / -c1..) だけから決める。MAME のソースやドライバ表は使わない。
  // 並べ方は公開の .neo 形式 (Geolith geo_neo.c, BSD-3 の読込み処理) に合わせる: P=p1,p2..連結 / S=s1 / M=m1 / V=v1,v2..連結 / C=(c1,c2) を1バイトずつ交互、(c3,c4)… を後ろへ。
  const BIOS_NAME = /(^|\/)(neogeo|aes|neocdz?|uni-?bios[^/]*)\.zip$/i;
  const BIOS_FILE = /bios|sp-|sp1|sm1\.sm1|sfix|000-lo|neo-epo|neo-po|vs-bios|asia-s3|uni-bios/i;
  function mameRole(base) {
    const b = base.toLowerCase();
    const m = b.match(/(?:^|[-_])(sma|ep|pg|p|s|m|v|c)(\d*)\.[a-z0-9]+$/) || b.match(/^[^.]*\.(sma|p|s|m|v|c)(\d+)$/);
    return m ? { r: m[1], n: m[2] === '' ? 0 : +m[2] } : null;
  }
  function looksMame(names) { const rs = names.map(n => mameRole(n.split('/').pop())).filter(Boolean); return rs.some(x => x.r === 'c') && rs.some(x => x.r === 'p' || x.r === 'ep' || x.r === 'pg'); }
  // v4 (エミュ 2026-10-22): 名前が規則から外れていても、中身 (P ROM の "NEO-GEO" シグネチャ・Z80 の先頭命令・大きさ) から役割を推定する。
  // シグネチャは公開の P ROM ヘッダ仕様 ($100 "NEO-GEO\0"、$108 NGH) のみ参照。チームの .neo は P をバイト入替えで持つ ("EN-OEG\0O")。
  const SIG_SW = [0x45, 0x4E, 0x2D, 0x4F, 0x45, 0x47, 0x00, 0x4F], SIG_PL = [0x4E, 0x45, 0x4F, 0x2D, 0x47, 0x45, 0x4F, 0x00];
  function psig(u, off) { off = (off || 0) + 0x100; if (u.length < off + 8) return '';
    if (SIG_SW.every((c, i) => u[off + i] === c)) return 'sw'; if (SIG_PL.every((c, i) => u[off + i] === c)) return 'pl'; return ''; }
  const pSigAny = u => psig(u, 0) || (u.length >= 0x200000 ? psig(u, 0x100000) : '');
  const swab = u => { const t = new Uint8Array(u.length); for (let i = 0; i + 1 < u.length; i += 2) { t[i] = u[i + 1]; t[i + 1] = u[i]; } return t; };
  // P ROM を .neo の並び (バイト入替え・$000000 固定領域が先頭) に揃える。2MB の p1 で後ろ半分にヘッダがあるもの = バンクを入れ替えて格納 → 前後1MBを入替え
  function normP(u, notes) {
    if (u.length >= 0x200000 && !psig(u, 0) && psig(u, 0x100000)) {
      const t = new Uint8Array(u.length); t.set(u.subarray(0x100000, 0x200000), 0); t.set(u.subarray(0, 0x100000), 0x100000); t.set(u.subarray(0x200000), 0x200000); u = t; notes.push('p1の前後1MBを入替え');
    }
    if (psig(u, 0) === 'pl') { u = swab(u); notes.push('Pをバイト入替え'); }
    return u;
  }
  const HINT = [['s', /fix|sfix|text|(^|[^a-z])s\d*([^a-z]|$)/], ['m', /snd|sound|z80|audio|music|(^|[^a-z])m\d*([^a-z]|$)/], ['v', /pcm|adpcm|voice|sample|wave|(^|[^a-z])v\d*([^a-z]|$)/], ['c', /spr|sprite|chr|char|gfx|obj|tile|(^|[^a-z])c\d*([^a-z]|$)/], ['p', /prog|prg|68k|main|(^|[^a-z])p\d*([^a-z]|$)/]];
  const numOf = b => { const m = b.match(/(\d+)(?!.*\d)/); return m ? +m[1] : 0; };
  const isZ80 = u => u.length <= 0x80000 && (u[0] === 0xF3 || u[0] === 0xC3 || u[0] === 0x31 || u[0] === 0x18);
  async function neoFromMame(zname, u, ents, pre) {
    if (BIOS_NAME.test(zname)) return { error: 'ネオジオのBIOSセット (' + zname + ') は使いません。BIOSは自作TEST BIOS (v0.4) に固定です。' };
    const parts = { p: [], s: [], m: [], v: [], c: [] }; const skip = [], unk = [], how = [];
    for (const f of ents) {
      const base = f.name.split('/').pop(); if (/^(\.|__MACOSX)/.test(base) || f.name.startsWith('__MACOSX/')) continue;
      if (BIOS_FILE.test(base)) return { error: 'ZIPの中にBIOSらしいファイル (' + base + ') があります。BIOSは自作TEST BIOS (v0.4) 固定なので読みません。' };
      if (/\.(txt|nfo|diz|md|xml|dat|jpg|png|htm|html)$/i.test(base)) { skip.push(base); continue; }
      let d; try { d = pre && pre.get(f) || await zipRead(u, f); } catch (e) { return { error: e.message }; }
      const ro = mameRole(base);
      if (ro && (ro.r === 'sma' || ro.r === 'ep' || ro.r === 'pg')) return { error: base + ': P ROM の保護/暗号化 (SMA・PG・EP 系) 付きのセットには対応していません (復号の資料を非GPLで確認できないため)。' };
      if (pSigAny(d) && !(ro && ro.r === 'p')) { parts.p.push({ n: ro && ro.r === 'p' ? ro.n : 1 + parts.p.length * 0, base, d, top: true }); how.push(base + '=P(シグネチャ)'); continue; }
      if (ro) { parts[ro.r].push({ n: ro.n, base, d }); continue; }
      unk.push({ base, d, n: numOf(base) });
    }
    // v5 (エミュ 2026-10-22): 決めきれないときは推定で決めず「どちらか分からない」で止める
    const AMB = (msg) => ({ error: 'どちらか分からない: ' + msg + ' 推定で決めずに止めました。ファイル名を MAME の規則 (例: xxx-p2.p2 / xxx-v2.v2 / -s1 / -m1 / -c1) に直すと読めます。', ambiguous: true });
    const topP = parts.p.filter(x => x.top);
    if (topP.length > 1 && !parts.p.some(x => !x.top)) return AMB(topP.map(x => x.base).join(' と ') + ' のどちらにも NEO-GEO シグネチャがあり、どれが P1 か決められません。');
    // 名前の手がかり (fix/snd/pcm/spr 等) → 中身 → 大きさ の順で残りを振り分け
    const rest = [];
    for (const x of unk) { const nm = x.base.toLowerCase().replace(/\.[a-z0-9]+$/, ''); const hs = HINT.filter(([, re]) => re.test(nm));
      if (new Set(hs.map(h => h[0])).size > 1) return AMB(x.base + ' は名前から ' + hs.map(h => h[0].toUpperCase()).join(' か ') + ' か決められません。');
      const h = hs[0]; if (h) { parts[h[0]].push(x); how.push(x.base + '=' + h[0].toUpperCase() + '(名前)'); } else rest.push(x); }
    if (rest.length) {
      if (!parts.c.length) { // 同じ大きさで偶数個、合計が一番大きい組 = C
        const by = new Map(); rest.forEach(x => { if (!by.has(x.d.length)) by.set(x.d.length, []); by.get(x.d.length).push(x); });
        let best = null, tie = null; for (const [sz, a] of by) if (a.length % 2 === 0 && sz >= 0x20000) { if (!best || sz * a.length > best[0] * best[1].length) { best = [sz, a]; tie = null; } else if (sz * a.length === best[0] * best[1].length) tie = [sz, a]; }
        if (tie) return AMB('C ROM の組が ' + best[1].map(x => x.base).join(',') + ' と ' + tie[1].map(x => x.base).join(',') + ' のどちらか決められません (合計の大きさが同じ)。');
        if (best) for (const x of best[1]) { parts.c.push(x); rest.splice(rest.indexOf(x), 1); how.push(x.base + '=C(大きさ)'); }
      }
      if (!parts.m.length && rest.filter(x => isZ80(x.d)).length > 1) return AMB(rest.filter(x => isZ80(x.d)).map(x => x.base).join(' と ') + ' のどれも Z80 の先頭命令で始まり、どれが M1 か決められません。');
      if (!parts.m.length) { const x = rest.find(x => isZ80(x.d)); if (x) { parts.m.push(x); rest.splice(rest.indexOf(x), 1); how.push(x.base + '=M(Z80先頭)'); } }
      if (!parts.s.length) { const sc = rest.filter(x => x.d.length <= 0x80000).sort((a, b) => a.d.length - b.d.length); if (sc.length > 1 && sc[0].d.length === sc[1].d.length) return AMB(sc.filter(x => x.d.length === sc[0].d.length).map(x => x.base).join(' と ') + ' は同じ大きさで、どれが S1 か決められません。'); }
      if (!parts.s.length) { const x = rest.filter(x => x.d.length <= 0x80000).sort((a, b) => a.d.length - b.d.length)[0]; if (x) { parts.s.push(x); rest.splice(rest.indexOf(x), 1); how.push(x.base + '=S(大きさ)'); } }
      const p1len = parts.p.length ? Math.max(...parts.p.map(x => x.d.length)) : 0;
      if (rest.length && p1len >= 0x100000 && (parts.v.length || rest.length > 1)) return AMB(rest.map(x => x.base).join(', ') + ' が P (p2 以降) か V か決められません (P1 が ' + (p1len >> 20) + 'MB あるので p2 もありうる)。');
      for (const x of rest) { parts.v.push(x); how.push(x.base + '=V(残り' + (p1len >= 0x100000 ? '・Vが他に無いので' : '') + ')'); }
      ['c', 'v'].forEach(k => parts[k].forEach(x => { if (x.n === undefined) x.n = numOf(x.base); }));
    }
    if (parts.p.length > 1 && parts.p.some(x => x.top)) { // シグネチャのあるものを p1 に
      const t = parts.p.find(x => x.top) || parts.p.find(x => pSigAny(x.d)); parts.p.forEach(x => { if (x !== t && x.n <= t.n) x.n = t.n + 1 + x.n; }); }
    if (!parts.s.length) return { error: 'S ROM (-s1) がありません。FIX をCROMに暗号化して持つ CMC 暗号化セットと思われます。復号は非GPLの資料で確認できないので対応していません。' };
    if (!parts.p.length) return { error: 'P ROM (-p1 または NEO-GEO シグネチャのあるもの) がありません。' };
    if (!parts.m.length) return { error: 'M1 ROM (-m1) がありません。' };
    if (!parts.v.length) return { error: 'V ROM (-v1) がありません。' };
    if (parts.c.length % 2) return { error: 'C ROM の数が奇数です (c1/c2 の組で必要)。' };
    if (parts.s.length > 1 || parts.m.length > 1) return { error: 'S/M ROM が複数あります。対応していないセットです。' };
    for (const k in parts) parts[k].sort((a, b) => a.n - b.n);
    const cat = a => { const t = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of a) { t.set(x, o); o += x.length; } return t; };
    const notes = [];
    const p1 = parts.p[0].d; if (!pSigAny(p1)) notes.push('p1にNEO-GEOシグネチャなし');
    const P = cat([normP(p1, notes), ...parts.p.slice(1).map(x => x.d)]), S = parts.s[0].d, M = parts.m[0].d;
    let V1, V2 = new Uint8Array(0); const vv = parts.v;
    if (vv.every(x => x.n >= 10 && x.n < 30) && vv.some(x => x.n >= 20)) { V1 = cat(vv.filter(x => x.n < 20).map(x => x.d)); V2 = cat(vv.filter(x => x.n >= 20).map(x => x.d)); }
    else V1 = cat(vv.map(x => x.d));
    const cs = []; for (let i = 0; i < parts.c.length; i += 2) {
      const a = parts.c[i].d, b = parts.c[i + 1].d;
      if (a.length !== b.length) return { error: parts.c[i].base + ' と ' + parts.c[i + 1].base + ' の大きさが違います。' };
      const t = new Uint8Array(a.length * 2); for (let j = 0; j < a.length; j++) { t[2 * j] = a[j]; t[2 * j + 1] = b[j]; } cs.push(t);
    }
    const C = cat(cs);
    if (4096 + P.length + S.length + M.length + V1.length + V2.length + C.length > MAX) return { error: '組み立てると大きすぎます (64MBまで)。' };
    const neo = cat([new Uint8Array(4096), P, S, M, V1, V2, C]); const dv = new DataView(neo.buffer);
    neo.set([0x4E, 0x45, 0x4F, 1]); [P, S, M, V1, V2, C].forEach((x, i) => dv.setUint32(4 + 4 * i, x.length, true));
    const ngh = P.length >= 0x10a ? (P[0x109] << 8 | P[0x108]) : 0; dv.setUint32(40, ngh, true); // NGH は P ROM ヘッダ $108 (バイト入替え済みで格納なので下位/上位を入替えて読む)
    // 年・メーカー名: ROM からは分からない。チーム自作ソフト表にある NGH だけ埋め、ほかは空欄 (ゲーム画面の「ヘッダ」で編集できる)
    const team = TEAM_NEO[ngh];
    setNeoMeta(neo, { title: team ? team.title : zname.replace(/^.*\//, '').replace(/\.(zip|z\d\d|\d\d\d)$/ig, '').replace(/\.zip$/i, ''), year: team ? team.year : 0, maker: team ? team.maker : '' });
    const list = (k, a) => a.length ? k + '×' + a.length : '';
    const extra = (how.length ? ' 推定: ' + how.join(', ') : '') + (notes.length ? ' / ' + notes.join(', ') : '') + (team ? ' / 年・メーカーはチーム自作ソフト表から' : '');
    return { list: [{ core: 'neogeo', why: 'MAME形式セットを組立 (' + ['p', 's', 'm', 'v', 'c'].map(k => list(k, parts[k])).join(' ') + ')' + extra, name: zname + ' (組立)', data: neo }], skipped: skip };
  }
  // .neo ヘッダ (公開の .neo 形式): +28 年(u32) +32 ジャンル(u32) +40 NGH +44 名前(33) +77 メーカー(17)
  const TEAM_NEO = { 0x0921: { title: 'SIM GUNMA', year: 2026, maker: 'GB' } };
  function setNeoMeta(neo, m) {
    const dv = new DataView(neo.buffer, neo.byteOffset);
    const str = (o, n, t) => { neo.fill(0, o, o + n); t = String(t || '').replace(/[^\x20-\x7e]/g, '?').slice(0, n - 1); for (let i = 0; i < t.length; i++) neo[o + i] = t.charCodeAt(i); };
    if (m.title !== undefined) str(44, 33, m.title); if (m.maker !== undefined) str(77, 17, m.maker);
    if (m.year !== undefined) dv.setUint32(28, (+m.year >= 0 && +m.year < 10000) ? +m.year | 0 : 0, true);
    if (m.genre !== undefined) dv.setUint32(32, +m.genre | 0, true);
    return neo;
  }
  function getNeoMeta(neo) { const dv = new DataView(neo.buffer, neo.byteOffset); const str = (o, n) => String.fromCharCode(...neo.subarray(o, o + n)).replace(/\0[\s\S]*$/, '');
    return { title: str(44, 33), maker: str(77, 17), year: dv.getUint32(28, true), genre: dv.getUint32(32, true), ngh: dv.getUint32(40, true) }; }
  // ZIP の中から ROM を探す。戻り値 {list:[{name,core,why,data}]} / {error}
  async function fromZip(zname, u, starts) {
    let ents; try { ents = zipList(u, starts); } catch (e) { return { error: e.message }; }
    if (BIOS_NAME.test(zname)) return { error: 'BIOSセット (' + zname + ') は使いません。BIOSは各機種ともチーム自作/オープンのものに固定です。' };
    if (looksMame(ents.map(f => f.name))) return neoFromMame(zname, u, ents);
    const ok = [], bad = [], pre = new Map();
    for (const f of ents) {
      const base = f.name.split('/').pop();
      if (/^(\.|__MACOSX)/.test(base) || f.name.startsWith('__MACOSX/')) continue;
      let d; try { d = await zipRead(u, f); } catch (e) { bad.push(e.message); continue; }
      pre.set(f, d);
      const r = detect(base, d);
      if (r.error) bad.push(base + ': ' + r.error); else ok.push({ ...r, name: zname + ' / ' + f.name, data: d });
    }
    // 名前が規則外でも、P ROM シグネチャ (NEO-GEO) を持つ中身があり .neo/他機種として読めないならネオジオのセットとして組立
    if (!ok.some(r => r.core === 'neogeo') && [...pre.values()].some(d => pSigAny(d) && !(d.length >= 4096 && d[0] === 0x4E && d[1] === 0x45 && d[2] === 0x4F && d[3] === 1))) return neoFromMame(zname, u, ents, pre);
    if (!ok.length) {
      const bios = bad.find(m => m.includes('BIOS'));
      return { error: 'ZIPの中に読めるROMがありません。' + (bios ? ' ' + bios : bad.length ? ' (' + bad.slice(0, 3).join(' / ') + ')' : '') };
    }
    return { list: ok, skipped: bad };
  }
  // 複数あるときの選択 (選ぶまで待つ)。テスト用に window.__zipPick にも出す
  function pick(list) {
    return new Promise(res => {
      const ov = document.createElement('div'); ov.id = 'zip-pick'; ov.className = 'zip-pick';
      const box = document.createElement('div'); box.className = 'zip-box';
      box.innerHTML = '<div class="zip-title">ZIPの中に複数のROMがあります。遊ぶものを選んでください。</div>';
      list.forEach((r, i) => { const bt = document.createElement('button'); bt.dataset.i = i; bt.textContent = r.name.split(' / ').pop() + ' — ' + r.why; bt.onclick = () => { ov.remove(); res(r); }; box.appendChild(bt); });
      const cancel = document.createElement('button'); cancel.className = 'zip-cancel'; cancel.textContent = 'やめる'; cancel.onclick = () => { ov.remove(); res(null); }; box.appendChild(cancel);
      ov.appendChild(box); document.body.appendChild(ov);
    });
  }
  async function hash(u) {
    try { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', u)); return [...h.subarray(0, 8)].map(b => b.toString(16).padStart(2, '0')).join(''); }
    catch (e) { let h = 0x811c9dc5; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619) >>> 0; return 'f' + h.toString(16) + u.length.toString(16); }
  }
  const MAX = 64 << 20;
  async function fromZipBytes(name, u, starts) {
    const z = await fromZip(name, u, starts); if (z.error) return z;
    const r = z.list.length === 1 ? z.list[0] : await pick(z.list);
    if (!r) return { error: '読込をやめました。' };
    return { ...r, hash: await hash(r.data) };
  }
  async function fromFile(f) {
    if (f.size > MAX) return { error: 'ファイルが大きすぎます (64MBまで)。' };
    const u = new Uint8Array(await f.arrayBuffer());
    if (/\.z\d\d$/i.test(f.name)) return { error: '分割ZIPの一部です。.z01 … .zip を全部まとめて選んでください。' };
    if (isZip(u) || ext(f.name) === 'zip') return fromZipBytes(f.name, u);
    const d = detect(f.name, u); if (d.error) return d;
    return { ...d, name: f.name, data: u, hash: await hash(u) };
  }
  // 複数ファイル: 分割ZIP (.z01, .z02, … と最後の .zip) なら結合して読む。それ以外は1つずつ。
  // 7-Zip の -v 分割 (name.zip.001, .002 …) は ZIP をバイト単位で切っただけなので、番号順に結合して普通の ZIP として読む。.7z.001 は対象外。
  async function fromVolumes(files) {
    const vol = f => f.name.match(/^(.*)\.(\d{3})$/);
    const stems = new Set(files.map(f => vol(f)[1])); if (stems.size > 1) return { error: '違う名前の分割ファイルが混ざっています。' };
    const stem = [...stems][0]; if (/\.7z$/i.test(stem)) return { error: '.7z 形式には対応していません (7-Zip で ZIP 形式 (-tzip) にしてください)。' };
    const ord = files.slice().sort((a, b) => +vol(a)[2] - +vol(b)[2]);
    for (let i = 0; i < ord.length; i++) if (+vol(ord[i])[2] !== i + 1) return { error: '分割ファイルの .' + String(i + 1).padStart(3, '0') + ' がありません。' };
    const total = ord.reduce((s, f) => s + f.size, 0); if (total > MAX * 2) return { error: '分割ファイルが大きすぎます。' };
    const u = new Uint8Array(total); let o = 0; for (const f of ord) { u.set(new Uint8Array(await f.arrayBuffer()), o); o += f.size; }
    if (!isZip(u)) return { error: '結合しても ZIP になりません (.001 から全部まとめて選んでください)。' };
    return fromZipBytes(stem, u);
  }
  async function fromFiles(files) {
    files = [...files];
    if (files.every(f => /\.\d{3}$/.test(f.name))) return fromVolumes(files);
    if (files.length === 1) return fromFile(files[0]);
    const segs = files.filter(f => /\.(z\d\d|zip)$/i.test(f.name));
    if (segs.length !== files.length || !segs.some(f => /\.z\d\d$/i.test(f.name))) return { error: 'ファイルは1つずつ選んでください (分割ZIPの .z01 … .zip だけはまとめて選べます)。' };
    const stem = n => n.replace(/\.(z\d\d|zip)$/i, ''); if (new Set(segs.map(f => stem(f.name))).size > 1) return { error: '違う名前の分割ZIPが混ざっています。' };
    const last = segs.filter(f => /\.zip$/i.test(f.name)); if (last.length !== 1) return { error: '分割ZIPの最後の .zip がありません。' };
    const nums = segs.filter(f => /\.z\d\d$/i.test(f.name)).map(f => +f.name.slice(-2)).sort((a, b) => a - b);
    for (let i = 0; i < nums.length; i++) if (nums[i] !== i + 1) return { error: '分割ZIPの .z' + String(i + 1).padStart(2, '0') + ' がありません。' };
    const ord = nums.map(n => segs.find(f => f.name.toLowerCase().endsWith('.z' + String(n).padStart(2, '0')))).concat(last);
    const total = ord.reduce((s, f) => s + f.size, 0); if (total > MAX * 2) return { error: '分割ZIPが大きすぎます。' };
    const u = new Uint8Array(total), starts = []; let o = 0;
    for (const f of ord) { starts.push(o); u.set(new Uint8Array(await f.arrayBuffer()), o); o += f.size; }
    return fromZipBytes(last[0].name, u, starts);
  }
  // 選択画面とゲーム画面で共用: input と drop 先を結びつけ、判定できたら onRom(rom) を呼ぶ
  function bind(input, dropEl, onRom, onMsg) {
    const take = async files => { if (!files || !files.length) return; onMsg('読込中: ' + [...files].map(f => f.name).join(', '));
      const r = await fromFiles(files); if (r.error) onMsg(r.error); else onRom(r); };
    input.addEventListener('change', () => { take(input.files); input.value = ''; });
    const tgt = dropEl || document.body;
    ['dragenter', 'dragover'].forEach(t => tgt.addEventListener(t, e => { e.preventDefault(); tgt.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => tgt.addEventListener(t, e => { e.preventDefault(); tgt.classList.remove('over'); }));
    tgt.addEventListener('drop', e => take(e.dataTransfer && e.dataTransfer.files));
  }
  return { detect, fromFile, fromFiles, bind, hash, fromZip, isZip, zipList, mameRole, setNeoMeta, getNeoMeta, psig };
})();
