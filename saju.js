/* ================================================================
 * saju.js — 사주팔자 계산
 * ----------------------------------------------------------------
 * 절기(태양 황경) 기준으로 연주/월주를 정하고, 율리우스일로 일주를,
 * 진태양시로 시주를 계산합니다. 십성과 대운까지 산출합니다.
 *
 * 정확도에 대해
 *  - 태양 황경은 오차 약 0.01도(시간으로 약 15분) 수준입니다.
 *    절기 경계에서 15분 이내에 태어난 경우 달이 다르게 나올 수 있습니다.
 *  - 일주 기준일은 1984-02-02 = 갑자일 로 잡았습니다.
 * ================================================================ */

const GAN = ['갑','을','병','정','무','기','경','신','임','계'];
const GAN_HANJA = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const JI  = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const JI_HANJA = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

// 천간의 오행 / 음양
const GAN_OHAENG = ['목','목','화','화','토','토','금','금','수','수'];
const GAN_EUMYANG = ['양','음','양','음','양','음','양','음','양','음'];
// 지지의 오행 / 음양
const JI_OHAENG = ['수','토','목','목','토','화','화','토','금','금','토','수'];
const JI_EUMYANG = ['양','음','양','음','양','음','양','음','양','음','양','음'];
// 지지의 띠
const JI_TTI = ['쥐','소','호랑이','토끼','용','뱀','말','양','원숭이','닭','개','돼지'];

// 지장간 (본기 위주, 십성 계산 보조용)
const JIJANGGAN = {
  0:[9], 1:[5,9,7], 2:[0,4,2], 3:[1], 4:[4,1,9], 5:[2,4,6],
  6:[3,5], 7:[5,1,3], 8:[6,8,4], 9:[7], 10:[4,7,3], 11:[8,0],
};

// 12절기 (월의 시작). 황경 315도 = 입춘 = 인월 시작
const JEOLGI = [
  { name:'입춘', lon:315, branch:2  },
  { name:'경칩', lon:345, branch:3  },
  { name:'청명', lon:15,  branch:4  },
  { name:'입하', lon:45,  branch:5  },
  { name:'망종', lon:75,  branch:6  },
  { name:'소서', lon:105, branch:7  },
  { name:'입추', lon:135, branch:8  },
  { name:'백로', lon:165, branch:9  },
  { name:'한로', lon:195, branch:10 },
  { name:'입동', lon:225, branch:11 },
  { name:'대설', lon:255, branch:0  },
  { name:'소한', lon:285, branch:1  },
];

// ---------------- 천문 계산 ----------------

const RAD = Math.PI / 180;

// 날짜 -> 율리우스일 (UT 기준)
function toJD(y, m, d, hour) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1))
       + d + B - 1524.5 + (hour || 0) / 24;
}

// 율리우스일 -> 날짜
function fromJD(jd) {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const day = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  const dayInt = Math.floor(day);
  const hours = (day - dayInt) * 24;
  return { y: year, m: month, d: dayInt, hour: hours };
}

// ΔT (지구시 - 세계시, 초). Espenak & Meeus 근사식
function deltaT(year) {
  let t, u;
  if (year >= 2005 && year < 2050) { t = year - 2000; return 62.92 + 0.32217*t + 0.005589*t*t; }
  if (year >= 1986 && year < 2005) { t = year - 2000; return 63.86 + 0.3345*t - 0.060374*t*t + 0.0017275*t*t*t + 0.000651814*t**4 + 0.00002373599*t**5; }
  if (year >= 1961 && year < 1986) { t = year - 1975; return 45.45 + 1.067*t - t*t/260 - t*t*t/718; }
  if (year >= 1941 && year < 1961) { t = year - 1950; return 29.07 + 0.407*t - t*t/233 + t*t*t/2547; }
  if (year >= 1920 && year < 1941) { t = year - 1920; return 21.20 + 0.84493*t - 0.076100*t*t + 0.0020936*t*t*t; }
  if (year >= 1900 && year < 1920) { t = year - 1900; return -2.79 + 1.494119*t - 0.0598939*t*t + 0.0061966*t*t*t - 0.000197*t**4; }
  if (year >= 2050) { t = year - 2000; return 62.92 + 0.32217*t + 0.005589*t*t; }
  u = (year - 1820) / 100;
  return -20 + 32*u*u;
}

// 태양의 겉보기 황경 (도). 세계시(UT)를 받아 지구시로 바꿔 계산한다.
function sunLongitude(jdUT) {
  const yr = 2000 + (jdUT - 2451545.0) / 365.25;
  const jd = jdUT + deltaT(yr) / 86400;
  const T = (jd - 2451545.0) / 36525.0;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mr = M * RAD;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
          + 0.000289 * Math.sin(3 * Mr);
  let trueLong = L0 + C;

  // 행성 섭동 보정 (금성·목성·달). Meeus 25장
  const A1 = (351.52 + 22518.7541 * T) * RAD;
  const B1 = (253.14 + 45542.51 * T) * RAD;
  const C1 = (157.23 + 32964.47 * T) * RAD;
  const D1 = (297.85 + 445267.11 * T) * RAD;
  const E1 = (252.08 + 20.19 * T) * RAD;
  const H1 = (42.43 + 65928.93 * T) * RAD;
  trueLong += 0.00134 * Math.cos(A1) + 0.00154 * Math.cos(B1)
            + 0.00200 * Math.cos(C1) + 0.00179 * Math.sin(D1)
            + 0.00178 * Math.sin(E1) + 0.00104 * Math.cos(H1);

  const omega = 125.04 - 1934.136 * T;
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  return ((apparent % 360) + 360) % 360;
}

// 균시차 (분). 진태양시 보정용
function equationOfTime(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  const L0 = ((280.46646 + 36000.76983 * T) % 360 + 360) % 360;
  const M = (357.52911 + 35999.05029 * T) * RAD;
  const e = 0.016708634 - 0.000042037 * T;
  const eps = 23.439291 - 0.0130042 * T;
  const y = Math.tan(eps / 2 * RAD) ** 2;
  const E = y * Math.sin(2 * L0 * RAD)
          - 2 * e * Math.sin(M)
          + 4 * e * y * Math.sin(M) * Math.cos(2 * L0 * RAD)
          - 0.5 * y * y * Math.sin(4 * L0 * RAD)
          - 1.25 * e * e * Math.sin(2 * M);
  return E / RAD * 4;   // 도 -> 분
}

// 특정 연도에서 태양 황경이 target 도가 되는 시각(JD)을 찾는다
function findTermJD(year, targetLon) {
  // 대략적인 시작점: 황경 0도가 3월 20일경
  let approxMonth = ((targetLon + 45) % 360) / 30;   // 0도 -> 3월 근처
  let jd = toJD(year, 1, 1, 0) + approxMonth * 30.44;

  for (let i = 0; i < 60; i++) {
    let diff = sunLongitude(jd) - targetLon;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) < 0.000005) break;
    jd -= diff * 365.2422 / 360;   // 하루에 약 1도씩 이동
  }
  return jd;
}

