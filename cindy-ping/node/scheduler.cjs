'use strict';
const { randomUUID } = require('node:crypto');

// One global generation for every emote, including display-only emotes.
// Rendering has already happened in the native process before trigger is called.
class LatestAction {
  constructor({ capture, notify }) {
    this.capture = capture;
    this.notify = notify;
    this.current = null;
    this.timer = null;
    this.snapshot = null;
  }
  invalidate() {
    clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.snapshot = null;
    this.notify('invalidate', {});
  }
  trigger(event, emote) {
    clearTimeout(this.timer);
    const operation = { id: randomUUID(), event, emote: structuredClone(emote), deadline: Date.now() + 2000,
      elapsed: false, targetReady: !emote.target, started: false };
    this.current = operation;
    this.snapshot = null;
    this.notify('trigger', { id: operation.id, label: emote.label, action: emote.action, emote: operation.emote });
    if (emote.action === 'none') return;
    this.timer = setTimeout(() => { this.timer = null; operation.elapsed = true; void this.prepare(operation); }, 2000);
  }
  resolveTarget(id, target) {
    if (!this.isCurrent(id) || this.current.started) return { current: false };
    if (!target) { this.invalidate(); return { current: false }; }
    this.current.target = target;
    this.current.targetReady = true;
    void this.prepare(this.current);
    return { current: true };
  }
  async prepare(operation) {
    if (this.current !== operation || !operation.elapsed || !operation.targetReady || operation.started) return;
    operation.started = true;
    this.notify('capturing', { id: operation.id });
    try {
      const snapshot = await this.capture(operation);
      if (this.current !== operation) return;
      this.snapshot = snapshot;
      this.notify('prepared', { id: operation.id, emote: operation.emote, target: operation.target,
        summary: { hasImage: !!snapshot.jpeg, hasText: !!snapshot.text, issues: snapshot.issues || [] } });
    } catch (error) {
      if (this.current === operation) this.notify('capture-error', { id: operation.id, code: error.code || error.message });
    }
  }
  isCurrent(id) { return this.current?.id === id; }
}
module.exports = { LatestAction };
