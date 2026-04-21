/**
 * background.js — Service Worker (Manifest V3)
 *
 * 役割:
 *   - content.js からの翻訳リクエストを受け取り、選択された翻訳エンジンを呼び出す
 *   - 対応エンジン: DeepL / Gemini / ChatGPT (OpenAI) / Claude (Anthropic)
 *   - CORS を回避するために Service Worker 側でフェッチする
 *   - 翻訳結果を chrome.storage.local にキャッシュして API 消費を削減
 */

const CACHE_PREFIX = 'trans_';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'TRANSLATE_BATCH') {
    handleTranslateBatch(msg.texts, msg.sourceLang || 'JA', msg.targetLang || 'EN')
      .then(results => sendResponse({ ok: true, results }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'TEST_API') {
    handleTestApi(msg.engine, msg.apiKey)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'TRANSLATE_CHUNKS') {
    handleTranslateChunks(msg.en)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'LOOKUP_WORD') {
    handleLookupWord(msg.word)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'BOOKMARK_SAVE') {
    const key = 'bookmark_' + msg.ncode + '_' + msg.episode;
    chrome.storage.local.set({ [key]: { sentIndex: msg.sentIndex, timestamp: Date.now(), url: msg.url } },
      () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'BOOKMARK_LOAD') {
    const key = 'bookmark_' + msg.ncode + '_' + msg.episode;
    chrome.storage.local.get(key, data => {
      sendResponse({ ok: true, bookmark: data[key] || null });
    });
    return true;
  }
});

/* ═══════════════════════════════════════════════════════════════
 *  文節(チャンク)翻訳 API
 * ═══════════════════════════════════════════════════════════════ */

async function handleTranslateChunks(enText) {
  // 句読点の後、および一般的な前置詞・接続詞の前で分割します。
  let modified = enText.replace(/([,;:.?!])\s+/g, "$1|@@|");
  modified = modified.replace(/\s+(\b(?:in|on|at|with|by|for|to|from|about|of|and|but|or|because|that|which|who|where|when|if|although)\b)/gi, "|@@| $1");
  const parts = modified.split('|@@|').map(s => s.trim()).filter(s => s.length > 0);
  
  const chunks = [];
  try {
    for (const part of parts) {
      if (!part.trim()) continue;
      // 今回は安定して超高速かつ無料なGoogleの翻訳APIを裏で使い、一瞬でフレーズごとに和訳します。
      // これによりLLMの重い応答を待たずに各文節を学習できます。
      const resGo = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(part)}`);
      let jp = '(翻訳失敗)';
      if (resGo.ok) {
        const dataGo = await resGo.json();
        jp = dataGo[0].map(x => x[0]).join(''); // 全て結合
      }
      chunks.push({ en: part, jp });
    }
  } catch (e) {
    if (chunks.length === 0) chunks.push({ en: enText, jp: '(文節翻訳に失敗しました)' });
  }

  return chunks;
}

/* ═══════════════════════════════════════════════════════════════
 *  API テスト
 * ═══════════════════════════════════════════════════════════════ */

async function handleTestApi(engine, apiKey) {
  if (!apiKey) throw new Error('APIキーが設定されていません');
  
  const testText = ['これはAPIのテスト通信です。'];
  let translatedTexts;

  switch (engine) {
    case 'gemini':
      translatedTexts = await translateWithGemini(apiKey, testText, 'JA', 'EN');
      break;
    case 'chatgpt':
      translatedTexts = await translateWithChatGPT(apiKey, testText, 'JA', 'EN');
      break;
    case 'claude':
      translatedTexts = await translateWithClaude(apiKey, testText, 'JA', 'EN');
      break;
    case 'deepl':
    default:
      translatedTexts = await translateWithDeepL(apiKey, testText, 'JA', 'EN');
      break;
  }

  if (!translatedTexts || translatedTexts.length === 0) {
    throw new Error('翻訳結果が空です');
  }
  return translatedTexts[0];
}

/* ═══════════════════════════════════════════════════════════════
 *  翻訳ルーター
 * ═══════════════════════════════════════════════════════════════ */

async function handleTranslateBatch(texts, sourceLang, targetLang) {
  const results = new Array(texts.length).fill(null);
  const toTranslateIndices = [];
  const toTranslateTexts = [];

  // キャッシュ確認
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const cacheKey = CACHE_PREFIX + btoa(encodeURIComponent(text)).slice(0, 40);
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      results[i] = cached[cacheKey];
    } else {
      toTranslateIndices.push(i);
      toTranslateTexts.push(text);
    }
  }

  if (toTranslateTexts.length === 0) return results;

  // エンジン設定を取得
  const config = await chrome.storage.local.get([
    'translationEngine', 'deeplApiKey', 'geminiApiKey', 'openaiApiKey', 'claudeApiKey'
  ]);
  const engine = config.translationEngine || 'deepl';

  let translatedTexts;
  switch (engine) {
    case 'gemini':
      translatedTexts = await translateWithGemini(config.geminiApiKey, toTranslateTexts, sourceLang, targetLang);
      break;
    case 'chatgpt':
      translatedTexts = await translateWithChatGPT(config.openaiApiKey, toTranslateTexts, sourceLang, targetLang);
      break;
    case 'claude':
      translatedTexts = await translateWithClaude(config.claudeApiKey, toTranslateTexts, sourceLang, targetLang);
      break;
    case 'deepl':
    default:
      translatedTexts = await translateWithDeepL(config.deeplApiKey, toTranslateTexts, sourceLang, targetLang);
      break;
  }

  if (!Array.isArray(translatedTexts) || translatedTexts.length !== toTranslateTexts.length) {
    throw new Error('API返却数が一致しません (バッチ処理エラー)');
  }

  // キャッシュ保存と結果マージ
  for (let i = 0; i < toTranslateTexts.length; i++) {
    const text = toTranslateTexts[i];
    const cacheKey = CACHE_PREFIX + btoa(encodeURIComponent(text)).slice(0, 40);
    const trans = translatedTexts[i];
    await chrome.storage.local.set({ [cacheKey]: trans });
    results[toTranslateIndices[i]] = trans;
  }

  return results;
}

// 互換性のため残す
async function handleTranslate(text, sourceLang, targetLang) {
  const res = await handleTranslateBatch([text], sourceLang, targetLang);
  return res[0];
}

/* ─── DeepL ──────────────────────────────────────────────────── */

async function translateWithDeepL(apiKey, texts, sourceLang, targetLang) {
  if (!apiKey) throw new Error('DeepL API キーが未設定です。拡張機能の設定を開いてください。');

  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_key: apiKey,
      text: texts,
      source_lang: sourceLang,
      target_lang: targetLang,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepL API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.translations.map(t => t.text);
}

/* ─── Gemini (Google Generative Language API) ─────────────── */

async function translateWithGemini(apiKey, texts, sourceLang, targetLang) {
  if (!apiKey) throw new Error('Gemini API キーが未設定です。拡張機能の設定を開いてください。');

  const langMap = { JA: '日本語', EN: '英語', ZH: '中国語', KO: '韓国語', FR: 'フランス語', DE: 'ドイツ語' };
  const from = langMap[sourceLang] || sourceLang;
  const to   = langMap[targetLang] || targetLang;

  const prompt = `Translate the following JSON array of ${from} texts to ${to}. Output ONLY a valid JSON array of strings containing the translations in the exact same order. Do not wrap the output in markdown code blocks or add any other text.\n\n${JSON.stringify(texts)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidate) throw new Error('Gemini: 翻訳結果を取得できませんでした');
  
  try {
    const cleaned = extractJsonArray(candidate);
    return JSON.parse(cleaned);
  } catch(e) {
    throw new Error('Gemini: JSONパースエラー -> ' + candidate);
  }
}

/* ─── ChatGPT (OpenAI API) ────────────────────────────────── */

async function translateWithChatGPT(apiKey, texts, sourceLang, targetLang) {
  if (!apiKey) throw new Error('OpenAI API キーが未設定です。拡張機能の設定を開いてください。');

  const langMap = { JA: 'Japanese', EN: 'English', ZH: 'Chinese', KO: 'Korean', FR: 'French', DE: 'German' };
  const from = langMap[sourceLang] || sourceLang;
  const to   = langMap[targetLang] || targetLang;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        { role: 'system', content: `You are a professional translator. Translate the given JSON array of ${from} texts to ${to}. Output ONLY a valid JSON array of strings containing the translations in the exact same order. Do not wrap the output in markdown.` },
        { role: 'user', content: JSON.stringify(texts) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const result = data.choices?.[0]?.message?.content;
  if (!result) throw new Error('ChatGPT: 翻訳結果を取得できませんでした');
  
  try {
    const cleaned = extractJsonArray(result);
    return JSON.parse(cleaned);
  } catch(e) {
    throw new Error('ChatGPT: JSONパースエラー -> ' + result);
  }
}

/* ─── Claude (Anthropic API) ──────────────────────────────── */

async function translateWithClaude(apiKey, texts, sourceLang, targetLang) {
  if (!apiKey) throw new Error('Claude API キーが未設定です。拡張機能の設定を開いてください。');

  const langMap = { JA: 'Japanese', EN: 'English', ZH: 'Chinese', KO: 'Korean', FR: 'French', DE: 'German' };
  const from = langMap[sourceLang] || sourceLang;
  const to   = langMap[targetLang] || targetLang;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      temperature: 0.1,
      messages: [
        { role: 'user', content: `Translate the following JSON array of ${from} texts to ${to}. Output ONLY a valid JSON array of strings containing the translations in the exact same order. Do not wrap the output in markdown code blocks.\n\n${JSON.stringify(texts)}` },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const result = data.content?.[0]?.text;
  if (!result) throw new Error('Claude: 翻訳結果を取得できませんでした');
  
  try {
    const cleaned = extractJsonArray(result);
    return JSON.parse(cleaned);
  } catch(e) {
    throw new Error('Claude: JSONパースエラー -> ' + result);
  }
}

function extractJsonArray(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
  return cleaned.trim();
}

/* ═══════════════════════════════════════════════════════════════
 *  辞書 API
 * ═══════════════════════════════════════════════════════════════ */

async function handleLookupWord(word) {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!normalized) throw new Error('Invalid word');

  const cacheKey = 'dict_' + normalized;
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) return cached[cacheKey];

  let partOfSpeech = '';
  let phonetic = '';
  let example = '';

  // 1. dictionaryapi.dev で発音記号や品詞を取得（引けなくてもエラーにしない）
  try {
    const resDict = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${normalized}`);
    if (resDict.ok) {
      const dataDict = await resDict.json();
      const entry = dataDict[0];
      phonetic = entry.phonetic || '';
      partOfSpeech = entry.meanings[0]?.partOfSpeech || '';
      example = entry.meanings[0]?.definitions[0]?.example || '';
    }
  } catch(e) {}

  // 2. Google Translate 無料 API で確実な「単語の日本語訳」を取得（LLMのRPM消費を避ける）
  let definition = '';
  try {
    const resGo = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${normalized}`);
    if (resGo.ok) {
      const dataGo = await resGo.json();
      definition = dataGo[0][0][0]; // 例: "swords" -> "剣"
    } else {
      definition = '(翻訳に失敗しました)';
    }
  } catch(e) {
    definition = '(翻訳に失敗しました)';
  }

  const result = {
    word: normalized,
    phonetic,
    partOfSpeech,
    definition,
    example,
  };

  await chrome.storage.local.set({ [cacheKey]: result });
  return result;
}
