/**
 * auto-post.js
 * ------------------------------------------------------------
 * 게시판 / 게임같이해요 / 거래소에 글을 자동으로 등록합니다.
 *
 * GitHub Actions 가 하루 여러 번 실행하고, 매 실행마다 글을 올릴지 말지를
 * 확률로 정합니다. 그래서 하루 총 3~5개 정도가 불규칙하게 올라갑니다.
 * (정해진 시각에 정확히 N개가 올라오면 자동이라는 게 바로 드러납니다)
 *
 * 최근에 쓴 글감과 닉네임은 Firebase 의 autoPostState 에 기록해두고
 * 다음번에 피해서 고릅니다. 같은 글이 연달아 올라오는 걸 막기 위해서입니다.
 * ------------------------------------------------------------
 */

const admin = require('firebase-admin');
const D = require('./auto-post-data');

// 이번 실행에서 글을 올릴 확률 (하루 5회 실행 x 0.8 = 평균 4개)
const POST_CHANCE = 0.8;

// 어느 게시판에 올릴지 가중치. 숫자가 클수록 자주 뽑힙니다.
const TARGETS = [
  { key: 'humor',       weight: 5, pool: () => D.HUMOR,        game: null },
  { key: 'free',        weight: 5, pool: () => D.FREE_CLASSIC, game: 'classic' },
  { key: 'free_m',      weight: 4, pool: () => D.FREE_M,       game: 'm' },
  { key: 'clan',        weight: 2, pool: () => D.CLAN,         game: 'classic' },
  { key: 'clan_m',      weight: 2, pool: () => D.CLAN,         game: 'm' },
  { key: 'brag',        weight: 2, pool: () => D.BRAG,         game: 'classic' },
  { key: 'brag_m',      weight: 1, pool: () => D.BRAG,         game: 'm' },
  { key: 'play_sol',    weight: 1, pool: () => D.PLAY.play_sol,    game: null },
  { key: 'play_diablo', weight: 1, pool: () => D.PLAY.play_diablo, game: null },
  { key: 'play_star',   weight: 1, pool: () => D.PLAY.play_star,   game: null },
  { key: 'play_lol',    weight: 1, pool: () => D.PLAY.play_lol,    game: null },
  { key: 'play_coin',   weight: 1, pool: () => D.PLAY.play_coin,   game: null },
  { key: 'market',      weight: 2, pool: () => D.MARKET,       game: 'classic' },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function pickWeighted(list) {
  const total = list.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of list) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return list[list.length - 1];
}

// 최근에 쓴 것은 피해서 고른다
function pickFresh(pool, recent, keyOf) {
  const fresh = pool.filter(x => !recent.includes(keyOf(x)));
  return pick(fresh.length ? fresh : pool);
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
  // 최근 40개만 기억 (그 이상은 다시 써도 티가 안 남)
  await db.ref('autoPostState').set({
    titles: state.titles.slice(-40),
    nicks: state.nicks.slice(-15),
    updatedAt: Date.now(),
  });
}

async function postToBoard(db, target, state) {
  const post = pickFresh(target.pool(), state.titles, x => x.title);
  const nickname = pickFresh(D.NICKNAMES, state.nicks, x => x);
  const id = 'p' + Date.now() + Math.floor(Math.random() * 1000);

  const servers = target.game === 'm' ? D.LINM_SERVERS : D.CLASSIC_SERVERS;
  const needsServer = !target.key.startsWith('play_') && target.key !== 'humor';

  const data = {
    id,
    title: post.title,
    nickname,
    timestamp: Date.now(),
    views: Math.floor(Math.random() * 30) + 3,
    desc: post.desc,
  };
  if (needsServer) data.server = pick(servers);
  if (target.key.startsWith('clan')) data.category = '혈맹모집해요';
  if (target.key.startsWith('brag')) data.category = '강화자랑';

  await db.ref('board/' + target.key + '/' + id).set(data);
  await db.ref('board_content/' + target.key + '/' + id).set({ desc: post.desc });

  state.titles.push(post.title);
  state.nicks.push(nickname);
  return `${target.key} / ${nickname} / ${post.title}`;
}

async function postToMarket(db, state) {
  const m = pick(D.MARKET);
  const nickname = pickFresh(D.NICKNAMES, state.nicks, x => x);
  const id = 'm' + Date.now() + Math.floor(Math.random() * 1000);

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
    timestamp: Date.now(),
  });

  state.nicks.push(nickname);
  return `market / ${nickname} / ${m.item}`;
}

(async () => {
  try {
    // 1) 이번 실행에서 올릴지 결정
    if (Math.random() > POST_CHANCE) {
      console.log('이번 실행은 건너뜁니다 (확률).');
      process.exit(0);
    }

    // 2) 실행 시각 안에서 0~40분 무작위 지연 (정각마다 올라오면 티가 남)
    const delayMin = Math.floor(Math.random() * 40);
    console.log(`${delayMin}분 대기 후 등록합니다.`);
    await new Promise(r => setTimeout(r, delayMin * 60 * 1000));

    const db = initFirebase();
    const state = await loadState(db);

    const target = pickWeighted(TARGETS);
    const result = target.key === 'market'
      ? await postToMarket(db, state)
      : await postToBoard(db, target, state);

    await saveState(db, state);
    console.log('등록 완료:', result);
    process.exit(0);
  } catch (err) {
    console.error('실패:', err.message);
    process.exit(1);
  }
})();
