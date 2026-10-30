/* ===========================================================================
   問題集 — assets/fanfare.js
   全問正解の金・虹演出。10%の歌入り当選時は確定動画を先に再生する。

   ★ #app の外（document.body 直下）に載せること ★
     app.js の render() は毎回 root.textContent = "" で #app を作り直す。
     中に置くと、演出の最中に同期やタイマーが1回 setState しただけで消える。
     index.html が #quizSyncSlot をフッタ（#app の外）へ出しているのと同じ理由。

   ★ 読み込み時にも play() 時にも、無い API を無条件に呼ばないこと ★
     tools/smoke.mjs の vm サンドボックスには setTimeout も
     requestAnimationFrame も document.body も無い。全部ガードを通し、
     使えない環境では play() が false を返すだけの no-op になる。

   ★ 既定は「止めるまで残す」（自動 dismiss を1本も置かない）★
     理由: 最後まで見たい／音も最後まで聞きたい（ユーザー要望 2026-09-02）。
     閉じる手段は「止める」ボタン・画面タップ・Esc/Enter/Space の3系統あり、
     背面は inert ＋ aria-hidden で隔離してあるので、閉じ忘れても誤操作は起きない。
     動画版は非ループなので、ended の後は最後のコマで静止したまま残る。
     歯車の「演出を自動で閉じる」を ON にしたときだけ、旧来どおり 3.5 秒／
     動画は終わってから 0.6 秒で閉じる。OFF のときも確定動画から本演出への遷移は行う。

   ★ 見た目は CSS が持つ（quiz.css の .qz-fanfare-*） ★
     ここは「どのクラスをいつ付けるか」しか知らない。差し替え用の画像・動画は
     assets/fx/manifest.js（任意・.gitignore）から読む。発注一式は
     動画生成依頼プロンプト（Gemini）/v2-分離キーフレーム/（旧: MacBook依頼/パチンコ演出/）にある。

   依存: window.QuizDom（el）、window.QuizPrefs（ON/OFF）、
         window.QUIZ_FX_MANIFEST（任意）。
   =========================================================================== */