// 해당 연도의 12절기 시각(JD, UT). 한국시간으로 쓰려면 +9시간
function termsOfYear(year) {
  return JEOLGI.map(t => {
    // 소한(285도)·대설(255도)은 해가 바뀌는 구간이라 연도 보정
    let y = year;
    let jd = findTermJD(y, t.lon);
    const dt = fromJD(jd + 9 / 24);
    if (dt.y !== year) {
      jd = findTermJD(year + (dt.y < year ? 1 : -1), t.lon);
    }
    return { ...t, jd };
  }).sort((a, b) => a.jd - b.jd);
}

// ---------------- 사주 계산 ----------------

/**
 * @param {object} p
 *   y,m,d     양력 생년월일
 *   hour,min  태어난 시각 (모르면 null)
 *   lon       출생지 경도 (기본 서울 126.978)
 *   gender    '남' | '여'
 */
function calcSaju(p) {
  const lon = (typeof p.lon === 'number') ? p.lon : 126.978;
  const known = (p.hour !== null && p.hour !== undefined);

  // 시각을 모르면 정오로 두고 계산 (일주까지는 유효)
  const hh = known ? p.hour : 12;
  const mm = known ? (p.min || 0) : 0;

  // 한국 표준시(UTC+9) -> UT
  const jdKST = toJD(p.y, p.m, p.d, hh + mm / 60);
  const jdUT  = jdKST - 9 / 24;

  // --- 진태양시 ---
  // 한국 표준시는 동경 135도 기준. 출생지 경도만큼 보정하고 균시차를 더한다.
  const lonCorrMin = (lon - 135) * 4;
  const eotMin = equationOfTime(jdUT);
  const trueSolarMin = hh * 60 + mm + lonCorrMin + eotMin;

  // --- 연주 / 월주 (절기 기준) ---
  let terms = termsOfYear(p.y);
  let prev = null, sajuYear = p.y;

  // 이번 해 절기 중 출생시각 이전의 마지막 절기를 찾는다
  for (const t of terms) {
    if (jdUT >= t.jd) prev = t; else break;
  }
  if (!prev) {
    // 입춘 전에 태어남 -> 전년도 마지막 절기(대설/소한)
    terms = termsOfYear(p.y - 1);
    prev = terms[terms.length - 1];
    sajuYear = p.y - 1;
  } else {
    // 입춘 이전이면 사주상 전년도
    const ipchun = terms.find(t => t.name === '입춘');
    if (jdUT < ipchun.jd) sajuYear = p.y - 1;
  }

  const yearGan = ((sajuYear - 4) % 10 + 10) % 10;
  const yearJi  = ((sajuYear - 4) % 12 + 12) % 12;

  const monthJi = prev.branch;
  // 오호둔: 월간 = (연간 % 5) * 2 + 인월부터의 순번
  const monthOrder = (monthJi - 2 + 12) % 12;
  const monthGan = (((yearGan % 5) * 2 + 2) + monthOrder) % 10;

  // --- 일주 ---
  // 1984-02-02 = 갑자일 기준. 자정(한국시간) 넘김 기준으로 계산
  const baseJD = toJD(1984, 2, 2, 0) - 9 / 24;
  const dayIndex = Math.floor(jdUT + 9 / 24 - 0.5) - Math.floor(baseJD + 9 / 24 - 0.5);
  const dayGan = ((dayIndex % 10) + 10) % 10;
  const dayJi  = ((dayIndex % 12) + 12) % 12;

  // --- 시주 ---
  let hourGan = null, hourJi = null;
  if (known) {
    // 진태양시 기준. 23:00~01:00 = 자시
    let tm = ((trueSolarMin % 1440) + 1440) % 1440;
    hourJi = Math.floor(((tm + 60) % 1440) / 120);
    // 오서둔: 시간 = (일간 % 5) * 2 + 시지
    hourGan = (((dayGan % 5) * 2) + hourJi) % 10;
  }

  const pillars = {
    year:  { gan: yearGan,  ji: yearJi  },
    month: { gan: monthGan, ji: monthJi },
    day:   { gan: dayGan,   ji: dayJi   },
    hour:  known ? { gan: hourGan, ji: hourJi } : null,
  };

  return {
    pillars,
    sajuYear,
    term: prev.name,
    trueSolarTime: known ? fmtMin(trueSolarMin) : null,
    correction: { lonMin: lonCorrMin, eotMin },
    ohaeng: countOhaeng(pillars),
    sipseong: calcSipseong(pillars),
    daeun: calcDaeun(p, pillars, yearGan, jdUT),
    tti: JI_TTI[yearJi],
  };
}

function fmtMin(total) {
  let t = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60), m = Math.round(t % 60);
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}

// 오행 개수 (천간 + 지지 + 지장간 본기)
function countOhaeng(pil) {
  const cnt = { 목:0, 화:0, 토:0, 금:0, 수:0 };
  const list = [pil.year, pil.month, pil.day];
  if (pil.hour) list.push(pil.hour);
  list.forEach(p => {
    cnt[GAN_OHAENG[p.gan]]++;
    cnt[JI_OHAENG[p.ji]]++;
  });
  return cnt;
}

// 십성 (일간 기준)
const SIPSEONG_NAMES = {
  '비견':'비견','겁재':'겁재','식신':'식신','상관':'상관','편재':'편재',
  '정재':'정재','편관':'편관','정관':'정관','편인':'편인','정인':'정인'
};
const OHAENG_ORDER = ['목','화','토','금','수'];

function sipseongOf(dayGan, targetGan) {
  const me = GAN_OHAENG[dayGan], you = GAN_OHAENG[targetGan];
  const sameYinYang = GAN_EUMYANG[dayGan] === GAN_EUMYANG[targetGan];
  const mi = OHAENG_ORDER.indexOf(me), yi = OHAENG_ORDER.indexOf(you);
  const rel = ((yi - mi) + 5) % 5;
  // 0:같음 1:내가생함 2:내가극함 3:나를극함 4:나를생함
  if (rel === 0) return sameYinYang ? '비견' : '겁재';
  if (rel === 1) return sameYinYang ? '식신' : '상관';
  if (rel === 2) return sameYinYang ? '편재' : '정재';
  if (rel === 3) return sameYinYang ? '편관' : '정관';
  return sameYinYang ? '편인' : '정인';
}

function calcSipseong(pil) {
  const d = pil.day.gan;
  const out = {
    year:  { gan: sipseongOf(d, pil.year.gan),  ji: sipseongOf(d, JIJANGGAN[pil.year.ji][0])  },
    month: { gan: sipseongOf(d, pil.month.gan), ji: sipseongOf(d, JIJANGGAN[pil.month.ji][0]) },
    day:   { gan: '일간',                        ji: sipseongOf(d, JIJANGGAN[pil.day.ji][0])   },
    hour:  pil.hour ? { gan: sipseongOf(d, pil.hour.gan), ji: sipseongOf(d, JIJANGGAN[pil.hour.ji][0]) } : null,
  };
  return out;
}

