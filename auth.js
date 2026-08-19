// ================================================================
// 전역 변수
// ================================================================
let chatDb = null;
let _cachedNick = null;
let _cachedAvatarBg = null;
let _cachedAvatarColor = null;
let isAdmin = false;
let simInterval = null;
let adminChatNick = null;

// ================================================================
// Firebase 설정
// ================================================================
const firebaseConfig = {
  apiKey: "AIzaSyC8J4oVqzJZfAmCGP-t2yMNCafpYJEZhV0",
  authDomain: "adensquare-d5a18.firebaseapp.com",
  databaseURL: "https://adensquare-d5a18-default-rtdb.firebaseio.com",
  projectId: "adensquare-d5a18",
  storageBucket: "adensquare-d5a18.firebasestorage.app",
  messagingSenderId: "533198082184",
  appId: "1:533198082184:web:f2da698b4a7e852584cf3d",
  measurementId: "G-E89SNNX3WZ"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// 로그인 영구 유지 (await 로 persistence 먼저 적용 후 앱 초기화)
let _persistenceReady = auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch(e => console.warn('Persistence 설정 실패:', e));

// ================================================================
// 모달
// ================================================================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.style.display = 'none'; }
  document.body.style.overflow = '';
  clearErrors();
}
function closeAllModals() {
  ['modal-login','modal-signup','modal-profile'].forEach(id => closeModal(id));
}
function clearErrors() {
  document.querySelectorAll('.auth-error').forEach(el => el.textContent = '');
}
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ================================================================
// 로그인 / 회원가입 / 로그아웃
// ================================================================
async function signUp() {
  const nickname = document.getElementById('su-nick').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const pw = document.getElementById('su-pw').value;
  if (!nickname || !email || !pw) { showError('su-error', '모든 항목을 입력해주세요.'); return; }
  try {
    await _persistenceReady;
    const cred = await auth.createUserWithEmailAndPassword(email, pw);
    await cred.user.updateProfile({ displayName: nickname });
    localStorage.setItem('aden_nick_' + cred.user.uid, nickname);
    closeModal('modal-signup');
    showToast('🎉 가입 완료! 환영합니다, ' + nickname + '님!');
  } catch(e) { showError('su-error', firebaseErrorMsg(e.code)); }
}

async function signIn() {
  const email = document.getElementById('si-email').value.trim();
  const pw = document.getElementById('si-pw').value;
  if (!email || !pw) { showError('si-error', '이메일과 비밀번호를 입력해주세요.'); return; }
  try {
    await _persistenceReady;
    await auth.signInWithEmailAndPassword(email, pw);
    closeAllModals();
    showToast('✅ 로그인 되었습니다!');
  } catch(e) { showError('si-error', firebaseErrorMsg(e.code)); }
}

async function signInGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await _persistenceReady;
    const cred = await auth.signInWithPopup(provider);
    const user = cred.user;
    closeAllModals();
    // 신규 유저면 프로필 모달
    const isNew = cred.additionalUserInfo && cred.additionalUserInfo.isNewUser;
    if (isNew) {
      document.getElementById('profile-nickname').value = user.displayName || '';
      openModal('modal-profile');
    } else {
      showToast('✅ ' + (user.displayName || user.email) + '님 로그인!');
    }
  } catch(e) {
    if (e.code !== 'auth/popup-closed-by-user') showError('si-error', firebaseErrorMsg(e.code));
    showError('su-error', firebaseErrorMsg(e.code));
  }
}

async function saveProfile() {
  const user = auth.currentUser;
  if (!user) return;
  const nickname = document.getElementById('profile-nickname').value.trim();
  if (!nickname) { showError('profile-error', '닉네임을 입력해주세요.'); return; }
  try {
    await user.updateProfile({ displayName: nickname });
    localStorage.setItem('aden_nick_' + user.uid, nickname);
    closeModal('modal-profile');
    showToast('✅ 프로필이 저장되었습니다!');
  } catch(e) { showError('profile-error', e.message); }
}

