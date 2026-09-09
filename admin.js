/* ================================================================
 * 아덴광장 관리자 페이지
 * ----------------------------------------------------------------
 * 관리자 여부는 Firebase 의 admins/<uid> 값으로 판정한다.
 * 이 파일의 모든 기능은 isAdmin 이 true 일 때만 동작하며,
 * 실제 권한은 Firebase 보안 규칙이 서버에서 다시 검사한다.
 * (브라우저 코드를 조작해도 규칙을 통과하지 못하면 저장되지 않는다)
 * ================================================================ */

let _adminTab = 'stats';
let _adminUsers = [];      // [{uid, nickname, game, server, joinedAt, banned}]
let _adminPosts = [];      // [{board, id, title, nickname, timestamp}]

const ADMIN_BOARDS = [
  { key: 'humor',  name: '유머게시판' },
  { key: 'free',   name: '리니지클래식 자유게시판' },
  { key: 'free_m', name: '리니지M 자유게시판' },
  { key: 'clan',   name: '리니지클래식 혈맹모집' },
  { key: 'clan_m', name: '리니지M 혈맹모집' },
  { key: 'brag',   name: '리니지클래식 자랑하기' },
  { key: 'brag_m', name: '리니지M 자랑하기' },
];

// ---------------- 화면 전환 ----------------

function showAdminPage() {
  if (!isAdmin) { showToast('관리자만 접근할 수 있습니다.'); return; }

  // 다른 모든 섹션을 숨기고 관리자 페이지만 표시
  document.querySelectorAll('[id^="section-"]').forEach(el => { el.style.display = 'none'; });
  const sec = document.getElementById('section-admin');
  if (sec) sec.style.display = 'block';
  window.scrollTo(0, 0);
  setAdminTab(_adminTab);
}

function setAdminTab(tab) {
  _adminTab = tab;
  ['stats', 'members', 'posts', 'chat'].forEach(t => {
    const btn = document.getElementById('adm-tab-' + t);
    const pane = document.getElementById('adm-pane-' + t);
    if (btn) {
      const on = (t === tab);
      btn.style.background = on ? '#2a1e08' : 'var(--dark)';
      btn.style.color = on ? '#d4a84b' : 'var(--text3)';
      btn.style.borderColor = on ? '#d4a84b' : 'var(--border)';
    }
    if (pane) pane.style.display = (t === tab) ? 'block' : 'none';
  });

  if (tab === 'stats') loadAdminStats();
  if (tab === 'members') loadAdminMembers();
  if (tab === 'posts') loadAdminPosts();
  if (tab === 'chat') loadAdminChatSettings();
}

// ---------------- 1. 사이트 현황 ----------------

