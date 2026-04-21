/**
 * reader.js
 * NarouEN Reader — コアロジック
 *
 * 依存: data.js (S), dict.js (DICT)
 * 音声: Web Speech API (SpeechSynthesis)
 *
 * ── インタラクション仕様 ──
 * [英文表示時]
 *   単語 1クリック          → 単語の意味をパネルに表示
 *   単語 ダブルクリック     → 英文 → 日本語に置き換え
 *   単語 長押し(500ms)      → 英文 → 日本語に置き換え
 *
 * [日本語表示時]
 *   ダブルクリック          → 文節対訳パネルを表示
 *   長押し(500ms)           → 文節対訳パネルを表示
 *   「← 英文に戻す」ボタン → 英文に戻す
 *
 * ── 再生モード ──
 *   1文のみ: 1文再生 → 停止 → 次の文に移動 → 再度 Play で続き
 *   連続   : 最後の文まで自動で読み進める
 */

/* ─── 状態 ─── */
let curSent   = 0;
let isPlaying = false;
let speed     = 1.0;
let mode      = 'single'; // 'single' | 'cont'

const replaced = new Array(S.length).fill(false);
const synth    = window.speechSynthesis;

const DBLMS  = 260;  // ダブルクリック判定ウィンドウ (ms)
const LONGMS = 500;  // 長押し判定時間 (ms)

let pendingClick = null;
let longTimer    = null;

/* ─── ユーティリティ ─── */

