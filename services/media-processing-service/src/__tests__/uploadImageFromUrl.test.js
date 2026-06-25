// Pure-logic unit tests for PR#18/#19 media `uploadImageFromUrl` path.
//
// The four isolable helpers below are copied VERBATIM from
// src/controllers/mediaController.js so this stays a pure-logic spec (no real
// COS / no fetch / no Express req-res plumbing). When mediaController.js
// changes, update the verbatim copies here to keep the spec honest.
//
//   1. isAllowedImageHost(hostname)   — SSRF host allowlist (lines 88-100)
//   2. extFromContentType(ct)         — content-type → ext (lines 103-109)
//   3. size cap                       — MAX_IMAGE_BYTES boundary (lines 168-182)
//   4. internal-network predicate     — from assertInternalCaller (lines 116-119)

// ─── 1. isAllowedImageHost — VERBATIM ───────────────────────────────────────

const ALLOWED_IMAGE_HOSTS = [
    'dashscope.aliyuncs.com',
    'dashscope-intl.aliyuncs.com',
    'oss-cn-beijing.aliyuncs.com',
    'oss-cn-hangzhou.aliyuncs.com',
    'oss-cn-shanghai.aliyuncs.com',
    'oss-ap-southeast-1.aliyuncs.com',
];

const isAllowedImageHost = (hostname) => {
    if (!hostname) return false;
    return ALLOWED_IMAGE_HOSTS.some(d => hostname === d || hostname.endsWith('.' + d));
};

// ─── 2. extFromContentType — VERBATIM ───────────────────────────────────────

const extFromContentType = (ct) => {
    const c = (ct || '').toLowerCase();
    if (c.includes('png')) return '.png';
    if (c.includes('webp')) return '.webp';
    if (c.includes('gif')) return '.gif';
    return '.jpg'; // 默认/jpeg
};

// ─── 3. size-cap predicate — distilled from lines 168-182 ───────────────────
// Returns true when the download must be rejected (413). `declaredLen` is the
// parsed Content-Length (0 when absent/lying), `actualLen` the bytes actually
// read. Mirrors both guards: declared check + post-read hard ceiling.
function exceedsSizeCap(declaredLen, actualLen, maxBytes) {
    if (declaredLen && declaredLen > maxBytes) return true;
    if (actualLen > maxBytes) return true;
    return false;
}

// ─── 4. internal-network predicate — VERBATIM core of assertInternalCaller ──
// Lines 116-119 (the IP-trust branch), lifted out of the Express handler.
function isInternalNetwork(ip) {
    const clientIp = (ip || '').replace(/^::ffff:/, '');
    return clientIp.startsWith('172.') || clientIp.startsWith('10.') ||
           clientIp === '127.0.0.1' || clientIp === '::1';
}

// ─────────────────────────────────────────────────────────────────────────────

describe('isAllowedImageHost – SSRF host allowlist', () => {
    test('allows the exact dashscope hosts', () => {
        expect(isAllowedImageHost('dashscope.aliyuncs.com')).toBe(true);
        expect(isAllowedImageHost('dashscope-intl.aliyuncs.com')).toBe(true);
    });

    test('allows the listed OSS region hosts', () => {
        expect(isAllowedImageHost('oss-cn-beijing.aliyuncs.com')).toBe(true);
        expect(isAllowedImageHost('oss-cn-hangzhou.aliyuncs.com')).toBe(true);
        expect(isAllowedImageHost('oss-cn-shanghai.aliyuncs.com')).toBe(true);
        expect(isAllowedImageHost('oss-ap-southeast-1.aliyuncs.com')).toBe(true);
    });

    test('allows subdomains of an allowed host (endsWith ".<host>")', () => {
        expect(isAllowedImageHost('result.oss-cn-beijing.aliyuncs.com')).toBe(true);
        expect(isAllowedImageHost('a.b.dashscope.aliyuncs.com')).toBe(true);
    });

    test('rejects arbitrary external hosts', () => {
        expect(isAllowedImageHost('evil.com')).toBe(false);
        expect(isAllowedImageHost('example.org')).toBe(false);
    });

    test('rejects localhost / internal IPs (SSRF targets)', () => {
        expect(isAllowedImageHost('localhost')).toBe(false);
        expect(isAllowedImageHost('127.0.0.1')).toBe(false);
        expect(isAllowedImageHost('169.254.169.254')).toBe(false); // cloud metadata
        expect(isAllowedImageHost('192.168.1.10')).toBe(false);
    });

    test('rejects look-alike suffix attack (host merely containing an allowed domain)', () => {
        // endsWith('.' + d) requires a dot boundary; bare concatenation must fail
        expect(isAllowedImageHost('dashscope.aliyuncs.com.evil.com')).toBe(false);
        expect(isAllowedImageHost('notdashscope.aliyuncs.com')).toBe(false);
        expect(isAllowedImageHost('xoss-cn-beijing.aliyuncs.com')).toBe(false);
    });

    test('rejects empty / falsy hostname', () => {
        expect(isAllowedImageHost('')).toBe(false);
        expect(isAllowedImageHost(null)).toBe(false);
        expect(isAllowedImageHost(undefined)).toBe(false);
    });
});

