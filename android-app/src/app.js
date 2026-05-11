import { CapacitorHttp } from "@capacitor/core";
import { TextToSpeech } from "@capacitor-community/text-to-speech";

const STORAGE_KEYS = [
  "translationEngine",
  "deeplApiKey",
  "geminiApiKey",
  "openaiApiKey",
  "claudeApiKey",
  "defaultSpeed",
  "ttsVoice",
];

// 現在開いている小説の目次URLを保持
let currentTocUrl = "";

function showToast(message, isError = false) {
  let t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    t.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:999999;padding:8px 12px;border-radius:8px;font-size:12px;color:#fff;background:#185FA5;';
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.style.background = isError ? '#c5221f' : '#185FA5';
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 2400);
}

document.addEventListener('DOMContentLoaded', () => {
  // エンジン切り替え
  document.getElementById('engine').addEventListener('change', onEngineChange);
  document.getElementById('test-btn').addEventListener('click', testApi);
  document.getElementById('save-btn').addEventListener('click', save);
  document.getElementById('export-settings-btn')?.addEventListener('click', exportSettings);
  document.getElementById('import-settings-btn')?.addEventListener('click', () => document.getElementById('import-settings-file')?.click());
  document.getElementById('import-settings-file')?.addEventListener('change', importSettings);
document.addEventListener("DOMContentLoaded", () => {
  // エンジン切り替え
  document.getElementById("engine").addEventListener("change", onEngineChange);
  document.getElementById("test-btn").addEventListener("click", testApi);
  document.getElementById("save-btn").addEventListener("click", save);

  // 読み込みボタン
  document.getElementById("read-btn").addEventListener("click", onReadClicked);

  // 検索ボタン
  document.getElementById("search-btn").addEventListener("click", () => {
    const kw = document.getElementById("search-input").value.trim();
    if (kw) searchNarou(kw);
  });
  document.getElementById("search-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const kw = document.getElementById("search-input").value.trim();
      if (kw) searchNarou(kw);
    }
  });

  // 戻るボタン
  document.getElementById("back-home-btn").addEventListener("click", () => {
    document.getElementById("reader-screen").style.display = "none";
    document.getElementById("home-screen").style.display = "block";
  });

  // 目次ボタン
  document.getElementById("toc-btn").addEventListener("click", () => {
    if (currentTocUrl) showToc(currentTocUrl);
    else showToast('目次情報がありません。ホームからURLを入力してください。', true);
    else
      alert(
        "目次情報がありません。お手数ですがホームからURLを直接入力してください。",
      );
  });

  // iframe内のリーダーからのメッセージ受信
  window.addEventListener("message", handleReaderMessages);

  // 設定読み込み
  chrome.storage.local.get(STORAGE_KEYS, (data) => {
    if (data.translationEngine)
      document.getElementById("engine").value = data.translationEngine;
    if (data.deeplApiKey)
      document.getElementById("deepl-key").value = data.deeplApiKey;
    if (data.geminiApiKey)
      document.getElementById("gemini-key").value = data.geminiApiKey;
    if (data.openaiApiKey)
      document.getElementById("openai-key").value = data.openaiApiKey;
    if (data.claudeApiKey)
      document.getElementById("claude-key").value = data.claudeApiKey;
    if (data.defaultSpeed)
      document.getElementById("default-speed").value = data.defaultSpeed;
    populateVoices(data.ttsVoice);
    onEngineChange();
  });

  populateVoices();

  setTimeout(() => {
    openBrowser("https://yomou.syosetu.com/");
  }, 100);
});

// ── In-App Web Browser ──
let currentIab = null;