async function signOut() {
  if (isAdmin) { adminLogout(); return; }
  await auth.signOut();
  showToast('👋 로그아웃 되었습니다.');
}

// ================================================================
// Auth 상태 감지 — 로그인/로그아웃 UI
// (DOMContentLoaded 에서 persistence 준비 후 호출됨)
// ================================================================
function _handleAuthState(user) {
  const navRight = document.getElementById('nav-right');
  if (user) {
    // 모달 닫기
    closeAllModals();

    // 닉네임: localStorage 캐시 우선 사용
    const cached = localStorage.getItem('aden_nick_' + user.uid);
    const nickname = cached || user.displayName || user.email || '모험가';
    const server = localStorage.getItem('aden_server_' + user.uid) || '';

    // localStorage 업데이트
    localStorage.setItem('aden_logged_in', nickname);
    localStorage.setItem('aden_nick_' + user.uid, nickname);

    // 아바타 색상
    const palette = [
      {bg:'#2a1208',color:'#c9a84c'},{bg:'#0c1228',color:'#7090d8'},
      {bg:'#1e0c2a',color:'#b870d8'},{bg:'#0c2010',color:'#70b870'},
      {bg:'#2a0c0c',color:'#e07070'},{bg:'#1a0c28',color:'#d8a0f0'},
      {bg:'#0c2028',color:'#70c8d8'},
    ];
    const idx = user.uid.charCodeAt(0) % palette.length;
    _cachedNick = nickname;
    _cachedAvatarBg = palette[idx].bg;
    _cachedAvatarColor = palette[idx].color;

    // 네브바
    if (navRight) {
      navRight.innerHTML = `<div class="nav-user"><span class="nav-server-badge">${server||'서버미설정'}</span><span class="nav-nickname">${nickname}</span><button class="btn-gold" onclick="signOut()">로그아웃</button></div>`;
    }

    // 로그인 카드 → 유저 카드 전환
    const lcGuest = document.getElementById('lc-guest');
    const lcUser  = document.getElementById('lc-user');
    if (lcGuest) lcGuest.style.display = 'none';
    if (lcUser)  lcUser.style.display  = 'block';
    const lcNick   = document.getElementById('lc-nick');
    const lcServer = document.getElementById('lc-server');
    const lcAvatar = document.getElementById('lc-avatar');
    const lcAdena  = document.getElementById('lc-adena');
    if (lcNick)   lcNick.textContent   = nickname;
    if (lcServer) lcServer.textContent = server ? '⚔ ' + server + ' 서버' : '서버 미설정';
    if (lcAvatar) { lcAvatar.textContent = nickname.charAt(0).toUpperCase(); lcAvatar.style.background = palette[idx].bg; lcAvatar.style.color = palette[idx].color; }
    if (lcAdena)  lcAdena.textContent  = '10,000 A';

    // 채팅 활성화
    const chatInput = document.getElementById('chat-input');
    if (chatInput) { chatInput.placeholder = '메시지를 입력하세요...'; chatInput.disabled = false; chatInput.style.opacity='1'; }

  } else {
    // 로그아웃 상태
    localStorage.removeItem('aden_logged_in');
    _cachedNick = null;

    if (navRight) {
      navRight.innerHTML = `<button class="btn-dark" onclick="openModal('modal-login')">로그인</button><button class="btn-gold" onclick="openModal('modal-signup')">회원가입</button>`;
    }

    const lcGuest = document.getElementById('lc-guest');
    const lcUser  = document.getElementById('lc-user');
    if (lcGuest) lcGuest.style.display = 'block';
    if (lcUser)  lcUser.style.display  = 'none';

    const chatInput = document.getElementById('chat-input');
    if (chatInput) { chatInput.placeholder = '로그인 후 채팅에 참여하세요'; chatInput.disabled = true; }
  }
}

// ================================================================
// 관리자
// ================================================================
const ADMIN_ID = 'boss';
const ADMIN_PW = '123456';
const ADMIN_NICK = '메티스';

