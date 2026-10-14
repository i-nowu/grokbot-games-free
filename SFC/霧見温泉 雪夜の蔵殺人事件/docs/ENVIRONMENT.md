# SFC アドベンチャー 開発環境 (BUILD.md)

## ツールとバージョン
| ツール | 版 | 場所 |
|---|---|---|
| PVSnesLib (Linux 64bit 公式リリース) | 4.6.0 | tools/pvsneslib （PVSNESLIB_HOME） |
| 816-tcc / wla-65816 / wla-spc700 / wlalink | 4.6.0 同梱 | tools/pvsneslib/devkitsnes/bin |
| gfx4snes, smconv, snesbrr, constify 等 | 4.6.0 同梱 | tools/pvsneslib/devkitsnes/tools |
| snes9x libretro コア (ソースからビルド) | git 1bcc369 (2026-09-24) | tools/snes9x_libretro.so （ソース tools/snes9x-src） |
| sfcrun.py（自作のヘッドレス実行器, Python+ctypes+Pillow） | - | tools/sfcrun/sfcrun.py |

apt で入れたもの: g++, xdotool, imagemagick（snes9x-gtk / libretro-snes9x は apt に無いため、コアを自前ビルド）。

## セットアップ
```
export PVSNESLIB_HOME=/workspace/sfc-adv/tools/pvsneslib
```
Makefile が自動で設定するので、`make` を使う限り不要。

## ビルド・実行・スクリーンショット
```
make build                 # hello/ をビルド → build/hello.sfc
make shot                  # 120フレーム後の画面 → test/hello.png
make run SCRIPT="wait 120; press START; wait 60; shot test/a.png; peek 0100 4"
make build SRC=game ROM=build/game.sfc   # 本番ソースは game/ に置く想定
```
新しいプロジェクトは `tools/pvsneslib/snes-examples/hello_world` をコピーして始める（Makefile, hdr.asm, data.asm の形）。

## 自動テストの方法
- 画面は不要（xvfb も不要）。sfcrun.py が libretro コアを直接読み込み、フレーム単位で進める。
- スクリプト命令: `wait N`（Nフレーム）, `press A[+B] [N]`（Nフレーム押して離す）, `hold BTN N`, `shot PATH`（256x224 PNG）, `peek ADDR [LEN]`（WRAM の値を16進表示 → フラグや場面番号の確認に使う）。
- ボタン名: B Y SELECT START UP DOWN LEFT RIGHT A X L R
- 1フレーム≒実時間より大幅に速い（hello で 120フレーム < 0.2秒）。
- 通しテストは「コマンド選択の入力列」を並べ、各場面で peek（フラグ）と shot を取る形にする。
- 音は鳴らさず捨てている。音の検証が要るなら audio コールバックで WAV に書き出す拡張が可能。

## 日本語テキスト表示
- 8x8ドットのフォント（自由ライセンス）から、使う字だけをタイルにする。
- 全漢字を載せると VRAM に入らないので、**シナリオで使う文字だけを抜き出す**:
  1. Python スクリプトでシナリオテキストから使用文字を集める。
  2. 区点から PNG の該当8x8を切り出し、1枚のタイルシート PNG（幅128px=16文字/行, 4色インデックス）を作る。
  3. `gfx4snes -s 8 -o 4 -u 4 -p -i font.png` などで 2bpp(BG3用)タイルに変換（`-u` 色数）。または Python で直接 2bpp を出力してもよい（1タイル16バイト）。
  4. 同時に「文字→タイル番号」の表と、シナリオ文字列をタイル番号列（16bit）に変換した C 配列を出力し、ゲームはそれを BG マップに書く。
- 目安: BG3 (2bpp) なら 1文字 16バイト。使用文字500字で 8KB、1000字でも 16KB。VRAM 64KB に十分収まる。足りなければ場面ごとに DMA で入れ替え。
- PVSnesLib 標準の consoleDrawText は ASCII 用なので、日本語は自前の描画関数（タイル番号列を bgマップへ書く）を使う。

## アドベンチャー向け SFC の制約
- **VRAM 64KB**（BGタイル・マップ・スプライト共用）。WRAM 128KB。
- **BGモード**: Mode1 が基本（BG1/BG2: 16色=4bpp, BG3: 4色=2bpp）。絵を BG1（4bpp）、文字窓を BG3（2bpp, 優先度ビットで最前面）にするのが定番。
  1枚絵 256x(約)160 を 4bpp で全部別タイルにすると約 20KB。
- **パレット**: CGRAM 256色（15bit色）。BG 4bpp は16色×8本、2bpp は4色×8本。スプライトは16色×8本。
- **スプライト**: 128個、1ライン32個/34タイル。サイズ 8/16/32/64 から2種類。カーソルや人物の小物に使う程度で足りる。
- **ROM**: LoROM（PVSnesLib 既定）、32KB バンク単位。hello は 256KB(2Mbit)。最大 4MB 程度まで。文字データ・絵はバンクに分けて置く（data.asm の .section / bank 指定）。
- **音（SPC700）**: 64KB の ARAM を持つ別CPU。PVSnesLib は **smconv** で Impulse Tracker (.it) ファイルからサウンドバンクを作り、`spcLoad()`, `spcPlay()` などで再生。効果音は `snesbrr` で WAV→BRR に変換し `spcEffect()`。BGM+効果音のサンプル合計が ARAM（実質約58KB）に収まる必要がある。例: snes-examples/audio/{music, effects, effectsandmusic}。
