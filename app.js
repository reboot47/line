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

// Webhookエンドポイント
app.post('/webhook', (req, res) => {
  // 常に200を返すようにする
  try {
    console.log('Webhook called - headers:', JSON.stringify(req.headers));
    console.log('Webhook called - body exists:', !!req.body);
    if (req.body) {
      debugLog({ body: req.body });
    }
    
    // Webhook検証や空のリクエストの場合
    if (!req.body || !req.body.events || req.body.events.length === 0) {
      console.log('Webhook verification or empty request');
      return res.status(200).send('OK'); // 検証には空の200レスポンス
    }
    
    // メッセージを処理
    Promise.all(req.body.events.map(handleEvent))
      .then((result) => {
        console.log('Successfully processed events');
        return res.status(200).json(result);
      })
      .catch((err) => {
        console.error('Error processing events:', err);
        return res.status(200).send('OK'); // エラーでも常に200を返す
      });
  } catch (error) {
    console.error('Unexpected error in webhook handler:', error);
    return res.status(200).send('OK'); // 予期せぬエラーでも200を返す
  }
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

  // 特定のキーワードの場合は即度応答
  if (receivedMessage.includes('こんにちは')) {
    replyMessage = 'こんにちは！今日も素敵な一日ですね！';
  } else if (receivedMessage.includes('おはよう')) {
    replyMessage = 'おはようございます！素晴らしい朝ですね！';
  } else if (receivedMessage.includes('おやすみ')) {
    replyMessage = 'おやすみなさい！良い夢を見てくださいね。';
  } else {
    try {
      // ChatGPTを使用して応答生成
      replyMessage = await generateChatGPTResponse(receivedMessage);
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
    }
  }
  
  // 応答が長すぎる場合は切り詰め
  if (replyMessage.length > 2000) {
    replyMessage = replyMessage.substring(0, 1997) + '...';
  }

  // メッセージを返信
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyMessage,
  });
}

// ChatGPTを使用して応答を生成する関数
async function generateChatGPTResponse(userMessage) {
  try {
    // リクエストのログ出力
    console.log('ChatGPT APIにリクエスト中:', userMessage);
    
    // APIキーが設定されているか確認
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEYが設定されていません');
      return '申し訳ありませんが、現在APIが利用できません。後ほどお試しください。';
    }

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
    const reply = response.choices[0].message.content.trim();
    console.log('ChatGPT応答:', reply);
    return reply;
  } catch (error) {
    console.error('ChatGPT APIエラー:', error);
    throw error;
  }
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
