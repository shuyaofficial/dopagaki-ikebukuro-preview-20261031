# 音源の制作記録

| 用途 | 採用ファイル | 制作 |
|---|---|---|
| 正解 | correct/voice-v01-yes-20260908.mp3、voice-v02-yossha-20260908.mp3、voice-v03-susamajii-20260908.mp3 | 生成音声 |
| 不正解の音声 | wrong/voice-v05-nanishitenno-20260908.mp3、voice-v07-you-died-20260908.mp3、voice-v08-nandeyanen-20260908.mp3 | 生成音声 |
| 正解の効果音 | correct/chime.mp3、spark.mp3 | アプリ用の合成音 |
| 不正解の効果音 | wrong/soft-down.mp3 | アプリ用の合成音 |
| リーチ | reach/rise.mp3 | アプリ用の合成音 |
| ランクアップ（2026-10-19） | rankup/rankup-b1-v1.mp3 | アプリ用の合成音（数式だけで作った音。録音・曲・サンプルは不使用） |
| 連続日数が増えた日（2026-10-19） | streak/streak-e1-v1.mp3 | アプリ用の合成音（同上） |
| 通常の満点（金・虹・互換用） | instrumental/brass-and-bone.mp3、instrumental/golden-horizon-peak.mp3 | 本人提供のインスト2曲 |
| 10%の歌入り | premium/victory-crystal-from40.mp3 | 本人提供「勝利の結晶」（Gemini生成） |
| 勉強中の曲（2026-10-19。既定はオフ） | instrumental/study-loop-rs1-v1.mp3 | Runway（Lyria 3 Clip）で作ったインスト（区間13 RUNWAY-SOUND の R-S1）。8小節を切り出し、つなぎ目なしのループの形にした（−20 LUFS） |
| 満点の1段目の短い曲（2026-10-19。動画ごと） | instrumental/perfect-gold-pachinko-rp2-v1.mp3（金のパチンコ）、instrumental/perfect-gold-n4-rp1-v1.mp3（N4 の本の星空）、instrumental/perfect-rainbow-gacha-rp3-v1.mp3（虹） | Runway（Lyria 3 Clip）で作ったインスト（区間13 RUNWAY-SOUND）。山が動画の山に来る7秒を切り出し、−14.45 LUFS にそろえた |


標準の声は正解用3本・不正解用3本です。参照音声や声のクローンは使っていません。声はコンボ中も等速で再生します。

短い操作音はアプリ用に合成した音です。既存の録音・楽曲・サンプルは使用していません。

インスト2曲は約62.4秒・70.9秒の全編を使用しています。「勝利の結晶」は40秒から末尾までの約22.6秒を使用しています。

採用ファイルの長さとハッシュ（ファイルが同じか確かめる値）は `SOURCES.json` に記録しています。
