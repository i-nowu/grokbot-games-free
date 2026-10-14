# ブロックフォール・ブレイカー PCE版 移植計画（GBプログラマー）

元: /workspace/md-puzzle/game/src/main.c（640行、C、SGDK）。仕様: docs/SPEC.md（PCE移植 v1）。

## 1. そのまま移せるゲームの中身（C、ハードに依存しない）
main.c の次の関数は盤面配列と数値だけを扱うので、型名（u8/s16→char/int）を直して移す。
- ピース: cell_shape, piece_fits, pick_shape, next_from_enemies, spawn_piece, control_piece（入力は抽象化した値を受ける）, lock_piece
- 盤面: check_lines, remove_row, rebuild_eocc, formation_bottom
- ボール・パドル: launch_balls, ball_hit, update_balls, update_paddle, catch_pct
- 敵・UFO・ボス: update_enemies, enemy_touch, kill_enemy_at, enemies_left, update_ufo, is_boss_stage
- 点数・時間: add_score, time_left, setup_stage（中の描画呼び出しは分ける）
- 画面の流れ（sc_* の状態の進め方）はそのまま、描画と音の呼び出しだけ差し替える。
HuCの注意: int は16ビット、long なし→スコア（最大9999999）は16ビット×2か BCD で持つ。構造体の配列・ポインタ演算は弱いので、Ball は要素ごとの配列（ball_x[4] など）に分ける。乱数は rand() の自前版（MDと同じ式にして自動テストの再現性を保つ）。速さが足りなければ HuCC（同梱）か、当たり判定だけ ASM にする。

## 2. ハード依存部分と PCE での置き換え
| MD（SGDK） | PCE（HuC） |
|---|---|
| VDP_loadTileData / BG_A・BG_B / VDP_setTileMapXY | VDC: load_vram, put_raw / load_bat（BG面は1枚。MDの2面はBGとスプライトで分担） |
| draw_board（変わったマスだけ書く） | 同じ方式。BATへの書き込みは vsync 中にまとめる |
| SPR_*（ボール・パドル・ピース） | SATB: spr_set/spr_x/spr_y/spr_pattern + satb_update（64個、1ライン16個） |
| PAL_setColor / 背景色＝絵の0番色 | VCE: set_color / load_palette（9ビット色、16本×2）。0番色の決まりは同じ |
| XGM2_play / XGM2_playPCM（交互2ch） | PSG 6ch: 曲は ch0〜4、効果音は ch5 専用（ノイズ可）。ドライバは HuC の PSG/mml、効果音は自前の短い表を vsync で鳴らす |
| JOY（A/B/C/START） | joy(0): I/II=回す、SELECT押下中=手動パドル、RUN=ポーズ・ゲームオーバーで進む（RUN+SELECTのリセットに注意） |
| 注意文 | font_data.c を変換（skel/mkfont_pce.py）。TX_notice1〜5 のタイル番号列をそのまま使う |
| rom_header.c / fixheader.py | 不要（HuCARDにヘッダーなし）。製品版は -DDEBUG_KEYS なしで作る |

画面: 256x224＝32x28マス。盤面10マス＋情報欄で、MDの40マス幅から詰める（SPEC 2章）。

## 3. メモリとバンク（HuCARD 1MB、SPEC 更新後）
- ROM は 8Mbit（1MB）＝ 8KB バンク×128。今の骨組みは 64KB（8バンク）: コード・フォント・盤面タイル・音（約5.8KB）。
- ごほうび絵 1枚: 256x160 ＝ 32x20 ＝ 640タイル。タイル 640×32B ＝ 20KB、BAT 640ワード ＝ 1.25KB、パレット16本 ＝ 512B → 約21.8KB ＝ 3バンク。20枚で 60バンク（480KB 枠、中身は約436KB）。
- 1枚を3バンクの区切りに合わせて置く（HuCC の #incchr / #incbat / #incpal、表示時に far_load_vram / load_bat / load_palette）。ほかの絵（タイトル・キャラの顔・エンディング・背景）とコード・音は残りの約60バンク。
- VRAM（64KB ＝ 32Kワード、ワード番地）:
  | 番地 | 中身 |
  |---|---|
  | 0x0000-0x07FF | BAT（64x32） |
  | 0x1000-0x1BBF | フォント 188字 |
  | 0x2000-0x21FF | 盤面タイル 32枚 |
  | 0x2400 | 塗りつぶし1枚（仮置き・帯） |
  | 0x3000-0x30BF | スプライト（パドル・ボール・UFO） |
  | 0x4000-0x67FF | ごほうび絵 640タイル（場面ごとに上書き） |
  | 0x6800-0x7EFF | 予備（タイトル・エンディングの絵） |
  | 0x7F00- | SATB |
- パレット: 絵は16本まで使えるが、0番は文字（色1＝白）と背景色（色0）に使う。絵は 1〜15番の15本で描くか、0番を使うなら 色0＝背景色・色1＝白 を守る（GB企画・GBグラフィックに確認）。
- RAM 8KB: 盤面・敵・ボールで 1.5KB ほど。十分。
- 絵の素材: res/src/unused/* は使わない。ミカ10は res/src/mika10.png（切り抜き版）だけを使う。

## 4. 必ず守る難しさ（SPEC 14章・追記、数値を変えない）
- ボールは敵とブロックに合計8回当たると消える。同時に最大4個。
- 自動パドルが受ける確率（落ちてくるたびに1回判定）: 1〜2面100%、3〜4面90%、5〜6面80%、7〜8面70%、9面以降60%（エンドレスも60%）。手動（SELECT押下中）は必ず受ける。
- 次のピースが出るまで: 1〜3面45フレーム、4〜6面30、7面以降20（60fps基準）。
- 敵が1段下りる: 壁に 1〜3面5回、4〜7面3回、8〜10面2回当たったとき。
- 合格: 自動プレイで1〜3面は必ずクリア、7面以降はときどき負ける。MDの bot.py を Mednafen コアで動くように直して確かめる。

## 5. 起動時の注意文（一字一句同じ）
「これはフリーで配布されたゲームです。製品版はありません。もし買われた方がいたらそれは詐欺です。警察に相談してください。GrokBOTでチームを組んで作成しました。」
1行に1文、5行。MD版の release_check.py と同じように、画面から読んで照合する。

## 6. 環境と骨組み
- HuC/PCEAS: /workspace/pce-puzzle/tools/huc-src/bin（ビルド済み。例題の一部 hucc/metatile3-multiblk だけ失敗、本体には影響なし）
- エミュ: Mednafen pce_fast の libretro コア tools/pcefast-src/mednafen_pce_fast_libretro.so
- 骨組み: skel/（注意文だけ出す）。`cd /workspace/pce-puzzle/skel && make` → skel.pce。`python3 shot.py skel.pce notice.png` で画面を撮る。
- 進め方: ①入力・描画・音の薄い層（hw_pce.c）②ゲームの中身を移す ③自動テストとボット ④絵と曲を入れる ⑤製品版チェック。
