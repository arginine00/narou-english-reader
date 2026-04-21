/**
 * data.js
 * サンプル文章データ。
 * 実際のアプリでは syosetu.com からスクレイプ → 翻訳API → このフォーマットで保存する。
 *
 * 各オブジェクトのフィールド:
 *   tts     : Web Speech API に渡す英語テキスト（記号をシンプルに）
 *   jp      : 日本語原文
 *   tokens  : 表示用トークン列（単語・句読点）
 *   ci      : 各トークンが属するチャンク番号（-1 = 句読点、無視）
 *   chunks  : 文節対訳リスト { en, jp }
 */
let S = [
  {
    tts: "Kazuto opened his eyes slowly, greeted by the pale morning light filtering through the curtains.",
    jp: "カズトはゆっくりと目を開けた。淡い朝の光がカーテン越しに差し込んでいた。",
    tokens: ["Kazuto","opened","his","eyes","slowly",",","greeted","by","the","pale","morning","light","filtering","through","the","curtains","."],
    ci:     [0,       1,       1,    1,      2,       -1, 3,        3,   4,    4,      4,        4,       5,          5,        5,    5,          -1],
    chunks: [
      { en: "Kazuto",                         jp: "カズトは" },
      { en: "opened his eyes",                jp: "目を開けた" },
      { en: "slowly",                         jp: "ゆっくりと" },
      { en: "greeted by",                     jp: "〜に迎えられ" },
      { en: "the pale morning light",         jp: "淡い朝の光が" },
      { en: "filtering through the curtains", jp: "カーテン越しに差し込む" },
    ]
  },
  {
    tts: "A strange sensation lingered in his chest, the echo of a dream he could not quite grasp.",
    jp: "奇妙な感覚が胸の中に漂い続けた。掴みきれない夢の残響のようなものが。",
    tokens: ["A","strange","sensation","lingered","in","his","chest","—","the","echo","of","a","dream","he","could","not","quite","grasp","."],
    ci:     [0,  0,        0,          1,          2,   2,    2,      -1, 3,    3,    3,  3,  3,      4,   4,      4,    4,       4,      -1],
    chunks: [
      { en: "A strange sensation",          jp: "奇妙な感覚が" },
      { en: "lingered",                     jp: "漂い続けた" },
      { en: "in his chest",                 jp: "胸の中に" },
      { en: "the echo of a dream",          jp: "夢の残響が" },
      { en: "he could not quite grasp",     jp: "掴みきれない" },
    ]
  },
  {
    tts: "The room was silent, far too silent for the world he once knew.",
    jp: "部屋は静まり返っていた——かつて彼が知っていた世界にしては、静かすぎるほどに。",
    tokens: ["The","room","was","silent",",","far","too","silent","for","the","world","he","once","knew","."],
    ci:     [0,    0,      1,    1,        -1, 2,    2,    2,        3,    3,    3,      4,   4,      4,    -1],
    chunks: [
      { en: "The room",       jp: "部屋は" },
      { en: "was silent",     jp: "静まり返っていた" },
      { en: "far too silent", jp: "あまりに静かすぎた" },
      { en: "for the world",  jp: "世界にとって" },
      { en: "he once knew",   jp: "かつて知っていた" },
    ]
  },
  {
    tts: "He reached for his phone instinctively, only to find nothing on the desk where it usually sat.",
    jp: "反射的にスマートフォンへ手を伸ばしたが、いつもそこにあるはずの机には何もなかった。",
    tokens: ["He","reached","for","his","phone","instinctively",",","only","to","find","nothing","on","the","desk","where","it","usually","sat","."],
    ci:     [0,   1,         1,    1,    1,       2,               -1, 3,    3,   3,     3,        4,   4,    4,      5,      5,   5,         5,    -1],
    chunks: [
      { en: "He",                    jp: "彼は" },
      { en: "reached for his phone", jp: "スマートフォンへ手を伸ばした" },
      { en: "instinctively",         jp: "本能的に" },
      { en: "only to find nothing",  jp: "しかし何もなく" },
      { en: "on the desk",           jp: "机の上には" },
      { en: "where it usually sat",  jp: "いつもそこにあるはずの" },
    ]
  },
  {
    tts: "Outside, the city hummed with an unfamiliar rhythm, ancient and vast.",
    jp: "外では、見知らぬリズムで街が低く響いていた——古く、そして広大な音が。",
    tokens: ["Outside",",","the","city","hummed","with","an","unfamiliar","rhythm",",","ancient","and","vast","."],
    ci:     [0,          -1, 1,    1,      2,        3,     3,   3,           3,       -1, 4,      4,    4,    -1],
    chunks: [
      { en: "Outside",                   jp: "外では" },
      { en: "the city",                  jp: "街が" },
      { en: "hummed",                    jp: "低く響いた" },
      { en: "with an unfamiliar rhythm", jp: "見知らぬリズムで" },
      { en: "ancient and vast",          jp: "古く、広大な" },
    ]
  }
];
