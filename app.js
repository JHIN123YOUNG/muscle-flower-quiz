import { QuizGame, SIDES } from './game.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const bilingual = (zh, en) => `<span class="zh" lang="zh-Hant-HK">${escape(zh)}</span><span class="en" lang="en">${escape(en)}</span>`;
const text = (zh, en) => `${zh} · ${en}`;
const STORAGE_KEY = 'pass-and-play-game-v1';
const LANGUAGE_KEY = 'pass-and-play-language-v1';
let game;
let ticker = null;
let pendingConfirmation = null;
let storageAvailable = true;
let startupNotice = '';
let lastDrawAt = -Infinity;
let language = 'both';

function storageGet(key) { try { return localStorage.getItem(key); } catch { storageAvailable = false; return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { storageAvailable = false; } }
function save() { if (game) storageSet(STORAGE_KEY, game.serialize()); }
function applyLanguage(value) {
  language = ['zh', 'en', 'both'].includes(value) ? value : 'both';
  document.body.dataset.language = language;
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-Hant-HK';
  $('language').value = language;
  storageSet(LANGUAGE_KEY, language);
}
function communicate(zh, en) { $('live-status').textContent = language === 'zh' ? zh : language === 'en' ? en : text(zh, en); }
const stageCopy = {
  idle: ['一花在手，一起健肌', 'Pass the flower. Share a little knowledge.', '先選擇左右難度，再按「開始答題」；題目與計時會一起開始。', 'Choose a level for each player. Start reveals both questions and begins the clock.'],
  ready: ['兩位準備好了嗎？', 'A moment to get ready.', '每輪都可重新選難度。按「開始答題」後，才會揭題及開始 20 秒計時。', 'Choose each level again. Start reveals the questions and begins the 20-second clock.'],
  running: ['一起想，想到就舉手', 'Think together. Raise your hand.', '有人舉手，主持人立即按「暫停」或空白鍵。', 'When a hand goes up, the host presses Pause or Space.'],
  paused: ['時間停好了，慢慢回答', 'The clock is paused. Take your turn.', '先舉手的人先回答，再輪到另一位；兩位都確認後才顯示結果。', 'First hand raised answers first, then the other player. Results wait for both.'],
  completed: ['一起學習，就是收穫', 'Every round is a chance to learn.', '兩位都已作答。按「顯示答案」一起看看，再抽下一輪。', 'Both answers are in. Reveal the answers, then enjoy another round.'],
  timedout: ['時間到了，一起看看答案', 'Time’s up. Let’s learn together.', '未及暫停，本輪兩位均不計答對。按「顯示答案」，再輕鬆試一次。', 'Time ended before Pause, so neither answer counts as correct. Reveal and try again.']
};
function difficultyLabel(difficulty) { return difficulty === 'easy' ? text('簡單', 'Easy') : text('困難', 'Hard'); }
function sourceMarkup(question) {
  const source = question.sourcePage ? `原教材題號 ${question.sourceId} · 第 ${question.sourcePage} 頁` : `原教材題號 ${question.sourceId}`;
  const sourceEnglish = question.sourcePage ? `Original question ${question.sourceId} · page ${question.sourcePage}` : `Original question ${question.sourceId}`;
  const links = (question.sources || []).filter(item => /^https:\/\//.test(item.url)).map(item => `<a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.title || 'Reference')} ↗</a>`).join('');
  return `<details class="source-details"><summary>${bilingual('題目來源與補充資料', 'Question source & further reading')}</summary><p>${bilingual(source, sourceEnglish)}</p>${links}</details>`;
}
function panelMarkup(side) {
  const state = game.state;
  const question = ['idle', 'ready'].includes(state.phase) ? null : game.question(side);
  const submitted = state.answers[side];
  const canAnswer = state.phase === 'paused' && !submitted;
  const controlsAllowed = ['idle', 'ready'].includes(state.phase);
  const isLeft = side === 'left';
  const heading = `<header class="player-heading"><div class="player-name"><span class="player-initial" aria-hidden="true">${isLeft ? 'A' : 'B'}</span><h2 id="${side}-name">${bilingual(isLeft ? '左邊的朋友' : '右邊的朋友', isLeft ? 'Player on the left' : 'Player on the right')}</h2></div><label class="difficulty-label" for="${side}-difficulty"><span>${bilingual(`餘 ${game.remaining(state.difficulty[side])} 題`, `${game.remaining(state.difficulty[side])} LEFT`)}</span><select id="${side}-difficulty" aria-label="${isLeft ? '左邊難度 Left difficulty' : '右邊難度 Right difficulty'}" ${controlsAllowed ? '' : 'disabled'}><option value="easy" ${state.difficulty[side] === 'easy' ? 'selected' : ''}>簡單 · Easy</option><option value="hard" ${state.difficulty[side] === 'hard' ? 'selected' : ''}>困難 · Hard</option></select></label></header>`;
  if (!question) return `${heading}<div class="empty-card"><img class="empty-flower" src="./flower.svg" alt="" width="120" height="120"><h3>${bilingual(isLeft ? '準備接花了嗎？' : '把好心情傳下去', isLeft ? 'Ready for your flower?' : 'Let good things grow.')}</h3><p>${bilingual('選好難度，按「開始答題」才會揭題', 'Choose your level. Questions appear when you press Start.')}</p></div>`;
  const options = question.options.map(option => {
    const isSelected = state.selected[side] === option.id;
    const isCorrect = state.answersVisible && option.id === question.correctOptionId;
    return `<button id="${side}-option-${escape(option.id)}" type="button" class="option${isSelected ? ' selected' : ''}${isCorrect ? ' correct-answer' : ''}" data-side="${side}" data-option="${escape(option.id)}" aria-pressed="${isSelected}" ${canAnswer ? '' : 'disabled'}><span class="option-letter" aria-hidden="true">${escape(option.id.toUpperCase())}</span><span class="option-copy">${bilingual(option.zh, option.en)}</span>${isCorrect ? '<span class="sr-only">正確答案 Correct answer</span>' : ''}</button>`;
  }).join('');
  let actions;
  const result = game.result(side);
  if (result) {
    const message = result.reason === 'timeout' ? ['本輪未作答', 'No answer this round', '·'] : result.reason === 'skip' ? ['一起看看答案', 'Let’s discover the answer', '✧'] : result.correct ? ['答對了！', 'That’s right!', '✓'] : ['差一點，一起學習', 'A little more to learn', '✧'];
    actions = `<p class="panel-status ${result.correct ? 'success' : 'neutral'}" data-result="${result.correct ? 'correct' : 'not-correct'}"><span class="status-mark" aria-hidden="true">${message[2]}</span><span>${bilingual(message[0], message[1])}</span></p>`;
  } else if (submitted) {
    actions = `<p class="panel-status recorded" data-recorded="true"><span class="status-mark" aria-hidden="true">✓</span><span>${bilingual('答案已記錄', 'Answer recorded')}</span></p>`;
  } else {
    actions = `<button class="confirm-answer" id="${side}-confirm" data-confirm="${side}" type="button" ${canAnswer && state.selected[side] ? '' : 'disabled'}>${bilingual('確認答案', 'Confirm answer')}<span aria-hidden="true">↗</span></button><button class="skip-answer" id="${side}-skip" data-skip="${side}" type="button" ${canAnswer ? '' : 'disabled'}>${bilingual('暫時未想到', 'Pass this question')}</button>`;
  }
  let explanation = '';
  if (state.answersVisible) {
    const correct = question.options.find(option => option.id === question.correctOptionId);
    explanation = `<div class="answer-explanation"><h3>${bilingual(`正確答案：${correct.id.toUpperCase()} · ${correct.zh}`, `Correct answer: ${correct.id.toUpperCase()} · ${correct.en}`)}</h3><p>${bilingual(question.explanation?.zh || '', question.explanation?.en || '')}</p>${sourceMarkup(question)}</div>`;
  }
  return `${heading}<div class="question-area"><div class="question-meta"><span class="difficulty-dot"></span>${bilingual(question.difficulty === 'easy' ? '簡單' : '困難', question.difficulty === 'easy' ? 'EASY' : 'HARD')}<span aria-hidden="true">/</span>${bilingual(question.type === 'tf' ? '是非題' : '選擇題', question.type === 'tf' ? 'TRUE OR FALSE' : 'MULTIPLE CHOICE')}</div><h3 class="question-text">${bilingual(question.question.zh, question.question.en)}</h3><div class="options ${question.options.length > 2 ? 'four-options' : 'two-options'}" role="group" aria-label="${isLeft ? '左邊答案選項 Left answer choices' : '右邊答案選項 Right answer choices'}">${options}</div><div class="answer-actions">${actions}</div>${explanation}</div>`;
}
function renderTimer() {
  const state = game.state;
  $('timer').textContent = Math.ceil(state.remainingMs / 1000).toString().padStart(2, '0');
  $('timer').setAttribute('aria-label', `${Math.ceil(state.remainingMs / 1000)} 秒 seconds`);
  $('timer-ring').className = `timer-ring ${state.phase === 'running' ? (state.remainingMs <= 5000 ? 'running urgent' : 'running') : ['paused', 'completed'].includes(state.phase) ? 'paused' : state.phase === 'timedout' ? 'ended' : ''}`;
}
function renderNotice() {
  const messages = [];
  for (const warning of game.state.warnings) {
    if (warning.startsWith('renewed:')) {
      const isEasy = warning.endsWith('easy');
      messages.push(bilingual(`${isEasy ? '簡單' : '困難'}題庫已抽完，開始新一輪抽題紀錄。`, `${isEasy ? 'Easy' : 'Hard'} question pool completed. A fresh cycle has begun.`));
    } else if (warning === 'similar-topic') messages.push(bilingual('餘下題目主題較接近，本輪優先避免重複題目。', 'The remaining topics overlap; this pair still uses different questions.'));
  }
  if (startupNotice) messages.push(startupNotice);
  if (!storageAvailable) messages.push(bilingual('此瀏覽器未能儲存進度；重新整理會重設遊戲。', 'This browser cannot save progress. Refreshing will reset the game.'));
  $('notice').innerHTML = messages.join('<br>');
  $('notice').hidden = messages.length === 0;
}
function render() {
  if (!game) return;
  const focusId = document.activeElement?.id;
  const state = game.state;
  const copy = state.answersVisible ? ['把健肌小知識帶回家', 'A little knowledge to take with you.', '答案已顯示。可在題目卡內向下捲動閱讀解說，再開始下一輪。', 'Answers are revealed. Scroll within each card for explanations, then draw the next round.'] : stageCopy[state.phase];
  $('stage-title').innerHTML = bilingual(copy[0], copy[1]);
  $('stage-hint').innerHTML = bilingual(copy[2], copy[3]);
  $('round-number').textContent = String(['idle', 'ready'].includes(state.phase) ? state.round + 1 : state.round).padStart(2, '0');
  $('timer-caption').innerHTML = ['idle', 'ready'].includes(state.phase) ? bilingual('共用思考時間', 'Shared thinking time') : state.phase === 'running' ? bilingual('兩位一起想', 'Think together') : state.phase === 'timedout' ? bilingual('本輪已結束', 'Round ended') : bilingual('已為兩位暫停', 'Paused for both');
  for (const side of SIDES) $(side + '-panel').innerHTML = panelMarkup(side);
  $('draw').innerHTML = `<span class="button-icon" aria-hidden="true">→</span><span>${bilingual('下一輪', 'Next round')}</span>`;
  $('draw').classList.toggle('primary', state.answersVisible && ['completed', 'timedout'].includes(state.phase));
  $('draw').disabled = ['idle', 'ready'].includes(state.phase);
  $('home').disabled = false;
  $('start').disabled = !['idle', 'ready'].includes(state.phase);
  $('start').classList.toggle('primary', ['idle', 'ready'].includes(state.phase));
  $('pause').disabled = state.phase !== 'running';
  $('pause').classList.toggle('primary', state.phase === 'running');
  $('reveal').disabled = !['completed', 'timedout'].includes(state.phase) || state.answersVisible;
  $('reveal').classList.toggle('primary', ['completed', 'timedout'].includes(state.phase) && !state.answersVisible);
  renderTimer();
  renderNotice();
  if (ticker) { clearInterval(ticker); ticker = null; }
  if (state.phase === 'running') ticker = setInterval(checkClock, 100);
  const previousFocus = focusId && $(focusId);
  if (previousFocus && !previousFocus.disabled) previousFocus.focus({ preventScroll: true });
}
function checkClock() {
  if (!game || game.state.phase !== 'running') return;
  const ended = game.tick();
  if (ended) { save(); render(); communicate('時間到了。按顯示答案，一起學習。', 'Time’s up. Reveal the answers to learn together.'); }
  else renderTimer();
}
function update(action) {
  const changed = action();
  if (changed) { startupNotice = ''; save(); render(); }
  return changed;
}
function askConfirmation(titleZh, titleEn, messageZh, messageEn, action) {
  if ($('confirm-dialog').open) return;
  $('confirm-title').innerHTML = bilingual(titleZh, titleEn);
  $('confirm-message').innerHTML = bilingual(messageZh, messageEn);
  pendingConfirmation = action;
  $('confirm-dialog').showModal();
  $('confirm-cancel').focus();
}
function draw() {
  if (Date.now() - lastDrawAt < 600 || ['idle', 'ready'].includes(game.state.phase)) return;
  const run = () => {
    if (update(() => game.prepare())) {
      lastDrawAt = Date.now();
      communicate('已準備下一輪。可重新選擇左右難度；按開始答題才會揭題。', 'The next round is ready to set up. Choose both levels; Start will reveal the questions.');
      $('left-difficulty').focus({ preventScroll: true });
    }
  };
  if (['running', 'paused'].includes(game.state.phase)) askConfirmation('準備下一輪？', 'Set up the next round?', '本輪還未完成。確認後會清除兩位本輪的選擇，返回難度設定；按開始答題前不會抽出新題目。', 'This round is unfinished. Both current selections will be cleared and you will return to level setup. No new questions are drawn until Start.', run);
  else run();
}
function startRound() {
  if (!game || !['idle', 'ready'].includes(game.state.phase) || $('confirm-dialog').open) return;
  const needs = game.renewalsNeeded();
  const run = () => {
    if (update(() => game.start({ allowRenewal: needs.length > 0 }))) communicate('兩道題目已顯示，20 秒計時開始。有人舉手，請按暫停。', 'Both questions are revealed and the 20-second clock has started. Press Pause when a hand goes up.');
  };
  if (needs.length) {
    const namesZh = needs.map(level => `${level === 'easy' ? '簡單' : '困難'}題餘 ${game.remaining(level)} 題`).join('；');
    const namesEn = needs.map(level => `${level === 'easy' ? 'Easy' : 'Hard'}: ${game.remaining(level)} left`).join('; ');
    askConfirmation('重新洗牌並開始答題？', 'Reshuffle and start?', `${namesZh}，不足開始本輪。確認後會先用完餘題，再重新洗牌，並同時揭題及開始 20 秒計時；已出現過的題目將可再次抽出。`, `${namesEn}. This round needs a reshuffle. Confirm to use any remaining question, reshuffle, reveal both questions and start the 20-second clock. Previous questions become eligible again.`, run);
  } else run();
}
function pause() {
  if (!game || $('confirm-dialog').open || $('about-dialog').open) return;
  const previousPhase = game.state.phase;
  const paused = game.pause();
  if (paused || previousPhase !== game.state.phase) { save(); render(); }
  if (paused) communicate('兩位的計時已暫停。先舉手的人先回答，再輪到另一位。', 'The clock is paused for both. First hand raised answers first, then the other player.');
  else if (previousPhase !== game.state.phase && game.state.phase === 'timedout') communicate('時間到了。按顯示答案，一起學習。', 'Time’s up. Reveal the answers to learn together.');
}
function afterSubmit(side, skip = false) {
  if (!update(() => game.submit(side, { skip }))) return;
  if (game.state.phase === 'completed') { communicate('兩位都已作答，結果已顯示。可按顯示答案。', 'Both answers are in. Results are shown. You can now reveal the answers.'); $('reveal').focus({ preventScroll: true }); }
  else { communicate('答案已記錄，請另一位作答。', 'Answer recorded. The other player can now answer.');
    const other = side === 'left' ? 'right' : 'left';
    document.querySelector(`#${other}-panel .option:not(:disabled)`)?.focus({ preventScroll: true }); }
}

applyLanguage(storageGet(LANGUAGE_KEY));
$('language').addEventListener('change', event => { applyLanguage(event.target.value); render(); });
$('help').addEventListener('click', () => $('about-dialog').showModal());
$('close-about').addEventListener('click', () => $('about-dialog').close());
$('confirm-cancel').addEventListener('click', () => { pendingConfirmation = null; $('confirm-dialog').close(); });
$('confirm-dialog').addEventListener('cancel', () => { pendingConfirmation = null; });
$('confirm-proceed').addEventListener('click', () => { const action = pendingConfirmation; pendingConfirmation = null; $('confirm-dialog').close(); action?.(); });
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else throw new Error('Unsupported');
  } catch { communicate('此瀏覽器未能開啟全螢幕；可使用瀏覽器的全螢幕功能。', 'Full screen is unavailable here; use your browser’s full-screen option.'); }
});
function requestRestart() {
  if (!game) return;
  if ($('about-dialog').open) $('about-dialog').close();
  askConfirmation('返回開始頁面？', 'Return to the start?', '這會清除目前題目、答案及抽題紀錄。下一次開始答題會由第一輪開始；語言及左右難度設定會保留。', 'This clears the current questions, answers, and question history. The next game begins at round 1; language and difficulty settings are kept.', () => {
    game.resetHistory();
    startupNotice = '';
    lastDrawAt = -Infinity;
    save();
    render();
    communicate('已返回開始頁面。下一次開始答題會由第一輪開始。', 'You are back at the start. The next game begins at round 1.');
    $('start').focus({ preventScroll: true });
  });
}
$('home').addEventListener('click', requestRestart);
$('reset-history').addEventListener('click', requestRestart);
$('draw').addEventListener('click', () => game && draw());
$('start').addEventListener('click', startRound);
$('pause').addEventListener('click', pause);
$('reveal').addEventListener('click', () => { if (game && update(() => game.reveal())) communicate('正確答案及解說已顯示。', 'The correct answers and explanations are revealed.'); });
document.querySelector('.players').addEventListener('change', event => {
  const side = SIDES.find(s => event.target.id === `${s}-difficulty`);
  if (side && game) update(() => game.setDifficulty(side, event.target.value));
});
document.querySelector('.players').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!game || !button || button.disabled) return;
  if (button.dataset.option) update(() => game.choose(button.dataset.side, button.dataset.option));
  else if (button.dataset.confirm) afterSubmit(button.dataset.confirm);
  else if (button.dataset.skip) afterSubmit(button.dataset.skip, true);
});
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || !game || game.state.phase !== 'running') return;
  if (event.target.closest('input,textarea,select,[contenteditable="true"]') || $('confirm-dialog').open || $('about-dialog').open) return;
  event.preventDefault();
  pause();
});
document.addEventListener('visibilitychange', checkClock);
window.addEventListener('pageshow', checkClock);
window.addEventListener('pagehide', () => { if (game) { game.tick(); save(); } });

for (const id of ['draw', 'start', 'pause', 'reveal']) $(id).disabled = true;
$('stage-hint').innerHTML = bilingual('正在準備題目…', 'Preparing the questions…');
try {
  const response = await fetch('./questions.json', { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Question bank: HTTP ${response.status}`);
  const bank = await response.json();
  game = new QuizGame(bank);
  const previous = storageGet(STORAGE_KEY);
  if (previous && game.restore(previous)) communicate('已保留本機進度。', 'Your progress in this browser has been restored.');
  else if (previous) startupNotice = bilingual('遊戲已更新，請選擇難度後開始新的遊戲。', 'The game was updated. Choose your levels to start a fresh game.');
  save();
  render();
} catch (error) {
  $('stage-title').innerHTML = bilingual('題目暫時未能載入', 'The questions could not load');
  $('stage-hint').innerHTML = bilingual('請確認網絡連線後重新整理頁面。', 'Check your connection and refresh the page.');
  $('notice').hidden = false;
  $('notice').innerHTML = bilingual('如你正在開啟下載檔案，請依隨附說明啟動本機伺服器。', 'If you downloaded the files, start the local server described in the included guide.');
  console.error(error);
}