// 대운: 연간 음양과 성별로 순행/역행, 절기까지 거리로 시작 나이
function calcDaeun(p, pil, yearGan, jdUT) {
  const yangYear = GAN_EUMYANG[yearGan] === '양';
  const male = p.gender !== '여';
  const forward = (yangYear && male) || (!yangYear && !male);

  // 앞뒤 절기까지의 일수
  const all = [...termsOfYear(p.y - 1), ...termsOfYear(p.y), ...termsOfYear(p.y + 1)]
              .sort((a,b) => a.jd - b.jd);
  let nextT = all.find(t => t.jd > jdUT);
  let prevT = [...all].reverse().find(t => t.jd <= jdUT);
  const days = forward ? (nextT.jd - jdUT) : (jdUT - prevT.jd);
  const startAge = Math.max(1, Math.round(days / 3 * 10) / 10);

  const list = [];
  let g = pil.month.gan, j = pil.month.ji;
  for (let i = 0; i < 8; i++) {
    g = forward ? (g + 1) % 10 : (g + 9) % 10;
    j = forward ? (j + 1) % 12 : (j + 11) % 12;
    list.push({ age: Math.floor(startAge) + i * 10, gan: g, ji: j });
  }
  return { forward, startAge, list };
}

// 화면 표시용 문자열
function pillarText(p) {
  if (!p) return { ko: '—', hanja: '—' };
  return {
    ko: GAN[p.gan] + JI[p.ji],
    hanja: GAN_HANJA[p.gan] + JI_HANJA[p.ji],
    ganKo: GAN[p.gan], jiKo: JI[p.ji],
    ganHanja: GAN_HANJA[p.gan], jiHanja: JI_HANJA[p.ji],
    ganOh: GAN_OHAENG[p.gan], jiOh: JI_OHAENG[p.ji],
  };
}

/* ================================================================
 * 화면 처리
 * ================================================================ */

function sjToggleTime() {
  const off = document.getElementById('sj-unknown').checked;
  ['sj-hour','sj-min'].forEach(id => {
    const el = document.getElementById(id);
    el.disabled = off;
    el.style.opacity = off ? 0.4 : 1;
    if (off) el.value = '';
  });
}

function showSaju() {
  document.querySelectorAll('[id^="section-"]').forEach(el => { el.style.display = 'none'; });
  const sec = document.getElementById('section-saju');
  if (sec) sec.style.display = 'block';
  window.scrollTo(0, 0);
}

const OH_COLOR = { 목:'#5fa85f', 화:'#e05a5a', 토:'#c9a04c', 금:'#b8b8c0', 수:'#5a8ee0' };

/* ================================================================
 * 해석
 * ================================================================ */

// 일간별 성격 (천간 10종)
const ILGAN_DESC = {
  '갑': { symbol:'큰 나무', trait:'곧고 추진력이 있습니다. 한번 정하면 밀고 나가는 힘이 강하고 윗자리에 서는 것을 자연스러워합니다. 다만 유연하게 굽히는 일에 서툴러 부러지기 쉬운 면이 있습니다.', job:'경영, 교육, 건설, 공공기관' },
  '을': { symbol:'풀과 넝쿨', trait:'부드럽고 적응이 빠릅니다. 환경이 바뀌어도 살아남는 생명력이 있고 사람 사이를 잘 엮습니다. 대신 결정을 미루거나 남에게 기대는 경향이 있습니다.', job:'기획, 상담, 디자인, 원예, 서비스' },
  '병': { symbol:'태양', trait:'밝고 거침이 없습니다. 감정 표현이 솔직하고 주변을 환하게 만듭니다. 뒤끝이 없는 대신 성급하고 뒷마무리가 약할 수 있습니다.', job:'방송, 영업, 홍보, 강연, 예술' },
  '정': { symbol:'촛불', trait:'섬세하고 따뜻합니다. 남을 배려하고 속이 깊습니다. 겉으로는 조용해도 안에 고집이 있으며 상처를 오래 담아두는 편입니다.', job:'연구, 의료, 교육, 요리, 공예' },
  '무': { symbol:'큰 산', trait:'묵직하고 믿음직합니다. 쉽게 흔들리지 않고 사람을 품는 그릇이 있습니다. 대신 변화를 싫어하고 움직임이 느릴 수 있습니다.', job:'부동산, 건축, 행정, 금융, 농업' },
  '기': { symbol:'논밭의 흙', trait:'실속 있고 현실적입니다. 남을 키우고 뒷받침하는 데 능합니다. 걱정이 많고 속내를 잘 드러내지 않는 편입니다.', job:'교육, 회계, 농업, 중개, 관리' },
  '경': { symbol:'무쇠', trait:'결단이 빠르고 원칙이 분명합니다. 불의를 참지 못하고 맺고 끊음이 확실합니다. 대신 말이 직설적이라 부딪히기 쉽습니다.', job:'군경, 법조, 의료, 기계, 스포츠' },
  '신': { symbol:'보석', trait:'깔끔하고 예리합니다. 안목이 뛰어나고 완성도에 집착합니다. 자존심이 강해 상처를 잘 받고 까다롭게 보일 수 있습니다.', job:'금융, 회계, 디자인, 의료, 보석·정밀' },
  '임': { symbol:'큰 물', trait:'생각이 넓고 포용력이 있습니다. 상황을 읽는 눈이 좋고 임기응변에 강합니다. 대신 속을 알기 어렵고 한곳에 머물지 못하는 면이 있습니다.', job:'무역, 물류, 기획, 외교, 수산' },
  '계': { symbol:'이슬비', trait:'조용하고 사려 깊습니다. 관찰력이 좋고 남이 놓친 것을 봅니다. 예민하고 걱정이 많아 스스로를 소모시킬 수 있습니다.', job:'연구, 상담, 기획, 문학, 의료' },
};

// 십성별 의미
const SIPSEONG_DESC = {
  '비견':'자립심과 경쟁심. 동료·형제 인연',
  '겁재':'승부욕과 추진력. 재물 다툼 주의',
  '식신':'표현력과 여유. 먹을 복과 건강',
  '상관':'재능과 반항. 말솜씨와 창의성',
  '편재':'큰 재물과 사교. 변동이 큰 돈',
  '정재':'꾸준한 재물과 성실. 안정적 수입',
  '편관':'추진력과 압박. 도전과 위기 관리',
  '정관':'명예와 질서. 직장운과 책임감',
  '편인':'직관과 전문성. 독특한 공부',
  '정인':'학문과 보호. 어른 복과 문서운',
};

const SAENG = { 목:'화', 화:'토', 토:'금', 금:'수', 수:'목' };   // 생하는 관계
const GEUK  = { 목:'토', 토:'수', 수:'화', 화:'금', 금:'목' };   // 극하는 관계

