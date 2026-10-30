(() => {
  'use strict';
  const content = window.IkebukuroContent;
  const variant = document.body.dataset.variant || 'a';
  let audience = 'general';
  let duration = '30';
  let slide = 0;
  let disposeDemo;
  const icons = {
    smile: '<circle cx="12" cy="12" r="9"/><path d="M7 9h3m4 0h3M8 15q4 3 8-1"/>',
    spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
    headphone: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
    mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4m-4 0h8"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-13 5 3 2 5-4"/>',
    flag: '<path d="M5 22V3c5-4 9 4 14 0v12c-5 4-9-4-14 0"/>'
  };
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
  const comparison = () => `<nav class="compare-nav" aria-label="紹介の見比べ"><span>見比べる</span>${[['a', 'index.html', 'A じっくり'], ['b', 'stage.html', 'B ひとこと'], ['c', 'tour.html', 'C 3枚ツアー']].map(([key, href, label]) => `<a href="${href}"${variant === key ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
  const choices = () => `<fieldset class="audience-control"><legend>どんな勉強に？</legend><div class="segmented">${Object.entries(content.audiences).map(([key, item]) => `<button type="button" data-audience="${key}" aria-pressed="${key === audience}">${item.label}</button>`).join('')}</div></fieldset>`;
  const script = () => `<section class="talk-panel" aria-labelledby="talk-title"><div class="talk-head"><h2 id="talk-title">ひとことで伝えるなら</h2><div class="duration-control" role="group" aria-label="話す長さの目安">${['5', '10', '30'].map((sec) => `<button type="button" data-duration="${sec}" aria-pressed="${duration === sec}">${sec}秒</button>`).join('')}</div></div><div class="talk-copy" data-talk-copy aria-live="polite"></div><p class="fine">秒数は話す長さの目安です。</p></section>`;
  const featureCards = (style = '') => `<div class="feature-grid ${style}">${content.features.map((f) => `<button class="feature-card" type="button" data-feature="${f.key}"><span class="feature-icon">${icon(f.icon)}</span><span class="feature-copy"><span class="feature-label"><span class="feature-number">${f.number}</span>${f.label}</span><strong>${f.line}</strong><span class="feature-description">${f.text}</span><span class="feature-link">見本に触れる <span aria-hidden="true">↗</span></span></span></button>`).join('')}</div>`;
  const demo = () => `<section class="experience-section" id="experience" aria-labelledby="experience-title"><div class="section-heading"><span class="eyebrow">まずは、自分の指で。</span><h2 id="experience-title" tabindex="-1">2問だけ、触ってみよう。</h2><p>ここからは紹介用の見本。音は、自分でオンにしたときだけ。</p></div><div data-demo-host class="demo-host"><p>体験の準備をしています。</p></div></section>`;
  const finish = () => `<section class="finish-section"><span class="eyebrow">気になったら、そのつづきへ。</span><h2>あなたの勉強に、<br>合うかどうか。</h2><p>まずは触って、確かめてみてください。</p><div class="destination-pending"><span class="pending-dot" aria-hidden="true"></span><strong>次の行き先は確認中</strong><span>公開URL・QRは、内容確認後にご案内します。</span></div><a class="reference-link" href="https://dopagakiquiz.com/" target="_blank" rel="noopener noreferrer">参考：現在のブラウザ版を見る <span aria-hidden="true">↗</span><span class="sr-only">（新しいタブ）</span></a></section>`;
  const character = (className = '') => `<img class="character ${className}" src="assets/character.webp" alt="ドパガキくん" width="600" height="600">`;
  const header = `<a class="skip-link" href="#main">本文へ進む</a><header class="site-header"><a href="index.html" class="brand" aria-label="ドパガキ問題集 紹介トップ"><span class="brand-mark" aria-hidden="true">${icon('smile')}</span><span>ドパガキ問題集<small>勉強に、遊び心を。</small></span></a>${comparison()}</header>`;
  const footer = `<footer class="site-footer"><span>ドパガキ問題集</span><span>音声・マイク・演出は操作してから。<br>この紹介の回答や記録は、本番アプリに入りません。</span></footer>`;
  const heroCopy = () => `<span class="eyebrow">勉強を、つい続けたくなる体験へ。</span><h1 data-hero-title></h1><p class="hero-intro" data-hero-intro></p>`;
  let main;
  if (variant === 'b') {
    main = `<main id="main"><section class="stage-hero"><div class="stage-topline"><span class="edition">ひとことから、はじめよう。</span>${choices()}</div><div class="stage-statement">${heroCopy()}</div><div class="stage-bottom"><a class="primary-button" href="#experience" data-open-demo>まず、2問だけ <span aria-hidden="true">↗</span></a><span>解く。聞く。ちょっと笑う。</span></div><div class="stage-character">${character()}<span class="character-bubble">まだ、いけるでしょ。</span></div><div class="stage-rule" aria-hidden="true"></div></section><div class="stage-talk wrap">${script()}</div><section class="stage-feature-section wrap"><div class="section-heading"><span class="eyebrow">小さな楽しみ、6つ。</span><h2>いつもの勉強に、<br>何を足してみる？</h2></div>${featureCards('feature-rows')}</section><div class="wrap">${demo()}${finish()}</div></main>`;
  } else if (variant === 'c') {
    main = `<main id="main" class="tour-main"><div class="tour-topline wrap">${choices()}<span class="tour-hint">3枚で紹介。自分のペースでどうぞ。</span></div><div class="tour-slides wrap"><section class="tour-slide" data-slide="0" aria-labelledby="slide-title-0"><div class="tour-cover"><div><span class="eyebrow">01 / 体験する</span><h1 id="slide-title-0" tabindex="-1" data-hero-title></h1><p class="hero-intro" data-hero-intro></p></div><div class="tour-character">${character()}</div></div>${demo()}<details class="tour-script"><summary>紹介のひとことを見る</summary>${script()}</details></section><section class="tour-slide" data-slide="1" aria-labelledby="slide-title-1" hidden><div class="section-heading"><span class="eyebrow">02 / 好きな楽しみを選ぶ</span><h2 id="slide-title-1" tabindex="-1">「もう1問」に、<br>こんなきっかけを。</h2><p>選ぶと、1枚目の見本に移ります。</p></div>${featureCards()}</section><section class="tour-slide" data-slide="2" aria-labelledby="slide-title-2" hidden><div class="tour-last"><span class="eyebrow">03 / 次の一歩</span><h2 id="slide-title-2" tabindex="-1">勉強のつづきが、<br>少し楽しみに<br>なったなら。</h2>${finish()}<button type="button" class="secondary-button" data-restart>もう一度、体験する <span aria-hidden="true">↶</span></button></div></section></div><nav class="tour-pagination" aria-label="紹介スライド"><button type="button" data-slide-prev aria-label="前のスライド">← 前へ</button><div class="tour-dots" role="group" aria-label="スライドを選ぶ">${['体験', '6つの楽しみ', '次の一歩'].map((s, i) => `<button type="button" data-slide-to="${i}" aria-label="${i + 1}枚目：${s}" aria-current="${i === 0 ? 'step' : 'false'}"><span aria-hidden="true">${i + 1}</span><span class="dot-label">${s}</span></button>`).join('')}</div><button type="button" data-slide-next>次へ →</button></nav></main>`;
  } else {
    main = `<main id="main"><section class="friendly-hero wrap"><div class="hero-text">${heroCopy()}<a class="primary-button" href="#experience" data-open-demo>まずは2問、触ってみる <span aria-hidden="true">↗</span></a><p class="quiet-note">音はオフから。自分のペースで。</p></div><div class="friendly-art"><div class="rainbow-orbit" aria-hidden="true"></div>${character()}<span class="art-note art-note-one">解く。</span><span class="art-note art-note-two">聞く。</span><span class="art-note art-note-three">ちょっと笑う。</span></div></section><div class="wrap"><section class="intro-controls">${choices()}${script()}</section>${demo()}<section class="features-section" aria-labelledby="features-title"><div class="section-heading"><span class="eyebrow">その日の気分で、好きな楽しみを。</span><h2 id="features-title">続きが気になる、<br>6つのきっかけ。</h2></div>${featureCards()}</section>${finish()}</div></main>`;
  }
  document.getElementById('page').innerHTML = header + main + footer;
  const updateCopy = () => {
    const data = content.audiences[audience];
    document.querySelectorAll('[data-hero-title]').forEach((el) => { el.replaceChildren(...data.title.split('\n').flatMap((line, i) => i ? [document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)])); });
    document.querySelectorAll('[data-hero-intro]').forEach((el) => { el.textContent = data.intro; });
    document.querySelectorAll('[data-talk-copy]').forEach((el) => { el.innerHTML = data.scripts[duration].map((line) => `<p>${esc(line)}</p>`).join(''); });
    document.querySelectorAll('[data-audience]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.audience === audience)));
    document.querySelectorAll('[data-duration]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.duration === duration)));
  };
  const mountDemo = () => {
    if (typeof disposeDemo === 'function') disposeDemo();
    const host = document.querySelector('[data-demo-host]');
    if (window.IkebukuroDemo) disposeDemo = window.IkebukuroDemo.mount(host, { audience });
    else host.innerHTML = '<p>体験を読み込めませんでした。ページを再読み込みしてください。</p>';
  };
  const goSlide = (next, focus = true) => {
    slide = Math.max(0, Math.min(2, next));
    document.querySelectorAll('[data-slide]').forEach((el) => { el.hidden = Number(el.dataset.slide) !== slide; });
    document.querySelectorAll('[data-slide-to]').forEach((el) => el.setAttribute('aria-current', Number(el.dataset.slideTo) === slide ? 'step' : 'false'));
    document.querySelector('[data-slide-prev]').disabled = slide === 0;
    document.querySelector('[data-slide-next]').disabled = slide === 2;
    if (slide !== 0) document.querySelector('[data-demo-host]').dispatchEvent(new CustomEvent('ikebukuro:stop'));
    if (focus) {
      const heading = document.getElementById(`slide-title-${slide}`);
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  };
  const openExperience = (feature, reset = false) => {
    if (variant === 'c') goSlide(0, false);
    if (feature) document.querySelector('[data-demo-host]').dispatchEvent(new CustomEvent('ikebukuro:feature', { detail: { feature, reset } }));
    const title = document.getElementById('experience-title');
    title.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    title.focus({ preventScroll: true });
  };
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button,a');
    if (!button) return;
    if (button.dataset.audience) { audience = button.dataset.audience; updateCopy(); mountDemo(); }
    if (button.dataset.duration) { duration = button.dataset.duration; updateCopy(); }
    if (button.dataset.feature) openExperience(button.dataset.feature);
    if (button.hasAttribute('data-open-demo')) { event.preventDefault(); openExperience('perfect', true); }
    if (button.hasAttribute('data-slide-to')) goSlide(Number(button.dataset.slideTo));
    if (button.hasAttribute('data-slide-prev')) goSlide(slide - 1);
    if (button.hasAttribute('data-slide-next')) goSlide(slide + 1);
    if (button.hasAttribute('data-restart')) { goSlide(0); openExperience('perfect', true); }
  });
  updateCopy();
  mountDemo();
  if (variant === 'c') goSlide(0, false);
  window.addEventListener('pagehide', () => {
    document.querySelector('[data-demo-host]').dispatchEvent(new CustomEvent('ikebukuro:stop'));
  });
})();
