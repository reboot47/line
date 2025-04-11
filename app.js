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

// サーバー起動時のログ
console.log('サーバー起動時の環境変数:', {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET ? '設定あり' : '未設定',
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN ? '設定あり' : '未設定',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '設定あり' : '未設定'
});

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
  console.log('リクエストボディ:', JSON.stringify(req.body));
  
  // 即度に200レスポンスを返す
  res.status(200).send('OK');
  
  // 必要なリクエストボディを確認
  if (!req.body || !req.body.events || !Array.isArray(req.body.events)) {
    console.error('無効なリクエスト本体:', JSON.stringify(req.body));
    return;
  }
  
  // 非同期でイベントを処理
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

// メッセージイベントを処理する関数 - 単純化したベーシックバージョン
async function handleEvent(event) {
  console.log('イベント処理開始:', JSON.stringify(event));
  
  // テキストメッセージ以外は処理しない
  if (event.type !== 'message' || event.message.type !== 'text') {
    console.log('テキストメッセージ以外のイベントなので処理しません');
    return Promise.resolve(null);
  }

  // 受信メッセージ
  const userMessage = event.message.text;
  console.log('受信メッセージ:', userMessage);
  
  // すべてのメッセージにデバッグ情報を追加
  const debugInfo = {
    message: userMessage,
    time: new Date().toISOString(),
    openaiKey: process.env.OPENAI_API_KEY ? '✅' : '❌',
    lineKey: process.env.LINE_CHANNEL_ACCESS_TOKEN ? '✅' : '❌'
  };
  
  // メッセージに基づいた簡単な応答
  let responseText = '';
  
  if (userMessage.includes('テスト')) {
    responseText = 'テスト成功！正常に動作しています。';
  } else {
    responseText = `「${userMessage}」を受信しました。現在OpenAI APIをテスト中です。\n\nデバッグ情報: 時刻=${debugInfo.time}, OpenAI=${debugInfo.openaiKey}, LINE=${debugInfo.lineKey}`;
  }
  
  console.log('送信する応答:', responseText);
  
  // 応答を送信
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: responseText
  }).catch((error) => {
    console.error('メッセージ送信エラー:', error);
    throw error;
  });
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
