# GBC版 音（ブロックフォール・ブレイカー）

元データ: PCE版 `pce-puzzle/tools/snd/pce_songs.py` と `pce_compose.build_song`（メロディ・長さ・ループ同じ）。新しい作曲はなし。4ch に編曲し直し。

## チャンネルの割り当て
| ch | 曲 | 元 (PCE) | 効果音 |
|---|---|---|---|
| 矩形1 (duty 25%, 音量11) | メロディ | ch0 lead | 使わない |
| 矩形2 (duty 50%, 音量5) | 和音 (パッド) | ch2 pad | 音程のある SE が鳴っている間だけ借りる (0-5, 7, 9, 10) |
| 波形 (ベース波形, 50%) | ベース | ch1 bass | 使わない |
| ノイズ (ハードの減衰で1回鳴らし) | ドラム k/s/h | ch4 drum | kill(6), break(8) が鳴っている間だけ借りる |
PCE の ch3（エコー）は使わない。効果音が終わると、借りた ch に今の曲の音を鳴らし直して返す（曲の進みは効果音の間も止まらない）。

## 使い方 (API は PCE / GBA 版と同じ)
`src/snd.c`（bank 0）と `src/snd_data.c`（bank 1）をビルドに入れる。
- `snd_init()` 起動時 1 回 / `snd_update()` 毎フレーム `vsync()` の直後に 1 回
- `bgm_play(n)` `bgm_stop()` `bgm_playing()` `sfx_play(n)` `sfx_playing()`
- 番号: BGM 1 タイトル, 2-4 ステージ1-3, 5 ボス, 6 ゲームオーバー（1回だけ）, 7 エンディング / SE 0 rotate, 1 shot, 2-5 clear1-4, 6 kill, 7 land, 8 break, 9 ufo, 10 stageclear
- 音源レジスタ (NR10-NR52, 波形RAM) は全部ドライバーが使う。ゲーム側は触らない。割り込みは使わない。

## ROM / RAM の使い方（GBプログラマー向け）
- 曲・SE データ: `src/snd_data.c`（生成物）を **ROM bank 1** に入れる: `lcc -Wm-yc -Wf-bo1 -c src/snd_data.c`。5,103 バイト。
  bank 番号は `res/sound/snd_data.h` の `SND_BANK`。別の bank にするときは、ここと `-Wf-boN` の両方を変える。
- ドライバー `src/snd.c` は **bank 0** に置く（`-Wf-bo` を付けない）。bank 0 の使用は sndtest 全体で 1,238 バイト（GBDK のライブラリと main を含む）。
- 公開関数（snd_init / snd_update / bgm_play / bgm_stop / sfx_play）は入口で `_current_bank` を覚えて `SWITCH_ROM(SND_BANK)`、出口で元の bank に戻す。どの bank のコードから呼んでもよい。
- ルール: 割り込みの中からは呼ばない（ゲーム側の割り込みが bank を切り替えるなら、その割り込みでも元に戻すこと）。bgm_playing / sfx_playing は bank を切り替えない。
- カートリッジ: MBC が必要。sndtest は MBC5 (`-Wl-yt0x19`)、4 bank (`-Wl-yo4`、64KB)。
- WRAM: 約 40 バイト。
- bank 化の前と後で録音を比べた: RMS は同じ（差は 1 以内）、ピークの差は ±2% 以内（エミュレーターの位相の違い）。途切れ 0、上限に当たるサンプル 0。

## 作り方
- データ: `/usr/bin/python3 tools/snd/gbc_compose.py` → `src/snd_data.c`（データ本体）と `res/sound/snd_data.h`（extern と SND_BANK）
- テストROM: `cd sndtest && make` → `sndtest/sndtest.gbc`（上下で選ぶ 0-6=BGM1-7, 7-17=SE0-10、A で鳴らす、B で曲を止める）
- 録音: `/usr/bin/python3 tools/snd/record_all.py` → `test/sound/*.wav`（Gambatte）、計測: `tools/snd/levels.py` → `test/sound/levels.txt`

## 計測 (Gambatte, 0.1秒窓)
| | ピーク | 鳴っている区間の RMS |
|---|---|---|
| BGM 1-5,7 | 7.3k〜8.3k (-12dBFS) | 1.3k〜1.7k |
| BGM 6 ゲームオーバー | 3.3k | 1.2k |
| SE 単独 | 3.4k〜4.8k | 1.3k〜2.5k |
| ステージ1＋全SE | 11.5k (-9dBFS) | 2.4k |
- 全曲・全SE で途切れ 0、ループの継ぎ目も無音なし、上限に当たるサンプル 0。
- SE は 1ch だけなので、ピークは曲より低いが、鳴っている間の RMS は曲と同じかそれ以上。SE の音量は PCE の値から +3dB にしてある。
- テンポは 60fps 前提のフレーム数なので、実機 (59.73fps) で約 0.5% 遅い。
