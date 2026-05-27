// ═══════════════════════════════════════════════════════════
//  Aroha — Firebase 統合レイヤー
//  認証・Firestore同期・家族共有・記録者バッジ
// ═══════════════════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs,
  addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy,
  limit, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Firebase 初期化 ─────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDF0hJH8ZMbVR9U7M2oJB_Vjo4Hv2UkeWo",
  authDomain:        "aroha-21441.firebaseapp.com",
  projectId:         "aroha-21441",
  storageBucket:     "aroha-21441.firebasestorage.app",
  messagingSenderId: "880482104016",
  appId:             "1:880482104016:web:f0f8ba3342dd3f21c1e4d5"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── グローバル状態 ──────────────────────────────────────────
window.arohaDB = {
  user:     null,   // Firebase User
  familyId: null,   // Firestoreのfamilyドキュメントのキー
  role:     null,   // 'papa' | 'mama' | 'other'
  roleLabel: null,  // '👨 パパ' | '👩 ママ' など
  unsubscribers: [] // onSnapshotのunsubscribe関数配列
};

// ── 役割ラベル ──────────────────────────────────────────────
const ROLE_LABELS = {
  papa:  '👨 パパ',
  mama:  '👩 ママ',
  other: '👤 その他'
};

// ═══════════════════════════════════════════════════════════
//  認証
// ═══════════════════════════════════════════════════════════

// 認証状態の監視
onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.arohaDB.user = user;
    await loadFamilyContext(user.uid);
    showApp();
  } else {
    window.arohaDB.user     = null;
    window.arohaDB.familyId = null;
    showAuthScreen();
  }
});

// 新規登録
window.firebaseSignUp = async (email, password, name, role, inviteCode) => {
  try {
    showAuthLoading(true);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });

    if (inviteCode) {
      // 招待コードで既存家族に参加
      await joinFamily(cred.user.uid, inviteCode, name, role);
    } else {
      // 新規家族を作成
      await createFamily(cred.user.uid, name, role);
    }
    showAuthLoading(false);
  } catch (err) {
    showAuthLoading(false);
    showAuthError(err.code);
  }
};

// ログイン
window.firebaseSignIn = async (email, password) => {
  try {
    showAuthLoading(true);
    await signInWithEmailAndPassword(auth, email, password);
    showAuthLoading(false);
  } catch (err) {
    showAuthLoading(false);
    showAuthError(err.code);
  }
};

// ログアウト
window.firebaseSignOut = async () => {
  window.arohaDB.unsubscribers.forEach(fn => fn());
  window.arohaDB.unsubscribers = [];
  await signOut(auth);
};

// エラーメッセージ日本語化
function authErrorMsg(code) {
  const map = {
    'auth/email-already-in-use':   'このメールアドレスはすでに使用されています',
    'auth/invalid-email':          'メールアドレスの形式が正しくありません',
    'auth/weak-password':          'パスワードは6文字以上にしてください',
    'auth/user-not-found':         'アカウントが見つかりません',
    'auth/wrong-password':         'パスワードが間違っています',
    'auth/invalid-credential':     'メールアドレスまたはパスワードが間違っています',
    'auth/too-many-requests':      'しばらくしてからもう一度お試しください',
  };
  return map[code] || 'エラーが発生しました。もう一度お試しください';
}

// ═══════════════════════════════════════════════════════════
//  家族管理
// ═══════════════════════════════════════════════════════════

async function createFamily(uid, name, role) {
  // 6桁の招待コードを生成
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const familyId   = `family_${uid}_${Date.now()}`;

  // 家族ドキュメントを作成
  await setDoc(doc(db, 'families', familyId), {
    createdAt:  serverTimestamp(),
    createdBy:  uid,
    inviteCode: inviteCode,
    childName:  'お子さん',
    childAge:   8
  });

  // 招待コードインデックスを作成
  await setDoc(doc(db, 'inviteCodes', inviteCode), { familyId });

  // メンバーとして自分を追加
  await setDoc(doc(db, 'families', familyId, 'members', uid), {
    name, role, joinedAt: serverTimestamp(), uid
  });

  window.arohaDB.familyId  = familyId;
  window.arohaDB.role      = role;
  window.arohaDB.roleLabel = ROLE_LABELS[role] || name;

  // 既存のlocalStorageデータを移行
  await migrateLocalStorage(familyId, uid, role);
}

