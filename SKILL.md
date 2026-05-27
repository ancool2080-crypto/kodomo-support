---
name: aroha-dev
description: >
  Arohaスタイルの単一HTMLファイル型Webアプリを構築・GitHub Pagesにデプロイするスキル。
  バニラHTML/CSS/JS・localStorage・Claude API統合・PWA化・Firebase家族共有を含む
  完全な開発〜デプロイフローをカバーする。子育て・教育・福祉・ライフログ系アプリに最適。
  ユーザーから「Arohaと同じ構成で」「同じフローで作って」「デプロイまでやって」と
  言われたときに使用する。
---

# Aroha Dev Skill — 単一HTML Webアプリ 開発・デプロイガイド

このスキルはAroha（子育てサポートツール）の開発で確立されたパターンを体系化したものです。
単一HTMLファイル・バニラJS・GitHub Pages・Claude API・PWA・Firebaseを組み合わせた
完全な開発フローをカバーします。

---

## 1. 必要情報の収集

開発開始前に以下を確認する：

```
- GitHubユーザー名（例: ancool2080-crypto）
- リポジトリ名（例: kodomo-support）
- Personal Access Token（ghp_...）→ repo権限のみ必要
- Firebase Config（Claude API統合・家族共有が必要な場合）
- Anthropic APIキー設定方式（localStorageで十分か確認）
```

PAT取得手順をユーザーに案内：
GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → repo権限のみチェック

---

## 2. デザインシステム

### CSS変数（Aroha標準パレット）
```css
:root {
  --cream:       #F7F3EC;
  --warm-white:  #FDFAF5;
  --sage:        #5C7A5F;
  --sage-light:  #8AAE8D;
  --sage-dark:   #3D5740;
  --terra:       #C0714F;
  --terra-light: #DDA08A;
  --terra-pale:  #F5E6DF;
  --ochre:       #C89A3E;
  --ochre-light: #EDD98A;
  --bark:        #6B4F3A;
  --bark-light:  #A07A5F;
  --ink:         #2A2118;
  --ink-soft:    #4A3F35;
  --mist:        #B8C4B0;
  --shadow:      rgba(42,33,24,0.12);
  --radius-sm:   8px;
  --radius-md:   16px;
  --radius-lg:   24px;
  --radius-xl:   36px;
  --font-serif:  'Shippori Mincho', serif;
  --font-sans:   'Zen Kaku Gothic New', sans-serif;
}
```

### フォント
```html
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;700&family=Zen+Kaku+Gothic+New:wght@300;400;500;700&display=swap" rel="stylesheet">
```

**トーン**：アース系・ぬくもり・落ち着き。ユーザーが深呼吸できる雰囲気。

---

## 3. アーキテクチャパターン

### HTML構造
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <!-- PWAメタタグ・manifest・フォント -->
</head>
<body>
  <!-- ローディング画面（Firebase使用時） -->
  <div id="app-loading">...</div>
  <!-- 認証画面（Firebase使用時） -->
  <div id="app-auth" style="display:none;">...</div>
  <!-- アプリ本体 -->
  <div id="app-main" style="display:none;">
    <header class="site-header">...</header>
    <nav class="nav-bar">タブナビ</nav>
    <main class="main">
      <!-- モジュール（セクション）ごとにdiv.module -->
      <section id="mod-xxx" class="module active">...</section>
    </main>
  </div>
  <!-- モーダル -->
  <div class="modal-overlay">...</div>
  <!-- Firebase inline script（type="module"） -->
  <!-- アプリJS -->
