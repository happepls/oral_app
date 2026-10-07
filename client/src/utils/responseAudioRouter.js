// Preserve WS receipt order across Blob conversion and React paint. Future
// responses wait for their transcript; cancellation invalidates all promises.
export class ResponseAudioRouter {
  constructor({ play, flush, onError }) {
    this.play = play;
    this.flush = flush;
    this.onError = onError;
    this.epoch = 0;
    this.active = null;
    this.serial = Promise.resolve();
    this.pending = new Map();
    this.finished = new Set();
    this.retired = new Set();
  }
  receive(packetPromise) {
    const epoch = this.epoch;
    const operation = this.serial.then(async () => {
      const packet = await packetPromise;
      if (epoch !== this.epoch || this.retired.has(packet.responseId)) return;
      const id = packet.responseId || this.active;
      if (id && id === this.active) this.play(packet.pcm);
      else {
        const queue = this.pending.get(id) || [];
        queue.push(packet.pcm);
        this.pending.set(id, queue);
      }
    });
    this.serial = operation.catch(error => { if (epoch === this.epoch) this.onError?.(error); });
    return this.serial;
  }
  activate(id) {
    if (this.retired.has(id)) return false;
    if (this.active && this.active !== id) {
      this.retired.add(this.active);
      this.pending.delete(this.active);
      this.finished.delete(this.active);
      while (this.retired.size > 128) this.retired.delete(this.retired.values().next().value);
    }
    this.active = id;
    for (const key of [null, id]) {
      const queue = this.pending.get(key) || [];
      this.pending.delete(key);
      queue.forEach(pcm => this.play(pcm));
    }
    if (this.finished.has(id)) this.finish(id);
    return true;
  }
  finish(id = this.active) {
    this.finished.add(id);
    const epoch = this.epoch;
    return this.serial.then(() => {
      if (epoch === this.epoch && id === this.active && !this.retired.has(id)) return this.flush();
      return false;
    });
  }
  reset() {
    if (this.active) this.retired.add(this.active);
    for (const id of this.pending.keys()) if (id) this.retired.add(id);
    this.epoch++;
    this.active = null;
    this.pending.clear();
    this.finished.clear();
    this.serial = Promise.resolve();
    while (this.retired.size > 128) this.retired.delete(this.retired.values().next().value);
  }
}
