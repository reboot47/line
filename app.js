'use strict';

// 必要なモジュールをインポート
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { OpenAI } = require('openai');
const util = require('util');

// 環境変数の設定を読み込む
const PORT = process.env.PORT || 3000;
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

// OpenAI APIクライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // 環境変数からAPIキーを読み込む
  dangerouslyAllowBrowser: true  // ブラウザ環境での実行を許可
});

// LINEクライアントと Express アプリケーションを作成
const client = new line.Client(config);
const app = express();

// 生のリクエストデータを取り込むミドルウェア
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ 
  extended: true,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// ルートエンドポイント
app.get('/', (req, res) => {
  res.send('LINE Bot Server is running!');
});

// デバッグ用のロガー
const debugLog = (obj) => {
  console.log(util.inspect(obj, { showHidden: false, depth: null, colors: true }));
};

// WebhookエンドポイントのGETリクエスト対応
app.get('/webhook', (req, res) => {
  res.status(200).send('This is a LINE Bot webhook endpoint. POST requests from LINE Platform are accepted.');
});

// 成功したアプローチをベースにした完全な機能を持つWebhookハンドラー
app.post('/webhook', (req, res) => {
  // 検証成功の要点: 即座に200レスポンスを返す
  res.status(200).send('OK');

  // 後続処理を非同期で実行
  setTimeout(async () => {
    try {
      console.log('Webhook called - processing events');
      console.log('Environment variables check:');
      console.log('- LINE_CHANNEL_SECRET exists:', !!process.env.LINE_CHANNEL_SECRET);
      console.log('- LINE_CHANNEL_ACCESS_TOKEN exists:', !!process.env.LINE_CHANNEL_ACCESS_TOKEN);
      console.log('- OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
      
      // 検証リクエストや空リクエストの場合は無視
      if (!req.body || !req.body.events || req.body.events.length === 0) {
        console.log('Webhook verification or empty request detected');
        return;
      }

      console.log(`Processing ${req.body.events.length} events:`, JSON.stringify(req.body.events));
      
      // 各イベントを非同期で処理
      for (const event of req.body.events) {
        try {
          console.log('Processing event:', JSON.stringify(event));
          console.log('Event type:', event.type);  // 追加デバッグ情報
          console.log('Event source:', JSON.stringify(event.source));  // ソース情報
          
          if (event.type === 'message') {
            console.log('Message type:', event.message.type);
            if (event.message.type === 'text') {
              console.log('Message content:', event.message.text);
            }
          }
          
          // イベントを処理
          const result = await handleEvent(event);
          console.log('Event processed successfully:', event.type, 'Result:', JSON.stringify(result));
        } catch (err) {
          console.error('Error processing event:', err);
          console.error('Error stack:', err.stack);  // スタック追跡を表示
          
          // 別のメッセージでフォールバック応答
          try {
            // eventが有効で、replyTokenがある場合のみ実行
            if (event && event.replyToken) {
              await client.replyMessage(event.replyToken, {
                type: 'text',
                text: '申し訳ありません、エラーが発生しました。後ほどお試しください。'
              });
              console.log('Fallback message sent successfully');
            } else {
              console.error('Invalid event or missing replyToken:', event);
            }
          } catch (replyError) {
            console.error('Failed to send fallback message:', replyError);
          }
        }
      }
    } catch (error) {
      console.error('Async processing error:', error);
    }
  }, 10); // レスポンス送信後に実行されるように少し遅延
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
  // 各イベントの詳細情報を出力
  console.log('Event details:', JSON.stringify(event));
  
  // メッセージイベント以外は無視
  if (event.type !== 'message' || event.message.type !== 'text') {
    console.log('Skipping non-text message event');
    return Promise.resolve(null);
  }

  // 受信したメッセージ
  const receivedMessage = event.message.text;
  console.log('Received message:', receivedMessage);
  let replyMessage = '';

  // 特定のキーワードの場合は即度応答
  if (receivedMessage.includes('こんにちは')) {
    replyMessage = 'こんにちは！今日も素敵な一日ですね！';
    console.log('Greeting response generated');
  } else if (receivedMessage.includes('おはよう')) {
    replyMessage = 'おはようございます！素晴らしい朝ですね！';
    console.log('Morning greeting response generated');
  } else if (receivedMessage.includes('おやすみ')) {
    replyMessage = 'おやすみなさい！良い夢を見てくださいね。';
    console.log('Night greeting response generated');
  } else if (receivedMessage.includes('テスト') || receivedMessage.includes('test')) {
    // テスト用の固定応答
    replyMessage = 'テストメッセージを受信しました！正常に動作しています。';
    console.log('Test message response generated');
  } else {
    console.log('Attempting to generate ChatGPT response');
    try {
      // ChatGPTを使用して応答生成
      replyMessage = await generateChatGPTResponse(receivedMessage);
      console.log('ChatGPT response generated:', replyMessage);
    } catch (error) {
      console.error('ChatGPT APIエラー:', error);
      // エラー時はフォールバックのランダム応答を返す
      const randomResponses = [
        'ごめんなさい、今ちょっと考えるのに時間が必要です。',
        'うーん、難しい質問ですね。もう少し考えさせてください。',
        '申し訳ありません、今接続が不安定なようです。後でもう一度お試しください。',
        'すみません、ちょっと混雑しています。後ほどお返事します。',
        '興味深い質問ですね！実はそのことについて考えていたところです。'
      ];
      const randomIndex = Math.floor(Math.random() * randomResponses.length);
      replyMessage = randomResponses[randomIndex];
      console.log('Fallback random response generated:', replyMessage);
    }
  }
  
  // 応答が長すぎる場合は切り詰め
  if (replyMessage.length > 2000) {
    replyMessage = replyMessage.substring(0, 1997) + '...';
  }

  console.log('Preparing to send reply:', replyMessage);

  // メッセージを返信
  try {
    const result = await client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyMessage,
    });
    console.log('Message sent successfully, result:', JSON.stringify(result));
    return result;
  } catch (error) {
    console.error('Error sending reply message:', error);
    throw error;
  }
}

// ChatGPTを使用して応答を生成する関数
async function generateChatGPTResponse(userMessage) {
  try {
    // リクエストのログ出力
    console.log('ChatGPT APIにリクエスト開始:', userMessage);
    console.log('API Key設定状況:', process.env.OPENAI_API_KEY ? 'APIキーあり' : 'APIキーなし');
    console.log('API Keyの最初の10文字:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 10) + '...' : 'なし');
    
    // APIキーが設定されているか確認
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEYが設定されていません');
      return 'API設定が見つかりません。システム管理者に連絡してください。';
    }
    
    console.log('OpenAIクライアントの初期化状態確認:', !!openai);
  
    // より詳細なエラーハンドリングを追加
    try {
      // ChatGPT APIへのリクエスト
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'あなたは助けになるフレンドリーなチャットボットです。日本語で短く、親しみやすく、そして有益な情報を提供してください。答えは100字程度に収めてください。'
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });
      
      // 応答を取得
      console.log('ChatGPT API応答成功:', response.choices[0]?.message?.content);
      const reply = response.choices[0]?.message?.content || 'レスポンスが空でした。';
      return reply;
    } catch (apiError) {
      console.error('ChatGPT API呼び出しエラー:', apiError);
      // エラーの詳細情報を表示
      if (apiError.response) {
        console.error('APIエラーレスポンス:', JSON.stringify(apiError.response));
      }
      throw apiError;
    }
  } catch (error) {
    console.error('ChatGPT全体エラー:', error);
    throw error;
  }
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
