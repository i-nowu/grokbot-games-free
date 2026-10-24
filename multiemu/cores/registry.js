// マルチエミュ コア登録表。各コアは scripts を遅延読込し、window.MultiEmuCores[id] にファクトリを登録する。
window.MultiEmuCores = window.MultiEmuCores || {};
window.CORE_LIST = [
  { id: 'neogeo', name: 'ネオジオ (MVS/AES)', scripts: ['cores/neogeo/neocore.js', 'cores/neogeo/roms.local.js', 'cores/neogeo/cardfmt.js', 'cores/neogeo/adapter.js'], ready: true },
  { id: 'gb', name: 'ゲームボーイ / カラー', scripts: ['cores/gb/gbcore.js', 'cores/gb/roms.local.js', 'cores/gb/adapter.js'], ready: true },
  { id: 'lynx', name: 'Lynx (内蔵ゲームなし・ROMファイルで遊ぶ)', scripts: ['cores/lynx/lynxcore.js', 'cores/lynx/roms.local.js', 'cores/lynx/adapter.js'], ready: true },
  { id: 'pce', name: 'PCエンジン (HuCard)', ready: false },
  { id: 'gg', name: 'ゲームギア', ready: false },
  { id: 'msx', name: 'MSX', ready: false },
  { id: 'vectrex', name: '光速船 (Vectrex)', ready: false },
  { id: 'arcadia', name: 'アルカディア', ready: false },
  { id: 'scv', name: 'スーパーカセットビジョン', ready: false },
  { id: 'jaguar', name: 'Jaguar', ready: false },
  { id: 'n64', name: 'N64 (PCのみ)', ready: false },
  { id: 'cv', name: 'カセットビジョン', ready: false },
];
