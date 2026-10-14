# 音（GB音楽）

作り直し: `python3 tools/snd/compose.py res/sound`（曲は VGM、効果音は WAV 13.3kHz）

## 曲（XGM2）
| 名前 | 用途 | ループ |
|---|---|---|
| bgm_title | タイトル（Cメジャー 140） | する |
| bgm_stage1 | ステージ1〜3（Aマイナー 150） | する |
| bgm_stage2 | ステージ4,6,7（Fメジャー 160） | する |
| bgm_stage3 | ステージ8,9（Eマイナー 172） | する |
| bgm_boss | ステージ5,10 ボス（Dマイナー 180） | する |
| bgm_ending | エンディング / ギャラリー（Cメジャー 104） | する |
| bgm_gameover | ゲームオーバーのジングル（約4.5秒） | しない |

FM ch1 旋律、ch2 ベース、ch3 和音、PSG ノイズ でドラム。FM ch4〜6 と PSG 矩形波は空き。

## 効果音（PCM）
se_rotate 回転 / se_land 着地 / se_clear1〜4 列消し1〜4段 / se_shot ボール発射 / se_break ブロックを壊す / se_kill 敵を倒す / se_ufo UFO / se_stageclear ステージクリア

## 組み込み
res の .res に（パスは game から見た場所に直す）:
```
XGM2 bgm_title "../res/sound/bgm_title.vgm"
WAV  se_rotate "../res/sound/se_rotate.wav" XGM2
```
```c
XGM2_play(bgm_stage1);
XGM2_playPCM(se_rotate, sizeof(se_rotate), SOUND_PCM_CH2);
```
効果音が重なる場面は SOUND_PCM_CH2 / CH3 を使い分けてください（CH1 は空けておく）。

## 確認
`sndcheck/` は全曲を12秒ずつ、続けて効果音を全部鳴らす確認用ROMです。ROM から録った音は `test/sound/*.wav` にあります（どの曲も無音の切れ目なし。ジングルは鳴り終わって止まる）。
