/**
 * background.js — Service Worker (Manifest V3)
 *
 * 役割:
 *   - content.js からの翻訳リクエストを受け取り、DeepL API を呼び出す
 *   - CORS を回避するために Service Worker 側でフェッチする
 *   - 翻訳結果を chrome.storage.local にキャッシュして API 消費を削減
 *
 * セットアップ:
 *   chrome.storage.local.set({ deeplApiKey: "YOUR_KEY" }) で API キーを設定する
 *   （popup.html の設定画面から入力できるようにする）
 */

const CACHE_PREFIX = 'trans_';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'TRANSLATE') {
    handleTranslate(msg.text, msg.sourceLang || 'JA', msg.targetLang || 'EN')
      .then(result => sendResponse({ ok: true, result }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true; // 非同期レスポンスを有効化
  }
});

async function handleTranslate(text, sourceLang, targetLang) {
  // キャッシュ確認
  const cacheKey = CACHE_PREFIX + btoa(encodeURIComponent(text)).slice(0, 40);
  const cached   = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) return cached[cacheKey];

  // API キー取得
  const { deeplApiKey } = await chrome.storage.local.get('deeplApiKey');
  if (!deeplApiKey) throw new Error('DeepL API key not set. Open extension settings.');

  // DeepL API 呼び出し
  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_key: deeplApiKey,
      text: [text],
      source_lang: sourceLang,
      target_lang: targetLang,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepL API error: ${res.status} ${err}`);
  }

  const data       = await res.json();
  const translated = data.translations[0].text;

  // キャッシュ保存
  await chrome.storage.local.set({ [cacheKey]: translated });

  return translated;
}
