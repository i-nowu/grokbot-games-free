// 共通ステートセーブ/ロード (第10回 2026-10-23 エミュ)。全コア共通。保存先は IndexedDB 'multiemu'/'states'。
// キー = <ROMの中身の SHA-256 (16進32桁)>/<コアID>/<スロット>。ROMごと・コアごとに分かれる。
// ファイル形式 (書き出し/取り込みも同じ): "MESTATE1" + u32LE ヘッダ長 + ヘッダ JSON (UTF-8) + コアのステート本体。
// ヘッダ: {fmt:1, core, coreVersion, variant, romHash, romName, frame, savedAt, size, bodyHash}
// 読込時に 形式・コア・コアのステート版・機種バリエーション・ROMハッシュ・本体ハッシュ を照合し、違えば理由を返して読まない。
window.MultiEmuState = (() => {
  const MAGIC = 'MESTATE1', enc = new TextEncoder(), dec = new TextDecoder();
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const sha = async u8 => hex(await crypto.subtle.digest('SHA-256', u8));
  function pack(h, body) { const j = enc.encode(JSON.stringify(h)), out = new Uint8Array(8 + 4 + j.length + body.length);
    out.set(enc.encode(MAGIC)); new DataView(out.buffer).setUint32(8, j.length, true); out.set(j, 12); out.set(body, 12 + j.length); return out; }
  function unpack(u8) {
    if (!u8 || u8.length < 12 || dec.decode(u8.subarray(0, 8)) !== MAGIC) return { error: 'ステートの形式ではありません (先頭が MESTATE1 ではない)。' };
    const n = new DataView(u8.buffer, u8.byteOffset).getUint32(8, true); if (12 + n > u8.length) return { error: 'ステートが壊れています (ヘッダ長が不正)。' };
    let h; try { h = JSON.parse(dec.decode(u8.subarray(12, 12 + n))); } catch (e) { return { error: 'ステートが壊れています (ヘッダを読めない)。' }; }
    return { h, body: u8.subarray(12 + n) };
  }
  // ctx = { core, variant, romHash, romName, frame() }
  async function make(ctx) {
    const body = ctx.core.getState(); if (!body) throw new Error('このコアはステートを作れませんでした。');
    const h = { fmt: 1, core: ctx.core.id, coreVersion: ctx.core.stateVersion, variant: ctx.variant || '', romHash: ctx.romHash, romName: ctx.romName,
      frame: ctx.frame(), savedAt: new Date().toISOString(), size: body.length, bodyHash: await sha(body) };
    return pack(h, body);
  }
  async function check(ctx, u8, skipVer) {
    const r = unpack(u8); if (r.error) return r; const { h, body } = r;
    if (h.fmt !== 1) return { error: 'ステート形式の版 (' + h.fmt + ') に対応していません。' };
    if (h.core !== ctx.core.id) return { error: '別の機種のステートです (ステート: ' + h.core + ' / 今: ' + ctx.core.id + ')。読み込みません。' };
    if (h.romHash !== ctx.romHash) return { error: '別のROMのステートです (ステート: ' + (h.romName || '?') + ' ' + String(h.romHash).slice(0, 8) + '… / 今: ' + ctx.romHash.slice(0, 8) + '…)。読み込みません。' };
    if (!skipVer && h.coreVersion !== ctx.core.stateVersion) return { error: 'コアの版が違うステートです (ステート: ' + h.coreVersion + ' / 今: ' + ctx.core.stateVersion + ')。読み込みません。' };
    if ((h.variant || '') !== (ctx.variant || '')) return { error: '機種の設定が違うステートです (ステート: ' + (h.variant || 'なし') + ' / 今: ' + (ctx.variant || 'なし') + ')。読み込みません。' };
    if (h.size !== body.length || h.bodyHash !== await sha(body)) return { error: 'ステートの中身が壊れています (大きさかハッシュが合わない)。読み込みません。' };
    return { h, body };
  }
  // ---- 版の移し替え (第11回) ----
  // コアは stateMigrations: [{from, to, run(body, header) → {body} | {error}}] と stateNoMigrate: {版: 理由} を持てる。
  // ステートの版から今の版まで from→to を順につなぎ、どこかで道が無い・理由付きで不可・変換が失敗 なら推測せず止める。
  // 元のステートは書き換えない (新しい Uint8Array を返す)。
  async function migrate(ctx, u8) {
    const r = unpack(u8); if (r.error) return r; const { h, body } = r, cur = ctx.core.stateVersion;
    if (h.coreVersion === cur) return { u8, migrated: false };
    // 版以外 (機種・ROM・設定・中身) は先に照合する
    const pre = await check(ctx, u8, true); if (pre.error) return pre;
    const list = ctx.core.stateMigrations || [], no = ctx.core.stateNoMigrate || {}, chain = [h.coreVersion];
    let v = h.coreVersion, b = body;
    for (let i = 0; v !== cur; i++) {
      if (i > 16) return { error: '版の移し替えの道がつながりません (ループ)。読み込みません。' };
      if (no[v]) return { error: 'コアの版 ' + v + ' のステートは今の版へ移し替えられません: ' + no[v] + '。読み込みません。' };
      const m = list.find(x => x.from === v);
      if (!m) return { error: 'コアの版が違うステートで、移し替える方法がありません (ステート: ' + v + ' / 今: ' + cur + ')。読み込みません。' };
      let o; try { o = m.run(b, h); } catch (e) { o = { error: e.message }; }
      if (!o || o.error || !o.body) return { error: '版 ' + m.from + ' → ' + m.to + ' の移し替えに失敗しました: ' + ((o && o.error) || '結果なし') + '。読み込みません。' };
      b = o.body; v = m.to; chain.push(v);
    }
    const nh = Object.assign({}, h, { coreVersion: cur, size: b.length, bodyHash: await sha(b), migratedFrom: chain.slice(0, -1).concat(h.migratedFrom || []), migratedAt: new Date().toISOString() });
    return { u8: pack(nh, b), migrated: true, chain };
  }
  async function apply(ctx, u8) { const mg = await migrate(ctx, u8); if (mg.error) return mg; u8 = mg.u8;
    const r = await check(ctx, u8); if (r.error) return r;
    const undo = ctx.core.getState();  // 失敗したときに元へ戻すための控え
    if (!ctx.core.setState(r.body)) { if (undo) ctx.core.setState(undo); return { error: 'コアがステートを受け付けませんでした。読み込みを中止し、元の状態に戻しました。' }; }
    return { h: r.h, migrated: mg.migrated ? u8 : null, chain: mg.chain }; }
  // ---- 古いステートのまとめファイル (第12回) ----
  // 形式: "MEARCH01" + u32LE ヘッダ長 + ヘッダ JSON + 各項目の本体を順に連結。
  // ヘッダ {format:'multiemu-state-archive', version:1, created, count, items:[{key, size, sha256, core, romName, romHash, coreVersion, savedAt}]}
  // 読むときは 形式・版・項目数・大きさの合計・各項目の SHA-256 をすべて確かめてから返す (1つでも合わなければ何も返さない)。
  const AMAGIC = 'MEARCH01';
  // 第13回: 版2 = 項目に thumb {type,size,sha256} (任意) を足し、本体の各ステートの直後にサムネイルのバイト列を置く。版1 も読める。
  async function archPack(entries /* [{key, u8, thumb?:{type,u8,w,h}}] */) {
    const items = [], parts = [];
    for (const e of entries) { const u = unpack(e.u8), h = u.h || {};
      const it = { key: e.key, size: e.u8.length, sha256: await sha(e.u8), core: h.core || '', romName: h.romName || '', romHash: h.romHash || '', coreVersion: h.coreVersion || '', savedAt: h.savedAt || '' };
      parts.push(e.u8);
      if (e.thumb && e.thumb.u8 && e.thumb.u8.length) { it.thumb = { type: e.thumb.type, w: e.thumb.w | 0, h: e.thumb.h | 0, size: e.thumb.u8.length, sha256: await sha(e.thumb.u8) }; parts.push(e.thumb.u8); }
      items.push(it); }
    const head = { format: 'multiemu-state-archive', version: 2, created: new Date().toISOString(), count: items.length, items };
    const j = enc.encode(JSON.stringify(head)), total = parts.reduce((a, b) => a + b.length, 0), out = new Uint8Array(12 + j.length + total);
    out.set(enc.encode(AMAGIC)); new DataView(out.buffer).setUint32(8, j.length, true); out.set(j, 12);
    let o = 12 + j.length; for (const b of parts) { out.set(b, o); o += b.length; } return out;
  }
  async function archUnpack(u8) {
    if (!u8 || u8.length < 12 || dec.decode(u8.subarray(0, 8)) !== AMAGIC) return { error: 'まとめファイルの形式ではありません (先頭が MEARCH01 ではない)。' };
    const n = new DataView(u8.buffer, u8.byteOffset).getUint32(8, true); if (12 + n > u8.length) return { error: 'まとめファイルが壊れています (ヘッダ長が不正)。' };
    let h; try { h = JSON.parse(dec.decode(u8.subarray(12, 12 + n))); } catch (e) { return { error: 'まとめファイルが壊れています (ヘッダを読めない)。' }; }
    if (h.format !== 'multiemu-state-archive') return { error: 'まとめファイルの形式名が違います (' + h.format + ')。' };
    if (h.version !== 1 && h.version !== 2) return { error: 'まとめファイルの版 (' + h.version + ') に対応していません。' };
    if (!Array.isArray(h.items) || h.items.length !== h.count) return { error: 'まとめファイルが壊れています (項目数が合わない)。' };
    const tsz = it => h.version >= 2 && it.thumb ? (it.thumb.size | 0) : 0; const total = h.items.reduce((a, it) => a + (it.size | 0) + tsz(it), 0); if (12 + n + total !== u8.length) return { error: 'まとめファイルが壊れています (大きさが合わない: ' + u8.length + ' / ' + (12 + n + total) + ')。' };
    const out = []; let o = 12 + n;
    for (const it of h.items) { if (typeof it.key !== 'string' || !it.key) return { error: 'まとめファイルが壊れています (キーがない項目)。' };
      const b = u8.slice(o, o + it.size); o += it.size;
      if (await sha(b) !== it.sha256) return { error: 'まとめファイルが壊れています (項目 ' + it.key + ' のハッシュが合わない)。' };
      if (unpack(b).error) return { error: 'まとめファイルの項目 ' + it.key + ' がステートの形式ではありません。' };
      let thumb = null; if (tsz(it)) { const tb = u8.slice(o, o + it.thumb.size); o += it.thumb.size;
        if (!/^image\/(webp|png)$/.test(it.thumb.type || '')) return { error: 'まとめファイルの項目 ' + it.key + ' のサムネイルの種類 (' + it.thumb.type + ') に対応していません。' };
        if (await sha(tb) !== it.thumb.sha256) return { error: 'まとめファイルが壊れています (項目 ' + it.key + ' のサムネイルのハッシュが合わない)。' };
        thumb = { type: it.thumb.type, w: it.thumb.w | 0, h: it.thumb.h | 0, u8: tb }; }
      out.push({ key: it.key, u8: b, meta: it, thumb }); }
    return { head: h, entries: out };
  }
  // ---- 第14回: 書き出しファイル .mestate 版2 = "MESTATE2" + u32LE ヘッダ長 + JSON {fmt:2, state:{size,sha256}, thumb:{type,w,h,size,sha256}|null} + 版1のステート + サムネイル。
  // 版1 (先頭 MESTATE1、サムネイルなし) もそのまま読める。中のステートは版1のまま (IndexedDB の形式は変えない)。
  const FMAGIC2 = 'MESTATE2';
  async function fileMake(state, thumb) { const t = thumb && thumb.u8 && thumb.u8.length ? thumb : null;
    const h = { fmt: 2, state: { size: state.length, sha256: await sha(state) }, thumb: t ? { type: t.type, w: t.w | 0, h: t.h | 0, size: t.u8.length, sha256: await sha(t.u8) } : null };
    const j = enc.encode(JSON.stringify(h)), out = new Uint8Array(12 + j.length + state.length + (t ? t.u8.length : 0));
    out.set(enc.encode(FMAGIC2)); new DataView(out.buffer).setUint32(8, j.length, true); out.set(j, 12); out.set(state, 12 + j.length); if (t) out.set(t.u8, 12 + j.length + state.length); return out; }
  async function fileUnpack(u8) {
    if (!u8 || u8.length < 12) return { error: 'ステートファイルが短すぎます。' };
    const m = dec.decode(u8.subarray(0, 8));
    if (m === MAGIC) return { ver: 1, state: u8, thumb: null };
    if (/^MESTATE\d$/.test(m) && m !== FMAGIC2) return { error: 'ステートファイルの版 (' + m.slice(7) + ') に対応していません。' };
    if (m !== FMAGIC2) return { error: 'ステートの形式ではありません (先頭が MESTATE1/MESTATE2 ではない)。' };
    const n = new DataView(u8.buffer, u8.byteOffset).getUint32(8, true); if (12 + n > u8.length) return { error: 'ステートファイルが壊れています (ヘッダ長が不正)。' };
    let h; try { h = JSON.parse(dec.decode(u8.subarray(12, 12 + n))); } catch (e) { return { error: 'ステートファイルが壊れています (ヘッダを読めない)。' }; }
    if (h.fmt !== 2) return { error: 'ステートファイルの版 (' + h.fmt + ') に対応していません。' };
    if (!h.state || !(h.state.size > 0)) return { error: 'ステートファイルが壊れています (ステートの大きさがない)。' };
    const ts = h.thumb ? h.thumb.size | 0 : 0;
    if (12 + n + h.state.size + ts !== u8.length) return { error: 'ステートファイルが壊れています (大きさが合わない: ' + u8.length + ' / ' + (12 + n + h.state.size + ts) + ')。' };
    const st = u8.slice(12 + n, 12 + n + h.state.size);
    if (await sha(st) !== h.state.sha256) return { error: 'ステートファイルが壊れています (ステートのハッシュが合わない)。' };
    if (unpack(st).error) return { error: 'ステートファイルの中身がステートの形式ではありません。' };
    let thumb = null;
    if (h.thumb) { if (!/^image\/(webp|png)$/.test(h.thumb.type || '')) return { error: 'サムネイルの種類 (' + h.thumb.type + ') に対応していません。' };
      const tb = u8.slice(12 + n + h.state.size); if (await sha(tb) !== h.thumb.sha256) return { error: 'ステートファイルが壊れています (サムネイルのハッシュが合わない)。' };
      thumb = { type: h.thumb.type, w: h.thumb.w | 0, h: h.thumb.h | 0, u8: tb }; }
    return { ver: 2, state: st, thumb };
  }
  return { make, fileMake, fileUnpack, check, apply, migrate, archPack, archUnpack, unpack, pack, sha, SLOTS: 4 };
})();
