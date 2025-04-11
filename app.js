'use strict';

// 必要なモジュールをインポート
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const bodyParser = require('body-parser');
const crypto = require('crypto');

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
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(bodyParser.urlencoded({ extended: true }));

// ルートエンドポイント
app.get('/', (req, res) => {
  res.send('LINE Bot Server is running!');
});

// WebhookエンドポイントのGETリクエスト対応
app.get('/webhook', (req, res) => {
  res.status(200).send('This is a LINE Bot webhook endpoint. POST requests from LINE Platform are accepted.');
});

// Webhookエンドポイント
app.post('/webhook', (req, res) => {
  console.log('Webhook called with request body:', req.body);
  
  // Webhook検証の場合も200を返す
  if (!req.body || !req.body.events || req.body.events.length === 0) {
    console.log('Empty request or webhook verification');
    return res.status(200).end();
  }
  
  // 署名検証を行う
  try {
    const signature = req.headers['x-line-signature'];
    // 署名の検証
    if (!validateSignature(req.rawBody, config.channelSecret, signature)) {
      console.log('Invalid signature');
      return res.status(200).end();
    }
  } catch (err) {
    console.error('Signature validation error:', err);
    return res.status(200).end();
  }

  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.status(200).json(result))
    .catch((err) => {
      console.error('Error handling webhook:', err);
      res.status(200).end(); // エラー時も200を返す
    });
});

// 署名検証関数
function validateSignature(body, channelSecret, signature) {
  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

// イベントハンドラー
async function handleEvent(event) {
  // メッセージイベント以外は無視
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  // 受信したメッセージ
  const receivedMessage = event.message.text;
  let replyMessage = '';

  // 特定のキーワードへの応答
  if (receivedMessage.includes('こんにちは')) {
    replyMessage = 'こんにちは！今日も素敵な一日ですね！';
  } else if (receivedMessage.includes('おはよう')) {
    replyMessage = 'おはようございます！素晴らしい朝ですね！';
  } else if (receivedMessage.includes('おやすみ')) {
    replyMessage = 'おやすみなさい！良い夢を見てくださいね。';
  } else {
    // ランダムな応答を生成
    const randomResponses = [
      '面白いですね！もっと教えてください！',
      'なるほど！そういう考え方もありますね。',
      'それは私も考えたことがあります！',
      '素晴らしい発想ですね！',
      'うーん、深いお話ですね...',
      '今日の天気はどうですか？',
      'それについて、もっと詳しく聞かせてもらえますか？',
      '実は私もそう思っていました！',
      'そうなんですね！知りませんでした！',
      'びっくりしました！',
      '素敵なメッセージをありがとうございます！',
      '考えさせられるお話ですね...',
      'それは興味深いですね！',
      'なんとも言えない気持ちです...',
      'わくわくしますね！',
      '素晴らしい一日をお過ごしください！',
      'いつもありがとうございます！',
      'そんな風に考えたことはありませんでした！',
      'その調子で頑張ってください！',
      'あなたのメッセージを読むのは楽しいです！'
    ];

    // ランダムにインデックスを選択
    const randomIndex = Math.floor(Math.random() * randomResponses.length);
    replyMessage = randomResponses[randomIndex];
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
