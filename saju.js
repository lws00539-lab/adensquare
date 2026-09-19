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
  if (!unknown && (isNaN(hh) || hh < 0 || hh > 23)) { err.textContent = '시각을 입력하거나 “시간 모름”을 선택해주세요.'; return; }

  let r;
  try {
    r = calcSaju({ y, m: mo, d, hour: unknown ? null : hh, min: mi, gender, lon });
  } catch (e) {
    err.textContent = '계산 중 문제가 발생했습니다: ' + e.message;
    return;
  }

  const P = r.pillars;
  const T = { year: pillarText(P.year), month: pillarText(P.month), day: pillarText(P.day), hour: pillarText(P.hour) };
  const SS = r.sipseong;

  const col = (label, t, ss) => `
    <div style="text-align:center;flex:1;min-width:0;">
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">${label}</div>
      <div style="background:var(--dark);border:1px solid var(--border);border-radius:6px;padding:10px 4px;">
        <div style="font-size:10px;color:var(--text3);height:14px;">${ss ? ss.gan : ''}</div>
        <div style="font-size:26px;font-weight:800;color:${t.ganOh ? OH_COLOR[t.ganOh] : 'var(--text3)'};line-height:1.2;">${t.ganHanja || '—'}</div>
        <div style="font-size:11px;color:var(--text2);">${t.ganKo || ''}</div>
        <div style="height:1px;background:var(--border);margin:6px 2px;"></div>
        <div style="font-size:26px;font-weight:800;color:${t.jiOh ? OH_COLOR[t.jiOh] : 'var(--text3)'};line-height:1.2;">${t.jiHanja || '—'}</div>
        <div style="font-size:11px;color:var(--text2);">${t.jiKo || ''}</div>
        <div style="font-size:10px;color:var(--text3);height:14px;margin-top:2px;">${ss ? ss.ji : ''}</div>
      </div>
    </div>`;

  const total = Object.values(r.ohaeng).reduce((a, b) => a + b, 0) || 1;
  const ohBars = ['목','화','토','금','수'].map(k => {
    const n = r.ohaeng[k], pct = Math.round(n / total * 100);
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="width:22px;font-size:13px;font-weight:700;color:${OH_COLOR[k]};">${k}</span>
        <div style="flex:1;height:14px;background:var(--dark);border-radius:7px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${OH_COLOR[k]};opacity:.75;"></div>
        </div>
        <span style="width:44px;text-align:right;font-size:11px;color:var(--text2);">${n}개 ${pct}%</span>
      </div>`;
  }).join('');

  const maxOh = Object.entries(r.ohaeng).sort((a,b)=>b[1]-a[1])[0];
  const minOh = Object.entries(r.ohaeng).sort((a,b)=>a[1]-b[1])[0];

  const daeunRows = r.daeun.list.map(u => {
    const t = pillarText(u);
    return `<div style="text-align:center;min-width:52px;">
      <div style="font-size:10px;color:var(--text3);">${u.age}세</div>
      <div style="font-size:17px;font-weight:700;color:${OH_COLOR[t.ganOh]};line-height:1.3;">${t.ganHanja}</div>
      <div style="font-size:17px;font-weight:700;color:${OH_COLOR[t.jiOh]};line-height:1.3;">${t.jiHanja}</div>
    </div>`;
  }).join('');

  const dayGanKo = T.day.ganKo, dayGanOh = T.day.ganOh;
  const ILGAN = ILGAN_DESC[dayGanKo];
  const ST = calcStrength(r);
  const SSC = Object.entries(sipseongCount(r)).sort((a,b)=>b[1]-a[1]);

  // 십성 구성 한줄 해설
  let SS_TEXT = '';
  if (SSC.length) {
    const top = SSC[0];
    const missing = Object.keys(SIPSEONG_DESC).filter(k => !SSC.find(x=>x[0]===k));
    SS_TEXT = `<b style="color:var(--g)">${top[0]}</b>이(가) ${top[1]}개로 가장 두드러집니다. ${SIPSEONG_DESC[top[0]]} 쪽 성향이 강하게 나타납니다.`;
    if (missing.length >= 6) SS_TEXT += ` 없는 십성이 많아 한쪽으로 치우친 구조입니다.`;
    else if (missing.length) SS_TEXT += ` ${missing.slice(0,3).join('·')} 기운은 약한 편입니다.`;
  }

  box.style.display = 'block';
  box.innerHTML = `
    <div style="padding:16px;">
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px;">
        ${name ? `<b style="color:var(--g);font-size:14px;">${name.replace(/</g,'&lt;')}</b> · ` : ''}${y}년 ${mo}월 ${d}일${r.trueSolarTime ? ` · 진태양시 ${r.trueSolarTime}` : ' · 시간 모름'}
        · ${r.tti}띠 · 절기 기준 <span style="color:var(--g);">${r.term}</span> 이후
      </div>

      <div style="display:flex;gap:8px;margin-bottom:6px;">
        ${col('시주', T.hour, SS.hour)}
        ${col('일주', T.day, SS.day)}
        ${col('월주', T.month, SS.month)}
        ${col('연주', T.year, SS.year)}
      </div>
      ${r.trueSolarTime ? '' : '<div style="font-size:11px;color:#c9a04c;margin-bottom:8px;">시각을 모르면 시주를 뺀 세 기둥으로만 봅니다.</div>'}

      <div style="height:1px;background:var(--border);margin:14px 0;"></div>

      <div style="font-size:13px;font-weight:700;color:var(--g);margin-bottom:8px;">오행 분포</div>
      ${ohBars}
      <div style="font-size:12px;color:var(--text2);line-height:1.7;margin-top:8px;">
        일간은 <b style="color:${OH_COLOR[dayGanOh]}">${dayGanKo}(${dayGanOh})</b> 입니다.
        <b style="color:${OH_COLOR[maxOh[0]]}">${maxOh[0]}</b> 기운이 가장 강하고
        <b style="color:${OH_COLOR[minOh[0]]}">${minOh[0]}</b> 기운이 가장 약합니다.
      </div>

      <div style="height:1px;background:var(--border);margin:14px 0;"></div>

      <div style="font-size:13px;font-weight:700;color:var(--g);margin-bottom:8px;">
        대운 <span style="font-size:11px;color:var(--text3);font-weight:400;">
        ${r.daeun.forward ? '순행' : '역행'} · ${r.daeun.startAge}세부터</span>
      </div>
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;">${daeunRows}</div>

      <div style="height:1px;background:var(--border);margin:14px 0;"></div>

      <div style="font-size:13px;font-weight:700;color:var(--g);margin-bottom:8px;">일간 풀이</div>
      <div style="background:var(--dark);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:12px;line-height:1.8;color:var(--text2);">
        <div style="margin-bottom:6px;">
          <b style="color:${OH_COLOR[dayGanOh]};font-size:14px;">${T.day.ganHanja} ${dayGanKo}</b>
          <span style="color:var(--text3);">· ${ILGAN.symbol}</span>
        </div>
        ${ILGAN.trait}
        <div style="margin-top:8px;color:var(--text3);">어울리는 분야 · ${ILGAN.job}</div>
      </div>

      <div style="height:1px;background:var(--border);margin:14px 0;"></div>

      <div style="font-size:13px;font-weight:700;color:var(--g);margin-bottom:8px;">
        신강·신약 <span style="font-size:11px;color:var(--text3);font-weight:400;">지수 ${ST.score}</span>
      </div>
      <div style="background:var(--dark);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:12px;line-height:1.8;color:var(--text2);">
        <div style="font-size:15px;font-weight:800;color:var(--g);margin-bottom:6px;">${ST.level}</div>
        ${ST.desc}
        <div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;">
          <div><span style="color:var(--text3);">도움이 되는 기운</span>
            ${ST.yongsin.map(k=>`<b style="color:${OH_COLOR[k]};margin-left:4px;">${k}</b>`).join('')}</div>
          <div><span style="color:var(--text3);">조심할 기운</span>
            ${ST.gisin.map(k=>`<b style="color:${OH_COLOR[k]};margin-left:4px;">${k}</b>`).join('')}</div>
        </div>
      </div>

      <div style="height:1px;background:var(--border);margin:14px 0;"></div>

      <div style="font-size:13px;font-weight:700;color:var(--g);margin-bottom:8px;">십성 구성</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        ${SSC.length ? SSC.map(([k,n])=>`
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;">
            <span style="width:40px;font-weight:700;color:var(--g);">${k}</span>
            <span style="width:28px;color:var(--text2);">${n}개</span>
            <span style="color:var(--text3);flex:1;min-width:0;">${SIPSEONG_DESC[k]||''}</span>
          </div>`).join('')
          : '<div style="font-size:12px;color:var(--text3);">—</div>'}
      </div>
      <div style="font-size:12px;color:var(--text2);line-height:1.8;margin-top:10px;">${SS_TEXT}</div>

      <div style="height:1px;background:var(--border);margin:14px 0;"></div>

      <div style="font-size:11px;color:var(--text3);line-height:1.7;">
        ※ 절기와 진태양시(경도 ${r.correction.lonMin >= 0 ? '+' : ''}${Math.round(r.correction.lonMin)}분,
        균시차 ${r.correction.eotMin >= 0 ? '+' : ''}${Math.round(r.correction.eotMin)}분)를 반영한 결과입니다.<br>
        ※ 절기 시각은 약 2~3분의 오차가 있을 수 있습니다. 절기 경계에 태어나신 경우 만세력과 대조해 보세요.<br>
        ※ 일주는 자정을 기준으로 바뀝니다. 밤 11시 이후를 다음날로 보는 야자시 방식과는 결과가 다를 수 있습니다.<br>
        ※ 재미로 보는 콘텐츠입니다. 중요한 결정은 스스로 판단하시기 바랍니다.
      </div>
    </div>`;
}

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
