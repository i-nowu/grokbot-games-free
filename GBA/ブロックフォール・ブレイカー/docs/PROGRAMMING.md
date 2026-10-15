# ブロックフォール・ブレイカー GBA版 プログラム（GBプログラマー）

- ゲームの中身は /workspace/bfb-core（PCE版と1フレームずつ同じ）。このディレクトリは GBA の薄い層だけ。
- `make release` → build/blockfall_breaker.gba ／ `make debug` → build/blockfall_breaker_debug.gba（-DBFB_DEBUG_MIRROR: テスト用に PCE の g_dbg と同じ並びを持つだけ。デバッグキーはどちらにもない）。
- ヘッダー: ports-env/gba/lib/gbafix.py（ロゴ欄は空）。mGBA で BIOS なしで起動。
- 素材: `python3 tools/gen_res_gba.py` → src/res_gba.h（文 scenario/game_gba.txt、6x6 の盤面絵、OBJ）。絵 20枚は src/pics.s が res/pics をそのまま入れる。

## 画面
- Mode 0: BG0 文字（4bpp、画面ブロック28）、BG1 盤面（8bpp、11x20タイル=88x160 をソフトで描いて毎回 DMA3、画面ブロック29）、BG2 文字の後ろの帯（30）。
- 盤面は 1マス 6x6、原点 (12,8)、10x23マス＋パドル段＝60x144。描き直すのは PCE と同じく変わり得る段だけ（rowdirty・ピースの前後の段・ボスの点滅）。
- ボール・パドル・UFO・ネクストは OBJ（タイル 512 以降＝Mode 4 でも使える場所）。座標は PCE の 8px マスを 3/4 にする。
- ごほうび絵・ギャラリーの絵: Mode 4。読み込みは 3 フレーム（bfb_pic_frames=3、PCE と同じ）。強制ブランクのまま DMA3 で 12,800B ずつ、最後にパレット。文字は OBJ（SELECT を押している間は消える）。

## 毎フレーム
VBlank の始まりを待つ → snd_update()（必ず最初）→ OAM・BG のマップ・盤面タイルを DMA3 → キーを読む → bfb_step() → 次の画面を RAM に作る。
- ゲームは音のレジスター・Timer0・DMA1・DMA2 を触らない（DMA3 だけ）。割り込みも使わない（IF の VBlank ビットで処理落ちを数えるだけ）。
- 重いのは面の始まり（最大 117 ライン／228）。処理落ち 0。

## 操作（SPEC 4章）
A=I（右回転・決定）、B=II（左回転・もどる）、START=RUN、R か L=SELECT（手動パドル）。
タイトルでだけ A+B+START+SELECT でリセット（コアの bfb_step_title_reset。PCE の RUN+SELECT と同じ動き）。タイトルで SELECT を押している間は、コアには SELECT だけを渡す。

## テスト（test/）
- gbalib.py: mGBA libretro のドライバー（pcelib.py と同じ使い方。I→A、II→B、SELECT→R、RUN→START）。
- bot/bot.py（PCE の bot そのまま）、bot_suite.py（24通り）、playtest.py（画面写真・注意文の一字照合・リセット・エンディング一周）、pic_check.py（20枚を preview と1点ずつ、読み込み中の音）、release_check.py。
- 差分テスト: `python3 /workspace/bfb-core/test/difftest.py test/out/gba_s126`（bot.py --trace のトレースをホストのコアと比べる）。
