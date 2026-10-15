# GBA版 音（ブロックフォール・ブレイカー）

元データ: PCE版 `pce-puzzle/tools/snd/pce_songs.py`（楽譜・効果音）と `pce_compose.build_song`（同じ長さ・ループ）。新しい作曲はなし。

## チャンネルの割り当て
| 音源 | 用途 | 元 (PCE) |
|---|---|---|
| PSG 矩形1 (duty 25%, 音量14) | メロディ | ch0 lead |
| PSG 矩形2 (duty 50%, 音量5) | メロディの 3/16 遅れのエコー（和音の厚み） | ch3 echo |
| PSG 波形ch (pad 波形, 50%) | 和音パッド | ch2 pad |
| PSG ノイズ | 未使用（空き） | - |
| DirectSound A | ベース（ソフト波形）＋ドラム（キック=三角波スイープ、スネア/ハット=ノイズ） | ch1 bass, ch4 drum |
| DirectSound B | 効果音専用（曲と取り合わない） | ch5 |

PSG 全体 50%、DirectSound A/B 100%。DirectSound は Timer0 18157Hz（1フレーム 304 サンプル）、DMA1→FIFO A、DMA2→FIFO B、二重バッファを毎フレーム張り替え。割り込み不要。合成ループは IWRAM の ARM コード。

## 使い方 (API は PCE 版と同じ)
`#include "snd.h"`、`src/snd.c` をリンク（`res/sound/snd_data.h` を include）。
- `snd_init()` 起動時 1 回
- `snd_update()` 毎フレーム、VBlank に入った直後に 1 回（必ず毎フレーム。1 フレーム飛ばすと DS の音が乱れる）
- `bgm_play(n)` / `bgm_stop()` / `bgm_playing()`（再生中の番号、止まっていれば 0）
- `sfx_play(n)` / `sfx_playing()`（効果音は後から鳴らしたものが優先）
- 使うハード: 音源レジスタ全部、Timer0、DMA1、DMA2。ゲーム側はこれらを使わないこと。
- 処理時間: 実測で最大 19 ライン（1フレーム 228 ラインの約 8%）。

## 番号
BGM: 1 タイトル, 2 ステージ1, 3 ステージ2, 4 ステージ3, 5 ボス, 6 ゲームオーバー（1回だけ、ループなし）, 7 エンディング
SE: 0 rotate, 1 shot, 2-5 clear1-4, 6 kill, 7 land, 8 break, 9 ufo, 10 stageclear

## 作り方
- データ: `/usr/bin/python3 tools/snd/gba_compose.py` → `res/sound/snd_data.h`
- テストROM: `cd sndtest && make` → `sndtest/sndtest.gba`（上下で選ぶ 0-6=BGM1-7, 7-17=SE0-10、Aで鳴らす、Bで曲を止める）
- 録音: `/usr/bin/python3 tools/snd/record_all.py` → `test/sound/*.wav`、計測: `tools/snd/levels.py`（結果 `test/sound/levels.txt`）
- ヘッダー: `ports-env/gba/lib/gbafix.py`（チーム決定によりロゴ欄は全部 0。タイトルと補数だけ入れる。mGBA で BIOS なしで起動）

## 計測 (mGBA, 0.1秒窓。test/sound/levels.txt)
音量設定 (src/snd.c 先頭): VOL_LEAD 10, VOL_ECHO 4, 波形 50%, AMP_BASS 50, AMP_DRUM 44, AMP_SE 105, PSG全体 50%
| | ピーク | 鳴っている区間の RMS |
|---|---|---|
| BGM 1-5,7 | 14.4k〜14.8k (-7dBFS) | 2.1k〜3.1k |
| BGM 6 ゲームオーバー | 11.3k | 2.2k |
| SE 単独 | 8.4k〜10.0k (-10〜-12dBFS) | 3.6k〜7.5k |
| ステージ1＋全SE | 23.0k (-3.1dBFS) | 3.5k |

- 全曲・全SE で途中の途切れ 0、ループの継ぎ目も無音なし。
- ステージ1＋全SE でも出力の上限 (約 24.5k) に当たるサンプルは 0。
- 効果音の RMS は曲の約 1.5〜3 倍なので、曲に埋もれない。
- 注意: PSG の矩形波は直流分を持つので波形が + 側に寄る（曲の中央値 +1.5k）。音量を上げるときは + 側の上限に注意。
- テンポ: PCE の 60fps 前提のフレーム数をそのまま使うので、GBA (59.73fps) では約 0.5% 遅い。