// 신강 / 신약 판정
function calcStrength(r) {
  const P = r.pillars;
  const me = GAN_OHAENG[P.day.gan];
  const helper = Object.keys(SAENG).find(k => SAENG[k] === me);   // 나를 생하는 오행

  let score = 0;
  const weigh = (oh, w) => {
    if (oh === me) score += w;                 // 비겁
    else if (oh === helper) score += w * 0.8;  // 인성
    else if (SAENG[me] === oh) score -= w * 0.6;   // 식상
    else if (GEUK[me] === oh) score -= w * 0.5;    // 재성
    else score -= w * 0.9;                     // 관성
  };

  // 월지 비중을 가장 크게 둔다
  weigh(JI_OHAENG[P.month.ji], 3.0);
  weigh(GAN_OHAENG[P.month.gan], 1.2);
  weigh(JI_OHAENG[P.day.ji], 1.5);
  weigh(GAN_OHAENG[P.year.gan], 1.0);
  weigh(JI_OHAENG[P.year.ji], 1.0);
  if (P.hour) {
    weigh(GAN_OHAENG[P.hour.gan], 1.0);
    weigh(JI_OHAENG[P.hour.ji], 1.2);
  }

  let level, desc;
  if (score >= 2.0)       { level = '신강';   desc = '일간의 기운이 강한 편입니다. 스스로 밀고 나가는 힘이 있어 주도적이지만, 고집으로 흐르면 주변과 부딪칩니다.'; }
  else if (score >= 0.5)  { level = '중화(강)'; desc = '일간이 적당히 힘을 갖춘 편입니다. 균형이 좋아 상황에 따라 유연하게 대응할 수 있습니다.'; }
  else if (score >= -0.5) { level = '중화';   desc = '일간의 강약이 고른 편입니다. 치우침이 적어 무난하게 풀리는 구조입니다.'; }
  else if (score >= -2.0) { level = '중화(약)'; desc = '일간이 다소 약한 편입니다. 혼자보다 사람을 곁에 두고 가는 쪽이 유리합니다.'; }
  else                    { level = '신약';   desc = '일간의 기운이 약한 편입니다. 무리해서 끌고 가기보다 도움을 받고 때를 기다리는 편이 낫습니다.'; }

  // 용신 (강하면 빼주는 오행, 약하면 채워주는 오행)
  const strong = score >= 0.5;
  const yongsin = strong
    ? [SAENG[me], GEUK[me]]                                  // 식상·재성으로 설기
    : [helper, me];                                          // 인성·비겁으로 보강
  const gisin = strong ? [helper, me] : [SAENG[me], GEUK[me]];

  return { score: Math.round(score * 10) / 10, level, desc, me, yongsin, gisin, strong };
}

// 십성 개수 집계
function sipseongCount(r) {
  const cnt = {};
  Object.values(r.sipseong).forEach(v => {
    if (!v) return;
    [v.gan, v.ji].forEach(k => { if (k && k !== '일간') cnt[k] = (cnt[k] || 0) + 1; });
  });
  return cnt;
}



/* ================================================================
 * 결과 화면 (한지 톤 밝은 배경)
 * ================================================================ */

// 밝은 배경 위에서 또렷하게 보이는 색
const OH_INK = { 목:'#2f7a3a', 화:'#b32b2b', 토:'#8a6a1a', 금:'#5a5a6e', 수:'#1f5a9e' };

const PAPER   = '#efe6d0';   // 바탕
const PAPER2  = '#f7f1e2';   // 카드
const INK     = '#3a2f1c';   // 본문 글씨
const INK_DIM = '#8a7a5c';   // 보조 글씨
const LINE_C  = '#d5c8a8';   // 선
const ACCENT  = '#8a1f1f';   // 강조(붉은 인주색)

const OH_EASY = {
  목: { name:'나무 기운', key:'자라남 · 시작 · 성장' },
  화: { name:'불 기운',   key:'밝음 · 표현 · 열정' },
  토: { name:'흙 기운',   key:'안정 · 신용 · 버팀' },
  금: { name:'쇠 기운',   key:'결단 · 정리 · 원칙' },
  수: { name:'물 기운',   key:'지혜 · 유연함 · 생각' },
};

const SS_EASY = {
  '비견':{ n:'내 편이 되는 힘', t:'혼자서도 잘 해냅니다. 누가 시켜서가 아니라 내가 정해서 움직이는 쪽이에요. 친구나 동료가 곁에 붙는 복도 함께 옵니다.' },
  '겁재':{ n:'이기고 싶은 힘',  t:'지는 걸 싫어하고 승부가 걸리면 눈빛이 달라집니다. 다만 돈이 얽힌 관계는 처음부터 선을 긋는 게 편합니다.' },
  '식신':{ n:'즐기는 힘',      t:'여유가 있고 잘 먹고 잘 웃습니다. 좋아하는 일을 할 때 가장 빛나고, 주변 사람을 편하게 만드는 재주가 있어요.' },
  '상관':{ n:'튀는 힘',        t:'말도 재주도 남다릅니다. 시키는 대로만 하는 자리에서는 답답해하고, 자기 방식대로 할 때 실력이 나옵니다.' },
  '편재':{ n:'크게 버는 힘',    t:'기회를 보는 눈이 밝고 사람을 잘 사귑니다. 돈이 크게 들어오는 만큼 크게 나가기도 해서 관리가 중요해요.' },
  '정재':{ n:'차곡차곡 모으는 힘', t:'성실하고 알뜰합니다. 한 방보다는 매달 쌓이는 쪽이 잘 맞고, 그렇게 모은 게 오래 남습니다.' },
  '편관':{ n:'버텨내는 힘',     t:'힘든 상황에서 오히려 강해집니다. 책임이 무거운 자리도 감당하지만, 스스로를 몰아붙이다 지치기 쉬워요.' },
  '정관':{ n:'믿음을 주는 힘',  t:'약속을 지키고 질서를 따릅니다. 조직이나 직장에서 인정받고, 맡기면 되는 사람이라는 평을 듣습니다.' },
  '편인':{ n:'깊게 파는 힘',    t:'남들이 안 보는 걸 봅니다. 한 분야를 끝까지 파고드는 재주가 있지만 생각이 너무 많아질 때가 있어요.' },
  '정인':{ n:'배우고 받는 힘',  t:'공부와 문서에 강하고 윗사람이 잘 챙겨줍니다. 급하게 가기보다 차근차근 쌓아 올리는 쪽입니다.' },
};

/* ---------------- 분야별 운세 ---------------- */

// 십성을 분야별로 묶는다
const SS_GROUP = {
  재물: ['편재','정재'],
  직업: ['정관','편관'],
  표현: ['식신','상관'],
  학문: ['정인','편인'],
  자립: ['비견','겁재'],
};

function groupCount(cnt, key) {
  return SS_GROUP[key].reduce((a, k) => a + (cnt[k] || 0), 0);
}