</body>
</html>
```

### モジュールナビ（タブ切替）
```javascript
function showModule(name) {
  if (breathingTimer) { clearTimeout(breathingTimer); breathingTimer = null; }
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('mod-' + name).classList.add('active');
  event.currentTarget.classList.add('active');
}
```

### localStorage キー命名規則
```
プレフィックス: {app_prefix}_{collection}
例: cst_diary, cst_growth, cst_records
```

---

## 4. Claude API統合

### APIキー管理
```javascript
// localStorageに保存（ブラウザのみ）
function saveApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key.startsWith('sk-ant-')) {
    alert('正しいAPIキー形式ではありません（sk-ant-で始まります）');
    return;
  }
  localStorage.setItem('{prefix}_apikey', key);
  updateApiStatus();
}
function getApiKey() { return localStorage.getItem('{prefix}_apikey') || ''; }
```

### API呼び出し（必須ヘッダー）
```javascript
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'  // ← 必須
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  })
});
```

### Vision API（画像解析）
```javascript
const userContent = [
  {
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: base64Data }
  },
  { type: 'text', text: '問題を解説してください。' }
];
```

### APIキー未設定時のフォールバック
必ずデモ文を用意し、APIキーなしでも動作確認できるようにする。

---

## 5. PWA化

### 必須ファイル
- `manifest.json` — アプリ名・アイコン・display: standalone
- `sw.js` — Service Worker（Cache First戦略）
- `offline.html` — オフラインフォールバック
- `icons/` — icon-72/96/128/144/152/192/384/512.png

### manifest.jsonのスコープ設定（GitHub Pages）
```json
{
  "start_url": "/{repo-name}/",
  "scope": "/{repo-name}/"
}
```

### Service Worker戦略
- 自サイトリソース: Stale While Revalidate（キャッシュ返却→バックグラウンド更新）
- Claude API: ネットワークのみ（キャッシュ不可）+ オフライン時フォールバック文
- Googleフォント: キャッシュ優先（別キャッシュ名で管理）

### iOS対応
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="icons/icon-192.png">
```

```css
/* iOS safe area */
body { padding-bottom: env(safe-area-inset-bottom, 0px); }
.site-header { padding-top: max(20px, calc(20px + env(safe-area-inset-top, 0px))); }
@media (display-mode: standalone) {
  .site-header { padding-top: max(24px, calc(env(safe-area-inset-top, 0px) + 12px)); }
}
```

### アイコン生成（Pillow）
```python
pip install Pillow --break-system-packages
from PIL import Image, ImageDraw
# 各サイズ（72,96,128,144,152,192,384,512）でアイコンを生成
```

---

## 6. Firebase統合（家族共有）

### 設計方針
- Authentication: メール/パスワード
- Firestore構造: `families/{familyId}/{collection}/{docId}`
- 招待コード: 6桁英数字で家族を共有
- 記録者バッジ: roleLabel（'👨 パパ' / '👩 ママ'）を全レコードに付与

### Firebaseインライン読み込み（外部JSファイルは使わない）
```html
<script type="module">
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, ... } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, ... } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
// ← 外部ファイルに分けるとGitHub PagesでCORSエラーになる場合がある
</script>
```

### 認証フロー
```javascript
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadFamilyContext(user.uid);
    showApp();   // ローディング非表示 → アプリ表示
  } else {
    showAuthScreen();  // ローディング非表示 → 認証画面表示
  }
});
```

### ローディング画面（必須）
Firebaseの認証確認が完了するまで画面が空白になるため、起動時は必ずローディング画面を表示する。

```html
<div id="app-loading" style="position:fixed;inset:0;z-index:2000;background:var(--sage-dark);
  display:flex;align-items:center;justify-content:center;">
  <div>🌱 読み込み中...</div>
</div>
```

### Firestoreセキュリティルール
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /families/{familyId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;  // 作成時はメンバー未存在のため緩め
      allow update, delete: if request.auth != null
        && exists(/databases/$(database)/documents/families/$(familyId)/members/$(request.auth.uid));
      match /members/{userId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && request.auth.uid == userId;
      }
      match /{collection}/{docId} {
        allow read, write: if request.auth != null
          && exists(/databases/$(database)/documents/families/$(familyId)/members/$(request.auth.uid));
      }
    }
    match /inviteCodes/{code} {
      allow read, create: if request.auth != null;
    }
  }
}
```

### localStorage → Firestore移行
既存データを新規登録時に自動移行する関数を実装する（`migrateLocalStorage`）。
オフライン時はlocalStorageにフォールバックする設計にする。

---

## 7. GitHub Pagesデプロイフロー

```bash
# 1. リポジトリをクローン
git clone https://{user}:{PAT}@github.com/{user}/{repo}.git

# 2. git設定
cd {repo}
git config user.email "deploy@{repo}.app"
git config user.name "{AppName}"

# 3. ファイル追加・コミット・プッシュ
git add -A
git commit -m "feat: ..."
git push origin main

# 4. GitHub Pages有効化（初回のみ）
# リポジトリをpublicにする
curl -X PATCH -H "Authorization: token {PAT}" \
  https://api.github.com/repos/{user}/{repo} \
  -d '{"private":false}'

