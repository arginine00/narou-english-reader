const STORAGE_KEYS = [
  'translationEngine', 'deeplApiKey', 'geminiApiKey', 'openaiApiKey', 'claudeApiKey',
  'defaultSpeed', 'ttsLang'
];

document.addEventListener('DOMContentLoaded', () => {
  // エンジン切り替え
  document.getElementById('engine').addEventListener('change', onEngineChange);

  // テストボタン
  document.getElementById('test-btn').addEventListener('click', testApi);

  // 保存ボタン
  document.getElementById('save-btn').addEventListener('click', save);

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
    speechSynthesis.onvoiceschanged = () => populateVoices();
  }
});

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

  chrome.runtime.sendMessage({
    type: 'TEST_API',
    engine,
    apiKey
  }, res => {
    if (res && res.ok && res.result) {
      msgDiv.style.background = '#e6f4ea';
      msgDiv.style.color = '#137333';
      msgDiv.textContent = `✓ 成功! 翻訳結果: "${res.result}"`;
    } else {
      msgDiv.style.background = '#fce8e6';
      msgDiv.style.color = '#c5221f';
      msgDiv.textContent = 'エラー: ' + ((res && res.error) ? res.error : '通信失敗');
    }
  });
}
