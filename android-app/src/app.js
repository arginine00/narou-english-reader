import { CapacitorHttp } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

const STORAGE_KEYS = [
  'translationEngine', 'deeplApiKey', 'geminiApiKey', 'openaiApiKey', 'claudeApiKey',
  'defaultSpeed', 'ttsVoice'
];

// 現在開いている小説の目次URLを保持
let currentTocUrl = '';

document.addEventListener('DOMContentLoaded', () => {
  // エンジン切り替え
  document.getElementById('engine').addEventListener('change', onEngineChange);
  document.getElementById('test-btn').addEventListener('click', testApi);
  document.getElementById('save-btn').addEventListener('click', save);

  // 読み込みボタン
  document.getElementById('read-btn').addEventListener('click', onReadClicked);

  // 検索ボタン
  document.getElementById('search-btn').addEventListener('click', () => {
    const kw = document.getElementById('search-input').value.trim();
    if (kw) searchNarou(kw);
  });
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const kw = document.getElementById('search-input').value.trim();
      if (kw) searchNarou(kw);
    }
  });

  // 戻るボタン
  document.getElementById('back-home-btn').addEventListener('click', () => {
    document.getElementById('reader-screen').style.display = 'none';
    document.getElementById('home-screen').style.display   = 'block';
  });

  // 目次ボタン
  document.getElementById('toc-btn').addEventListener('click', () => {
    if (currentTocUrl) showToc(currentTocUrl);
    else alert('目次情報がありません。お手数ですがホームからURLを直接入力してください。');
  });

  // iframe内のリーダーからのメッセージ受信
  window.addEventListener('message', handleReaderMessages);

  // 設定読み込み
  chrome.storage.local.get(STORAGE_KEYS, data => {
    if (data.translationEngine) document.getElementById('engine').value = data.translationEngine;
    if (data.deeplApiKey)       document.getElementById('deepl-key').value   = data.deeplApiKey;
    if (data.geminiApiKey)      document.getElementById('gemini-key').value  = data.geminiApiKey;
    if (data.openaiApiKey)      document.getElementById('openai-key').value  = data.openaiApiKey;
    if (data.claudeApiKey)      document.getElementById('claude-key').value  = data.claudeApiKey;
    if (data.defaultSpeed)      document.getElementById('default-speed').value = data.defaultSpeed;
    populateVoices(data.ttsVoice);
    onEngineChange();
  });

  populateVoices();
});

// ── Capacitor Native HTTP による小説のパースと翻訳 ──
async function onReadClicked() {
  const urlEl = document.getElementById('narou-url');
  const url = urlEl.value.trim();
  if (!url) return;
  await loadNovel(url);
}