# Pages有効化
curl -X POST -H "Authorization: token {PAT}" \
  https://api.github.com/repos/{user}/{repo}/pages \
  -d '{"source":{"branch":"main","path":"/"}}'

# 5. ビルド完了待機（ポーリング）
for i in 1 2 3 4 5 6 7 8; do
  sleep 8
  STATUS=$(curl -s -H "Authorization: token {PAT}" \
    https://api.github.com/repos/{user}/{repo}/pages \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
  echo "Poll $i: $STATUS"
  if [ "$STATUS" = "built" ]; then break; fi
done
```

**公開URL**: `https://{user}.github.io/{repo}/`

---

## 8. 品質チェックリスト（デプロイ前に必ず実行）

```python
python3 -c "
from html.parser import HTMLParser
class V(HTMLParser):
    def __init__(self):
        super().__init__(); self.errors=[]; self.stack=[]
        self.void={'area','base','br','col','embed','hr','img','input',
                   'link','meta','param','source','track','wbr'}
    def handle_starttag(self,t,a):
        if t not in self.void: self.stack.append(t)
    def handle_endtag(self,t):
        if t in self.void: return
        if self.stack and self.stack[-1]==t: self.stack.pop()
        else: self.errors.append(f'</{t}>')
v=V(); content=open('index.html').read(); v.feed(content)
print('HTML:', 'OK' if not v.errors and not v.stack else 'NG')
print('Errors:', v.errors[:3] if v.errors else 'なし')
print('Unclosed:', v.stack[-3:] if v.stack else 'なし')
"
```

追加チェック項目：
- `getElementById` → 対応するHTMLのIDが存在するか
- `onclick=` → 対応するJS関数が定義されているか
- CSS変数 → 使用している変数がすべて`:root`で定義されているか
- モジュールID → navタブの`showModule('xxx')`とHTMLの`id="mod-xxx"`が一致するか
- JS関数の重複定義 → 同名関数が複数定義されていないか（バグの主因）

---

## 9. よくあるバグと対処法

| バグ | 原因 | 対処 |
|---|---|---|
| タブを切り替えても画面が変わらない | モジュールのactive初期状態が複数ある | `.module.active`が1つだけか確認 |
| 同じ関数が2つ定義されている | リファクタリング時の削除漏れ | `grep -n "function xxx"` で確認 |
| setTimeoutが止まらない | タブ切替時にclearTimeoutしていない | showModule内で`clearTimeout`を呼ぶ |
| deleteが効かない | onclick経由でstring型になる | `Number(id)`でキャスト |
| Firebase認証後に画面が真っ白 | 外部JSファイルのCORSエラー | firebaseコードをインライン化 |
| 招待コードで「ログインが必要」 | familyIdがnullのまま | loadFamilyContextの再実行・debugログで確認 |
| PWAでオフライン時にAPIエラー | Service Workerのfetchハンドラ漏れ | api.anthropic.comへのfetchをSWで捕捉 |

---

## 10. Firebaseコンソール設定手順（ユーザー向け案内）

1. https://console.firebase.google.com → プロジェクト選択
2. **Firestore**: Database と Storage → Cloud Firestore → データベースの作成
   - Standard エディション → 次へ
   - ロケーション: `asia-northeast1 (Tokyo)` → 次へ
   - 本番環境モード → 作成
   - 「ルール」タブ → セキュリティルールを貼り付け → 公開
3. **Authentication**: セキュリティ → Authentication → ログイン方法
   - 「メール/パスワード」をクリック → 有効にする → 保存

---

## 11. モジュール設計パターン（Aroha標準）

各機能モジュールは以下のセットで構成する：

```
HTML:  <section id="mod-{name}" class="module">
CSS:   .{name}-* セレクタ（他モジュールと競合しない命名）
JS:    
  - getData{Name}()    → localStorage/Firestoreから取得
  - save{Name}()       → 保存（localStorage + Firestore両対応）
  - render{Name}()     → UIを再描画
  - update{Name}Stats() → 統計数値を更新（あれば）
```

**記録の共通フィールド**（Firestore保存時）：
```javascript
{
  id: Date.now(),          // ローカルID
  ...data,                 // モジュール固有データ
  authorUid:  user.uid,   // 記録者のFirebase UID
  authorRole: role,        // 'papa' | 'mama'
  roleLabel:  roleLabel,   // '👨 パパ' | '👩 ママ'
  createdAt:  serverTimestamp(),
  localId:    data.id,
}
```
