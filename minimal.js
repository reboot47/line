'use strict';

// 必要なモジュールをインポート
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require('openai');

// 環境変数の設定を読み込む
const PORT = process.env.PORT || 3000;
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

// OpenAI APIクライアントの初期化
let openai = null;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('OpenAI初期化成功');
} catch (error) {
  console.error('OpenAI初期化エラー:', error.message);
}

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
      
      // ChatGPTプレフィックスのチェック
      if (userMessage.startsWith('gpt:')) {
        try {
          console.log('ChatGPT処理を開始します');
          // プレフィックスを除去してChatGPTに送信
          const actualMessage = userMessage.substring(4).trim();
          replyText = await generateChatGPTResponse(actualMessage);
          console.log('ChatGPT応答:', replyText);
        } catch (error) {
          console.error('ChatGPT処理エラー:', error);
          replyText = `ChatGPTエラー: ${error.message}`;
        }
      }
      // 特定のキーワードに対する応答
      else if (userMessage.includes('天気')) {
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

// ChatGPT応答生成関数
async function generateChatGPTResponse(userMessage) {
  try {
    // OpenAIクライアントの確認
    if (!openai) {
      console.error('OpenAIクライアントが初期化されていません');
      return 'エラー: ChatGPT連携が設定されていません。';
    }

    // APIリクエスト開始
    console.log('ChatGPT APIリクエスト送信:', userMessage);
    
    // シンプルなリクエスト
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'あなたは日本語で答えるチャットボットです。短く答えてください。' },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 150,
      temperature: 0.7
    });
    
    // 応答処理
    if (response.choices && response.choices.length > 0 && response.choices[0].message) {
      const reply = response.choices[0].message.content.trim();
      console.log('ChatGPT応答テキスト:', reply);
      return reply;
    } else {
      console.error('ChatGPT応答形式エラー');
      return 'エラー: ChatGPTから応答を受け取れませんでした。';
    }
  } catch (error) {
    console.error('ChatGPTエラー:', error);
    return `ChatGPTエラー: ${error.message}`;
  }
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`OpenAI API Key設定状態: ${process.env.OPENAI_API_KEY ? '設定あり' : '未設定'}`);
});
