/** Browser-independent state machine. Time is supplied by an injected wall clock. */
export const ROUND_MS = 20_000;
export const SIDES = ['left', 'right'];
export const STORAGE_VERSION = 1;
const phases = new Set(['idle', 'ready', 'running', 'paused', 'completed', 'timedout']);
const blankAnswers = () => ({ left: null, right: null });
const shuffle = (items, random) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
export function similarTopics(a, b) {
  const aTopics = new Set(a.avoidTopics || [a.topic]);
  return (b.avoidTopics || [b.topic]).some(topic => aTopics.has(topic));
}
export class QuizGame {
  constructor(bank, { now = () => Date.now(), random = Math.random } = {}) {
    if (!Array.isArray(bank) || bank.length < 2) throw new Error('Question bank is unavailable.');
    this.bank = bank;
    this.byId = new Map(bank.map(question => [question.id, question]));
    if (this.byId.size !== bank.length) throw new Error('Question IDs must be unique.');
    this.now = now;
    this.random = random;
    this.fingerprint = bank.map(q => `${q.id}:${q.correctOptionId}:${q.difficulty}`).join('|');
    this.state = this.initial();
  }
  initial() {
    return { phase: 'idle', round: 0, difficulty: { left: 'easy', right: 'easy' },
      questionIds: blankAnswers(), selected: blankAnswers(), answers: blankAnswers(),
      remainingMs: ROUND_MS, deadline: null, answersVisible: false,
      seen: { easy: [], hard: [] }, warnings: [] };
  }
  question(side) { return this.byId.get(this.state.questionIds[side]) || null; }
  setDifficulty(side, difficulty) {
    if (!SIDES.includes(side) || !['easy', 'hard'].includes(difficulty)) return false;
    if (!['idle', 'completed', 'timedout'].includes(this.state.phase)) return false;
    this.state.difficulty[side] = difficulty;
    return true;
  }
  remaining(difficulty) {
    return this.bank.filter(q => q.difficulty === difficulty && !this.state.seen[difficulty].includes(q.id)).length;
  }
  renewalsNeeded() {
    const required = { easy: 0, hard: 0 };
    for (const side of SIDES) required[this.state.difficulty[side]]++;
    return ['easy', 'hard'].filter(level => required[level] > 0 && this.remaining(level) < required[level]);
  }
  draw({ allowRenewal = false } = {}) {
    if (!allowRenewal && this.renewalsNeeded().length) return false;
    const state = this.state;
    const seen = { easy: [...state.seen.easy], hard: [...state.seen.hard] };
    const warnings = [];
    const pools = {};
    for (const difficulty of ['easy', 'hard']) {
      pools[difficulty] = this.bank.filter(q => q.difficulty === difficulty);
    }
    const [leftDifficulty, rightDifficulty] = [state.difficulty.left, state.difficulty.right];
    if (!pools[leftDifficulty].length || !pools[rightDifficulty].length ||
        (leftDifficulty === rightDifficulty && pools[leftDifficulty].length < 2)) return false;
    const candidates = (difficulty, excludes = []) => {
      let result = pools[difficulty].filter(q => !seen[difficulty].includes(q.id) && !excludes.includes(q.id));
      if (!result.length) {
        seen[difficulty] = [];
        warnings.push(`renewed:${difficulty}`);
        result = pools[difficulty].filter(q => !excludes.includes(q.id));
      }
      return shuffle(result, this.random);
    };
    const leftPool = candidates(leftDifficulty);
    // A single remaining same-level question finishes its cycle before the next pool renews.
    const sameCycleLast = leftDifficulty === rightDifficulty && leftPool.length === 1;
    let rightPool;
    if (sameCycleLast) {
      rightPool = shuffle(pools[rightDifficulty].filter(q => q.id !== leftPool[0].id), this.random);
    } else {
      rightPool = candidates(rightDifficulty);
    }
    let pair = null;
    for (const left of leftPool) {
      for (const right of rightPool) {
        if (left.id !== right.id && !similarTopics(left, right)) { pair = [left, right]; break; }
      }
      if (pair) break;
    }
    if (!pair) {
      outer: for (const left of leftPool) for (const right of rightPool) {
        if (left.id !== right.id) { pair = [left, right]; break outer; }
      }
      warnings.push('similar-topic');
    }
    if (!pair) return false;
    if (sameCycleLast) {
      seen[leftDifficulty] = [pair[1].id];
      warnings.push(`renewed:${leftDifficulty}`);
    } else {
      for (const question of pair) seen[question.difficulty].push(question.id);
    }
    this.state = { ...state, phase: 'ready', round: state.round + 1,
      questionIds: { left: pair[0].id, right: pair[1].id }, selected: blankAnswers(), answers: blankAnswers(),
      remainingMs: ROUND_MS, deadline: null, answersVisible: false, seen, warnings: [...new Set(warnings)] };
    return true;
  }
  start() {
    if (this.state.phase !== 'ready') return false;
    this.state.phase = 'running';
    this.state.remainingMs = ROUND_MS;
    this.state.deadline = this.now() + ROUND_MS;
    return true;
  }
  tick() {
    if (this.state.phase !== 'running') return false;
    this.state.remainingMs = Math.max(0, Math.min(ROUND_MS, this.state.deadline - this.now()));
    if (this.state.remainingMs === 0) {
      this.state.phase = 'timedout';
      this.state.deadline = null;
      for (const side of SIDES) this.state.answers[side] = { choice: null, reason: 'timeout' };
      this.state.selected = blankAnswers();
      return true;
    }
    return false;
  }
  pause() {
    this.tick(); // Deadline wins at exactly zero, including a throttled/inactive tab.
    if (this.state.phase !== 'running') return false;
    this.state.phase = 'paused';
    this.state.deadline = null;
    return true;
  }
  choose(side, optionId) {
    if (this.state.phase !== 'paused' || !SIDES.includes(side) || this.state.answers[side]) return false;
    if (!this.question(side)?.options.some(option => option.id === optionId)) return false;
    this.state.selected[side] = optionId;
    return true;
  }
  submit(side, { skip = false } = {}) {
    if (this.state.phase !== 'paused' || !SIDES.includes(side) || this.state.answers[side]) return false;
    const choice = this.state.selected[side];
    if (!choice && !skip) return false;
    this.state.answers[side] = { choice: skip ? null : choice, reason: skip ? 'skip' : 'answer' };
    if (skip) this.state.selected[side] = null;
    if (SIDES.every(s => this.state.answers[s])) this.state.phase = 'completed';
    return true;
  }
  result(side) {
    if (!['completed', 'timedout'].includes(this.state.phase)) return null;
    const answer = this.state.answers[side];
    return { correct: answer?.choice === this.question(side)?.correctOptionId, reason: answer?.reason };
  }
  reveal() {
    if (!['completed', 'timedout'].includes(this.state.phase)) return false;
    this.state.answersVisible = true;
    return true;
  }
  resetHistory() {
    const difficulty = { ...this.state.difficulty };
    this.state = this.initial();
    this.state.difficulty = difficulty;
  }
  serialize() {
    return JSON.stringify({ version: STORAGE_VERSION, fingerprint: this.fingerprint, state: this.state });
  }
  restore(serialized) {
    try {
      const saved = JSON.parse(serialized);
      const state = saved.state;
      if (saved.version !== STORAGE_VERSION || saved.fingerprint !== this.fingerprint || !state || !phases.has(state.phase)) return false;
      if (!Number.isInteger(state.round) || state.round < 0 || !Number.isFinite(state.remainingMs) || state.remainingMs < 0 || state.remainingMs > ROUND_MS) return false;
      if (typeof state.answersVisible !== 'boolean' || !Array.isArray(state.warnings)) return false;
      for (const difficulty of ['easy', 'hard']) {
        if (!Array.isArray(state.seen?.[difficulty]) || state.seen[difficulty].some(id => this.byId.get(id)?.difficulty !== difficulty)) return false;
      }
      for (const side of SIDES) {
        if (!['easy', 'hard'].includes(state.difficulty?.[side])) return false;
        const q = this.byId.get(state.questionIds?.[side]);
        if (state.phase !== 'idle' && !q) return false;
        const selected = state.selected?.[side];
        if (selected !== null && !q?.options.some(o => o.id === selected)) return false;
        const answer = state.answers?.[side];
        if (answer !== null && (!answer || !['answer', 'skip', 'timeout'].includes(answer.reason) ||
            (answer.reason === 'answer' ? !q?.options.some(o => o.id === answer.choice) : answer.choice !== null))) return false;
      }
      if (state.phase !== 'idle' && state.questionIds.left === state.questionIds.right) return false;
      if (state.phase === 'running' && !Number.isFinite(state.deadline)) return false;
      if (['idle', 'ready', 'running'].includes(state.phase) && SIDES.some(s => state.answers[s])) return false;
      if (['completed', 'timedout'].includes(state.phase) && SIDES.some(s => !state.answers[s])) return false;
      if (state.answersVisible && !['completed', 'timedout'].includes(state.phase)) return false;
      this.state = state;
      this.tick();
      return true;
    } catch { return false; }
  }
}
