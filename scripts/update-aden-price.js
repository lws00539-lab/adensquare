/**
 * update-aden-price.js
 * ------------------------------------------------------------
 * 매일 1회(GitHub Actions 스케줄)로 실행되어
 *  1) adena.kr 메인 페이지의 "전 서버 현재 시세" 표를 가져오고
 *  2) 서버별 최저가 / 평균 / 최고가 / 최저가서버 / 최고가서버를 계산해서
 *  3) Firebase Realtime Database의 `adenPrice` 노드에 저장합니다.
 *
 * 사이트(index.html)는 이 노드를 실시간으로 구독해서
 * "아덴 시세" 페이지에 자동으로 최신 값을 보여줍니다.
 * ------------------------------------------------------------
 */

const admin = require('firebase-admin');
const cheerio = require('cheerio');

const SOURCE_URL = 'https://adena.kr/?lang=ko';

// ---------- 1. Firebase 초기화 ----------
function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('환경변수 FIREBASE_SERVICE_ACCOUNT 가 없습니다. (GitHub Secrets 확인)');
  }
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  return admin.database();
}

// ---------- 2. 시세 페이지 가져오기 + 파싱 ----------
async function fetchServerPrices() {
  const res = await fetch(SOURCE_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`페이지 요청 실패: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const servers = [];
  $('table').each((_, table) => {
    const headerText = $(table).text();
    if (!headerText.includes('최저가')) return;

    $(table)
      .find('tbody tr')
      .each((__, tr) => {
        const tds = $(tr).find('td');
        if (tds.length < 5) return;
        let name = $(tds[1]).text().trim();
        name = name.replace('NEW', '').trim();
        const lowestText = $(tds[5]).text().trim() || $(tds[tds.length - 1]).text().trim();
        const lowest = parseInt(lowestText.replace(/[^0-9]/g, ''), 10);
        if (name && !Number.isNaN(lowest)) {
          servers.push({ name, price: lowest });
        }
      });
  });

  if (servers.length === 0) {
    throw new Error('시세 표를 찾지 못했습니다. adena.kr 마크업이 변경되었을 수 있습니다.');
  }
  return servers;
}

// ---------- 3. 통계 및 등락률 계산 ----------
function buildSummary(servers, prevData) {
  const prevPriceMap = (prevData && prevData.priceMap) || null;
  const prevAverage = prevData ? prevData.average : null;

  const prices = servers.map((s) => s.price);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const min = servers.reduce((a, b) => (a.price <= b.price ? a : b));
  const max = servers.reduce((a, b) => (a.price >= b.price ? a : b));

  const serversWithChange = servers.map((s) => {
    const prevPrice = prevPriceMap ? prevPriceMap[s.name] : undefined;
    let changePct = null;
    if (typeof prevPrice === 'number' && prevPrice > 0) {
      changePct = ((s.price - prevPrice) / prevPrice) * 100;
      changePct = Math.round(changePct * 100) / 100;
    }
    return { ...s, changePct };
  });

  let avgChangePct = null;
  if (typeof prevAverage === 'number' && prevAverage > 0) {
    avgChangePct = ((avg - prevAverage) / prevAverage) * 100;
    avgChangePct = Math.round(avgChangePct * 100) / 100;
  }

  return {
    servers: serversWithChange,
    average: avg,
    avgChangePct,
    lowestServer: min.name,
    lowestPrice: min.price,
    highestServer: max.name,
    highestPrice: max.price,
    updatedAt: Date.now(),
    updatedAtLabel: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    source: 'adena.kr',
  };
}

// ---------- 3-1. 어제(직전) 데이터 읽기 (등락률 계산용) ----------
async function fetchPreviousData(db) {
  try {
    const snap = await db.ref('adenPrice').once('value');
    const data = snap.val();
    if (!data || !Array.isArray(data.servers)) return null;
    const map = {};
    data.servers.forEach((s) => {
      if (s && s.name && typeof s.price === 'number') map[s.name] = s.price;
    });
    return { priceMap: map, average: typeof data.average === 'number' ? data.average : null };
  } catch (e) {
    console.warn('이전 데이터 조회 실패(등락률 없이 진행):', e.message);
    return null;
  }
}

// ---------- 4. Firebase에 기록 ----------
async function writeToFirebase(db, summary) {
  await db.ref('adenPrice').set(summary);
}

// ---------- 실행 ----------
(async () => {
  try {
    console.log('[1/5] adena.kr 시세 조회 중...');
    const servers = await fetchServerPrices();
    console.log(`  -> ${servers.length}개 서버 확인`);

    console.log('[2/5] Firebase 연결 중...');
    const db = initFirebase();

    console.log('[3/5] 어제 시세 조회 중 (등락률 계산용)...');
    const prevData = await fetchPreviousData(db);
    console.log(prevData ? '  -> 이전 데이터 확인됨' : '  -> 이전 데이터 없음 (첫 실행)');

    console.log('[4/5] 통계 및 등락률 계산 중...');
    const summary = buildSummary(servers, prevData);
    console.log(`  -> 평균 ${summary.average}원 / 최저 ${summary.lowestServer} ${summary.lowestPrice}원 / 최고 ${summary.highestServer} ${summary.highestPrice}원`);

    console.log('[5/5] Firebase에 저장 중...');
    await writeToFirebase(db, summary);

    console.log('완료! adenPrice 노드가 업데이트되었습니다.');
    process.exit(0);
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  }
})();
