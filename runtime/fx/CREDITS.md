# 満点演出の素材記録

Google Geminiで生成した既存の満点動画と、本人提供の確定動画を使用しています。

| ファイル | 用途 | 編集 |
|---|---|---|
| gold-compass-original.mp4 | 通常の金の満点演出 | 元のpeak動画をバイト単位でそのままコピー。10.005秒 |
| rainbow-original.mp4 | 虹の満点演出 | 元の完成到達動画をバイト単位でそのままコピー。10.005秒 |
| guaranteed/dopamine-original.mp4 | 10%歌入り当選時の確定演出 | 10.005秒全編。映像・音声ストリームを保持し、faststart配置のみ変更 |

映像のカット・再圧縮・クロップ・音声編集は行っていません。元動画に含まれる音声トラックも保持しています。金・虹の動画は独立した音楽と重ならないようミュート再生します。確定動画は設定音量×0.890225で原音を再生し、終了後に歌入り音楽を先頭から開始します。焼き込み済みの達成文字をそのまま表示し、HTML見出しは視覚的に隠して読み上げ用に残します。動きを減らす設定・読込失敗時の静止演出はアプリで表示します。

元動画・配信用コピーのSHA-256と選定記録: `design/audio-v2/video-sources.json`。以前の`*-app.mp4`は互換用に保持していますが、今回のmanifestからは参照しません。

生成プロンプト「羅針盤・逆転金航路」「千灯・虹星図」と、元プロジェクトの納品クリップREADMEに編集履歴があります。2026-09-04に記録を照合しました。元動画の生成日・利用プランはその記録に記載されていません。

確定動画の原本・パケットハッシュの一致・処理記録: `design/audio-v4/provenance.json`。閉じる・置き換え・読込失敗時は動画の音も停止します。

Googleの利用条件: https://policies.google.com/terms

## 2026-09-06 特別演出の静止画

旧`premium-victory.png`はCodex image_genで生成。既存の`design/character-v1/portrait.png`を参照し、同じキャラクターがお祝いする画像として作成しました。元画像と配信用コピーは同一です。10%当選時は確定動画の後にこの画像とHTMLの「全問正解！」を表示し、既存の歌入り曲を流します。通常の金・虹の動画は継続利用します。詳しい記録は`design/authoring-v6/README.md`。

## 2026-09-07 紙吹雪を採用

本人が選んだ `design/authoring-v7/victory-1.png` を `premium-victory.png` へ無加工で複製しました。キャラクターと「全問正解！」の文字は画像内にあります。HTML見出しは読み上げ用に残し、画像が読めない場合は表示します。登場動画と既存の歌入り曲、停止・消音の仕組みは継続利用します。

## 2026-09-16 v9 動画・BGMへ差し替え

| ファイル | 用途 | 編集 |
|---|---|---|
| gold-pachinko-v9.mp4 | 通常の金の満点演出 | A案（パチンコ確定）の映像をバイト単位でコピー。音声トラックは除去（無音）。5.17秒 |
| rainbow-gacha-v9.mp4 | 虹の満点演出 | C2案（溜め→解放のガチャ）の映像をバイト単位でコピー。音声トラックは除去（無音）。6.58秒 |
| guaranteed/yelena-voice-v9.mp4 | 10%確定演出の1本目（重み0.7。2026-10-19 から0.35・仮置き） | D2案（イェレナのセリフ）。映像はコピー、音声は本番基準へ再エンコード。6.58秒 |
| guaranteed/smirk-voice-v9.mp4 | 10%確定演出の2本目（重み0.3。2026-10-19 から0.15・仮置き） | E2案（にやけ顔のセリフ）。映像はコピー、音声は本番基準へ再エンコード。8.0秒 |
| guaranteed/s04-hairtap-voice-v1.mp4 | 10%確定演出の3本目（重み0.5・仮置き。2026-10-19 関所R） | S04「髪をかき上げて最後の1タップ」（声「…ま、こんなもんかな」）。Runway wan3（480p・7秒・声あり）を 768×1344 に書き出した物。映像はコピー、音声は基準より小さいのでゲイン 0 dB のまま AAC 192k。7.0秒 |

制作の流れ:
1. ChatGPT (image_gen) で6案（A〜F）の静止画スケッチを作成し、本人が構図を選定。
2. 選んだ構図をプロンプト化し、Runway MiniMax H3（768p）で動画化。
3. 確定演出の2本（D2/E2）は、Runwayで生成したLyria 3のBGMクリップとRunwayの効果音（reveal-impact-hit）を
   `design/celebration-v9/runway/mux-bgm.py` で合成。セリフの区間だけBGM音量を自動で下げる
   サイドチェイン方式（ffmpeg sidechaincompress）で、セリフと音楽が潰し合わないようにしています。
