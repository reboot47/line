'use strict';

// 必要なモジュールをインポート
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

// 環境変数の設定を読み込む
const PORT = process.env.PORT || 3000;
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

// LINEクライアントと Express アプリケーションを作成
const client = new line.Client(config);
const app = express();

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ルートエンドポイント
app.get('/', (req, res) => {
  res.send('LINE Bot Server is running!');
});

// Webhookエンドポイント
app.post('/webhook', async (req, res) => {
  console.log('Webhook received');
  
  // 即座に200 OKを返す
  res.status(200).end();
  
  try {
    const events = req.body.events;
    console.log('Events:', JSON.stringify(events));
    
    // イベントがない場合は何もしない
    if (!events || !Array.isArray(events) || events.length === 0) {
      return;
    }
    
    // 各イベントを処理
    for (const event of events) {
      if (event.type !== 'message' || event.message.type !== 'text') {
        continue;
      }
      
      const userMessage = event.message.text;
      console.log('Received message:', userMessage);
      
      let replyText = '返信テスト: ' + userMessage;
      
      // 特定のキーワードに対する応答
      if (userMessage.includes('天気')) {
        replyText = '今日は晴れです！気温は20度前後でしょう。';
      } else if (userMessage.includes('テスト')) {
        replyText = 'テスト成功！BOTは正常に動作しています。';
      } else if (userMessage.includes('こんにちは')) {
        replyText = 'こんにちは！何かお手伝いできることはありますか？';
      }
      
      console.log('Sending reply:', replyText);
      
      // 応答を送信
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText
      });
      
      console.log('Reply sent successfully');
    }
  } catch (error) {
    console.error('Error handling webhook:', error);
  }
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