// 점수를 별로
function stars(n) {
  const full = Math.max(1, Math.min(5, n));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

/**
 * 분야별 운세 산출
 * 십성 구성 + 오행 균형 + 신강약을 조합해 점수와 문장을 만든다.
 */
function calcLuck(r, ST, cnt, gender) {
  const oh = r.ohaeng;
  const P = r.pillars;
  const total = Object.values(oh).reduce((a,b)=>a+b,0) || 1;
  const hasHour = !!P.hour;

  const jae = groupCount(cnt, '재물');
  const gwan = groupCount(cnt, '직업');
  const sik = groupCount(cnt, '표현');
  const inn = groupCount(cnt, '학문');
  const bi  = groupCount(cnt, '자립');

  const out = [];

  // ---------- 직업운 ----------
  {
    let sc = 2 + gwan + (inn > 0 ? 1 : 0) + (ST.strong ? 0 : 1);
    if (gwan === 0) sc -= 1;
    let head, body;
    if (gwan >= 3) {
      head = '조직에서 빛나는 사람';
      body = '책임이 주어질수록 힘이 나는 구조입니다. 회사나 단체처럼 질서가 있는 곳에서 인정받고, 맡은 자리를 끝까지 지켜내는 뚝심이 있습니다. 다만 짊어지는 게 많아 스스로를 몰아붙이기 쉬우니 쉬는 날은 진짜로 쉬세요.';
    } else if (gwan === 0 && sik >= 2) {
      head = '내 이름 걸고 하는 사람';
      body = '남이 시키는 대로 하는 자리에서는 답답함을 느낍니다. 프리랜서, 창작, 기술직처럼 실력으로 증명하는 쪽이 훨씬 잘 맞습니다. 조직에 들어가더라도 재량이 있는 자리를 고르세요.';
    } else if (gwan === 0) {
      head = '천천히 자리를 찾는 사람';
      body = '한 번에 딱 맞는 일을 만나기보다 여러 경험을 거치며 길을 찾는 편입니다. 조급해하지 않아도 됩니다. 쌓인 경험이 나중에 남들이 못 가진 무기가 됩니다.';
    } else {
      head = '균형 잡힌 직업운';
      body = '조직 생활도 독립도 무난하게 해내는 구조입니다. 어느 쪽이든 크게 어긋나지 않으니, 사람과 분위기를 보고 고르셔도 좋습니다.';
    }
    out.push({ icon:'💼', title:'직업운', head, body, score: sc,
               tip: `잘 맞는 분야 · ${ILGAN_DESC[GAN[P.day.gan]].job}` });
  }

  // ---------- 금전운 ----------
  {
    let sc = 2 + jae + (ST.strong ? 1 : 0);
    if (jae === 0) sc -= 1;
    if ((cnt['겁재']||0) >= 2) sc -= 1;
    let head, body, tip;
    const pyeon = cnt['편재'] || 0, jeong = cnt['정재'] || 0;
    if (pyeon > jeong && pyeon > 0) {
      head = '크게 벌고 크게 쓰는 돈';
      body = '한 번에 큰 돈이 오가는 흐름입니다. 기회를 보는 눈이 밝아 남들이 못 본 자리를 찾아내지만, 들어온 만큼 나가기도 쉽습니다. 버는 계좌와 쓰는 계좌를 나눠두는 것만으로도 크게 달라집니다.';
      tip = '들어올 때 일부를 무조건 떼어 묶어두세요.';
    } else if (jeong > 0) {
      head = '차곡차곡 쌓이는 돈';
      body = '한 방보다 매달 쌓이는 쪽이 잘 맞습니다. 급하게 불리려 들면 오히려 새고, 꾸준히 모으면 어느 순간 든든해져 있습니다. 목돈보다 습관이 재산이 되는 구조예요.';
      tip = '자동이체로 강제 저축하는 방식이 잘 맞습니다.';
    } else {
      head = '돈보다 사람이 재산';
      body = '재물 글자가 뚜렷하지 않습니다. 돈을 쫓기보다 실력과 사람을 쌓으면 그게 나중에 돈으로 바뀌는 흐름입니다. 조급하게 굴릴수록 손해가 큽니다.';
      tip = '투기성 자산은 되도록 멀리하세요.';
    }
    if ((cnt['겁재']||0) >= 2) body += ' 특히 지인과 돈이 얽히는 일은 처음부터 선을 그어두는 편이 낫습니다.';
    out.push({ icon:'💰', title:'금전운', head, body, score: sc, tip });
  }

  // ---------- 연애운 / 결혼운 ----------
  {
    // 남자는 재성이 배우자, 여자는 관성이 배우자
    const spouse = gender === '여' ? gwan : jae;
    let sc = 2 + spouse + (sik > 0 ? 1 : 0);
    if (spouse === 0) sc -= 1;
    if (bi >= 3) sc -= 1;
    const dayJiOh = JI_OHAENG[P.day.ji];
    let head, body, tip;
    if (spouse >= 3) {
      head = '인연이 끊이지 않는 사람';
      body = '이성의 관심을 받는 기운이 넉넉합니다. 다가오는 사람이 많은 만큼 고르는 눈이 중요해집니다. 조건보다 함께 있을 때 편한 사람을 보세요.';
      tip = '여러 인연 중 오래 갈 사람을 가려내는 게 과제입니다.';
    } else if (spouse === 0) {
      head = '늦게 만나 오래 가는 인연';
      body = '배우자 글자가 뚜렷하지 않아 인연이 늦게 닿는 편입니다. 대신 한번 자리 잡으면 흔들림이 적습니다. 급하게 맞추려다 아닌 사람을 붙잡지 않는 게 중요합니다.';
      tip = '주변 소개나 오래 알던 사이에서 인연이 열립니다.';
    } else if (bi >= 3) {
      head = '내 공간이 필요한 사람';
      body = '자기 세계가 뚜렷해 혼자 있는 시간이 꼭 필요합니다. 붙어 있기를 바라는 상대와는 부딪히기 쉽고, 서로의 영역을 존중해주는 사람과 오래 갑니다.';
      tip = '거리를 두는 게 아니라는 걸 말로 설명해주세요.';
    } else {
      head = '무난하게 풀리는 인연';
      body = '만남과 관계가 크게 어긋나지 않는 구조입니다. 극적인 드라마는 적어도 안정적으로 이어집니다. 일상을 함께 쌓아가는 관계에서 힘이 납니다.';
      tip = '큰 이벤트보다 매일의 대화가 관계를 지킵니다.';
    }
    body += ` 일지(배우자 자리)가 ${OH_EASY[dayJiOh].name}이라, 배우자는 ${OH_EASY[dayJiOh].key.split(' · ')[0]}의 성향을 가진 사람일 가능성이 높습니다.`;
    out.push({ icon:'💕', title: gender === '여' ? '연애운 · 결혼운' : '연애운 · 결혼운', head, body, score: sc, tip });
  }

  // ---------- 건강운 ----------
  {
    const zero = Object.entries(oh).filter(([,v]) => v === 0).map(([k]) => k);
    const over = Object.entries(oh).filter(([,v]) => v >= 4).map(([k]) => k);
    let sc = 4 - zero.length - over.length + (ST.level.startsWith('중화') ? 1 : 0);
    const BODY_MAP = { 목:'간·눈·근육', 화:'심장·혈압·수면', 토:'위장·소화', 금:'폐·호흡기·피부', 수:'신장·방광·허리' };
    let head, body, tip;
    if (zero.length === 0 && over.length === 0) {
      head = '고르게 타고난 몸';
      body = '다섯 기운이 치우침 없이 갖춰져 있습니다. 큰 병치레 없이 무난하게 가는 편이고, 기본만 지켜도 잘 버팁니다.';
      tip = '지금 습관을 유지하는 것이 최선입니다.';
    } else if (over.length) {
      head = `${OH_EASY[over[0]].name}이 몰린 몸`;
      body = `${OH_EASY[over[0]].name}이 지나치게 많습니다. 한쪽으로 쏠린 기운은 그 자리에 부담을 줍니다. ${BODY_MAP[over[0]]} 쪽을 평소에 챙기시면 좋습니다.`;
      tip = `무리한 몰입보다 규칙적인 리듬이 중요합니다.`;
    } else {
      head = `${OH_EASY[zero[0]].name}이 비어 있는 몸`;
      body = `${OH_EASY[zero[0]].name}이 없습니다. 그쪽 기능이 약해지기 쉬우니 ${BODY_MAP[zero[0]]} 쪽을 미리 관리하시는 게 좋습니다. 큰 문제라기보다 신경 써야 할 부분이라는 뜻입니다.`;
      tip = `${OH_EASY[zero[0]].name}을 채우는 생활(${zero[0]==='목'?'산책과 초록':zero[0]==='화'?'햇빛과 활동':zero[0]==='토'?'규칙적인 식사':zero[0]==='금'?'맑은 공기와 정리':'충분한 물과 휴식'})이 도움이 됩니다.`;
    }
    out.push({ icon:'🌿', title:'건강운', head, body, score: sc, tip });
  }

  // ---------- 자녀운 ----------
  {
    // 남자는 관성이 자식, 여자는 식상이 자식
    const child = gender === '여' ? sik : gwan;
    let sc = 2 + child + (hasHour ? 1 : 0);
    let head, body, tip;
    if (!hasHour) {
      head = '시각을 알면 더 정확합니다';
      body = '자녀운은 시주(태어난 시각)를 함께 봐야 제대로 읽힙니다. 시각을 모르는 상태에서는 참고 정도로만 보시는 게 좋습니다.';
      tip = '출생 시각을 확인하시면 다시 봐드릴 수 있습니다.';
      sc = 3;
    } else if (child >= 3) {
      head = '자식 복이 넉넉한 편';
      body = '자녀와 인연이 두터운 구조입니다. 아이에게 쏟는 마음이 크고 그만큼 돌아오는 것도 있습니다. 다만 기대가 커지면 서로 부담이 되니 한 발 물러서 보는 여유도 필요합니다.';
      tip = '아이의 속도를 존중해주는 게 관계를 지킵니다.';
    } else if (child === 0) {
      head = '늦게 인연이 닿는 자녀운';
      body = '자녀 글자가 뚜렷하지 않아 인연이 늦게 오거나 수가 적은 편입니다. 적은 만큼 깊게 가는 관계가 되고, 자식 외의 영역에서 보람을 찾는 경우도 많습니다.';
      tip = '조급해하지 않아도 되는 흐름입니다.';
    } else {
      head = '무난한 자녀운';
      body = '자녀와의 관계가 크게 어긋나지 않습니다. 평범하게 낳고 기르는 흐름이고, 큰 갈등 없이 지나가는 편입니다.';
      tip = '말년의 시주 기운이 자녀 관계를 좌우합니다.';
    }
    out.push({ icon:'👶', title:'자녀운', head, body, score: sc, tip });
  }

  return out.map(o => ({ ...o, score: Math.max(1, Math.min(5, o.score)) }));
}

function daeunHint(dayGan, u) {
  const rel = sipseongOf(dayGan, u.gan);
  const M = {
    '비견':'스스로 결정하고 움직이게 되는 시기',
    '겁재':'경쟁이 붙고 승부를 보게 되는 시기',
    '식신':'마음이 여유로워지고 즐길 일이 늘어나는 시기',
    '상관':'재능을 드러내고 하고 싶은 말을 하게 되는 시기',
    '편재':'돈과 사람이 크게 오가는 시기',
    '정재':'꾸준히 모으고 안정을 다지는 시기',
    '편관':'책임이 무거워지고 시험대에 오르는 시기',
    '정관':'인정받고 자리를 잡아가는 시기',
    '편인':'깊이 파고들고 배우게 되는 시기',
    '정인':'도움을 받고 공부·문서 운이 열리는 시기',
  };
  return M[rel] || '';
}

function sjReset() {
  document.getElementById('sj-form').style.display = 'flex';
  document.getElementById('sj-result').style.display = 'none';
  document.getElementById('sj-loading').style.display = 'none';
  window.scrollTo(0, 0);
}

// 풀이하는 동안 보여줄 단계별 문구
const SJ_STEPS = [
  '생년월일을 만세력으로 옮기는 중',
  '절기를 짚어 연주와 월주를 세우는 중',
  '진태양시를 계산해 시주를 맞추는 중',
  '여덟 글자의 오행을 헤아리는 중',
  '십성을 살펴 타고난 힘을 읽는 중',
  '십 년마다 바뀌는 흐름을 펼치는 중',
  '풀이를 정리하는 중',
];

// 로딩 연출을 보여준 뒤 결과를 그린다
function sjRunWithLoading(render) {
  const form = document.getElementById('sj-form');
  const load = document.getElementById('sj-loading');
  const text = document.getElementById('sj-load-text');
  const fill = document.getElementById('sj-load-fill');

  form.style.display = 'none';
  load.style.display = 'block';
  load.scrollIntoView({ behavior: 'smooth', block: 'center' });

  let i = 0;
  text.textContent = SJ_STEPS[0];
  fill.style.width = '6%';

  const timer = setInterval(() => {
    i++;
    if (i < SJ_STEPS.length) {
      text.textContent = SJ_STEPS[i];
      fill.style.width = Math.round((i + 1) / SJ_STEPS.length * 94 + 6) + '%';
    }
  }, 620);

  setTimeout(() => {
    clearInterval(timer);
    fill.style.width = '100%';
    setTimeout(() => {
      load.style.display = 'none';
      render();
    }, 300);
  }, 620 * SJ_STEPS.length);
}

function runSaju() {
  const err = document.getElementById('sj-error');
  const box = document.getElementById('sj-result');
  err.textContent = '';

  const y = parseInt(document.getElementById('sj-year').value, 10);
  const mo = parseInt(document.getElementById('sj-month').value, 10);
  const d = parseInt(document.getElementById('sj-day').value, 10);
  const unknown = document.getElementById('sj-unknown').checked;
  const hh = unknown ? null : parseInt(document.getElementById('sj-hour').value, 10);
  const mi = unknown ? null : (parseInt(document.getElementById('sj-min').value, 10) || 0);
  const gender = document.getElementById('sj-gender').value;
  const name = (document.getElementById('sj-name').value || '').trim();
  const lon = parseFloat(document.getElementById('sj-city').value);

  if (!y || !mo || !d) { err.textContent = '생년월일을 모두 입력해주세요.'; return; }
  if (y < 1900 || y > 2100) { err.textContent = '1900년부터 2100년까지 계산할 수 있습니다.'; return; }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) { err.textContent = '날짜를 다시 확인해주세요.'; return; }
  if (!unknown && (isNaN(hh) || hh < 0 || hh > 23)) { err.textContent = '시각을 입력하거나 “모름”을 선택해주세요.'; return; }

  let r;
  try {
    r = calcSaju({ y, m: mo, d, hour: unknown ? null : hh, min: mi, gender, lon });
  } catch (e) { err.textContent = '계산 중 문제가 발생했습니다: ' + e.message; return; }

  const P = r.pillars;
  const T = { year: pillarText(P.year), month: pillarText(P.month), day: pillarText(P.day), hour: pillarText(P.hour) };
  const dayGanKo = T.day.ganKo, dayGanOh = T.day.ganOh;
  const ILGAN = ILGAN_DESC[dayGanKo];
  const ST = calcStrength(r);
  const CNT = sipseongCount(r);
  const SSC = Object.entries(CNT).sort((a, b) => b[1] - a[1]);
  const LUCK = calcLuck(r, ST, CNT, gender);
  const total = Object.values(r.ohaeng).reduce((a, b) => a + b, 0) || 1;
  const maxOh = Object.entries(r.ohaeng).sort((a, b) => b[1] - a[1])[0];
  const minOh = Object.entries(r.ohaeng).sort((a, b) => a[1] - b[1])[0];

  // ----- 네 기둥 (더 작게) -----
  const PM = { hour:'말년·자녀', day:'나·배우자', month:'청년·직업', year:'초년·부모' };
  const col = (label, key, t) => `
    <div style="text-align:center;flex:1;min-width:0;">
      <div style="font-size:11px;color:${INK};font-weight:700;">${label}</div>
      <div style="font-size:9px;color:${INK_DIM};margin-bottom:4px;">${PM[key]}</div>
      <div style="background:${PAPER2};border:1px solid ${LINE_C};border-radius:4px;padding:7px 3px;">
        <div style="font-size:19px;font-weight:800;color:${t.ganOh ? OH_INK[t.ganOh] : INK_DIM};line-height:1.15;">${t.ganHanja || '—'}</div>
        <div style="font-size:10px;color:${INK_DIM};">${t.ganKo || ''}</div>
        <div style="height:1px;background:${LINE_C};margin:4px 3px;"></div>
        <div style="font-size:19px;font-weight:800;color:${t.jiOh ? OH_INK[t.jiOh] : INK_DIM};line-height:1.15;">${t.jiHanja || '—'}</div>
        <div style="font-size:10px;color:${INK_DIM};">${t.jiKo || ''}</div>
      </div>
    </div>`;

  const ohBars = ['목','화','토','금','수'].map(k => {
    const n = r.ohaeng[k], pct = Math.round(n / total * 100);
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
        <span style="width:80px;font-size:15px;font-weight:700;color:${OH_INK[k]};">${OH_EASY[k].name}</span>
        <div style="flex:1;height:18px;background:#e2d7bd;border-radius:9px;overflow:hidden;min-width:60px;">
          <div style="height:100%;width:${pct}%;background:${OH_INK[k]};opacity:.85;"></div>
        </div>
        <span style="width:36px;text-align:right;font-size:15px;color:${INK};font-weight:700;">${n}개</span>
      </div>`;
  }).join('');

  const ssList = SSC.slice(0, 4).map(([k, n], idx) => `
      <div style="background:${idx===0?'#f5ead0':PAPER2};border:1px solid ${idx===0?'#c9a84c':LINE_C};border-radius:6px;padding:13px 15px;margin-bottom:9px;">
        <div style="font-size:17px;font-weight:800;color:${idx===0?ACCENT:INK};margin-bottom:5px;">
          ${SS_EASY[k].n} <span style="font-size:13px;color:${INK_DIM};font-weight:400;">${n}개</span>
          ${idx===0?`<span style="font-size:11px;background:${ACCENT};color:#fff;padding:2px 8px;border-radius:10px;margin-left:6px;">가장 강함</span>`:''}
        </div>
        <div style="font-size:15px;color:${INK};line-height:1.8;">${SS_EASY[k].t}</div>
      </div>`).join('');

  const nowAge = new Date().getFullYear() - y + 1;
  const daeunRows = r.daeun.list.map(u => {
    const t = pillarText(u);
    const cur = nowAge >= u.age && nowAge < u.age + 10;
    return `
      <div style="display:flex;gap:12px;align-items:center;padding:11px 13px;border-radius:6px;margin-bottom:7px;
                  background:${cur ? '#f5e3c8' : PAPER2};border:1px solid ${cur ? ACCENT : LINE_C};">
        <div style="flex:0 0 58px;text-align:center;">
          <div style="font-size:15px;font-weight:800;color:${cur ? ACCENT : INK};">${u.age}세</div>
          <div style="font-size:10px;color:${INK_DIM};">~${u.age + 9}세</div>
        </div>
        <div style="flex:0 0 38px;text-align:center;line-height:1.15;">
          <div style="font-size:18px;font-weight:800;color:${OH_INK[t.ganOh]};">${t.ganHanja}</div>
          <div style="font-size:18px;font-weight:800;color:${OH_INK[t.jiOh]};">${t.jiHanja}</div>
        </div>
        <div style="flex:1;min-width:0;font-size:14px;color:${INK};line-height:1.6;">
          ${daeunHint(P.day.gan, u)}
          ${cur ? `<span style="font-size:11px;background:${ACCENT};color:#fff;padding:2px 8px;border-radius:10px;margin-left:6px;white-space:nowrap;">지금 여기</span>` : ''}
        </div>
      </div>`;
  }).join('');

  const summary = `${name ? `<b style="color:${ACCENT}">${name.replace(/</g,'&lt;')}</b>님은 ` : ''}`
    + `<b style="color:${OH_INK[dayGanOh]}">${ILGAN.symbol}</b> 같은 사람입니다.<br>`
    + `타고난 기운은 <b style="color:${ACCENT}">${ST.level.replace(/\(.*\)/, '')}</b>한 편이고, `
    + `<b style="color:${OH_INK[maxOh[0]]}">${OH_EASY[maxOh[0]].name}</b>을 가장 많이 타고났어요.`;

  const H = (t, sub) => `
    <div style="display:inline-block;background:${ACCENT};color:#fff;font-size:15px;font-weight:700;
                padding:5px 16px;border-radius:3px;letter-spacing:2px;margin-bottom:${sub?'8px':'12px'};">${t}</div>
    ${sub ? `<div style="font-size:14px;color:${INK_DIM};margin-bottom:12px;line-height:1.7;">${sub}</div>` : ''}`;
  const LINE = `<div style="height:1px;background:${LINE_C};margin:24px 0;"></div>`;

  const html = `
    <div style="background:${PAPER};padding:24px 22px;color:${INK};">

      <div style="text-align:center;margin-bottom:18px;">
        <div style="font-size:26px;font-weight:800;color:${INK};letter-spacing:6px;">사 주 팔 자</div>
        <div style="font-size:14px;color:${ACCENT};letter-spacing:2px;margin-top:6px;">
          ${y} . ${mo} . ${d}${r.trueSolarTime ? ` &nbsp;${r.trueSolarTime}` : ' (시간 모름)'}
        </div>
        <div style="display:inline-block;border:1px solid ${LINE_C};border-radius:20px;padding:5px 18px;margin-top:10px;font-size:14px;color:${INK};">
          ${r.tti}띠 · 절기 ${r.term} 이후
        </div>
      </div>

      <div style="background:${PAPER2};border:1px solid ${LINE_C};border-radius:8px;padding:20px;
                  font-size:18px;line-height:1.9;text-align:center;margin-bottom:24px;">
        ${summary}
      </div>

      ${H('사주 네 기둥')}
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        ${col('시주','hour',T.hour)}${col('일주','day',T.day)}${col('월주','month',T.month)}${col('연주','year',T.year)}
      </div>
      <div style="font-size:13px;color:${INK_DIM};line-height:1.7;">
        태어난 연·월·일·시를 옛 글자로 바꾼 것입니다. 이 여덟 글자로 풀이합니다.
        ${r.trueSolarTime ? '' : '<br>시각을 모르면 시주를 뺀 세 기둥으로 봅니다.'}
      </div>

      ${LINE}
      ${H('타고난 성향')}
      <div style="background:${PAPER2};border:1px solid ${LINE_C};border-radius:8px;padding:18px;">
        <div style="font-size:22px;font-weight:800;color:${OH_INK[dayGanOh]};margin-bottom:10px;">
          ${ILGAN.symbol}
          <span style="font-size:14px;color:${INK_DIM};font-weight:400;margin-left:8px;">${T.day.ganHanja} ${dayGanKo}</span>
        </div>
        <div style="font-size:16px;line-height:1.9;">${ILGAN.trait}</div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid ${LINE_C};font-size:15px;">
          <span style="color:${INK_DIM};">잘 맞는 분야</span> · ${ILGAN.job}
        </div>
      </div>

      ${LINE}
      ${H('기운의 세기', '내 기운이 강한지 약한지를 봅니다. 강하면 스스로 밀고 나가고, 약하면 주변 도움을 받는 쪽이 잘 풀립니다.')}
      <div style="background:${PAPER2};border:1px solid ${LINE_C};border-radius:8px;padding:18px;">
        <div style="font-size:24px;font-weight:800;color:${ACCENT};margin-bottom:10px;">${ST.level}</div>
        <div style="font-size:16px;line-height:1.9;">${ST.desc}</div>
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid ${LINE_C};font-size:16px;line-height:2.1;">
          <div><span style="color:${INK_DIM};">채우면 좋은 기운</span>
            ${ST.yongsin.map(k => `<b style="color:${OH_INK[k]};margin-left:8px;">${OH_EASY[k].name}</b>`).join('')}</div>
          <div><span style="color:${INK_DIM};">지나치면 부담되는 기운</span>
            ${ST.gisin.map(k => `<b style="color:${OH_INK[k]};margin-left:8px;">${OH_EASY[k].name}</b>`).join('')}</div>
        </div>
      </div>

      ${LINE}
      ${H('다섯 가지 기운', '여덟 글자가 어떤 기운으로 이루어졌는지입니다. 한쪽에 몰리면 그 성향이 강하게 나타납니다.')}
      ${ohBars}
      <div style="font-size:16px;line-height:1.9;margin-top:12px;">
        <b style="color:${OH_INK[maxOh[0]]}">${OH_EASY[maxOh[0]].name}</b>
        <span style="color:${INK_DIM};">(${OH_EASY[maxOh[0]].key})</span>이 가장 많습니다.
        ${minOh[1] === 0
          ? `반대로 <b style="color:${OH_INK[minOh[0]]}">${OH_EASY[minOh[0]].name}</b>은 하나도 없어, 그쪽 성향은 약하게 나타납니다.`
          : `<b style="color:${OH_INK[minOh[0]]}">${OH_EASY[minOh[0]].name}</b>은 가장 적습니다.`}
      </div>

      ${LINE}
      ${H('두드러지는 힘', '타고난 여덟 글자가 나에게 어떤 힘으로 나타나는지입니다.')}
      ${ssList || `<div style="font-size:15px;color:${INK_DIM};">—</div>`}

      ${LINE}
      ${H('분야별 운세', '타고난 여덟 글자를 분야별로 나눠서 봅니다.')}
      ${LUCK.map(L => `
        <div style="background:${PAPER2};border:1px solid ${LINE_C};border-radius:8px;padding:16px 18px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
            <span style="font-size:22px;">${L.icon}</span>
            <span style="font-size:17px;font-weight:800;color:${INK};">${L.title}</span>
            <span style="font-size:16px;color:#c9a227;letter-spacing:1px;margin-left:auto;">${stars(L.score)}</span>
          </div>
          <div style="font-size:18px;font-weight:800;color:${ACCENT};margin-bottom:8px;">${L.head}</div>
          <div style="font-size:15px;line-height:1.9;color:${INK};">${L.body}</div>
          <div style="margin-top:12px;padding-top:12px;border-top:1px dashed ${LINE_C};font-size:14px;color:${INK_DIM};">
            💡 ${L.tip}
          </div>
        </div>`).join('')}

      ${LINE}
      ${H('10년마다 바뀌는 흐름', `사주는 평생 고정이 아닙니다. 약 ${Math.floor(r.daeun.startAge)}세부터 10년마다 새로운 기운이 들어옵니다.`)}
      ${daeunRows}

      ${LINE}
      <div style="text-align:center;margin-bottom:16px;">
        <button onclick="sjReset()" style="padding:12px 30px;border:1px solid ${ACCENT};background:${ACCENT};color:#fff;border-radius:5px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:2px;">다시 보기</button>
      </div>

      <div style="font-size:12px;color:${INK_DIM};line-height:1.9;">
        ※ 절기와 진태양시(경도 ${Math.round(r.correction.lonMin)}분, 균시차 ${r.correction.eotMin >= 0 ? '+' : ''}${Math.round(r.correction.eotMin)}분)를 반영했습니다.<br>
        ※ 절기 시각은 2~3분의 오차가 있을 수 있습니다. 절기 경계에 태어나신 경우 만세력과 대조해 보세요.<br>
        ※ 일주는 자정 기준으로 바뀝니다. 밤 11시 이후를 다음날로 보는 방식과는 결과가 다를 수 있습니다.<br>
        ※ 재미로 보는 콘텐츠입니다. 중요한 결정은 스스로 판단하시기 바랍니다.
      </div>
    </div>`;

  sjRunWithLoading(() => {
    box.style.display = 'block';
    box.innerHTML = html;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
