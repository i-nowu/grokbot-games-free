# 開発環境とビルド・デバッグ

## 使っている道具
- GBDK-2020（2025年12月のリリース版）: Cで書いてGB用ROMを作るためのコンパイラ一式。公式リリースのLinux版をそのまま展開しています。
- GNU make: ビルドを1コマンドにまとめるためのもの。
- mGBA（0.10.5+dfsg-1）: 手で遊んで確認するためのエミュレータ。
- PyBoy（2.8.1）: Pythonから自動で操作して画面を撮るためのエミュレータ。
- gcc: ルールの判定部分をPC上でテストするためのもの。

## 環境の作り方（Debian / Ubuntu）
```
sudo apt-get install -y make gcc mgba-sdl
pip install pyboy
mkdir -p tools && cd tools
curl -L -o gbdk.tar.gz https://github.com/gbdk-2020/gbdk-2020/releases/latest/download/gbdk-linux64.tar.gz
tar xzf gbdk.tar.gz
```

## フォルダ構成（どちらのゲームも同じ）
- `src/` : Cのソース。ここにある `*.c` は全部ビルドされます。
- `res/` : 素材（美咲フォントなど）。
- `docs/` : 仕様書と各担当の説明。
- `tools/` : GBDK-2020と、絵や音を作るスクリプト。
- `build/` : できあがったROM。

## ビルド
```
make        # build/babanuki.gb または build/gunma.gb ができる
make run    # mGBAで起動
make clean  # build/ を空にする
```
どちらも32KBのROMです。容量が足りなくなったら、バンク切り替え（MBC1）を使う設定に変えます。

## デバッグ
1. PC上でのテスト: ルールの判定部分を `gcc test/sim.c && ./a.out` で大量に対戦させ、止まったりおかしな終わり方をしたりしないかを確かめます。
2. PyBoyでの自動確認: ROMを自動で操作して画面を撮り、表示が崩れていないかを見ます。
3. mGBAで手で遊ぶ確認: 最後まで通して遊び、音量も耳で確かめます。
