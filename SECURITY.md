# セキュリティポリシー

## 脆弱性の報告

**公開 Issue には投稿しないでください。**

セキュリティ上の問題を発見した場合は、以下のいずれかの方法で非公開報告をお願いします:

- **GitHub Security Advisory**: [https://github.com/tedorigawa001/ServiceNow-MCP/security/advisories/new](https://github.com/tedorigawa001/ServiceNow-MCP/security/advisories/new)
- **Email**: セキュリティ担当者へ直接連絡（リポジトリの CODEOWNERS 参照）

報告には以下を含めてください:
- 脆弱性の説明と影響範囲
- 再現手順（可能な場合は PoC）
- 影響を受けるバージョン
- 提案する修正（任意）

報告受領から **5 営業日以内** に返信し、**90 日以内** に修正リリースを目指します。

---

## セキュリティ設計

### デフォルト: 最小権限

```
WRITE_ENABLED=false          # デフォルト: 書き込み操作はすべて無効
CMDB_WRITE_ENABLED=false     # CMDB 更新も無効
SCRIPTING_ENABLED=false      # スクリプト実行も無効
NOW_ASSIST_ENABLED=false     # AI/Now Assist も無効
ATF_ENABLED=false            # ATF テスト実行も無効
```

書き込み機能は環境変数で**明示的に有効化**する必要があります。デフォルトでは読み取りのみ動作します。

---

### 入力バリデーション

#### テーブル名バリデーション (`validateTableName`)
URL パスにテーブル名を渡す前に正規表現で検証します:

```
正規表現: /^[a-zA-Z][a-zA-Z0-9_]*$/
例: "incident" ✅  "incident;drop--" ❌  "../etc/passwd" ❌
```

#### クエリインジェクション防止 (`validateQuery`)
ServiceNow のエンコードクエリに埋め込まれる `javascript:` 式を **許可リスト方式** で制限します:

```
許可: javascript:gs.beginningOfToday()  ✅
許可: javascript:gs.daysAgo(7)          ✅
拒否: javascript:new GlideRecord(...)   ❌
拒否: javascript:gs.sleep(...)          ❌
最大長: 4096 文字
```

#### orderBy フィールドバリデーション (`validateOrderByField`)
ソート指定に演算子やインジェクションが混入しないよう検証します:

```
正規表現: /^[a-zA-Z][a-zA-Z0-9_.]*$/
例: "opened_at" ✅  "priority^ORDERBY" ❌
```

#### LIKE 値のサニタイズ (`sanitizeLikeValue`)
自然言語検索などでフリーテキストを LIKE クエリに渡す前に、エンコードクエリ区切り文字を除去します:

```typescript
value.replace(/[\^]/g, '').replace(/\0/g, '')
// "keyword^ORmalicious" → "keywordORmalicious"
```

---

### 認証

| 方式 | 推奨場面 | 設定 |
|------|---------|------|
| OAuth 2.0 | 本番・サービスアカウント | `SERVICENOW_OAUTH_CLIENT_ID` / `SERVICENOW_OAUTH_CLIENT_SECRET` |
| Per-User | ユーザー ACL を適用する環境 | `authMode: "per-user"` |

- 認証情報はコード内に一切書かれません
- OAuth アクセストークンはメモリ内でのみ保持 (有効期間 90% でリフレッシュ)
- Basic Auth はサポート対象外です

---

### マスアサインメント防止

`create_incident` など書き込みツールは、受け取ったすべての引数をそのまま API に渡しません。**明示的な許可フィールドリスト**でフィルタリングします:

```typescript
const ALLOWED_FIELDS = new Set([
  'short_description', 'description', 'urgency', 'impact', 'priority',
  'category', 'subcategory', 'assignment_group', 'caller_id',
  'cmdb_ci', 'location', 'contact_type', 'watch_list',
]);
const safeData = Object.fromEntries(
  Object.entries(args).filter(([key]) => ALLOWED_FIELDS.has(key))
);
```

---

### API パスバリデーション

`callNowAssist()` および `callApiGet()` は、エンドポイントパスが `/api/` で始まることを強制します。任意のホスト URL へのリクエストを防ぎます。

---

## 本番環境でのチェックリスト

```
[ ] WRITE_ENABLED=true にする場合は用途を限定し、最小権限サービスアカウントを使用
[ ] SCRIPTING_ENABLED=true は開発環境のみ。本番では原則 false
[ ] OAuth 2.0 を使用し、Basic Auth は避ける
[ ] 定期的に OAuth クライアントシークレットをローテーション
[ ] MCP_TOOL_PACKAGE で不要なツールを露出させない
[ ] instances.json に平文パスワードを保存しない (シークレット管理ツールを使用)
[ ] npm audit を定期実行して依存パッケージの脆弱性を確認
```

---

## 既知の制限事項

| 制限 | 詳細 |
|------|------|
| スクリプト実行 | `SCRIPTING_ENABLED=true` かつ適切な ServiceNow ロールがある場合、サーバーサイドスクリプトを実行可能。本番では無効にすること |
| AI 判断の精度 | LLM による自然言語解釈は 100% 正確ではない。重要操作は実行前に確認すること |
| テーブル ACL | ServiceNow 側の ACL がバイパスされることはないが、サービスアカウントに過剰な権限がある場合はアクセス範囲が広くなる |
| ログ | デフォルトのログレベルでは API レスポンスボディは出力されないが、`DEBUG` レベルでは含まれる可能性がある |

---

## 依存関係のセキュリティ

定期的に `npm audit` を実行してください。主要な依存関係:

| パッケージ | バージョン | 備考 |
|-----------|-----------|------|
| `@modelcontextprotocol/sdk` | ^1.29.0 | MCP プロトコル実装 |
| `vitest` | ^4.1.8 | GHSA-5xrq-8626-4rwp (任意ファイル読み取り) は 4.1.0+ で修正済み |
| `zod` | ^3.x | 入力スキーマ検証 |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2025-06 | テーブル名インジェクション・クエリインジェクション・マスアサインメントの修正 |
| 2025-06 | vitest 4.1.8 へ更新 (GHSA-5xrq-8626-4rwp 修正) |
| 2025-06 | `callApiGet()` 追加、PA ウィジェット API の GET/POST 誤用を修正 |
