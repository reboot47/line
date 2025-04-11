'use strict';

// 必要最小限のモジュールをインポート
require('dotenv').config();
const express = require('express');

// 最小限のアプリケーションを作成
const app = express();
const PORT = process.env.PORT || 3000;

// JSONとURLエンコードされたデータを受け入れる
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ルートエンドポイント
app.get('/', (req, res) => {
  res.status(200).send('LINE Bot Server is running!');
});

// 検証専用のシンプルなWebhookエンドポイント
app.post('/webhook', (req, res) => {
  // 即座に200 OKを返す
  res.status(200).send('OK');
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Simple verification server is running on port ${PORT}`);
});
