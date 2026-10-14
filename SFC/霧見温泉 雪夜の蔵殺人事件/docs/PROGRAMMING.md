# SFC版 プログラム（GBプログラマー）
- ビルド: `./build_game.sh`（script.txt → tools/script/compile.py → game/src/scen.h → build/kirimi.sfc, LoROM 512KB）
- フォント: tools/font/mkfont.py に tools/script/fixed_game.txt（証拠名・メニュー・スタッフ等）を追加入力。
- 通しテスト: `python3 test/playthrough.py`（注意書き→タイトル→1〜5章→両ミニゲーム→はんにん誤答→対決誤答→エンディング→タイトル）、`python3 test/retry.py`（別順序、ミニゲームBで中断、3回誤答で第3章に戻る→再クリア）。ドライバ tools/sfcrun/play.py は WRAM の dbg[] を読む。
- VRAM(word): BG1タイル0000 / BG1マップ2C00 / BG3マップ3000 / BG3フォント4000 / OBJ 6000（顔rows0-5, アイコン, ミニゲーム=tile160〜）。
- 背景パレットは +2 ずらして CGRAM 32〜127（BG3文字用に0〜31を空ける）。顔=OBJパレット1、アイコン=2、ミニゲーム=0。
- 顔とアイコンはタイル重複削除済みなので compile.py が map から展開（game/gfx/*_full.pic）。
- 章の進行条件は main.c の chmask（SPEC 7章）。立てるフラグがある話題/調べ物は、その章になるまで出ない。
