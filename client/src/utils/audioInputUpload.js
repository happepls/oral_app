// Keep the immutable recording until the server acknowledges its input_id.
// Reconnect replays the complete input; the server deduplicates committed IDs.
export class AudioInputUpload {
  constructor() { this.pending = null; }
  prepare(inputId, buffers, scope) {
    const pieces = buffers.map(buffer => new Uint8Array(buffer.buffer || buffer, buffer.byteOffset || 0, buffer.byteLength));
    const pcm = new Uint8Array(pieces.reduce((n, piece) => n + piece.byteLength, 0));
    let offset = 0;
    pieces.forEach(piece => { pcm.set(piece, offset); offset += piece.byteLength; });
    this.pending = pcm.length ? { inputId, pcm, scope, socket: null } : null;
    return !!this.pending;
  }
  send(socket) {
    const input = this.pending;
    if (!input || socket?.readyState !== 1 || input.socket === socket) return false;
    input.socket = socket;
    const send = (type, payload) => {
      if (socket.send(JSON.stringify({ type, payload })) === false) throw new Error('input_upload_interrupted');
    };
    try {
      send('user_audio_started', { input_id: input.inputId, scope: input.scope });
      // 1 second of PCM16/16kHz, including silence. No VAD-based trimming.
      let sequence = 0;
      for (let offset = 0; offset < input.pcm.length; offset += 32000) {
        const bytes = input.pcm.subarray(offset, offset + 32000);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        send('audio_stream', { input_id: input.inputId, sequence: sequence++, audio: btoa(binary) });
      }
      send('user_audio_ended', { input_id: input.inputId, chunks: sequence });
      return true;
    } catch {
      input.socket = null;
      return false;
    }
  }
  acknowledge(inputId) {
    if (this.pending?.inputId !== inputId) return false;
    this.pending = null;
    return true;
  }
  cancel() { this.pending = null; }
}
