'use strict';

// 必要なモジュールをインポート
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const util = require('util');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 環境変数の設定を読み込む
const PORT = process.env.PORT || 3000;
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

// シンプルな設定にして問題を最小化
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) // 環境変数からAPIキーを読み込む
  : null;

if (!process.env.GEMINI_API_KEY) {
  console.error('警告: GEMINI_API_KEYが設定されていません。Gemini AI機能は動作しません。');
  console.error('Vercel環境では、プロジェクト設定で環境変数を設定してください。');
}

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

console.log('サーバー起動時Gemini AI初期化確認:', {
  hasApiKey: !!process.env.GEMINI_API_KEY,
  apiKeyPrefix: process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 7)}...` : 'undefined',
  clientInitialized: !!genAI
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
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '設定あり' : '未設定'
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

app.use('/temp', express.static(TEMP_DIR));

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

// メッセージイベントを処理する関数
async function handleEvent(event) {
  console.log('イベント処理開始:', JSON.stringify(event));
  
  if (event.type !== 'message') {
    console.log('メッセージイベント以外なので処理しません');
    return Promise.resolve(null);
  }

  if (event.message.type === 'text') {
    // 受信メッセージ
    const userMessage = event.message.text;
    console.log('受信メッセージ:', userMessage);
    
    if (userMessage.startsWith('画像:') || userMessage.startsWith('image:')) {
      const prompt = userMessage.substring(userMessage.indexOf(':') + 1).trim();
      console.log('画像生成リクエスト:', prompt);
      
      try {
        const imageUrl = await generateImage(prompt);
        console.log('画像生成成功:', imageUrl);
        
        return client.replyMessage(event.replyToken, {
          type: 'image',
          originalContentUrl: imageUrl,
          previewImageUrl: imageUrl
        }).catch((error) => {
          console.error('画像送信エラー:', error);
          throw error;
        });
      } catch (error) {
        console.error('画像生成エラー:', error);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `画像生成エラー: ${error.message}`
        });
      }
    }
    
    // デバッグ情報の準備
    const debugInfo = {
      time: new Date().toISOString(),
      geminiKey: process.env.GEMINI_API_KEY ? '✅' : '❌',
      lineKey: process.env.LINE_CHANNEL_ACCESS_TOKEN ? '✅' : '❌'
    };
    
    // キーワードに基づいた応答生成
    let responseText = '';
    
    // デバッグコマンドの処理
    if (userMessage.toLowerCase().includes('debug')) {
      responseText = `デバッグ情報:\n