// \u2500\u2500 \u5c0f\u8aac\u3092\u96a0\u3057iframe\u3067\u30b9\u30af\u30ec\u30a4\u30d7\u3057\u3066\u30ea\u30fc\u30c0\u30fc\u753b\u9762\u3078\u79fb\u884c \u2500\u2500
async function loadNovel(url) {
  const msgEl = document.getElementById('read-msg');
  document.getElementById('home-screen').style.display = 'none';
  msgEl.style.display = 'block';
  msgEl.style.color = '#185FA5';
  document.getElementById('reader-screen').style.display = 'block';
  document.getElementById('reader-frame').src = '';
  msgEl.textContent = '\u30da\u30fc\u30b8\u3092\u8aad\u307f\u8fbc\u3093\u3067\u3044\u307e\u3059...\uff08JS\u8a8d\u8a3c\u4e2d\uff09';

  try {
    // \u2500\u2500 novel18 / moonlight: \u5e74\u9f62\u78ba\u8a8d\u30c8\u30fc\u30af\u30f3\u3092\u5148\u306b\u5f97\u308b \u2500\u2500
    const isNovel18 = url.includes('novel18.syosetu.com') || url.includes('moonlight.syosetu.com');
    if (isNovel18) {
      try {
        const origin = new URL(url).origin;
        await CapacitorHttp.post({
          url: `${origin}/yes18/`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': url },
          data: 'yes=yes',
        });
      } catch (_) {}
    }

    // \u2500\u2500 \u96a0\u3057iframe\u3067\u5c0f\u8aac\u30da\u30fc\u30b8\u3092\u8aad\u307f\u8fbc\u3080 \u2500\u2500
    // CapacitorHttp\u306f\u30c7\u30d5\u30a9\u30eb\u30c8\u3067\u30dc\u30c3\u30c8\u691c\u77e5\u3055\u308c\u308b\u305f\u3081\u3001
    // \u5b9f\u969b\u306eWebView\u3067\u30da\u30fc\u30b8\u3092\u958b\u304d\u3001JS\u8a8d\u8a3c\u30fb\u30af\u30c3\u30ad\u30fc\u51e6\u7406\u3092\u901a\u904e\u3059\u308b
    const scraped = await scrapeWithHiddenIframe(url, msgEl);

    const rawParagraphs = scraped.paragraphs;
    if (rawParagraphs.length === 0)
      throw new Error('\u5c0f\u8aac\u672c\u6587\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u5bfe\u5fdc\u30b5\u30a4\u30c8\u304b\u6b63\u3057\u3044URL\u304b\u304a\u78ba\u304b\u3081\u304f\u3060\u3055\u3044\u3002');

    const { novelTitle, prevUrl, nextUrl } = scraped;
    const tocUrl = (() => {
      const m = url.match(/(https?:\/\/[\w.]+\/[a-z0-9]+\/)/i);
      return m ? m[1] : '';
    })();
    currentTocUrl = tocUrl;

    msgEl.textContent = `\u7ffb\u8a33\u30a8\u30f3\u30b8\u30f3\u3092\u8d77\u52d5\u4e2d... (\u5168 ${rawParagraphs.length} \u6bb5\u843d)`;
    const translatedParagraphs = [];
    const BATCH_SIZE = 20;
    for (let i = 0; i < rawParagraphs.length; i += BATCH_SIZE) {
      const batch = rawParagraphs.slice(i, i + BATCH_SIZE);
      msgEl.textContent = `\u7ffb\u8a33\u4e2d... (${Math.min(i + BATCH_SIZE, rawParagraphs.length)} / ${rawParagraphs.length})`;
      try {
        const results = await window.handleTranslateBatch(batch, 'JA', 'EN');
        for (let j = 0; j < batch.length; j++) translatedParagraphs.push({ jp: batch[j], en: results[j] });
      } catch (err) { throw new Error('\u7ffb\u8a33\u30a8\u30e9\u30fc: ' + err.message); }
      if (i + BATCH_SIZE < rawParagraphs.length) await new Promise(r => setTimeout(r, 12000));
    }

    msgEl.textContent = '\u30ea\u30fc\u30c0\u30fc\u3092\u8d77\u52d5\u4e2d...';
    const frame = document.getElementById('reader-frame');
    frame.src = 'reader/reader.html';
    frame.onload = () => {
      frame.contentWindow.postMessage({
        type: 'INIT_DATA',
        paragraphs: translatedParagraphs,
        novelTitle, prevUrl, nextUrl, tocUrl,
        settings: {
          speed: document.getElementById('default-speed').value,
          ttsVoice: document.getElementById('tts-voice').value,
        }
      }, '*');
    };
    msgEl.style.display = 'none';

  } catch (err) {
    console.error(err);
    msgEl.style.color = '#c5221f';
    msgEl.textContent = err.message;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('reader-screen').style.display = 'none';
  }
}

