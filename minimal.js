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

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

if (!process.env.OPENAI_API_KEY) {
  console.error('警告: OPENAI_API_KEYが設定されていません。ChatGPT機能は動作しません。');
  console.error('Vercel環境では、プロジェクト設定で環境変数を設定してください。');
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
      
      let replyText = '';
      
      // 特定のキーワードに対する応答
      if (userMessage.includes('天気')) {
        replyText = '今日は晴れです！気温は20度前後でしょう。';
      } else if (userMessage.includes('テスト')) {
        replyText = 'テスト成功！BOTは正常に動作しています。';
      } else if (userMessage.includes('こんにちは') || userMessage.includes('おはよう') || userMessage.includes('こんばんは')) {
        replyText = 'こんにちは！何かお手伝いできることはありますか？';
      } else {
        try {
          if (!openai) {
            replyText = '[デバッグ情報] OpenAI APIキーが設定されていません。環境変数OPENAI_API_KEYを設定してください。';
            console.log('OpenAIクライアント未初期化のため固定応答を返信:', replyText);
          } else {
            console.log('ChatGPTを使用して応答を生成します');
            replyText = await generateChatGPTResponse(userMessage);
            console.log('ChatGPT応答を受信:', replyText);
          }
        } catch (error) {
          console.error('ChatGPT応答生成エラー:', error);
          replyText = `[デバッグ情報] ChatGPT APIエラー: ${error.message}`;
          console.log('エラーメッセージを返信:', replyText);
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

async function generateChatGPTResponse(userMessage) {
  try {
    console.log('\n\n********** OpenAI API CALL START **********');
    console.log('ユーザーメッセージ:', userMessage);
    console.log('NODE_VERSION:', process.version);

    if (!openai) {
      const errorMsg = 'OpenAIクライアントが初期化されていません。OPENAI_API_KEYが設定されているか確認してください。';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    console.log('API Key形式:', process.env.OPENAI_API_KEY ? (process.env.OPENAI_API_KEY.substring(0, 10) + '...') : '未設定');
    
    console.log('OpenAI Client Info:', {
      initialized: !!openai,
      hasAPIKey: openai && !!openai.apiKey,
      baseURL: openai && openai.baseURL ? openai.baseURL : 'default'
    });

    console.log('APIリクエスト送信開始...');
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'あなたは日本語で答えるチャットボットです。短く答えてください。' },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 150,
        temperature: 0.7
      });
      
      console.log('APIレスポンス受信成功!');
      console.log('レスポンス構造:', response ? JSON.stringify(response, null, 2).substring(0, 200) + '...' : '空のレスポンス');
      
      if (response.choices && response.choices.length > 0 && response.choices[0].message) {
        const reply = response.choices[0].message.content.trim();
        console.log('ChatGPT応答テキスト:', reply);
        return reply;
      } else {
        const errorMsg = 'OpenAIからの応答データが不正です: ' + JSON.stringify(response);
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (apiError) {
      console.error('OpenAI API呼び出しエラー:', apiError);
      throw apiError;
    }
  } catch (error) {
    console.error('\n*** OPENAI API ERROR ***');
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Error stack:', error.stack);
    
    throw error;
  }
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