const SIM_USERS = [
  {nick:'아덴기사',color:'#c9a84c',bg:'#2a1208'},{nick:'어둠의검사',color:'#e07070',bg:'#2a0c0c'},
  {nick:'불꽃마법사',color:'#f08030',bg:'#2a1808'},{nick:'얼음궁수',color:'#70c8d8',bg:'#0c2028'},
  {nick:'빛의힐러',color:'#d8d870',bg:'#28280c'},{nick:'독의암살자',color:'#70b870',bg:'#0c2010'},
  {nick:'바람도적',color:'#b870d8',bg:'#1e0c2a'},{nick:'대지전사',color:'#c8a870',bg:'#281808'},
  {nick:'번개술사',color:'#a0a0f8',bg:'#10102a'},{nick:'혈맹기사',color:'#e07878',bg:'#2a0808'},
  {nick:'그림자닌자',color:'#8888c8',bg:'#18182a'},{nick:'용의기사',color:'#f0c040',bg:'#2a2008'},
  {nick:'해골마법사',color:'#c0c0c0',bg:'#202020'},{nick:'성기사',color:'#f0f0a0',bg:'#2a2a08'},
  {nick:'달빛궁수',color:'#a0c8f8',bg:'#082028'},{nick:'화염검사',color:'#f06020',bg:'#2a1008'},
  {nick:'수호천사',color:'#f8d8a0',bg:'#282018'},{nick:'독수리눈',color:'#a8c870',bg:'#182008'},
  {nick:'암흑기사',color:'#9070c8',bg:'#180c28'},{nick:'광전사',color:'#e08040',bg:'#281408'},
  {nick:'오렌수호자',color:'#70d8b0',bg:'#082820'},{nick:'글루딘상인',color:'#d8b870',bg:'#282008'},
  {nick:'기란탐험가',color:'#70b8e0',bg:'#082028'},{nick:'엘프사냥꾼',color:'#a0e070',bg:'#102008'},
  {nick:'다크엘프',color:'#c070d8',bg:'#200828'},{nick:'오크전사',color:'#d89060',bg:'#281808'},
  {nick:'드워프대장장이',color:'#c8a060',bg:'#282008'},{nick:'인간마법사',color:'#80a0f0',bg:'#081828'},
  {nick:'강화의신',color:'#f0d060',bg:'#282008'},{nick:'바포메트사냥꾼',color:'#e06060',bg:'#280808'},
];

const SIM_CHATS = [
  '안녕하세요~','오늘 사냥 어떠세요?','BOP 시세 또 올랐네요 ㄷㄷ',
  '바포 같이 가실 분?','강화 또 터졌어 ㅜㅜ','엘프 힐러 구합니다',
  '오렌 업데이트 언제 나오나요','글루딘 시장 가봤는데 물건 많더라고요',
  '파티 구인합니다~ 레벨 50이상','어제 바포 솔플 성공했어요!',
  '마법의 가루 가격 어떻게 됨?','혈맹 가입 원합니다','공성전 같이 하실 분!',
  'ㅋㅋㅋ 강화 성공!','와 대박이다','레벨업 했어요 ㅎㅎ',
  '오늘 드랍 운 좋네요','파밍 같이 하실 분 연락주세요',
  '엔트의 가지 팝니다','BOP 삽니다 귓말주세요',
  '다들 어디서 사냥하세요?','저는 오렌 던전에서요 ㅎㅎ',
  '강화 +7 성공!! 와!!!','아 또 실패ㅠ 돈 다 날림',
  '힐 해드립니다~ 파티원 구합니다','탱커 있으신 분?',
  'ㅎㅎ 반갑습니다','오늘도 열심히!','공성 준비됐나요?',
  '드디어 레벨 70!','아이템 강화 팁 있으신 분?',
  '오렌 서버 사람 많네요','글루딘은 요즘 한산한가요?',
  '바포메트 공략 아시는 분?','혈맹 탈퇴하고 새로 구합니다',
  '사냥터 자리 맞춰요','강화재료 어디서 파나요',
  '오늘 공성전 몇시예요?','레벨 40인데 어디가 좋아요?',
  '마법사 파티 찾아요','워리어 버프 해드려요',
  '데포로쥬 vs 오렌 어디가 나음?','초보인데 도움 받을 수 있을까요',
  '엔트 솔플 가능한가요?','힐러 없어서 힘드네요',
  'BOP 강화하다 망했어요 ㅠ','+8 도전해볼까요?',
  '오늘 드랍 진짜 없네','렉 심한가요 지금?',
  '서버 몇시에 점검이에요?','이벤트 언제까지예요?',
  '신규 유저인데 뭐부터 해야해요?','퀘스트 같이 하실분~',
  '거래소 물가가 요즘 비싸네요','저도 강화 성공했어요!',
  '파티원 모집합니다 귓말주세요','아덴광장 자주 오시나요?',
  '오늘 보스 시간 알아요?','드랍률 버프 이벤트 해주세요',
];

