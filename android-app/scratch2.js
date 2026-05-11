const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add message forwarder to interceptor
const interceptorSearch = `window.parent.postMessage({ type: 'BROWSER_NAV', url: action + sep + params }, '*');
        });`;
const interceptorReplace = `window.parent.postMessage({ type: 'BROWSER_NAV', url: action + sep + params }, '*');
        });
        window.addEventListener('message', function(e) {
          if (e.source !== window && e.data && e.data.type) {
            window.parent.postMessage(e.data, '*');
          }
        });`;
code = code.replace(interceptorSearch, interceptorReplace);

// 2. Rewrite loadNovel
const startStr = '// ── 小説をブラウザ(srcdoc iframe)からパースしてリーダー画面へ移行 ──';
const endStr = '// ── reader.js からの WebExtension API モック通信 ──';
const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.log('Could not find boundaries');
  process.exit(1);
}

const newLoadNovel = `// ── 小説をブラウザ(srcdoc iframe)からパースしてリーダー画面へ移行 ──
async function loadNovel(url) {
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('reader-screen').style.display = 'none';
  document.getElementById('browser-screen').style.display = 'flex';

  try {
    const browserFrame = document.getElementById('browser-frame');
    const doc = browserFrame.contentDocument;
    if (!doc) throw new Error('ブラウザのDOMにアクセスできません。');

    const oldFab = doc.getElementById('narou-en-fab');
    if (oldFab) oldFab.remove();

    let rawParagraphs = [];
    const knownSelectors = [
      '#novel_p', '#novel_honbun', '#novel_a',
      '.js-novel-text', '.p-novel__text',
      '.p-novel__text--preface', '.p-novel__text--afterword',
    ];
    let sections = Array.from(doc.querySelectorAll(knownSelectors.join(', ')));
    let novelBody = null;

    if (sections.length > 0) {
      novelBody = sections[0];
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
        novelBody = fb;
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
      if (bestEl) {
        novelBody = bestEl;
        rawParagraphs = bestEl.innerText.split(/\\n+/).map(l => l.trim()).filter(t => t.length > 5);
      }
    }
    if (rawParagraphs.length === 0 || !novelBody) throw new Error('小説本文が見つかりませんでした。');

    const titleEl = doc.querySelector('.p-novel__title') || doc.querySelector('.contents1 a') || doc.querySelector('#novel_ex');
    const novelTitle = titleEl ? titleEl.textContent.trim() : '';

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
    const tocUrl = (() => {
      const m = url.match(/(https?:\\/\\/[\\w.]+\\/[a-z0-9]+\\/)/i);
      return m ? m[1] : '';
    })();
    currentTocUrl = tocUrl;

    const wrapper = doc.createElement('div');
    wrapper.id = 'narouEN-reader';
    wrapper.style.cssText = 'width: 100%; margin-bottom: 20px;';

    const loading = doc.createElement('div');
    loading.id = 'narouEN-loading';
    loading.style.cssText = 'padding: 20px; background: #fff; border: 2px solid #1D9E75; border-radius: 8px; text-align: center; color: #1D9E75; font-weight: bold; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);';
    loading.textContent = \`翻訳エンジンを起動中... (全 \${rawParagraphs.length} 段落)\`;

    wrapper.appendChild(loading);
    novelBody.insertAdjacentElement('beforebegin', wrapper);
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const translatedParagraphs = [];
    const BATCH_SIZE = 20;
    for (let i = 0; i < rawParagraphs.length; i += BATCH_SIZE) {
      const batch = rawParagraphs.slice(i, i + BATCH_SIZE);
      loading.textContent = \`翻訳中... (\${Math.min(i + BATCH_SIZE, rawParagraphs.length)} / \${rawParagraphs.length})\`;
      try {
        const results = await window.handleTranslateBatch(batch, 'JA', 'EN');
        for (let j = 0; j < batch.length; j++) translatedParagraphs.push({ jp: batch[j], en: results[j] });
      } catch (err) { 
        loading.textContent = '翻訳エラー: ' + err.message;
        loading.style.color = 'red';
        loading.style.borderColor = 'red';
        throw new Error('翻訳エラー: ' + err.message); 
      }
      if (i + BATCH_SIZE < rawParagraphs.length) await new Promise(r => setTimeout(r, 12000));
    }

    loading.style.display = 'none';

    const frame = doc.createElement('iframe');
    frame.src = window.location.origin + '/reader/reader.html';
    frame.style.cssText = 'width: 100%; height: 80vh; border: 2px solid #185FA5; border-radius: 8px; background: #fff; display: block; box-sizing: border-box;';
    wrapper.appendChild(frame);

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

    sections.forEach(s => s.style.display = 'none');

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

`;

code = code.substring(0, startIndex) + newLoadNovel + code.substring(endIndex);
fs.writeFileSync(filePath, code);
console.log('Successfully updated app.js');
