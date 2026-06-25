// Pure-logic unit tests for PR#18/#19 scenario-image write-back path.
//
// Two helpers are exercised here, both copied VERBATIM from source so this
// file stays a pure-logic spec (no DB / no network):
//   1. isAllowedImageUrl(url)         — userController.js (internal, not exported)
//   2. scenario match + image_url spread — the body of User.updateScenarioImage
//      in models/user.js (DB-wrapping function; only the in-memory mapping is
//      isolated here, the BEGIN/SELECT/UPDATE/COMMIT plumbing is out of scope).
//
// When either source changes, update the verbatim copy below to keep the spec
// honest.

// ─── 1. isAllowedImageUrl — VERBATIM from userController.js (lines 803-816) ──

const ALLOWED_IMAGE_URL_HOSTS = [
    /\.myqcloud\.com$/i,
    /\.aliyuncs\.com$/i,
    /(^|\.)dashscope(-intl)?\.aliyuncs\.com$/i,
];
function isAllowedImageUrl(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
        return ALLOWED_IMAGE_URL_HOSTS.some((re) => re.test(u.hostname));
    } catch {
        return false;
    }
}

// ─── 2. scenario match + spread — VERBATIM from User.updateScenarioImage ─────
// Lines 1186-1197 of models/user.js, lifted out of the DB transaction. Returns
// { matched, scenarios } so a test can assert both the boolean and the produced
// array. Source returns `false` when !matched (after ROLLBACK); we surface the
// same signal via `matched`.
function matchAndSpread(scenarios, scenarioTitle, imageUrl) {
    let matched = false;
    const updated = scenarios.map(s => {
        if (s && s.title === scenarioTitle) {
            matched = true;
            return { ...s, image_url: imageUrl };
        }
        return s;
    });
    return { matched, scenarios: updated };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('isAllowedImageUrl – host allowlist', () => {
    test('allows tencent COS (*.myqcloud.com)', () => {
        expect(isAllowedImageUrl('https://mybucket-123.cos.ap-guangzhou.myqcloud.com/scenario-images/a.jpg')).toBe(true);
    });

    test('allows aliyun OSS (*.aliyuncs.com)', () => {
        expect(isAllowedImageUrl('https://oss-cn-beijing.aliyuncs.com/x/y.png')).toBe(true);
        expect(isAllowedImageUrl('https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/img.jpg')).toBe(true);
    });

    test('allows dashscope + dashscope-intl', () => {
        expect(isAllowedImageUrl('https://dashscope.aliyuncs.com/img.jpg')).toBe(true);
        expect(isAllowedImageUrl('https://dashscope-intl.aliyuncs.com/img.jpg')).toBe(true);
    });

    test('allows http scheme (not only https)', () => {
        expect(isAllowedImageUrl('http://x.myqcloud.com/a.jpg')).toBe(true);
    });

    test('rejects arbitrary external host', () => {
        expect(isAllowedImageUrl('https://evil.com/a.jpg')).toBe(false);
        expect(isAllowedImageUrl('https://example.org/a.png')).toBe(false);
    });

    test('rejects look-alike suffix attack (host merely containing the domain)', () => {
        // myqcloud.com.evil.com must NOT match — anchored $ in the regex guards this
        expect(isAllowedImageUrl('https://myqcloud.com.evil.com/a.jpg')).toBe(false);
        expect(isAllowedImageUrl('https://aliyuncs.com.attacker.net/a.jpg')).toBe(false);
    });

    test('rejects non-http(s) schemes', () => {
        expect(isAllowedImageUrl('ftp://x.myqcloud.com/a.jpg')).toBe(false);
        expect(isAllowedImageUrl('file:///etc/passwd')).toBe(false);
        expect(isAllowedImageUrl('data:image/png;base64,AAAA')).toBe(false);
        expect(isAllowedImageUrl('javascript:alert(1)')).toBe(false);
    });

    test('rejects malformed / empty URLs without throwing', () => {
        expect(isAllowedImageUrl('not a url')).toBe(false);
        expect(isAllowedImageUrl('')).toBe(false);
        expect(isAllowedImageUrl(null)).toBe(false);
        expect(isAllowedImageUrl(undefined)).toBe(false);
    });
});

describe('updateScenarioImage – scenario match + image_url spread', () => {
    const scenarios = [
        { title: '咖啡店点单', tasks: ['t1'] },
        { title: '机场值机', tasks: ['t2'], image_url: 'https://old.myqcloud.com/old.jpg' },
        { title: '酒店入住', tasks: ['t3'] },
    ];

    test('spreads image_url onto the matching scenario only', () => {
        const { matched, scenarios: out } = matchAndSpread(scenarios, '酒店入住', 'https://x.myqcloud.com/new.jpg');
        expect(matched).toBe(true);
        expect(out[2].image_url).toBe('https://x.myqcloud.com/new.jpg');
        // untouched siblings keep their identity / fields
        expect(out[0].image_url).toBeUndefined();
        expect(out[1].image_url).toBe('https://old.myqcloud.com/old.jpg');
    });

    test('preserves existing fields when spreading (tasks survive)', () => {
        const { scenarios: out } = matchAndSpread(scenarios, '咖啡店点单', 'https://x.myqcloud.com/c.jpg');
        expect(out[0].tasks).toEqual(['t1']);
        expect(out[0].image_url).toBe('https://x.myqcloud.com/c.jpg');
    });

    test('overwrites a pre-existing image_url on match', () => {
        const { matched, scenarios: out } = matchAndSpread(scenarios, '机场值机', 'https://x.myqcloud.com/replaced.jpg');
        expect(matched).toBe(true);
        expect(out[1].image_url).toBe('https://x.myqcloud.com/replaced.jpg');
    });

    test('returns matched=false when no title matches (→ source ROLLBACK + false)', () => {
        const { matched, scenarios: out } = matchAndSpread(scenarios, '不存在的场景', 'https://x.myqcloud.com/n.jpg');
        expect(matched).toBe(false);
        // no scenario mutated
        expect(out.every(s => !s.image_url || s.image_url.startsWith('https://old'))).toBe(true);
    });

    test('tolerates null / malformed scenario entries without throwing', () => {
        const dirty = [null, { title: 'ok' }, { notitle: true }];
        const { matched, scenarios: out } = matchAndSpread(dirty, 'ok', 'https://x.myqcloud.com/k.jpg');
        expect(matched).toBe(true);
        expect(out[1].image_url).toBe('https://x.myqcloud.com/k.jpg');
        expect(out[0]).toBeNull();
    });

    test('does not mutate the original input array elements (map produces new objects on match)', () => {
        const original = [{ title: 'a' }];
        matchAndSpread(original, 'a', 'https://x.myqcloud.com/a.jpg');
        expect(original[0].image_url).toBeUndefined(); // spread returns a fresh object
    });
});