describe('extFromContentType – content-type → extension', () => {
    test('maps png', () => {
        expect(extFromContentType('image/png')).toBe('.png');
    });
    test('maps webp', () => {
        expect(extFromContentType('image/webp')).toBe('.webp');
    });
    test('maps gif', () => {
        expect(extFromContentType('image/gif')).toBe('.gif');
    });
    test('falls back to .jpg for jpeg and unknown types', () => {
        expect(extFromContentType('image/jpeg')).toBe('.jpg');
        expect(extFromContentType('image/jpg')).toBe('.jpg');
        expect(extFromContentType('application/octet-stream')).toBe('.jpg');
        expect(extFromContentType('')).toBe('.jpg');
        expect(extFromContentType(null)).toBe('.jpg');
        expect(extFromContentType(undefined)).toBe('.jpg');
    });
    test('is case-insensitive', () => {
        expect(extFromContentType('IMAGE/PNG')).toBe('.png');
        expect(extFromContentType('Image/WebP')).toBe('.webp');
    });
    test('matches on substring (charset suffix tolerated)', () => {
        expect(extFromContentType('image/png; charset=binary')).toBe('.png');
    });
});

describe('size cap – MAX_IMAGE_BYTES boundary', () => {
    const DEFAULT_MAX = parseInt(process.env.MAX_IMAGE_BYTES || '10485760', 10);

    test('default ceiling is 10MB', () => {
        expect(DEFAULT_MAX).toBe(10 * 1024 * 1024);
    });

    test('rejects when declared Content-Length exceeds cap', () => {
        expect(exceedsSizeCap(DEFAULT_MAX + 1, 0, DEFAULT_MAX)).toBe(true);
    });

    test('rejects when actual bytes exceed cap even if Content-Length absent (lied)', () => {
        // declaredLen=0 (absent) but actual body is over the ceiling
        expect(exceedsSizeCap(0, DEFAULT_MAX + 1, DEFAULT_MAX)).toBe(true);
    });

    test('accepts payload exactly at the cap (boundary inclusive)', () => {
        expect(exceedsSizeCap(DEFAULT_MAX, DEFAULT_MAX, DEFAULT_MAX)).toBe(false);
    });

    test('accepts a normal small payload', () => {
        expect(exceedsSizeCap(2048, 2048, DEFAULT_MAX)).toBe(false);
    });

    test('declared-zero with small actual is accepted', () => {
        expect(exceedsSizeCap(0, 500, DEFAULT_MAX)).toBe(false);
    });

    test('respects a custom (env-overridden) cap', () => {
        const small = 1024;
        expect(exceedsSizeCap(0, 2048, small)).toBe(true);
        expect(exceedsSizeCap(0, 512, small)).toBe(false);
    });
});

describe('assertInternalCaller – internal-network predicate', () => {
    test('allows Docker bridge 172.x', () => {
        expect(isInternalNetwork('172.18.0.5')).toBe(true);
    });
    test('allows private 10.x', () => {
        expect(isInternalNetwork('10.43.0.20')).toBe(true);
    });
    test('allows loopback v4 / v6', () => {
        expect(isInternalNetwork('127.0.0.1')).toBe(true);
        expect(isInternalNetwork('::1')).toBe(true);
    });
    test('strips ::ffff: IPv4-mapped prefix before matching', () => {
        expect(isInternalNetwork('::ffff:172.18.0.5')).toBe(true);
        expect(isInternalNetwork('::ffff:127.0.0.1')).toBe(true);
    });
    test('rejects public / external IPs (require x-internal-service-key)', () => {
        expect(isInternalNetwork('8.8.8.8')).toBe(false);
        expect(isInternalNetwork('203.0.113.7')).toBe(false);
    });
    test('does NOT treat 192.168.x as internal (only 172./10./loopback are trusted here)', () => {
        // Note: this mirrors source exactly — 192.168.x is NOT in the trust branch,
        // so such a caller falls through to the x-internal-service-key check.
        expect(isInternalNetwork('192.168.1.50')).toBe(false);
    });
    test('rejects empty / falsy ip', () => {
        expect(isInternalNetwork('')).toBe(false);
        expect(isInternalNetwork(null)).toBe(false);
        expect(isInternalNetwork(undefined)).toBe(false);
    });
});