// \u2500\u2500 \u96a0\u3057iframe\u3092\u4f7f\u3063\u3066\u30dd\u30fc\u30b8\u304b\u3089\u672c\u6587\u304a\u3088\u3073\u30e1\u30bf\u30c7\u30fc\u30bf\u3092\u53d6\u5f97 \u2500\u2500
function scrapeWithHiddenIframe(url, msgEl) {
  return new Promise((resolve, reject) => {
    // \u65e2\u5b58\u306e\u96a0\u3057iframe\u304c\u3042\u308c\u3070\u524a\u9664
    const old = document.getElementById('scrape-iframe');
    if (old) old.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'scrape-iframe';
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;visibility:hidden;';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';
    document.body.appendChild(iframe);

    const TIMEOUT_MS = 30000; // 30\u79d2\u30bf\u30a4\u30e0\u30a2\u30a6\u30c8
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        iframe.remove();
        reject(new Error('\u30da\u30fc\u30b8\u306e\u8aad\u307f\u8fbc\u307f\u304c\u30bf\u30a4\u30e0\u30a2\u30a6\u30c8\u3057\u307e\u3057\u305f\u3002'));
      }
    }, TIMEOUT_MS);

    // iframe\u304b\u3089\u306e\u30c7\u30fc\u30bf\u3092\u53d7\u4fe1
    const msgHandler = (e) => {
      if (e.data && e.data.type === 'SCRAPE_RESULT') {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('message', msgHandler);
        iframe.remove();
        resolve(e.data);
      }
    };
    window.addEventListener('message', msgHandler);

    iframe.onload = () => {
      if (done) return;
      if (msgEl) msgEl.textContent = '\u30da\u30fc\u30b8\u304c\u8aad\u307f\u8fbc\u307e\u308c\u307e\u3057\u305f\u3002\u672c\u6587\u3092\u62bd\u51fa\u4e2d...';

      // iframe\u306b\u672c\u6587\u62bd\u51fa\u30b9\u30af\u30ea\u30d7\u30c8\u3092\u6ce8\u5165
      try {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument;

        const extractScript = `
(function() {
  try {
    const knownSels = ['#novel_p','#novel_honbun','#novel_a','.js-novel-text','.p-novel__text','.p-novel__text--preface','.p-novel__text--afterword'];
    const sections = Array.from(document.querySelectorAll(knownSels.join(',')));
    let paras = [];
    if (sections.length > 0) {
      const pTags = Array.from(new Set(sections.flatMap(s => Array.from(s.querySelectorAll('p')))));
      if (pTags.length > 0) {
        paras = pTags.map(p => p.innerText.trim()).filter(t => t.length > 0);
      } else {
        paras = sections.map(s => s.innerText.trim()).join('\\n').split(/\\n+/).map(l => l.trim()).filter(t => t.length > 0);
      }
    }
    if (paras.length === 0) {
      const fb = document.querySelector('#novel_view');
      if (fb) {
        const pt = Array.from(fb.querySelectorAll('p'));
        paras = pt.length > 0 ? pt.map(p=>p.innerText.trim()).filter(t=>t.length>0) : fb.innerText.split(/\\n+/).map(l=>l.trim()).filter(t=>t.length>0);
      }
    }
    const titleEl = document.querySelector('.p-novel__title,.novel_title,.contents1 a,#novel_ex');
    const novelTitle = titleEl ? titleEl.textContent.trim() : '';
    let prevUrl = '', nextUrl = '';
    const pp = document.querySelector('.c-pager__item--prev a,.c-pager a[rel="prev"]');
    const np = document.querySelector('.c-pager__item--next a,.c-pager a[rel="next"]');
    if (pp) prevUrl = pp.href;
    if (np) nextUrl = np.href;
    if (!prevUrl && !nextUrl) {
      document.querySelectorAll('.novel_bn a').forEach(a => {
        if (a.textContent.includes('\u524d')||a.textContent.includes('prev')) prevUrl = a.href;
        if (a.textContent.includes('\u6b21')||a.textContent.includes('next')) nextUrl = a.href;
      });
    }
    window.parent.postMessage({ type: 'SCRAPE_RESULT', paragraphs: paras, novelTitle, prevUrl, nextUrl }, '*');
  } catch(e) {
    window.parent.postMessage({ type: 'SCRAPE_RESULT', paragraphs: [], novelTitle: '', prevUrl: '', nextUrl: '', error: e.message }, '*');
  }
})();
        `;

        // script\u8981\u7d20\u3068\u3057\u3066\u6ce8\u5165
        const s = doc.createElement('script');
        s.textContent = extractScript;
        doc.body.appendChild(s);
      } catch (err) {
        // \u540c\u4e00\u30aa\u30ea\u30b8\u30f3\u30dd\u30ea\u30b7\u30fc\u306b\u3088\u308b\u30d6\u30ed\u30c3\u30af
        done = true;
        clearTimeout(timer);
        window.removeEventListener('message', msgHandler);
        iframe.remove();
        reject(new Error('\u30b9\u30af\u30ea\u30d7\u30c8\u306e\u6ce8\u5165\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u30b5\u30a4\u30c8\u306e\u30bb\u30ad\u30e5\u30ea\u30c6\u30a3\u30dd\u30ea\u30b7\u30fc\u306b\u3088\u308a\u300c\u76f4\u63a5URL\u5165\u529b\u300d\u306e\u307f\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u3059\u3002'));
      }
    };

    iframe.src = url;
  });
}

  try {
    const isNovel18 = url.includes('novel18.syosetu.com') || url.includes('moonlight.syosetu.com');
    if (isNovel18) {
      try {
        const origin = new URL(url).origin;
        await CapacitorHttp.post({
          url: `${origin}/yes18/`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': url },
          data: 'yes=yes',
        });
      } catch (_) {}
    }

    const headers = isNovel18 ? { 'Cookie': 'over18=yes', 'Referer': url } : {};
    const res = await CapacitorHttp.get({ url, headers });
    const html = res.data;
    msgEl.textContent = '文章を解析中...';

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // ── 小説本文接リ: 複数ストラテジーで対応 ──
    let rawParagraphs = [];
    const knownSelectors = [
      '#novel_p', '#novel_honbun', '#novel_a',
      '.js-novel-text', '.p-novel__text',
      '.p-novel__text--preface', '.p-novel__text--afterword',
    ];
    const sections = Array.from(doc.querySelectorAll(knownSelectors.join(', ')));

    if (sections.length > 0) {
      const pTags = Array.from(new Set(sections.flatMap(s => Array.from(s.querySelectorAll('p')))));
      if (pTags.length > 0) {
        rawParagraphs = pTags.map(p => p.innerText.trim()).filter(t => t.length > 0);
      } else {
        const combined = sections.map(s => s.innerText.trim()).join('\n');
        rawParagraphs = combined.split(/\n+/).map(l => l.trim()).filter(t => t.length > 0);
      }
    }
    if (rawParagraphs.length === 0) {
      const fb = doc.querySelector('#novel_view');
      if (fb) {
        const pTags = Array.from(fb.querySelectorAll('p'));
        rawParagraphs = pTags.length > 0
          ? pTags.map(p => p.innerText.trim()).filter(t => t.length > 0)
          : fb.innerText.split(/\n+/).map(l => l.trim()).filter(t => t.length > 0);
      }
    }
    if (rawParagraphs.length === 0) {
      const allDivs = Array.from(doc.querySelectorAll('div, section, article'));
      let bestEl = null, bestLen = 0;
      for (const el of allDivs) {
        const txt = el.innerText || '';
        if (txt.length > bestLen && !el.querySelector('nav,header,footer,aside,script,style')) {
          bestLen = txt.length; bestEl = el;
        }
      }
      if (bestEl) rawParagraphs = bestEl.innerText.split(/\n+/).map(l => l.trim()).filter(t => t.length > 5);
    }
    if (rawParagraphs.length === 0) throw new Error('小説本文が見つかりませんでした。対応サイトか正しいURLかお確かめください。');

    // ── メタデータ取得 ──
    const titleEl = doc.querySelector('.p-novel__title') || doc.querySelector('.contents1 a') || doc.querySelector('#novel_ex');
    const novelTitle = titleEl ? titleEl.textContent.trim() : '';

    // 前後チャプター URL 取得
    let prevUrl = '', nextUrl = '';
    const newPrev = doc.querySelector('.c-pager__item--prev a, .c-pager a[rel="prev"]');
    const newNext = doc.querySelector('.c-pager__item--next a, .c-pager a[rel="next"]');
    if (newPrev) prevUrl = newPrev.href || '';
    if (newNext) nextUrl = newNext.href || '';
    if (!prevUrl && !nextUrl) {
      doc.querySelectorAll('.novel_bn a').forEach(a => {
        const t = a.textContent;
        if (t.includes('前') || t.includes('prev')) prevUrl = a.href;
        if (t.includes('次') || t.includes('next')) nextUrl = a.href;
      });
    }
    // 目次ページ URL
    const tocUrl = (() => {
      const m = url.match(/(https?:\/\/[\w.]+\/[a-z0-9]+\/)/i);
      return m ? m[1] : '';
    })();
    currentTocUrl = tocUrl; // TOC ボタンから参照できるよう保存

    msgEl.textContent = `翻訳エンジンを起動中... (全 ${rawParagraphs.length} 段落)`;
    const translatedParagraphs = [];
    const BATCH_SIZE = 20;
    for (let i = 0; i < rawParagraphs.length; i += BATCH_SIZE) {
      const batch = rawParagraphs.slice(i, i + BATCH_SIZE);
      msgEl.textContent = `翻訳中... (${Math.min(i + BATCH_SIZE, rawParagraphs.length)} / ${rawParagraphs.length})`;
      try {
        const results = await window.handleTranslateBatch(batch, 'JA', 'EN');
        for (let j = 0; j < batch.length; j++) translatedParagraphs.push({ jp: batch[j], en: results[j] });
      } catch (err) { throw new Error('翻訳エラー: ' + err.message); }
      if (i + BATCH_SIZE < rawParagraphs.length) await new Promise(r => setTimeout(r, 12000));
    }

    msgEl.textContent = 'リーダーを起動中...';
    const frame = document.getElementById('reader-frame');
    frame.src = 'reader/reader.html';
    frame.onload = () => {
      frame.contentWindow.postMessage({
        type: 'INIT_DATA',
        paragraphs: translatedParagraphs,
        novelTitle, prevUrl, nextUrl, tocUrl,
        settings: {
          speed: document.getElementById('default-speed').value,
          ttsVoice: document.getElementById('tts-voice').value,
        }
      }, '*');
    };
    msgEl.style.display = 'none';

  } catch (err) {
    console.error(err);
    msgEl.style.color = '#c5221f';
    msgEl.textContent = err.message;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('reader-screen').style.display = 'none';
  }
}