let _lastSimUser = '';
let _lastSimChat = '';

async function sendSimMsg() {
  if (!chatDb) return;
  // 같은 유저/메시지 연속 방지
  let u, t, tries = 0;
  do {
    u = SIM_USERS[Math.floor(Math.random() * SIM_USERS.length)];
    tries++;
  } while (u.nick === _lastSimUser && tries < 10);
  tries = 0;
  do {
    t = SIM_CHATS[Math.floor(Math.random() * SIM_CHATS.length)];
    tries++;
  } while (t === _lastSimChat && tries < 10);
  _lastSimUser = u.nick;
  _lastSimChat = t;
  try {
    await chatDb.ref('chat/global').push({
      uid: 'sim_' + u.nick, nickname: u.nick, text: t,
      avatarBg: u.bg, avatarColor: u.color,
      timestamp: firebase.database.ServerValue.TIMESTAMP, isSim: true,
    });
  } catch(e) { console.error('Sim error:', e); }
}

function adminLogin() {
  isAdmin = true;
  _cachedNick = ADMIN_NICK;
  localStorage.setItem('aden_admin_session', '1');
  _cachedAvatarBg = '#1a0a28';
  _cachedAvatarColor = '#d4a84b';

  const navRight = document.getElementById('nav-right');
  if (navRight) navRight.innerHTML = `<div class="nav-user"><span class="nav-server-badge">관리자</span><span class="nav-nickname">👑 ${ADMIN_NICK}</span><button class="btn-gold" onclick="signOut()">로그아웃</button></div>`;

  const lcGuest = document.getElementById('lc-guest');
  const lcUser  = document.getElementById('lc-user');
  if (lcGuest) lcGuest.style.display = 'none';
  if (lcUser)  lcUser.style.display  = 'block';
  const lcNick   = document.getElementById('lc-nick');
  const lcServer = document.getElementById('lc-server');
  const lcAvatar = document.getElementById('lc-avatar');
  const lcAdena  = document.getElementById('lc-adena');
  if (lcNick)   lcNick.textContent   = '👑 ' + ADMIN_NICK;
  if (lcServer) lcServer.textContent = '🔑 관리자';
  if (lcAvatar) { lcAvatar.textContent = '👑'; lcAvatar.style.background = '#2a1808'; lcAvatar.style.borderColor = '#d4a84b'; }
  if (lcAdena)  lcAdena.textContent  = '∞ A';

  const panel = document.getElementById('admin-panel');
  if (panel) panel.style.display = 'block';

  const chatInput = document.getElementById('chat-input');
  if (chatInput) { chatInput.placeholder = '메시지를 입력하세요...'; chatInput.disabled = false; chatInput.style.opacity='1'; }

  showToast('👑 관리자 메티스로 로그인!');
}