4. `design/celebration-v9/runway/adopt-media.sh` で本番へ採用:
   - gold/rainbow は映像ストリームを再圧縮せずコピーし、音声トラックを除去（金・虹は既存の
     インストゥルメンタルBGMと重ねてミュート再生するため）。
   - guaranteed の2本は映像ストリームを再圧縮せず、音声だけ定数ゲインで
     -14.45 LUFS / -2 dBTP（本番基準、`design/celebration-v9/runway/adopt-media.json`）へ揃えてAAC 192kへ再エンコード。
   - 金・虹の合流曲（instrumental/the-winning-note.mp3, instrumental/crest-of-the-sky.mp3）も
     同じ基準へ定数ゲインで揃え、MP3 192kで書き出し（`app/assets/sfx/CREDITS.md`参照）。

達成語の焼き込み文字は無く、HTMLの見出し（「全問正解」「完全制覇」）をそのまま重ねて表示します
（gold/rainbowはmanifestの`videoHasTitle:false`）。確定演出の2本は`variants`として重み付き抽選され、
どちらのセリフでも既存の停止・消音・フォールバックの仕組みをそのまま使います。

旧 `gold-compass-original.mp4` / `rainbow-original.mp4` / `guaranteed/dopamine-original.mp4` は
ファイルとして残していますが、現在のmanifestからは参照していません。

元動画・処理記録・SHA-256: `design/celebration-v9/runway/adopt-media.json`（`adopt-media.sh`で再現可能）。

## 2026-09-16 (2): 動画へテロップを重ねない・全ティア二段構成へ

達成語（「全問正解」「完全制覇」）のHTML見出しを動画の上に重ねる表示は廃止しました。
どのティアも二段構成です: 1段目＝そのティアの動画（gold/rainbowは無音＋ティアの
インストゥルメンタル、premiumはこれまでどおり歌入りの確定動画）→ 動画が終わったら
（失敗時／動きを減らす設定では1.5秒後）2段目＝全ティア共通でプレミアの静止画
（premium-victory.png）＋見出し「全問正解！」＋歌（victory-crystal）へ着地します。
gold/rainbowのmanifestから`titleDelayMs`を削除しました（動画中は見出しを表示しないため）。

## 2026-09-16 不採用素材の削除

本人の指示で、旧 gold-compass／rainbow／guaranteed/dopamine の動画、旧インストゥルメンタル2曲（brass-and-bone／golden-horizon-peak）、Gemini 試作（v8・v9）と Runway 第1回の不採用動画（B・F、C/D/E 初版）を削除。旧パイプライン `tools/build-celebration-media.mjs`／`adopt-celebration.mjs` も退役。記録（プロンプト・静止画・jobs.json・SOURCES.json）は残す。

## 2026-10-18 金の1段目に N4「問題集のページが星空」を足す（区間13 FX）

| ファイル | 用途 | 編集 |
|---|---|---|
| n4-starbook-v1.mp4 | 通常の金の満点演出の1段目（今の gold-pachinko-v9.mp4 と半々） | 元の動画の 0〜7.0 秒だけを使う。音声トラックは除去（無音）。768×1344 へ合わせて再圧縮。7.0 秒 |

- 出どころ: 本人が Google Gemini の「動画を作成」で作った動画（2026-10-18。縦 9:16・720×1280・24fps・10.0 秒・音あり）。
  動画の始めの1枚（もとにした静止画）は、本人の型の絵（pose-thumb の元）を添えて ChatGPT（image_gen）で作った絵（941×1672）。
- Gemini の動画には、見えない電子透かし **SynthID** が入っています（Google の説明では、切る・圧縮するなどの編集をしても残るように作られている）。
  透かしを消す処理はしていません（こちらに有無を確かめる道具は無いので、確かめてはいません）。
- 切った所: 0〜7.0 秒（元は 10.0 秒）。7 秒より後の「星座の線がもう一度画面いっぱいに広がる」所は使いません（本人の答え 関所O Q8）。
- 音: 元の音声トラック（AAC 48kHz）を消しました。金・虹の動画と同じく無音で再生し、曲は sfx の金の曲が鳴ります。
- 形: 768 幅へ拡大（lanczos）して上下 11px ずつ切り、今の動画と同じ 768×1344 に。24fps・H.264 High L3.2・yuv420p・faststart。
  最後の 0.3 秒（6.65〜6.95 秒）は、2段目（premium-victory.png の画面）の地の色 #FCFBF9 へフェード（紙の色のまま静止画へつなぐため）。
  色の札は元のまま（BT.709 の原色・BT.601 の行列・sRGB の曲線・tv の幅）。CRF 22・上限 4.5Mbps（今の金の平均）で、大きさは 2,780,638 バイト（今の金 2,925,568 バイト以下）。
- SHA-256: 元 `fcdb08ef2cf8f80477626a8b61de851386665c1ee92a4a66e6c06956b648fadd`（`N4_問題集のページが星空_gemini_1018.mp4`・6,280,650 バイト。端末の `素材/動画/` に置いた物）／
  配信用 `650224c55a5560e5834554499a0a59bc7065d86d48e24d5fa0517b9c75cb1657`。
- 作り直し方（ffmpeg 6.1）:
  `ffmpeg -i N4_問題集のページが星空_gemini_1018.mp4 -t 7.0 -an -vf "scale=768:1366:flags=lanczos,crop=768:1344:0:11,fade=t=out:st=6.65:d=0.3:color=0xFCFBF9" -c:v libx264 -profile:v high -level:v 3.2 -pix_fmt yuv420p -preset slow -crf 22 -maxrate 4500k -bufsize 9000k -colorspace smpte170m -color_primaries bt709 -color_trc iec61966-2-1 -color_range tv -movflags +faststart -map_metadata -1 n4-starbook-v1.mp4`
