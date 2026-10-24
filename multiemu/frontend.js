// 異能ソフト マルチエミュ 共通フロントエンド 。コアIFは docs/CORE_IF.md。
(async () => {
  const qs = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const coreId = qs.get('core');
  $('lic-text').textContent = window.MULTIEMU_LICENSES || '';
  $('btn-lic').onclick = () => $('lic').hidden = false; $('lic-close').onclick = () => $('lic').hidden = true;

  // ---- IndexedDB (セーブ と 読み込んだユーザーROM。どちらもこのブラウザ内だけ、送信なし) ----
  const idb = await new Promise(ok => { const q = indexedDB.open('multiemu', 7); q.onupgradeneeded = () => { const d = q.result;
      if (!d.objectStoreNames.contains('saves')) d.createObjectStore('saves'); if (!d.objectStoreNames.contains('roms')) d.createObjectStore('roms'); if (!d.objectStoreNames.contains('states')) d.createObjectStore('states'); if (!d.objectStoreNames.contains('thumbs')) d.createObjectStore('thumbs'); if (!d.objectStoreNames.contains('trash')) d.createObjectStore('trash'); if (!d.objectStoreNames.contains('saveMeta')) d.createObjectStore('saveMeta'); if (!d.objectStoreNames.contains('reasonArchive')) d.createObjectStore('reasonArchive'); };
    q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); });
  const dbGet = (st, k) => new Promise(ok => { if (!idb) return ok(null); const q = idb.transaction(st).objectStore(st).get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); });
  // 第20回: セーブの日時は IndexedDB 'saveMeta' {キー: {at, lsAt?}} (版6)。読むのは起動時に読み込んだ写し SA (同期で使える)
  const SA = {}, saveAt = () => ({ ...SA });
  const metaPut = (k, v) => new Promise(ok => { if (!idb) return ok(false); try { const t = idb.transaction('saveMeta', 'readwrite'); t.oncomplete = () => ok(true); t.onerror = t.onabort = () => ok(false); t.objectStore('saveMeta').put(v, k); } catch (e) { ok(false); } });
  // 第22回: 理由の記録は履歴 (新しい順、最大20件)。あふれた古いものは 'multiemu.saveAt.keptReasonArchive' の末尾へ移す (消さない)。第21回の1件だけの形は履歴の1件目として引き継ぐ
  const RH = 'multiemu.saveAt.keptReason', RA = 'multiemu.saveAt.keptReasonArchive';
  const reasonHist = () => { let v = null; try { v = JSON.parse(localStorage.getItem(RH) || 'null'); } catch (e) { v = null; } return Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []; };
  const addReason = reason => { try { const h = [{ at: new Date().toISOString(), reason }, ...reasonHist()]; if (h.length > 20) { let a = []; try { a = JSON.parse(localStorage.getItem(RA) || '[]'); if (!Array.isArray(a)) a = [a]; } catch (e) { a = [{ at: new Date().toISOString(), reason: '退避先が読めなかったので元の文字列を残す', raw: localStorage.getItem(RA) }]; }
      localStorage.setItem(RA, JSON.stringify(a.concat(h.slice(20)))); } localStorage.setItem(RH, JSON.stringify(h.slice(0, 20))); raFlush().then(() => raCheck(), () => raCheck()); return true; } catch (e) { quotaWarn('理由の記録', e); return false; } };
  { const raw = localStorage.getItem(RH); try { const v = JSON.parse(raw || 'null'); if (v && !Array.isArray(v) && typeof v === 'object') localStorage.setItem(RH, JSON.stringify([v])); } catch (e) {} }
  // DB に書けなかった日時は旧キー 'multiemu.saveAt' に足しておく (次の起動の移し替えで DB へ。既にある値は変えない)
  const saveAtFallback = (k, at) => { try { let o = {}; try { o = JSON.parse(localStorage.getItem('multiemu.saveAt') || '{}'); } catch (e) { o = null; } if (!o || typeof o !== 'object' || Array.isArray(o)) { addReason('DB に書けず、旧キーも表でないので退避できない: ' + k); return false; }
      if (!(k in o)) o[k] = at; localStorage.setItem('multiemu.saveAt', JSON.stringify(o)); addReason('DB に書けないので旧キーへ退避: ' + k); return true; } catch (e) { quotaWarn('セーブ日時 ' + k + ' (DB にも書けていない)', e); return false; } };
  // 第23回: localStorage が満杯でどこにも書けないとき、画面に警告を出して .mebak への書き出しを勧める
  window.__quota = { count: 0, last: '' };
  function quotaWarn(what, e) { window.__quota.count++; window.__quota.last = what + ': ' + (e && (e.name || e.message) || e);
    const show = () => { let w = document.getElementById('quota-warn'); if (!w) { w = document.createElement('div'); w.id = 'quota-warn'; w.setAttribute('role', 'alert');
        w.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;overflow:auto;box-sizing:border-box;background:#7a1010;color:#fff;padding:4px 8px;font-size:13px;line-height:1.4;box-shadow:0 2px 6px #0008';
        w.innerHTML = '<b>保存できませんでした</b> <button id="quota-export">全部を .mebak に書き出す</button> <button id="quota-close">閉じる</button><div>ブラウザの保存領域 (localStorage) が満杯で、どこにも書けません。いまのデータを .mebak に書き出して残してください。</div><div id="quota-msg"></div>';
        document.body.appendChild(w); w.querySelector('#quota-export').onclick = () => bkExport('all', true); w.querySelector('#quota-close').onclick = () => { w.hidden = true; warnLayout(); }; }
      w.hidden = false; w.querySelector('#quota-msg').textContent = '書けなかったもの: ' + window.__quota.last + ' (' + window.__quota.count + '回目)'; warnLayout(); };
    if (document.body) show(); else window.addEventListener('DOMContentLoaded', show); }
  // 第25回: 警告の帯は画面の上に積み、その高さだけ #app (画面とパッド) を下げる。帯がパッドや画面に重ならない (縦・横とも)
  // 帯の合計は画面の高さの 26% まで (横向きは 24%)。入りきらない分は帯の中でスクロール。見出しとボタンは先頭の行
  function warnLayout() { const vis = ['quota-warn', 'ra-top'].map(id => document.getElementById(id)).filter(w => w && !w.hidden), budget = Math.floor(innerHeight * (innerWidth > innerHeight ? 0.24 : 0.26)); let y = 0;
    for (const w of vis) { w.style.maxHeight = Math.floor(budget / vis.length) + 'px'; w.style.top = y + 'px'; y += w.getBoundingClientRect().height; }
    const app = document.getElementById('app'); if (app) app.style.top = y ? Math.ceil(y) + 'px' : ''; window.__warnH = Math.ceil(y); }
  window.addEventListener('resize', () => warnLayout());
  // 第23回: 退避キー RA に上限 (RA_MAX 件)。超えた古い分は日付ごとに IndexedDB 'reasonArchive' (キー YYYY-MM-DD) へ足し、読み直して確かめてから RA を縮める
  const RA_MAX = 50; window.__raMove = { runs: 0, moved: 0, verified: null, shrunk: false, reason: '' }; let raBusy = null;
  const raGet = d => new Promise(ok => { try { const q = idb.transaction('reasonArchive').objectStore('reasonArchive').get(d); q.onsuccess = () => ok(q.result); q.onerror = () => ok(undefined); } catch (e) { ok(undefined); } });
  const raPut = (d, v) => new Promise(ok => { try { const t = idb.transaction('reasonArchive', 'readwrite'); t.objectStore('reasonArchive').put(v, d); t.oncomplete = () => ok(true); t.onerror = t.onabort = () => ok(false); } catch (e) { ok(false); } });
  function raFlush() { if (!idb) return Promise.resolve(false); if (raBusy) return raBusy.then(raFlush); return raBusy = (async () => { const M = window.__raMove; M.runs++;
      let raw = localStorage.getItem(RA), a; try { a = JSON.parse(raw || '[]'); } catch (e) { M.reason = '退避キーが JSON として読めないので動かさない'; return false; } if (!Array.isArray(a)) a = [a]; if (a.length <= RA_MAX) return true;
      const mv = a.slice(0, a.length - RA_MAX), keep = a.slice(a.length - RA_MAX), by = {};
      for (const x of mv) { const d = x && typeof x.at === 'string' && /^\d{4}-\d\d-\d\d/.test(x.at) ? x.at.slice(0, 10) : 'unknown'; (by[d] = by[d] || []).push(x); }
      const before = {}; for (const d in by) { const cur = await raGet(d); before[d] = Array.isArray(cur) ? cur : cur == null ? [] : [cur]; if (!(await raPut(d, before[d].concat(by[d])))) { M.verified = false; M.reason = 'DB に書けない (' + d + ')'; return false; } }
      for (const d in by) { const back = await raGet(d), want = before[d].concat(by[d]); if (!Array.isArray(back) || JSON.stringify(back.slice(0, want.length)) !== JSON.stringify(want)) { M.verified = false; M.reason = '読み直した DB が合わない (' + d + ')'; return false; } }
      M.verified = true; if (localStorage.getItem(RA) !== raw) { M.reason = '途中で退避キーが変わったので縮めない'; return false; }
      try { localStorage.setItem(RA, JSON.stringify(keep)); M.shrunk = true; M.moved += mv.length; M.reason = ''; } catch (e) { M.reason = '縮められない: ' + e.message; return false; } return true; })().finally(() => { raBusy = null; }); }
  window.__raFlush = () => raFlush(); window.__raDump = () => new Promise(ok => { const r = {}; try { const c = idb.transaction('reasonArchive').objectStore('reasonArchive').openCursor(); c.onsuccess = () => { const x = c.result; if (x) { r[x.key] = x.value; x.continue(); } else ok(r); }; } catch (e) { ok(r); } });
  // 第24回: reasonArchive の件数と容量、20MB を超えたとき・DB に書けず退避キーが50件を超えたままのときの警告
  const RA_WARN_BYTES = 20 * 1024 * 1024;
  const raStats = () => new Promise(ok => { const r = { count: 0, days: 0, bytes: 0 }; if (!idb) return ok(r); const te = new TextEncoder();
    try { const c = idb.transaction('reasonArchive').objectStore('reasonArchive').openCursor(); c.onsuccess = () => { const x = c.result; if (x) { r.days++; r.count += Array.isArray(x.value) ? x.value.length : 1; r.bytes += te.encode(String(x.key)).length + te.encode(JSON.stringify(x.value)).length; x.continue(); } else ok(r); }; c.onerror = () => ok(r); } catch (e) { ok(r); } });
  const raLen = () => { try { const a = JSON.parse(localStorage.getItem(RA) || '[]'); return Array.isArray(a) ? a.length : 1; } catch (e) { return -1; } };
  async function raCheck() { const st = await raStats(), n = raLen(), M = window.__raMove; const W = window.__raWarn = { ...st, lsLen: n, big: st.bytes > RA_WARN_BYTES, stuck: n > RA_MAX && M.verified === false, msgs: [] };
    if (W.big) W.msgs.push('理由の退避 (IndexedDB reasonArchive) が ' + (st.bytes / 1048576).toFixed(1) + 'MB で、目安の 20MB を超えています。.mebak に書き出して手元に残してください。');
    if (W.stuck) W.msgs.push('DB に書けないため、退避用キー (localStorage) の理由が ' + n + '件 (上限50件) のままです' + (M.reason ? ' (理由: ' + M.reason + ')' : '') + '。.mebak に書き出して残してください。');
    const show = () => { let w = document.getElementById('ra-top');
      if (!W.msgs.length) { if (w) { w.hidden = true; warnLayout(); } return; }
      if (!w) { w = document.createElement('div'); w.id = 'ra-top'; w.setAttribute('role', 'alert'); w.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9998;overflow:auto;box-sizing:border-box;background:#7a4a00;color:#fff;padding:4px 8px;font-size:13px;line-height:1.4;box-shadow:0 2px 6px #0008';
        w.innerHTML = '<b>理由の記録について</b> <button id="ra-export">全部を .mebak に書き出す</button> <button id="ra-close">閉じる</button><div id="ra-top-msg"></div>';
        document.body.appendChild(w); w.querySelector('#ra-export').onclick = () => bkExport('all', true); w.querySelector('#ra-close').onclick = () => { w.hidden = true; warnLayout(); }; }
      w.hidden = false; w.querySelector('#ra-top-msg').textContent = W.msgs.join(' '); warnLayout(); };
    if (document.body) show(); else window.addEventListener('DOMContentLoaded', show); return W; }
  window.__raCheck = raCheck; window.__raStats = raStats;
  raFlush().then(raCheck, raCheck);
  // 第21回: 別のタブへ BroadcastChannel で知らせる (受けた側は写し SA を更新して一覧を描き直す)
  let saCh = null; try { saCh = new BroadcastChannel('multiemu.saveAt'); } catch (e) {}
  const saListeners = [], BK_EV = 'multiemu.saveAt.bcast';
  window.__saVia = saCh ? 'broadcast' : 'storage';
  const saRecv = d => { if (d && d.type === 'saveAt' && typeof d.k === 'string' && typeof d.at === 'string' && !isNaN(new Date(d.at))) { SA[d.k] = d.at; window.__saRecv = (window.__saRecv || 0) + 1; for (const f of saListeners) try { f(d); } catch (e) {} } };
  if (saCh) saCh.onmessage = ev => saRecv(ev.data);
  else window.addEventListener('storage', ev => { if (ev.key !== BK_EV || !ev.newValue) return; try { saRecv(JSON.parse(ev.newValue)); } catch (e) {} }); // 第22回: BroadcastChannel がないとき
  const stampSave = (k, at) => { k = String(k); SA[k] = at || new Date().toISOString(); const pr = metaPut(k, { at: SA[k] }); const at2 = SA[k]; return pr.then(ok => { if (!ok) { saveAtFallback(k, at2); return false; }
      const msg = { type: 'saveAt', k, at: at2 }; if (saCh) try { saCh.postMessage(msg); } catch (e) {} else try { localStorage.setItem(BK_EV, JSON.stringify({ ...msg, n: Math.random() })); } catch (e) {} return true; }); };
  const metaAll = () => new Promise(ok => { if (!idb) return ok([]); const r = [], q = idb.transaction('saveMeta').objectStore('saveMeta').openCursor(); q.onsuccess = () => { const c = q.result; if (c) { r.push({ key: String(c.key), v: c.value }); c.continue(); } else ok(r); }; q.onerror = () => ok(r); });
  // 移し替え: localStorage 'multiemu.saveAt' → saveMeta。DB に既にあれば DB を残し、違う旧日時は lsAt に残す。全部入ったのを読み直して確かめてから旧キーを外す
  const saMig = { found: 0, copied: 0, kept: 0, verified: false, removed: false, reason: '' };
  const isIso = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && !isNaN(new Date(v));
  if (idb) { let old = null; try { old = JSON.parse(localStorage.getItem('multiemu.saveAt') || 'null'); } catch (e) { old = null; saMig.reason = '旧キーが JSON として読めない'; }
    const cur = new Map((await metaAll()).map(e => [e.key, e.v]));
    if (old && typeof old === 'object') { const ks = Object.keys(old); saMig.found = ks.length;
      const badK = ks.filter(k => !isIso(old[k])); if (badK.length) saMig.reason = '日時でない値がある: ' + badK.slice(0, 5).join(', ');
      let wf = 0; for (const k of ks) { if (!isIso(old[k])) continue; const c = cur.get(k); if (!c) { (await metaPut(k, { at: old[k] })) ? saMig.copied++ : wf++; } else { if (c.at !== old[k] && !c.lsAt && !(await metaPut(k, { ...c, lsAt: old[k] }))) wf++; saMig.kept++; } }
      saMig.writeFailed = wf; if (wf && !saMig.reason) saMig.reason = 'DB に書けない (' + wf + '件)';
      const back = new Map((await metaAll()).map(e => [e.key, e.v])); saMig.verified = !badK.length && ks.every(k => back.has(k) && (back.get(k).at === old[k] || back.get(k).lsAt === old[k] || cur.has(k)));
      if (!saMig.verified && !saMig.reason) saMig.reason = '読み直した DB の日時が旧キーと合わない';
      if (saMig.verified) { try { localStorage.removeItem('multiemu.saveAt'); saMig.removed = true; localStorage.setItem('multiemu.saveAt.migratedAt', new Date().toISOString()); } catch (e) { saMig.reason = '旧キーを外せない: ' + e.message; } } }
    else if (old !== null) saMig.reason = '旧キーの中身が表ではない';
    if (!saMig.removed && saMig.reason) addReason(saMig.reason);
    if (saMig.removed && localStorage.getItem('multiemu.saveAt') !== null) { saMig.removed = false; saMig.reason = '旧キーを外せない (外した後も残っている)'; addReason(saMig.reason); }
    for (const e of await metaAll()) if (e.v && e.v.at) SA[e.key] = e.v.at; }
  window.__saMig = saMig;
  const stampThumb = v => v && typeof v === 'object' && v.u8 && !v.at ? { ...v, at: new Date().toISOString() } : v;
  const dbPut = (st, k, v) => new Promise(ok => { if (!idb) return ok(); if (st === 'thumbs') v = stampThumb(v); const t = idb.transaction(st, 'readwrite'); if (st === 'saves') stampSave(k); t.objectStore(st).put(v, k); t.oncomplete = ok; t.onerror = ok; });
  const sGet = k => dbGet('saves', k), sPut = (k, v) => dbPut('saves', k, v);
  async function openUserRom(r, msg) {
    const entry = CORE_LIST.find(c => c.id === r.core);
    if (!entry || !entry.ready) { msg((entry ? entry.name : r.core) + ' はまだ準備中です。'); return; }
    msg(entry.name + ' と判定 (' + r.why + ')。起動します…');
    await dbPut('roms', 'current', { core: r.core, name: r.name, hash: r.hash, data: r.data.buffer.slice(0) });
    const v = r.core === 'neogeo' ? (qs.get('core') === 'neogeo' && qs.get('v') || 'aes') : '';
    location.search = '?core=' + r.core + '&user=1' + (v ? '&v=' + v : '') + (qs.get('pad') ? '&pad=1' : '');
  }
  window.__openUserRom = openUserRom;
  function showNeedBios(key) {
    const v = qs.get('v') || '', box = document.createElement('div'); box.id = 'needbios'; box.className = 'needbios';
    box.innerHTML = '<p><b>BIOSが必要です。自分で正規に入手したものを読み込んでね</b></p><p>ネオジオ ' + (key.endsWith('aes') ? 'AES' : 'MVS') + ' 用の BIOS (zip) を選んでください。BIOS はこの端末のブラウザ内だけに保存し、外部に送信しません。</p>'
      + '<label class="filebtn">BIOSファイルを読み込む<input type="file" id="bios-file" accept=".zip,application/zip,application/octet-stream"></label> <button id="bios-back">メニューへ</button><div id="bios-msg"></div>';
    $('screen-wrap').appendChild(box); $('tap').hidden = true;
    $('bios-back').onclick = () => { location.search = ''; };
    $('bios-file').onchange = async e => { const f = e.target.files[0]; if (!f) return; const d = new Uint8Array(await f.arrayBuffer());
      if (!(d[0] === 0x50 && d[1] === 0x4b)) { $('bios-msg').textContent = 'zip ファイルではありません。'; return; }
      await dbPut('roms', key, { name: f.name, data: d.buffer.slice(0), at: Date.now() }); $('bios-msg').textContent = '保存しました。起動します…'; location.reload(); };
  }
  // ---- 機種選択画面 ----
  if (!coreId) {
    RomLoad.bind($('u-file'), $('u-drop'), r => openUserRom(r, t => $('u-msg').textContent = t), t => $('u-msg').textContent = t);
    for (const c of CORE_LIST) { const b = document.createElement('button'); b.textContent = c.name + (c.ready ? '' : ' (準備中)'); b.disabled = !c.ready;
      b.onclick = () => { location.search = '?core=' + c.id; }; $('syslist').appendChild(b); }
    return;
  }
  const entry = CORE_LIST.find(c => c.id === coreId && c.ready);
  if (!entry) { location.search = ''; return; }
  $('menu').hidden = true; $('app').hidden = false;
  const load = src => new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ng(new Error(src)); document.head.appendChild(s); });
  for (const s of entry.scripts) await load(s);

  // ---- 音声 (AudioWorklet、不可なら ScriptProcessor) ----
  const AC = window.AudioContext || window.webkitAudioContext;
  let actx = null; try { actx = new AC({ latencyHint: 'interactive' }); } catch (e) {}
  const rate = actx ? actx.sampleRate : 48000;
  let sink = null, muted = false;
  if (actx) {
    try {
      await actx.audioWorklet.addModule('audio-worklet.js');
      const node = new AudioWorkletNode(actx, 'emu-out', { numberOfInputs: 0, outputChannelCount: [2] }); node.connect(actx.destination);
      sink = { mode: 'AudioWorklet', push: f => node.port.postMessage(f, [f.buffer]), mute: m => node.port.postMessage({ mute: m }) };
    } catch (e) {
      const RB = new Float32Array(rate * 2), N = RB.length; let w = 0, r = 0; const fill = () => (w - r + N) % N;
      const sp = actx.createScriptProcessor(1024, 0, 2); sp.connect(actx.destination);
      sp.onaudioprocess = ev => { const L = ev.outputBuffer.getChannelData(0), R = ev.outputBuffer.getChannelData(1);
        for (let i = 0; i < L.length; i++) { if (fill() >= 2 && !muted) { L[i] = RB[r]; R[i] = RB[(r + 1) % N]; r = (r + 2) % N; } else L[i] = R[i] = 0; } };
      sink = { mode: 'ScriptProcessor', push: f => { if (fill() + f.length > N / 2) return; for (let i = 0; i < f.length; i++) { RB[w] = f[i]; w = (w + 1) % N; } }, mute: () => {} };
    }
  }
  $('audmode').textContent = sink ? ' ' + sink.mode : ' 音声なし';

  // ---- コア生成 ----
  const variant = qs.get('v') || '';
  // 第27回: BIOS が内蔵されていない構成 (予備) では、利用者が読み込んだ BIOS (IndexedDB roms 'bios-<core>-<型>') を渡す
  const biosKey = coreId === 'neogeo' ? 'bios-neogeo-' + (variant === 'aes' ? 'aes' : 'mvs') : null;
  const ub = biosKey ? await dbGet('roms', biosKey) : null;
  const core = await MultiEmuCores[coreId]({ sampleRate: rate, variant, bios: ub && ub.data ? new Uint8Array(ub.data) : null });
  core.init();
  if (core.needBios && core.needBios()) { showNeedBios(biosKey); return; }
  const vs = $('variant'); (core.variants || []).forEach(v => { const o = new Option(v.name, v.id); vs.add(o); }); vs.value = variant || (core.variants && core.variants[0].id) || '';
  vs.onchange = () => { location.search = '?core=' + coreId + '&v=' + vs.value + (qs.get('rom') ? '&rom=' + qs.get('rom') : '') + (qs.get('user') ? '&user=1' : '') + (qs.get('pad') ? '&pad=1' : ''); };
  vs.hidden = !core.variants;
  let rom = null;
  if (qs.get('user') === '1') { const u = await dbGet('roms', 'current');
    if (u && u.core === coreId) rom = { name: u.name, data: new Uint8Array(u.data), hash: u.hash, user: true }; }
  if (!rom) { const roms = core.builtin(); const b = roms.find(r => r.id === qs.get('rom')) || roms[0]; rom = b && { name: b.name, builtin: b.id }; }
  if (!rom) { alert('この機種の内蔵ゲームはありません。メニューの「ROMファイルを開く」から自分で用意したROMを読み込んでね'); location.search = ''; return; }
  try { core.loadRom(rom.user ? { data: rom.data, hash: rom.hash } : { builtin: rom.builtin }); }
  catch (e) { alert('読み込めませんでした: ' + e.message); location.search = ''; return; }
  $('gamename').textContent = rom.name; $('note').textContent = core.biosNote + ' / ' + core.name + (rom.user ? ' / ユーザーROM (ブラウザ内のみ)' : '') + (core.romInfo ? ' / ' + core.romInfo : '');
  // ネオジオのユーザーROM (.neo / 組立) は ヘッダの名前・年・メーカーを編集できる (v4 エミュ 2026-10-22)
  if (rom.user && coreId === 'neogeo') { $('btn-meta').hidden = false;
    $('btn-meta').onclick = () => { const m = RomLoad.getNeoMeta(rom.data); $('m-title').value = m.title; $('m-year').value = m.year || ''; $('m-maker').value = m.maker; $('m-ngh').textContent = 'NGH ' + m.ngh.toString(16).toUpperCase(); $('meta').hidden = false; };
    $('m-close').onclick = () => $('meta').hidden = true;
    $('m-save').onclick = async () => { RomLoad.setNeoMeta(rom.data, { title: $('m-title').value, year: +$('m-year').value || 0, maker: $('m-maker').value });
      const u = await dbGet('roms', 'current'); u.data = rom.data.buffer.slice(0); await dbPut('roms', 'current', u); location.reload(); }; }
  RomLoad.bind($('g-file'), $('screen-wrap'), r => openUserRom(r, t => $('gamename').textContent = t), t => $('gamename').textContent = t);

  // ---- セーブ (IndexedDB、ROM単位。サーバー送信なし) ----
  const saveKey = core.saveId(); const prev = await sGet(saveKey); if (prev) core.setSave(new Uint8Array(prev));
  let lastSave = core.getSave();
  async function flushSave() { const s = core.getSave(); if (!s) return; if (lastSave && s.length === lastSave.length && s.every((b, i) => b === lastSave[i])) return; lastSave = s; await sPut(saveKey, s.buffer.slice(0)); }
  setInterval(flushSave, 3000); addEventListener('pagehide', flushSave); document.addEventListener('visibilitychange', () => document.hidden && flushSave());

  // ---- ステートセーブ/ロード (第10回、全コア共通。state.js / docs/CORE_IF.md) ----
  if (window.MultiEmuState && qs.get('statefmt') === 't2' && core.getState) MultiEmuState.testFormat(core); // 第11回 試験用の新版形式
  const ST = window.MultiEmuState, hasState = !!(ST && core.getState && core.setState && core.romBytes && core.stateVersion);
  const romBytes = core.romBytes && core.romBytes();
  const romHash = hasState && romBytes ? (await ST.sha(romBytes)).slice(0, 32) : '';
  const stCtx = { core, get variant() { return core.stateVariant || ''; }, romHash, romName: rom.name, frame: () => frameNo };
  const stKey = n => romHash + '/' + core.id + '/' + n;
  if (romHash) try { const m = JSON.parse(localStorage.getItem('multiemu.saveMap') || '{}'); if (!m[saveKey] || m[saveKey].romHash !== romHash) { m[saveKey] = { romHash, romName: rom.name }; localStorage.setItem('multiemu.saveMap', JSON.stringify(m)); } } catch (e) {}
  const stMsg = (t, bad) => { const m = $('st-msg'); m.textContent = t; m.className = bad ? 'bad' : 'good'; };
  // ---- 第13回: サムネイル (ストア 'thumbs'、キーはステートと同じ。値 {type,w,h,u8:ArrayBuffer}。ステート本体は変えない) ----
  const TH_W = 120;
  async function mkThumb() { blit(); const w = TH_W, h = Math.max(1, Math.round(TH_W / AR)); const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(cv, 0, 0, w, h);
    let b = await new Promise(ok => c.toBlob(ok, 'image/webp', 0.7)); if (!b || b.type !== 'image/webp') b = await new Promise(ok => c.toBlob(ok, 'image/png'));
    return { type: b.type, w, h, u8: await b.arrayBuffer() }; }
  const thGet = k => dbGet('thumbs', k);
  const thCopy = async (from, to) => { const t = await thGet(from); if (t) await dbPut('thumbs', to, t); };
  const thImg = (t, alt) => { const i = document.createElement('img'); i.className = 'st-thumb'; i.alt = alt; i.width = TH_W / 2; i.height = Math.round(TH_W / 2 / AR);
    if (t) { i.src = URL.createObjectURL(new Blob([t.u8], { type: t.type })); i.onload = () => URL.revokeObjectURL(i.src); i.dataset.thumb = '1'; }
    else { i.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="45" viewBox="0 0 60 45"><rect width="60" height="45" fill="#2a2a2a" stroke="#666"/><text x="30" y="27" font-size="10" fill="#aaa" text-anchor="middle">NO IMG</text></svg>'); i.style.height = 'auto'; i.dataset.thumb = '0'; }
    return i; }
  async function stRefresh() { const box = $('st-slots'); box.textContent = '';
    for (let n = 1; n <= ST.SLOTS; n++) { const v = await dbGet('states', stKey(n)); const u = v && ST.unpack(new Uint8Array(v)); const row = document.createElement('div'); row.className = 'st-row';
      row.innerHTML = '<span class="st-th"></span><span class="st-name"></span><button data-s="save"></button><button data-s="load"></button>';
      row.querySelector('.st-name').textContent = n + ': ' + (u && u.h ? new Date(u.h.savedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '空き') + (u && u.h && u.h.coreVersion !== core.stateVersion ? ' (旧版)' : '');
      const bs = row.querySelector('[data-s=save]'), bl = row.querySelector('[data-s=load]'); bs.textContent = '保存'; bl.textContent = '読込'; bl.disabled = !v;
      if (v) row.querySelector('.st-th').appendChild(thImg(await thGet(stKey(n)), 'スロット' + n)); else row.querySelector('.st-th').remove();
      bs.id = 'st-save-' + n; bl.id = 'st-load-' + n; bs.onclick = () => stSave(n); bl.onclick = () => stLoad(n); box.appendChild(row); } }
  async function stSave(n) { try { const prevV = await dbGet('states', stKey(n)); const pv = verOf(prevV); if (prevV && pv && pv !== core.stateVersion) { await dbPut('states', stKey(n) + '#old:' + pv, prevV); await thCopy(stKey(n), stKey(n) + '#old:' + pv); } // 旧版は残す (サムネイルもあれば一緒に)
    const u8 = await ST.make(stCtx); let th = null; try { th = await mkThumb(); } catch (e) {}
    await dbPut('states', stKey(n), u8.buffer.slice(0)); if (th) await dbPut('thumbs', stKey(n), th); stMsg('スロット' + n + 'に保存しました (' + u8.length + 'バイト)。'); }
    catch (e) { stMsg('保存できませんでした: ' + e.message, true); } await stRefresh(); return $('st-msg').className === 'good'; }
  async function stApply(u8, what, keepMig) { const r = await ST.apply(stCtx, u8); if (r.error) { stMsg(what + 'を読み込めません: ' + r.error, true); return false; }
    if (r.migrated && keepMig) await keepMig(r.migrated);
    stMsg(what + 'を読み込みました (' + (r.migrated ? '旧版 ' + r.chain[0] + ' から移し替え' + (keepMig ? '・移し替え後を別に保存' : '') + '、' : '') + new Date(r.h.savedAt).toLocaleString('ja-JP') + ' に保存)。'); blit(); return true; }
  // 第11回: 古い版のステートは移し替えて読み、移し替えたものは <キー>@<今の版> に別に保存 (元のキーは消さない・書き換えない)
  const verOf = v => { const u = v && ST.unpack(new Uint8Array(v)); return u && u.h ? u.h.coreVersion : null; };
  async function stPick(n) { const base = await dbGet('states', stKey(n)); if (!base || verOf(base) === core.stateVersion) return { v: base, key: stKey(n) };
    const mig = await dbGet('states', stKey(n) + '@' + core.stateVersion); return mig ? { v: mig, key: stKey(n) + '@' + core.stateVersion, fromMig: true } : { v: base, key: stKey(n), old: true }; }
  async function stLoad(n) { const pk = await stPick(n); if (!pk.v) { stMsg('スロット' + n + 'は空です。', true); return false; }
    const ok = await stApply(new Uint8Array(pk.v), 'スロット' + n, async mu => { await dbPut('states', stKey(n) + '@' + core.stateVersion, mu.buffer.slice(0)); await thCopy(stKey(n), stKey(n) + '@' + core.stateVersion); });
    return ok; }
  // ---- 第12回: 容量・古いステート一覧・まとめファイル (何も消さない。既存キーは上書きしない) ----
  const dbAll = st => new Promise(ok => { if (!idb) return ok([]); const r = [], q = idb.transaction(st).objectStore(st).openCursor();
    q.onsuccess = () => { const c = q.result; if (c) { r.push({ key: c.key, u8: new Uint8Array(c.value) }); c.continue(); } else ok(r); }; q.onerror = () => ok(r); });
  const putNew = (k, u8) => new Promise(ok => { const t = idb.transaction('states', 'readwrite'), s = t.objectStore('states'); const g = s.get(k);
    g.onsuccess = () => { if (g.result === undefined) s.add(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.length), k); }; t.oncomplete = () => ok(true); t.onerror = () => ok(false); t.onabort = () => ok(false); });
  const thAll = () => new Promise(ok => { if (!idb) return ok([]); const r = [], q = idb.transaction('thumbs').objectStore('thumbs').openCursor();
    q.onsuccess = () => { const c = q.result; if (c) { r.push({ key: c.key, ...c.value }); c.continue(); } else ok(r); }; q.onerror = () => ok(r); });
  const thPutNew = (k, t) => new Promise(ok => { const x = idb.transaction('thumbs', 'readwrite'), s = x.objectStore('thumbs'); const g = s.get(k);
    g.onsuccess = () => { if (g.result === undefined) s.add({ type: t.type, w: t.w, h: t.h, u8: t.u8.buffer.slice(t.u8.byteOffset, t.u8.byteOffset + t.u8.length), ...(t.src ? { src: t.src } : {}) }, k); }; x.oncomplete = () => ok(true); x.onerror = () => ok(false); x.onabort = () => ok(false); });
  const kvAll = st => new Promise(ok => { if (!idb) return ok([]); const r = [], q = idb.transaction(st).objectStore(st).openCursor();
    q.onsuccess = () => { const c = q.result; if (c) { r.push({ key: c.key, v: c.value }); c.continue(); } else ok(r); }; q.onerror = () => ok(r); });
  const svMap = () => { try { return JSON.parse(localStorage.getItem('multiemu.saveMap') || '{}'); } catch (e) { return {}; } };
  const limitMB = () => { const v = +localStorage.getItem('multiemu.limitMB'); return v >= 1 ? v : 50; };
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  async function stUsage() { const all = await dbAll('states'), th = await thAll(); const tb = th.reduce((a, e) => a + e.u8.byteLength, 0);
    const r = { count: all.length, bytes: all.reduce((a, e) => a + e.u8.length, 0), thumbCount: th.length, thumbBytes: tb, thumbAvg: th.length ? Math.round(tb / th.length) : 0, estimate: null };
    // 第15回: ゲームごと (ROMハッシュ単位) の内訳と合計。セーブは saveId → ROMハッシュ の対応 (localStorage、起動時に記録) で結び付ける
    const games = new Map(), g = (id, name) => { if (!games.has(id)) games.set(id, { id, name: name || '?', states: 0, thumbs: 0, saves: 0, roms: 0 }); const x = games.get(id); if (name && x.name === '?') x.name = name; return x; };
    for (const e of all) { const k = String(e.key), u = ST.unpack(e.u8); g(k.split('/')[0], u.h && u.h.romName).states += e.u8.length; }
    for (const e of th) g(String(e.key).split('/')[0]).thumbs += e.u8.byteLength;
    const smap = svMap(); for (const e of await kvAll('saves')) { const k = String(e.key), m = smap[k]; const n = e.v && (e.v.byteLength || 0); if (m) g(m.romHash, m.romName).saves += n; else g('save:' + k, '不明').saves += n; }
    for (const e of await kvAll('roms')) { const n = e.v && e.v.data ? e.v.data.byteLength : 0; const x = e.v && e.v.hash && [...games.values()].find(z => smap[e.v.core + ':' + e.v.hash]); g('rom:' + e.key, 'ユーザーROM ' + ((e.v && e.v.name) || e.key)).roms += n; }
    for (const e of th) if (e.src && e.src.romName) g(String(e.key).split('/')[0], e.src.romName);
    for (const m of Object.values(smap)) if (games.has(m.romHash)) g(m.romHash, m.romName);
    for (const x of games.values()) if (x.name === '?') x.name = '不明';
    r.games = [...games.values()].map(x => ({ ...x, total: x.states + x.thumbs + x.saves + x.roms })).sort((a, b) => b.total - a.total);
    r.saveBytes = r.games.reduce((a, x) => a + x.saves, 0); r.romBytes = r.games.reduce((a, x) => a + x.roms, 0);
    { const tr = await kvAll('trash'); r.trashCount = tr.length; r.trashBy = { states: 0, thumbs: 0, saves: 0 }; for (const e of tr) if (e.v && e.v.u8 && e.v.store in r.trashBy) r.trashBy[e.v.store] += e.v.u8.byteLength; r.trashBytes = tr.reduce((a, e) => a + ((e.v && e.v.u8 && e.v.u8.byteLength) || 0), 0); }
    r.total = r.bytes + r.thumbBytes + r.saveBytes + r.romBytes + r.trashBytes; r.limitMB = limitMB(); r.over = r.total > r.limitMB * 1048576;
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); r.estimate = { usage: e.usage, quota: e.quota }; } } catch (e) {}
    return r; }
  // 古いステート = '#old:' を含むキー (上書き前に残した旧版)、移し替え前 (同じキー + '@版' があり中身の版が違う元キー)、それらを読み戻した '#imp:' 付きのキー
  async function stOldList() { const all = await dbAll('states'), keys = new Set(all.map(e => String(e.key))), out = [];
    for (const e of all) { const k = String(e.key), u = ST.unpack(e.u8), h = u.h || {}; let why = null;
      if (k.includes('#old:')) why = '上書き前の旧版';
      else if (!k.includes('@') && !k.includes('#') && [...keys].some(x => x.startsWith(k + '@') && x.slice(k.length + 1) !== h.coreVersion)) why = '移し替え前';
      if (why && k.includes('#imp:')) why += ' (読み戻し・別名)';
      if (why) out.push({ key: k, why, core: h.core || '?', romName: h.romName || '?', coreVersion: h.coreVersion || '?', size: e.u8.length, savedAt: h.savedAt || '', u8: e.u8 }); }
    return out.sort((a, b) => a.key < b.key ? -1 : 1); }
  const kb = n => n < 1024 ? n + 'B' : n < 1048576 ? (n / 1024).toFixed(1) + 'KB' : (n / 1048576).toFixed(2) + 'MB';
  async function stFileThumbList() { const th = await thAll(), all = await dbAll('states'), names = {}, smap = svMap();
    for (const e of all) { const u = ST.unpack(e.u8); if (u.h && u.h.romName) names[String(e.key).split('/')[0]] = u.h.romName; }
    for (const m of Object.values(smap)) if (m.romHash && m.romName && !names[m.romHash]) names[m.romHash] = m.romName;
    const out = [];
    for (const e of th) { const k = String(e.key), m = k.match(/^([^/]*)\/([^/]*)\/file:([0-9a-f]{8})(?:-(\d+))?$/); if (!m) continue; const s = e.src || {};
      out.push({ key: k, romHash: s.romHash || m[1], core: s.core || m[2] || '不明', game: s.romName || names[m[1]] || '不明', stateSha: s.stateSha256 || m[3] + '… (先頭8桁のみ)', fileName: s.fileName || '', fileVer: s.fileVer || 0,
        savedAt: s.savedAt || '', thumbSavedAt: s.thumbSavedAt || '', n: m[4] ? +m[4] : 1, size: e.u8.byteLength, partial: !e.src, t: e }); }
    return out.sort((a, b) => a.key < b.key ? -1 : 1); }
  async function stArchRender() { const u = await stUsage(), old = await stOldList(); try { await duRender(); } catch (e) {}
    $('st-usage').textContent = 'ステート合計: ' + u.count + '件 ' + kb(u.bytes) + ' / サムネイル: ' + u.thumbCount + '枚 ' + kb(u.thumbBytes) + (u.thumbCount ? ' (1枚平均 ' + kb(u.thumbAvg) + ')' : '') + (u.estimate ? ' / このサイト全体の使用量: ' + kb(u.estimate.usage) + (u.estimate.quota ? ' (上限の目安 ' + kb(u.estimate.quota) + ')' : '') : ' / 全体の使用量は取れません');
    $('st-usage').textContent += ' / ゴミ箱: ' + u.trashCount + '件 ' + kb(u.trashBytes) + ' / 合計 (ステート+サムネイル+セーブ+ROM) とゴミ箱: ' + kb(u.total) + ' / 警告する量 ' + u.limitMB + 'MB';
    if ($('st-trash-usage')) $('st-trash-usage').textContent = '内訳: ステート ' + kb(u.bytes) + ' / サムネイル ' + kb(u.thumbBytes) + ' / セーブ ' + kb(u.saveBytes) + ' / ROM ' + kb(u.romBytes) + ' / ゴミ箱 ' + kb(u.trashBytes) + ' (' + u.trashCount + '件: ステート ' + kb(u.trashBy.states) + '・サムネイル ' + kb(u.trashBy.thumbs) + '・セーブ ' + kb(u.trashBy.saves) + ')';
    if ($('st-trash-usage') && localStorage.getItem('multiemu.saveAt') !== null) { let r = ''; r = (reasonHist()[0] || {}).reason || ''; $('st-trash-usage').textContent += ' / 古いセーブ日時のキー (localStorage) は移し終えていないので残しています' + (r ? ' (理由: ' + r + ')' : '') + '。'; }
    if ($('st-trash-usage')) { const W = await raCheck(); $('st-trash-usage').textContent += ' / 理由の退避 (IndexedDB reasonArchive): ' + W.count + '件・' + W.days + '日分・' + kb(W.bytes) + ' / 退避用キー (localStorage): ' + Math.max(W.lsLen, 0) + '件 (上限50)';
      let rw = $('ra-warn'); if (!rw) { rw = document.createElement('div'); rw.id = 'ra-warn'; rw.className = 'bad'; $('st-trash-usage').after(rw); } rw.hidden = !W.msgs.length; rw.textContent = W.msgs.length ? '⚠ ' + W.msgs.join(' ') : ''; }
    $('st-warn').hidden = !u.over; $('st-warn').textContent = u.over ? '⚠ 使用量 ' + kb(u.total) + ' が決めた量 ' + u.limitMB + 'MB を超えています。古いステートはまとめて書き出して手元に残せます (このアプリから消す機能はまだありません)。' : '';
    if (document.activeElement !== $('st-limit')) $('st-limit').value = u.limitMB;
    const gb = $('st-games'); gb.textContent = '';
    for (const x of u.games) { const d = document.createElement('div'); d.className = 'st-game-row'; d.title = x.id;
      d.textContent = x.name + ': ' + kb(x.total) + ' (ステート ' + kb(x.states) + ' / サムネイル ' + kb(x.thumbs) + ' / セーブ ' + kb(x.saves) + (x.roms ? ' / ROM ' + kb(x.roms) : '') + ')' + (x.id.startsWith('save:') ? ' セーブのキー ' + x.id.slice(5) + ' (起動したことがないゲーム)' : ''); gb.appendChild(d); }
    // 第16回: ファイルから保存したサムネイル (キー .../file:<sha8>[-n]) の一覧。中身は読むだけ
    const fl = await stFileThumbList(), fb = $('st-filethumbs'); fb.textContent = fl.length ? '' : 'ファイルから保存したサムネイルはありません。';
    for (const f of fl) { const d = document.createElement('div'); d.className = 'st-old-row st-ft-row'; d.title = f.key; d.appendChild(thImg(f.t, f.key)); const sp = document.createElement('span');
      sp.textContent = 'ゲーム: ' + f.game + ' / 機種: ' + f.core + ' / ステートのハッシュ: ' + f.stateSha + (f.fileName ? ' / 元のファイル: ' + f.fileName : ' / 元のファイル: 不明') + (f.fileVer ? ' (.mestate 版' + f.fileVer + ')' : '')
        + (f.savedAt ? ' / ステート保存 ' + new Date(f.savedAt).toLocaleString('ja-JP') : '') + ' / ' + kb(f.size) + (f.n > 1 ? ' / 同じステートの別サムネイル ' + f.n + '番目' : '') + (f.partial ? ' (情報が足りないため分かる範囲だけ)' : '');
      d.appendChild(sp); fb.appendChild(d); }
    const box = $('st-old'); box.textContent = '';
    if (!old.length) { box.textContent = '古いステートはありません。'; }
    for (const o of old) { const d = document.createElement('div'); d.className = 'st-old-row'; const t = await thGet(o.key); o.hasThumb = !!t;
      d.appendChild(thImg(t, o.key)); const sp = document.createElement('span'); d.appendChild(sp);
      sp.textContent = o.core + ' / ' + o.romName + ' / 版 ' + o.coreVersion + ' / ' + kb(o.size) + ' / ' + (o.savedAt ? new Date(o.savedAt).toLocaleString('ja-JP') : '日時不明') + ' (' + o.why + ')' + (t ? '' : ' (サムネイルなし)'); d.title = o.key; box.appendChild(d); }
    $('st-arch-export').disabled = !old.length; return { usage: u, old: old.map(({ u8, ...x }) => x) }; }
  async function stArchExport(download) { const old = await stOldList(); if (!old.length) { stMsg('古いステートはありません。', true); return null; }
    const ents = []; for (const o of old) { const t = await thGet(o.key); ents.push({ key: o.key, u8: o.u8, thumb: t && { type: t.type, w: t.w, h: t.h, u8: new Uint8Array(t.u8) } }); }
    const u8 = await ST.archPack(ents);
    if (download) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8])); a.download = 'multiemu_old_states_' + new Date().toISOString().slice(0, 10) + '.mearch'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    stMsg('古いステート ' + old.length + '件をまとめて書き出しました (' + kb(u8.length) + ')。'); return u8; }
  async function stArchImport(u8) { const r = await ST.archUnpack(u8); if (r.error) { stMsg('まとめファイルを読み戻せません: ' + r.error + ' 何も変えていません。', true); return { error: r.error }; }
    const res = { added: [], skipped: [], renamed: [], thumbs: 0, archVersion: r.head.version };
    for (const e of r.entries) { let k = e.key, n = 0;
      for (;;) { const ex = await dbGet('states', k); if (!ex) break; if (same(new Uint8Array(ex), e.u8)) { k = null; break; }
        n++; k = e.key + '#imp:' + e.meta.sha256.slice(0, 8) + (n > 1 ? '-' + n : ''); }
      if (k === null) { res.skipped.push(e.key); continue; }
      await putNew(k, e.u8); if (e.thumb) { await thPutNew(k, e.thumb); res.thumbs++; } (k === e.key ? res.added : res.renamed).push(k === e.key ? k : { from: e.key, to: k }); }
    stMsg('まとめファイルから読み戻しました: 追加 ' + res.added.length + '件・同じ中身で飛ばした ' + res.skipped.length + '件・中身が違うので別名で保存 ' + res.renamed.length + '件。');
    await stRefresh(); await stArchRender(); return res; }
  // ---- 第14回: .mestate 版2 (サムネイル入り) の書き出し/読込。読込はステートを当てるだけで、IndexedDB (ステート・サムネイル) には何も書かない ----
  async function stFileExport(download) { const st = await ST.make(stCtx); let th = null; try { th = await mkThumb(); } catch (e) {}
    const u8 = await ST.fileMake(st, th && { ...th, u8: new Uint8Array(th.u8) });
    if (download) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8])); a.download = (rom.name || core.id).replace(/[\\/:*?"<>| ]+/g, '_') + '.mestate'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    stMsg('ファイルに書き出しました (' + kb(u8.length) + (th ? '、サムネイル ' + kb(th.u8.byteLength) : '') + ')。'); return u8; }
  // 第15回: ファイルのサムネイルは「サムネイルを保存」を押したときだけ thumbs に <ROMハッシュ>/<コア>/file:<ステートsha先頭8> で保存。
  // 同じキーに同じ中身があれば何もしない、違う中身があれば -2, -3 … の新しいキー。既存は上書きしない。ステートは書かない。
  let pendThumb = null;
  async function stThumbSave() { const t = pendThumb; if (!t) { stMsg('保存するサムネイルがありません。', true); return { error: 'none' }; }
    const k0 = romHash + '/' + core.id + '/file:' + t.stSha; let k = k0, n = 1;
    for (;;) { const ex = await thGet(k); if (!ex) break; if (same(new Uint8Array(ex.u8), t.u8)) { stMsg('同じサムネイルがもう保存されています (' + k + ')。何も変えていません。'); pendThumb = null; $('st-thumb-save').hidden = true; return { skipped: k }; } n++; k = k0 + '-' + n; }
    if (t.src) t.src.thumbSavedAt = new Date().toISOString(); await thPutNew(k, t); pendThumb = null; $('st-thumb-save').hidden = true; stMsg('サムネイルを保存しました (' + kb(t.u8.length) + (k !== k0 ? '、同じ名前に別のサムネイルがあったので新しいキー ' + k.slice(k.lastIndexOf('/') + 1) : '') + ')。'); await stArchRender(); return { saved: k }; }
  async function stFileImport(u8, what, fname) { const r = await ST.fileUnpack(u8); if (r.error) { stMsg(what + 'を読み込めません: ' + r.error + ' 何も変えていません。', true); return { error: r.error }; }
    const ok = await stApply(r.state, what); if (!ok) { $('st-msg').append(' 何も変えていません。'); return { error: $('st-msg').textContent }; }
    pendThumb = null; $('st-thumb-save').hidden = true;
    if (r.thumb) { const m = $('st-msg'); m.prepend(thImg({ type: r.thumb.type, u8: r.thumb.u8 }, 'ファイルのサムネイル'));
      const full = await ST.sha(r.state), hh = ST.unpack(r.state).h || {};
      pendThumb = { ...r.thumb, stSha: full.slice(0, 8), src: { stateSha256: full, fileName: fname || '', fileVer: r.ver, core: hh.core || '', romHash: hh.romHash || '', romName: hh.romName || '', coreVersion: hh.coreVersion || '', savedAt: hh.savedAt || '', thumbSavedAt: '' } }; $('st-thumb-save').hidden = false; }
    else $('st-msg').append(' (サムネイルなしの形式 ' + r.ver + ')');
    return { ok: true, ver: r.ver, thumb: !!r.thumb }; }
  // ---- 第17回: バックアップ (.mebak) ステート・サムネイル・セーブを ゲームごと/全部 で書き出し、確認画面のあと取り込む。上書きしない・消さない ----
  const BK = window.MultiEmuBackup;
  const valBytes = (store, v) => v == null ? null : store === 'thumbs' ? new Uint8Array(v.u8) : new Uint8Array(v);
  async function bkCollect(scope) { const ents = [], smap = svMap(), inScope = k => scope === 'all' || String(k).split('/')[0] === scope;
    for (const e of await dbAll('states')) if (inScope(e.key)) ents.push({ store: 'states', key: String(e.key), u8: e.u8, meta: {}, at: when('states', e.u8) });
    for (const e of await thAll()) if (inScope(e.key)) ents.push({ store: 'thumbs', key: String(e.key), u8: new Uint8Array(e.u8), meta: { type: e.type, w: e.w, h: e.h, ...(e.src ? { src: e.src } : {}) }, at: e.at || '' });
    for (const e of await kvAll('saves')) { const k = String(e.key), m = smap[k]; if (scope === 'all' || (m && m.romHash === scope)) ents.push({ store: 'saves', key: k, u8: new Uint8Array(e.v), meta: m ? { romHash: m.romHash, romName: m.romName } : {}, at: SA[k] || '' }); }
    if (scope === 'all') { const te = new TextEncoder(), arc = await window.__raDump(); // 第25回: 理由の記録 (reasonArchive・退避用キー・履歴) も全部の書き出しに入れる
      for (const d of Object.keys(arc).sort()) ents.push({ store: 'reasons', key: 'archive/' + d, u8: te.encode(JSON.stringify(Array.isArray(arc[d]) ? arc[d] : [arc[d]])), meta: {}, at: '' });
      for (const [k, lk] of [['ls/keptReasonArchive', RA], ['ls/keptReason', RH]]) { const raw = localStorage.getItem(lk); if (raw === null) continue; let v; try { v = JSON.parse(raw); } catch (e) { v = [{ at: '', reason: '読めなかった元の文字列', raw }]; } if (!Array.isArray(v)) v = [v]; if (v.length) ents.push({ store: 'reasons', key: k, u8: te.encode(JSON.stringify(v)), meta: {}, at: '' }); } }
    return ents; }
  // 第25回: 理由の記録の取り込み。今ある記録 (履歴・退避用キー・reasonArchive のどこか) と同じものは飛ばし、足りないものだけ足す。上書きしない
  const rsJ = x => JSON.stringify(x);
  async function rsHave() { const s = new Set(), arc = await window.__raDump(); for (const v of Object.values(arc)) for (const x of [].concat(v)) s.add(rsJ(x));
    for (const x of reasonHist()) s.add(rsJ(x)); try { for (const x of [].concat(JSON.parse(localStorage.getItem(RA) || '[]'))) s.add(rsJ(x)); } catch (e) {} return s; }
  const rsList = e => { try { return [].concat(JSON.parse(new TextDecoder().decode(e.u8))); } catch (er) { return []; } };
  async function rsApply(e, miss) { if (!miss.length) return true;
    if (e.key.startsWith('archive/')) { const d = e.key.slice(8); const cur = await new Promise(ok => { try { const q = idb.transaction('reasonArchive').objectStore('reasonArchive').get(d); q.onsuccess = () => ok(q.result); q.onerror = () => ok(undefined); } catch (er) { ok(undefined); } });
      const base = cur == null ? [] : [].concat(cur); return new Promise(ok => { try { const t = idb.transaction('reasonArchive', 'readwrite'); t.objectStore('reasonArchive').put(base.concat(miss), d); t.oncomplete = () => ok(true); t.onerror = t.onabort = () => ok(false); } catch (er) { ok(false); } }); }
    try { if (e.key === 'ls/keptReasonArchive') { let a = []; try { a = [].concat(JSON.parse(localStorage.getItem(RA) || '[]')); } catch (er) { return false; } localStorage.setItem(RA, JSON.stringify(a.concat(miss))); }
      else { const h = reasonHist().concat(miss).sort((x, y) => String(y.at || '').localeCompare(String(x.at || ''))); if (h.length > 20) { let a = []; try { a = [].concat(JSON.parse(localStorage.getItem(RA) || '[]')); } catch (er) { return false; } localStorage.setItem(RA, JSON.stringify(a.concat(h.slice(20)))); } localStorage.setItem(RH, JSON.stringify(h.slice(0, 20))); }
      return true; } catch (er) { quotaWarn('理由の記録の取り込み', er); return false; } }
  async function bkExport(scope, download) { const ents = await bkCollect(scope); if (!ents.length) { stMsg('書き出すものがありません。', true); return null; }
    const u8 = await BK.pack(scope === 'all' ? 'all' : { romHash: scope, romName: rom.name }, ents, ST.sha);
    if (download) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8])); a.download = 'multiemu_backup_' + (scope === 'all' ? 'all' : (rom.name || core.id).replace(/[\\/:*?"<>| ]+/g, '_')) + '_' + new Date().toISOString().slice(0, 10) + '.mebak'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    const c = st => ents.filter(e => e.store === st).length;
    stMsg('バックアップを書き出しました (' + (scope === 'all' ? '全部' : 'このゲーム') + ': ステート ' + c('states') + '件・サムネイル ' + c('thumbs') + '件・セーブ ' + c('saves') + '件' + (c('reasons') ? '・理由の記録 ' + c('reasons') + '組' : '') + '、' + kb(u8.length) + ')。'); return u8; }
  // 読み込み: .mebak と、前の形式の .mearch (版1/版2) を受け付ける
  async function bkRead(u8) { const m = new TextDecoder().decode(u8.subarray(0, 8));
    if (m === 'MEARCH01') { const r = await ST.archUnpack(u8); if (r.error) return r; const ents = [];
      for (const e of r.entries) { ents.push({ store: 'states', key: e.key, u8: e.u8, meta: {} }); if (e.thumb) ents.push({ store: 'thumbs', key: e.key, u8: e.thumb.u8, meta: { type: e.thumb.type, w: e.thumb.w, h: e.thumb.h } }); }
      return { kind: '.mearch 版' + r.head.version, entries: ents }; }
    const r = await BK.unpack(u8, ST.sha, ST.unpack); if (r.error) return r; return { kind: '.mebak 版' + r.head.version, entries: r.entries, head: r.head }; }
  async function bkPlan(ents) { const res = [], taken = { states: new Set(), thumbs: new Set(), saves: new Set() }, have = ents.some(e => e.store === 'reasons') ? await rsHave() : null;
    for (const e of ents) { let k = e.key, n = 1, act = 'add';
      if (e.store === 'reasons') { const l = rsList(e), miss = l.filter(x => { const j = rsJ(x); if (have.has(j)) return false; have.add(j); return true; });
        res.push({ store: 'reasons', key: e.key, to: e.key, action: miss.length ? 'add' : 'skip', size: e.u8.length, at: '', miss, total: l.length }); continue; }
      for (;;) { const ex = valBytes(e.store, await dbGet(e.store, k)); const mine = taken[e.store].has(k);
        if (!ex && !mine) break; if (ex && same(ex, e.u8)) { act = 'skip'; break; } n++; k = e.key + '-' + n; act = 'rename'; }
      if (act !== 'skip') taken[e.store].add(k); res.push({ store: e.store, key: e.key, to: k, action: act, size: e.u8.length, at: e.at || '' }); }
    const cnt = a => res.filter(x => x.action === a).length; return { items: res, add: cnt('add'), rename: cnt('rename'), skip: cnt('skip') }; }
  // 第20回: at があればその日時で、なければ日時不明のまま書く (取り込み用)
  const putNewIn = (store, k, v, at) => new Promise(ok => { const t = idb.transaction(store, 'readwrite'), s = t.objectStore(store), g = s.get(k);
    g.onsuccess = () => { if (g.result === undefined) { if (store === 'thumbs') { const { at: _a, ...w } = v; v = at ? { ...w, at } : w; } s.add(v, k); if (store === 'saves' && at) stampSave(k, at); } }; t.oncomplete = () => ok(true); t.onerror = () => ok(false); t.onabort = () => ok(false); });
  let bkPending = null;
  async function bkPreview(u8) { bkPending = null; $('bk-preview').hidden = true; const r = await bkRead(u8);
    if (r.error) { stMsg('バックアップを読み込めません: ' + r.error + ' 何も変えていません。', true); return { error: r.error }; }
    const pl = await bkPlan(r.entries); bkPending = r;
    $('bk-summary').textContent = r.kind + ' / 全 ' + r.entries.length + '件: 新規 ' + pl.add + '件・新しい名前で保存 ' + pl.rename + '件・同じ中身なので飛ばす ' + pl.skip + '件。「取り込む」を押すまで何も書きません。';
    const L = $('bk-list'); L.textContent = '';
    for (const x of pl.items) { const d = document.createElement('div'); d.className = 'bk-row bk-' + x.action; d.title = x.key;
      d.textContent = ({ add: '新規', rename: '新しい名前', skip: '飛ばす' })[x.action] + ' / ' + ({ states: 'ステート', thumbs: 'サムネイル', saves: 'セーブ', reasons: '理由の記録' })[x.store] + ' / ' + (x.store === 'reasons' ? x.key + ' (' + x.total + '件中 足りない ' + x.miss.length + '件)' : x.key.slice(x.key.indexOf('/') + 1 || 0)) + (x.action === 'rename' ? ' → ' + x.to.slice(x.to.lastIndexOf('/') + 1) : '') + ' / ' + kb(x.size) + ' / ' + (x.at ? lt(x.at, 16) : '日時不明'); L.appendChild(d); }
    $('bk-apply').disabled = !(pl.add + pl.rename); $('bk-preview').hidden = false; stMsg('バックアップの中身を確かめました。下の内訳を見て「取り込む」を押してください。'); return { kind: r.kind, ...pl }; }
  async function bkApply() { const r = bkPending; if (!r) { stMsg('取り込むバックアップがありません。', true); return { error: 'none' }; }
    const pl = await bkPlan(r.entries); let ok = 0, ng = 0; const smap = svMap();
    for (let i = 0; i < pl.items.length; i++) { const x = pl.items[i], e = r.entries[i]; if (x.action === 'skip') continue;
      const buf = e.u8.buffer.slice(e.u8.byteOffset, e.u8.byteOffset + e.u8.length);
      const v = x.store === 'thumbs' ? { type: e.meta.type, w: e.meta.w | 0, h: e.meta.h | 0, u8: buf, ...(e.meta.src ? { src: e.meta.src } : {}) } : buf;
      if (x.store === 'reasons') { (await rsApply(e, x.miss)) ? ok++ : ng++; continue; }
      (await putNewIn(x.store, x.to, v, e.at || '')) ? ok++ : ng++;
      if (x.store === 'saves' && e.meta.romHash && !smap[x.to]) smap[x.to] = { romHash: e.meta.romHash, romName: e.meta.romName || '' }; }
    try { localStorage.setItem('multiemu.saveMap', JSON.stringify(smap)); } catch (er) {}
    if (pl.items.some(x => x.store === 'reasons' && x.action === 'add')) { await raFlush(); await raCheck(); }
    bkPending = null; $('bk-preview').hidden = true;
    stMsg('バックアップを取り込みました: 新規 ' + pl.add + '件・新しい名前で保存 ' + pl.rename + '件・飛ばした ' + pl.skip + '件' + (ng ? '・書けなかった ' + ng + '件' : '') + '。'); await stRefresh(); await stArchRender();
    return { ...pl, written: ok, failed: ng }; }
  function bkCancel() { bkPending = null; $('bk-preview').hidden = true; stMsg('取り込みをやめました。何も変えていません。'); }

  // ---- 第18回: -2/-3… の重複の一覧・ゴミ箱 (IndexedDB 'trash') へ移す・戻す。完全に消す機能はない。元 (-n でない) は動かさない ----
  const SN = { states: 'ステート', thumbs: 'サムネイル', saves: 'セーブ' }, hex = u => BK.md5(u);
  const dupBase = k => { const m = /^(.*)-([0-9]+)$/.exec(k); return m && +m[2] >= 2 && !/file:/.test(k) ? m[1] : null; };
  const isFileThumb = (st, k) => st === 'thumbs' && /\/file:[0-9a-f]+(-[0-9]+)?$/.test(k);
  async function duRows(st) { return st === 'states' ? (await dbAll('states')).map(e => ({ key: String(e.key), u8: e.u8, v: e.u8.buffer.slice(e.u8.byteOffset, e.u8.byteOffset + e.u8.length) }))
    : st === 'thumbs' ? (await thAll()).map(e => ({ key: String(e.key), u8: new Uint8Array(e.u8), v: e })) : (await kvAll('saves')).map(e => ({ key: String(e.key), u8: new Uint8Array(e.v), v: e.v })); }
  const when = (st, u8, v, k) => { if (st === 'thumbs') return (v && v.at) || ''; if (st === 'saves') return saveAt()[k] || ''; if (st !== 'states') return ''; try { const h = ST.unpack(u8).h; return (h && (h.savedAt || h.migratedAt)) || ''; } catch (e) { return ''; } };
  async function duList() { const out = [];
    for (const st of ['states', 'thumbs', 'saves']) { const rows = await duRows(st), by = new Map(rows.map(r => [r.key, r]));
      for (const r of rows) { const fileT = isFileThumb(st, r.key), b = fileT ? null : dupBase(r.key); if (b === null && !fileT) continue; const o = b !== null && by.get(b);
        const x = { store: st, key: r.key, base: o ? b : null, orphan: !o, fileThumb: fileT, size: r.u8.length, md5: hex(r.u8), when: when(st, r.u8, r.v, r.key) };
        if (o) Object.assign(x, { baseSize: o.u8.length, baseMd5: hex(o.u8), baseWhen: when(st, o.u8, o.v, b) }); out.push(x); } }
    return out; }
  async function trAll() { return (await kvAll('trash')).map(e => ({ id: String(e.key), ...e.v, u8: undefined, size: e.v.u8.byteLength })); }
  const lt = (iso, n) => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('sv-SE').slice(0, n); };
  let duPending = null;
  function duAsk(items) { if (!items.length) { stMsg('移すものを選んでください。', true); return { error: 'none' }; }
    duPending = items.map(x => ({ store: x.store, key: x.key, md5: x.md5 })); $('du-ask-text').textContent = '選んだ ' + items.length + '件をゴミ箱へ移します (完全には消しません。ゴミ箱から戻せます): ' + items.map(x => SN[x.store] + ' ' + x.key.slice(x.key.indexOf('/') + 1)).join('、');
    $('du-ask').hidden = false; stMsg('確認してください。「移す」を押すまで何も変えません。'); return { asked: items.length }; }
  function duCancel() { duPending = null; $('du-ask').hidden = true; stMsg('移すのをやめました。何も変えていません。'); return { cancelled: true }; }
  const txMove = (from, to, k, check, v2, k2) => new Promise(ok => { const t = idb.transaction([from, to], 'readwrite'), a = t.objectStore(from), b = t.objectStore(to); let why = null;
    const g = a.get(k); g.onsuccess = () => { if (g.result === undefined) { why = 'もうありません'; return t.abort(); } const c = check(g.result); if (c) { why = c; return t.abort(); }
      const h = b.get(k2); h.onsuccess = () => { if (h.result !== undefined) { why = '移す先に同じ名前があります'; return t.abort(); } b.add(v2(g.result), k2); a.delete(k); }; };
    t.oncomplete = () => ok({ ok: true }); t.onabort = t.onerror = () => ok({ ok: false, why: why || '書けませんでした' }); });
  async function duMove() { const items = duPending; if (!items) { stMsg('移すものがありません。', true); return { error: 'none' }; } duPending = null; $('du-ask').hidden = true;
    const now = new Date().toISOString(), res = [], smap = svMap(); let n = 0;
    for (const x of items) { if (dupBase(x.key) === null && !isFileThumb(x.store, x.key)) { res.push({ key: x.key, ok: false, why: '元のものは動かしません' }); continue; }
      const id = now + '#' + (n++) + '#' + x.store + ':' + x.key;
      const r = await txMove(x.store, 'trash', x.key, v => hex(valBytes(x.store, v)) === x.md5 ? null : '中身が変わっています',
        v => { const u = valBytes(x.store, v); return { store: x.store, key: x.key, movedAt: now, at: (x.store === 'thumbs' ? v.at : x.store === 'saves' ? saveAt()[x.key] : '') || '', md5: hex(u), size: u.length, meta: x.store === 'thumbs' ? { type: v.type, w: v.w, h: v.h, ...(v.src ? { src: v.src } : {}), ...(v.at ? { at: v.at } : {}) } : x.store === 'saves' && smap[x.key] ? smap[x.key] : {}, u8: u.buffer.slice(u.byteOffset, u.byteOffset + u.length) }; }, id);
      res.push({ store: x.store, key: x.key, id, ...r }); }
    const ok = res.filter(r => r.ok).length; stMsg('ゴミ箱へ移しました: ' + ok + '件' + (ok < res.length ? '・移せなかった ' + (res.length - ok) + '件 (' + res.filter(r => !r.ok).map(r => r.why).join('、') + ')' : '') + '。');
    await stRefresh(); await stArchRender(); return { moved: ok, results: res }; }
  async function duRestore(id, mode) { const e = await dbGet('trash', id); if (!e) { stMsg('ゴミ箱にありません。', true); return { error: 'none' }; }
    if (hex(new Uint8Array(e.u8)) !== e.md5) { stMsg('ゴミ箱の中身の md5 が記録と違うので戻しません。何も変えていません。', true); return { error: 'md5' }; }
    let k = e.key, n = 1; while (await dbGet(e.store, k)) { if (mode === 'stop') { stMsg('戻す先「' + e.key + '」に同じ名前があるので止めました。何も変えていません。', true); return { error: 'exists', key: e.key }; } n++; k = e.key + '-' + n; }
    const r = await txMove('trash', e.store, id, () => null, v => e.store === 'thumbs' ? { type: v.meta.type, w: v.meta.w, h: v.meta.h, u8: v.u8, ...(v.meta.src ? { src: v.meta.src } : {}), ...(v.meta.at ? { at: v.meta.at } : {}) } : v.u8, k);
    if (r.ok && e.store === 'saves') { if (e.at) stampSave(k, e.at); }
    if (!r.ok) { stMsg('戻せませんでした: ' + r.why + '。何も変えていません。', true); return { error: r.why }; }
    const back = valBytes(e.store, await dbGet(e.store, k)), md5ok = !!back && hex(back) === e.md5;
    if (e.store === 'saves' && e.meta && e.meta.romHash) { const smap = svMap(); if (!smap[k]) { smap[k] = e.meta; try { localStorage.setItem('multiemu.saveMap', JSON.stringify(smap)); } catch (er) {} } }
    stMsg('ゴミ箱から戻しました: ' + SN[e.store] + ' ' + k + (k !== e.key ? ' (同じ名前があったので新しい名前)' : '') + (md5ok ? '・md5 一致' : '・md5 不一致!') + '。', !md5ok); await stRefresh(); await stArchRender();
    return { ok: true, to: k, renamed: k !== e.key, md5ok }; }
  async function duRender() { if (!$('du-list')) return; const L = $('du-list'), T = $('du-trash'), d = await duList(); L.textContent = '';
    if (!d.length) L.textContent = '-2, -3… の重複はありません。';
    for (const x of d) { const r = document.createElement('label'); r.className = 'du-row'; const c = document.createElement('input'); c.type = 'checkbox'; c.dataset.k = JSON.stringify(x); r.appendChild(c);
      const t = document.createElement('span'); t.textContent = SN[x.store] + ' ' + x.key.slice(x.key.indexOf('/') + 1) + ': ' + kb(x.size) + ' ' + (x.when ? lt(x.when, 16) : '日時不明') + ' md5 ' + x.md5.slice(0, 8) + (x.orphan ? ' ／ 元なし' + (x.fileThumb ? ' (ファイルから保存したサムネイル)' : '') : ' ／ 元 ' + x.base.slice(x.base.indexOf('/') + 1) + ': ' + kb(x.baseSize) + ' ' + (x.baseWhen ? lt(x.baseWhen, 16) : '日時不明') + ' md5 ' + x.baseMd5.slice(0, 8) + (x.md5 === x.baseMd5 ? ' (同じ中身)' : ' (中身が違う)'));
      r.appendChild(t); L.appendChild(r); }
    $('du-move').disabled = !d.length; const tr = await trAll(); T.textContent = ''; if (!tr.length) T.textContent = 'ゴミ箱は空です。';
    for (const x of tr) { const r = document.createElement('div'); r.className = 'du-row'; const s = document.createElement('span'); s.textContent = SN[x.store] + ' ' + x.key.slice(x.key.indexOf('/') + 1) + ': ' + kb(x.size) + ' 移した日時 ' + lt(x.movedAt, 19) + ' md5 ' + x.md5.slice(0, 8);
      const bt = document.createElement('button'); bt.textContent = '戻す'; bt.onclick = () => duRestore(x.id, 'rename'); r.append(s, bt); T.appendChild(r); }
    return { dupes: d.length, trash: tr.length }; }
  if (hasState) {
    $('bk-game').onclick = () => bkExport(romHash, true); $('bk-all').onclick = () => bkExport('all', true);
    $('bk-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await bkPreview(new Uint8Array(await f.arrayBuffer())); };
    saListeners.push(() => { if (!$('st').hidden) duRender(); });
    $('du-move').onclick = () => duAsk([...document.querySelectorAll('#du-list input:checked')].map(c => JSON.parse(c.dataset.k))); $('du-yes').onclick = () => duMove(); $('du-no').onclick = () => duCancel();
    $('bk-apply').onclick = () => bkApply(); $('bk-cancel').onclick = () => bkCancel();
    $('btn-state').onclick = async () => { await stRefresh(); await stArchRender(); $('st').hidden = false; };
    $('st-arch-export').onclick = () => stArchExport(true);
    $('st-thumb-save').onclick = () => stThumbSave();
    $('st-limit').onchange = async () => { const v = Math.round(+$('st-limit').value); if (v >= 1) localStorage.setItem('multiemu.limitMB', String(v)); await stArchRender(); };
    $('st-arch-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await stArchImport(new Uint8Array(await f.arrayBuffer())); }; $('st-close').onclick = () => $('st').hidden = true;
    $('st-export').onclick = () => stFileExport(true);
    $('st-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await stFileImport(new Uint8Array(await f.arrayBuffer()), 'ファイル「' + f.name + '」', f.name); };
  } else $('btn-state').hidden = true;

  // ---- 映像 ----
  const { width: W, height: H, aspect: AR } = core.video;
  const cv = $('screen'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d'); const img = ctx.createImageData(W, H); const img32 = new Uint32Array(img.data.buffer);
  const blit = () => { const v = core.getVideo(); img32.set(v.data); ctx.putImageData(img, 0, 0); };
  const wrap = $('screen-wrap');
  const layout = () => { const ww = wrap.clientWidth, hh = wrap.clientHeight; let w = Math.min(ww, hh * AR), h = w / AR; const n = Math.floor(h / H); if (n >= 2 && n * H * AR <= ww) { h = n * H; w = h * AR; } cv.style.width = Math.floor(w) + 'px'; cv.style.height = Math.floor(h) + 'px'; };
  new ResizeObserver(layout).observe(wrap); addEventListener('orientationchange', () => setTimeout(layout, 200)); layout();

  // ---- 入力 (キーボード / Gamepad / タッチ) ----
  const lbl = k => k.toUpperCase();
  for (const k of core.pad.system) { const d = document.createElement('div'); d.className = 's'; d.dataset.k = k; d.textContent = lbl(k); $('sysbtn').appendChild(d); }
  for (const k of core.pad.face) { const d = document.createElement('div'); d.className = k.length > 2 ? 'b long' : 'b'; d.dataset.k = k; d.textContent = lbl(k); $('abcd').appendChild(d); }
  let started = false;
  const start = () => { if (actx && actx.state !== 'running') actx.resume(); started = true; $('tap').style.display = 'none'; };
  $('tap').addEventListener('pointerdown', start);
  const keys = new Set(), held = new Map();
  addEventListener('keydown', e => { if (!started) start(); const k = core.keymap[e.code]; if (k) { keys.add(k); e.preventDefault(); } });
  addEventListener('keyup', e => { const k = core.keymap[e.code]; if (k) { keys.delete(k); e.preventDefault(); } });
  const pad = $('pad'); const hit = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.dataset && el.dataset.k ? el : null; };
  const touch = e => { e.preventDefault(); if (!started) start(); held.clear(); for (const t of e.touches) { const el = hit(t.clientX, t.clientY); if (el) held.set(t.identifier, el.dataset.k); }
    pad.querySelectorAll('[data-k]').forEach(el => el.classList.toggle('on', [...held.values()].includes(el.dataset.k))); };
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(t => pad.addEventListener(t, touch, { passive: false }));
  pad.addEventListener('mousedown', e => { const el = hit(e.clientX, e.clientY); if (el) { held.set('m', el.dataset.k); el.classList.add('on'); } });
  addEventListener('mouseup', () => { held.delete('m'); pad.querySelectorAll('.on').forEach(el => el.classList.remove('on')); });
  const GP = { 12: 'up', 13: 'down', 14: 'left', 15: 'right', 0: core.pad.face[0], 1: core.pad.face[1], 2: core.pad.face[2], 3: core.pad.face[3], 9: 'start', 8: 'select', 4: 'coin' };
  const AUTOTEST = qs.get('autotest') === '1'; let frameNo = 0; const script = [];
  if (AUTOTEST) { script.push([400, 410, 'coin'], [600, 606, 'start']); }
  function readInput() {
    const s = new Set([...keys, ...held.values()]);
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g) : null;
    if (gp) { gp.buttons.forEach((b, i) => { if (b.pressed && GP[i]) s.add(GP[i]); }); if (gp.axes[1] < -.5) s.add('up'); if (gp.axes[1] > .5) s.add('down'); if (gp.axes[0] < -.5) s.add('left'); if (gp.axes[0] > .5) s.add('right'); }
    for (const [a, b, k] of script) if (frameNo >= a && frameNo < b) s.add(k);
    core.setInput(s);
  }
  if (qs.get('pad') === '1') document.body.classList.add('showpad');
  $('btn-more').onclick = () => document.body.classList.toggle('baropen');
  $('btn-pad').onclick = () => document.body.classList.toggle('showpad');
  $('btn-menu').onclick = () => { flushSave(); location.search = ''; };
  $('btn-reset').onclick = () => core.reset();
  $('btn-mute').onclick = () => { muted = !muted; sink && sink.mute(muted); $('btn-mute').textContent = muted ? '音:OFF' : '音:ON'; if (!started) start(); };

  // ---- メインループ ----
  let paused = false, acc = 0, last = performance.now(), frames = 0, fpsT = last, audioSamples = 0;
  function tick(now) {
    acc += Math.min(now - last, 100); last = now; const step = 1000 / core.fps; let ran = 0;
    if (document.hidden || paused || !$('st').hidden) acc = 0; if (AUTOTEST && !paused && $('st').hidden) acc = Math.max(acc, step * 3);
    while (acc >= step && ran < 3) {
      readInput(); core.runFrame(); frameNo++;
      const a = core.getAudio(); audioSamples += a.length;
      if (sink && actx.state === 'running' && a.length) { const f = new Float32Array(a.length); for (let i = 0; i < a.length; i++) f[i] = a[i] / 32768; sink.push(f); }
      acc -= step; ran++; frames++;
    }
    if (ran) blit();
    if (now - fpsT > 1000) { $('fps').textContent = (frames * 1000 / (now - fpsT)).toFixed(1) + 'fps'; frames = 0; fpsT = now; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.__emu = { core, get paused() { return paused; }, set paused(v) { paused = !!v; }, get frame() { return frameNo; }, get audioSamples() { return audioSamples; }, audioMode: sink && sink.mode, flushSave, sGet, saveKey,
    state: hasState ? { save: stSave, load: stLoad, apply: (u8, w) => stApply(u8, w || 'テスト'), make: () => ST.make(stCtx), fileExport: async () => [...await stFileExport(false)], fileImport: (u, name) => stFileImport(new Uint8Array(u), 'テストファイル', name), fileThumbs: () => stFileThumbList().then(a => a.map(({ t, ...x }) => x)), putThumbRaw: (k, v) => dbPut('thumbs', k, { ...v, u8: new Uint8Array(v.u8).buffer }), thumbSave: stThumbSave, dupes: { saveAt, putLegacy: (st, k, v) => new Promise(ok => { const t = idb.transaction(st, 'readwrite'); t.objectStore(st).put(st === 'thumbs' ? { ...v, u8: new Uint8Array(v.u8).buffer } : new Uint8Array(v).buffer, k); t.oncomplete = () => ok(true); }), getThumb: async k => { const v = await dbGet('thumbs', k); return v && { at: v.at || null, type: v.type, bytes: [...new Uint8Array(v.u8)] }; }, list: duList, ask: duAsk, askKeys: async ks => duAsk((await duList()).filter(x => ks.includes(x.store + ':' + x.key))), move: duMove, cancel: duCancel, trash: trAll, restore: duRestore, render: duRender, md5: u => hex(new Uint8Array(u)) }, backup: { exportGame: async () => [...(await bkExport(romHash, false)) || []], exportAll: async () => [...(await bkExport('all', false)) || []], preview: u => bkPreview(new Uint8Array(u)), apply: bkApply, cancel: bkCancel, saves: async () => (await kvAll('saves')).map(e => [String(e.key), [...new Uint8Array(e.v)]]), putSave: (k, u) => dbPut('saves', k, new Uint8Array(u).buffer) }, setLimit: async mb => { localStorage.setItem('multiemu.limitMB', String(mb)); return stArchRender(); }, get: n => dbGet('states', stKey(n)), arch: { usage: stUsage, render: stArchRender, exportOld: async () => { const u = await stArchExport(false); return u ? [...u] : null; }, importArch: u => stArchImport(new Uint8Array(u)), dump: async () => (await dbAll('states')).map(e => [String(e.key), [...e.u8]]), thumbs: async () => (await thAll()).map(e => [String(e.key), { type: e.type, w: e.w, h: e.h, size: e.u8.byteLength, bytes: [...new Uint8Array(e.u8)] }]), putRaw: (k, u) => dbPut('states', k, new Uint8Array(u).buffer) }, getKey: k => dbGet('states', stKey(k)), put: (n, u8) => dbPut('states', stKey(n), u8.buffer.slice(0)), version: core.stateVersion, msg: () => $('st-msg').textContent, romHash } : null };
  window.__booted = true;
})();