function adminLogout() {
  isAdmin = false;
  _cachedNick = null;
  adminChatNick = null;
  localStorage.removeItem('aden_admin_session');
  stopSimChat();

  const navRight = document.getElementById('nav-right');
  if (navRight) navRight.innerHTML = `<button class="btn-dark" onclick="openModal('modal-login')">로그인</button><button class="btn-gold" onclick="openModal('modal-signup')">회원가입</button>`;

  const lcGuest = document.getElementById('lc-guest');
  const lcUser  = document.getElementById('lc-user');
  if (lcGuest) lcGuest.style.display = 'block';
  if (lcUser)  lcUser.style.display  = 'none';

  const panel = document.getElementById('admin-panel');
  if (panel) panel.style.display = 'none';

  const bar = document.getElementById('chat-nick-bar');
  if (bar) bar.style.display = 'none';

  const chatInput = document.getElementById('chat-input');
  if (chatInput) { chatInput.placeholder = '로그인 후 채팅 가능'; chatInput.disabled = true; }
}

async function adminClearAll() {
  if (!isAdmin) return;
  if (!confirm('채팅을 전체 삭제하시겠습니까?')) return;
  try {
    await chatDb.ref('chat/global').remove();
    const area = document.getElementById('chat-area');
    if (area) { area.innerHTML = ''; }
    showToast('✅ 채팅 전체 삭제 완료');
  } catch(e) {
    const area = document.getElementById('chat-area');
    if (area) area.innerHTML = '';
    showToast('화면 삭제 완료');
  }
}

function adminSelectNick(nick, bg, color) {
  if (!isAdmin) return;
  adminChatNick = { nick, bg, color };
  _cachedNick = nick;
  _cachedAvatarBg = bg;
  _cachedAvatarColor = color;
  const span = document.getElementById('admin-cur-nick');
  if (span) span.textContent = nick;
  const bar = document.getElementById('chat-nick-bar');
  const curNick = document.getElementById('chat-cur-nick');
  if (bar) bar.style.display = 'block';
  if (curNick) curNick.textContent = nick;
  showToast('💬 ' + nick + ' 으로 채팅 중');
}

function adminResetNick() {
  adminChatNick = null;
  _cachedNick = ADMIN_NICK;
  _cachedAvatarBg = '#1a0a28';
  _cachedAvatarColor = '#d4a84b';
  const span = document.getElementById('admin-cur-nick');
  if (span) span.textContent = ADMIN_NICK;
  const bar = document.getElementById('chat-nick-bar');
  if (bar) bar.style.display = 'none';
  showToast('👑 메티스로 복귀');
}

function startSimChat() {
  if (simInterval) { showToast('이미 실행 중입니다.'); return; }
  if (!chatDb) { try { chatDb = firebase.database(); } catch(e) { showToast('DB 연결 실패'); return; } }
  showToast('🎭 시뮬 채팅 시작!');
  const btn = document.getElementById('admin-sim-btn');
  if (btn) { btn.textContent = '⏹ 채팅 중지'; btn.onclick = stopSimChat; }
  sendSimMsg();
  function scheduleNext() {
    if (!simInterval) return;
    const t = setTimeout(async () => { await sendSimMsg(); scheduleNext(); }, 3000 + Math.random() * 3000);
    simInterval = t;
  }
  simInterval = true;
  scheduleNext();
}

function stopSimChat() {
  if (simInterval && simInterval !== true) clearTimeout(simInterval);
  simInterval = null;
  const btn = document.getElementById('admin-sim-btn');
  if (btn) { btn.textContent = '▶ 채팅 시작'; btn.onclick = startSimChat; }
  showToast('⏹ 시뮬 채팅 중지');
}

async function adminDelMsg(el) {
  if (!isAdmin || !chatDb) return;
  const msgDiv = el.closest('.chat-msg');
  const nick = el.dataset.nick;
  const uid = el.dataset.uid;
  try {
    const snap = await chatDb.ref('chat/global').orderByChild('nickname').equalTo(nick).limitToLast(50).once('value');
    snap.forEach(child => { if (child.val().uid === uid) child.ref.remove(); });
    if (msgDiv) msgDiv.remove();
    showToast('메시지 삭제 완료');
  } catch(e) { if (msgDiv) msgDiv.remove(); }
}

