# グラフィックの作り方（GBグラフィック）

## 方針
- 絵はすべてPythonスクリプトで作っています。ドット絵を文字の並びとして書き、それをゲームボーイのタイル形式（2bpp）に変換して、Cのソースとして出力します。
- 色は4階調（白・薄・濃・黒）で、パレットは BGP=OBP0=0xE4 です。
- 文字は8x8ドットのフォントを使い、使う字だけをタイルにしています。BGのタイルは256枚までなので、その範囲に収めています。

## ファイル
| ゲーム | 生成スクリプト | 出力 | 説明 |
|---|---|---|---|
| ババ抜き | `gb-babanuki/tools/gfx/gen_gfx.py` | `src/gfx.c/h` | トランプ（数字13＋スート4の組み合わせ）、ジョーカー、裏、ロゴ、文字（224タイル） |
| ババ抜き | `gb-babanuki/tools/gfx/gen_notice.py` | `src/gfx_notice.c/h` | 起動時の注意書き（55タイル、専用） |
| グンマー教 | `gb-gunma/tools/gfx/gen_gfx.py` | `src/gfx.c/h` | マップ、ユニット4種x3段階、敵4種x2フレーム（8x16スプライト）、ロゴ、文字（BG230＋スプライト40タイル） |
| グンマー教 | `gb-gunma/tools/gfx/gen_notice.py` | `src/gfx_notice.c/h` | 注意書き（ババ抜きと同じ） |

使い方の詳細は各ゲームの `docs/GFX.md` を見てください。

## 作り直す手順
```
cd /workspace/gb-gunma   # または gb-babanuki
python3 tools/gfx/gen_gfx.py
python3 tools/gfx/gen_notice.py
make
```
生成された `src/gfx*.c/h` は手で直さず、スクリプトのほうを直します。

## 確認方法
- スクリプトを実行すると、`res/` に見本の画像（`mock_screen.png` など）ができるので、それで見た目を確かめます。
- ROMの実際の表示は、PyBoy（Python製のエミュレータ）でウィンドウを出さずに起動し、画面を画像に保存して確かめています。

## 素材のライセンス
