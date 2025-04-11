'use strict';

// 必要なモジュールをインポート
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const bodyParser = require('body-parser');

// 環境変数の設定を読み込む
const PORT = process.env.PORT || 3000;
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

// LINEクライアントと Express アプリケーションを作成
const client = new line.Client(config);
const app = express();

// JSON形式のリクエストを処理するためのミドルウェア
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// リクエストの検証用ミドルウェア
app.use('/webhook', line.middleware(config));

// ルートエンドポイント
app.get('/', (req, res) => {
  res.send('LINE Bot Server is running!');
});

// Webhookエンドポイント
app.post('/webhook', (req, res) => {
  console.log('Webhook called:', req.body);
  if (!req.body || !req.body.events) {
    console.log('Invalid webhook request:', req.body);
    return res.status(400).json({ error: 'Invalid webhook request' });
  }

  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Error handling webhook:', err);
      res.status(500).end();
    });
});

// イベントハンドラー
async function handleEvent(event) {
  // メッセージイベント以外は無視
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  // 受信したメッセージ
  const receivedMessage = event.message.text;
  let replyMessage = '';

  // 簡単な応答ロジック
  if (receivedMessage.includes('こんにちは')) {
    replyMessage = 'こんにちは！';
  } else if (receivedMessage.includes('おはよう')) {
    replyMessage = 'おはようございます！';
  } else if (receivedMessage.includes('おやすみ')) {
    replyMessage = 'おやすみなさい！';
  } else {
    replyMessage = `「${receivedMessage}」というメッセージを受け取りました！`;
  }

  // メッセージを返信
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyMessage,
  });
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
