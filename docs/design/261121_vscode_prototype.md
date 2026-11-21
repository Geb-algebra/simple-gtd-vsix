# Simple GTD の VS Code 拡張 試作

- Status: Proposed
- Date: 2026-11-21

## 目的

**既存の SPA を VS Code のサイドバーに載せ、ワークスペースの Markdown と接続する。**
[拡張の実装計画](261121_vscode_extension.md)の最初の反復で、パネルの切替、3 ファイルの読み込み、Inbox への追記を通して接続を検証する。

## 現在の決定

### 仕様

#### Markdown の保存形式

**保存先は対象ワークスペースフォルダー直下の `_tasks/` とする。**
`inbox.md` に未分類項目、`tasks.md` に Next Actions・Someday・Waiting for・Do at、`log.md` に日別の完了項目を置く。
各項目は通常の箇条書きとし、Do at の指定日は行末の `@YYYY-MM-DD` で表す。
ログの日付節は `## YYMMDD` で表す。

### 設計

#### サイドバー UI

**VS Code のサイドバーでは既存の `spa/` を使う。**
Inbox・TODOs・TADAs は実装済みの[縦並びパネル](261121_sidebar_panels.md)で切り替える。

## 重要な代替案

### Markdown のチェックリスト

- 対応する決定: [Markdown の保存形式](#markdown-の保存形式)
- Alternative: Markdown のチェックボックスで未完了と完了を記録する。
- 棄却根拠: 保存形式は通常の箇条書きに統一することが決まった。完了済み項目はログへの所属で表す。

## 未決事項

**試作では、同じ画面コンポーネントを Webview 用の Vite エントリーから読み込む。**
画面遷移には React Router のメモリルーターを使い、表示中のパスは Webview の状態に保持する。
メッセージ経由で拡張ホストが Markdown を読み込み、Inbox への追加を書き込む。
保存済みファイルの作成・変更・削除を監視して画面を再読み込みする。
VS Code 上での表示と操作感を確認したうえで、この接続方式を採用するか決める。

**この反復で保存に接続する操作は Inbox への追加である。**
分類移動・編集・完了・後回し・Undo/Redo・Project の保存と実行、複数ファイルの同時更新、VSIX の導入確認は今後の反復で扱う。
