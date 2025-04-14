'use strict';

// 必要なモジュールをインポート
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 環境変数の設定を読み込む
const PORT = process.env.PORT || 3000;
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

let genAI = null;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log('Gemini AI初期化成功');
} catch (error) {
  console.error('Gemini AI初期化エラー:', error.message);
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
  
  // 即度に200 OKを返す
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
      } else if (userMessage.includes('こんにちは') || userMessage.includes('おはよう') || userMessage.includes('こんばんは')) {
        replyText = 'こんにちは！何かお手伝いできることはありますか？';
      } else {
        try {
          console.log('Gemini AIで応答生成開始');
          replyText = await generateGeminiResponse(userMessage);
          console.log('Gemini AI応答生成成功:', replyText);
        } catch (error) {
          console.error('Gemini AIエラー:', error);
          // エラー時は固定応答にフォールバック
          const predefinedResponses = [
            'なるほど、それは興味深い質問ですね。もう少し教えていただけますか？',
            'そのことについてはいろいろな観点から考えることができますよ。具体的に知りたいことはありますか？',
            'お話を伴うことで、新しい視点が得られるかもしれませんね。',
            'それは重要なポイントです。もう少し詳しくお聊ししましょうか。',
            'いい質問ですね！この質問にはいくつかの考え方があります。',
            '他にも興味があれば、ぜひお語りください。喜んでお答えしますよ。',
            'そのことに関して考えるのは面白いですね。もう少し深報りしましょうか。'
          ];
          
          // メッセージ内容に基づいて固定応答を選択
          const responseIndex = Math.floor(userMessage.length % predefinedResponses.length);
          replyText = predefinedResponses[responseIndex];
          console.log('固定応答にフォールバック:', responseIndex, replyText);
        }
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

async function generateGeminiResponse(userMessage) {
  try {
    if (!genAI) {
      console.error('Gemini AIクライアントが初期化されていません');
      return 'エラー: Gemini AI連携が設定されていません。';
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEYが設定されていません');
      return 'Gemini APIキーが設定されていません。';
    }

    // APIリクエスト開始
    console.log('Gemini AI APIリクエスト送信:', userMessage);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Gemini APIリクエストがタイムアウトしました（15秒）')), 15000);
    });
    
    console.log('Gemini API呼び出し開始...');
    
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `あなたは日本語で答えるチャットボットです。短く答えてください。\n\nユーザー: ${userMessage}`;
    
    console.log('リクエスト内容:', prompt);
    
    const apiRequestPromise = model.generateContent(prompt);
    
    console.log('Promise.race開始...');
    const response = await Promise.race([apiRequestPromise, timeoutPromise]);
    
    // 応答処理
    if (response && response.response) {
      const reply = response.response.text().trim();
      console.log('Gemini AI応答テキスト:', reply);
      return reply;
    } else {
      console.error('Gemini AI応答形式エラー');
      return 'エラー: Gemini AIから応答を受け取れませんでした。';
    }
  } catch (error) {
    console.error('Gemini AIエラー:', error);
    return `Gemini AIエラー: ${error.message}`;
  }
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Gemini API Key設定状態: ${process.env.GEMINI_API_KEY ? '設定あり' : '未設定'}`);
});
