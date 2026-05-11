const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app.js');
let code = fs.readFileSync(filePath, 'utf8');

const startStr = '// ── 小説を隠しiframeでスクレイプしてリーダー画面へ移行 ──';
const endStr = '// ── reader.js からの WebExtension API モック通信 ──';
const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.log('Could not find boundaries');
  process.exit(1);
}

const newLoadNovel = `// ── 小説をブラウザ(srcdoc iframe)からパースしてリーダー画面へ移行 ──
async function loadNovel(url) {
  const msgEl = document.querySelector('#reader-screen #read-msg');
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('browser-screen').style.display = 'none';
  document.getElementById('reader-screen').style.display = 'block';
  msgEl.style.display = 'block';
  msgEl.style.color = '#185FA5';
  document.getElementById('reader-frame').src = '';
  msgEl.textContent = '文章を解析中...';

  try {
    const browserFrame = document.getElementById('browser-frame');
    const doc = browserFrame.contentDocument;
    if (!doc) throw new Error('ブラウザのDOMにアクセスできません。');

    // ── 小説本文解析: 複数ストラテジーで対応 ──
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
        const combined = sections.map(s => s.innerText.trim()).join('\\n');
        rawParagraphs = combined.split(/\\n+/).map(l => l.trim()).filter(t => t.length > 0);
      }
    }
    if (rawParagraphs.length === 0) {
      const fb = doc.querySelector('#novel_view');
      if (fb) {
        const pTags = Array.from(fb.querySelectorAll('p'));
        rawParagraphs = pTags.length > 0
          ? pTags.map(p => p.innerText.trim()).filter(t => t.length > 0)
          : fb.innerText.split(/\\n+/).map(l => l.trim()).filter(t => t.length > 0);
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
      if (bestEl) rawParagraphs = bestEl.innerText.split(/\\n+/).map(l => l.trim()).filter(t => t.length > 5);
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
      const m = url.match(/(https?:\\/\\/[\\w.]+\\/[a-z0-9]+\\/)/i);
      return m ? m[1] : '';
    })();
    currentTocUrl = tocUrl; // TOC ボタンから参照できるよう保存

    msgEl.textContent = \`翻訳エンジンを起動中... (全 \${rawParagraphs.length} 段落)\`;
    const translatedParagraphs = [];
    const BATCH_SIZE = 20;
    for (let i = 0; i < rawParagraphs.length; i += BATCH_SIZE) {
      const batch = rawParagraphs.slice(i, i + BATCH_SIZE);
      msgEl.textContent = \`翻訳中... (\${Math.min(i + BATCH_SIZE, rawParagraphs.length)} / \${rawParagraphs.length})\`;
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
    document.getElementById('browser-screen').style.display = 'flex';
    document.getElementById('reader-screen').style.display = 'none';
  }
}

`;

code = code.substring(0, startIndex) + newLoadNovel + code.substring(endIndex);

fs.writeFileSync(filePath, code);
console.log('Modified app.js successfully!');
