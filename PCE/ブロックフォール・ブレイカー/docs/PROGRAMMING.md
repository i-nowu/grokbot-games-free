# ブロックフォール・ブレイカー PCE版 プログラム（GBプログラマー）

## ビルドとテスト
- `make release` → `build/blockfall_breaker.pce`（デバッグ操作なし）／ `make debug` → `build/blockfall_breaker_debug.pce`（-DDEBUG_KEYS: ポーズ中 SELECT+I=敵全滅、SELECT+II=ボール1個）。`make test` で playtest と release_check。
- コンパイラは HuCC（tools/huc-src/bin/hucc -O2 -fno-recursive）。ビルド用の写し（build/rel, build/dbg）は tools/strip_comments.py でコメントを消してから渡す（日本語コメントで後ろのコードが落ちることがあるため）。
- 素材: `python3 tools/gen_res.py` → game/res_gen.h（フォント・文・盤面タイル・スプライト）。文は scenario/game.txt（MD版の文のボタン名だけ PCE に）。
- 音: GB音楽のドライバー common/snd.c と res/sound/snd_data.h。hw.c の se()/bgm() から呼ぶ。毎フレーム vsync() のあと snd_update()。

## ファイル
- game/main.c: MD版 main.c のゲームの中身をそのまま（構造体→要素ごとの配列、2次元配列→1次元）。難しさ（SPEC 14章）と乱数（SGDK random の xorshift、seed^0xD94B）は MD と同じ。
- game/hw.c / hw.h: 入力・描画（BAT へ put_raw、スプライト8個）・音の呼び出し。

## HuCC で気をつけること（はまった所）
- `a ? b : c ? d : e` のかっこなしの連なりをまちがえる（全部最後の値になる）。連なりは if で書く。
- 2次元配列・構造体へのポインター引数は通らない。enum の値は const 配列の初期値に使えない（#define にする）。
- 配列の最後の `,` はだめ。`bx` などの名前はライブラリのレジスター名とぶつかる。

## 速さ
- 盤面は「描き直す段」だけ（rowdirty）、1フレーム8段まで。敵の占有（eocc）は前に置いたマスだけ消す。数字は変わったときだけ書く。
- 結果: 自動プレイ約2.5万フレームで、処理が1フレームに収まらなかったのは約0.1%（ほぼ列消しとステージの始まり）。

## ソフトリセット
- ライブラリの RUN+SELECT リセットは起動時に止める（joyena=$2227 を 0）。
- タイトルでだけ自前で受ける（RUN を押したまま SELECT → 注意書きから）。タイトルの決定は RUN を離したとき（または I）。
- ゲーム中・ポーズ中は SELECT+RUN でもポーズの切り替えだけ。

## テスト（test/）
- pcelib.py: Mednafen pce_fast libretro コアのドライバー（RAM・VRAM を読む）。
- playtest.py（デバッグ版、23項目: MD の18項目＋リセット5項目）、release_check.py（製品版、注意文を VRAM の BAT とフォントの形で一字照合、デバッグ操作無効、リセットしない）。
- bot.py: MD と同じ自動プレイヤー。`--trace` で毎フレームの状態を書く。
- difftest.py: 同じ main.c を PC（gcc、int=16ビット）で動かし、エミュの状態と毎フレーム比べる（コンパイラのまちがい探し）。

## MD版との違い

ゲームの中身は MD 版と同じ（難易度・乱数・ピースの重さなど）。違いは次の1つだけ。

- **1色だけのときのピース（PCE版のみ、GB企画の決定 B 案）**
  - MD 版はピースを「生きている敵を1体ランダムに選び、その色で形を決める」だけで決める。
    青だけが残ると角とブロックしか来ず、1幅のすき間が埋まらない（24シードの調べで、1幅ピースが来ない最長区間は19個）。
  - PCE 版では、生きている敵が全部同じ色（ボスが生きていないとき）の間、ピースを数える（`mono_cnt`）。
    6個目は普通の選び方をせず、点か2本棒にする（`rand_n(2)` で半々、ゲームの乱数を使う）。そのあとカウンタは0に戻る。
  - 1色の状態が終わったとき・ボスのとき・敵が0のとき・面が変わったとき（`stage_init`）にカウンタを0に戻す。
  - 場所: `game/main.c` の `one_colour()` と `next_from_enemies()`。
  - 効果: 1幅ピースが来ない最長区間 19 → 10（`test/piece_stats.py`）。
  - 差分テスト（`test/difftest.py`）は同じ `main.c` を gcc でビルドするので、PC 側の参照も自動でこの動きになる。
- ボタン名（I/II/RUN/SELECT）と RUN+SELECT リセットがタイトル画面だけで効くのは、機械の違いによる。

## ごほうび絵（20枚）

- 素材: `res/pce/NAME_{tiles,bat,pal}.bin`（GBグラフィック納品、形式は docs/GFX_PCE.md）だけを使う。`tools/gen_pics.py` が1枚24KBのかたまり（タイル20480 / BAT 1280 / パレット480 / 0埋め）にして `game/pics.h`（`#incbin` と `pic_seek()`）を作る。
- ROM: 1MB。絵は バンク $03〜$3E（1枚3バンク、どれもバンクの頭 $6000 から始まる。`build/*.sym` の `_pic_*`）。
- 表示 `draw_pic(k)`（k = キャラ*10 + 面-1）: `set_far_offset` + `far_load_vram` でタイル8KB → frame() → 8KB → frame() → 4KB → frame() → BAT 20行（BAT の1〜20行目）→ パレット1〜15（`far_load_palette(1,15)`）。パレット0は触らない。
- MPR: `load_vram` はデータを MPR3・MPR4（$6000-$9FFF）に置いて、終わると元に戻す。snd_blob（バンク1、$7F8E〜）も MPR3/4 にあるが、snd_update は frame() の中でしか呼ばない（割り込みでは呼ばない）ので、転送の間に鳴らすことはない。1回の転送は8KB以下にして、間に frame()（vsync → snd_update）をはさむ。
- 絵のあとの clear_all() でパレット1（盤面のタイル）を戻す。
- 確認: `python3 test/pic_check.py`（20枚を撮って preview と1点ずつ比べる・読み込み中のフレーム・ギャラリーで開いたときの音）。
