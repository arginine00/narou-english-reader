/**
 * dict.js
 * 英単語 → 日本語訳の辞書。
 * 実際のアプリでは DeepL Glossary API や形態素解析 (kuromoji.js) で動的生成する。
 * フォーマット: { [小文字単語]: { jp: "訳", note: "品詞メモ" } }
 */
const DICT = {
  // 固有名詞
  kazuto:        { jp: "カズト",           note: "固有名詞・主人公" },

  // 動詞
  opened:        { jp: "開いた",           note: "open の過去形" },
  greeted:       { jp: "迎えられた",       note: "greet の過去形（受動的）" },
  filtering:     { jp: "差し込む・漉す",   note: "filter の現在分詞" },
  lingered:      { jp: "漂い続けた",       note: "linger の過去形" },
  grasp:         { jp: "掴む・理解する",   note: "動詞" },
  knew:          { jp: "知っていた",       note: "know の過去形" },
  reached:       { jp: "手を伸ばした",     note: "reach の過去形" },
  find:          { jp: "見つける",         note: "動詞" },
  sat:           { jp: "置かれていた",     note: "sit の過去形" },
  hummed:        { jp: "低く鳴り響いた",   note: "hum の過去形" },
  was:           { jp: "〜だった",         note: "be 動詞過去形" },

  // 形容詞
  pale:          { jp: "淡い・青白い",     note: "形容詞" },
  strange:       { jp: "奇妙な",           note: "形容詞" },
  silent:        { jp: "静かな",           note: "形容詞" },
  unfamiliar:    { jp: "見知らぬ",         note: "形容詞" },
  ancient:       { jp: "古代の・古い",     note: "形容詞" },
  vast:          { jp: "広大な",           note: "形容詞" },

  // 副詞
  slowly:        { jp: "ゆっくりと",       note: "副詞" },
  instinctively: { jp: "本能的に・反射的に", note: "副詞" },
  quite:         { jp: "まったく",         note: "副詞（強調）" },
  far:           { jp: "はるかに",         note: "副詞（強調）" },
  once:          { jp: "かつて",           note: "副詞" },
  usually:       { jp: "いつも・普段",     note: "副詞" },
  only:          { jp: "〜だけ",           note: "副詞" },
  too:           { jp: "あまりにも",       note: "副詞" },
  outside:       { jp: "外では",           note: "副詞" },

  // 名詞
  eyes:          { jp: "目",               note: "eye の複数形" },
  morning:       { jp: "朝の",             note: "名詞（形容詞的用法）" },
  light:         { jp: "光",               note: "名詞" },
  curtains:      { jp: "カーテン",         note: "curtain の複数形" },
  sensation:     { jp: "感覚・感触",       note: "名詞" },
  chest:         { jp: "胸",               note: "名詞" },
  echo:          { jp: "残響・こだま",     note: "名詞" },
  dream:         { jp: "夢",               note: "名詞" },
  room:          { jp: "部屋",             note: "名詞" },
  world:         { jp: "世界",             note: "名詞" },
  phone:         { jp: "スマートフォン",   note: "名詞" },
  desk:          { jp: "机",               note: "名詞" },
  city:          { jp: "街・都市",         note: "名詞" },
  rhythm:        { jp: "リズム",           note: "名詞" },

  // 代名詞
  he:            { jp: "彼は",             note: "主語" },
  his:           { jp: "彼の",             note: "所有代名詞" },
  it:            { jp: "それ",             note: "代名詞" },
  nothing:       { jp: "何もない",         note: "代名詞" },

  // 助動詞
  could:         { jp: "〜できた",         note: "助動詞 can の過去形" },

  // 冠詞
  the:           { jp: "（定冠詞）",       note: "特定の名詞につける" },
  a:             { jp: "（不定冠詞）",     note: "不特定の名詞につける" },
  an:            { jp: "（不定冠詞）",     note: "母音始まりの語の前" },

  // 前置詞
  through:       { jp: "〜を通して",       note: "前置詞" },
  in:            { jp: "〜の中に",         note: "前置詞" },
  of:            { jp: "〜の",             note: "前置詞" },
  for:           { jp: "〜のために",       note: "前置詞" },
  by:            { jp: "〜によって",       note: "前置詞" },
  with:          { jp: "〜と一緒に",       note: "前置詞" },
  on:            { jp: "〜の上に",         note: "前置詞" },
  to:            { jp: "〜へ / 〜するために", note: "前置詞 / 不定詞" },

  // 接続詞・関係詞
  and:           { jp: "そして",           note: "接続詞" },
  not:           { jp: "〜ない",           note: "否定副詞" },
  where:         { jp: "〜するところ",     note: "関係副詞" },
};
