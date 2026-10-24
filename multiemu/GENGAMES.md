# 内蔵ゲーム一覧 (GENGAMES)

内蔵ゲームはすべて **異能ソフト製** で、[grokbot-games-free](https://github.com/i-nowu/grokbot-games-free) に公開済みのもの。
出所の確認元: grokbot-games-free commit f0d7e2cab4a05331aa4275dfaed7a1ac5366a990 (2026-10-24 09:59:53 JST)。
アプリの最初の一覧はこの表と同じ (GB 3本・NEOGEO 1本。Lynx は内蔵ゲームなし)。

| 機種 | ゲーム | 元のファイル名 | 元の場所 (grokbot-games-free) | 元ファイル md5 | 内蔵先 (キー) | 内蔵データ md5 |
|---|---|---|---|---|---|---|
| GB | グンマー教の野望 | gunma.gb | GB/グンマー教の野望/gunma.gb | 07c524e89980ff65754f00b34eddb842 | cores/gb/roms.local.js (gunma) | 07c524e89980ff65754f00b34eddb842 (同一) |
| GB | ババ抜き | babanuki.gb | GB/ババ抜き/babanuki.gb | 9b393d793a28d1dfc24acb50e3a5da46 | cores/gb/roms.local.js (babanuki) | 9b393d793a28d1dfc24acb50e3a5da46 (同一) |
| GBC | ブロックフォール・ブレイカー | blockfall_breaker.gbc | GBC/ブロックフォール・ブレイカー/blockfall_breaker.gbc | e529dacee699bfc06cd64506c2a5b7d4 | cores/gb/roms.local.js (blockfall) | e529dacee699bfc06cd64506c2a5b7d4 (同一) |
| NEOGEO | シム群馬 | simgunma.zip | NEOGEO/シム群馬/simgunma.zip | 5318fc5efa45f296e4cac1b5b3da17f0 | cores/neogeo/roms.local.js (neo) | aae2376dff48c713bb8b7ecd09b7f62b (.neo 形式に変換) |

シム群馬は zip の中身 (p1/s1/m1/v1/c1/c2) を .neo 形式 (4096バイトのヘッダ + P, S, M, V1, C を交互に並べたもの) にまとめて入れている。中身のバイトは zip と同じであることを確認済み:

| zip の中のファイル | md5 |
|---|---|
| simgunma-p1.p1 | c353eee1a2959e6e6fab9ff350f06cc2 |
| simgunma-final1-s1.s1 | c8f2c7dee8e826fdf9e424d77bf91cf1 |
| simgunma-m1.m1 | d21b23e09d11a21a34d7d17c4c54c6c5 |
| simgunma-v1.v1 | 091d43cb4ef88a5ad31ce8cc7493cca2 |
| simgunma-final1-c1.c1 | d805ec09f1c5cd7b0d82e1fcdfbad6f8 |
| simgunma-final1-c2.c2 | 96689afb36c4f9148ec960018d8e2e42 |

## 同梱BIOS (異能ソフト自作 BIOS の無償配布版のみ)

| 用途 | 内蔵先 (キー) | zip md5 | 中身 |
|---|---|---|---|
| ネオジオ MVS | cores/neogeo/roms.local.js (bios_mvs) | ac12dc4918a186be10c80db735acc0a0 | sp-s2.sp1 57f45036…, 000-lo.lo 3b8391fc…, sfix.sfix 37f65d68…, sm1.sm1 80ade71a… |
| ネオジオ AES | cores/neogeo/roms.local.js (bios_aes) | 20c239255f3d9de49a9cb7a1f9d7d24e | neo-epo.bin / neo-po.bin 57f45036…, 000-lo.lo 3b8391fc… |

出所: 異能ソフトのチームが公開資料だけをもとに書いたクリーンルーム TEST BIOS v0.6 無償配布版 (000-lo.lo 縮小表も自作の近似)。
どのファイルにもオフセット 0x1F000 (空き領域) に次の文を英語と日本語で入れている:
- "(C) 2026 Inou Soft. Free distribution edition. This BIOS is free to distribute at no charge only. If you received it bundled with paid software, that is fraud - please report it to the police."
- 「(C) 2026 異能ソフト。無償配布版。この BIOS は無償配布のみ可能です。有償のソフトに添付されていた場合は詐欺ですので、警察に通報してください。」

**有償ソフトに添付されていたら詐欺なので通報してください。**
古い自作BIOS (v0.3/v0.4/v0.5) は入っていない。GB/GBC は SameBoy 内蔵のオープンブートROM (MIT)、Lynx は Handy の HLE ブートで BIOS ファイルは要らない。
SNK BIOS・Universe BIOS・C-BIOS・任天堂/Atari 純正BIOS・市販ROMは入っていない。
