// ネオジオ メモリーカード形式 (2KiB 8ビットカード、カードのバイト i = 2KB ファイルの i 番目)。エミュ 2026-10-23
// 根拠: neogeodev wiki "Memory card" (Data format: Header / Directory / FAT 1 / FAT 2 / Game Data) と "CARD" のみ。
// SNK / Universe BIOS のコード・ダンプは見ていない。公開資料に無い点 (FAT チェックサムの計算式など) は自作TEST BIOS v0.5 と同じ独自の決め事。
(function (G) {
  const NBLK = 32, DIR = 0x40, NDIR = 32, FAT1 = 0xC0, FAT2 = 0x100, MAGIC = [0x4E, 0x45, 0x4F, 0x2D, 0x47, 0x45, 0x4F, 0x80];
  const sum = (c, o) => { let s = 0; for (let i = 0; i < 64; i++) s = (s + c[o + i]) & 255; return s; };
  const isNew = c => !!c && c.length >= 0x800 && MAGIC.every((m, i) => c[0x20 + 2 * i] === m);
  const isOld = c => !!c && c.length >= 0x800 && String.fromCharCode(...c.subarray(0, 8)) === 'GBMCARD1';
  function format(region = 0) {
    const c = new Uint8Array(0x800); c[0xA] = 0x10; MAGIC.forEach((m, i) => c[0x20 + 2 * i] = m); c[0x30] = region;
    for (let e = 0; e < NDIR; e++) c[DIR + 4 * e] = 0xFF;
    for (let b = 0; b < 64; b++) if (b < 5 || b >= NBLK) c[FAT1 + b] = c[FAT2 + b] = 2;
    c[0xD] = sum(c, FAT1); c[0xE] = sum(c, FAT2); return c;
  }
  // 旧独自形式 (v0.3/v0.4 "GBMCARD1") → 公開形式。消えたセーブ (入りきらない) は dropped に入れる。
  function migrate(old) {
    const c = format(), dropped = [], moved = []; let nb = 5, ne = 0;
    if (old[0x90] || old.subarray(0x90, 0xA0).some(x => x)) { c.set(old.subarray(0x90, 0xA0), 0x10); c[0xF] = 1; }
    for (let e = 0; e < 16; e++) { const o = 0x10 + 8 * e; if (old[o] !== 0xA5) continue;
      const fcb = old[o + 1] << 8 | old[o + 2], sub = old[o + 3] & 15, first = old[o + 4], n = old[o + 5], size = old[o + 6] << 8 | old[o + 7];
      if (!n || nb + n > NBLK || ne >= NDIR || 0x100 + 64 * (first + n) > 0x800) { dropped.push({ fcb, sub, size }); continue; }
      c[DIR + 4 * ne] = sub; c[DIR + 4 * ne + 1] = fcb >> 8; c[DIR + 4 * ne + 2] = fcb & 255; c[DIR + 4 * ne + 3] = nb; ne++;
      for (let k = 0; k < n; k++) { c.set(old.subarray(0x100 + 64 * (first + k), 0x100 + 64 * (first + k + 1)), (nb + k) * 64);
        c[FAT1 + nb + k] = c[FAT2 + nb + k] = k === n - 1 ? 1 : nb + k + 1; }
      moved.push({ fcb, sub, size, blocks: n, first: nb }); nb += n;
    }
    c[0xD] = sum(c, FAT1); c[0xE] = sum(c, FAT2); return { card: c, moved, dropped };
  }
  // 公開形式どおりかを調べる (テスト用)。saves: [{sub, ngh, first, blocks:[...], data}]
  function inspect(c) {
    const r = { magic: isNew(c), card_size: c[0xA] << 8 | c[0xB], zero0_9: c.subarray(0, 10).every(x => !x), fat1_sum_ok: sum(c, FAT1) === c[0xD], fat2_sum_ok: sum(c, FAT2) === c[0xE],
      fat_mirror: c.subarray(FAT1, FAT1 + 64).every((x, i) => x === c[FAT2 + i]), reserved_ok: [0, 1, 2, 3, 4].every(b => c[FAT1 + b] === 2), region: c[0x30],
      name_flag: c[0xF], name: String.fromCharCode(...c.subarray(0x10, 0x20)).replace(/\0+$/, ''), saves: [], errors: [] };
    const used = new Set();
    for (let e = 0; e < NDIR; e++) { const o = DIR + 4 * e; if (c[o] === 0xFF) continue;
      const s = { entry: e, sub: c[o], ngh: (c[o + 1] << 8 | c[o + 2]).toString(16), first: c[o + 3], blocks: [] }; let b = s.first;
      for (let g = 0; g < NBLK; g++) { if (b < 5 || b >= NBLK || used.has(b)) { r.errors.push(`entry ${e}: bad block ${b}`); break; }
        used.add(b); s.blocks.push(b); const n = c[FAT1 + b]; if (n === 1) break; b = n; }
      s.data = Array.from(c.subarray(s.blocks[0] * 64 || 0, (s.blocks[0] || 0) * 64 + 64)); s.title = String.fromCharCode(...s.data.slice(0, 20)); r.saves.push(s); }
    for (let b = 5; b < NBLK; b++) { const v = c[FAT1 + b]; if (v && !used.has(b)) r.errors.push(`block ${b} marked ${v} but in no chain`); }
    r.free_blocks = [...Array(NBLK - 5).keys()].filter(i => !c[FAT1 + 5 + i]).length;
    r.ok = r.magic && r.card_size === 0x1000 && r.zero0_9 && r.fat1_sum_ok && r.fat2_sum_ok && r.fat_mirror && r.reserved_ok && !r.errors.length; return r;
  }
  const read = (c, s) => { const out = []; for (const b of s.blocks) out.push(...c.subarray(b * 64, b * 64 + 64)); return out; };
  G.NeoCardFmt = { isNew, isOld, format, migrate, inspect, read, sum };
})(typeof window !== 'undefined' ? window : globalThis);
