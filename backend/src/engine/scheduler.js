'use strict';

const storage = require('../storage');
const { createExecution, runExecution } = require('./executor');
const { generatePlan } = require('./planner');
const limiter = require('./concurrency');

const CHECK_INTERVAL_MS = parseInt(process.env.SCHEDULER_INTERVAL_MS || '60000', 10);

let _timer = null;

async function tick() {
  const now = Date.now();
  const due = storage.findAll('schedules').filter(
    (s) => s.enabled && s.nextRunAt && new Date(s.nextRunAt).getTime() <= now
  );

  for (const schedule of due) {
    try {
      const plan = await generatePlan(schedule.task, schedule.agentIds || []);
      const execution = createExecution(plan);

      storage.update('schedules', schedule.id, {
        lastRunAt: new Date().toISOString(),
        nextRunAt: new Date(Date.now() + schedule.intervalMs).toISOString(),
        runCount: (schedule.runCount || 0) + 1,
        lastExecutionId: execution.id,
      });

      limiter.run(() => runExecution(execution.id)).catch(console.error);
    } catch (err) {
      console.error(`[Scheduler] schedule ${schedule.id}:`, err.message);
    }
  }
}

function start() {
  if (_timer) return;
  _timer = setInterval(() => { tick().catch(console.error); }, CHECK_INTERVAL_MS);
  if (_timer.unref) _timer.unref();
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { start, stop, tick };
