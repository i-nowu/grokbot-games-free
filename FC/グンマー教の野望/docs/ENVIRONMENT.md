# ファミコン版 グンマー教の野望 ビルド手順
- コンパイラ: GBDK-2020 のファミコン向け (`lcc -mmos6502:nes`)。GB版と同じ `tools/gbdk/` を使う。
- ソースは `src/*.c` を全部ビルド。GB版と同じく `#include <gbdk/platform.h>` を使えば多くの関数はそのまま動く。
- `make` で `build/gunma.nes`、`make run` で FCEUX が起動。
- `make shot` で起動から120フレーム後の画面を `test/shot.png` に保存（`FRAMES=600 make shot` で変更可）。FCEUXのLuaで自動操作もできる。
- 変数のアドレスは `build/gunma.noi` に出る。
- 注意: マッパーは30番(UNROM512)。画面は256x240、BGタイル256枚、スプライト64個・1ライン8個、BGパレットは16x16ドット単位で4色x4組。GB版の8x8単位の絵はそのままでは色分けできない。