- 出し方: `manifest.js` の gold に `variants`（今の金 0.5・N4 0.5）。選ぶのは `fanfare.js` の pickIntroAssets（確定演出の70/30と同じ関数）で、
  乱数は `app.js` の celebrate が引く1つの roll を、金の幅（0.1〜0.55）の中の位置に直した物（introRollFor）。確定の割合（10%）・虹・2段目の静止画と歌・消音・動きを減らす設定はそのまま。
  先読みは今の金の1本だけ（N4 の回は直 URL で読む）。

## 2026-10-19 1段目の曲を動画ごとに（区間16 SOUND2・関所P Q14）

| 動画 | 1段目の曲（sfx の manifest） | 曲の山 |
|---|---|---|
| gold-pachinko-v9.mp4（5.17 秒） | instrumental/perfect-gold-pachinko-rp2-v1.mp3（R-P2・7.0 秒） | 1.8〜2.3 秒（絵の光 2.25 秒・こぶし 2.75 秒） |
| n4-starbook-v1.mp4（7.0 秒） | instrumental/perfect-gold-n4-rp1-v1.mp3（R-P1・7.0 秒） | 3.33〜3.8 秒（跳んで光がはじける 3.8 秒） |
| rainbow-gacha-v9.mp4（6.58 秒） | instrumental/perfect-rainbow-gacha-rp3-v1.mp3（R-P3・7.0 秒） | 3.43 秒（虹の柱 3.25 秒・跳ぶ 3.75 秒） |

- 出し方: `manifest.js` の gold（と variants の1本ずつ）・rainbow に `music`。`fanfare.js` が選んだ1本（pickIntroAssets の後）の music を `onIntroStart` に渡し、`app.js` の celebrate が `QuizSfx.play(ティア, { file: music })` で鳴らす。
- 変えていない所: 動画（ファイル・選び方・半々）・確定の段（10%・声入りの動画・70/30）・2段目の静止画と歌・消音と演出オフで鳴らない・効果音オフでは鳴る（2026-10-01 本人決定「満点の音楽は全問正解の演出の仲間」）・動きを減らす設定（動画を出さず 1.5 秒で2段目へ。曲は選ばれた1本）。
- 前の曲（the-winning-note.mp3・crest-of-the-sky.mp3）は消していない（sfx の manifest の perfect＝ティアの曲が無い時の予備に残る）。


## 2026-10-30 コンボの演出の 50・100 の場面（区間T20 担当C2・本人だけに見える t-combo-fx）

| ファイル | 使う所 | 中身 |
|---|---|---|
| combo/combo50-star-library-v1.mp4 | 50 コンボの1本目 | 案2「星の本棚が目を覚ます」。6.04 秒・音なし。曲は sfx の instrumental/perfect-gold-n4-rp1-v1.mp3（R-P1）を重ねる |
| combo/combo100-constellation-v1.mp4 | 100・200・300… コンボの1本目 | 案3「100の星の星座」。8.04 秒・音なし。曲は instrumental/perfect-rainbow-gacha-rp3-v1.mp3（R-P3）。この後に満点の10%の確定（声入り3本から1本）と「100コンボ」の札が続く |

- 出どころ: fal.ai の FLUX 3 Max（720p・9:16・音 off）で Fal係が作った動画（2026-10-30。本人の答え 関所9 Q2「50案2・100案3 を FLUX で」）。
  最初のコマ＝ChatGPT の絵コンテ（`納品/T17_コンボの演出/場面の案/img/C50_案2.png`・`C100_案3.png`）の1コマ目、最後のコマ＝4コマ目。額は 50 $0.255・100 $0.34（`作業記録/Falの台帳.md` #11・#12）。
  頼んだ文・作り方は `納品/T17_コンボの演出/動画/報告.md`。元の動画 `Fal_50_案2_1.mp4`（sha256 a28eaa96…）・`Fal_100_案3_1.mp4`（sha256 bfd7c99f…）。
- 形: Fal係が今の確定演出と同じ 768×1344・24コマ/秒・H.264 High・yuv420p・+faststart・音なしに書き出した `アプリ用_50.mp4`・`アプリ用_100.mp4` を、そのまま名前だけ変えて置いた
  （50: 2,198,036 バイト・sha256 12d449a4e1d51c05a6ed8dcd0d9ee9e0eb0b741f0dc3ba6621e0bccce2d032b5／100: 2,216,044 バイト・sha256 757aeee02d3925c2797191a5b54f036fb60568b9bb863bd513b50f1cbca8bba5）。
- 出し方: `manifest.js` の `combo`（満点の演出は読まない・ふだんの先読みもしない）。`dpg-t-combo.js` が段ごとに選び、`app.js` が段の5問前から先読みする。
  終わりは白へ溶けないので、最後のコマまで流してそのまま残す（endTrim 0）。