function openBrowser(url, autoTranslate = false) {
  if (url === 'https://yomou.syosetu.com/') {
    // This is the default start URL. We might not want to show it immediately if the app just started.
  }
  document.getElementById("home-screen").style.display = "none";
  document.getElementById("reader-screen").style.display = "none";
  
  if (!window.cordova || !window.cordova.InAppBrowser) {
    alert("InAppBrowserプラグインが見つかりません。");
    return;
  }
  
  const options = autoTranslate 
    ? 'location=no,hidden=yes' 
    : 'location=yes,toolbarcolor=#185FA5,navigationbuttoncolor=#ffffff,closebuttoncaption=閉じる,closebuttoncolor=#ffffff';
    
  currentIab = cordova.InAppBrowser.open(url, '_blank', options);

  currentIab.addEventListener('loadstop', (e) => {
    const isNovelPage = e.url.match(/(ncode|novel18|moonlight)\.syosetu\.com/i) && e.url.match(/\/n[0-9a-z]+(\/\d+)?\/?$/i);
    if (isNovelPage) {
      if (autoTranslate) {
        extractAndTranslate();
        return;
      }
      const injection = `
        (function() {
          if (document.getElementById('narou-en-fab')) return;
          let fab = document.createElement('div');
          fab.id = 'narou-en-fab';
          fab.style.cssText = 'position:fixed; bottom:20px; right:20px; background:#1D9E75; color:white; padding:12px 20px; border-radius:24px; font-family:sans-serif; font-size:14px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.3); cursor:pointer; z-index:999999;';
          fab.innerText = '📖 翻訳して読む';
          fab.onclick = function() {
            var msgString = JSON.stringify({ type: 'BROWSER_TRANSLATE', url: window.location.href });
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cordova_iab) {
              window.webkit.messageHandlers.cordova_iab.postMessage(msgString);
            } else if (window.cordova_iab) {
              window.cordova_iab.postMessage(msgString);
            }
          };
          document.body.appendChild(fab);
        })();
      `;
      currentIab.executeScript({ code: injection });
    }
  });

  currentIab.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'BROWSER_TRANSLATE') {
      extractAndTranslate();
    }
  });

  currentIab.addEventListener('exit', () => {
    currentIab = null;
    if (document.getElementById("reader-screen").style.display !== "flex") {
      document.getElementById("home-screen").style.display = "block";
    }
  });
}