// ── reader.js からの WebExtension API モック通信 ──
function handleReaderMessages(e) {
  if (!e.data) return;

  // NAVIGATE: 前・次のチャプターへ移動
  if (e.data.type === 'NAVIGATE' && e.data.url) {
    loadNovel(e.data.url);
    return;
  }

  // TOC: 目次ページをアプリ内で表示
  if (e.data.type === 'TOC' && e.data.url) {
    showToc(e.data.url);
    return;
  }

  if (e.data.type === 'CHROME_MSG' && e.data.msg) {
    const msg = e.data.msg;
    const msgId = e.data.msgId;
    if (msg.type === 'LOOKUP_WORD') {
      window.handleLookupWord(msg.word).then(res => respondToReader(msgId, { ok:true, result: res }));
    } else if (msg.type === 'TRANSLATE_CHUNKS') {
      window.handleTranslateChunks(msg.en).then(res => respondToReader(msgId, { ok:true, result: res }));
    } else if (msg.type === 'TTS_GET_VOICES') {
      TextToSpeech.getSupportedVoices().then(res => respondToReader(msgId, { ok:true, result: res.voices }));
    } else if (msg.type === 'TTS_SPEAK') {
      TextToSpeech.speak({ text: msg.text, lang: msg.lang, rate: msg.rate, pitch: 1.0 })
        .then(() => respondToReader(msgId, { ok:true, type: 'TTS_END' }))
        .catch(err => respondToReader(msgId, { ok:false, error: err.message, type: 'TTS_ERROR' }));
    } else if (msg.type === 'TTS_STOP') {
      TextToSpeech.stop();
    }
  }
}

