# USEM読み取りE2E — 2026-10-14

対象: dev441827 PDI。実際のServiceNowクライアントを使い、MCPサーバーが
呼び出す公開ツール実行関数から読み取りを検証した。書き込み・AI実行なし。

## 結果

| スイート | 成功 | スキップ |
|---|---:|---:|
| 新規USEM設定・パラメーター | 33 | 4 |
| 既存USEM読み取り | 17 | 0 |
| 合計 | 50 | 4 |

失敗0件、所要約53秒。スキップはclassification_rule／exclusionの詳細対象が
存在しない2件と、definition／instanceの非空秘密値がない2件。
マスキングテストは追加済みだが、実機での非空値マスキングは未検証。
以前スキップされていたVI／RT／グループのSLA詳細4ケースは今回は成功。

通常テスト1,632件（62ファイル）とビルドは成功。新しいE2EファイルのLintは
警告・エラーなし。既存の設定実装・ユニットテストにはany型の警告20件が残る。

## 検証対象

- 全16ルール種別の一覧、上限、レコードID、詳細との一致、sys_idとactiveによる絞り込み。
- `get_risk_calculator_details`: sys_id／完全一致名の結果一致、ルール→計算グループ、
  リスクフィールド→ルール、スコア重み→対象テーブルの参照関係。
- `list_integration_parameters`: definition／instance両スコープと親による絞り込み、
  `password_value`非返却、非空の秘密項目が`***MASKED***`になること。
  秘密値をアサーションやテストログに出力しない。
- 既存USEM読み取りスイート（SLA、承認、通知、連携履歴など）の回帰確認。

## 同時に修正した不具合

- 通常の文字列までカンマ順序を無視していた保存比較を修正。
  順序を無視するのは既知のリスト項目`applies_to`だけ。
- `set_usem_rule_active`に読み戻し検証を追加。
  要求したactiveが保存されなければ`FIELDS_NOT_SAVED`を返す。
- 実機にデータが入ったことで、`list_remediation_sla`がsys_idを返していない
  不具合が発覚。VI／legacy RT／グループの一覧にsys_idを追加し、詳細取得へ接続。

上記は修正前の失敗を確認した回帰テストで検証した。前二者はユニットテストで
確認し、実機でルールを有効化するテストは行っていない。

## 実行方法

PDIのOAuth設定を用意し、次を実行する。

```bash
RUN_E2E=true WRITE_ENABLED=false SCRIPTING_ENABLED=false \
  npx vitest run -c vitest.e2e.config.ts \
  tests/e2e/usem-config-read.e2e.test.ts tests/e2e/usem-read.e2e.test.ts
```

適切なプラグイン／レコードが存在しないケースだけを理由付きでスキップする。
API・ACL・保存値の不一致をスキップへ変換しない。
