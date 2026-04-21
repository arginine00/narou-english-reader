/**
 * content.js — Content Script
 *
 * syosetu.com のページを検知し、小説本文を抽出して
 * background.js 経由で翻訳し、リーダー UI を注入する。
 *
 * ── 対応レイアウト ──
 *   旧レイアウト: #novel_honbun 内の p タグ, .novel_bn ナビ
 *   新レイアウト: .js-novel-text 内の p タグ, .c-pager ナビ
 *
 * スタイルは content.css で定義済み（manifest.json で自動注入）。
 */

(async () => {
  // ── 1. 小説本文の取得（旧/新レイアウト両対応） ─────────────
  const novelBody =
    document.querySelector('#novel_honbun') ||         // 旧レイアウト
    document.querySelector('.js-novel-text') ||         // 新レイアウト
    document.querySelector('.p-novel__text') ||         // 新レイアウト (別名)
    document.querySelector('#novel_view');              // フォールバック
  if (!novelBody) return;

  const rawParagraphs = [...novelBody.querySelectorAll('p')]
    .map(p => p.innerText.trim())
    .filter(t => t.length > 0);

  if (rawParagraphs.length === 0) return;

  // ── 2. メタデータ抽出 ──────────────────────────────────────

  // ncode と episode 番号を URL から抽出
  const urlMatch = location.pathname.match(/\/([a-z0-9]+)\/(\d+)\/?/i);
  const ncode   = urlMatch ? urlMatch[1] : '';
  const episode = urlMatch ? urlMatch[2] : '';

  // 小説タイトル（旧/新両対応）
  const titleEl =
    document.querySelector('.p-novel__title') ||        // 新レイアウト
    document.querySelector('.contents1 a') ||           // 旧レイアウト
    document.querySelector('#novel_ex');                // フォールバック
  const novelTitle = titleEl ? titleEl.textContent.trim() : '';

  // 前後エピソードリンク（旧/新両対応）
  let prevUrl = '';
  let nextUrl = '';

  // 新レイアウト: .c-pager 内のリンク
  const newPagerPrev = document.querySelector('.c-pager__item--prev a, .c-pager a[rel="prev"]');
  const newPagerNext = document.querySelector('.c-pager__item--next a, .c-pager a[rel="next"]');
  if (newPagerPrev) prevUrl = newPagerPrev.href;
  if (newPagerNext) nextUrl = newPagerNext.href;

  // 旧レイアウト: .novel_bn 内のリンク（新レイアウトで見つからなかった場合）
  if (!prevUrl && !nextUrl) {
    const navLinks = document.querySelectorAll('.novel_bn a');
    navLinks.forEach(a => {
      const text = a.textContent;
      if (text.includes('前') || text.includes('prev')) prevUrl = a.href;
      if (text.includes('次') || text.includes('next')) nextUrl = a.href;
    });
  }

  // ── 3. 設定を取得 ──────────────────────────────────────────
  const settings = await new Promise(resolve => {
    chrome.storage.local.get(['defaultSpeed', 'ttsVoice'], data => {
      resolve({
        speed:    data.defaultSpeed || '1.0',
        ttsVoice: data.ttsVoice     || 'default',
      });
    });
  });

  // ── 4. ブックマークを取得 ──────────────────────────────────
  let bookmark = null;
  if (ncode && episode) {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'BOOKMARK_LOAD', ncode, episode,
      });
      if (res && res.ok && res.bookmark) {
        bookmark = res.bookmark;
      }
    } catch (e) {
      console.warn('[NarouEN] ブックマーク読込失敗:', e);
    }
  }

  // ── 5. ローディング UI を先に挿入 ─────────────────────────
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
  novelBody.insertAdjacentElement('beforebegin', wrapper);

  // ── 6. 翻訳リクエスト (background.js へ) ───────────────────
  const translatedParagraphs = [];
  let hasError = false;
  
  // Geminiの仕様により、巨大すぎるテキストを一度に送るとサーバー負荷で503エラーになります。
  // ご要望に合わせて「20段落ずつ」の安全なバッチサイズに縮小します。
  const BATCH_SIZE = 20;

  for (let i = 0; i < rawParagraphs.length; i += BATCH_SIZE) {
    const batch = rawParagraphs.slice(i, i + BATCH_SIZE);

    const counter = loading.querySelector('span:last-child');
    if (counter) counter.textContent = '翻訳中… (' + Math.min(i + BATCH_SIZE, rawParagraphs.length) + ' / ' + rawParagraphs.length + ')';

    try {
      const res = await chrome.runtime.sendMessage({
        type:       'TRANSLATE_BATCH',
        texts:      batch,
        sourceLang: 'JA',
        targetLang: 'EN',
      });

      if (res.ok && res.results) {
        for (let j = 0; j < batch.length; j++) {
          translatedParagraphs.push({ jp: batch[j], en: res.results[j] });
        }
      } else {
        console.warn('[NarouEN] 翻訳失敗:', res?.error);
        for (let j = 0; j < batch.length; j++) {
          translatedParagraphs.push({ jp: batch[j], en: '(translation failed)' });
        }
        if (!hasError) {
          hasError = true;
          errorBanner.style.display = 'block';
          const msg = document.getElementById('narouEN-error-msg');
          if (msg) msg.textContent = (res?.error || 'Unknown API error');
        }
      }
    } catch (e) {
      console.error('[NarouEN] 通信エラー:', e);
      for (let j = 0; j < batch.length; j++) {
        translatedParagraphs.push({ jp: batch[j], en: '(error)' });
      }
    }

    // レートリミット対策（5 RPM制限を100%回避する確実な待機時間）
    // 1分間に5回（60秒 / 5回 = 12秒）。これより短いと制限に引っかかります。
    if (i + BATCH_SIZE < rawParagraphs.length) {
      const waitMs = 12000; // 12秒待つ
      console.log(`[NarouEN] 次のバッチまで ${waitMs}ms 待機します...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  // ── 7. iframe を挿入してリーダー UI を表示 ─────────────────
  loading.style.display = 'none';

  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('src/reader.html');
  wrapper.appendChild(frame);

  // ── 8. iframe 準備完了後にデータを送信 ────────────────────
  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage({
      type:       'INIT_DATA',
      paragraphs: translatedParagraphs,
      prevUrl,
      nextUrl,
      novelTitle,
      ncode,
      episode,
      settings,
      bookmark,
    }, '*');
  });

  // ── 9. iframe からのメッセージを処理 ──────────────────────
  window.addEventListener('message', e => {
    if (!e.data || !e.data.type) return;

    // iframe 高さ同期 (無効化：高さを固定しスクロールバーを出すため)
    // if (e.data.type === 'RESIZE' && typeof e.data.height === 'number') {
    //   frame.style.height = e.data.height + 'px';
    // }

    // チャプターナビゲーション
    if (e.data.type === 'NAVIGATE' && e.data.url) {
      location.href = e.data.url;
    }

    // ブックマーク保存
    if (e.data.type === 'BOOKMARK_SAVE' && ncode && episode) {
      chrome.runtime.sendMessage({
        type: 'BOOKMARK_SAVE',
        ncode,
        episode,
        sentIndex: e.data.sentIndex,
        url: location.href,
      });
    }
  });
})();
