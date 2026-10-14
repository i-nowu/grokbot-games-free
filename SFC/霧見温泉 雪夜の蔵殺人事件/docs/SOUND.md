# SFC版 音（GB音楽）

## 素材 (res/audio/*.it, 生成: `python3 tools/snd/make_it.py res/audio`)
| ID | 用途 |
|---|---|
| MOD_SFX (0) | 効果音バンク。必ず最初に変換 |
| MOD_TITLE | タイトル曲（Aマイナー、霧の温泉街） |
| MOD_INVESTIGATE | 捜査曲（ふだん、第1〜2章） |
| MOD_TENSION | 緊張曲（第3章以降） |
| MOD_CONFRONT | 対決曲 |
| MOD_ENDING | エンディング曲 |
| MOD_MINIGAME | ミニゲーム曲（2つ共通） |

効果音番号（MOD_SFX内のサンプル順）: 0 決定 / 1 キャンセル / 2 文字送り / 3 新しい証拠 / 4 正解 / 5 まちがい / 6 打つ / 7 ホームラン / 8 ブレーキ / 9 停車ベル

ARAM: 効果音約14KB＋最大の曲1.8KB。58KB上限に余裕あり。

## Makefile
```
AUDIOFILES := res/audio/sfx.it res/audio/title.it res/audio/investigate.it res/audio/tension.it res/audio/confront.it res/audio/ending.it res/audio/minigame.it
export SOUNDBANK := res/soundbank
SMCONVFLAGS := -s -o $(SOUNDBANK) -V -b 5
musics: $(SOUNDBANK).obj
all: musics ... $(ROMNAME).sfc
```

## 組み込み
```c
#include "res/soundbank.h"
extern char SOUNDBANK__;
spcBoot(); spcSetBank(&SOUNDBANK__);
// 曲を切り替えるとき（効果音も読み直す）
void bgm(u16 mod){ spcStop(); spcLoad(mod); for(u8 j=0;j<10;j++) spcLoadEffect(j); spcPlay(0); }
// 効果音: 8kHzサンプルなので pitch=2
spcEffect(2, SFX_DECIDE, 15*16+8);
// メインループで毎フレーム spcProcess(); を呼ぶ
```
動作確認用: `test/sndtest/`（公式例を改造。A=効果音、B=曲、L/R=効果音切替）でビルド成功。
