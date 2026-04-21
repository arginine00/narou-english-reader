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
let ttsVoiceUri = 'default';
let mode      = 'single'; // 'single' | 'cont'

// チャプター/ブックマーク用メタデータ
let metaPrevUrl = '';
let metaNextUrl = '';
let metaNcode   = '';
let metaEpisode = '';

let replaced = new Array(S.length).fill(false);
const synth  = window.speechSynthesis;

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

/**
 * content.js から受け取った { jp, en } 配列を
 * reader.js が必要とする S 形式に変換する。
 *
 * 自動トークナイズ: 英文を単語・句読点に分割し、
 * 簡易チャンク（文節対訳）を生成する。
 */
function parseParagraphs(paragraphs) {
  return paragraphs.map(p => {
    const en = p.en;
    const jp = p.jp;

    // トークナイズ: 単語と句読点を分離
    const rawTokens = en.match(/[a-zA-Z']+|[.,!?;:\-—]+/g) || [];
    const tokens = rawTokens;

    // TTS 用テキスト（ダッシュをスペースに）
    const tts = en.replace(/—/g, ', ');

    // 簡易チャンク: 英文全体 ↔ 日本語全体の 1:1 対応
    const chunks = [{ en: en, jp: jp }];

    // ci: 全トークンをチャンク 0 に割当（句読点は -1）
    const ci = tokens.map(tok => /^[.,!?;:\-—]+$/.test(tok) ? -1 : 0);

    return { tts, jp, tokens, ci, chunks };
  });
}

/**
 * iframe の高さを親ウィンドウに通知する。
 * content.js 側の RESIZE リスナーが受け取って iframe を調整する。
 */
function notifyResize() {
  if (window.parent !== window) {
    const h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'RESIZE', height: h }, '*');
  }
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

  // iframe 高さを親に通知 (無効化)
  // requestAnimationFrame(() => notifyResize());
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

  const wpEn   = document.getElementById('wp-en');
  const wpJp   = document.getElementById('wp-jp');
  const wpNote = document.getElementById('wp-note');

  wpEn.textContent = key;
  document.getElementById('word-pane').style.display  = 'block';
  document.getElementById('chunk-pane').style.display = 'none';
  document.getElementById('info-panel').classList.add('open');

  // 1. ローカル辞書を優先チェック
  if (DICT[key]) {
    wpJp.textContent   = DICT[key].jp;
    wpNote.textContent = DICT[key].note;
    return;
  }

  // 2. Chrome 拡張モード: background.js 経由で辞書 API を呼ぶ
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    wpJp.textContent   = '検索中…';
    wpNote.textContent = '';
    chrome.runtime.sendMessage({ type: 'LOOKUP_WORD', word: key }, res => {
      if (res && res.ok && res.result) {
        const r = res.result;
        wpJp.textContent   = r.definition;
        wpNote.textContent = r.partOfSpeech + (r.phonetic ? '  ' + r.phonetic : '');
      } else {
        wpJp.textContent   = '（辞書にない単語）';
        wpNote.textContent = '';
      }
    });
    return;
  }

  // 3. スタンドアロンモード: ローカル辞書のみ
  wpJp.textContent   = '（辞書にない単語）';
  wpNote.textContent = '';
}

function showChunkPanel(si) {
  const row = document.getElementById('chunk-row');
  const label = document.getElementById('chunk-label');
  label.textContent = '文 ' + (si + 1) + ' の文節対訳を取得中...';
  row.innerHTML = '';
  
  document.getElementById('word-pane').style.display  = 'none';
  document.getElementById('chunk-pane').style.display = 'block';
  document.getElementById('info-panel').classList.add('open');

  // もし既にチャンク分解されていれば(最初は1要素の塊)、再取得しない
  if (S[si].chunks.length > 1) {
    label.textContent = '文 ' + (si + 1) + ' の文節対訳';
    renderChunks(si);
    return;
  }

  // 1繋がりの英文を取得して分割翻訳リクエスト
  const enText = S[si].chunks[0].en;
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'TRANSLATE_CHUNKS', en: enText }, res => {
      if (res && res.ok && res.result) {
        S[si].chunks = res.result; // キャッシュする
      } else {
        S[si].chunks = [{ en: enText, jp: '(文節翻訳の取得に失敗しました)' }];
      }
      label.textContent = '文 ' + (si + 1) + ' の文節対訳';
      renderChunks(si);
    });
  } else {
    label.textContent = '文 ' + (si + 1) + ' の文節対訳';
    renderChunks(si);
  }
}

