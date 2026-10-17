# ふたりの食べログ

行ってよかったお店を、恋人・家族・友人と記録して共有するスマホ向けWebアプリです。

- 店ごとにカテゴリ・位置・共有事項(予約・個室・喫煙など)を登録し、その下に「誰が・いつ・どう感じたか」の訪問記録(★5段階・メニュー・感想・写真最大4枚)を積み上げます。
- 店のおすすめ度は訪問記録の平均です。一覧・地図はシーン・タイミング・予算・おすすめ度・設備・記録した人で絞り込めます。検索はひらがな/カタカナ・全角/半角の違いを区別しません。
- ログインはありません。**合言葉(グループID)** を知っている人どうしで同じデータを見て、編集できます。
- ビルド不要の静的ファイル(HTML / CSS / ES Modules)で、GitHub Pages + Firebase Cloud Firestore(無料の Spark プラン)で動きます。既存の「ふたりの家計簿」「おうち在庫」と同じ構成です。

設計書:`../docs/01_requirements.md`(要件)、`02_ui.md`(画面)、`03_design.md`(デザイン)、`04_database.md`(DB)

---

## ファイル構成

```
app/
├── index.html               アプリシェル(帯・下部タブ・FAB・オーバーレイの置き場)
├── manifest.webmanifest     PWA マニフェスト
├── sw.js                    Service Worker(アプリシェルを cache-first。VERSION で更新管理)
├── firestore.rules          Firestore セキュリティルール(コンソールに貼り付けて公開)
├── css/
│   ├── tokens.css           デザイントークン(色・文字・余白・ダークモード)
│   └── app.css              部品スタイル(トークンのみ参照)
├── icons/                   icon.svg / icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
└── js/
    ├── app.js               起動・ハッシュルーティング・共有URL(?g=)・SW 登録
    ├── firebase-config.js   ★ Firebase の設定値(ここを書き換える)
    ├── schema.js            enum 定義・検証・集計(computeShopAggregates)の純関数
    ├── filter.js            検索語の正規化・絞り込み・並び替え・重複候補の純関数(DOM 非依存)
    ├── utils.js             日付・画像サイズ計算・距離・合言葉生成などの純関数(DOM 非依存)
    ├── store.js             データ層の共通インターフェースとモード判定
    ├── store-firestore.js   Firestore 実装(オフラインキャッシュ・集計の再計算・削除のカスケード)
    ├── store-local.js       デモモード実装(localStorage + IndexedDB、この端末のみ)
    ├── state.js             端末設定(ニックネーム・合言葉)・共有状態・絞り込み条件の保持
    ├── dom.js               安全な要素生成ヘルパー h()・線画アイコン
    ├── ui.js                トースト・確認ダイアログ・ボトムシート・オーバーレイ履歴
    ├── components.js        ヘッダー・チップ・★・店カードなどの共通部品
    ├── images.js            写真のリサイズ・JPEG 圧縮(Canvas)
    ├── geo.js               現在地・Nominatim(1秒1回に制限)・Leaflet の読み込み
    └── views/
        ├── setup.js             S-01 初期設定
        ├── list.js              S-02 店一覧
        ├── filter-sheet.js      S-03 絞り込み・並び替え
        ├── map.js               S-04 地図
        ├── shop-detail.js       S-05 店詳細
        ├── forms.js / form-views.js   S-06 店登録・編集 / S-08 訪問記録の追加・編集
        ├── location-picker.js   S-07 位置選択
        ├── photo-viewer.js      S-09 写真ビューア
        └── settings.js          S-10 設定
```

画面のルート(ハッシュ):`#/setup` `#/list` `#/map` `#/settings` `#/shop/new` `#/shop/:id` `#/shop/:id/edit` `#/shop/:id/visit/new` `#/shop/:id/visit/:vid/edit`

---

## デモモードで試す(Firebase なし)

`js/firebase-config.js` の `apiKey` が `"YOUR_API_KEY"` のままの間は、自動的に **デモモード** で動きます。画面上部に「デモモード(この端末のみ保存)」の帯が出て、データはこのブラウザの中(localStorage、写真は IndexedDB)だけに保存されます。Firebase の SDK は読み込みません。

```bash
cd app
python3 -m http.server 8080
# → http://localhost:8080/ をブラウザで開く
```

- Firebase を設定した後でも、URL に `?demo=1` を付けて開くとデモモードになります(そのタブを閉じるまで有効。`?demo=0` で解除)。本番データを汚さずに操作を試したいときに使えます。
- 現在地の取得はブラウザの制約で **https または localhost** でのみ動きます。スマホ実機で試すときは、GitHub Pages に公開してから開くのが確実です。
- デモモードでは別の端末とは同期しません。容量はブラウザの localStorage の上限(数MB)までです。

---

## 公開手順(Firebase + GitHub Pages)

家計簿アプリ・在庫アプリと同じ流れです。

### 1. Firebase プロジェクトを作る
1. https://console.firebase.google.com/ を開き「プロジェクトを追加」。名前は例:`futari-tabelog`。
2. Google アナリティクスは無効でかまいません。
3. プランは **Spark(無料)のまま** にします(Blaze へはアップグレードしない。無料枠を超えても課金されず、エラーになるだけです)。

### 2. Firestore を作る
1. 左メニュー「構築」→「Firestore Database」→「データベースを作成」。
2. ロケーションは **`asia-northeast1`(東京)**(後から変更できません)。
3. 「本番環境モード」で開始します(ルールは手順4で貼り替えます)。