(function () {
  "use strict";

  var Dom = window.QuizDom;
  if (!Dom) return;

  var el = Dom.el;

  // 見出しを遅らせられる上限。表示時間の上限ではない（演出は止めるまで消えない）。
  // これ以上遅らせると、動画が短いときに達成語が一度も出ないまま静止する。
  var TITLE_DELAY_MAX_MS = 2900;
  // muted autoplayでも初回キャッシュや通信で始まらない場合がある。待ってから
  // 動画を捨て、CSS＋HTMLへ戻す（結果文字まで一緒に遅らせない）。
  // ★ 700ms から 3000ms へ延ばした（2026-09-02）★
  //   演出は自動で消えないので、待つコスト＝「見出しが出るのが遅れる」だけ。
  //   逆に短すぎると、回線の遅い実機で毎回 CSS 版へ落ちて
  //   「動画の演出がいまだにできない」に見える。待つ方が損が小さい。
  var VIDEO_START_TIMEOUT_MS = 3000;
  // 開始待ちがこれを超えたら、見出しだけ薄く出して「動いている」ことを見せる。
  // 3秒間まっ暗なままだと、待たされているのか壊れたのか区別がつかない。
  var VIDEO_WAITING_HINT_MS = 1000;
  // 再生位置が4.5秒間進まない場合の保険。動画全体の長さは制限しない。
  // 10秒の元動画も最後まで再生し、停止した場合だけCSS版へ戻す。
  var VIDEO_STALL_TIMEOUT_MS = 4500;
  // ここから2つは「演出を自動で閉じる」が ON のときだけ使う（既定は OFF）。
  // CSS 版／フォールバック時に自動で閉じるまで。
  var AUTO_CLOSE_HOLD_MS = 3500;
  // 動画終了後。0 にすると達成見出しが出た瞬間に消えて、読む間が無くなる。
  var AUTO_CLOSE_AFTER_VIDEO_MS = 600;
  // 退場アニメの尺。CSS の .qz-fanfare--out と必ず揃えること
  // （ここだけ短いと、消える前に DOM が抜けてカクつく）。
  var OUT_MS = 320;
  // 粒子は一度きりの8個まで。全画面を埋める大量の点滅は避けつつ、祝福感は残す。
  var SPARK_COUNT = 8;
  // プレミアの2段目（「激アツ」→「プレミア」）までの待ち。manifest に
  // titleDelayMs があればそちらを使い、無いとき（CSS版・動画なし）だけこれ。
  // 0 にすると煽りが1フレームも見えず、2段にした意味が消える。
  var PREMIUM_TITLE_MS = 900;
  // T17: コンボの1本だけの回で、動画の終わりから何秒手前で止めて残すか（timeupdate は最大 0.25 秒おきなので、白へ溶け始める 0.33 秒より前で止まる長さ）。
  var COMBO_TAIL_S = 0.6;

  var canTime = typeof setTimeout === "function" && typeof clearTimeout === "function";
  var canMount = !!(typeof document !== "undefined" && document && document.body
    && typeof document.body.appendChild === "function");

  // いま出ている演出。多重再生を防ぐために持つ（2つ重なると読めない）。
  var active = null;
  var closing = false;
  var timers = [];
  var previousFocus = null;
  var isolatedNodes = [];
  var activeOnDismiss = null;
  var activeComboCleanup = null;
  // 直近に動画を諦めた理由。実機では「CSS 版が出た」ことしか見えないので、
  // 取得に失敗したのか・待ち時間が足りなかったのかを外から読めるようにする
  // （tools/fx-demo.html の status 欄）。
  var lastFallback = null;

  function clearTimers() {
    if (activeComboCleanup) { activeComboCleanup(); activeComboCleanup = null; }
    if (!canTime) { timers = []; return; }
    timers.forEach(function (t) { clearTimeout(t); });
    timers = [];
  }

  function later(fn, ms) {
    if (!canTime) return null;
    var timer = setTimeout(fn, ms);
    timers.push(timer);
    return timer;
  }

  function cancelLater(timer) {
    if (!canTime || timer == null) return;
    clearTimeout(timer);
    timers = timers.filter(function (item) { return item !== timer; });
  }

  function reducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  function assetsFor(tier) {
    var m = window.QUIZ_FX_MANIFEST;
    if (m == null || typeof m !== "object") return {};
    var t = m[tier];
    return (t != null && typeof t === "object") ? t : {};
  }

  function nonEmptyStr(v) { return typeof v === "string" && v !== ""; }

  // プレミアは専用アセットが無ければ金を流用する（クラスと見出しだけを差し替える）。
  // ★ 使ったティア名も返すこと ★ 先読み済みの object URL は tier をキーに
  //   積んである。premium のまま引くと外れて、金の動画を毎回取り直すことになる
  //   （実機では「プレミアのときだけ動画が出ない」に見える）。
  function resolveAssets(tier) {
    var own = assetsFor(tier);
    if (tier !== "premium") return { tier: tier, assets: own };
    var hasOwnAsset = !!firstVideoSrc(own) || nonEmptyStr(own.plate) || nonEmptyStr(own.burst) || nonEmptyStr(own.image);
    return hasOwnAsset ? { tier: tier, assets: own } : { tier: "gold", assets: assetsFor("gold") };
  }

  // guaranteed の variants から抽選する純関数。乱数は必ず引数で受ける
  // （テストからは roll を渡すだけで70/30の境目を検算できる。中で Math.random を
  //   直に呼ぶと、実行のたびに違う結果になり純関数のつもりが崩れる）。
  // weight は正の数であればよく、合計が1である必要はない（比率だけを見る）。
  // variants が無い／形式が不正なときは guaranteed をそのまま返す。
  // 2026-10-18 から金・虹の1段目（manifest.gold / rainbow の variants）も同じ関数で選ぶ。
  function pickIntroAssets(guaranteed, roll) {
    var g = (guaranteed != null && typeof guaranteed === "object") ? guaranteed : {};
    var variants = g.variants;
    var valid = Array.isArray(variants) && variants.length > 0 && variants.every(function (v) {
      return v != null && typeof v === "object" && nonEmptyStr(v.video)
        && typeof v.weight === "number" && isFinite(v.weight) && v.weight > 0;
    });
    if (!valid) return g;
    // roll が無い／範囲外のときは1本目（variants[0]）に倒す。
    var chosen = variants[0];
    if (typeof roll === "number" && isFinite(roll) && roll >= 0 && roll < 1) {
      var total = variants.reduce(function (sum, v) { return sum + v.weight; }, 0);
      var target = roll * total;
      var cumulative = 0;
      for (var i = 0; i < variants.length; i++) {
        cumulative += variants[i].weight;
        chosen = variants[i];
        if (target < cumulative) break;
      }
    }
    // variants キーは結果に残さない（video/videoFit/videoHasAudio/audioGain/videoHasTitle
    // だけを chosen で上書きする。weight は使わないが残っても buildVideo は読まない）。
    var merged = Object.assign({}, g, chosen);
    delete merged.variants;
    return merged;
  }

  // 動画の本命は1本目。配列は形式フォールバックなので、先読みは先頭だけを取る
  // （2本目まで取ると、使われない方の1.9MBを毎回ダウンロードすることになる）。
  function firstVideoSrc(assets) {
    var list = assets.video;
    if (nonEmptyStr(list)) return list;
    if (!Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) {
      if (nonEmptyStr(list[i])) return list[i];
    }
    return null;
  }

  /* --- 先読み ----------------------------------------------------------------
     ★ 動画は「演出が始まってから」取りに行くと間に合わない ★
       完成動画は 1.2〜1.9MB ある。play() の中で初めて取得を始めると、
       スマホ回線や初回アクセスでは開始待ちの間に再生が始まらず、毎回 CSS 版へ
       落ちる（＝「動画の演出がいまだにできない」2026-09-02 の報告）。
       iOS Safari は preload="auto" を無視する（play() まで取りに行かない）ので、
       <video> 任せにもできない。だから最初の問題を表示した時点で
       fetch → Blob → object URL まで済ませ、play() ではメモリ上の Blob を指す。
     取れなくても演出は止めない。従来どおり直 URL の <source> で再生する。 */
  // tier -> { src, objectUrl }。src を控えるのは、manifest が差し替わったときに
  // 古い object URL（＝別の動画）を出さないため。
  var preloaded = {};
  var preloadPromise = null;
  // 2026-10-30 T20: コンボの Fal の場面の先読み（app.js が段の5問前から呼ぶ。本人だけに見える 't-combo-fx' の時だけ）。
  //   ふだんの preload（満点の4本）とは別。取りに行かない決まりは preload と同じ（動きを減らす・演出オフ・消音・通信を節約する設定）。
  var comboLoading = {};
  function preloadCombo(key, src) {
    try {
      if (!nonEmptyStr(key) || !nonEmptyStr(src) || comboLoading[key]) return false;
      if (preloaded[key] && preloaded[key].src === src) return true;
      var canFetch = typeof fetch === "function" && typeof Blob === "function"
        && typeof URL !== "undefined" && URL && typeof URL.createObjectURL === "function";
      if (!canFetch || reducedMotion() || saveDataOn()) return false;
      if (window.QuizPrefs && typeof window.QuizPrefs.get === "function" && !fanfareAllowed(window.QuizPrefs.get())) return false;
      comboLoading[key] = true;
      fetch(src).then(function (res) {
        if (!res || !res.ok) throw new Error("combo video fetch failed");
        return res.blob();
      }).then(function (blob) {
        preloaded[key] = { src: src, objectUrl: URL.createObjectURL(blob) };
      }).catch(function () { /* 直 URL で再生する */ }).then(function () { comboLoading[key] = false; });
      return true;
    } catch (e) {
      return false;
    }
  }

  // 演出を出してよいか。「全問正解の演出」がONで、共通消音（audioMuted）ではないとき。
  function fanfareAllowed(prefs) {
    return !!(prefs && prefs.fanfareEnabled && !prefs.audioMuted);
  }

  // 2026-10-29 区間T17 担当C2（本人だけに見える 't-combo-fx'。app.js が札を見て opts.combo を渡す時だけ）: コンボの演出。
  //   opts.combo = { level, label（「10コンボ」）, solo（問題の途中＝満点の2段目へ進まない）, seq（100 の2本目以降）, final（100 の最後の札）, onNext }
  //   opts.combo が無い時（札が無い・満点だけの回）は、ここから下の分かれ道を1つも通らない（今の演出のまま）。
  function comboOf(o) {
    var c = o && o.combo;
    return (c != null && typeof c === "object" && nonEmptyStr(c.label)) ? c : null;
  }

  // 通信を節約する設定・極端に遅い回線（preload と同じ見方）。コンボの演出は、この時は動画を取りに行かず最後の形だけにする。
  function saveDataOn() {
    try {
      var conn = (typeof navigator !== "undefined" && navigator)
        ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection) : null;
      return !!(conn && (conn.saveData === true || conn.effectiveType === "2g" || conn.effectiveType === "slow-2g"));
    } catch (e) {
      return false;
    }
  }

  function preload() {
    // ★ 冪等 ★ 毎問呼ばれる前提なので、2回目以降は同じ Promise を返すだけ。
    if (preloadPromise) return preloadPromise;
    try {
      var canFetch = typeof fetch === "function" && typeof Blob === "function"
        && typeof URL !== "undefined" && URL && typeof URL.createObjectURL === "function";
      // 取りに行けない環境と「動きを減らす」設定では、そもそも動画を使わない。
      // ここは記憶しない（環境が変わったら次の呼び出しでやり直せるようにする）。
      if (!canFetch || reducedMotion()) return Promise.resolve();
      // 演出を切っている人には1バイトも取りに行かない。preload は出題のたびに
      // 呼ばれるが fanfareEnabled を見ていなかったので、演出OFFでも数MB取っていた。
      // ★ ここも記憶しない ★ 設定を戻した次の呼び出しから取りに行けるようにする。
      // 消音中（出題中のスピーカー・2026-10-04 本人決定）も演出は出さないので取りに行かない。解除したら次の出題から取る。
      if (window.QuizPrefs && typeof window.QuizPrefs.get === "function"
        && !fanfareAllowed(window.QuizPrefs.get())) return Promise.resolve();
      // 通信を節約する設定・極端に遅い回線では取りに行かない。動画が無くても
      // CSS 版の演出は出るので、演出のために数MBを黙って使わない方を選ぶ。
      // ★ navigator が無い文脈（tools/smoke.mjs の vm）でも例外にしないこと ★
      var conn = (typeof navigator !== "undefined" && navigator)
        ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection) : null;
      if (conn && (conn.saveData === true
        || conn.effectiveType === "2g" || conn.effectiveType === "slow-2g")) {
        return Promise.resolve();
      }
      // premium は専用動画を置いたときだけ取りに行く（無ければ firstVideoSrc が
      // null を返して即 resolve するので、常に金を流用する構成でも増えない）。
      // guaranteed（10%の確定演出）も対象に入れる。ここを外していたぶん、一番の
      // 当たりを引いた初回だけ 2MB 前後を再生開始と同時に取りに行き、細い回線では
      // 3秒で見切られて音もセリフも無い CSS 版へ落ちていた。
      // ★ 取るのは variants[0]（重み0.7）の1本だけ ★ buildVideo の一致判定は
      //   preloaded[tier].src === srcs[0] なので、smirk 当選の30%は従来どおり直URL。
      var jobs = ["gold", "rainbow", "premium", "guaranteed"].map(function (tier) {
        var src = firstVideoSrc(assetsFor(tier));
        if (!src) return Promise.resolve();
        return fetch(src).then(function (res) {
          if (!res || !res.ok) throw new Error("fx video fetch failed");
          return res.blob();
        }).then(function (blob) {
          preloaded[tier] = { src: src, objectUrl: URL.createObjectURL(blob) };
        }).catch(function () { /* 直 URL で再生する。演出は止めない */ });
      });
      preloadPromise = Promise.all(jobs).then(function () { });
      return preloadPromise;
    } catch (e) {
      // 例外は外へ出さない（呼び出し側は結果を待たない＝握り潰す先が無い）。
      return Promise.resolve();
    }
  }

  /* --- パーツ ---------------------------------------------------------------- */
  // 背景の放射バースト。納品画像があればそれを、無ければ CSS の
  // repeating-conic-gradient（quiz.css 側）をそのまま使う。
  function buildBurst(assets) {
    var node = el("div", { class: "qz-fanfare__burst", "aria-hidden": "true" });
    if (nonEmptyStr(assets.burst)) {
      node.classList.add("qz-fanfare__burst--asset");
      // URL が失敗しても CSS の静止バーストを下層に残す。
      node.style.setProperty("--qz-fx-burst-image", 'url("' + assets.burst + '")');
    }
    return node;
  }

  // 稲妻。stroke-dashoffset で描く（DESIGN.md のチェックマーク描画と同じ手法）。
  // 左右対称に散らすと「放射の中心が1点にある」ことが伝わる。
  var BOLTS = [
    "M50,50 L34,30 L41,29 L26,8",
    "M50,50 L66,30 L59,29 L74,8",
    "M50,50 L32,64 L39,66 L22,86",
    "M50,50 L68,64 L61,66 L78,86",
    "M50,50 L22,46 L28,42 L4,36",
    "M50,50 L78,54 L72,58 L96,64",
  ];

  function buildBolts() {
    var svg = document.createElementNS
      ? document.createElementNS("http://www.w3.org/2000/svg", "svg")
      : null;
    // createElementNS が無い環境（smoke のシム）では稲妻だけ省く。
    // 演出全体を諦めるより、出せる層だけ出す方が壊れ方として穏やか。
    if (!svg) return null;
    svg.setAttribute("class", "qz-fanfare__bolts");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    svg.setAttribute("aria-hidden", "true");
    BOLTS.forEach(function (d, i) {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      p.setAttribute("class", "qz-fanfare__bolt");
      // 1本ずつ遅らせると「走った」ように見える。同時だと1枚の絵になる。
      p.style.animationDelay = (60 + i * 45) + "ms";
      svg.appendChild(p);
    });
    return svg;
  }

  // 火花。角度と距離を CSS 変数で渡し、動きは CSS に任せる。
  // JS でアニメーションを回すと、演出中に解答処理が走ったときにカクつく。
  function buildSparks() {
    var wrap = el("div", { class: "qz-fanfare__sparks", "aria-hidden": "true" });
    for (var i = 0; i < SPARK_COUNT; i++) {
      var s = el("span", { class: "qz-fanfare__spark" });
      var angle = (360 / SPARK_COUNT) * i + (Math.random() * 12 - 6);
      s.style.setProperty("--a", angle + "deg");
      s.style.setProperty("--d", (36 + Math.random() * 30) + "vmin");
      s.style.setProperty("--delay", Math.round(Math.random() * 260) + "ms");
      s.style.setProperty("--size", (5 + Math.random() * 7) + "px");
      wrap.appendChild(s);
    }
    return wrap;
  }

  // 中央のプレート。達成見出しだけをHTMLで残す。
  // 問題数はセッションごとに変わるため、分数や固定点数は祝福画面へ出さない。
  // 任意画像は装飾に限定し、読み込み失敗や色だけの区別で意味が消えないようにする。
  function buildPlate(assets, vm) {
    var parts = [];
    if (nonEmptyStr(assets.plate)) {
      parts.push(el("img", {
        class: "qz-fanfare__plate-img", src: assets.plate, alt: "", "aria-hidden": "true",
      }));
    }
    parts.push(el("h2", { id: "qz-fanfare-title", class: "qz-fanfare__title", text: vm.title }));
    return el("div", { class: "qz-fanfare__plate" }, parts);
  }

  // 配列は同じ動画の形式フォールバック。焼き込み文字がある元動画は
  // videoHasTitleでHTML見出しを視覚的に隠し、読み上げと失敗時の表示を残す。
  function buildVideo(assets, tier) {
    var list = assets.video;
    var srcs = nonEmptyStr(list) ? [list] : (Array.isArray(list) ? list.filter(nonEmptyStr) : []);
    if (srcs.length === 0) return null;
    // 先読み済みなら object URL 1本だけにする。拡張子が無いので type を明示しないと、
    // ブラウザが中身を判定できずに source を飛ばすことがある。
    var hit = preloaded[tier];
    var preloadedSrc = (hit && hit.objectUrl && hit.src === srcs[0]) ? hit.objectUrl : null;
    if (preloadedSrc) srcs = [preloadedSrc];
    var videoClass = "qz-fanfare__video";
    if (assets.videoFit === "contain") videoClass += " qz-fanfare__video--contain";
    var prefs = window.QuizPrefs && window.QuizPrefs.get();
    // 音入りの動画（10% の確定演出）は、演出が出ている＝演出ON なら音を出す。効果音・声の設定は見ない
    // （2026-10-01 本人決定: 満点演出の音は全部「全問正解の演出」の仲間。前は効果音OFFで無音だった）。全体の消音だけは効く。
    var withSound = assets.videoHasAudio === true && !!(prefs && !prefs.audioMuted);
    var volume = prefs && typeof prefs.sfxVolume === "number" && isFinite(prefs.sfxVolume)
      ? Math.max(0, Math.min(1, prefs.sfxVolume)) : 1;
    var v = el("video", {
      class: videoClass, "aria-hidden": "true",
      autoplay: true, muted: !withSound, playsInline: true,
    });
    // 属性でも入れておく（プロパティ代入だけだと iOS がインライン再生しないことがある）。
    if (!withSound) v.setAttribute("muted", "");
    v.volume = volume * (typeof assets.audioGain === "number" ? Math.max(0, Math.min(1, assets.audioGain)) : 1);
    v.setAttribute("playsinline", "");
    srcs.forEach(function (src) {
      v.appendChild(el("source", preloadedSrc ? { src: src, type: "video/mp4" } : { src: src }));
    });
    return v;
  }

  // 読み上げとTab移動が背面へ抜けないよう、永続している #app / footer だけを
  // 一時的に隔離する。元の属性値を保存し、必ず復元する。
  function isolateBackground(overlay) {
    isolatedNodes = [];
    if (!document.body || !document.body.children) return;
    var children = Array.prototype.slice.call(document.body.children);
    children.forEach(function (node) {
      if (node === overlay || !node || typeof node.setAttribute !== "function") return;
      var aria = typeof node.getAttribute === "function" ? node.getAttribute("aria-hidden") : null;
      isolatedNodes.push({ node: node, inert: !!node.inert, ariaHidden: aria });
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    });
  }

  function releaseBackground() {
    isolatedNodes.forEach(function (item) {
      var node = item.node;
      if (!node) return;
      node.inert = item.inert;
      if (item.ariaHidden == null) {
        if (typeof node.removeAttribute === "function") node.removeAttribute("aria-hidden");
      } else if (typeof node.setAttribute === "function") {
        node.setAttribute("aria-hidden", item.ariaHidden);
      }
    });
    isolatedNodes = [];
  }

  function restoreFocus() {
    var target = previousFocus;
    previousFocus = null;
    // 結果へ遷移した操作子は render() で既に消えている。その場合は、背面を
    // 復元してから結果見出しへ着地し、読み上げ位置をページ先頭へ戻す。
    var targetGone = !target || target === document.body || target.isConnected === false;
    if (targetGone && typeof document.querySelector === "function") {
      target = document.querySelector('[data-role="result-title"]');
    }
    if (target && typeof target.focus === "function") {
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
  }

  function notifyDismiss() {
    var callback = activeOnDismiss;
    activeOnDismiss = null;
    if (typeof callback === "function") {
      try { callback(); } catch (e) { /* 演出の後始末で結果画面を壊さない */ }
    }
  }

  /* --- 開閉 ------------------------------------------------------------------ */
  function stopVideo(node) {
    if (!node || typeof node.querySelector !== "function") return;
    var video = node.querySelector("video");
    if (video && typeof video.pause === "function") {
      try { video.pause(); } catch (e) { /* 非対応のテスト環境でも後始末を続ける */ }
    }
  }

  function dismiss() {
    if (!active || closing) return;
    var node = active;
    closing = true;
    clearTimers();
    stopVideo(node);
    // ★ 演出を止めたら音も止める ★
    //   演出はもう自動で消えないので、ここへ来るのは利用者が止めたときだけ。
    //   全問正解音は実測で16〜37秒ある。ここで止めないと、画面が結果へ戻ってから
    //   最大33秒鳴り続ける。「演出が消えたのに音だけ残る」は祝っているというより、
    //   消し方の分からない通知音に聞こえる。止めずに眺めている間は鳴り続けてよい。
    //   Sfx を任意依存として引くのは、fanfare 単体（tools/fx-demo.html）でも動かすため。
    //   onDismiss 側でも止めるが、stop は冪等なので二重に呼んで構わない。
    if (window.QuizSfx && typeof window.QuizSfx.stopCelebration === "function") {
      window.QuizSfx.stopCelebration(true);
    } else if (window.QuizSfx && typeof window.QuizSfx.stop === "function") {
      window.QuizSfx.stop("perfect", true);
    }
    notifyDismiss();
    if (typeof document.removeEventListener === "function") {
      document.removeEventListener("keydown", onKey);
    }
    node.classList.add("qz-fanfare--out");
    var remove = function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      if (active === node) active = null;
      closing = false;
      releaseBackground();
      restoreFocus();
    };
    // 退場アニメを待ってから外す。待てない環境では即座に外す
    // （残したまま操作不能になる方が、演出が飛ぶよりずっと悪い）。
    if (canTime) later(remove, OUT_MS); else remove();
  }

  // T17: コンボの演出の［次の問題へ］。閉じて、背面の隔離をすぐ外してから進む（退場の 320ms を待つと、次の問題へフォーカスが置けない）。
  //   閉じた後のフォーカスは戻さない（次の問題の見出しへ app.js の render が置く）。
  function nextFromCombo(go) {
    previousFocus = null;
    dismiss();
    releaseBackground();
    if (typeof go === "function") {
      try { go(); } catch (e) { /* 進めなくても演出は閉じている */ }
    }
  }

  function onKey(e) {
    if (!e) return;
    if (e.key === "Tab") {
      if (typeof e.preventDefault === "function") e.preventDefault();
      if (active && typeof active.querySelector === "function") {
        var buttons = typeof active.querySelectorAll === "function"
          ? Array.prototype.slice.call(active.querySelectorAll("button"))
          : [active.querySelector('[data-role="fanfare-close"]')];
        buttons = buttons.filter(function (button) { return button && !button.disabled; });
        var index = buttons.indexOf(document.activeElement);
        var next = buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length];
        if (next && typeof next.focus === "function") next.focus({ preventScroll: true });
      }
      return;
    }
    if (e.key === "Escape") dismiss();
    else if ((e.key === "Enter" || e.key === " ")
      && !(e.target && String(e.target.tagName).toLowerCase() === "button")) dismiss();
  }

  // tier: "gold"（ブロック・練習・記録なし解き直しの満点） /
  //       "rainbow"（記録対象セッションの出題を丸ごと満点）/
  //       "premium"（金のうち確率で昇格した回。演出だけが変わる）
  // 虹＝確定 はパチンコの作法。ここでは「その回だけ満点」と「全部満点」の差に当てている。
  // プレミアだけ見出しが2段（煽り→確定）。1段だと「金と何が違うのか」が伝わらない。
  // opts.titleTier（任意）は見出しだけを決める。ふだんの満点で虹の映像が出た回は
  // tier="rainbow"・titleTier="gold" にして、映像は虹・見出しは「全問正解」のままにする。
  // 無ければ tier で決める（従来どおり）。
  function viewModelOf(opts) {
    var tier = opts.tier === "rainbow" ? "rainbow"
      : (opts.tier === "premium" ? "premium" : "gold");
    var titleTier = opts.titleTier === "rainbow" || opts.titleTier === "premium" || opts.titleTier === "gold"
      ? opts.titleTier : tier;
    return {
      tier: tier,
      title: titleTier === "rainbow" ? "完全制覇" : (titleTier === "premium" ? "激アツ" : "全問正解"),
      titleLate: titleTier === "premium" ? "プレミア" : null,
    };
  }

  // opts.introRoll は guaranteed:true のときだけ意味を持つ（variants の抽選用）。
  // そのまま playStage → pickIntroAssets へ渡す（2026-10-18 から金・虹の1段目の variants にも使う）。
  // ★ 2026-09-16: 全ティアが「1段目＝動画・2段目＝プレミア画像＋歌」の二段構成 ★
  //   1段目に動画があるティアだけ isIntro にする（gold/rainbow は自分の動画、
  //   premium は従来どおり manifest.guaranteed）。動画が無いティア（manifest 未設置）は
  //   従来どおり単段のまま（resolveAssets(tier) を直に見せる旧挙動を保つ）。
  function play(opts) {
    var o = (opts != null && typeof opts === "object") ? opts : {};
    if (o.guaranteed !== true) return playStage(o, false);
    var manifest = window.QUIZ_FX_MANIFEST || {};
    // T17: コンボだけの演出（solo・100）は、動きを減らす設定・通信を節約する設定では最後の形だけ（動画を取らない・段を飛ばす）。
    //   満点とまとめた 10・50（solo でない）は、満点の演出の今の決まりのまま。
    var combo = comboOf(o);
    if (combo && (combo.solo || combo.final) && (reducedMotion() || saveDataOn())) {
      o.__comboStill = true;
      if (combo.final) { o.__comboFinal = true; o.tier = "rainbow"; return playStage(o, false); }
      return playStage(o, true);
    }
    var tier = viewModelOf(o).tier;
    var isIntro = tier === "premium"
      ? !!manifest.guaranteed
      : !!firstVideoSrc(resolveAssets(tier).assets);
    return playStage(o, isIntro);
  }

  function playStage(opts, isIntro) {
    var o = (opts != null && typeof opts === "object") ? opts : {};
    if (!canMount) return false;
    // 消音中は満点演出の画面そのものを出さない（保存している fanfareEnabled は変えない）。
    if (window.QuizPrefs && !fanfareAllowed(window.QuizPrefs.get())) return false;
    // ★ 設定はこの回の開始時に1度だけ読む ★
    //   出ている最中に歯車で切り替えられても、その演出の閉じ方は変えない。
    //   途中で挙動が変わると「押していないのに消えた／消えなくなった」に見える。
    var autoClose = !!(window.QuizPrefs && window.QuizPrefs.get().fanfareAutoClose);

    // 多重playで古い閉じるボタンへフォーカス元がすり替わらないよう、最初に
    // 開いたときの操作子を保持する。
    var focusBefore = previousFocus || ((typeof document !== "undefined" && document.activeElement)
      ? document.activeElement : null);

    // 出ている最中にもう1回来たら、前のを畳んでから出す。重ねると両方読めない。
    if (active) {
      var stale = active;
      active = null;
      closing = false;
      clearTimers();
      stopVideo(stale);
      if (typeof document.removeEventListener === "function") {
        document.removeEventListener("keydown", onKey);
      }
      notifyDismiss();
      if (stale.parentNode) stale.parentNode.removeChild(stale);
      releaseBackground();
    }

    previousFocus = focusBefore;

    var vm = viewModelOf(o);
    // 視覚的には動画中ずっと隠れている（qz-fanfare--video-has-title）。フォールバック時の
    // 表示と読み上げ用に残す見出しなので、達成語そのものではなく汎用の煽り文にする。
    // premium だけ「特別演出」（確定動画は達成語と無関係）。gold/rainbow はティア語のまま
    // （どのみち隠れているが、フォールバック時の読み上げ・表示は達成語の方が自然）。
    if (isIntro) {
      if (vm.tier === "premium") vm.title = "特別演出";
      vm.titleLate = null;
    }
    // T17: コンボの段。comboMore … 100 の続き（2本目）がある／stayAtEnd … 10・50 の1本だけで、終わっても満点の2段目へ進まず最後のコマで残る。
    var combo = comboOf(o);
    var comboFinal = !!(combo && o.__comboFinal === true);
    var comboCinema = !!(combo && (combo.level === 50 || combo.level === 100));
    var comboMore = !!(combo && isIntro && Array.isArray(combo.seq) && (o.__comboIndex || 0) < combo.seq.length);
    var stayAtEnd = !!(combo && isIntro && combo.solo && !comboMore && !combo.final);
    if (combo && (combo.solo || combo.final)) {
      vm.title = comboFinal && combo.final && nonEmptyStr(combo.final.title) ? combo.final.title : combo.label;
      vm.titleLate = null;
    }
    // 1段目（イントロ）は「そのティアの動画」。2段目（advance 経由）は全ティア共通で
    // プレミアの静止画＋歌（既存のイラストモード）へ着地する。動画が無いティアの単段
    // 呼び出し（旧挙動）だけは、これまでどおり resolveAssets(tier) をそのまま見せる。
    var resolved;
    if (comboFinal) {
      // 100 の終幕は DpgComboCinema が星座の静止画と数字を置く。動画は追加しない。
      resolved = { tier: vm.tier, assets: {} };
    } else if (isIntro && combo && o.comboStage && nonEmptyStr(o.comboStage.video)) {
      // 2026-10-30 T20: コンボの段の1本（Fal の場面。fx/manifest.js の combo）。先読みの鍵は "combo-<段>"（preloadCombo）。
      resolved = {
        tier: "combo-" + combo.level,
        assets: {
          video: o.comboStage.video, videoFit: "contain", videoHasTitle: false,
          music: nonEmptyStr(o.comboStage.music) ? o.comboStage.music : null,
          musicKind: nonEmptyStr(o.comboStage.musicKind) ? o.comboStage.musicKind : null,
          endTrim: typeof o.comboStage.endTrim === "number" ? o.comboStage.endTrim : null,
        },
      };
    } else if (isIntro) {
      resolved = vm.tier === "premium"
        ? { tier: "guaranteed", assets: pickIntroAssets(window.QUIZ_FX_MANIFEST.guaranteed, o.introRoll) }
        : resolveAssets(vm.tier);
      // 2026-10-18 区間13 FX: 金・虹の1段目も variants があれば同じ抽選で1本を選ぶ（金＝今の金と N4 を半々）。
      //   roll は app.js がそのティアの幅の中の位置（0〜1）に直した o.introRoll。variants が無いティア（今の虹）は
      //   pickIntroAssets がそのまま返すので前と同じ。tier はそのまま（先読みの一致は buildVideo の src の比べで見る）。
      if (vm.tier !== "premium") resolved = { tier: resolved.tier, assets: pickIntroAssets(resolved.assets, o.introRoll) };
    } else if (o.__afterIntro === true) {
      resolved = { tier: "premium", assets: assetsFor("premium") };
    } else {
      resolved = resolveAssets(vm.tier);
    }
    var assets = resolved.assets;
    var still = reducedMotion() || (!!combo && o.__comboStill === true);
    var illustration = !isIntro && nonEmptyStr(assets.image);
    if(illustration){vm.title="全問正解！";vm.titleLate=null;}

    // ★ 動画があるときは動画だけ ★（要望 2026-09-02「SVG の画像は無しで動画のみでいい」）
    //   放射・稲妻・火花の CSS/SVG 層は、動画が無いとき（reduce・manifest 無し）と、
    //   動画が始まらない／壊れて CSS 版へ落ちたとき（useVideoFallback）にだけ敷く。
    //   HTML の達成見出しと「止める」ボタンは動画の上に残す（読み上げと操作のため）。
    var video = (still || illustration) ? null : buildVideo(assets, resolved.tier);
    var layers = [];
    if(illustration){layers.push(el("img",{class:"qz-fanfare__victory-image",src:assets.image,alt:"虹色のキャラクターが両手を上げてお祝い"}));}
    else if (video) {
      layers.push(video);
    } else {
      layers = layers.concat(buildDecorations());
    }
    var stageChildren = [buildPlate(assets, vm)];
    if (comboFinal && combo.final && nonEmptyStr(combo.final.sub)) {
      stageChildren[0].appendChild(el("p", { class: "qz-fanfare__sub", text: combo.final.sub }));
    }
    if (!isIntro && !illustration && vm.tier === "premium" && !(video && assets.videoHasTitle === true)) {
      stageChildren.push(el("div", { class: "dpg-fx-reels", "aria-hidden": "true" }, [
        el("span", { text: "7" }), el("span", { text: "7" }), el("span", { text: "7" }),
      ]));
    }
    layers.push(el("div", { class: "qz-fanfare__stage" }, stageChildren));
    // ラベルは「閉じる」ではなく「止める」。閉じるだけだと音が残ると読めるが、
    // 実際には音も一緒に止まる。何が起きるかを言葉の側で合わせる。
    var closeButton = el("button", {
      class: "qz-fanfare__close", type: "button",
      dataset: { role: "fanfare-close" },
      text: "止める", onclick: dismiss,
    });
    if (combo) {
      // T17: 下に「10コンボ」の字と［止める］［次の問題へ］を縦に積む（狭い幅でも重ならない）。
      //   ［次の問題へ］は問題の途中の回だけ（app.js が onNext を渡す）。押すと演出を閉じて、そのまま次の問題へ進む。
      var dock = [];
      if (!comboFinal) {
        dock.push(el("p", { class: "dpg-cfx-label", id: "dpg-cfx-label", "aria-hidden": combo.solo ? "true" : "false", text: combo.label }));
      }
      var acts = [closeButton];
      if (typeof combo.onNext === "function") {
        acts.push(el("button", {
          class: "dpg-cfx-next", type: "button",
          dataset: { role: "fanfare-next" },
          text: "次の問題へ",
          onclick: function (event) {
            if (event && typeof event.stopPropagation === "function") event.stopPropagation();
            if (closing || active !== overlay) return;
            nextFromCombo(combo.onNext);
          },
        }));
      }
      dock.push(el("div", { class: "dpg-cfx-actions" }, acts));
      layers.push(el("div", { class: "dpg-cfx-dock" }, dock));
    } else {
      layers.push(closeButton);
    }

    var managedVideo = !!video && canTime;
    var videoClass = illustration ? " qz-fanfare--illustration" : video ? " qz-fanfare--has-video" : "";
    if (illustration && assets.imageHasTitle === true) videoClass += " qz-fanfare--image-has-title";
    if (managedVideo) videoClass += " qz-fanfare--video-pending";
    if (video && assets.videoFit === "contain") videoClass += " qz-fanfare--video-contained";
    // 動画に達成語が焼き込んである納品物では、HTML の見出しを視覚的に伏せる
    // （読み上げからは外さない。aria-labelledby がこの見出しを指しているため）。
    // ★ クラスは外さない ★ 動画が失敗した回は CSS 側が
    //   .qz-fanfare--video-fallback との組み合わせで自動的に効かなくなる。
    if (video && (assets.videoHasTitle === true || isIntro)) videoClass += " qz-fanfare--video-has-title";
    if (combo) {
      videoClass += " qz-fanfare--combo qz-fanfare--combo-" + combo.level
        + (combo.solo || combo.final ? " qz-fanfare--combo-solo" : "") + (comboFinal ? " qz-fanfare--combo-final" : "")
        + (comboCinema ? " qz-fanfare--combo-cinema" : "");
    }
    var overlay = el("div", {
      class: "qz-fanfare qz-fanfare--" + vm.tier
        + (isIntro ? " qz-fanfare--intro" : "") + (still ? " qz-fanfare--still" : "") + videoClass,
      role: "dialog", "aria-modal": "true",
      "aria-labelledby": "qz-fanfare-title",
      dataset: {
        role: "fanfare", tier: vm.tier,
        // guaranteed = プレミア1段目（歌入り確定動画）／video = gold・rainbow 1段目
        // （無音・ティア楽曲）／celebration = 全ティア共通の2段目（画像＋歌）。
        phase: isIntro ? (vm.tier === "premium" ? "guaranteed" : "video") : "celebration",
      },
      // どこを触っても閉じる。演出中に次の操作をしたい人を待たせない。
      onclick: dismiss,
    }, layers);
    if (combo) {
      overlay.setAttribute("data-combo", String(combo.level));
      if (!combo.solo && !comboFinal) overlay.setAttribute("aria-describedby", "dpg-cfx-label");
    }

    if (illustration) layers[0].addEventListener("error", function () {
      overlay.classList.remove("qz-fanfare--image-has-title");
      layers[0].hidden = true;
    });

    var titleDelay = 0;
    if (managedVideo && typeof assets.titleDelayMs === "number" && isFinite(assets.titleDelayMs)) {
      titleDelay = Math.max(0, Math.min(assets.titleDelayMs, TITLE_DELAY_MAX_MS));
    }

    var videoState = managedVideo ? "pending" : "none";
    var videoStartTimer = null;
    var videoWaitingTimer = null;
    var videoPlaybackTimer = null;
    var lastVideoTime = -1;
    var titleReleased = false;

    var lateTitleScheduled = false;
    var advanced = false;

    function advance() {
      if (advanced || active !== overlay || closing) return;
      advanced = true;
      // 次の段階への移行では「全体を閉じた」通知を出さない。
      activeOnDismiss = null;
      // T17: 100 コンボは、虹 → 確定（seq）→ 最後の札（final）。満点の2段目（全問正解の絵）へは進まない。
      if (combo) {
        var nextIndex = o.__comboIndex || 0;
        if (Array.isArray(combo.seq) && nextIndex < combo.seq.length) {
          var nextStage = combo.seq[nextIndex] || {};
          o.__comboIndex = nextIndex + 1;
          o.tier = nextStage.tier;
          o.introRoll = nextStage.introRoll;
          o.comboStage = nextStage.stage || null;
          playStage(o, true);
          return;
        }
        if (combo.final) {
          o.__comboFinal = true;
          o.tier = "rainbow";
          playStage(o, false);
          return;
        }
      }
      // 2段目はどのティアでもプレミア画像＋歌へ着地させる（上の resolved の分岐）。
      o.__afterIntro = true;
      playStage(o, false);
    }

    function offerSoundRetry(retry) {
      if (active !== overlay || closing || typeof retry !== "function"
        || overlay.querySelector('[data-role="fanfare-sound-retry"]')) return;
      var button = el("button", {
        class: "qz-fanfare__sound-retry", type: "button",
        dataset: { role: "fanfare-sound-retry" }, text: "音を再生",
        onclick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          if (button.parentNode) button.parentNode.removeChild(button);
          var close = overlay.querySelector('[data-role="fanfare-close"]');
          if (close && typeof close.focus === "function") close.focus();
          retry();
        },
      });
      overlay.appendChild(button);
    }

    function releaseVideoTitle() {
      if (titleReleased || active !== overlay || closing) return;
      titleReleased = true;
      overlay.classList.add("qz-fanfare--video-title-ready");
      // 2段目は「見出しが実際に出てから」数える。titleDelayMs から数えると、
      // 動画が失敗して見出しが遅れて出た回だけ、煽りが1フレームも見えないまま
      // 確定語へ飛ぶ（＝プレミアが金と同じ見え方になる）。
      scheduleLateTitle();
    }

    // 「激アツ」→「プレミア」の入れ替え。時計の無い環境では即座に確定側を出す
    // （煽りだけが残ると、当たっていないように読める）。
    function scheduleLateTitle() {
      if (!vm.titleLate || lateTitleScheduled) return;
      lateTitleScheduled = true;
      if (canTime) later(swapLateTitle, PREMIUM_TITLE_MS); else swapLateTitle();
    }

    function swapLateTitle() {
      if (active !== overlay || closing) return;
      var node = typeof overlay.querySelector === "function"
        ? overlay.querySelector(".qz-fanfare__title") : null;
      if (node) node.textContent = vm.titleLate;
      overlay.classList.add("qz-fanfare--premium-confirmed");
    }

    // CSS/SVG 版の装飾（放射・稲妻・火花）。動画が無いときの本体であり、
    // 動画が失敗したときの敷き直しにも使う。稲妻と火花は一度きりで、reduce では作らない。
    function buildDecorations() {
      if (comboCinema) return [];
      var nodes = [buildBurst(assets)];
      if (!still) {
        var bolts = buildBolts();
        if (bolts) nodes.push(bolts);
        nodes.push(buildSparks());
      }
      return nodes;
    }

    // 開始待ちが長引いたことだけを見せる。動画はまだ諦めない。
    // まっ暗な画面を3秒見せると、待っているのか壊れたのか区別がつかない。
    function markVideoWaiting() {
      if (videoState !== "pending" || active !== overlay || closing) return;
      overlay.classList.add("qz-fanfare--video-waiting");
    }

    // 動画を諦めて CSS＋HTML だけの層へ落とす。閉じない（止めるのは利用者だけ）。
    // reason は "timeout" / "error" / "abort" / "play-rejected" / "stalled"。
    // ★ 呼び出し側で必ず包むこと ★ error や play() の reject へ直接渡すと、
    //   イベントや例外オブジェクトが reason になって記録が読めなくなる。
    function useVideoFallback(reason) {
      if ((videoState !== "pending" && videoState !== "playing")
        || active !== overlay || closing) return;
      videoState = "fallback";
      lastFallback = { reason: reason || "error", at: Date.now() };
      cancelLater(videoStartTimer);
      cancelLater(videoWaitingTimer);
      cancelLater(videoPlaybackTimer);
      overlay.classList.add("qz-fanfare--video-fallback");
      stopVideo(overlay);
      if (video && video.parentNode) video.parentNode.removeChild(video);
      // 動画を捨てたので、ここで初めて CSS/SVG 版の装飾を敷く（動画中は出さない）。
      // 舞台（見出し）より下の層に置くため先頭へ挿す。insertBefore が無い環境では末尾。
      var first = overlay.firstChild || null;
      buildDecorations().forEach(function (node) {
        if (first && typeof overlay.insertBefore === "function") overlay.insertBefore(node, first);
        else overlay.appendChild(node);
      });
      releaseVideoTitle();
      // CSS 版へ落ちた以上、閉じ方も CSS 版と同じ尺に揃える。
      if (isIntro && !stayAtEnd) { if (canTime) later(advance, 1500); else advance(); }
      else if (autoClose) later(dismiss, AUTO_CLOSE_HOLD_MS);
    }

    function watchVideoProgress() {
      cancelLater(videoPlaybackTimer);
      videoPlaybackTimer = later(function () {
        useVideoFallback("stalled");
      }, VIDEO_STALL_TIMEOUT_MS);
    }

    function onVideoPlaying() {
      if (videoState !== "pending" || active !== overlay || closing) return;
      videoState = "playing";
      cancelLater(videoStartTimer);
      cancelLater(videoWaitingTimer);
      overlay.classList.add("qz-fanfare--video-playing");
      if (titleDelay === 0) releaseVideoTitle();
      lastVideoTime = Number(video.currentTime) || 0;
      watchVideoProgress();
    }

    function onVideoTimeUpdate() {
      if (videoState !== "playing" || !video) return;
      var currentTime = Number(video.currentTime) || 0;
      if (currentTime > lastVideoTime) {
        lastVideoTime = currentTime;
        watchVideoProgress();
      }
      // T17: コンボの1本だけの回（終わっても次の段へ進まず最後のコマで残る）は、終わりの白く抜ける所の手前で止めて、その絵で残す
      //   （S04 と星空の本は最後の約 0.3 秒が白へ溶ける。満点の演出ではすぐ2段目へ移るので見えなかった所）。
      //   2026-10-30 T20: 動画ごとの endTrim（fx/manifest.js の combo。0＝最後のコマまで流す）があればそれを使う。
      var tail = typeof assets.endTrim === "number" ? assets.endTrim : COMBO_TAIL_S;
      if (stayAtEnd && tail > 0 && isFinite(video.duration) && video.duration > 1 && currentTime >= video.duration - tail) {
        try { video.pause(); } catch (e) { /* 止まらなくても終わりの扱いへ */ }
        onVideoEnded();
        return;
      }
      if (currentTime * 1000 >= titleDelay) releaseVideoTitle();
    }

    // 既定では動画が終わっても閉じない。video要素は外さずに残し、非ループなので
    // 最後のコマで静止する（空の結果プレートの上に、HTMLの達成見出しが乗ったまま
    // 止まる）。自動終了が ON のときだけ、見出しを見せてから畳む。
    function onVideoEnded() {
      if (videoState !== "playing" || active !== overlay || closing) return;
      if (isIntro && !stayAtEnd) { advance(); return; }
      videoState = "ended";
      // 静止した後に「まだ再生中」の保険が発火して動画を外すと、絵が急に消える。
      cancelLater(videoPlaybackTimer);
      // 極端に短い／壊れたdurationでも達成語は必ず見せる。
      releaseVideoTitle();
      overlay.classList.add("qz-fanfare--video-ended");
      if (autoClose) later(dismiss, AUTO_CLOSE_AFTER_VIDEO_MS);
    }

    // 読み込み前でも再生途中でも、やることは同じ＝動画を捨てて CSS 版へ落とすだけ。
    // 待たされた分を取り返そうとして勝手に閉じない（最後まで見たいという要望）。
    // 違うのは記録に残す理由だけなので、イベント名を包んで渡す。
    function onVideoFailure(reason) {
      return function () { useVideoFallback(reason); };
    }

    if (managedVideo) {
      video.addEventListener("playing", onVideoPlaying);
      video.addEventListener("timeupdate", onVideoTimeUpdate);
      video.addEventListener("ended", onVideoEnded);
      video.addEventListener("error", onVideoFailure("error"));
      video.addEventListener("abort", onVideoFailure("abort"));
    }

    document.body.appendChild(overlay);
    active = overlay;
    if (comboFinal && comboCinema && window.DpgComboCinema) {
      activeComboCleanup = window.DpgComboCinema.mount(overlay, {
        label: vm.title, count: combo.count, still: still || saveDataOn(),
      });
    }
    activeOnDismiss = typeof o.onDismiss === "function" ? o.onDismiss : null;

    if (typeof document.addEventListener === "function") {
      document.addEventListener("keydown", onKey);
    }
    // 閉じるボタンへフォーカスを移す。全再描画でフォーカスが body へ飛ぶのを
    // app.js の render() が data-role で補っているのと同じ考え方。
    if (typeof overlay.querySelector === "function") {
      var close = overlay.querySelector('[data-role="fanfare-close"]');
      if (close && typeof close.focus === "function") {
        try { close.focus({ preventScroll: true }); } catch (e) { close.focus(); }
      }
    }
    // 背面の aria-hidden は、背面にフォーカスが残っているとブラウザに拒否される。
    // 先にダイアログへ移してから隔離し、読み上げツリーと実フォーカスを一致させる。
    isolateBackground(overlay);
    // 2026-10-19 区間16 SOUND2: 1段目では、選ばれた1本（variants の抽選の後）の動画と曲の名前を渡す（曲を動画に合わせるため。
    //   受け取らない呼び出し元は今までどおり）。動きを減らす設定で動画を出さない回も、選ばれた1本の曲の名前を渡す（音の決まりは前と同じ）。
    if (isIntro && typeof o.onIntroStart === "function") o.onIntroStart({
      tier: resolved.tier, video: firstVideoSrc(assets), music: nonEmptyStr(assets.music) ? assets.music : null,
      kind: nonEmptyStr(assets.musicKind) ? assets.musicKind : null,
    });
    if (!isIntro && typeof o.onCelebrationStart === "function") o.onCelebrationStart(offerSoundRetry);
    if (managedVideo) {
      videoWaitingTimer = later(markVideoWaiting, VIDEO_WAITING_HINT_MS);
      videoStartTimer = later(function () {
        useVideoFallback("timeout");
      }, VIDEO_START_TIMEOUT_MS);
      // autoplay属性に加え明示playも試し、拒否をCSSフォールバックへ結びつける。
      if (typeof video.play === "function") {
        try {
          var playResult = video.play();
          if (playResult && typeof playResult.catch === "function") {
            playResult.catch(function () { useVideoFallback("play-rejected"); });
          }
        } catch (e) {
          useVideoFallback("play-rejected");
        }
      }
    }
    // 動画が無い回（CSS版・動きを減らす設定）は見出しが最初から出ているので、
    // ここで2段目の時計を始める。動画がある回は releaseVideoTitle から始まる。
    if (!managedVideo) scheduleLateTitle();
    // 既定（自動終了 OFF）ではここで dismiss のタイマーを積まない。CSS版も
    // 動画版も、消えるのは「止める」ボタン・タップ・Esc/Enter/Space だけ。
    // ON のときは CSS 版だけここで1本積む（動画版は ended / フォールバック側）。
    if (isIntro && !managedVideo && !stayAtEnd) { if (canTime) later(advance, 1500); else advance(); }
    else if (autoClose && !managedVideo) later(dismiss, AUTO_CLOSE_HOLD_MS);
    return true;
  }

  window.QuizFanfare = {
    play: play,
    dismiss: dismiss,
    preload: preload,
    isActive: function () { return !!active; },
    // T17: いま出ているのがコンボの演出か（app.js が、次の問題へ進む時に閉じるため）。
    isCombo: function () { return !!(active && active.classList && active.classList.contains("qz-fanfare--combo")); },
    // T17: コンボの演出だけを閉じる（次の問題へ入る時。満点の演出は閉じない）。背面の隔離もすぐ外し、フォーカスは戻さない（次の問題へ render が置く）。
    closeCombo: function () {
      if (!active || closing || !(active.classList && active.classList.contains("qz-fanfare--combo"))) return false;
      previousFocus = null;
      dismiss();
      releaseBackground();
      return true;
    },
    // 直近の失敗理由。持ち回りの参照を返すと外から書き換えられるので、複製を返す。
    lastVideoFallback: function () {
      return lastFallback ? { reason: lastFallback.reason, at: lastFallback.at } : null;
    },
    // テスト用。guaranteed.variants の抽選だけを外から検算できるようにする。
    _pickIntroAssets: pickIntroAssets,
    // T20: コンボの Fal の場面の先読み（key は "combo-50"・"combo-100"）。
    preloadCombo: preloadCombo,
  };
})();
