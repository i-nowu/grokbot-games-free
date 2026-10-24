// 第17回 (2026-10-24 エミュ): バックアップファイル .mebak (ステート・サムネイル・セーブ)。自作。MD5 は RFC 1321 の手順どおりに自作。
// 形式: "MEBAK001" + u32LE ヘッダ長 + JSON {format:'multiemu-backup', version:1, scope, created, count, items:[{store,key,size,sha256,md5,meta}]} + 各項目のバイト列 (並び順)。
// 第20回: 版2 = 各項目に at (ISO 日時、不明なら '') を足した。版1 も読める (日時不明として返す)。
// 第25回: 版3 = store 'reasons' を足した (理由の記録。キー 'archive/YYYY-MM-DD' | 'ls/keptReasonArchive' | 'ls/keptReason'、中身は JSON 配列の UTF-8)。reasons がないときは版2 のまま書く。
// store: 'states' (MESTATE1 のバイト列) / 'thumbs' (画像のバイト列、meta={type,w,h,src?}) / 'saves' (セーブのバイト列、meta={romHash?,romName?})
window.MultiEmuBackup = (() => {
  const MAGIC = 'MEBAK001', enc = new TextEncoder(), dec = new TextDecoder();
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
  function md5(u8) {
    const n = u8.length, L = ((n + 8) >>> 6) + 1 << 6, m = new Uint8Array(L); m.set(u8); m[n] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(L - 8, (n * 8) >>> 0, true); dv.setUint32(L - 4, Math.floor(n / 536870912), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476; const M = new Uint32Array(16);
    for (let o = 0; o < L; o += 64) { for (let i = 0; i < 16; i++) M[i] = dv.getUint32(o + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) { let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; } else { F = C ^ (B | ~D); g = (7 * i) & 15; }
        F = (F + A + K[i] + M[g]) >>> 0; A = D; D = C; C = B; B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0; }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0; }
    const out = new DataView(new ArrayBuffer(16)); [a0, b0, c0, d0].forEach((v, i) => out.setUint32(i * 4, v, true));
    return [...new Uint8Array(out.buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const STORES = ['states', 'thumbs', 'saves', 'reasons'], RKEY = /^(archive\/(\d{4}-\d\d-\d\d|unknown)|ls\/keptReasonArchive|ls\/keptReason)$/;
  async function pack(scope, entries /* [{store,key,u8,meta}] */, sha) {
    const items = []; for (const e of entries) items.push({ store: e.store, key: e.key, size: e.u8.length, sha256: await sha(e.u8), md5: md5(e.u8), meta: e.meta || {}, at: e.at || '' });
    const head = { format: 'multiemu-backup', version: entries.some(e => e.store === 'reasons') ? 3 : 2, scope, created: new Date().toISOString(), count: items.length, items };
    const j = enc.encode(JSON.stringify(head)), total = entries.reduce((a, e) => a + e.u8.length, 0), out = new Uint8Array(12 + j.length + total);
    out.set(enc.encode(MAGIC)); new DataView(out.buffer).setUint32(8, j.length, true); out.set(j, 12);
    let o = 12 + j.length; for (const e of entries) { out.set(e.u8, o); o += e.u8.length; } return out;
  }
  async function unpack(u8, sha, unpackState) {
    if (!u8 || u8.length < 12) return { error: 'バックアップファイルが短すぎます。' };
    const m = dec.decode(u8.subarray(0, 8));
    if (/^MEBAK\d{3}$/.test(m) && m !== MAGIC) return { error: 'バックアップファイルの版 (' + m.slice(5) + ') に対応していません。' };
    if (m !== MAGIC) return { error: 'バックアップファイルの形式ではありません (先頭が MEBAK001 ではない)。' };
    const n = new DataView(u8.buffer, u8.byteOffset).getUint32(8, true); if (12 + n > u8.length) return { error: 'バックアップファイルが壊れています (ヘッダ長が不正)。' };
    let h; try { h = JSON.parse(dec.decode(u8.subarray(12, 12 + n))); } catch (e) { return { error: 'バックアップファイルが壊れています (ヘッダを読めない)。' }; }
    if (h.format !== 'multiemu-backup') return { error: 'バックアップファイルの形式名が違います (' + h.format + ')。' };
    if (h.version !== 1 && h.version !== 2 && h.version !== 3) return { error: 'バックアップファイルの版 (' + h.version + ') に対応していません。' };
    if (!Array.isArray(h.items) || h.items.length !== h.count) return { error: 'バックアップファイルが壊れています (項目数が合わない)。' };
    const total = h.items.reduce((a, it) => a + (it.size | 0), 0); if (12 + n + total !== u8.length) return { error: 'バックアップファイルが壊れています (大きさが合わない: ' + u8.length + ' / ' + (12 + n + total) + ')。' };
    const out = []; let o = 12 + n;
    for (const it of h.items) {
      if (!STORES.includes(it.store) || (it.store === 'reasons' && h.version < 3)) return { error: 'バックアップファイルの項目の種類 (' + it.store + ') に対応していません。' };
      if (typeof it.key !== 'string' || !it.key) return { error: 'バックアップファイルが壊れています (キーがない項目)。' };
      if (h.version >= 2 && it.at != null && (typeof it.at !== 'string' || (it.at && isNaN(new Date(it.at))))) return { error: 'バックアップファイルが壊れています (' + it.key + ' の日時が不正)。' };
      const b = u8.slice(o, o + it.size); o += it.size;
      if (await sha(b) !== it.sha256) return { error: 'バックアップファイルが壊れています (' + it.store + ' ' + it.key + ' の SHA-256 が合わない)。' };
      if (md5(b) !== it.md5) return { error: 'バックアップファイルが壊れています (' + it.store + ' ' + it.key + ' の MD5 が合わない)。' };
      if (it.store === 'states' && unpackState(b).error) return { error: 'バックアップファイルの項目 ' + it.key + ' がステートの形式ではありません。' };
      if (it.store === 'thumbs' && !/^image\/(webp|png)$/.test((it.meta && it.meta.type) || '')) return { error: 'バックアップファイルのサムネイル ' + it.key + ' の種類 (' + (it.meta && it.meta.type) + ') に対応していません。' };
      if (it.store === 'reasons') { if (!RKEY.test(it.key)) return { error: 'バックアップファイルの理由の記録のキー (' + it.key + ') に対応していません。' }; let a; try { a = JSON.parse(dec.decode(b)); } catch (e) { a = null; } if (!Array.isArray(a)) return { error: 'バックアップファイルの理由の記録 ' + it.key + ' が配列ではありません。' }; }
      out.push({ store: it.store, key: it.key, u8: b, meta: it.meta || {}, md5: it.md5, sha256: it.sha256, at: h.version >= 2 ? (it.at || '') : '' }); }
    return { head: h, entries: out };
  }
  return { md5, pack, unpack, MAGIC };
})();
