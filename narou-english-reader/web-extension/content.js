/**
 * content.js — Content Script
 *
 * syosetu.com のページを検知し、小説本文を抽出して
 * background.js 経由で翻訳し、リーダー UI を注入する。
 *
 * スタイルは content.css で定義済み（manifest.json で自動注入）。
 */

(async () => {
  // ── 1. 小説本文の取得 ──────────────────────────────────────
  const novelBody = document.querySelector('#novel_honbun');
  if (!novelBody) return;

  const rawParagraphs = [...novelBody.querySelectorAll('p')]
    .map(p => p.innerText.trim())
    .filter(t => t.length > 0);

  if (rawParagraphs.length === 0) return;

  // ── 2. ローディング UI を先に挿入 ─────────────────────────
  const wrapper = document.createElement('div');
  wrapper.id = 'narouEN-reader';

  const loading = document.createElement('div');
  loading.id = 'narouEN-loading';
  loading.innerHTML =
    '<span class="narouEN-spinner"></span>' +
    '<span>翻訳中… (0 / ' + rawParagraphs.length + ')</span>';

  const errorBanner = document.createElement('div');
  errorBanner.id = 'narouEN-error';
  errorBanner.innerHTML =
    '<strong>翻訳エラー</strong>: <span id="narouEN-error-msg"></span> — ' +
    '<a href="#" onclick="document.getElementById(\'narouEN-reader\').remove();return false;">閉じる</a>' +
    ' / <a href="#" onclick="chrome.runtime.openOptionsPage();return false;">APIキーを確認</a>';

  wrapper.appendChild(loading);
  wrapper.appendChild(errorBanner);
  novelBody.insertAdjacentElement('afterend', wrapper);

  // ── 3. 翻訳リクエスト (background.js へ) ───────────────────
  const translatedParagraphs = [];
  let hasError = false;

  for (let i = 0; i < rawParagraphs.length; i++) {
    const para = rawParagraphs[i];

    const counter = loading.querySelector('span:last-child');
    if (counter) counter.textContent = '翻訳中… (' + (i + 1) + ' / ' + rawParagraphs.length + ')';

    try {
      const res = await chrome.runtime.sendMessage({
        type:       'TRANSLATE',
        text:       para,
        sourceLang: 'JA',
        targetLang: 'EN',
      });

      if (res.ok) {
        translatedParagraphs.push({ jp: para, en: res.result });
      } else {
        console.warn('[NarouEN] 翻訳失敗:', res.error);
        translatedParagraphs.push({ jp: para, en: '(translation failed)' });
        if (!hasError) {
          hasError = true;
          errorBanner.style.display = 'block';
          const msg = document.getElementById('narouEN-error-msg');
          if (msg) msg.textContent = res.error;
        }
      }
    } catch (e) {
      console.error('[NarouEN] 通信エラー:', e);
      translatedParagraphs.push({ jp: para, en: '(error)' });
    }
  }

  // ── 4. iframe を挿入してリーダー UI を表示 ─────────────────
  loading.style.display = 'none';

  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('src/reader.html');
  wrapper.appendChild(frame);

  // ── 5. iframe 準備完了後にデータを送信 ────────────────────
  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage(
      { type: 'INIT_DATA', paragraphs: translatedParagraphs },
      '*'
    );
  });

  // ── 6. iframe の高さを内容に合わせて動的調整 ──────────────
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'RESIZE' && typeof e.data.height === 'number') {
      frame.style.height = e.data.height + 'px';
    }
  });
})();
