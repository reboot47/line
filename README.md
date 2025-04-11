# LINE Bot 開発環境

LINE Messaging APIを使用した基本的なLINE Botアプリケーションです。

## セットアップ手順

### 1. LINE Developersでチャネルを作成する

1. [LINE Developers Console](https://developers.line.biz/console/)にログイン
2. プロバイダーを選択（または新規作成）
3. 「新規チャネル作成」 > 「Messaging API」を選択
4. 必要情報を入力してチャネルを作成
5. 作成後、以下の情報を取得:
   - チャネルシークレット: 「Basic settings」タブで確認
   - チャネルアクセストークン: 「Messaging API」タブで発行

### 2. 環境変数の設定

`.env`ファイルに取得した情報を設定します:

```
LINE_CHANNEL_SECRET=your_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
PORT=3000
```

### 3. 依存関係のインストール

```bash
npm install
```

### 4. ローカル環境でのWebhook設定

ローカル環境で開発する場合、[ngrok](https://ngrok.com/)などのツールを使用して、ローカルサーバーを外部公開します。

```bash
# ngrokをインストールした場合
ngrok http 3000
```

ngrokが提供する転送URLをLINE DevelopersコンソールのWebhook URLに設定します:
`https://あなたのngrokURL/webhook`

### 5. サーバーの起動

```bash
npm start
```

開発モード（自動再起動機能付き）で起動する場合:

```bash
npm run dev
```

## 機能

このBotは以下の機能を持っています:
- 「こんにちは」「おはよう」「おやすみ」などの特定のメッセージに対する応答
- その他のメッセージに対するオウム返し応答

## カスタマイズ

`app.js`の`handleEvent`関数を編集することで、Botの応答をカスタマイズできます。