function autoGenerateNews() {
  if (!isAdmin) return;
  const existing = document.getElementById('admin-news-modal');
  if (existing) { existing.remove(); return; }
  const modal = document.createElement('div');
  modal.id = 'admin-news-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `<div style="background:#1e1a0e;border:2px solid #d4a84b;border-radius:6px;padding:20px;width:100%;max-width:420px;">
    <div style="font-size:14px;font-weight:700;color:#d4a84b;margin-bottom:14px;">📰 뉴스 추가</div>
    <select id="an-type" style="width:100%;padding:7px;background:#0a0800;border:1px solid #3a2e10;border-radius:3px;color:#e8dcc8;margin-bottom:8px;font-size:12px;">
      <option value="update">업데이트</option><option value="notice">공지</option><option value="event">이벤트</option>
    </select>
    <input id="an-title" type="text" placeholder="제목" style="width:100%;padding:7px;background:#0a0800;border:1px solid #3a2e10;border-radius:3px;color:#e8dcc8;margin-bottom:8px;font-size:12px;">
    <textarea id="an-desc" placeholder="내용" rows="3" style="width:100%;padding:7px;background:#0a0800;border:1px solid #3a2e10;border-radius:3px;color:#e8dcc8;margin-bottom:8px;font-size:12px;resize:none;"></textarea>
    <input id="an-url" type="text" placeholder="링크" value="https://lineageclassic.plaync.com/ko-kr/board/notice/list" style="width:100%;padding:7px;background:#0a0800;border:1px solid #3a2e10;border-radius:3px;color:#e8dcc8;margin-bottom:12px;font-size:11px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button onclick="submitAdminNews()" style="padding:9px;border:1px solid #8a7a38;background:linear-gradient(180deg,#4a3c18,#2e2408);color:#d4a84b;font-size:12px;font-weight:700;border-radius:3px;cursor:pointer;">✅ 추가</button>
      <button onclick="document.getElementById('admin-news-modal').remove()" style="padding:9px;border:1px solid #3a2e10;background:#111008;color:#a89878;font-size:12px;font-weight:700;border-radius:3px;cursor:pointer;">취소</button>
    </div></div>`;
  document.body.appendChild(modal);
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
}

async function submitAdminNews() {
  const type  = document.getElementById('an-type').value;
  const title = document.getElementById('an-title').value.trim();
  const desc  = document.getElementById('an-desc').value.trim();
  const url   = document.getElementById('an-url').value.trim();
  if (!title) { showToast('제목을 입력해주세요.'); return; }
  await adminAddNews(type, title, url, desc);
  document.getElementById('admin-news-modal')?.remove();
}

async function adminAddNews(type, title, url, desc) {
  if (!isAdmin) return;
  const id = 'n' + Date.now();
  const today = new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\.\s*/g,'.').replace(/\.$/, '');
  const news = { id, type, title, desc: desc||'', url: url||'https://lineageclassic.plaync.com', date: today, isNew: true };
  try {
    if (typeof pageNewsData !== 'undefined') pageNewsData.unshift(news);
    if (typeof renderPageNews === 'function') renderPageNews(pageNewsData);
    showToast('뉴스가 추가되었습니다.');
  } catch(e) { showToast('뉴스 추가 실패: ' + e.message); }
}

// ================================================================
// 채팅
// ================================================================
function initChat() {
  try {
    chatDb = firebase.database();
    const chatRef = chatDb.ref('chat/global');
    const area = document.getElementById('chat-area');
    if (area) { area.innerHTML = ''; }
    chatRef.limitToLast(50).on('child_added', (snapshot) => {
      const msg = snapshot.val();
      if (!msg) return;
      appendChatMessage(msg);
    }, err => console.error('채팅 오류:', err));
    // 초기 로드 완료 후 스크롤 맨 아래로
    setTimeout(() => {
      if (area) area.scrollTop = area.scrollHeight;
    }, 800);
  } catch(e) { console.error('Chat init error:', e); }
}

function appendChatMessage(msg) {
  const area = document.getElementById('chat-area');
  if (!area) return;
  const c = { bg: '#2a1e08', color: '#c9a84c' };
  const nick = msg.nickname || '익명';
  const firstChar = nick[0];
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}) : '';
  const msgBg = msg.avatarBg || c.bg;
  const msgColor = msg.avatarColor || c.color;
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `
    <div class="chat-avatar" style="background:${msgBg};color:${msgColor};">${firstChar}</div>
    <div class="chat-body" style="flex:1;">
      <div style="display:flex;align-items:baseline;gap:6px;">
        <div class="chat-nick" style="color:${msgColor};cursor:${isAdmin?'pointer':'default'};" onclick="if(isAdmin)adminSelectNick('${nick}','${msgBg}','${msgColor}')">${nick}</div>
        <span style="font-size:9px;color:var(--text3);">${time}</span>
        ${isAdmin ? `<span onclick="adminDelMsg(this)" data-uid="${msg.uid||''}" data-nick="${nick}" style="font-size:9px;color:#e07070;cursor:pointer;margin-left:auto;">✕</span>` : ''}
      </div>
      <div class="chat-text">${msg.text.replace(/</g,'&lt;')}</div>
    </div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  while (area.children.length > 100) area.removeChild(area.firstChild);
}