// \u2500\u2500 \u96a0\u3057iframe\u3092\u4f7f\u3063\u3066\u30dd\u30fc\u30b8\u304b\u3089\u672c\u6587\u304a\u3088\u3073\u30e1\u30bf\u30c7\u30fc\u30bf\u3092\u53d6\u5f97 \u2500\u2500
function scrapeWithHiddenIframe(url, msgEl) {
  return new Promise((resolve, reject) => {
    const isNovel18 = /https?:\/\/(novel18|moonlight)\.syosetu\.com\//i.test(url);
    const novelOrigin = new URL(url).origin;
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

    let ageVerified = !isNovel18;

    iframe.onload = () => {
      if (done) return;

      if (!ageVerified) {
        ageVerified = true;
        if (msgEl) msgEl.textContent = '年齢認証ページを通過中...';
        try {
          const doc = iframe.contentDocument;
          const s = doc.createElement('script');
          s.textContent = `
            (function() {
              try {
                var form = document.querySelector('form[action*="yes18"], form');
                if (!form) {
                  location.href = ${JSON.stringify(url)};
                  return;
                }
                var yes = form.querySelector('input[name="yes"]');
                if (yes) yes.value = 'yes';
                form.submit();
              } catch (_) {
                location.href = ${JSON.stringify(url)};
              }
            })();
          `;
          doc.body.appendChild(s);
        } catch (_) {
          iframe.src = url;
        }
        setTimeout(() => {
          if (!done && iframe.src !== url) iframe.src = url;
        }, 1000);
        return;
      }

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
function extractAndTranslate() {
  if (!currentIab) return;
  const extractScript = `
    (function() {
      let rawParagraphs = [];
      const knownSelectors = [
        '#novel_p', '#novel_honbun', '#novel_a',
        '.js-novel-text', '.p-novel__text',
        '.p-novel__text--preface', '.p-novel__text--afterword',
      ];
      let sections = Array.from(document.querySelectorAll(knownSelectors.join(', ')));
      if (sections.length > 0) {
        const pTags = Array.from(new Set(sections.flatMap(s => Array.from(s.querySelectorAll('p')))));
        if (pTags.length > 0) {
          rawParagraphs = pTags.map(p => p.innerText.trim()).filter(t => t.length > 0);
        } else {
          const combined = sections.map(s => s.innerText.trim()).join('\\n');
          rawParagraphs = combined.split(/\\n+/).map(l => l.trim()).filter(t => t.length > 0);
        }
      }
      if (rawParagraphs.length === 0) {
        const fb = document.querySelector('#novel_view');
        if (fb) {
          const pTags = Array.from(fb.querySelectorAll('p'));
          rawParagraphs = pTags.length > 0
            ? pTags.map(p => p.innerText.trim()).filter(t => t.length > 0)
            : fb.innerText.split(/\\n+/).map(l => l.trim()).filter(t => t.length > 0);
        }
      }
      if (rawParagraphs.length === 0) {
        const allDivs = Array.from(document.querySelectorAll('div, section, article'));
        let bestEl = null, bestLen = 0;
        for (const el of allDivs) {
          const txt = el.innerText || '';
          if (txt.length > bestLen && !el.querySelector('nav,header,footer,aside,script,style')) {
            bestLen = txt.length; bestEl = el;
          }
        }
        if (bestEl) {
          rawParagraphs = bestEl.innerText.split(/\\n+/).map(l => l.trim()).filter(t => t.length > 5);
        }
      }

      const titleEl = document.querySelector('.p-novel__title') || document.querySelector('.contents1 a') || document.querySelector('#novel_ex');
      const novelTitle = titleEl ? titleEl.textContent.trim() : '';

      let prevUrl = '', nextUrl = '';
      const newPrev = document.querySelector('.c-pager__item--prev a, .c-pager a[rel="prev"]');
      const newNext = document.querySelector('.c-pager__item--next a, .c-pager a[rel="next"]');
      if (newPrev) prevUrl = newPrev.href || '';
      if (newNext) nextUrl = newNext.href || '';
      if (!prevUrl && !nextUrl) {
        document.querySelectorAll('.novel_bn a').forEach(a => {
          const t = a.textContent;
          if (t.includes('前') || t.includes('prev')) prevUrl = a.href;
          if (t.includes('次') || t.includes('next')) nextUrl = a.href;
        });
      }
      return {
        paragraphs: rawParagraphs,
        title: novelTitle,
        prevUrl: prevUrl,
        nextUrl: nextUrl,
        tocUrl: (function() { const m = window.location.href.match(/(https?:\\/\\/[\\w.]+\\/[a-z0-9]+\\/)/i); return m ? m[1] : ''; })()
      };
    })();
  `;

    iframe.src = isNovel18 ? `${novelOrigin}/yes18/` : url;
  });
}

  currentIab.executeScript({ code: extractScript }, (results) => {
    const data = results && results.length > 0 ? results[0] : null;
    if (!data || !data.paragraphs || data.paragraphs.length === 0) {
      alert('小説本文が見つかりませんでした。');
      return;
    }
    if (currentIab) currentIab.close();
    startTranslatingAndReading(data);
  });
}



async function onReadClicked() {
  const urlEl = document.getElementById("narou-url");
  const url = urlEl.value.trim();
  if (!url) return;
  openBrowser(url);
}

async function startTranslatingAndReading(data) {
  document.getElementById("home-screen").style.display = "none";
  document.getElementById("reader-screen").style.display = "flex";

  try {
    const rawParagraphs = data.paragraphs;
    const novelTitle = data.title || '';
    const prevUrl = data.prevUrl || '';
    const nextUrl = data.nextUrl || '';
    currentTocUrl = data.tocUrl || '';

    const loading = document.getElementById('reader-loading');
    loading.style.display = 'block';
    loading.textContent = `翻訳エンジンを起動中... (全 ${rawParagraphs.length} 段落)`;

    const frame = document.getElementById("reader-frame");
    frame.style.display = 'none';

    const translatedParagraphs = [];
    const BATCH_SIZE = 20;
    for (let i = 0; i < rawParagraphs.length; i += BATCH_SIZE) {
      const batch = rawParagraphs.slice(i, i + BATCH_SIZE);
      loading.textContent = `翻訳中... (${Math.min(i + BATCH_SIZE, rawParagraphs.length)} / ${rawParagraphs.length})`;
      try {
        const results = await window.handleTranslateBatch(batch, "JA", "EN");
        for (let j = 0; j < batch.length; j++)
          translatedParagraphs.push({ jp: batch[j], en: results[j] });
      } catch (err) {
        loading.textContent = "翻訳エラー: " + err.message;
        loading.style.color = "red";
        loading.style.borderColor = "red";
        return;
      }
      if (i + BATCH_SIZE < rawParagraphs.length)
        await new Promise((r) => setTimeout(r, 12000));
    }

    loading.style.display = "none";

    frame.src = window.location.origin + "/reader/reader.html";
    frame.style.display = 'block';

    frame.onload = () => {
      frame.contentWindow.postMessage(
        {
          type: "INIT_DATA",
          paragraphs: translatedParagraphs,
          novelTitle,
          prevUrl,
          nextUrl,
          tocUrl: currentTocUrl,
          settings: {
            speed: document.getElementById("default-speed").value,
            ttsVoice: document.getElementById("tts-voice").value,
          },
        },
        "*",
      );
    };
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

// ── reader.js からの WebExtension API モック通信 ──
function handleReaderMessages(e) {
  if (!e.data) return;

  // The InAppBrowser handles BROWSER_NAV, BROWSER_NAV_POST natively now!
  // The BROWSER_TRANSLATE is handled natively inside openBrowser listener!

  // NAVIGATE: 前・次のチャプターへ移動
  if (e.data.type === "NAVIGATE" && e.data.url) {
    openBrowser(e.data.url, true); // Auto-translate next chapter!
    return;
  }

  // TOC: 目次ページをアプリ内で表示
  if (e.data.type === "TOC" && e.data.url) {
    showToc(e.data.url);
    return;
  }

  if (e.data.type === "CHROME_MSG" && e.data.msg) {
    const msg = e.data.msg;
    const msgId = e.data.msgId;
    if (msg.type === "LOOKUP_WORD") {
      window
        .handleLookupWord(msg.word)
        .then((res) => respondToReader(msgId, { ok: true, result: res }));
    } else if (msg.type === "TRANSLATE_CHUNKS") {
      window
        .handleTranslateChunks(msg.en)
        .then((res) => respondToReader(msgId, { ok: true, result: res }));
    } else if (msg.type === "TTS_GET_VOICES") {
      TextToSpeech.getSupportedVoices().then((res) =>
        respondToReader(msgId, { ok: true, result: res.voices }),
      );
    } else if (msg.type === "TTS_SPEAK") {
      TextToSpeech.speak({
        text: msg.text,
        lang: msg.lang,
        rate: msg.rate,
        pitch: 1.0,
      })
        .then(() => respondToReader(msgId, { ok: true, type: "TTS_END" }))
        .catch((err) =>
          respondToReader(msgId, {
            ok: false,
            error: err.message,
            type: "TTS_ERROR",
          }),
        );
    } else if (msg.type === "TTS_STOP") {
      TextToSpeech.stop();
    }
  }
}

function respondToReader(msgId, data) {
  const frame = document.getElementById("reader-frame");
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage(
      { type: "CHROME_CB", msgId, res: data },
      "*",
    );
  }
}

// \u2500\u2500 \u76ee\u6b21\u30da\u30fc\u30b8\u3092\u30a2\u30d7\u30ea\u5185\u3067\u8868\u793a \u2500\u2500
async function showToc(url) {
  try {
    const headers = {
      Cookie: "over18=yes",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "User-Agent": navigator.userAgent,
    };
    const res = await CapacitorHttp.get({ url, headers });
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.data, "text/html");

    // \u76ee\u6b21\u30ea\u30f3\u30af\u3092\u6536\u96c6 (\u5168\u30ec\u30a4\u30a2\u30a6\u30c8\u5bfe\u5fdc)
    const links = Array.from(
      doc.querySelectorAll(
        '.p-chapter__item a, .novel_sublist2 .subtitle a, .chapter-content a[href*="/"], dl.novel_sublist2 a',
      ),
    );

    if (links.length === 0) {
      showToast('\u76ee\u6b21\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002', true);
      alert(
        "\u76ee\u6b21\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002",
      );
      return;
    }

    // \u30aa\u30fc\u30d0\u30fc\u30ec\u30a4\u3092\u4f5c\u6210
    const overlay = document.createElement("div");
    overlay.id = "toc-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#fff;overflow-y:auto;padding:16px;font-family:-apple-system,sans-serif;";

    const title = doc.querySelector(".p-novel__title, .novel_title") || {
      textContent: "\u76ee\u6b21",
    };
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;border-bottom:1px solid #eee;padding-bottom:12px;">
        <button id="toc-close" style="background:#185FA5;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:14px;">\u2190 \u95c9\u3058\u308b</button>
        <h2 style="font-size:16px;margin:0;color:#333;">${title.textContent.trim()}</h2>
      </div>
      <div id="toc-list"></div>
    `;

    document.body.appendChild(overlay);
    document
      .getElementById("toc-close")
      .addEventListener("click", () => overlay.remove());

    const list = overlay.querySelector("#toc-list");
    links.forEach((a) => {
      // \u5b8c\u5168URL\u306b\u4fee\u6b63
      const href = a.href.startsWith("http")
        ? a.href
        : new URL(a.getAttribute("href"), url).href;
      const btn = document.createElement("button");
      btn.textContent = a.textContent.trim();
      btn.style.cssText =
        "display:block;width:100%;text-align:left;padding:12px 8px;border:none;border-bottom:1px solid #f0f0f0;background:transparent;font-size:14px;color:#185FA5;cursor:pointer;";
      btn.addEventListener("click", () => {
        overlay.remove();
        openBrowser(href);
      });
      list.appendChild(btn);
    });
  } catch (err) {
    showToast('\u76ee\u6b21\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + err.message, true);
    alert(
      "\u76ee\u6b21\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f: " +
        err.message,
    );
  }
}

// \u2500\u2500 \u306a\u308d\u3046\u5185\u306e\u4f5c\u54c1\u691c\u7d22 (Narou API) \u2500\u2500
async function searchNarou(keyword) {
  const apiUrl = `https://api.syosetu.com/novelapi/api/?out=json&lim=20&order=hyoka&title=1&keyword=1&word=${encodeURIComponent(keyword)}`;
  try {
    const headers = {
      Accept: "application/json, text/plain, */*",
      "User-Agent": navigator.userAgent,
    };
    const res = await CapacitorHttp.get({ url: apiUrl, headers });
    let data;
    try {
      data = JSON.parse(res.data);
    } catch {
      data = null;
    }
    if (!data || data.length < 2) {
      showToast('\u691c\u7d22\u7d50\u679c\u304c\u3042\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002', true);
      return;
    }

    const stateFilter = document.getElementById('filter-state')?.value || 'all';
    const minLen = Number(document.getElementById('filter-minlen')?.value || 0);
    const results = data.slice(1).filter(novel => {
      const okState = stateFilter === 'all' || (stateFilter === 'serial' ? novel.end === 0 : novel.end === 1);
      const okLen = Number(novel.length || 0) >= minLen;
      return okState && okLen;
    });
    if (results.length === 0) {
      showToast('条件に一致する検索結果がありません。', true);
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'search-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#fff;overflow-y:auto;padding:16px;font-family:-apple-system,sans-serif;';
      alert(
        "\u691c\u7d22\u7d50\u679c\u304c\u3042\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002",
      );
      return;
    }

    const results = data.slice(1); // \u6700\u521d\u306f\u30ab\u30a6\u30f3\u30c8\u60c5\u5831
    const overlay = document.createElement("div");
    overlay.id = "search-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#fff;overflow-y:auto;padding:16px;font-family:-apple-system,sans-serif;";
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;border-bottom:1px solid #eee;padding-bottom:12px;">
        <button id="search-close" style="background:#185FA5;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:14px;">\u2190 \u623b\u308b</button>
        <span style="font-size:14px;color:#666;">\u300c${keyword}\u300d\u306e\u691c\u7d22\u7d50\u679c (${results.length}\u4ef6)</span>
      </div>
      <div id="search-list"></div>
    `;
    document.body.appendChild(overlay);
    document
      .getElementById("search-close")
      .addEventListener("click", () => overlay.remove());

    const list = overlay.querySelector("#search-list");
    results.forEach((novel) => {
      const ncode = novel.ncode.toLowerCase();
      const url = `https://ncode.syosetu.com/${ncode}/1/`;
      const card = document.createElement("div");
      card.style.cssText =
        "border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:12px;cursor:pointer;";
      card.innerHTML = `
        <div style="font-size:15px;font-weight:bold;color:#185FA5;margin-bottom:4px;">${novel.title}</div>
        <div style="font-size:12px;color:#888;margin-bottom:6px;">${novel.writer} &nbsp;|\u2606${novel.global_point}</div>
        <div style="font-size:13px;color:#555;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${(novel.story || "").replace(/<[^>]+>/g, "")}</div>
      `;
      card.addEventListener("click", () => {
        overlay.remove();
        openBrowser(url);
      });
      list.appendChild(card);
    });
  } catch (err) {
    showToast('\u691c\u7d22\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + err.message, true);
    alert(
      "\u691c\u7d22\u306b\u5931\u6557\u3057\u307e\u3057\u305f: " + err.message,
    );
  }
}

// ============================================
// \u5143\u3005\u3042\u3063\u305f popup.js \u306e UI \u7528\u30ed\u30b8\u30c3\u30af
// ============================================

function populateVoices(savedVoiceUri = null) {
  const sel = document.getElementById("tts-voice");
  if (!sel) return;

  TextToSpeech.getSupportedVoices()
    .then((res) => {
      const rawVoices = res.voices;
      const voices = rawVoices.filter((v) => {
        if (!v.lang) return true;
        const l = v.lang.toLowerCase();
        // On some platforms, locales return like "en-US", "eng", "en_GB"
        return (
          l.startsWith("en") ||
          l.includes("en-") ||
          l.includes("en_") ||
          l.includes("eng")
        );
      });

      if (voices.length === 0) return;

      voices.sort((a, b) => {
        const aGood =
          a.name &&
          (a.name.includes("Natural") ||
            a.name.includes("Google") ||
            a.name.includes("Online"));
        const bGood =
          b.name &&
          (b.name.includes("Natural") ||
            b.name.includes("Google") ||
            b.name.includes("Online"));
        if (aGood && !bGood) return -1;
        if (!aGood && bGood) return 1;
        return (a.name || "").localeCompare(b.name || "");
      });

      const currentVal = savedVoiceUri || sel.value;
      sel.innerHTML = '<option value="default">システム標準の音声</option>';

      voices.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.voiceURI || v.lang;
        const isGood =
          v.name &&
          (v.name.includes("Natural") ||
            v.name.includes("Google") ||
            v.name.includes("Online"));
        opt.textContent =
          (isGood ? "★ " : "") + `${v.name || "Voice"} (${v.lang})`;
        sel.appendChild(opt);
      });

      if (
        currentVal &&
        Array.from(sel.options).some((o) => o.value === currentVal)
      ) {
        sel.value = currentVal;
      }
    })
    .catch(() => {});
}

