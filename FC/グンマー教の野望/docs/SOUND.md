# サウンド (GB音楽) ファミコン版
GB版と同じ関数名・番号。`#include "sound.h"`、`snd_init()` 後、毎フレーム `snd_update()`。
- 曲: 矩形波2=メロディ、三角波=ベース。曲データはGB版と同じ楽譜（`tools/snd/gen.py` でファミコンの周期表に変換）。
- SE: 矩形波1=カーソル/設置/強化/売却/ライフ減少、ノイズ=発射/撃破。
- Makefileに `src/sound.c` と `src/sound_data.c` のコンパイル・リンクを追加してください（固定バンクで可、約3KB）。
