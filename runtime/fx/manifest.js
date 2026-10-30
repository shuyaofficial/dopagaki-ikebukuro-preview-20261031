/* 完成動画をGold/Rainbow/確定演出へ割り当てるローカルmanifest。
   ★ 2026-09-16: 動画には見出しを一切重ねない ★ 全ティアとも1段目＝動画（無音、
   gold/rainbowはそのティアの楽曲。premiumは歌入り確定動画）、動画が終わったら
   2段目＝プレミアの静止画＋歌（全ティア共通）。gold/rainbowにtitleDelayMsは不要
   （動画中は見出し自体を出さない＝視覚的に隠す実装のため）。 */
(function () {
  "use strict";

  // manifest自身を基準にすると、問題集/index.html と tools/fx-demo.html の
  // どちらから読んでも同じ動画へ着地する。currentScriptが無い環境だけ従来相対URLへ戻す。
  var manifestUrl = document.currentScript && document.currentScript.src;
  function asset(name) {
    if (manifestUrl && typeof URL === "function") return new URL(name, manifestUrl).href;
    return "assets/fx/" + name;
  }

  window.QUIZ_FX_MANIFEST = {
    guaranteed: {
      video: asset("guaranteed/yelena-voice-v9.mp4"),
      videoFit: "contain",
      videoHasTitle: false,
      videoHasAudio: true,
      audioGain: 1,
      // 10%当選のうち、さらに重み付きで1本を選ぶ（既定はvariants[0]＝イェレナ）。
      // 2026-10-19 関所R 3-1: 3本目に S04「髪をかき上げて最後の1タップ」（声「…ま、こんなもんかな」・7秒）を足した。
      //   2026-10-20 本人決定: 3本を均等に選ぶ。
      variants: [
        { video: asset("guaranteed/yelena-voice-v9.mp4"), weight: 1 / 3 },
        { video: asset("guaranteed/smirk-voice-v9.mp4"), weight: 1 / 3 },
        { video: asset("guaranteed/s04-hairtap-voice-v1.mp4"), weight: 1 / 3 },
      ],
    },
    premium: {image: asset("premium-victory.png") + "?v=20260907confetti", imageHasTitle:true},
    gold: {
      plate: null,
      burst: null,
      video: asset("gold-pachinko-v9.mp4"),
      videoFit: "contain",
      videoHasTitle: false,
      // 2026-10-18 区間13 FX: 金の1段目は、今の金と N4「問題集のページが星空」（7秒・無音）を半々で出す。
      // 選ぶ乱数は app.js の celebrate が同じ1つの roll から渡す（fanfare.js の pickIntroAssets）。
      // 先読みは video（＝今の金）の1本だけ。N4 の回は直 URL で読む（確定の smirk と同じ扱い）。
      // 2026-10-19 区間16 SOUND2（関所P Q14「満点の短い曲」）: 1段目の曲は、選ばれた動画に山を合わせた7秒の曲（music＝sfx の manifest の
      //   gold の中の1本の名前）。パチンコ → R-P2・N4 → R-P1。fanfare.js が選んだ1本の music を onIntroStart へ渡し、app.js の celebrate が鳴らす。
      //   鳴らすかどうか（消音・演出オフ）・2段目の歌・確定の段の声は前と同じ。動画そのものは変えていない。
      music: "../instrumental/perfect-gold-pachinko-rp2-v1.mp3",
      variants: [
        { video: asset("gold-pachinko-v9.mp4"), weight: 0.5, music: "../instrumental/perfect-gold-pachinko-rp2-v1.mp3" },
        { video: asset("n4-starbook-v1.mp4"), weight: 0.5, music: "../instrumental/perfect-gold-n4-rp1-v1.mp3" },
      ],
    },
    rainbow: {
      plate: null,
      burst: null,
      video: asset("rainbow-gacha-v9.mp4"),
      videoFit: "contain",
      videoHasTitle: false,
      // 2026-10-19 区間16 SOUND2: 虹の1段目の曲（山を動画に合わせた7秒の R-P3。sfx の manifest の rainbow の1本）。
      music: "../instrumental/perfect-rainbow-gacha-rp3-v1.mp3",
    },
    // 2026-10-30 区間T20 担当C2（本人だけに見える t-combo-fx の時だけ assets/dpg-t-combo.js が読む。満点の演出は読まない・先読みもしない）:
    //   50・100 コンボの1本目（Fal の FLUX 3 Max 720p で作った場面。関所9 Q2「50案2・100案3 を FLUX で」。出どころは CREDITS.md）。
    //   無音の動画に曲を重ねる（50＝星空の本の R-P1・100＝虹の R-P3 の末尾を8.04秒へ延長した専用版）。
    //   endTrim … 終わりの何秒手前で止めて残すか（0＝最後のコマまで流して、そのまま残す。白へ溶ける終わりが無いので）。
    combo: {
      50: { video: asset("combo/combo50-star-library-v1.mp4"), music: "../instrumental/perfect-gold-n4-rp1-v1.mp3", musicKind: "gold", endTrim: 0 },
      100: { video: asset("combo/combo100-constellation-v1.mp4"), image: asset("combo/combo100-constellation-poster-v1.webp"), music: "../instrumental/combo100-constellation-rp3-tail-v1.mp3", musicKind: "combo100", endTrim: 0 },
    },
  };
}());