async function joinFamily(uid, inviteCode, name, role) {
  const code = inviteCode.toUpperCase().trim();
  const codeDoc = await getDoc(doc(db, 'inviteCodes', code));

  if (!codeDoc.exists()) {
    throw new Error('招待コードが正しくありません');
  }

  const familyId = codeDoc.data().familyId;

  await setDoc(doc(db, 'families', familyId, 'members', uid), {
    name, role, joinedAt: serverTimestamp(), uid
  });

  window.arohaDB.familyId  = familyId;
  window.arohaDB.role      = role;
  window.arohaDB.roleLabel = ROLE_LABELS[role] || name;
}

async function loadFamilyContext(uid) {
  // このユーザーが所属する家族を検索
  // メンバーとして登録されているfamilyを探す
  // ※簡略化のため、localStorageにfamilyIdをキャッシュ
  const cachedFamilyId = localStorage.getItem('aroha_family_id');
  if (cachedFamilyId) {
    const memberDoc = await getDoc(doc(db, 'families', cachedFamilyId, 'members', uid));
    if (memberDoc.exists()) {
      const m = memberDoc.data();
      window.arohaDB.familyId  = cachedFamilyId;
      window.arohaDB.role      = m.role;
      window.arohaDB.roleLabel = ROLE_LABELS[m.role] || m.name;
      localStorage.setItem('aroha_family_id', cachedFamilyId);
      startRealtimeListeners();
      return;
    }
  }

  // キャッシュがない場合は家族を検索（作成者として）
  const q = query(
    collection(db, 'families'),
    where('createdBy', '==', uid),
    limit(1)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const familyDoc = snap.docs[0];
    const familyId  = familyDoc.id;
    const memberDoc = await getDoc(doc(db, 'families', familyId, 'members', uid));
    if (memberDoc.exists()) {
      const m = memberDoc.data();
      window.arohaDB.familyId  = familyId;
      window.arohaDB.role      = m.role;
      window.arohaDB.roleLabel = ROLE_LABELS[m.role] || m.name;
      localStorage.setItem('aroha_family_id', familyId);
      startRealtimeListeners();
    }
  }
}

// 招待コードを取得
window.getInviteCode = async () => {
  const { familyId } = window.arohaDB;
  if (!familyId) return null;
  const fDoc = await getDoc(doc(db, 'families', familyId));
  return fDoc.exists() ? fDoc.data().inviteCode : null;
};

// ═══════════════════════════════════════════════════════════
//  Firestore CRUD（既存のlocalStorage関数を置き換え）
// ═══════════════════════════════════════════════════════════

// ── 保存 ────────────────────────────────────────────────────
window.dbSave = async (collectionName, data) => {
  const { familyId, user, role, roleLabel } = window.arohaDB;
  if (!familyId || !user) {
    // オフライン: localStorageにフォールバック
    return localSaveFallback(collectionName, data);
  }
  const enriched = {
    ...data,
    authorUid:   user.uid,
    authorName:  user.displayName || '名前未設定',
    authorRole:  role,
    roleLabel:   roleLabel,
    createdAt:   serverTimestamp(),
    localId:     data.id || Date.now()
  };
  delete enriched.id; // Firestoreは自動IDを使う
  const ref = await addDoc(
    collection(db, 'families', familyId, collectionName),
    enriched
  );
  return ref.id;
};

// ── リアルタイムリスナー開始 ────────────────────────────────
function startRealtimeListeners() {
  const { familyId } = window.arohaDB;
  if (!familyId) return;

  // 各コレクションをリッスンしてUIを更新
  const collections = ['diary', 'growth', 'reflect', 'homework', 'checkin'];
  collections.forEach(col => {
    const q = query(
      collection(db, 'families', familyId, col),
      orderBy('createdAt', 'desc'),
      limit(60)
    );
    const unsub = onSnapshot(q, (snap) => {
      const records = snap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }));
      window.dispatchEvent(new CustomEvent(`aroha_${col}_updated`, { detail: records }));
    }, (err) => {
      console.warn(`[Aroha] ${col} listener error:`, err.code);
    });
    window.arohaDB.unsubscribers.push(unsub);
  });
}