function renderChunks(si) {
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
  utt.rate     = speed;
  
  if (ttsVoiceUri && ttsVoiceUri !== 'default') {
    const voices = synth.getVoices();
    const voice = voices.find(v => v.voiceURI === ttsVoiceUri);
    if (voice) utt.voice = voice;
  } else {
    utt.lang = 'en-US'; // fallback
  }

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
  const prog = document.getElementById('prog');
  if (prog && S.length > 0) prog.style.width = ((curSent + 1) / S.length * 100) + '%';

  const sentCounter = document.getElementById('sent-counter');
  if (sentCounter) {
    sentCounter.textContent = (curSent + 1) + ' / ' + S.length;
  }

  const badge = document.getElementById('stat-badge');
  if (badge) {
    if (isPlaying) {
      badge.className = 'stat-badge ' + (mode === 'single' ? 'speaking-single' : 'speaking-cont');
      badge.innerHTML = (mode === 'single' ? '再生中' : '連続再生中') +
        ' <span class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>';
    } else {
      badge.className   = 'stat-badge idle';
      badge.textContent = '文 ' + (curSent + 1);
    }
  }

  // スクロール追従（画面中央に表示）
  const activeSb = document.getElementById('sb-' + curSent);
  if (activeSb) {
    activeSb.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/* ─── 初期化 ─── */

/**
 * postMessage で翻訳データを受信したら S を差し替えて再描画する。
 * content.js が iframe の load 後に INIT_DATA を送信する。
 * 追加データ: prevUrl, nextUrl, novelTitle, ncode, episode, settings, bookmark
 */
window.addEventListener('message', e => {
  if (e.data && e.data.type === 'INIT_DATA' && Array.isArray(e.data.paragraphs)) {
    // content.js から受け取ったデータで S を再構築
    S = parseParagraphs(e.data.paragraphs);
    curSent  = 0;
    replaced = new Array(S.length).fill(false);

    // ── 設定の適用 ──
    if (e.data.settings) {
      if (e.data.settings.speed) {
        speed = parseFloat(e.data.settings.speed);
        const sel = document.getElementById('spd-sel');
        if (sel) sel.value = e.data.settings.speed;
      }
      if (e.data.settings.ttsVoice) {
        ttsVoiceUri = e.data.settings.ttsVoice;
      }
    }

    // ── チャプターナビゲーション ──
    metaPrevUrl = e.data.prevUrl || '';
    metaNextUrl = e.data.nextUrl || '';
    metaNcode   = e.data.ncode   || '';
    metaEpisode = e.data.episode || '';

    const chapNav = document.getElementById('chapter-nav');
    if (metaPrevUrl || metaNextUrl) {
      chapNav.classList.add('visible');
      document.getElementById('chap-prev').disabled = !metaPrevUrl;
      document.getElementById('chap-next').disabled = !metaNextUrl;
      document.getElementById('chap-title').textContent = e.data.novelTitle || '';
    }

    // ── ブックマークボタン表示 ──
    if (metaNcode && metaEpisode) {
      document.getElementById('bm-btn').classList.add('visible');
    }

    // ── ブックマーク復元 ──
    if (e.data.bookmark && typeof e.data.bookmark.sentIndex === 'number') {
      curSent = Math.min(e.data.bookmark.sentIndex, S.length - 1);
    }

    renderAll();
  }
});

/* ─── チャプターナビ ─── */

function goPrevChapter() {
  if (metaPrevUrl && window.parent !== window) {
    window.parent.postMessage({ type: 'NAVIGATE', url: metaPrevUrl }, '*');
  }
}

function goNextChapter() {
  if (metaNextUrl && window.parent !== window) {
    window.parent.postMessage({ type: 'NAVIGATE', url: metaNextUrl }, '*');
  }
}

/* ─── ブックマーク ─── */

function saveBookmark() {
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'BOOKMARK_SAVE',
      sentIndex: curSent,
    }, '*');
    // UI フィードバック
    const btn = document.getElementById('bm-btn');
    btn.classList.add('saved');
    btn.textContent = '🔖 保存済み';
    setTimeout(() => {
      btn.classList.remove('saved');
      btn.textContent = '🔖 しおり';
    }, 2000);
  }
}

// スタンドアロン（reader.html を直接開いた場合）: デモデータで即描画
if (typeof S !== 'undefined' && S.length > 0) {
  renderAll();
}

// ==========================================
// イベントリスナー登録 (Manifest V3 CSP 対応)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // ナビゲーション
  document.getElementById('chap-prev')?.addEventListener('click', goPrevChapter);
  document.getElementById('chap-next')?.addEventListener('click', goNextChapter);

  // パネル閉じるボタン
  document.getElementById('close-word-pane')?.addEventListener('click', closePanel);
  document.getElementById('close-chunk-pane')?.addEventListener('click', closePanel);

  // コントローラー
  document.getElementById('mode-single')?.addEventListener('click', () => setMode('single'));
  document.getElementById('mode-cont')?.addEventListener('click', () => setMode('cont'));
  
  document.getElementById('btn-prev')?.addEventListener('click', prevSent);
  document.getElementById('btn-play')?.addEventListener('click', togglePlay);
  document.getElementById('btn-next')?.addEventListener('click', nextSent);

  document.getElementById('spd-sel')?.addEventListener('change', onSpeedChange);
  document.getElementById('bm-btn')?.addEventListener('click', saveBookmark);
});