- 時刻: ${debugInfo.time}\n
- Gemini API: ${debugInfo.geminiKey}\n
- LINE API: ${debugInfo.lineKey}\n
- ノードバージョン: ${process.version}\n
- 環境: ${process.env.NODE_ENV || 'development'}`;
      console.log('デバッグ情報を送信:', responseText);
    }
    // テストコマンドの処理
    else if (userMessage.includes('テスト')) {
      responseText = 'テスト成功！正常に動作しています。';
      console.log('テスト応答を送信');
    }
    // 天気に関する質問
    else if (userMessage.includes('天気')) {
      responseText = '今日は晴れの予報です。気温は20度前後で、運動日和には最適な一日ですよ！';
      console.log('天気情報応答を送信');
    }
    // グリーティングコマンドの処理
    else if (userMessage.includes('こんにちは') || userMessage.includes('おはよう') || userMessage.includes('こんばんは')) {
      responseText = `こんにちは！今日もよろしくお願いします。\n何かお聞きしたいことはありますか？`;
      console.log('グリーティング応答を送信');
    }
    else {
      try {
        if (!genAI) {
          responseText = '[デバッグ情報] Gemini APIキーが設定されていません。環境変数GEMINI_API_KEYを設定してください。';
          console.log('Gemini AIクライアント未初期化のため固定応答を返信:', responseText);
        } else {
          console.log('Gemini AIを使用して応答を生成します');
          responseText = await generateGeminiResponse(userMessage);
          console.log('Gemini AI応答を受信:', responseText);
        }
      } catch (error) {
        console.error('Gemini AI応答生成エラー:', error);
        responseText = `[デバッグ情報] Gemini APIエラー: ${error.message}`;
        console.log('エラーメッセージを返信:', responseText);
      }
    }
    
    // 応答が長すぎる場合は切り減らす
    if (responseText.length > 2000) {
      responseText = responseText.substring(0, 1997) + '...';
      console.log('応答が長すぎるため切り詰めました');
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
  
  console.log('テキストメッセージ以外のイベントなので処理しません');
  return Promise.resolve(null);
}

async function generateGeminiResponse(userMessage) {
  try {
    // リクエストの詳細ログ出力
    console.log('\n\n********** GEMINI API CALL START **********');
    console.log('ユーザーメッセージ:', userMessage);
    console.log('NODE_VERSION:', process.version);

    if (!genAI) {
      const errorMsg = 'Gemini AIクライアントが初期化されていません。GEMINI_API_KEYが設定されているか確認してください。';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // APIキーの詳細確認
    if (!process.env.GEMINI_API_KEY) {
      const errorMsg = 'GEMINI_API_KEYが設定されていません。環境変数を確認してください。';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // APIキーの形式確認 - 安全なsubstring呼び出し
    console.log('API Key形式:', process.env.GEMINI_API_KEY ? (process.env.GEMINI_API_KEY.substring(0, 10) + '...') : '未設定');
    
    console.log('Gemini AI Client Info:', {
      initialized: !!genAI,
      hasAPIKey: !!process.env.GEMINI_API_KEY
    });

    // APIにリクエストを送信
    console.log('APIリクエスト送信開始...');
    
    try {
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
      
      console.log('APIレスポンス受信成功!');
      console.log('レスポンス構造:', response ? JSON.stringify(response, null, 2).substring(0, 200) + '...' : '空のレスポンス');
      
      // 応答テキストの取得
      if (response && response.response) {
        const reply = response.response.text().trim();
        console.log('Gemini AI応答テキスト:', reply);
        return reply;
      } else {
        const errorMsg = 'Gemini AIからの応答データが不正です: ' + JSON.stringify(response);
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (apiError) {
      console.error('Gemini API呼び出しエラー:', apiError);
      throw apiError;
    }
  } catch (error) {
    console.error('\n*** GEMINI API ERROR ***');
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Error stack:', error.stack);
    
    throw error;
  }
}

/**
 * Imagen APIを使用して画像を生成する関数
 * @param {string} prompt - 画像生成のためのプロンプト
 * @returns {Promise<string>} - 生成された画像のURL
 */
async function generateImage(prompt) {
  try {
    if (!genAI) {
      throw new Error('Gemini AIクライアントが初期化されていません');
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEYが設定されていません');
    }

    console.log('画像生成開始:', prompt);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('画像生成APIリクエストがタイムアウトしました（30秒）')), 30000);
    });
    
    const model = genAI.getGenerativeModel({ model: "imagen-3.0-generate-002" });
    
    const translationModel = genAI.getGenerativeModel({ model: "gemini-pro" });
    const translationPrompt = `以下の日本語テキストを、画像生成AIのための英語プロンプトに翻訳してください。できるだけ詳細に翻訳し、画像生成に適した表現を使ってください。翻訳のみを返してください。\n\n${prompt}`;
    
    console.log('翻訳リクエスト送信...');
    const translationResponse = await translationModel.generateContent(translationPrompt);
    const englishPrompt = translationResponse.response.text().trim();
    console.log('翻訳結果:', englishPrompt);
    
    console.log('Imagen API呼び出し開始...');
    
    const imageRequest = {
      prompt: englishPrompt,
      responseFormat: 'url'
    };
    
    const imageRequestPromise = model.generateContent(imageRequest);
    const response = await Promise.race([imageRequestPromise, timeoutPromise]);
    
    if (!response || !response.response) {
      throw new Error('画像生成に失敗しました: レスポンスが空です');
    }
    
    const imageResult = response.response;
    const imageData = imageResult.candidates[0].content.parts[0];
    
    if (!imageData || !imageData.inlineData || !imageData.inlineData.data) {
      throw new Error('画像データが見つかりません');
    }
    
    const base64Data = imageData.inlineData.data;
    
    const timestamp = Date.now();
    const imagePath = path.join(TEMP_DIR, `image_${timestamp}.png`);
    fs.writeFileSync(imagePath, Buffer.from(base64Data, 'base64'));
    
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    console.log('Using BASE_URL:', baseUrl);
    const imageUrl = `${baseUrl}/temp/image_${timestamp}.png`;
    
    console.log('画像生成成功:', imageUrl);
    return imageUrl;
  } catch (error) {
    console.error('画像生成エラー:', error);
    throw new Error(`画像生成に失敗しました: ${error.message}`);
  }
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
