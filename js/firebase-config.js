// =====================================================================
// firebase-config.js ― Firebase の設定値
//   Firebase コンソール →(歯車)プロジェクトの設定 → マイアプリ → SDK の設定と構成 の
//   「構成」に表示される値をそのまま貼り付けてください。
//
//   apiKey が "YOUR_API_KEY" のままの間はデモモード(この端末の中だけに保存)で動きます。
//   ※ これらの値は公開されても問題ない識別子です(README のとおり API キーに
//     HTTP リファラー制限を設定してください)。合言葉はここに書かないこと。
// =====================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyDqP2l55_ARU3H-59xIgTatj1N1QNTmxGU",
  authDomain: "futari-tabelog.firebaseapp.com",
  projectId: "futari-tabelog",
  storageBucket: "futari-tabelog.firebasestorage.app",
  messagingSenderId: "726312121404",
  appId: "1:726312121404:web:45c36a3d4dda01e313bf39",
};

// Firebase JS SDK(CDN ESM)のバージョン
export const FIREBASE_SDK_VERSION = "11.0.2";
