# VB版 音（ブロックフォール・ブレイカー）

元データ: PCE版 `pce-puzzle/tools/snd/pce_songs.py` と `pce_compose.build_song`。PCE の 6ch 編曲をそのまま使う（新しい作曲はなし）。

## チャンネルの割り当て
| VSU | 曲 / 効果音 | 波形 | 左右 (L/R, /16) |
|---|---|---|---|
| ch1 | メロディ (PCE ch0 lead) | pulse | 9/9 |
| ch2 | ベース (PCE ch1) | bass | 9/9 |
| ch3 | パッド (PCE ch2) | pad | 9/7（少し左） |
| ch4 | エコー (PCE ch3) | sine | 7/9（少し右） |
| ch5 | **効果音専用**（スイープは使わない） | square（ufo は sine） | 16/16 |
| ch6 ノイズ | ドラム (PCE ch4) | - | 9/9 |
- 波形テーブルは 5 本: pulse, bass, pad, sine, square。PCE の tri（キックだけで使用）は不要にした。キックはノイズの低い音で鳴らす。
- 5bit 波形を 6bit に変換（x*63/31）。音程の表は VSU 用 f = 5MHz / ((2048-F)×32)。
- VSU の下限は約 76Hz。これより低いベース音（A1, Bb1, B1, C2, D2 など）は 1 オクターブ上で鳴る。
- ノイズを使う効果音（kill, break）は、鳴っている数コマだけ ch6 を使う（その間ドラムは休む）。それ以外の効果音は ch5 だけ。
- 音量は LRV（左右の音量）で毎コマ変える。ハードのエンベロープは使わない。曲は効果音より下げてある。

## 使い方 (API と番号は PCE / GBA / GBC と同じ)
- `src/snd.c` をビルドに入れる（`res/sound/snd_data.h` は snd.c だけが include）。
- `snd_init()` 起動時 1 回 / `snd_update()` 毎フレーム（FRAMESTART を待った直後）1 回。
- `bgm_play(n)` `bgm_stop()` `bgm_playing()` `sfx_play(n)` `sfx_playing()`
- 番号: BGM 1 タイトル, 2-4 ステージ1-3, 5 ボス, 6 ゲームオーバー（1回だけ）, 7 エンディング / SE 0 rotate, 1 shot, 2-5 clear1-4, 6 kill, 7 land, 8 break, 9 ufo, 10 stageclear
- VB は 50Hz。データは PCE と同じ 60 コマ/秒なので、ドライバーは 5 フレームで 6 コマ進める。テンポは PCE と同じ。
- VSU のレジスタと波形 RAM は全部ドライバーが使う。ゲーム側は触らない。割り込みは使わない。
- 効果音は 1 つずつ。新しい sfx_play は鳴っている効果音を止めて置き換える。

## ステージクリア演出 (GBプログラマー向け)
- 演出の 1 コマ目で `sfx_play(8)`（break、約 0.07 秒）、2 コマ目で `sfx_play(10)`（stageclear）。
- SE10 は VB 版だけ PCE の 1.0 秒を 2.25 倍にのばした（音の並びは同じ）。最後の音が消えるまで約 2.1 秒（テストの録音で鳴っている区間 2.1 秒）。約 3 秒の演出の 2 コマ目から始めて、演出の終わり近くで消える長さ。
  長さを変えるときは `tools/snd/vb_compose.py` の `STAGECLEAR_STRETCH` を変える。

## サイズ
- ROM: データ約 7KB ＋ ドライバー約 2KB（sndtest 全体の .text 9.3KB / 64KB）。WRAM: 約 90 バイト。

## 作り方
- データ: `/usr/bin/python3 tools/snd/vb_compose.py` → `res/sound/snd_data.h`
- テストROM: `cd sndtest && make` → `sndtest/sndtest.vb`（左の十字 上下で選ぶ 0-6=BGM1-7, 7-17=SE0-10、A で鳴らす、B で曲を止める）
- 録音: `/usr/bin/python3 tools/snd/record_all.py` → `test/sound/*.wav`（Beetle VB）、計測: `tools/snd/levels.py` → `test/sound/levels.txt`

## 計測 (Beetle VB, 0.1秒窓)
| | ピーク | 鳴っている区間の RMS |
|---|---|---|
| BGM 1-5,7 | 14.0k〜14.6k (-7dBFS) | 1.5k〜2.6k |
| BGM 6 ゲームオーバー | 8.7k | 1.3k |
| SE 単独 | 8.4k〜9.7k (-11dBFS) | 1.9k〜3.8k |
| ステージ1＋全SE | 18.9k (-4.8dBFS) | 2.6k |
- 全曲・全SE で途切れ 0、ループの継ぎ目も無音なし、上限に当たるサンプル 0。
- SE の RMS は曲と同じか上で、曲に埋もれない。
- 左右: ステージ1 で L 1812 / R 1816、相関 0.995。広がりは少しだけ。
