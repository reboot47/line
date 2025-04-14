'use strict';

// 必要なモジュールをインポート
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

const TEMP_DIR = process.env.NODE_ENV === 'production' 
  ? '/tmp/temp' 
  : path.join(__dirname, 'temp');

console.log('Using TEMP_DIR:', TEMP_DIR);

if (!fs.existsSync(TEMP_DIR)) {
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log('Successfully created directory:', TEMP_DIR);
  } catch (error) {
    console.error('Error creating directory:', error);
  }
}

// LINEクライアントと Express アプリケーションを作成
const client = new line.Client(config);
const app = express();

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/temp', express.static(TEMP_DIR));

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
      if (event.type !== 'message') {
        continue;
      }
      
      if (event.message.type === 'text') {
        const userMessage = event.message.text;
        console.log('Received text message:', userMessage);
        
        if (userMessage.startsWith('画像:') || userMessage.startsWith('image:')) {
          const prompt = userMessage.substring(userMessage.indexOf(':') + 1).trim();
          console.log('画像生成リクエスト:', prompt);
          
          try {
            const imageUrl = await generateImage(prompt);
            console.log('画像生成成功:', imageUrl);
            
            await client.replyMessage(event.replyToken, {
              type: 'image',
              originalContentUrl: imageUrl,
              previewImageUrl: imageUrl
            });
            
            console.log('画像返信成功');
          } catch (error) {
            console.error('画像生成エラー:', error);
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: `画像生成エラー: ${error.message}`
            });
          }
          continue;
        }
        
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
  console.log(`Gemini API Key設定状態: ${process.env.GEMINI_API_KEY ? '設定あり' : '未設定'}`);
});