// ── localStorageフォールバック ──────────────────────────────
function localSaveFallback(col, data) {
  const key = `cst_${col}`;
  const records = JSON.parse(localStorage.getItem(key) || '[]');
  records.unshift({ ...data, id: data.id || Date.now() });
  if (records.length > 60) records.pop();
  localStorage.setItem(key, JSON.stringify(records));
}

// ═══════════════════════════════════════════════════════════
//  既存 localStorage データの移行
// ═══════════════════════════════════════════════════════════
async function migrateLocalStorage(familyId, uid, role) {
  const roleLabel = ROLE_LABELS[role] || 'パパ';
  const colMap = {
    diary:    'cst_diary',
    growth:   'cst_growth',
    reflect:  'cst_reflect',
    homework: 'cst_homework',
    checkin:  'cst_records'
  };

  let migrated = 0;
  for (const [col, key] of Object.entries(colMap)) {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    for (const record of records.slice(0, 30)) {
      try {
        await addDoc(collection(db, 'families', familyId, col), {
          ...record,
          authorUid:  uid,
          authorRole: role,
          roleLabel:  roleLabel,
          createdAt:  serverTimestamp(),
          localId:    record.id || Date.now(),
          migrated:   true
        });
        migrated++;
      } catch(e) { /* 個別エラーは無視して継続 */ }
    }
  }
  console.log(`[Aroha] Migrated ${migrated} records to Firestore`);
  localStorage.setItem('aroha_family_id', familyId);
}

// ═══════════════════════════════════════════════════════════
//  UI: 認証画面
// ═══════════════════════════════════════════════════════════
function showAuthScreen() {
  document.getElementById('aroha-app').style.display     = 'none';
  document.getElementById('aroha-auth').style.display    = 'flex';
}
function showApp() {
  document.getElementById('aroha-auth').style.display    = 'none';
  document.getElementById('aroha-app').style.display     = 'block';
  updateUserBadge();
  startRealtimeListeners();
}
function showAuthLoading(v) {
  const btn = document.getElementById('auth-submit-btn');
  if (btn) { btn.disabled = v; btn.textContent = v ? '処理中…' : document.getElementById('auth-submit-btn').dataset.label; }
}
function showAuthError(code) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = authErrorMsg(code); el.style.display = 'block'; }
}

function updateUserBadge() {
  const { roleLabel, user } = window.arohaDB;
  const badge = document.getElementById('user-badge');
  if (badge) badge.textContent = `${roleLabel || ''} ${user?.displayName || ''}`;
}

// 認証フォームの切り替え
window.toggleAuthMode = (mode) => {
  const isLogin = mode === 'login';
  document.getElementById('auth-title').textContent       = isLogin ? 'ログイン' : 'アカウント登録';
  document.getElementById('auth-name-row').style.display  = isLogin ? 'none' : 'block';
  document.getElementById('auth-role-row').style.display  = isLogin ? 'none' : 'block';
  document.getElementById('auth-invite-row').style.display= isLogin ? 'none' : 'block';
  document.getElementById('auth-submit-btn').textContent  = isLogin ? 'ログイン' : '登録する';
  document.getElementById('auth-submit-btn').dataset.label= isLogin ? 'ログイン' : '登録する';
  document.getElementById('auth-switch-msg').innerHTML    = isLogin
    ? 'アカウントをお持ちでない方は <a href="#" onclick="toggleAuthMode(\'register\')">新規登録</a>'
    : 'すでにアカウントをお持ちの方は <a href="#" onclick="toggleAuthMode(\'login\')">ログイン</a>';
  document.getElementById('auth-error').style.display = 'none';
  window._authMode = mode;
};

window.authSubmit = () => {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const mode     = window._authMode || 'login';

  if (mode === 'login') {
    window.firebaseSignIn(email, password);
  } else {
    const name   = document.getElementById('auth-name').value.trim() || 'パパ';
    const role   = document.getElementById('auth-role').value;
    const invite = document.getElementById('auth-invite').value.trim();
    window.firebaseSignUp(email, password, name, role, invite);
  }
};

// 招待コードを表示
window.showInviteCode = async () => {
  const code = await window.getInviteCode();
  if (code) {
    alert(`招待コード: ${code}\n\nこのコードを家族に伝えて、新規登録時に入力してもらってください。`);
  }
};

console.log('[Aroha] Firebase layer loaded');
