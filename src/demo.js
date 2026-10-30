(function () {
  'use strict';

  var FEATURES = { perfect: '満点の演出', reisho: '冷笑モード', audio: '音声解説', voice: '声で操作', plan: '学習計画', ranking: 'ランキング' };
  var QUESTIONS = [
    { word: 'apple', choices: ['りんご', 'ねこ', 'いぬ'], answer: 0 },
    { word: 'cat', choices: ['いぬ', 'ねこ', 'りんご'], answer: 1 }
  ];
  var nextId = 0;

  function mount(host, options) {
    if (!host || typeof host.replaceChildren !== 'function') throw new TypeError('体験の表示先が必要です。');
    var id = 'ik-demo-' + (++nextId);
    var feature = 'perfect', index = 0, answers = [], selected = null;
    var revealed = false, finished = false, cold = false, sound = false;
    var disposed = false, generation = 0, recognition = null, listening = false, pendingMic = false, audio = null;
    var voiceMessage = '', audioMessage = '', announcement = '', minutes = 10, points = 50;
    var audience = options && options.audience;
    var root = element('section', 'ik-demo');
    root.setAttribute('aria-label', 'ドパガキ問題集の機能体験');
    host.replaceChildren(root);

    function element(tag, cls, text) {
      var node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function button(text, fn, cls) {
      var node = element('button', cls || 'ik-demo__button', text);
      node.type = 'button';
      node.addEventListener('click', fn);
      return node;
    }
    function add(parent) {
      for (var n = 1; n < arguments.length; n++) if (arguments[n]) parent.appendChild(arguments[n]);
      return parent;
    }
    function prefsSound(on) {
      var runtime = window.IkebukuroRuntime;
      if (runtime && typeof runtime.setSound === 'function') runtime.setSound(on);
      window.dispatchEvent(new CustomEvent('ikebukuro:sound', { detail: { enabled: on } }));
    }
    function sfx(kind, opts) {
      var runtime = window.IkebukuroRuntime;
      var allowed = runtime && typeof runtime.getSound === 'function' ? runtime.getSound() : sound;
      if (sound && allowed && !disposed && window.QuizSfx && typeof window.QuizSfx.play === 'function') return window.QuizSfx.play(kind, opts);
      return false;
    }
    function stopAudio() {
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      audio = null;
    }
    function stopMic() {
      var previous = recognition;
      recognition = null;
      listening = false;
      pendingMic = false;
      if (previous) {
        previous.onstart = previous.onresult = previous.onerror = previous.onend = null;
        try { previous.abort(); } catch (error) { voiceMessage = 'マイクは停止しました。'; }
      }
    }
    function stopAll(message) {
      generation++;
      stopMic();
      stopAudio();
      if (window.QuizFanfare && typeof window.QuizFanfare.dismiss === 'function') window.QuizFanfare.dismiss();
      if (window.QuizSfx && typeof window.QuizSfx.stopAll === 'function') window.QuizSfx.stopAll(true);
      root.querySelectorAll('video, audio').forEach(function (media) { media.pause(); media.muted = true; });
      voiceMessage = message || 'マイク・音声・演出を停止しました。';
      if (!disposed) render();
    }
    function setSound(on) {
      sound = on;
      if (!on) stopAll('音をオフにして、すべて停止しました。');
      prefsSound(on);
      render();
    }
    function reset() {
      stopAll('マイク・音声・演出を停止しました。');
      index = 0; answers = []; selected = null; revealed = false; finished = false; announcement = '';
      render();
    }
    function celebrate() {
      if (disposed || answers.length !== 2 || answers.some(function (value) { return !value; })) return;
      var fx = window.QuizFanfare;
      if (!fx || typeof fx.play !== 'function') { announcement = '2問とも正解！ 満点演出を読み込めませんでした。'; render(); return; }
      stopMic(); stopAudio();
      var token = ++generation;
      var roll = Math.random(), tier = roll < 0.1 ? 'premium' : roll < 0.55 ? 'gold' : 'rainbow';
      var introRoll = tier === 'premium' ? roll / 0.1 : tier === 'gold' ? (roll - 0.1) / 0.45 : (roll - 0.55) / 0.45;
      function valid() { return !disposed && token === generation; }
      function quiet() { if (window.QuizSfx && typeof window.QuizSfx.stopAll === 'function') window.QuizSfx.stopAll(true); }
      var started = fx.play({
        tier: tier, titleTier: tier === 'premium' ? 'premium' : 'gold', correct: 2, total: 2, guaranteed: true, introRoll: introRoll,
        onIntroStart: function (intro) { if (!valid()) return; quiet(); if (tier !== 'premium') sfx(tier, intro && intro.music ? { file: intro.music } : undefined); },
        onCelebrationStart: function () { if (!valid()) return; quiet(); if (!sfx('premium')) sfx('perfect'); },
        onDismiss: quiet
      });
      if (!started) { announcement = '2問とも正解！ この環境では満点演出を表示できませんでした。'; render(); }
    }
    function answer(value) {
      if (revealed || finished || disposed) return;
      selected = value;
      var correct = value === QUESTIONS[index].answer;
      answers.push(correct); revealed = true;
      announcement = correct ? '正解！' : value === -1 ? '答えを確認しよう。' : '不正解。もう一度覚えよう。';
      if (correct) sfx('correct');
      else if (cold) sfx('reisho');
      else sfx('wrong');
      render();
    }
    function next() {
      if (!revealed || finished) return;
      if (index === QUESTIONS.length - 1) {
        finished = true; render(); celebrate();
      } else {
        index++; selected = null; revealed = false; announcement = ''; stopAudio(); render();
      }
    }
    function command(raw) {
      var text = String(raw).replace(/[\s。、.!！?？]/g, '');
      if (/^(停止|止めて|ストップ)$/.test(text)) { stopAll(); return; }
      if (/^(もう一度|やり直し|最初から)$/.test(text)) { reset(); return; }
      if (/^(次|次へ|つぎへ)$/.test(text)) { next(); return; }
      var match = text.match(/^(?:([123１２３一二三])(?:番|ばん|番目)?|選択肢([123１２３一二三]))$/);
      if (match) {
        var value = match[1] || match[2];
        answer(['1', '１', '一'].indexOf(value) >= 0 ? 0 : ['2', '２', '二'].indexOf(value) >= 0 ? 1 : 2);
        return;
      }
      voiceMessage = '「1番」「2番」「3番」「次へ」「もう一度」「停止」と話してください。'; render();
    }
    function startMic() {
      if (recognition) { stopMic(); voiceMessage = 'マイクを停止しました。'; render(); return; }
      var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Speech) { voiceMessage = 'このブラウザは音声認識に対応していません。下のボタンで同じ操作を試せます。'; render(); return; }
      stopAudio();
      var rec;
      try { rec = new Speech(); } catch (error) { voiceMessage = 'マイクを開始できませんでした。下のボタンで操作できます。'; render(); return; }
      recognition = rec; pendingMic = true; listening = false;
      rec.lang = 'ja-JP'; rec.interimResults = false; rec.continuous = false;
      rec.onstart = function () { if (disposed || recognition !== rec) return; pendingMic = false; listening = true; voiceMessage = '聞いています。「1番」「次へ」などと話してください。'; render(); };
      rec.onresult = function (event) {
        if (disposed || recognition !== rec || !listening || document.hidden) return;
        var result = event.results && event.results[event.resultIndex || 0];
        if (result && result[0] && result.isFinal !== false) command(result[0].transcript);
      };
      rec.onerror = function (event) {
        if (disposed || recognition !== rec) return;
        voiceMessage = event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'マイクの許可がありません。下のボタンで同じ操作を試せます。'
          : '音声を受け取れませんでした。もう一度押すか、下のボタンで操作できます。';
        stopMic(); render();
      };
      rec.onend = function () { if (disposed || recognition !== rec) return; recognition = null; pendingMic = false; listening = false; voiceMessage = 'マイクは停止中です。話すときにもう一度押してください。'; render(); };
      voiceMessage = 'マイクの開始を待っています。';
      try { rec.start(); } catch (error) { stopMic(); voiceMessage = 'マイクを開始できませんでした。下のボタンで操作できます。'; }
      render();
    }
    function playSample() {
      var sample = window.IkebukuroAudioSample;
      if (!sample || !sample.src) return;
      if (!sound) { audioMessage = '先に「音をオン」を押してください。'; render(); return; }
      stopAll('マイクを停止しました。');
      var token = generation;
      var player = new Audio(sample.src); audio = player;
      player.onended = function () { if (audio !== player || disposed) return; audio = null; audioMessage = '再生が終わりました。'; render(); };
      player.onerror = function () { if (audio !== player || disposed) return; stopAudio(); audioMessage = '音声を読み込めませんでした。本文で確認できます。'; render(); };
      audioMessage = '音声解説を再生しています。'; render();
      var promise = player.play();
      if (promise && typeof promise.then === 'function') promise.then(function () {
        if (disposed || token !== generation || audio !== player || !sound) { player.pause(); player.currentTime = 0; }
      }).catch(function () { if (!disposed && token === generation && audio === player) { stopAudio(); audioMessage = '音声を再生できませんでした。もう一度お試しください。'; render(); } });
    }
    function quiz() {
      var box = element('div', 'ik-demo__quiz');
      if (feature === 'reisho') {
        var toggle = button(cold ? '冷笑モード：オン' : '冷笑モード：オフ', function () { cold = !cold; render(); });
        toggle.setAttribute('aria-pressed', String(cold));
        add(box, element('p', 'ik-demo__note', '不正解や「わからない」に、ドパガキくんが声で反応。使うかどうかは自分で選べます。'), toggle,
          element('p', 'ik-demo__fine', '声は「音をオン」にしたときだけ流れます。'));
      }
      if (feature === 'voice') {
        var mic = button(listening ? 'マイクを停止' : pendingMic ? '開始を中止' : 'マイクで操作する', startMic, 'ik-demo__button ik-demo__button--primary');
        mic.setAttribute('aria-pressed', String(listening));
        add(box, element('p', 'ik-demo__note', '話すときだけマイクを起動。「1番」「次へ」「もう一度」で操作できます。音声認識にはブラウザのサービスを使います。'), mic,
          element('p', 'ik-demo__mic-status', voiceMessage || 'マイクは停止中です。許可しなくても、ボタンで体験できます。'));
        var commands = element('div', 'ik-demo__commands');
        ['1番', '2番', '3番', '次へ', 'もう一度'].forEach(function (text) { add(commands, button(text, function () { command(text); })); });
        add(box, element('p', 'ik-demo__fine', 'ボタンで同じ操作を試す'), commands);
      }
      if (finished) {
        var score = answers.filter(Boolean).length;
        add(box, element('p', 'ik-demo__eyebrow', '体験の結果'), element('h4', 'ik-demo__score', score + ' / 2 問正解'),
          element('p', 'ik-demo__note', announcement || (score === 2 ? '2問とも正解！' : '正解は apple＝りんご、cat＝ねこ。もう一度どうぞ。')),
          button('もう一度、2問に挑戦', reset, 'ik-demo__button ik-demo__button--primary'));
        return box;
      }
      var q = QUESTIONS[index];
      add(box, element('p', 'ik-demo__eyebrow', '紹介用のオリジナル問題 · ' + (index + 1) + ' / 2'),
        element('h4', 'ik-demo__question', '「' + q.word + '」の意味は？'));
      var choices = element('div', 'ik-demo__choices');
      q.choices.forEach(function (choice, n) {
        var node = button((n + 1) + '. ' + choice, function () { answer(n); }, 'ik-demo__choice');
        node.disabled = revealed;
        if (revealed && n === q.answer) node.classList.add('ik-demo__choice--correct');
        if (revealed && selected === n && n !== q.answer) node.classList.add('ik-demo__choice--wrong');
        add(choices, node);
      });
      add(box, choices);
      if (revealed) add(box, element('p', 'ik-demo__feedback', announcement + ' 正解は「' + q.choices[q.answer] + '」。'),
        button(index === 1 ? '結果を見る' : '次の問題へ', next, 'ik-demo__button ik-demo__button--primary'));
      else add(box, button('わからない', function () { answer(-1); }, 'ik-demo__button ik-demo__button--quiet'));
      return box;
    }
    function audioPanel() {
      var box = element('div', 'ik-demo__audio'), sample = window.IkebukuroAudioSample;
      add(box, element('p', 'ik-demo__note', '問題の解説を、耳でも確認。2問の英単語体験とは別に、公開済みの資格問題の音声と解説本文を体験できます。'));
      if (sample && sample.src) {
        if (sample.title) add(box, element('h4', '', sample.title));
        if (sample.question) add(box, element('p', '', sample.question));
        var text = sample.text || sample.transcript;
        if (text) add(box, element('p', 'ik-demo__transcript', text));
        add(box, button('音声解説を再生', playSample, 'ik-demo__button ik-demo__button--primary'), element('p', 'ik-demo__fine', audioMessage || '再生する前に「音をオン」を押してください。'));
        if (sample.source) add(box, element('p', 'ik-demo__fine', sample.source));
      } else add(box, element('p', 'ik-demo__note', '音声の見本は準備中です。'));
      return box;
    }
    function screenImage(file, alt) {
      var figure = element('figure', 'ik-demo__screen'), image = element('img');
      image.src = 'assets/' + file; image.alt = alt; image.loading = 'lazy';
      add(figure, image, element('figcaption', 'ik-demo__fine', 'アプリの実画面。下の操作部分は見本データです。'));
      return figure;
    }
    function planPanel() {
      var box = element('div', 'ik-demo__plan'), controls = element('div', 'ik-demo__commands');
      add(box, element('p', 'ik-demo__note', '今日、どこまで進めるかを小さく決める。空いている時間に合わせてみてください。'), screenImage('public-plan.webp', 'アプリの学習計画画面'), element('p', 'ik-demo__badge', '見本データ'));
      [5, 10, 15].forEach(function (n) { var node = button(n + '分', function () { minutes = n; render(); }); node.setAttribute('aria-pressed', String(minutes === n)); add(controls, node); });
      add(box, controls, element('p', 'ik-demo__plan-result', '今日の見本：' + minutes + '分で英単語' + minutes + '問'), element('p', 'ik-demo__fine', 'この紹介では予定や学習記録を保存しません。'));
      return box;
    }
    function rankingPanel() {
      var box = element('div', 'ik-demo__ranking');
      add(box, element('p', 'ik-demo__note', '少し進んだら、順位も変わる。下の点数を動かして体験できます。'), element('p', 'ik-demo__badge', '見本データ · 実際の利用者・実績ではありません'));
      var label = element('label', 'ik-demo__range-label', '自分の見本点数：' + points + '点'); label.htmlFor = id + '-points';
      var input = element('input', 'ik-demo__range'); input.type = 'range'; input.id = label.htmlFor; input.min = '0'; input.max = '100'; input.step = '10'; input.value = String(points);
      var table = element('ol', 'ik-demo__leaders');
      function rows() {
        label.textContent = '自分の見本点数：' + points + '点'; table.replaceChildren();
        [{ name: '自分', score: points, self: true }, { name: '見本のAさん', score: 80 }, { name: '見本のBさん', score: 60 }, { name: '見本のCさん', score: 30 }]
          .sort(function (a, b) { return b.score - a.score; }).forEach(function (person, n) { add(table, element('li', person.self ? 'ik-demo__leader ik-demo__leader--self' : 'ik-demo__leader', (n + 1) + '位　' + person.name + '　' + person.score + '点')); });
      }
      input.addEventListener('input', function () { points = Number(input.value); rows(); }); rows();
      add(box, label, input, table, element('p', 'ik-demo__fine', '点数を動かしても、本番のランキングや学習記録には反映されません。'));
      return box;
    }
    function render() {
      if (disposed) return;
      var focus = document.activeElement, wasInside = focus && root.contains(focus);
      var header = element('div', 'ik-demo__header');
      var title = element('h3', 'ik-demo__title', 'さわってみよう'); title.id = id + '-title';
      var toolbar = element('div', 'ik-demo__toolbar');
      var soundButton = button(sound ? '音をオフ' : '音をオン', function () { setSound(!sound); }); soundButton.setAttribute('aria-pressed', String(sound));
      add(toolbar, soundButton, button('すべて停止', function () { stopAll(); }, 'ik-demo__button ik-demo__stop'));
      add(header, title, toolbar);
      var tabs = element('div', 'ik-demo__tabs'); tabs.setAttribute('aria-label', '体験する機能');
      Object.keys(FEATURES).forEach(function (key) { var node = button(FEATURES[key], function () { showFeature(key); }, 'ik-demo__tab'); node.setAttribute('aria-pressed', String(feature === key)); add(tabs, node); });
      var panel = element('div', 'ik-demo__panel'); panel.setAttribute('aria-labelledby', id + '-feature');
      var heading = element('h4', 'ik-demo__feature-title', FEATURES[feature]); heading.id = id + '-feature'; heading.tabIndex = -1;
      add(panel, heading);
      if (feature === 'perfect') add(panel, element('p', 'ik-demo__note', '簡単な単語を2問。両方正解したら、アプリと同じ満点の演出へ。'));
      add(panel, feature === 'plan' ? planPanel() : feature === 'ranking' ? rankingPanel() : feature === 'audio' ? audioPanel() : quiz());
      var status = element('p', 'ik-demo__status', voiceMessage || (sound ? '音はオンです。いつでも停止できます。' : '音・マイクは、押すまでオフ。'));
      status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      var audienceNote = audience === 'student' ? '通学の合間にも、まず2問から。' : audience === 'exam' ? '資格の勉強も、まず2問から。' : '勉強を、まず2問から。';
      root.replaceChildren(header, element('p', 'ik-demo__fine', audienceNote + ' この体験は記録を保存しません。'), tabs, panel, status);
      if (wasInside) heading.focus({ preventScroll: true });
    }
    function showFeature(key) {
      if (disposed || !Object.prototype.hasOwnProperty.call(FEATURES, key)) return;
      stopAll('マイク・音声・演出を停止しました。'); feature = key; render();
    }
    function featureEvent(event) {
      var detail = event.detail;
      if (!detail || !Object.prototype.hasOwnProperty.call(FEATURES, detail.feature)) return;
      if (detail.reset === true) reset();
      showFeature(detail.feature);
    }
    function stopEvent() { stopAll(); }
    function soundEvent(event) {
      if (!event.detail || typeof event.detail.sound !== 'boolean') return;
      sound = event.detail.sound;
      if (!sound) stopAll('音をオフにして、すべて停止しました。');
      else render();
    }
    function pageHide() { stopAll('画面を離れたため、すべて停止しました。'); }
    function visibility() { if (document.hidden) pageHide(); }
    function hiddenByParent() {
      for (var node = host; node && node.nodeType === 1; node = node.parentElement) {
        // fanfare temporarily aria-hides its background while its dialog is open.
        // A slide's actual hidden/display state is the lifecycle boundary here.
        if (node.hidden || node.style.display === 'none' || node.style.visibility === 'hidden') return true;
      }
      return false;
    }
    var observer = typeof MutationObserver === 'function' ? new MutationObserver(function () {
      if ((recognition || audio || (window.QuizFanfare && window.QuizFanfare.isActive && window.QuizFanfare.isActive())) && hiddenByParent()) pageHide();
    }) : null;
    if (observer) observer.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['hidden', 'style'] });
    host.addEventListener('ikebukuro:feature', featureEvent);
    host.addEventListener('ikebukuro:stop', stopEvent);
    document.addEventListener('ikebukuro:stop', stopEvent);
    document.addEventListener('ikebukuro:soundchange', soundEvent);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pageHide);
    prefsSound(false); render();
    function dispose() {
      if (disposed) return;
      disposed = true; stopAll();
      host.removeEventListener('ikebukuro:feature', featureEvent);
      host.removeEventListener('ikebukuro:stop', stopEvent);
      document.removeEventListener('ikebukuro:stop', stopEvent);
      document.removeEventListener('ikebukuro:soundchange', soundEvent);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pageHide);
      if (observer) observer.disconnect();
      root.remove();
    }
    dispose.showFeature = showFeature;
    return dispose;
  }
  window.IkebukuroDemo = Object.freeze({ mount: mount });
})();
