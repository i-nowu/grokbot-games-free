// Atari Lynx .lnx ヘッダ (64バイト) の解析と検査。エミュ作 2026-10-23。
// 根拠 (公開資料のみ): Handy 0.97 の cart.h LYNX_HEADER 構造体 (zlib, K. Wilkins) / 「.LNX Cartridge format」Fileformat.txt (ShowLNX 付属) /
//   atarilynxdeveloper「file formats」/ EEPROM バイト ($3C) の値は Handy の eeprom.cpp・cart.h (下位3bit=種類, 0x40=SD, 0x80=8bit) に合わせる。
// 方針: 壊れた値・対応していない値は推測で直さず {error} を返して止める。
window.LnxHdr = (() => {
  const PAGE = [0x000, 0x100, 0x200, 0x400, 0x800], EE = ['なし', '93C46', '93C56', '93C66', '93C76', '93C86'], ROT = ['なし', '左 (反時計回り)', '右 (時計回り)'];
  const le16 = (u, o) => u[o] | u[o + 1] << 8;
  const str = (u, o, n, what) => { let s = '', end = false;
    for (let i = 0; i < n; i++) { const c = u[o + i]; if (c === 0) { end = true; continue; }
      if (end) return { error: what + ' の 0 の後ろに文字があります (壊れたヘッダ)。' };
      if (c < 0x20 || c > 0x7e) return { error: what + ' に表示できない文字 (0x' + c.toString(16).padStart(2, '0') + ') があります (壊れたヘッダ)。' };
      s += String.fromCharCode(c); }
    return { s }; };
  // 戻り値 {info} または {error}。info.boot: 'own' (先頭に自作 BS93 ローダー) / 'encrypted' (暗号化ローダー → 未対応)
  function parse(u) {
    const E = m => ({ error: '.lnx ' + m });
    if (!u || u.length < 64) return E('ヘッダが 64 バイトに足りません (壊れたファイル)。');
    if (String.fromCharCode(u[0], u[1], u[2], u[3]) !== 'LYNX') return E('先頭のマジック "LYNX" がありません (壊れたヘッダ)。');
    const b0 = le16(u, 4), b1 = le16(u, 6), ver = le16(u, 8);
    if (ver !== 1) return E('ヘッダのバージョンが ' + ver + ' です。対応しているのは 1 だけです (未対応)。');
    if (!PAGE.includes(b0) || b0 === 0) return E('バンク0 のページサイズ 0x' + b0.toString(16) + ' は仕様外です (256/512/1024/2048 のみ)。');
    if (!PAGE.includes(b1)) return E('バンク1 のページサイズ 0x' + b1.toString(16) + ' は仕様外です (0/256/512/1024/2048 のみ)。');
    const aud = u[59], ee = u[60];
    // AUDIN (2026-10-23 第9回): $3B bit0=1 なら AUDIN で切り替える2組目 (bank0A, bank1A) が後ろに続く。並びは Handy cart.cpp と AtariAge「AUDIN - reality and emulators」:
    //   ヘッダ / bank0 / bank1 / bank0A / bank1A (各 A は元のバンクと同じ大きさ)。
    const want = 64 + (b0 + b1) * 256 * ((aud & 1) ? 2 : 1);
    if (u.length !== want) return E('大きさが合いません: ヘッダからは ' + want + ' バイト、実際は ' + u.length + ' バイト (壊れたファイル)。');
    const name = str(u, 10, 32, '名前'); if (name.error) return E(name.error);
    const maker = str(u, 42, 16, 'メーカー'); if (maker.error) return E(maker.error);
    const rot = u[58];
    if (rot > 2) return E('画面の向き ' + rot + ' は仕様外です (0/1/2 のみ)。');
    if (aud & 0xfe) return E('AUDIN バイト 0x' + aud.toString(16) + ' に未定義のビットがあります (未対応)。');
    if ((ee & 0x38) || (ee & 7) > 5) return E('EEPROM バイト 0x' + ee.toString(16) + ' は仕様外です。');
    // SD (0x40): 「EEPROM の中身を SD カードに保存する」印 (Lynx SD Loader 2 の説明 / AtariAge GameDrive の議論)。Lynx 側の EEPROM 操作は通常どおり。
    //   このエミュでは通常の EEPROM として動かし、中身をブラウザ内 (IndexedDB) に保存する (= SD への保存の代わり。自分で決めた扱い)。
    //   種類が 0 (EEPROM なし) で SD だけ立っているものは意味が決まらないので止める。
    if ((ee & 0x40) && !(ee & 7)) return E('EEPROM の SD ビット (0x40) だけが立ち、EEPROM の種類が 0 です。何を保存するか決まらないので止めます。');
    // AUDIN と EEPROM はどちらも AUDIN 線 (Mikie IODAT bit4) を使う (Handy eeprom/mikie の実装)。両方は配線が決まらないので止める。
    if ((aud & 1) && (ee & 7)) return E('AUDIN バンク切替と EEPROM の両方が指定されています。どちらも AUDIN 線を使うので同時の動きは決められず、止めます。');
    if (u[61] | u[62] | u[63]) return E('予備バイト ($3D-$3F) が 0 ではありません (未定義の拡張。推測せず止めます)。');
    const d = 64, own = u[d] === 0x80 && u[d + 1] === 0x08 && String.fromCharCode(u[d + 6], u[d + 7], u[d + 8], u[d + 9]) === 'BS93';
    if (own) { const load = u[d + 2] << 8 | u[d + 3], size = u[d + 4] << 8 | u[d + 5];
      if (size < 11 || size > b0 * 256 || load < 0x200 || load + size - 10 > 0xfc00) return E('先頭の BS93 ローダーの大きさ/置き場所が不正です。'); }
    return { info: { bank0: b0, bank1: b1, version: ver, name: name.s, maker: maker.s, rotation: rot, rotName: ROT[rot], eeprom: ee, audin: aud & 1, sd: (ee & 0x40) ? 1 : 0,
      eeName: EE[ee & 7] + ((ee & 7) ? (ee & 0x80 ? ' 8bit' : ' 16bit') : '') + ((ee & 0x40) ? ' SD保存' : ''), boot: own ? 'own' : 'encrypted' } };
  }
  const UNSUP = '.lnx 未対応: 先頭が暗号化ローダー (純正形式) です。暗号化ローダーの解読はまだ作っていないので起動しません (Atari のブートROMも使いません)。';
  // 第28回: BS93 (.o) と .lyx の検査。戻り値 null (OK) か エラー文
  function checkO(u) { if (!u || u.length < 11 || u[0] !== 0x80 || u[1] !== 0x08 || String.fromCharCode(u[6], u[7], u[8], u[9]) !== 'BS93') return '.o の BS93 ヘッダが正しくありません。';
    const load = u[2] << 8 | u[3], size = u[4] << 8 | u[5];
    if (size < 11 || size > u.length || load < 0x200 || load + size - 10 > 0xfc00) return '.o の BS93 ヘッダの大きさ/置き場所が不正です (読込先 $' + load.toString(16) + '・大きさ ' + size + ')。'; return null; }
  function checkLyx(u) { return u && [0x20000, 0x40000, 0x80000].includes(u.length) ? null : '.lyx の大きさ (' + (u ? u.length : 0) + ') が 128KB/256KB/512KB のどれでもありません。'; }
  return { parse, UNSUP, checkO, checkLyx };
})();
