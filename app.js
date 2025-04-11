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

// OpenAIクライアントの初期化確認
console.log('サーバー起動時OpenAI初期化確認:', {
  hasApiKey: !!process.env.OPENAI_API_KEY,
  apiKeyPrefix: process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 7)}...` : 'undefined',
  clientInitialized: !!openai
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
  console.log('\n\n=== Webhookを受信しました ===');
  console.log('現在時刻:', new Date().toISOString());
  
  // 即度に200レスポンスを返す
  res.status(200).send('OK');
  console.log('200 OKレスポンスを送信しました');
  
  // リクエストの構造をログ出力
  const hasEvents = req.body && req.body.events && Array.isArray(req.body.events);
  console.log('Webhookの構造:', { 
    hasBody: !!req.body, 
    hasEvents: hasEvents,
    eventCount: hasEvents ? req.body.events.length : 0 
  });
  
  // 非同期でイベントを処理
  setTimeout(async () => {
    console.log('非同期処理が開始されました');
    // イベントの配列を確認
    if (!req.body || !req.body.events || !Array.isArray(req.body.events)) {
      console.error('無効なリクエスト本文:', req.body);
      return;
    }
    
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
  console.log('=== handleEvent関数に入りました ===');
  console.log('イベントタイプ:', event.type);
  
  // テキストメッセージ以外のイベントの場合は処理しない
  if (event.type !== 'message' || event.message.type !== 'text') {
    console.log('テキストメッセージ以外のイベントなので処理しません');
    return Promise.resolve(null);
  }

  // ユーザーからのメッセージを取得
  const userMessage = event.message.text;
  console.log('受信メッセージ:', userMessage);
  
  // デバッグメッセージの場合は即度に応答
  if (userMessage.toLowerCase().includes('debug')) {
    console.log('デバッグモードを検出');
    const debugInfo = {
      openaiApiKey: process.env.OPENAI_API_KEY ? '設定済み' : '未設定',
      keyPrefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 7) + '...' : 'なし',
      openaiClient: !!openai ? '初期化済み' : '初期化失敗',
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    };
    
    const debugResponse = `デバッグ情報:\n
- OpenAI API: ${debugInfo.openaiApiKey}\n
- キー形式: ${debugInfo.keyPrefix}\n
- クライアント: ${debugInfo.openaiClient}\n
- 環境: ${debugInfo.environment}\n
- 時刻: ${debugInfo.timestamp}`;
    
    console.log('デバッグ応答を送信:', debugResponse);
    
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: debugResponse
    }).catch((error) => {
      console.error('デバッグ応答送信エラー:', error);
      throw error;
    });
  }
  
  // 通常のメッセージ処理
  console.log('processUserMessageを呼び出します');
  let replyMessage = await processUserMessage(userMessage);
  console.log('生成された応答:', replyMessage);
  
  // メッセージを送信
  console.log('LINEに応答送信します');
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyMessage
  }).catch((error) => {
    console.error('Error replying to message:', error);
    throw error;
  });
}

// ユーザーのメッセージを処理する関数
async function processUserMessage(userMessage) {
  // 各イベントの詳細情報を出力
  console.log('Event details:', JSON.stringify({ userMessage }));
  
  // 受信したメッセージ
  const receivedMessage = userMessage;
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
    console.log('--------ChatGPT APIリクエスト開始--------');
    console.log('ユーザーメッセージ:', userMessage);
    console.log('API Key設定状況:', process.env.OPENAI_API_KEY ? '設定あり' : '設定なし');
    
    // APIキーが設定されているか確認
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEYが設定されていません');
      return 'システムエラー: API設定がありません';
    }
    
    // キーが正しい形式か確認 - プロジェクトキー(sk-proj-)形式にも対応
    const apiKeyPattern = /^sk-(proj-)?[a-zA-Z0-9-_]+$/;
    if (!apiKeyPattern.test(process.env.OPENAI_API_KEY)) {
      console.error('OPENAI_API_KEYが正しい形式ではありません');
      console.log('API Key形式:', process.env.OPENAI_API_KEY.substring(0, 10) + '...');
      return 'システムエラー: APIキーの形式が正しくありません';
    }
    
    console.log('OpenAIクライアント確認:', !!openai ? '初期化済み' : '初期化失敗');
  
    try {
      console.log('OpenAI APIリクエスト送信中...');
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
      console.log('OpenAI API応答:', response);
      console.log('OpenAI API応答文字列:', JSON.stringify(response));
      console.log('response.choices:', response.choices);
      
      if (response.choices && response.choices.length > 0 && response.choices[0].message) {
        console.log('ChatGPT応答成功:', response.choices[0].message.content);
        return response.choices[0].message.content.trim();
      } else {
        console.error('ChatGPT応答の構造が不正:', response);
        return '応答の受信中に問題が発生しました。';
      }
    } catch (apiError) {
      console.error('ChatGPT APIエラー発生:', apiError);
      console.error('ChatGPT APIエラー詳細:', JSON.stringify(apiError, null, 2));
      
      if (apiError.response) {
        console.error('APIエラーレスポンス:', JSON.stringify(apiError.response, null, 2));
      }
      
      if (apiError.message && apiError.message.includes('API key')) {
        return 'システムエラー: APIキーに問題があります。管理者に連絡してください。';
      } else if (apiError.message && apiError.message.includes('rate limit')) {
        return 'システムエラー: APIの利用制限に達しました。しばらくしてからお試しください。';
      } else {
        return `システムエラー: ${apiError.message || '不明なエラー'}`;
      }
    }
  } catch (error) {
    console.error('全体エラー:', error);
    console.error('エラースタック:', error.stack);
    return 'システムエラーが発生しました。しばらくしてからお試しください。';
  }
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
