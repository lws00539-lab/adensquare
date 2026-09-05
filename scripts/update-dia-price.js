/**
 * update-dia-price.js
 * ------------------------------------------------------------
 * 매일 1회(GitHub Actions 스케줄)로 실행되어
 *   1) gamebit.co.kr 의 리니지M 서버별 다이아 시세 티커를 가져오고
 *   2) 서버별 가격 / 평균 / 최저 / 최고 / 등락률을 계산해서
 *   3) Firebase Realtime Database의 `diaPrice` 노드에 저장합니다.
 *
 * 사이트(index.html)는 이 노드를 실시간으로 구독해서
 * "시세 > 리니지M 다이아시세" 페이지에 최신 값을 보여줍니다.
 *
 * ⚠️ 주의
 * - 이 스크립트는 네트워크가 차단된 환경에서 작성되었기 때문에,
 *   gamebit.co.kr 의 실제 HTML 태그 구조를 확인하지 못했습니다.
 *   그래서 CSS 셀렉터에 의존하지 않고, 페이지 전체 텍스트에서
 *   "서버명 + 가격 + 등락률" 패턴을 찾는 방식으로 파싱합니다.
 *   (마크업이 바뀌어도 잘 버티는 대신, 서버 이름 목록을 관리해야 합니다.)
 * - 만약 시세가 JS로 나중에 그려지는 구조라면 이 방식으로는
 *   값을 못 가져옵니다. 그럴 때는 Actions 로그에 "0개 서버"가 찍히니
 *   말씀해 주시면 API 호출 방식으로 바꿔드리겠습니다.
 * - 개인/커뮤니티용 참고 데이터 수집 목적입니다. 사용 전 gamebit.co.kr
 *   이용약관을 한 번 확인하세요.
 * ------------------------------------------------------------
 */

const admin = require('firebase-admin');
const cheerio = require('cheerio');

const SOURCE_URL = 'https://gamebit.co.kr/linm_pandora10';

// 리니지M 서버(월드) 이름 목록.
// 신규 서버가 생기면 여기에 추가하면 됩니다.
const KNOWN_SERVERS = [
  '판도라', '케레니스', '라스타바드', '블루디카', '파푸리온', '발라카스',
  '진기르타스', '이실로테', '린드비오르', '듀크데필', '아툰', '하딘',
  '군터', '데스나이트', '안타라스', '사이하', '질리언', '데포로쥬',
  '그림리퍼', '켄라우헬', '기르타스', '발록', '그레시아', '글루디오',
  '오렌', '말하는섬', '켄트', '윈다우드',
];

// ---------- 1. Firebase 초기화 ----------
function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('환경변수 FIREBASE_SERVICE_ACCOUNT 가 없습니다. (GitHub Secrets 확인)');
  }
  const serviceAccount = JSON.parse(raw);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  return admin.database();
}

// ---------- 2. 시세 페이지 가져오기 + 파싱 ----------
async function fetchServerPrices() {
  const res = await fetch(SOURCE_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`페이지 요청 실패: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // script/style 은 제거하고 본문 텍스트만 남긴다
  $('script, style, noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();

  // "서버명  20,222  1.92%" 형태를 찾는다.
  // 가격은 천단위 콤마가 있는 4자리 이상 숫자, 등락률은 % 로 끝나는 숫자.
  const pattern = /([가-힣]{2,8})\s*([0-9]{1,3}(?:,[0-9]{3})+)\s*(-?[0-9]+(?:\.[0-9]+)?)\s*%/g;

  const found = new Map(); // 중복 서버는 처음 것만 사용
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const name = m[1];
    if (!KNOWN_SERVERS.includes(name)) continue; // 광고/기타 숫자 제외
    if (found.has(name)) continue;

    const price = parseInt(m[2].replace(/,/g, ''), 10);
    const changePct = parseFloat(m[3]);
    if (Number.isNaN(price) || price <= 0) continue;

    found.set(name, {
      name,
      price,
      changePct: Number.isNaN(changePct) ? null : Math.round(changePct * 100) / 100,
    });
  }

  const servers = Array.from(found.values());
  if (servers.length === 0) {
    throw new Error(
      '시세 데이터를 찾지 못했습니다. gamebit.co.kr 페이지 구조가 바뀌었거나, ' +
      '시세가 JS로 렌더링되어 HTML에 포함되지 않았을 수 있습니다.'
    );
  }
  return servers;
}

// ---------- 3. 통계 계산 ----------
function buildSummary(servers, prevData) {
  const prevPriceMap = (prevData && prevData.priceMap) || null;
  const prevAverage = prevData ? prevData.average : null;

  const prices = servers.map((s) => s.price);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const min = servers.reduce((a, b) => (a.price <= b.price ? a : b));
  const max = servers.reduce((a, b) => (a.price >= b.price ? a : b));

  // 출처 페이지에 등락률이 있으면 그대로 쓰고, 없으면 어제 값과 비교해서 계산
  const serversWithChange = servers.map((s) => {
    if (typeof s.changePct === 'number') return s;
    const prevPrice = prevPriceMap ? prevPriceMap[s.name] : undefined;
    let changePct = null;
    if (typeof prevPrice === 'number' && prevPrice > 0) {
      changePct = Math.round(((s.price - prevPrice) / prevPrice) * 10000) / 100;
    }
    return { ...s, changePct };
  });

  let avgChangePct = null;
  if (typeof prevAverage === 'number' && prevAverage > 0) {
    avgChangePct = Math.round(((avg - prevAverage) / prevAverage) * 10000) / 100;
  }

  return {
    servers: serversWithChange,
    average: avg,
    avgChangePct,
    lowestServer: min.name,
    lowestPrice: min.price,
    highestServer: max.name,
    highestPrice: max.price,
    unit: '1천 다이아',
    updatedAt: Date.now(),
    updatedAtLabel: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    source: 'gamebit.co.kr',
  };
}

// ---------- 3-1. 직전 데이터 읽기 (등락률 보조 계산용) ----------
async function fetchPreviousData(db) {
  try {
    const snap = await db.ref('diaPrice').once('value');
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
  await db.ref('diaPrice').set(summary);
}

// ---------- 실행 ----------
(async () => {
  try {
    console.log('[1/5] gamebit.co.kr 다이아 시세 조회 중...');
    const servers = await fetchServerPrices();
    console.log(`  -> ${servers.length}개 서버 확인`);

    console.log('[2/5] Firebase 연결 중...');
    const db = initFirebase();

    console.log('[3/5] 이전 시세 조회 중...');
    const prevData = await fetchPreviousData(db);
    console.log(prevData ? '  -> 이전 데이터 확인됨' : '  -> 이전 데이터 없음 (첫 실행)');

    console.log('[4/5] 통계 계산 중...');
    const summary = buildSummary(servers, prevData);
    console.log(`  -> 평균 ${summary.average}원 / 최저 ${summary.lowestServer} ${summary.lowestPrice}원 / 최고 ${summary.highestServer} ${summary.highestPrice}원`);

    console.log('[5/5] Firebase에 저장 중...');
    await writeToFirebase(db, summary);

    console.log('완료! diaPrice 노드가 업데이트되었습니다.');
    process.exit(0);
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  }
})();