function buildWordMap(txt) {
  const map = [];
  const re  = /\b[a-zA-Z']+\b/g;
  let m;
  while ((m = re.exec(txt)) !== null) {
    map.push({ s: m.index, e: m.index + m[0].length, w: m[0] });
  }
  return map;
}

function clearHL() {
  document.querySelectorAll('.w.whl').forEach(el => el.classList.remove('whl'));
}

function cancelPending() {
  if (pendingClick !== null) { clearTimeout(pendingClick); pendingClick = null; }
}

/* ─── レンダリング ─── */

function renderAll() {
  const ta = document.getElementById('ta');
  ta.innerHTML = '';

  S.forEach((s, si) => {
    const sb = document.createElement('div');
    sb.className = 'sb' + (si === curSent ? ' active' : si < curSent ? ' done' : '');
    sb.id = 'sb-' + si;

    // 英文行
    const en = document.createElement('div');
    en.className  = 'en-line';
    en.style.display = replaced[si] ? 'none' : '';

    s.tokens.forEach((tok, ti) => {
      if (/^[.,!?—;:\-]+$/.test(tok)) {
        const sp = document.createElement('span');
        sp.className  = 'punct';
        sp.textContent = tok === '—' ? ' — ' : tok + ' ';
        en.appendChild(sp);
      } else {
        const sp = document.createElement('span');
        sp.className   = 'w';
        sp.textContent = tok;
        sp.dataset.si  = si;
        sp.dataset.ci  = s.ci[ti] ?? -1;
        attachEnEvents(sp, si);
        en.appendChild(sp);
        const spc = document.createElement('span');
        spc.textContent = ' ';
        en.appendChild(spc);
      }
    });

    // 日本語行
    const jp = document.createElement('div');
    jp.className     = 'jp-line';
    jp.id            = 'jp-' + si;
    jp.style.display = replaced[si] ? 'block' : 'none';

    const jpTxt = document.createElement('span');
    jpTxt.className   = 'jp-text';
    jpTxt.textContent = s.jp;

    const back = document.createElement('span');
    back.className   = 'back-btn';
    back.textContent = '← 英文に戻す';
    back.addEventListener('click', e => { e.stopPropagation(); doReplace(si); });

    const hint = document.createElement('span');
    hint.className   = 'dbl-hint';
    hint.textContent = 'ダブルクリックで文節対訳';

    jp.appendChild(jpTxt);
    jp.appendChild(back);
    jp.appendChild(hint);
    attachJpEvents(jp, si);

    sb.appendChild(en);
    sb.appendChild(jp);
    ta.appendChild(sb);
  });

  updateUI();
}

/* ─── イベント: 英文 ─── */

function attachEnEvents(sp, si) {
  // 長押し (mousedown → timeout)
  sp.addEventListener('mousedown', () => {
    longTimer = setTimeout(() => {
      longTimer = null;
      cancelPending();
      doReplace(si);
    }, LONGMS);
  });
  sp.addEventListener('mouseup',   () => { if (longTimer) { clearTimeout(longTimer); longTimer = null; } });
  sp.addEventListener('touchstart', () => {
    longTimer = setTimeout(() => { longTimer = null; cancelPending(); doReplace(si); }, LONGMS);
  }, { passive: true });
  sp.addEventListener('touchend',  () => { if (longTimer) { clearTimeout(longTimer); longTimer = null; } }, { passive: true });
  sp.addEventListener('touchmove', () => { if (longTimer) { clearTimeout(longTimer); longTimer = null; } }, { passive: true });

  // シングル / ダブルクリック
  sp.addEventListener('click', e => {
    e.stopPropagation();
    if (longTimer) { clearTimeout(longTimer); longTimer = null; }

    if (pendingClick !== null) {
      // 2回目のクリック → ダブルクリック → 置き換え
      cancelPending();
      doReplace(si);
      return;
    }

    const key = sp.textContent.toLowerCase().replace(/[^a-z]/g, '');
    pendingClick = setTimeout(() => {
      pendingClick = null;
      showWordPanel(key, sp);
    }, DBLMS);
  });
}

/* ─── イベント: 日本語 ─── */

function attachJpEvents(jp, si) {
  let jlTimer = null;
  const cancelJL = () => { if (jlTimer) { clearTimeout(jlTimer); jlTimer = null; } };

  jp.addEventListener('mousedown', e => {
    if (e.target.classList.contains('back-btn')) return;
    jlTimer = setTimeout(() => {
      jlTimer = null;
      if (jp._jpP) { clearTimeout(jp._jpP); jp._jpP = null; }
      showChunkPanel(si);
    }, LONGMS);
  });
  jp.addEventListener('mouseup',   cancelJL);
  jp.addEventListener('touchstart', e => {
    if (e.target.classList.contains('back-btn')) return;
    jlTimer = setTimeout(() => { jlTimer = null; showChunkPanel(si); }, LONGMS);
  }, { passive: true });
  jp.addEventListener('touchend',  cancelJL, { passive: true });
  jp.addEventListener('touchmove', cancelJL, { passive: true });

  jp.addEventListener('click', e => {
    if (e.target.classList.contains('back-btn')) return;
    cancelJL();
    if (jp._jpP) {
      clearTimeout(jp._jpP);
      jp._jpP = null;
      showChunkPanel(si);
      return;
    }
    jp._jpP = setTimeout(() => { jp._jpP = null; }, DBLMS);
  });
}

/* ─── 置き換えトグル ─── */

function doReplace(si) {
  replaced[si] = !replaced[si];
  const sb = document.getElementById('sb-' + si);
  const en = sb.querySelector('.en-line');
  const jp = document.getElementById('jp-' + si);
  if (replaced[si]) { en.style.display = 'none';  jp.style.display = 'block'; }
  else              { en.style.display = '';        jp.style.display = 'none';  }
  closePanel();
}

/* ─── パネル表示 ─── */

function showWordPanel(key, sp) {
  document.querySelectorAll('.w.wsel').forEach(el => el.classList.remove('wsel'));
  if (sp) sp.classList.add('wsel');

  const info = DICT[key] || { jp: '（辞書にない単語）', note: '' };
  document.getElementById('wp-en').textContent   = key;
  document.getElementById('wp-jp').textContent   = info.jp;
  document.getElementById('wp-note').textContent = info.note;
  document.getElementById('word-pane').style.display  = 'block';
  document.getElementById('chunk-pane').style.display = 'none';
  document.getElementById('info-panel').classList.add('open');
}

function showChunkPanel(si) {
  document.getElementById('chunk-label').textContent = '文 ' + (si + 1) + ' の文節対訳';
  const row = document.getElementById('chunk-row');
  row.innerHTML = '';
  S[si].chunks.forEach(c => {
    const card = document.createElement('div');
    card.className = 'chunk-card';
    const e = document.createElement('div'); e.className = 'chunk-en'; e.textContent = c.en;
    const j = document.createElement('div'); j.className = 'chunk-jp'; j.textContent = c.jp;
    card.appendChild(e); card.appendChild(j);
    row.appendChild(card);
  });
  document.getElementById('word-pane').style.display  = 'none';
  document.getElementById('chunk-pane').style.display = 'block';
  document.getElementById('info-panel').classList.add('open');
}

function closePanel() {
  document.getElementById('info-panel').classList.remove('open');
  document.getElementById('word-pane').style.display  = 'none';
  document.getElementById('chunk-pane').style.display = 'none';
  document.querySelectorAll('.w.wsel').forEach(el => el.classList.remove('wsel'));
}

/* ─── TTS ─── */

function highlightByChar(ci) {
  clearHL();
  const map = buildWordMap(S[curSent].tts);
  let target = null;
  for (const e of map) {
    if (ci >= e.s && ci < e.e) { target = e.w; break; }
    if (ci < e.s)              { target = e.w; break; }
  }
  if (!target) return;
  const key   = target.toLowerCase();
  const spans = document.querySelectorAll('#sb-' + curSent + ' .en-line .w');
  for (const sp of spans) {
    if (sp.textContent.toLowerCase() === key && !sp.classList.contains('whl')) {
      sp.classList.add('whl'); break;
    }
  }
}

function speakCurrent() {
  if (!synth) return;
  synth.cancel();

  const utt    = new SpeechSynthesisUtterance(S[curSent].tts);
  utt.lang     = 'en-US';
  utt.rate     = speed;
  utt.onboundary = e => { if (e.name === 'word') highlightByChar(e.charIndex); };
  utt.onend = () => {
    clearHL();
    if (!isPlaying) return;

    if (mode === 'single') {
      // 1文モード: 停止して次の文へカーソルを移動
      isPlaying = false;
      if (curSent < S.length - 1) { curSent++; renderAll(); }
      setPlayBtn(false);
      updateUI();
    } else {
      // 連続モード: 次の文へ自動再生
      if (curSent < S.length - 1) {
        curSent++;
        renderAll();
        setTimeout(speakCurrent, 300);
      } else {
        isPlaying = false;
        setPlayBtn(false);
        updateUI();
      }
    }
  };
  utt.onerror = () => { clearHL(); isPlaying = false; setPlayBtn(false); updateUI(); };
  synth.speak(utt);
}

/* ─── コントロール ─── */

function togglePlay() {
  if (!synth) return;
  if (isPlaying) {
    synth.cancel(); isPlaying = false; clearHL(); setPlayBtn(false); updateUI();
  } else {
    isPlaying = true; setPlayBtn(true); updateUI(); speakCurrent();
  }
}

function setMode(m) {
  if (isPlaying) { synth && synth.cancel(); isPlaying = false; clearHL(); }
  mode = m;
  document.getElementById('mode-single').className = 'mode-btn' + (m === 'single' ? ' active-single' : '');
  document.getElementById('mode-cont').className   = 'mode-btn' + (m === 'cont'   ? ' active-cont'   : '');
  setPlayBtn(false);
  updateUI();
}

function nextSent() {
  if (curSent >= S.length - 1) return;
  const p = isPlaying;
  synth && synth.cancel(); clearHL();
  if (p) isPlaying = false;
  curSent++;
  renderAll(); closePanel(); cancelPending();
  if (p && mode === 'cont') { isPlaying = true; setPlayBtn(true); setTimeout(speakCurrent, 100); }
  else                      { setPlayBtn(false); }
  updateUI();
}

function prevSent() {
  if (curSent <= 0) return;
  const p = isPlaying;
  synth && synth.cancel(); clearHL();
  if (p) isPlaying = false;
  curSent--;
  renderAll(); closePanel(); cancelPending();
  if (p && mode === 'cont') { isPlaying = true; setPlayBtn(true); setTimeout(speakCurrent, 100); }
  else                      { setPlayBtn(false); }
  updateUI();
}

function onSpeedChange() {
  speed = parseFloat(document.getElementById('spd-sel').value);
  if (isPlaying && synth) { synth.cancel(); speakCurrent(); }
}

/* ─── UI 更新 ─── */

function setPlayBtn(playing) {
  const btn = document.getElementById('btn-play');
  if (playing)             { btn.className = 'cb pause-btn';   btn.textContent = '⏸ Pause'; }
  else if (mode === 'single') { btn.className = 'cb play-single'; btn.textContent = '▶ 1文'; }
  else                     { btn.className = 'cb play-cont';   btn.textContent = '▶▶ 連続'; }
}

function updateUI() {
  document.getElementById('prog').style.width =
    ((curSent + 1) / S.length * 100) + '%';
  document.getElementById('sent-counter').textContent =
    (curSent + 1) + ' / ' + S.length;

  const badge = document.getElementById('stat-badge');
  if (isPlaying) {
    badge.className = 'stat-badge ' + (mode === 'single' ? 'speaking-single' : 'speaking-cont');
    badge.innerHTML = (mode === 'single' ? '再生中' : '連続再生中') +
      ' <span class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>';
  } else {
    badge.className   = 'stat-badge idle';
    badge.textContent = '文 ' + (curSent + 1);
  }
}

/* ─── 初期化 ─── */
renderAll();