function respondToReader(msgId, data) {
  const frame = document.getElementById('reader-frame');
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage({ type: 'CHROME_CB', msgId, res: data }, '*');
  }
}

// \u2500\u2500 \u76ee\u6b21\u30da\u30fc\u30b8\u3092\u30a2\u30d7\u30ea\u5185\u3067\u8868\u793a \u2500\u2500
async function showToc(url) {
  try {
    const res = await CapacitorHttp.get({ url, headers: {} });
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.data, 'text/html');

    // \u76ee\u6b21\u30ea\u30f3\u30af\u3092\u6536\u96c6 (\u5168\u30ec\u30a4\u30a2\u30a6\u30c8\u5bfe\u5fdc)
    const links = Array.from(doc.querySelectorAll(
      '.p-chapter__item a, .novel_sublist2 .subtitle a, .chapter-content a[href*="/"], dl.novel_sublist2 a'
    ));

    if (links.length === 0) {
      alert('\u76ee\u6b21\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002');
      return;
    }

    // \u30aa\u30fc\u30d0\u30fc\u30ec\u30a4\u3092\u4f5c\u6210
    const overlay = document.createElement('div');
    overlay.id = 'toc-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#fff;overflow-y:auto;padding:16px;font-family:-apple-system,sans-serif;';

    const title = doc.querySelector('.p-novel__title, .novel_title') || { textContent: '\u76ee\u6b21' };
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;border-bottom:1px solid #eee;padding-bottom:12px;">
        <button id="toc-close" style="background:#185FA5;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:14px;">\u2190 \u95c9\u3058\u308b</button>
        <h2 style="font-size:16px;margin:0;color:#333;">${title.textContent.trim()}</h2>
      </div>
      <div id="toc-list"></div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('toc-close').addEventListener('click', () => overlay.remove());

    const list = overlay.querySelector('#toc-list');
    links.forEach(a => {
      // \u5b8c\u5168URL\u306b\u4fee\u6b63
      const href = a.href.startsWith('http') ? a.href : new URL(a.getAttribute('href'), url).href;
      const btn = document.createElement('button');
      btn.textContent = a.textContent.trim();
      btn.style.cssText = 'display:block;width:100%;text-align:left;padding:12px 8px;border:none;border-bottom:1px solid #f0f0f0;background:transparent;font-size:14px;color:#185FA5;cursor:pointer;';
      btn.addEventListener('click', () => {
        overlay.remove();
        loadNovel(href);
      });
      list.appendChild(btn);
    });
  } catch (err) {
    alert('\u76ee\u6b21\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + err.message);
  }
}

