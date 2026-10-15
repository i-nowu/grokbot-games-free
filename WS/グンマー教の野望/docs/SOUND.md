# サウンド（GB音楽）ぐんま WS/WSC

## 組み込み方
1. 起動時に `snd_init()` を1回（波形メモリを IRAM の 64 バイト境界に置き、0x8F に設定する。ゲーム側で 0x8F を書き換えない）。
2. **1フレーム(75.47Hz)に1回** `snd_update()` を呼ぶ（メインループでも VBlank 割り込みでもよい。2回呼ぶと速くなる）。中で GB の 59.73Hz に換算して進める。
3. 番号は GB 版と同じ: `bgm_play(MUS_TITLE|MUS_BATTLE|MUS_BOSS|MUS_CLEAR|MUS_OVER)`、`bgm_stop()`、`bgm_playing()`、`sfx_play(SE_CUR|SE_SET|SE_UP|SE_SELL|SE_SHOT|SE_KILL|SE_DMG)`、`sfx_playing()`。TITLE/BATTLE/BOSS はループ、CLEAR/OVER は1回。GB 版の `music_play` `se_play` などの名前もマクロで使える。
4. 使うポート: 0x80-0x8B, 0x8E, 0x8F, 0x90, 0x91。ゲーム側では触らない。
- ch1=操作系SE、ch2=メロディ、ch3=ベース、ch4=発射・撃破（ノイズ）。SHOT は KILL 中なら鳴らさない（GB と同じ）。
- WSC でもそのまま動く（カラー版テスト ROM で確認）。ch2 の PCM、ch3 のスイープは使っていないので、WSC 新作で使うときは ch の割り当てを相談。

## GB 版との違い
- エンベロープ(64Hz)と SE_DMG のスイープ(128Hz)はソフトで再現。音量の段階は GB と同じ。
- ノイズの音色は LFSR が違うので少し違う（周波数は GB と同じに合わせた）。
