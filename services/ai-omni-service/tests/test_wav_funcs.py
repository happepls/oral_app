"""Tests for the WAV helpers in app/main.py.

  * ``_wav_extract_pcm`` — locate the 'data' chunk and return only the raw PCM
    payload (media-processing-service feeds this to ffmpeg -f s16le; a leftover
    RIFF header would be decoded as high-amplitude "ping" samples).
  * ``_trim_wav_onset`` — drop the first N ms of audio from a browser-facing WAV
    while rewriting the RIFF/data size fields.

These call the REAL functions imported from main.py (via the conftest stubs).
"""
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(__file__))
import _omni_stubs  # noqa: E402

_main = _omni_stubs.load_main()
_wav_extract_pcm = _main._wav_extract_pcm
_trim_wav_onset = _main._trim_wav_onset


def _make_wav(pcm: bytes, sample_rate: int = 16000, bits: int = 16, channels: int = 1) -> bytes:
    """Build a canonical 44-byte-header PCM WAV around `pcm`."""
    byte_rate = sample_rate * channels * (bits // 8)
    block_align = channels * (bits // 8)
    data_size = len(pcm)
    header = b"RIFF"
    header += struct.pack("<I", 36 + data_size)
    header += b"WAVE"
    header += b"fmt "
    header += struct.pack("<I", 16)        # fmt chunk size
    header += struct.pack("<H", 1)         # PCM
    header += struct.pack("<H", channels)
    header += struct.pack("<I", sample_rate)
    header += struct.pack("<I", byte_rate)
    header += struct.pack("<H", block_align)
    header += struct.pack("<H", bits)
    header += b"data"
    header += struct.pack("<I", data_size)
    return header + pcm


class TestWavExtractPcm:
    def test_extracts_pcm_after_data_chunk(self):
        pcm = bytes(range(256)) * 4   # 1024 bytes of fake PCM
        wav = _make_wav(pcm)
        assert _wav_extract_pcm(wav) == pcm

    def test_extracts_with_leading_chunk_before_data(self):
        # Insert an extra 'LIST' chunk between fmt and data to prove chunk-walking
        # (not a fixed 44-byte assumption) finds the data payload.
        pcm = b"\x01\x02\x03\x04" * 8
        base = _make_wav(pcm)
        # base layout: 0..36 = RIFF+fmt, then 'data' chunk. Splice a LIST chunk in.
        pre = base[:36]                      # RIFF header + fmt chunk
        data_chunk = base[36:]               # 'data' + size + pcm
        list_payload = b"INFOxxxx"
        list_chunk = b"LIST" + struct.pack("<I", len(list_payload)) + list_payload
        spliced = pre + list_chunk + data_chunk
        # fix RIFF size field for correctness (function doesn't rely on it though)
        spliced = b"RIFF" + struct.pack("<I", len(spliced) - 8) + spliced[8:]
        assert _wav_extract_pcm(spliced) == pcm

    def test_non_wav_passthrough(self):
        mp3_like = b"ID3\x03\x00\x00\x00some-mp3-bytes-here"
        assert _wav_extract_pcm(mp3_like) == mp3_like

    def test_empty_bytes_passthrough(self):
        assert _wav_extract_pcm(b"") == b""

    def test_truncated_riff_falls_back_to_44_byte_skip(self):
        # Starts with RIFF but has no parseable 'data' chunk -> 44-byte fallback.
        blob = b"RIFF" + b"\x00" * 60   # 64 bytes, no valid 'data' chunk id
        out = _wav_extract_pcm(blob)
        assert out == blob[44:]
        assert len(out) == 20

    def test_short_riff_below_44_passthrough(self):
        # RIFF marker but fewer than 44 bytes -> fallback returns whole blob.
        blob = b"RIFF" + b"\x00" * 10   # 14 bytes total
        assert _wav_extract_pcm(blob) == blob


class TestTrimWavOnset:
    def test_trims_onset_and_preserves_tail(self):
        sr = 16000
        # 1 second of 16-bit mono PCM = 32000 bytes
        pcm = b"\xAA\xBB" * sr
        wav = _make_wav(pcm, sample_rate=sr)
        trimmed = _trim_wav_onset(wav, trim_ms=150)
        # 150ms of 16000Hz * 2 bytes = 4800 bytes trimmed from data
        assert len(trimmed) < len(wav)
        new_data = trimmed[44:]
        assert len(new_data) == len(pcm) - 4800
        # RIFF + data size fields must be rewritten to match the new data length
        riff_size = struct.unpack_from("<I", trimmed, 4)[0]
        data_size = struct.unpack_from("<I", trimmed, 40)[0]
        assert data_size == len(new_data)
        assert riff_size == len(new_data) + 36

    def test_non_wav_passthrough(self):
        not_wav = b"NOTAWAVFILE" * 5
        assert _trim_wav_onset(not_wav) == not_wav

    def test_short_bytes_passthrough(self):
        assert _trim_wav_onset(b"RIFFshort") == b"RIFFshort"

    def test_trim_exceeding_data_returns_original(self):
        # Tiny data chunk; 150ms trim would exceed it -> original returned unchanged.
        pcm = b"\x01\x02" * 10   # 20 bytes
        wav = _make_wav(pcm, sample_rate=16000)
        assert _trim_wav_onset(wav, trim_ms=150) == wav