// \u2500\u2500 \u306a\u308d\u3046\u5185\u306e\u4f5c\u54c1\u691c\u7d22 (Narou API) \u2500\u2500
async function searchNarou(keyword) {
  const apiUrl = `https://api.syosetu.com/novelapi/api/?out=json&lim=20&order=hyoka&title=1&keyword=1&word=${encodeURIComponent(keyword)}`;
  try {
    const res = await CapacitorHttp.get({ url: apiUrl, headers: {} });
    let data;
    try { data = JSON.parse(res.data); } catch { data = null; }
    if (!data || data.length < 2) {
      alert('\u691c\u7d22\u7d50\u679c\u304c\u3042\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002');
      return;
    }

    const results = data.slice(1); // \u6700\u521d\u306f\u30ab\u30a6\u30f3\u30c8\u60c5\u5831
    const overlay = document.createElement('div');
    overlay.id = 'search-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#fff;overflow-y:auto;padding:16px;font-family:-apple-system,sans-serif;';
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;border-bottom:1px solid #eee;padding-bottom:12px;">
        <button id="search-close" style="background:#185FA5;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:14px;">\u2190 \u623b\u308b</button>
        <span style="font-size:14px;color:#666;">\u300c${keyword}\u300d\u306e\u691c\u7d22\u7d50\u679c (${results.length}\u4ef6)</span>
      </div>
      <div id="search-list"></div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('search-close').addEventListener('click', () => overlay.remove());

    const list = overlay.querySelector('#search-list');
    results.forEach(novel => {
      const ncode = novel.ncode.toLowerCase();
      const url = `https://ncode.syosetu.com/${ncode}/1/`;
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:12px;cursor:pointer;';
      card.innerHTML = `
        <div style="font-size:15px;font-weight:bold;color:#185FA5;margin-bottom:4px;">${novel.title}</div>
        <div style="font-size:12px;color:#888;margin-bottom:6px;">${novel.writer} &nbsp;|\u2606${novel.global_point}</div>
        <div style="font-size:13px;color:#555;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${(novel.story||'').replace(/<[^>]+>/g,'')}</div>
      `;
      card.addEventListener('click', () => {
        overlay.remove();
        loadNovel(url);
      });
      list.appendChild(card);
    });
  } catch (err) {
    alert('\u691c\u7d22\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + err.message);
  }
}

// ============================================
// \u5143\u3005\u3042\u3063\u305f popup.js \u306e UI \u7528\u30ed\u30b8\u30c3\u30af
// ============================================

function populateVoices(savedVoiceUri = null) {
  const sel = document.getElementById('tts-voice');
  if (!sel) return;

  TextToSpeech.getSupportedVoices().then(res => {
    const rawVoices = res.voices;
    const voices = rawVoices.filter(v => {
      if (!v.lang) return true; 
      const l = v.lang.toLowerCase();
      // On some platforms, locales return like "en-US", "eng", "en_GB"
      return l.startsWith('en') || l.includes('en-') || l.includes('en_') || l.includes('eng');
    });

    if (voices.length === 0) return;

    voices.sort((a, b) => {
      const aGood = a.name && (a.name.includes('Natural') || a.name.includes('Google') || a.name.includes('Online'));
      const bGood = b.name && (b.name.includes('Natural') || b.name.includes('Google') || b.name.includes('Online'));
      if (aGood && !bGood) return -1;
      if (!aGood && bGood) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    const currentVal = savedVoiceUri || sel.value;
    sel.innerHTML = '<option value="default">システム標準の音声</option>';
    
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI || v.lang;
      const isGood = v.name && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Online'));
      opt.textContent = (isGood ? '★ ' : '') + `${v.name || 'Voice'} (${v.lang})`;
      sel.appendChild(opt);
    });

    if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
      sel.value = currentVal;
    }
  }).catch(() => {});
}

