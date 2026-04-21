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
    if (data.ttsLang)           document.getElementById('tts-lang').value     = data.ttsLang;
    onEngineChange();
  });
});

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
    ttsLang:           document.getElementById('tts-lang').value,
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
