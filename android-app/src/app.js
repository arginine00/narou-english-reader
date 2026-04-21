import { CapacitorHttp } from '@capacitor/core';

const STORAGE_KEYS = [
  'translationEngine', 'deeplApiKey', 'geminiApiKey', 'openaiApiKey', 'claudeApiKey',
  'defaultSpeed', 'ttsVoice'
];

document.addEventListener('DOMContentLoaded', () => {
  // エンジン切り替え
  document.getElementById('engine').addEventListener('change', onEngineChange);
  document.getElementById('test-btn').addEventListener('click', testApi);
  document.getElementById('save-btn').addEventListener('click', save);

  // 読み込みボタン
  document.getElementById('read-btn').addEventListener('click', onReadClicked);
  document.getElementById('back-home-btn').addEventListener('click', () => {
    document.getElementById('reader-screen').style.display = 'none';
    document.getElementById('home-screen').style.display   = 'block';
  });

  // iframe内のリーダーからのメッセージ受信 (CHROME＿MSGモックなど)
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

  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => populateVoices(document.getElementById('tts-voice').value);
  }
});

// ── Capacitor Native HTTP による小説のパースと翻訳 ──
async function onReadClicked() {
  const urlEl = document.getElementById('narou-url');
  const msgEl = document.getElementById('read-msg');
  const url = urlEl.value.trim();

  if (!url) return;

  msgEl.style.display = 'block';
  msgEl.style.color = '#185FA5';
  msgEl.textContent = 'なろうのデータを取得中...';

  try {
    const res = await CapacitorHttp.get({ url });
    const html = res.data;
    
    msgEl.textContent = '文章を解析中...';
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const novelBody = doc.querySelector('#novel_honbun') || 
                      doc.querySelector('.js-novel-text') || 
                      doc.querySelector('.p-novel__text') || 
                      doc.querySelector('#novel_view');
                      
    if (!novelBody) {
      throw new Error('小説の本文が見つかりませんでした。正しいURLか確認してください。');
    }

    const rawParagraphs = [...novelBody.querySelectorAll('p')]
      .map(p => p.innerText.trim())
      .filter(t => t.length > 0);

    // タイトル取得
    const titleEl = doc.querySelector('.p-novel__title') || doc.querySelector('.contents1 a') || doc.querySelector('#novel_ex');
    const novelTitle = titleEl ? titleEl.textContent.trim() : '';

    msgEl.textContent = `翻訳エンジンを起動中... (全 ${rawParagraphs.length} 段落)`;

    const translatedParagraphs = [];
    const BATCH_SIZE = 20;

    // バッチ翻訳（background.js の関数を直接呼ぶ）
    for (let i = 0; i < rawParagraphs.length; i += BATCH_SIZE) {
      const batch = rawParagraphs.slice(i, i + BATCH_SIZE);
      msgEl.textContent = `翻訳中... (${Math.min(i + BATCH_SIZE, rawParagraphs.length)} / ${rawParagraphs.length})`;
      
      try {
        const results = await window.handleTranslateBatch(batch, 'JA', 'EN');
        for (let j = 0; j < batch.length; j++) {
          translatedParagraphs.push({ jp: batch[j], en: results[j] });
        }
      } catch (err) {
        throw new Error('翻訳エラー: ' + err.message);
      }

      if (i + BATCH_SIZE < rawParagraphs.length) {
        await new Promise(resolve => setTimeout(resolve, 12000));
      }
    }

    msgEl.textContent = 'リーダーを起動中...';

    // 取得したデータを reader.html に渡す
    const frame = document.getElementById('reader-frame');
    document.getElementById('home-screen').style.display = 'none';
    document.getElementById('reader-screen').style.display = 'block';

    frame.src = 'reader/reader.html';
    frame.onload = () => {
      frame.contentWindow.postMessage({
        type:       'INIT_DATA',
        paragraphs: translatedParagraphs,
        novelTitle: novelTitle,
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
  }
}

// ── reader.js からの WebExtension API モック通信 ──
function handleReaderMessages(e) {
  if (!e.data) return;
  if (e.data.type === 'CHROME_MSG' && e.data.msg) {
    // reader.js が発行した sendMessage をキャッチし、background API を叩いて返す
    const msg = e.data.msg;
    const msgId = e.data.msgId;

    if (msg.type === 'LOOKUP_WORD') {
      window.handleLookupWord(msg.word).then(res => {
        respondToReader(msgId, { ok:true, result: res });
      });
    } else if (msg.type === 'TRANSLATE_CHUNKS') {
      window.handleTranslateChunks(msg.en).then(res => {
        respondToReader(msgId, { ok:true, result: res });
      });
    }
  }
}

function respondToReader(msgId, data) {
  const frame = document.getElementById('reader-frame');
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage({ type: 'CHROME_CB', msgId, res: data }, '*');
  }
}

// ============================================
// 元々あった popup.js の UI 用ロジック
// ============================================

function populateVoices(savedVoiceUri = null) {
  const sel = document.getElementById('tts-voice');
  if (!sel) return;

  const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  if (voices.length === 0) return;

  voices.sort((a, b) => {
    const aGood = a.name.includes('Natural') || a.name.includes('Google') || a.name.includes('Online');
    const bGood = b.name.includes('Natural') || b.name.includes('Google') || b.name.includes('Online');
    if (aGood && !bGood) return -1;
    if (!aGood && bGood) return 1;
    return a.name.localeCompare(b.name);
  });

  const currentVal = savedVoiceUri || sel.value;
  sel.innerHTML = '<option value="default">ブラウザ標準の音声</option>';
  
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    const isGood = v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Online');
    opt.textContent = (isGood ? '★ ' : '') + `${v.name} (${v.lang})`;
    sel.appendChild(opt);
  });

  if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
    sel.value = currentVal;
  }
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