### 3. Web アプリを登録して設定値を貼る
1. プロジェクトの概要の横の歯車 →「プロジェクトの設定」→「マイアプリ」→ Web(`</>`)アイコン。
2. アプリのニックネーム(例:`futari-tabelog-web`)を入れて登録します。Firebase Hosting は **不要**(チェックしない)。
3. 表示された `firebaseConfig` の値を `js/firebase-config.js` に貼り付けます。

   ```js
   export const firebaseConfig = {
     apiKey: "AIza....",
     authDomain: "futari-tabelog.firebaseapp.com",
     projectId: "futari-tabelog",
     storageBucket: "futari-tabelog.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef",
   };
   ```

   この値は公開されても問題ない識別子です(手順7で使える場所を制限します)。**合言葉はここに書かないでください。**

### 4. セキュリティルールを公開する
1. Firestore Database →「ルール」タブ。
2. 既存の内容をすべて消し、`app/firestore.rules` の中身を貼り付けて「公開」。
3. (推奨)「ルール プレイグラウンド」で、`groups` の一覧取得(list)が拒否されることを確認します。
4. (推奨・容量の節約)「インデックス」→「単一フィールド」→「除外を追加」で、次の大きな文字列フィールドを索引対象外にします:`photos.data`、`visits.thumbs`、`shops.thumb`、`shops.menusText`、`visits.tasteComment`、`visits.moodComment`(コレクション ID と フィールドを指定、スコープは「コレクション」)。

複合インデックスは不要です。

### 5. GitHub リポジトリを作って push
1. GitHub で新しいリポジトリを作成(例:`futari-tabelog`、Public)。
2. `app/` フォルダの **中身** をリポジトリのルートに置いて push します(`index.html` がルートに来るように)。

   ```bash
   cd app
   git init
   git add .
   git commit -m "ふたりの食べログ 初版"
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/futari-tabelog.git
   git push -u origin main
   ```

### 6. GitHub Pages を有効にする
1. リポジトリの Settings → Pages。
2. Source:「Deploy from a branch」、Branch:`main` / `/ (root)` → Save。
3. 1〜2分後に `https://<ユーザー名>.github.io/futari-tabelog/` で開けます。すべて相対パスなのでサブパスのままで動きます。

### 7. API キーに使える場所の制限をかける
1. https://console.cloud.google.com/apis/credentials を開き、上部で Firebase と同じプロジェクトを選びます。
2. 「API キー」の「Browser key (auto created by Firebase)」を開きます。
3. **アプリケーションの制限**:「ウェブサイト」を選び、次を追加して保存。
   - `https://<ユーザー名>.github.io/*`
   - (手元で Firebase 接続を試すなら)`http://localhost:8080/*`
4. **API の制限**:「キーを制限」→ **Cloud Firestore API** を選択(Firebase が自動で有効にした API のうち、このアプリが使うのは Firestore だけです)。
5. 保存後、反映まで数分かかることがあります。

> 家計簿・在庫アプリと同じ `https://<ユーザー名>.github.io/*` を許可する形でかまいません。キーはプロジェクトごとに別なので、それぞれのプロジェクトで設定してください。

### 更新するとき
- ファイルを変更したら `sw.js` 先頭の `VERSION`(例:`v1.0.0` → `v1.0.1`)を上げてから push します。開いている端末には「新しいバージョンがあります [更新する]」が出ます。
- JS ファイルを追加した場合は `sw.js` の `SHELL_FILES` にも追記します。

---

## 合言葉の共有のしかた

1. 最初の1人が「新しく始める」を押すと、24文字の合言葉(例:`a8KxQ2…`)が作られます。
2. 表示された画面、または **設定 → 合言葉(グループ)** で
   - [共有する]:LINE などの共有シートで招待URL(`https://…/futari-tabelog/?g=<合言葉>`)を送る
   - [URLをコピー] / [合言葉をコピー]:メッセージに貼って送る
3. 受け取った人は招待URLを開き、ニックネームを入れて[参加する]を押すだけです。合言葉を手入力(URLを丸ごと貼ってもOK)して参加することもできます。
4. ホーム画面に追加すると、次からはアプリのように全画面で開けます(iPhone は Safari の共有ボタン →「ホーム画面に追加」)。

**注意**
- 合言葉を知っている人は誰でも閲覧・編集・削除できます。信頼できる人だけに送ってください。
- 合言葉を忘れると、その端末以外からはデータに到達できません。設定画面の[合言葉をコピー]で控えておくと安心です。
- 「この端末からグループを外す」はこの端末の記憶を消すだけで、データは消えません。

---

## 開発メモ

- 純関数モジュール(`js/schema.js` / `js/filter.js` / `js/utils.js`)は DOM に依存しないので Node でテストできます。

  ```bash
  node -e "import('./js/filter.js').then(m => console.log(m.normalizeText('ﾗｰﾒﾝ')))"   # → らーめん
  ```

- 画面に出す文字列はすべて `textContent` / 要素生成で挿入しています(`innerHTML` は `dom.js` の固定アイコン定義だけ)。リンク化するのは `http://` `https://` の URL だけです。
- localStorage のキーと Service Worker のキャッシュ名には `futari-tabelog.` / `futari-tabelog-` の接頭辞を付けています。同じ `<ユーザー名>.github.io` で動く家計簿・在庫アプリのデータとはぶつかりません。
- enum の値・文字数上限を変えるときは `docs/04_database.md`・`firestore.rules`・`js/schema.js` の3か所を同時に更新してください。
