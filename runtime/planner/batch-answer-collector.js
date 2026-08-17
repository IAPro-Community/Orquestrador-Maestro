"use strict";

class BatchAnswerCollector {
  constructor() {
    this._pending = new Map();
    this._questions = [];
  }

  startBatch(questions) {
    this._pending = new Map();
    this._questions = Array.isArray(questions) ? [...questions] : [];
  }

  recordAnswer(questionId, answer) {
    this._pending.set(questionId, answer);
  }

  editAnswer(questionId, answer) {
    this._pending.set(questionId, answer);
  }

  getPendingAnswers() {
    return new Map(this._pending);
  }

  confirmBatch() {
    const confirmed = new Map(this._pending);
    this._pending = new Map();
    this._questions = [];
    return confirmed;
  }

  cancelBatch() {
    this._pending = new Map();
    this._questions = [];
  }

  clearPending() {
    this._pending = new Map();
  }

  get currentQuestions() {
    return [...this._questions];
  }
}

module.exports = { BatchAnswerCollector };
