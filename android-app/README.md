# NarouEN Android App

小説家になろうの小説を英語翻訳・音声読み上げする Android アプリの実装ガイド。

## 技術スタック

| 用途 | ライブラリ / API |
|------|----------------|
| UI | Kotlin + Jetpack Compose |
| HTTP | Retrofit + OkHttp |
| HTML パース | Jsoup |
| 翻訳 | DeepL API v2 |
| TTS | Android TextToSpeech + Google Cloud TTS (オプション) |
| ローカル DB | Room (SQLite) |
| 非同期 | Kotlin Coroutines + Flow |
| DI | Hilt |

## プロジェクト構成

```
app/
├── data/
│   ├── api/
│   │   ├── DeepLApi.kt          # Retrofit インターフェース
│   │   └── NarouScraper.kt      # Jsoup でなろう本文を抽出
│   ├── db/
│   │   ├── AppDatabase.kt       # Room DB 定義
│   │   ├── TranslationDao.kt    # 翻訳キャッシュ DAO
│   │   └── BookmarkDao.kt       # しおり DAO
│   └── repository/
│       └── NovelRepository.kt   # データ層の窓口
├── domain/
│   ├── model/
│   │   ├── Sentence.kt          # 文・文節・トークンのモデル
│   │   └── Chunk.kt             # 文節対訳モデル
│   └── usecase/
│       ├── FetchNovelUseCase.kt
│       └── TranslateUseCase.kt
└── ui/
    ├── reader/
    │   ├── ReaderScreen.kt      # メイン読書画面
    │   ├── ReaderViewModel.kt   # 状態管理
    │   ├── SentenceItem.kt      # 1文コンポーネント
    │   ├── WordPanel.kt         # 単語訳パネル
    │   └── ChunkPanel.kt        # 文節対訳パネル
    └── settings/
        └── SettingsScreen.kt
```

## 主要実装ポイント

### TTS 単語ハイライト同期

```kotlin
// ReaderViewModel.kt
private val tts = TextToSpeech(context) { status ->
    if (status == TextToSpeech.SUCCESS) {
        tts.language = Locale.US
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onRangeStart(utteranceId: String, start: Int, end: Int, frame: Int) {
                // start/end でハイライト対象の単語インデックスを特定
                _highlightRange.value = start..end
            }
            override fun onDone(utteranceId: String) {
                when (playMode) {
                    PlayMode.SINGLE -> {
                        _isPlaying.value = false
                        advanceSentence()  // 次の文にカーソルを移動して停止
                    }
                    PlayMode.CONTINUOUS -> {
                        advanceSentence()
                        speakCurrent()     // 次の文を自動再生
                    }
                }
            }
            override fun onError(utteranceId: String) { _isPlaying.value = false }
        })
    }
}
```

### 長押し / ダブルタップ検出

```kotlin
// SentenceItem.kt
@Composable
fun WordToken(
    word: String,
    onSingleTap: () -> Unit,
    onDoubleTap: () -> Unit,
    onLongPress: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Text(
        text = word,
        modifier = Modifier
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap           = { onSingleTap() },
                    onDoubleTap     = { onDoubleTap() },
                    onLongPress     = { onLongPress() },
                )
            }
    )
}
```

### なろう本文スクレイピング

```kotlin
// NarouScraper.kt
suspend fun fetchNovel(ncode: String): List<String> = withContext(Dispatchers.IO) {
    val url  = "https://ncode.syosetu.com/$ncode/1/"
    val doc  = Jsoup.connect(url)
                    .userAgent("Mozilla/5.0")
                    .get()
    val body = doc.select("#novel_honbun p")
    body.map { it.text() }.filter { it.isNotBlank() }
}
```

### 翻訳キャッシュ (Room)

```kotlin
// TranslationDao.kt
@Dao
interface TranslationDao {
    @Query("SELECT translated FROM translations WHERE original = :text LIMIT 1")
    suspend fun getCache(text: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: TranslationEntity)
}
```

## セットアップ

```bash
# 1. リポジトリをクローン
git clone https://github.com/yourname/narou-english-reader.git

# 2. local.properties に API キーを追加
echo "DEEPL_API_KEY=your_key_here" >> local.properties

# 3. Android Studio で開いてビルド
```

## 利用規約について

- なろうのスクレイピングは**個人・非商用利用の範囲**でのみ使用すること
- 翻訳テキストの再配布・公開は著作権法上 NG
- API リクエストはサーバー負荷を避けるため段落間に 300ms の遅延を設けること