async function loadAdminStats() {
  const el = document.getElementById('adm-stats-body');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;color:var(--text3);">불러오는 중...</div>';

  try {
    const db = firebase.database();
    const [usersSnap, newsSnap, marketSnap, chatSnap] = await Promise.all([
      db.ref('users').once('value'),
      db.ref('news').once('value'),
      db.ref('market').once('value'),
      db.ref('chat/global').once('value'),
    ]);

    const users = usersSnap.val() || {};
    const userList = Object.values(users);
    const now = Date.now();
    const DAY = 86400000;

    const newMembers7 = userList.filter(u => u.joinedAt && (now - u.joinedAt) < 7 * DAY).length;
    const bannedCount = userList.filter(u => u.banned).length;

    // 게시판별 글 수
    const boardSnaps = await Promise.all(
      ADMIN_BOARDS.map(b => db.ref('board/' + b.key).once('value'))
    );
    let totalPosts = 0;
    const boardRows = ADMIN_BOARDS.map((b, i) => {
      const v = boardSnaps[i].val() || {};
      const n = Object.keys(v).length;
      totalPosts += n;
      return { name: b.name, count: n };
    });

    const marketAll = Object.values(marketSnap.val() || {});
    const marketActive = marketAll.filter(m => m.status !== 'done').length;
    const chatCount = Object.keys(chatSnap.val() || {}).length;
    const newsCount = Object.keys(newsSnap.val() || {}).length;

    const card = (label, value, sub) => `
      <div style="background:var(--dark);border:1px solid var(--border);border-radius:6px;padding:14px;">
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">${label}</div>
        <div style="font-size:22px;font-weight:800;color:var(--g);">${value}</div>
        ${sub ? `<div style="font-size:10px;color:var(--text3);margin-top:4px;">${sub}</div>` : ''}
      </div>`;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;padding:16px;">
        ${card('전체 회원', userList.length.toLocaleString() + '명', '최근 7일 +' + newMembers7 + '명')}
        ${card('차단 회원', bannedCount + '명')}
        ${card('전체 게시글', totalPosts.toLocaleString() + '개')}
        ${card('등록 뉴스', newsCount.toLocaleString() + '개')}
        ${card('거래소 매물', marketActive.toLocaleString() + '개', '거래중만 집계')}
        ${card('채팅 메시지', chatCount.toLocaleString() + '개')}
      </div>

      <div style="padding:0 16px 16px;">
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px;">게시판별 글 수</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tbody>
            ${boardRows.map(r => `
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 10px;">${r.name}</td>
                <td style="padding:8px 10px;text-align:right;color:var(--g);font-weight:700;">${r.count.toLocaleString()}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    console.error('현황 조회 실패:', e);
    el.innerHTML = `<div style="padding:20px;color:#e07070;">불러오기 실패: ${e.message}</div>`;
  }
}

// ---------------- 2. 회원 관리 ----------------

async function loadAdminMembers() {
  const el = document.getElementById('adm-members-body');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;color:var(--text3);">불러오는 중...</div>';

  try {
    const snap = await firebase.database().ref('users').once('value');
    const raw = snap.val() || {};
    _adminUsers = Object.entries(raw).map(([uid, v]) => ({ uid, ...v }));
    _adminUsers.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
    renderAdminMembers();
  } catch (e) {
    console.error('회원 조회 실패:', e);
    el.innerHTML = `<div style="padding:20px;color:#e07070;">불러오기 실패: ${e.message}</div>`;
  }
}

function renderAdminMembers() {
  const el = document.getElementById('adm-members-body');
  if (!el) return;

  const kw = (document.getElementById('adm-member-search')?.value || '').trim().toLowerCase();
  let list = _adminUsers;
  if (kw) {
    list = list.filter(u =>
      String(u.nickname || '').toLowerCase().includes(kw) ||
      String(u.server || '').toLowerCase().includes(kw)
    );
  }

  if (!list.length) {
    el.innerHTML = '<div style="padding:20px;color:var(--text3);">해당하는 회원이 없습니다.</div>';
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#0a0812;color:var(--text3);font-size:12px;">
            <th style="padding:10px;text-align:left;border-bottom:1px solid var(--border);">닉네임</th>
            <th style="padding:10px;text-align:left;border-bottom:1px solid var(--border);">게임 / 서버</th>
            <th style="padding:10px;text-align:left;border-bottom:1px solid var(--border);">가입일</th>
            <th style="padding:10px;text-align:center;border-bottom:1px solid var(--border);width:110px;">상태</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(u => {
            const game = u.game === 'm' ? '리니지M' : (u.game === 'classic' ? '리니지클래식' : '-');
            const joined = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('ko-KR') : '-';
            return `
            <tr style="border-bottom:1px solid var(--border);${u.banned ? 'opacity:.55;' : ''}">
              <td style="padding:10px;font-weight:600;">${(u.nickname || '(이름없음)').replace(/</g, '&lt;')}
                ${u.banned ? '<span style="color:#e07070;font-size:11px;margin-left:6px;">차단됨</span>' : ''}
              </td>
              <td style="padding:10px;color:var(--text2);">${game} / ${(u.server || '-').replace(/</g, '&lt;')}</td>
              <td style="padding:10px;color:var(--text3);font-size:12px;">${joined}</td>
              <td style="padding:10px;text-align:center;">
                <button onclick="toggleBanUser('${u.uid}')"
                  style="padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;
                  border:1px solid ${u.banned ? '#3a6a2a' : '#8a3a18'};
                  background:${u.banned ? '#0c2010' : '#2a0808'};
                  color:${u.banned ? '#70b870' : '#e07070'};">
                  ${u.banned ? '차단 해제' : '차단'}
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function toggleBanUser(uid) {
  const user = _adminUsers.find(u => u.uid === uid);
  if (!user) return;
  const next = !user.banned;
  const label = next ? '차단' : '차단 해제';
  if (!confirm(`'${user.nickname}' 회원을 ${label}하시겠습니까?\n\n차단된 회원은 채팅과 글쓰기를 할 수 없습니다.`)) return;

  try {
    await firebase.database().ref('users/' + uid + '/banned').set(next);
    user.banned = next;
    renderAdminMembers();
    showToast(`${user.nickname} 회원을 ${label}했습니다.`);
  } catch (e) {
    console.error('차단 처리 실패:', e);
    showToast('처리 실패: ' + e.message);
  }
}

// ---------------- 3. 게시글 / 댓글 관리 ----------------

async function loadAdminPosts() {
  const el = document.getElementById('adm-posts-body');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;color:var(--text3);">불러오는 중...</div>';

  try {
    const db = firebase.database();
    const snaps = await Promise.all(ADMIN_BOARDS.map(b => db.ref('board/' + b.key).once('value')));
    _adminPosts = [];
    ADMIN_BOARDS.forEach((b, i) => {
      const v = snaps[i].val() || {};
      Object.entries(v).forEach(([id, p]) => {
        _adminPosts.push({
          board: b.key, boardName: b.name, id,
          title: p.title || '(제목없음)',
          nickname: p.nickname || '익명',
          timestamp: p.timestamp || 0,
        });
      });
    });
    _adminPosts.sort((a, b) => b.timestamp - a.timestamp);
    renderAdminPosts();
  } catch (e) {
    console.error('게시글 조회 실패:', e);
    el.innerHTML = `<div style="padding:20px;color:#e07070;">불러오기 실패: ${e.message}</div>`;
  }
}

function renderAdminPosts() {
  const el = document.getElementById('adm-posts-body');
  if (!el) return;

  const kw = (document.getElementById('adm-post-search')?.value || '').trim().toLowerCase();
  const boardFilter = document.getElementById('adm-post-board')?.value || '';

  let list = _adminPosts;
  if (boardFilter) list = list.filter(p => p.board === boardFilter);
  if (kw) {
    list = list.filter(p =>
      p.title.toLowerCase().includes(kw) ||
      String(p.nickname).toLowerCase().includes(kw)
    );
  }

  const shown = list.slice(0, 300);

  if (!shown.length) {
    el.innerHTML = '<div style="padding:20px;color:var(--text3);">해당하는 글이 없습니다.</div>';
    return;
  }

  el.innerHTML = `
    <div style="padding:8px 14px;font-size:11px;color:var(--text3);border-bottom:1px solid var(--border);">
      ${list.length.toLocaleString()}개 중 ${shown.length}개 표시 · 체크 후 아래 버튼으로 일괄 삭제
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#0a0812;color:var(--text3);font-size:12px;">
            <th style="padding:10px;width:36px;text-align:center;border-bottom:1px solid var(--border);">
              <input type="checkbox" onchange="admToggleAllPosts(this.checked)">
            </th>
            <th style="padding:10px;text-align:left;border-bottom:1px solid var(--border);">제목</th>
            <th style="padding:10px;text-align:left;border-bottom:1px solid var(--border);width:150px;">게시판</th>
            <th style="padding:10px;text-align:left;border-bottom:1px solid var(--border);width:110px;">글쓴이</th>
            <th style="padding:10px;text-align:left;border-bottom:1px solid var(--border);width:100px;">작성일</th>
          </tr>
        </thead>
        <tbody>
          ${shown.map(p => `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:10px;text-align:center;">
                <input type="checkbox" class="adm-post-chk" data-board="${p.board}" data-id="${p.id}">
              </td>
              <td style="padding:10px;">${p.title.replace(/</g, '&lt;')}</td>
              <td style="padding:10px;color:var(--text3);font-size:12px;">${p.boardName}</td>
              <td style="padding:10px;color:var(--text2);">${String(p.nickname).replace(/</g, '&lt;')}</td>
              <td style="padding:10px;color:var(--text3);font-size:12px;">
                ${p.timestamp ? new Date(p.timestamp).toLocaleDateString('ko-KR') : '-'}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="padding:12px 14px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
      <button onclick="admDeleteSelectedPosts()"
        style="padding:8px 16px;border:1px solid #8a3a18;background:#2a0808;color:#e07070;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700;">
        🗑 선택한 글 삭제
      </button>
    </div>`;
}

function admToggleAllPosts(checked) {
  document.querySelectorAll('.adm-post-chk').forEach(c => { c.checked = checked; });
}

async function admDeleteSelectedPosts() {
  const checked = Array.from(document.querySelectorAll('.adm-post-chk:checked'));
  if (!checked.length) { showToast('삭제할 글을 선택해주세요.'); return; }
  if (!confirm(`선택한 ${checked.length}개의 글을 삭제합니다.\n본문과 댓글도 함께 삭제되며 되돌릴 수 없습니다.\n\n계속하시겠습니까?`)) return;

  const db = firebase.database();
  let ok = 0, fail = 0;

  for (const c of checked) {
    const board = c.dataset.board;
    const id = c.dataset.id;
    try {
      // 글 / 본문 / 댓글을 함께 지운다
      await Promise.all([
        db.ref('board/' + board + '/' + id).remove(),
        db.ref('board_content/' + board + '/' + id).remove(),
        db.ref('board_comments/' + board + '/' + id).remove(),
      ]);
      ok++;
    } catch (e) {
      console.error('삭제 실패:', board, id, e);
      fail++;
    }
  }

  showToast(`${ok}개 삭제 완료${fail ? ` · ${fail}개 실패` : ''}`);
  loadAdminPosts();
}

// ---------------- 4. 채팅 관리 ----------------

async function loadAdminChatSettings() {
  const el = document.getElementById('adm-banned-words');
  if (!el) return;
  try {
    const snap = await firebase.database().ref('config/bannedWords').once('value');
    const words = snap.val();
    el.value = Array.isArray(words) ? words.join('\n') : (words || '');
  } catch (e) {
    console.error('금지어 조회 실패:', e);
  }
}

async function saveAdminBannedWords() {
  const el = document.getElementById('adm-banned-words');
  if (!el) return;
  const words = el.value.split('\n').map(w => w.trim()).filter(Boolean);
  try {
    await firebase.database().ref('config/bannedWords').set(words);
    showToast(`금지어 ${words.length}개를 저장했습니다.`);
  } catch (e) {
    console.error('금지어 저장 실패:', e);
    showToast('저장 실패: ' + e.message);
  }
}

async function admClearAllChat() {
  if (!confirm('전체 채팅 기록을 삭제합니다.\n되돌릴 수 없습니다. 계속하시겠습니까?')) return;
  try {
    await firebase.database().ref('chat/global').remove();
    showToast('채팅 기록을 삭제했습니다.');
  } catch (e) {
    showToast('삭제 실패: ' + e.message);
  }
}
