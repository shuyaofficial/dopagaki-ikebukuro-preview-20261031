/* ===========================================================================
   問題集 — assets/sfx.js
   効果音・音声・満点曲の再生。回答音は設定で音声と効果音を分け、
   両方オンなら種類を半々で選んでから、その種類の1本を鳴らす。

   ★ 読み込み時に Audio を触らないこと ★
     tools/smoke.mjs は vm.createContext 上に手で用意した最小 DOM の上で
     本物の app.js を実行する。そこには Audio も setTimeout も存在しない。
     app.js の visibilitychange 登録が同じ理由で存在確認つきになっている
     （無条件に呼んで63件が全滅した経緯がある）。ここも全部ガードを通す。

   ★ 音源が1本も無くても壊れないこと ★
     配布物には manifest と採用音源を同梱する。読込に失敗した場合も、
     再生だけを省いて解答・保存を継続する。

   依存: window.QuizPrefs（assets/prefs.js）、window.QUIZ_SFX_MANIFEST（任意）。
   =========================================================================== */
(function () {
  "use strict";

  // reach（リーチ予告）と premium（プレミア）は任意カテゴリ。manifest に無ければ
  // filesOf が空配列を返して play が false になるだけで、他の音は今までどおり鳴る。
  // rankup（ランクアップ）・streak（連続日数が増えた日）も任意カテゴリ（2026-10-19 区間16 SOUND2・関所P Q14）。
  //   ほかの短い効果音（reach）と同じ決まり: 標準の効果音（sfxEnabled）がオフ・全体の消音（audioMuted）なら鳴らない。
  //   動きを減らす設定では音は止めない（リーチ・達成の帯と同じ）。manifest に無い・音源が無い時は play が false を返すだけ。
  // voiceack・voiceinfo・reisho は「音声で学ぶモード」の返事（2026-10-21 本人決定。ドパガキくんの声を前もって作った MP3）。
  //   決まりは全体の消音（audioMuted）だけ。効果音・声のスイッチとは別（モードをオンにした人への返事なので）。鳴らすのは voice-chat-control.js と app.js の冷笑。
  var KINDS = { correct: true, wrong: true, perfect: true, reach: true, premium: true, gold: true, rainbow: true, combo100: true, rankup: true, streak: true, voiceack: true, voiceinfo: true, reisho: true };
  var VOICE_CMD = { voiceack: true, voiceinfo: true, reisho: true };
  var BASE = "assets/sfx/";

  // 連続正解1つにつき半音（=2^(1/12)）上げる。7半音で頭打ちにするのは、
  // それ以上は元の音色から離れて「壊れた音」に聞こえるため（Prosser 2017）。
  // 純関数として公開するのは、再生できない環境（smoke の vm）でも比率だけを
  // 検算できるようにするため。0・未指定・不正値はすべて等倍。
  function comboRate(n) {
    if (typeof n !== "number" || !isFinite(n) || n <= 0) return 1;
    return Math.pow(2, Math.min(Math.floor(n), 7) / 12);
  }

  // 再生速度と音程の紐付けを切ってから速度を変える。preservesPitch の既定は true
  // なので、外し忘れると速さだけ変わって音程は上がらない（＝何も起きないように聞こえる）。
  // ベンダー接頭辞つきも同時に落とす。読み取り専用の実装でも例外にしない。
  function applyRate(el, rate) {
    try { el.preservesPitch = false; } catch (e) { /* noop */ }
    try { el.mozPreservesPitch = false; } catch (e) { /* noop */ }
    try { el.webkitPreservesPitch = false; } catch (e) { /* noop */ }
    try { el.playbackRate = rate; } catch (e) { /* noop */ }
  }

  // 止めるときのフェード時間。ぶつ切りにすると、盛り上がっている音の途中で
  // 「プツッ」と切れて壊れたように聞こえる。260ms あれば自然に消える。
  var FADE_MS = 260;

  // Audio が無い環境（smoke の vm サンドボックス）では、以降すべてを no-op にする。
  // ここで早期に確定させておくと、再生のたびに環境を疑う分岐が要らない。
  var CAN_PLAY = typeof Audio === "function";

  // 音源キャッシュ（パス → Audio）。ファイルごとに1個持つ。
  // カテゴリで1個を使い回して src を差し替える方式にしないのは、
  // 差し替えるたびに再ダウンロードが走り、連続で解いたときに音が遅れるため。
  var cache = {};
  // 直前に鳴らしたファイル名（カテゴリごと）。同じ音の連続を避けるために使う。
  // 8本あっても2回続くと「壊れた」と読まれるので、1手だけ記憶する。
  var lastPlayed = {};
  // いま鳴っている音（カテゴリごと）。速く解いたときに前の音を止める。
  var playing = {};
  // play() の Promise が遅れて解決しても、停止済みの再生を復活させない世代番号。
  var generations = {};

  function manifest() {
    var m = window.QUIZ_SFX_MANIFEST;
    return (m != null && typeof m === "object") ? m : {};
  }

  // そのカテゴリの音源ファイル名の配列。壊れた/欠けた manifest は空配列として扱う
  // （0本なら鳴らないだけで、例外にはしない）。
  function standardFiles(kind) {
    var list = manifest()[kind];
    return Array.isArray(list) ? list.filter(function (name) {
      return typeof name === "string" && name !== "";
    }) : [];
  }
  // 両方ONでは自分の音を優先。標準OFFの種類にはフォールバックしない。
  function filesOf(kind, prefs) {
    var standard = standardFiles(kind);
    if (VOICE_CMD[kind]) return standard;
    if (isCelebration(kind)) return !prefs || celebrationEnabled(prefs) ? standard : [];
    if (!isAnswer(kind)) return !prefs || prefs.sfxEnabled ? standard : [];
    var list = [];
    ["effect", "voice"].forEach(function (channel) {
      var custom = window.QuizCustomAudio ? QuizCustomAudio.sources(kind, channel) : [];
      var customOn = !prefs || customEnabled(prefs, channel);
      var standardOn = !prefs || (channel === "voice" ? voicesEnabled(prefs) : prefs.sfxEnabled);
      if (customOn && custom.length) list = list.concat(custom);
      else if (standardOn) list = list.concat(standard.filter(function (name) {
        return isVoiceFile(name) === (channel === "voice");
      }));
    });
    return list;
  }

  function isAnswer(kind) { return kind === "correct" || kind === "wrong"; }
  // 満点・コンボの音楽と歌（perfect・gold・rainbow・premium・combo100）は「全問正解の演出」の仲間（2026-10-01 本人決定）。
  // 効果音・声のON/OFFに関係なく、演出がONなら鳴り、OFFなら鳴らない。全体の消音（audioMuted）だけは効く。
  function isCelebration(kind) { return kind === "perfect" || kind === "gold" || kind === "rainbow" || kind === "premium" || kind === "combo100"; }
  function celebrationEnabled(prefs) { return prefs.fanfareEnabled !== false; }
  function isVoiceFile(name) { return /(^|\/)voice-/.test(name) || !!(window.QuizCustomAudio && QuizCustomAudio.isVoice(name)); }
  function prefsNow() { return window.QuizPrefs ? window.QuizPrefs.get() : {}; }
  function voicesEnabled(prefs) {
    // 旧prefs.jsがキャッシュに残った場合も、以前の音のON/OFFを引き継ぐ。
    return typeof prefs.voiceEnabled === "boolean" ? prefs.voiceEnabled : !!prefs.sfxEnabled;
  }
  function customEnabled(prefs, channel) {
    var value = prefs[channel === "voice" ? "customVoiceEnabled" : "customEffectEnabled"];
    return typeof value === "boolean" ? value : (channel === "voice" ? voicesEnabled(prefs) : !!prefs.sfxEnabled);
  }
  function soundVolume(prefs) {
    return typeof prefs.sfxVolume === "number" && isFinite(prefs.sfxVolume)
      ? Math.max(0, Math.min(1, prefs.sfxVolume)) : 1;
  }
  function historyKey(kind, name) {
    return isAnswer(kind) ? kind + (isVoiceFile(name) ? ":voice" : ":effect") : kind;
  }

  // 直前と同じ音を避けて1本選ぶ。候補が1本しか無いときはそのまま返す
  // （避けようとして「鳴らさない」に倒すと、音源1本の人には無音になる）。
  // prefer（任意・2026-10-19 区間16 SOUND2）: その種類の manifest にある1本の名前。鳴らしてよい候補（設定で絞った後）に入っていれば、それを選ぶ。
  //   満点の1段目の曲を「選ばれた動画」に合わせるため（fx/manifest.js の music → app.js の celebrate → play(kind, { file })）。無い・候補に無い時は前と同じ選び方。
  function pick(kind, prefer) {
    var files = filesOf(kind, prefsNow());
    if (typeof prefer === "string" && prefer !== "" && files.indexOf(prefer) >= 0) return prefer;
    if (isAnswer(kind)) {
      var effects = files.filter(function (name) { return !isVoiceFile(name); });
      var voices = files.filter(isVoiceFile);
      // 音源数にかかわらず種類を50/50で選ぶ。OFFの種類へはフォールバックしない。
      if (effects.length && voices.length) files = Math.random() < 0.5 ? effects : voices;
      else files = effects.length ? effects : voices;
    }
    if (files.length === 0) return null;
    if (files.length === 1) return files[0];
    var last = lastPlayed[historyKey(kind, files[0])];
    var candidates = files.filter(function (f) { return f !== last; });
    var pool = candidates.length > 0 ? candidates : files;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function audioFor(src) {
    if (!cache[src]) {
      var a = new Audio(src);
      // preload="auto" にしないのは、14本を起動時に取りに行かせないため。
      // 初回だけ数十msの遅れが出るが、以後はキャッシュから即鳴る。
      a.preload = "none";
      cache[src] = a;
    }
    return cache[src];
  }

  /* --- iOS Safari の自動再生ロック解除 -------------------------------------- */
  // iOS はユーザー操作から始まった呼び出しでないと音を鳴らさない。
  // 選択肢のタップから鳴らす正解/不正解音は問題ないが、★カウントダウンの時間切れは
  // ユーザー操作起点ではない★ため、これが無いと iPhone でだけ時間切れの音が出ない。
  // 最初の操作で無音の WAV を1回鳴らしてロックを外しておく。
  var unlocked = false;
  var SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

  function unlock() {
    if (unlocked || !CAN_PLAY) return;
    unlocked = true;
    try {
      var a = new Audio(SILENT_WAV);
      a.volume = 0;
      var p = a.play();
      // play() は Promise を返す実装と返さない実装がある。返すときだけ握りつぶす。
      if (p && typeof p.catch === "function") p.catch(function () { /* noop */ });
    } catch (e) { /* noop */ }
  }

  // ★ 存在確認してから登録する（smoke の sandbox に addEventListener は無い）。
  if (CAN_PLAY && typeof document !== "undefined" && typeof document.addEventListener === "function") {
    ["pointerdown", "touchstart", "keydown"].forEach(function (type) {
      document.addEventListener(type, unlock, { once: true, passive: true });
    });
  }

  /* --- 停止 ------------------------------------------------------------------ */
  // 演出を閉じた場合にも停止する。将来長い音源に差し替えても画面をまたいで鳴らさない。
  // fanfare.js の dismiss とヘッダの音トグルから呼ぶ。
  //
  // Audio はファイルごとにキャッシュして使い回すので、フェードで下げた volume は
  // 必ず 1 へ戻すこと。戻し忘れると、次にその音を選んだとき無音で「鳴らない音源が
  // 1本だけある」という、原因の分かりにくい壊れ方になる。
  function cancelFade(el) {
    if (!el || el.__qzFade == null) return;
    if (typeof clearInterval === "function") clearInterval(el.__qzFade);
    el.__qzFade = null;
  }

  // 音量と同じ理由で、上げた再生速度も必ず 1 へ戻すこと。戻し忘れると、次に
  // その音源を単発で鳴らしたときだけ高いまま鳴る（コンボと無関係に上ずる）。
  function hardStop(el) {
    cancelFade(el);
    try {
      el.pause();
      el.currentTime = 0;
      el.volume = 1;
      // iOS は volume=0 を無音準備として扱わないことがある。停止中も muted を維持し、
      // 通常再生で明示的に解除する。
      el.muted = true;
      applyRate(el, 1);
    } catch (e) { /* noop */ }
  }

  // そのカテゴリで鳴っている音を、フェードしてから止める。
  // setInterval が無い環境（smoke の vm サンドボックス）では即座に止める。
  function stop(kind, immediate) {
    var el = playing[kind];
    if (!el) return false;
    generations[kind] = (generations[kind] || 0) + 1;
    playing[kind] = null;
    if (immediate === true) { hardStop(el); return true; }
    if (typeof setInterval !== "function") { hardStop(el); return true; }
    cancelFade(el);
    var steps = 8;
    var i = 0;
    var startVolume = el.volume;
    el.__qzFade = setInterval(function () {
      i += 1;
      try { el.volume = Math.max(0, startVolume * (1 - i / steps)); } catch (e) { /* noop */ }
      if (i >= steps) hardStop(el);
    }, Math.round(FADE_MS / steps));
    return true;
  }

  // 1本でも止めたら true。呼び出し側が「実際に音を切った」ことを知りたい
  // （🔊トグルの読み上げなど）ので、握りつぶさず返す。
  function stopAll(immediate) {
    if (window.QuizCustomAudio) QuizCustomAudio.stopPreview();
    var stopped = false;
    Object.keys(KINDS).forEach(function (k) {
      if (stop(k, immediate)) stopped = true;
    });
    if (immediate === true) Object.keys(cache).forEach(function (src) { hardStop(cache[src]); });
    return stopped;
  }

  // 個別設定のOFFはその種類だけ、全体消音はすべて即停止する。
  // 解除時は再生を始めず、選んだ種類と音量を次の回答へ引き継ぐ。
  function permitted(kind, name, prefs) {
    if (prefs.audioMuted) return false;
    if (isCelebration(kind)) return celebrationEnabled(prefs);
    if (VOICE_CMD[kind]) return true;
    if (isAnswer(kind) && name.indexOf("blob:") === 0) return customEnabled(prefs, isVoiceFile(name) ? "voice" : "effect");
    return isAnswer(kind) && isVoiceFile(name) ? voicesEnabled(prefs) : !!prefs.sfxEnabled;
  }
  function syncPreferences() {
    var prefs = prefsNow();
    if (window.QuizCustomAudio) QuizCustomAudio.stopPreview();
    Object.keys(cache).forEach(function (src) {
      var el = cache[src];
      if (!permitted(el.__qzKind, src, prefs)) {
        if (el.__qzKind && playing[el.__qzKind] === el) {
          generations[el.__qzKind] = (generations[el.__qzKind] || 0) + 1;
          playing[el.__qzKind] = null;
        }
        hardStop(el);
      }
      else if (el.__qzFade == null) el.volume = el.__qzSilent ? 0 : soundVolume(prefs);
    });
    Object.keys(playing).forEach(function (kind) {
      var el = playing[kind];
      if (el && !permitted(kind, el.src, prefs)) playing[kind] = null;
    });
  }

  /* --- 再生 ------------------------------------------------------------------ */
  // 設定で切られていれば何もしない。判定を呼び出し側に配らないのは、
  // 発火点が4経路あって1つ書き忘れると「OFF なのに鳴る音が1種類だけある」に
  // なるため（例外は出ず、再現条件も分かりにくい）。
  function enabled(kind) {
    var prefs = prefsNow();
    return !prefs.audioMuted && filesOf(kind, prefs).length > 0;
  }

  // opts.combo は「この解答より前の連続正解数」。正解の器楽音だけ音程へ効かせる。
  // 不正解音を上げないのは、上げると外したことが「盛り上がり」に聞こえるため。
  // opts.file（任意）は鳴らしたい1本の名前（pick の prefer）。鳴らしてよいか（消音・演出オフ・効果音オフ）の判定は今までどおり。
  function play(kind, opts) {
    if (!CAN_PLAY || !KINDS[kind]) return false;
    var o = (opts != null && typeof opts === "object") ? opts : {};

    // 正解・不正解は同じ「解答フィードバック」チャンネルとして扱う。
    // 次の問題へすぐ進んだとき、数秒ある前問の音と次問の音を重ねない。
    // ここはフェードしない（次の音がすぐ鳴るので、重なる方が不自然）。
    if (isAnswer(kind)) {
      ["correct", "wrong"].forEach(function (k) {
        var el = playing[k];
        if (!el) return;
        generations[k] = (generations[k] || 0) + 1;
        playing[k] = null;
        hardStop(el);
      });
    }

    if (!enabled(kind)) return false;
    var name = pick(kind, o.file);
    if (!name) return false;

    // 同じカテゴリの前の音は止める。速く解くと重なって団子になる。
    // ここはフェードしない（次の音がすぐ鳴るので、重なる方が不自然）。
    var prev = playing[kind];
    if (prev) {
      generations[kind] = (generations[kind] || 0) + 1;
      hardStop(prev);
    }

    var el = audioFor(name.indexOf("blob:") === 0 ? name : BASE + kind + "/" + name);
    var generation = (generations[kind] || 0) + 1;
    generations[kind] = generation;
    lastPlayed[historyKey(kind, name)] = name;
    playing[kind] = el;
    el.__qzKind = kind;
    el.__qzGeneration = generation;
    el.__qzSilent = o.silent === true;
    try {
      // フェードの途中で同じ音を選び直すことがある。タイマーを止めて音量を戻さないと、
      // 消えかけの音量のまま鳴り始め、そのあとフェードの残りが止めにかかる。
      cancelFade(el);
      var prefs = prefsNow();
      el.volume = soundVolume(prefs);
      // 確定動画の操作時に歌用の同じAudioを無音で開始し、後の切替でも使う。
      el.muted = o.silent === true;
      if (o.silent === true) el.volume = 0;
      el.currentTime = 0;
      // ★ 毎回 明示的に設定すること ★ 音源は1ファイル1個をキャッシュして
      //   使い回すので、前回のコンボで上げた速度が残る。等倍のときも 1 を代入する。
      // voice- は声素材のファイル名規約。採用時に試聴した話者・速度を保つ。
      var isVoice = isVoiceFile(name);
      applyRate(el, kind === "correct" && !isVoice ? comboRate(o.combo) : 1);
      var p = el.play();
      // 再生拒否はonErrorへ通知する。未指定なら学習操作を継続する。
      // 音が出ないことより、例外で解答処理が止まる方がはるかに悪い。
      if (p && typeof p.then === "function") {
        p.then(function () {
          // play() はモバイルで遅れて解決することがある。停止・差し替え後に
          // 解決した旧 Promise は、要素を再び鳴らせない状態へ戻す。
          // 同じ Audio 要素が新世代へ再利用されている場合は、現在の所有者を
          // 旧 Promise の後始末で止めない。所有者が別要素／無い場合だけ止める。
          if (playing[kind] !== el) hardStop(el);
        }, function () {
          if (playing[kind] === el && el.__qzGeneration === generation
            && generations[kind] === generation && typeof o.onError === "function") o.onError();
        });
      } else if (p && typeof p.catch === "function") p.catch(function () {
        if (playing[kind] === el && el.__qzGeneration === generation
          && generations[kind] === generation && typeof o.onError === "function") o.onError();
      });
    } catch (e) {
      if (typeof o.onError === "function") o.onError();
      return false;
    }
    return true;
  }

  // 設定画面などから「そもそも音源が置かれているか」を知るために使う。
  // 0本のときに ON/OFF トグルだけ出しても、押した人には何も起きない。
  function hasSounds() {
    return hasEffects() || hasVoices();
  }
  function hasVoices() {
    return ["correct", "wrong"].some(function (kind) { return standardFiles(kind).some(isVoiceFile); });
  }
  function hasEffects() {
    // 声の操作の返事は「効果音」に数えない（音のスイッチ・消音のボタンの出方を今のままにするため）。
    return Object.keys(KINDS).some(function (kind) {
      if (VOICE_CMD[kind]) return false;
      return standardFiles(kind).some(function (name) { return !isAnswer(kind) || !isVoiceFile(name); });
    });
  }

  // 下の holdAnswer の予約（id → 切れる時刻 ms）。
  var answerHolds = {}, answerHoldSeq = 0;

  window.QuizSfx = {
    hasEnabledSounds: function () { var p = prefsNow(); return Object.keys(KINDS).some(function (kind) { return !VOICE_CMD[kind] && filesOf(kind, p).length > 0; }); },
    releaseCustom: function () {
      Object.keys(cache).filter(function (src) { return src.indexOf("blob:") === 0; }).forEach(function (src) {
        var audio = cache[src]; hardStop(audio);
        Object.keys(playing).forEach(function (kind) { if (playing[kind] === audio) playing[kind] = null; });
        audio.removeAttribute("src"); audio.load(); delete cache[src];
      });
    },
    play: play,
    // いま鳴らしている正解・不正解の音（無ければ null）。音声解説の自動再生
    // （explain-audio.js）が、この音の終わりを待ってから流すために使う。
    // 2026-10-19 区間17 SMALLB: 正誤の音の終わりに続けて鳴らす連続日数の音（streak。app.js の streakAfterAnswer）も、鳴っている間はここに入れる
    //   （音声解説が、この音の終わりも待ってから流れる＝解説の声と重ねない）。
    answerPlaying: function () { var s = playing.streak; return s && !s.paused && !s.ended ? s : (playing.correct || playing.wrong || null); },
    // 2026-10-19 区間17 SND: 正誤の音・連続日数の音が「これから鳴る」間の予約（app.js の revealAnswer・streakAfterAnswer・markPracticeUnderstood）。
    //   決めの待ち（dpg-feel の holdMs）・正誤の音と連続日数の音のすき間・［理解した］の後の1拍は、まだ answerPlaying に何も無い。
    //   音声解説（explain-audio.js）は answerHeld() が true の間も待つ（先に流れ始めて、後から鳴る音が解説の頭に重なっていた）。
    //   予約は鳴らした・鳴らさないと決めた所で releaseAnswer する。外し忘れても ms で切れる。
    holdAnswer: function (ms) { var id = ++answerHoldSeq; answerHolds[id] = Date.now() + Math.max(0, Number(ms) || 0); return id; },
    releaseAnswer: function (id) { delete answerHolds[id]; },
    answerHeld: function () {
      var now = Date.now();
      return Object.keys(answerHolds).some(function (id) { if (answerHolds[id] > now) return true; delete answerHolds[id]; return false; });
    },
    prime: function (kind) { return play(kind, { silent: true }); },
    comboRate: comboRate,
    stop: stop,
    stopAll: stopAll,
    syncPreferences: syncPreferences,
    stopCelebration: function (immediate) {
      ["perfect", "gold", "rainbow", "premium", "combo100"].forEach(function (kind) {
        stop(kind, immediate);
        if (immediate === true) Object.keys(cache).forEach(function (src) {
          if (src.indexOf(BASE + kind + "/") === 0) hardStop(cache[src]);
        });
      });
    },
    hasSounds: hasSounds,
    hasVoices: hasVoices,
    hasEffects: hasEffects,
    isPlaying: function (kind) { return !!playing[kind]; },
    // 声の操作の返事が鳴り終わるのを待つため（voice-chat-control.js）。鳴っていなければ null。
    playingOf: function (kind) { var el = playing[kind]; return el && !el.paused && !el.ended ? el : null; },
    // テスト・デバッグ用。どのカテゴリが何本あるかを見る。
    countOf: function (kind) { return filesOf(kind).length; },
  };
})();
