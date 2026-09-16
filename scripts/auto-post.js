/**
 * auto-post.js
 * ------------------------------------------------------------
 * 게시판 / 게임같이해요 / 거래소에 글을 자동 등록합니다.
 *
 * 한 번 실행하면 모든 게시판을 돌면서 각각 0~2개씩 올립니다.
 * 하루 2회 실행하므로 게시판당 하루 평균 3~4개가 올라갑니다.
 *
 * 제목·본문의 {서버} {레벨} {시간} {요일} {횟수} 는 매번 다른 값으로 채워지므로
 * 같은 글감이라도 다르게 보입니다.
 *
 * 최근에 쓴 글감과 닉네임은 Firebase 의 autoPostState 에 기록해두고
 * 다음번에 피해서 고릅니다.
 * ------------------------------------------------------------
 */

const admin = require('firebase-admin');
const D = require('./auto-post-data');

// 한 번 실행에서 게시판당 올릴 글 수 (아래 값 중 무작위)
// 하루 2회 실행 -> 게시판당 하루 2~4개
const PER_BOARD = [1, 2, 2, 2, 1, 0];

const TARGETS = [
  { key: 'humor',       pool: () => D.HUMOR,        game: null,      server: false },
  { key: 'free',        pool: () => D.FREE_CLASSIC, game: 'classic', server: true  },
  { key: 'free_m',      pool: () => D.FREE_M,       game: 'm',       server: true  },
  { key: 'clan',        pool: () => D.CLAN,         game: 'classic', server: true, category: '혈맹모집해요' },
  { key: 'clan_m',      pool: () => D.CLAN,         game: 'm',       server: true, category: '혈맹모집해요' },
  { key: 'brag',        pool: () => D.BRAG,         game: 'classic', server: true, category: '강화자랑' },
  { key: 'brag_m',      pool: () => D.BRAG,         game: 'm',       server: true, category: '강화자랑' },
  { key: 'play_sol',    pool: () => D.PLAY.play_sol,    game: null, server: false },
  { key: 'play_diablo', pool: () => D.PLAY.play_diablo, game: null, server: false },
  { key: 'play_star',   pool: () => D.PLAY.play_star,   game: null, server: false },
  { key: 'play_lol',    pool: () => D.PLAY.play_lol,    game: null, server: false },
  { key: 'play_coin',   pool: () => D.PLAY.play_coin,   game: null, server: false },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// 최근에 쓴 것은 피해서 고른다
function pickFresh(pool, recent) {
  const fresh = pool.filter(x => !recent.includes(typeof x === 'string' ? x : x.title));
  return pick(fresh.length ? fresh : pool);
}

// {서버} {레벨} 같은 자리표시자를 실제 값으로 채운다
function fill(text, servers) {
  return String(text || '')
    .replace(/\{서버\}/g, () => pick(servers))
    .replace(/\{레벨\}/g, () => rand(40, 75))
    .replace(/\{시간\}/g, () => pick(D.TIMES))
    .replace(/\{요일\}/g, () => pick(D.DAYS))
    .replace(/\{횟수\}/g, () => rand(3, 50));
}

function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('환경변수 FIREBASE_SERVICE_ACCOUNT 가 없습니다.');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(raw)),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  return admin.database();
}

async function loadState(db) {
  try {
    const snap = await db.ref('autoPostState').once('value');
    const v = snap.val() || {};
    return {
      titles: Array.isArray(v.titles) ? v.titles : [],
      nicks: Array.isArray(v.nicks) ? v.nicks : [],
    };
  } catch (e) {
    return { titles: [], nicks: [] };
  }
}

async function saveState(db, state) {
  await db.ref('autoPostState').set({
    titles: state.titles.slice(-150),
    nicks: state.nicks.slice(-40),
    updatedAt: Date.now(),
  });
}

// 등록 시각을 과거 몇 시간 안쪽으로 흩어놓는다 (한꺼번에 올라온 티가 안 나게)
function spreadTime(index, total) {
  const hoursBack = 10;
  const slot = (hoursBack * 3600 * 1000) / Math.max(total, 1);
  const base = Date.now() - slot * (total - index);
  return base + rand(0, Math.floor(slot * 0.8));
}

async function postToBoard(db, target, state, stamp) {
  const raw = pickFresh(target.pool(), state.titles);
  const servers = target.game === 'm' ? D.LINM_SERVERS : D.CLASSIC_SERVERS;
  const nickname = pickFresh(D.NICKNAMES, state.nicks);
  const id = 'p' + stamp + rand(100, 999);

  const data = {
    id,
    title: fill(raw.title, servers),
    nickname,
    timestamp: stamp,
    views: rand(3, 40),
    desc: fill(raw.desc, servers),
  };
  if (target.server) data.server = pick(servers);
  if (target.category) data.category = target.category;

  await db.ref('board/' + target.key + '/' + id).set(data);
  await db.ref('board_content/' + target.key + '/' + id).set({ desc: data.desc });

  state.titles.push(raw.title);
  state.nicks.push(nickname);
  return data.title;
}

async function postToMarket(db, state, stamp) {
  const m = pick(D.MARKET);
  const nickname = pickFresh(D.NICKNAMES, state.nicks);
  const id = 'm' + stamp + rand(100, 999);

  await db.ref('market/' + id).set({
    id,
    item: m.item,
    price: m.price,
    qty: m.qty,
    type: m.type,
    server: pick(D.CLASSIC_SERVERS),
    char: nickname,
    contact: '게임 내 귓속말',
    nickname,
    status: 'active',
    game: 'classic',
    channel: '',
    timestamp: stamp,
  });

  state.nicks.push(nickname);
  return m.item;
}

(async () => {
  try {
    const db = initFirebase();
    const state = await loadState(db);

    // 이번 실행에서 올릴 작업 목록을 먼저 만든다
    const jobs = [];
    for (const t of TARGETS) {
      const n = pick(PER_BOARD);
      for (let i = 0; i < n; i++) jobs.push({ type: 'board', target: t });
    }
    const marketCount = pick([0, 1, 1, 2]);
    for (let i = 0; i < marketCount; i++) jobs.push({ type: 'market' });

    // 순서를 섞어서 게시판 순서대로 올라온 티가 안 나게
    jobs.sort(() => Math.random() - 0.5);

    console.log(`이번 실행에서 ${jobs.length}개 등록합니다.`);
    let ok = 0;
    for (let i = 0; i < jobs.length; i++) {
      const stamp = spreadTime(i, jobs.length);
      try {
        const job = jobs[i];
        const title = job.type === 'market'
          ? await postToMarket(db, state, stamp)
          : await postToBoard(db, job.target, state, stamp);
        const where = job.type === 'market' ? 'market' : job.target.key;
        console.log(`  [${where}] ${title}`);
        ok++;
      } catch (e) {
        console.error('  등록 실패:', e.message);
      }
    }

    await saveState(db, state);
    console.log(`완료: ${ok}개 등록`);
    process.exit(0);
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  }
})();