function onEngineChange() {
  const engine = document.getElementById('engine').value;
  document.querySelectorAll('.engine-section').forEach(el => {
    el.style.display = 'none';
  });
  const sec = document.getElementById('sec-' + engine);
  if (sec) sec.style.display = 'block';
}

function save() {
  chrome.storage.local.set({
    translationEngine: document.getElementById('engine').value,
    deeplApiKey:       document.getElementById('deepl-key').value.trim(),
    geminiApiKey:      document.getElementById('gemini-key').value.trim(),
    openaiApiKey:      document.getElementById('openai-key').value.trim(),
    claudeApiKey:      document.getElementById('claude-key').value.trim(),
    defaultSpeed:      document.getElementById('default-speed').value,
    ttsVoice:          document.getElementById('tts-voice').value,
  }, () => {
    const msg = document.getElementById('saved-msg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 1800);
  });
}

function testApi() {
  const engine = document.getElementById('engine').value;
  let apiKey = '';
  if (engine === 'deepl') apiKey = document.getElementById('deepl-key').value.trim();
  if (engine === 'gemini') apiKey = document.getElementById('gemini-key').value.trim();
  if (engine === 'chatgpt') apiKey = document.getElementById('openai-key').value.trim();
  if (engine === 'claude') apiKey = document.getElementById('claude-key').value.trim();

  const msgDiv = document.getElementById('test-msg');
  msgDiv.style.display = 'block';
  msgDiv.style.background = '#f0f0ea';
  msgDiv.style.color = '#555';
  msgDiv.style.border = 'none';
  msgDiv.textContent = 'テスト送信中...';

  if (!apiKey) {
    msgDiv.style.background = '#fce8e6';
    msgDiv.style.color = '#c5221f';
    msgDiv.textContent = 'エラー: APIキーが空文字です';
    return;
  }

  window.handleTestApi(engine, apiKey).then(res => {
    msgDiv.style.background = '#e6f4ea';
    msgDiv.style.color = '#137333';
    msgDiv.textContent = `✓ 成功! 翻訳結果: "${res}"`;
  }).catch(err => {
    msgDiv.style.background = '#fce8e6';
    msgDiv.style.color = '#c5221f';
    msgDiv.textContent = 'エラー: ' + err.message;
  });
}
