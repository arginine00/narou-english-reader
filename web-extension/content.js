/**
 * content.js — Content Script
 *
 * syosetu.com のページを検知し、小説本文を抽出して
 * background.js 経由で翻訳し、リーダー UI を注入する。
 */

(async () => {
  // ── 1. 小説本文の取得 ──────────────────────────────────────
  const novelBody = document.querySelector('#novel_honbun');
  if (!novelBody) return; // 小説ページでなければ終了

  const rawParagraphs = [...novelBody.querySelectorAll('p')]
    .map(p => p.innerText.trim())
    .filter(t => t.length > 0);

  if (rawParagraphs.length === 0) return;

  // ── 2. 翻訳リクエスト (background.js へ) ───────────────────
  const translatedParagraphs = [];
  for (const para of rawParagraphs) {
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
    }
  }

  // ── 3. リーダー UI の注入 ───────────────────────────────────
  // 既存の本文の直後にリーダーパネルを挿入する
  const wrapper = document.createElement('div');
  wrapper.id    = 'narouEN-reader';
  wrapper.style.cssText = `
    margin: 24px 0;
    border: 1px solid #e0e0d8;
    border-radius: 12px;
    overflow: hidden;
    background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  // iframe でリーダー HTML を読み込む
  const frame = document.createElement('iframe');
  frame.src   = chrome.runtime.getURL('src/reader.html');
  frame.style.cssText = 'width:100%;border:none;min-height:400px;';
  wrapper.appendChild(frame);
  novelBody.insertAdjacentElement('afterend', wrapper);

  // iframe の準備ができたらデータを渡す
  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage(
      { type: 'INIT_DATA', paragraphs: translatedParagraphs },
      '*'
    );
  });
})();