function onEngineChange() {
  const engine = document.getElementById("engine").value;
  document.querySelectorAll(".engine-section").forEach((el) => {
    el.style.display = "none";
  });
  const sec = document.getElementById("sec-" + engine);
  if (sec) sec.style.display = "block";
}

function save() {
  chrome.storage.local.set(
    {
      translationEngine: document.getElementById("engine").value,
      deeplApiKey: document.getElementById("deepl-key").value.trim(),
      geminiApiKey: document.getElementById("gemini-key").value.trim(),
      openaiApiKey: document.getElementById("openai-key").value.trim(),
      claudeApiKey: document.getElementById("claude-key").value.trim(),
      defaultSpeed: document.getElementById("default-speed").value,
      ttsVoice: document.getElementById("tts-voice").value,
    },
    () => {
      const msg = document.getElementById("saved-msg");
      msg.style.display = "block";
      setTimeout(() => {
        msg.style.display = "none";
      }, 1800);
    },
  );
}

function testApi() {
  const engine = document.getElementById("engine").value;
  let apiKey = "";
  if (engine === "deepl")
    apiKey = document.getElementById("deepl-key").value.trim();
  if (engine === "gemini")
    apiKey = document.getElementById("gemini-key").value.trim();
  if (engine === "chatgpt")
    apiKey = document.getElementById("openai-key").value.trim();
  if (engine === "claude")
    apiKey = document.getElementById("claude-key").value.trim();

  const msgDiv = document.getElementById("test-msg");
  msgDiv.style.display = "block";
  msgDiv.style.background = "#f0f0ea";
  msgDiv.style.color = "#555";
  msgDiv.style.border = "none";
  msgDiv.textContent = "テスト送信中...";

  if (!apiKey) {
    msgDiv.style.background = "#fce8e6";
    msgDiv.style.color = "#c5221f";
    msgDiv.textContent = "エラー: APIキーが空文字です";
    return;
  }

  window
    .handleTestApi(engine, apiKey)
    .then((res) => {
      msgDiv.style.background = "#e6f4ea";
      msgDiv.style.color = "#137333";
      msgDiv.textContent = `✓ 成功! 翻訳結果: "${res}"`;
    })
    .catch((err) => {
      msgDiv.style.background = "#fce8e6";
      msgDiv.style.color = "#c5221f";
      msgDiv.textContent = "エラー: " + err.message;
    });
}


function exportSettings() {
  chrome.storage.local.get(STORAGE_KEYS, data => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `narou-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function importSettings(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || '{}'));
      chrome.storage.local.set(data, () => {
        const msg = document.getElementById('saved-msg');
        msg.textContent = '設定をインポートしました ✓';
        msg.style.display = 'block';
        setTimeout(() => { msg.style.display = 'none'; msg.textContent = '保存しました ✓'; }, 1800);
      });
    } catch (_) {}
  };
  reader.readAsText(file);
}
