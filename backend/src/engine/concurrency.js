'use strict';

class ConcurrencyLimiter {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this._queue = [];
  }

  async run(fn) {
    if (this.active >= this.max) {
      await new Promise((resolve) => this._queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      if (this._queue.length > 0) this._queue.shift()();
    }
  }

  get queued() { return this._queue.length; }

  stats() {
    return { active: this.active, queued: this.queued, max: this.max };
  }
}

const MAX = parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '3', 10);
module.exports = new ConcurrencyLimiter(MAX);