async function sendChatMessage() {
  const user = auth.currentUser;
  if (!user && !isAdmin) { showToast('로그인 후 채팅이 가능합니다.'); return; }
  const input = document.getElementById('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  if (!chatDb) { showToast('채팅 서버 연결 중입니다.'); return; }
  const uid = isAdmin ? ('admin_' + (_cachedNick||'메티스')) : user.uid;
  const palette = [{bg:'#2a1208',color:'#c9a84c'},{bg:'#0c1228',color:'#7090d8'},{bg:'#1e0c2a',color:'#b870d8'},{bg:'#0c2010',color:'#70b870'},{bg:'#2a0c0c',color:'#e07070'},{bg:'#1a0c28',color:'#d8a0f0'},{bg:'#0c2028',color:'#70c8d8'}];
  const idx = uid.charCodeAt(0) % palette.length;
  const nickname = _cachedNick || (user ? user.displayName : null) || '익명';
  const avatarBg = _cachedAvatarBg || palette[idx].bg;
  const avatarColor = _cachedAvatarColor || palette[idx].color;
  try {
    await chatDb.ref('chat/global').push({ uid, nickname, text, avatarBg, avatarColor, timestamp: firebase.database.ServerValue.TIMESTAMP });
    input.value = '';
  } catch(e) { console.error('전송 오류:', e); showToast('전송 실패: ' + e.message); }
}

// ================================================================
// 유틸
// ================================================================
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateY(0)';
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; }, 2500);
}

function firebaseErrorMsg(code) {
  const map = {
    'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
    'auth/user-not-found': '존재하지 않는 계정입니다.',
    'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
    'auth/invalid-email': '올바른 이메일 형식이 아닙니다.',
    'auth/too-many-requests': '잠시 후 다시 시도해주세요.',
    'auth/popup-blocked': '팝업이 차단되었습니다.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/unavailable': '서버에 일시적인 문제가 있습니다.',
    'auth/network-request-failed': '네트워크 오류입니다.',
    'auth/cancelled-popup-request': 'Google 로그인이 취소되었습니다.',
  };
  return map[code] || '오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
}

// ================================================================
// 초기화
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // persistence 설정이 완료된 후 onAuthStateChanged 등록 → 로그인 유지 보장
  await _persistenceReady;

  // 관리자 세션 복원 (새로고침 후에도 유지)
  if (localStorage.getItem('aden_admin_session') === '1') {
    adminLogin();
    initChat();
    return;
  }

  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send-btn');
  if (chatInput) chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });
  if (chatSend) chatSend.onclick = sendChatMessage;

  // onAuthStateChanged를 DOMContentLoaded 내부로 이동 → DOM 준비 후 UI 업데이트
  auth.onAuthStateChanged((user) => {
    _handleAuthState(user);
  });

  initChat();
});
