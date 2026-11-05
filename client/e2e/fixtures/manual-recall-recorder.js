async function installManualRecorder(page) {
  await page.addInitScript(() => {
    window.recallRecorders = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (url, options) => {
      if (String(url).includes('/recall-transcribe')) {
        const bytes = new Uint8Array(await options.body.arrayBuffer());
        window.recallUpload = { signature: String.fromCharCode(...bytes.slice(0, 4)), size: bytes.length };
      }
      return originalFetch(url, options);
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => ({ getTracks: () => [{ stop() {}, onended: null }] }),
    } });
    window.MediaRecorder = class {
      static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/wav'; window.recallRecorders.push(this); }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        // Synthetic audio only; exercise the real decoder, resampler and encoder.
        const bytes = new ArrayBuffer(32044), view = new DataView(bytes);
        const text = (n, s) => [...s].forEach((c, i) => view.setUint8(n + i, c.charCodeAt(0)));
        text(0, 'RIFF'); view.setUint32(4, 32036, true); text(8, 'WAVE'); text(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
        view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, 32000, true);
        for (let i = 0; i < 16000; i++) view.setInt16(44 + i * 2, Math.sin(i / 10) * 1000, true);
        queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([bytes], { type: 'audio/wav' }) }); this.onstop?.(); });
      }
    };
  });
}
module.exports = { installManualRecorder };
