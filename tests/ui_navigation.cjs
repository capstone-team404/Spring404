// Run against a production preview, using Playwright and an installed Chromium browser.
// Provider APIs and map SDK are mocked: this does not verify live Naver approval or map tiles.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5175';
const out = process.env.UI_SCREENSHOT_DIR;
const zones = [0, 1, 2, 3, 4].map(i => ({ zone_id: 201 + i, row_index: 10, col_index: i,
  min_lat: 37.557, max_lat: 37.5579, min_lng: 126.924 + i * .0011, max_lng: 126.9251 + i * .0011,
  final_safety_score: [3.8, 2.7, 1.2, 0, 3.5][i], public_safety_score: 2, review_safety_score: 3,
  score_status: i === 3 ? 'insufficient_data' : 'available' }));

async function prepare(context, { session = true, verified = true } = {}) {
  const errors = [];
  const state = { verified, completes: 0 };
  await context.addInitScript(({ session }) => {
    if (session) localStorage.setItem('hereji_access_token', 'ui-test-token');
    class LatLng { constructor(lat, lng) { this._lat = lat; this._lng = lng; } lat() { return this._lat; } lng() { return this._lng; } }
    class MapObject { constructor(el) { if (el?.style) el.style.background = '#e5eee4'; } addListener() {} setMap() {} setCenter() {} panTo() {} setZoom() {} getZoom() { return 17; } }
    window.Tmapv2 = { Map: MapObject, Marker: MapObject, Polygon: MapObject, Polyline: MapObject, LatLng };
  }, { session });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.origin !== 'http://localhost:8000') return route.abort();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const user = { id: 1, nickname: '여행자', email: 'test@example.com', gender_verified: state.verified,
      verification_provider: state.verified ? 'naver' : null };
    let data;
    if (url.pathname === '/auth/me') data = { user };
    else if (url.pathname === '/auth/login') data = { user, access_token: 'ui-test-token' };
    else if (url.pathname === '/auth/verification-config') data = { mode: 'naver', naver_configured: true };
    else if (url.pathname === '/auth/naver/complete') { state.verified = true; state.completes++; data = { message: 'connected' }; }
    else if (url.pathname === '/map/zones') data = zones;
    else if (url.pathname === '/reviews') data = [];
    else if (url.pathname.startsWith('/safety-score/')) data = zones[0];
    else if (url.pathname === '/me/activity') data = { summary: {}, recent_reviews: [] };
    else if (url.pathname === '/me/reports') data = { filed_reports: [], received_reports: [] };
    else if (url.pathname === '/me/reviews' || url.pathname === '/me/liked-reviews') data = { reviews: [] };
    else { errors.push(`Unexpected API ${url.pathname}`); data = {}; }
    return route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { page, errors, state };
}

async function shot(page, name) {
  if (out) { fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, name + '.png') }); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.UI_BROWSER_PATH });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const { page, errors } = await prepare(ctx);
    await page.goto(base);
    await page.getByLabel('여기지 시작 화면').waitFor();
    await shot(page, 'splash');
    await page.getByRole('heading', { name: '어디로 걸어볼까요?' }).waitFor();
    const handle = page.getByRole('button', { name: '정보 패널 펼치기' });
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 340, { steps: 15 });
    await page.mouse.up();
    assert.equal(await page.getByRole('button', { name: '정보 패널 접기' }).getAttribute('aria-expanded'), 'true');
    await page.getByRole('button', { name: '정보 패널 접기' }).click();
    await page.getByRole('button', { name: '정보 패널 펼치기' }).click();
    await page.getByRole('heading', { name: '가까운 구역 살펴보기' }).waitFor();
    await shot(page, 'home-expanded');
    // A nearby row must open the actual zone/review panel.
    await page.locator('.home-zone-list button').first().click();
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    await page.getByRole('dialog').waitFor();
    await shot(page, 'side-menu');
    await page.getByRole('button', { name: '좋아요 한 리뷰', exact: false }).click();
    await page.getByRole('heading', { name: '나의 활동 조회' }).waitFor();
    assert.match(await page.locator('.mypage-segment .is-active').innerText(), /좋아요/);
    await page.getByRole('button', { name: '←', exact: true }).click();
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    await page.getByRole('button', { name: '네이버 계정 연결', exact: false }).click();
    await page.getByText('✓ 네이버 계정 성별 확인 완료').waitFor();
    await shot(page, 'connection-complete');
    await page.getByRole('button', { name: '←', exact: true }).click();
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    await page.getByRole('button', { name: '이용 안내', exact: false }).click();
    await page.getByRole('heading', { name: '지도 색상 읽기' }).waitFor();
    await shot(page, 'service-guide');
    await page.getByRole('button', { name: '지도로 돌아가기' }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    await shot(page, 'desktop-menu');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    await ctx.close();

    const pending = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const test = await prepare(pending, { verified: false });
    await test.page.goto(base);
    const connect = test.page.getByRole('button', { name: '네이버 계정 연결하기' });
    await connect.waitFor();
    assert.equal(await connect.isDisabled(), true);
    await test.page.getByRole('checkbox').check();
    assert.equal(await connect.isEnabled(), true);
    assert.equal(await test.page.getByText('개발·시연용 테스트 코드').count(), 0);
    await test.page.getByText('어떤 정보를 사용하나요?').click();
    await shot(test.page, 'connection-pending');
    await test.page.goto(base + '/#naver_code=mock-code&naver_state=' + 's'.repeat(32));
    await test.page.reload(); // Simulate a full-page OAuth redirect, not an in-page hash change.
    await test.page.getByRole('heading', { name: '어디로 걸어볼까요?' }).waitFor();
    assert.equal(test.state.completes, 1);
    assert.equal(new URL(test.page.url()).hash, '');
    assert.deepEqual(test.errors, []);
    await pending.close();

    const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const login = await prepare(guest, { session: false });
    await login.page.goto(base);
    await login.page.getByRole('heading', { name: '로그인', exact: true }).waitFor();
    await shot(login.page, 'login');
    await login.page.getByRole('button', { name: '처음이신가요? 회원가입' }).click();
    await login.page.getByRole('heading', { name: '회원가입', exact: true }).waitFor();
    await shot(login.page, 'signup');
    assert.equal(await login.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(login.errors, []);
    await guest.close();
    console.log('UI PASS: splash, login/signup, home expansion, nearby zone, drawer links/escape, connection consent, authenticated callback.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
