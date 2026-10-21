# Portal widget scripting権限境界の回帰検証（2026-10-22）

## 原因・対象

`create_portal_widget` / `update_portal_widget` は `requireWrite()` だけで `sp_widget` の実行可能な定義を保存していた。
`WRITE_ENABLED=true`、`SCRIPTING_ENABLED=false` でも、公開済みツールからserver/client script・templateをTable APIへ渡せた。
実際の保存はServiceNow側のACL、実行はウィジェットの表示・操作等に依存し、ACL迂回や即時実行を主張するものではない。

## alias・template確認

| 操作 | 受理して転送するフィールド | 保存時の扱い |
|---|---|---|
| create | `server_script` | native `script`へ変換 |
| create | `client_script`, `template` | 同名で保存 |
| update | `script`, `client_script`, `template` | 同名で保存 |
| update | `server_script` | `script`へ変換。両方ある場合は従来どおりfriendly aliasを優先 |

createのnative `script`引数は従来から公開スキーマになく転送もしない。今回、新たなaliasとしては追加していない。
updateのallowlistは維持し、未宣言フィールドの拒否も維持する。

公式資料：[Tutorial: Build a custom widget](https://www.servicenow.com/docs/r/platform-user-interface/service-portal/adv-widget-tutorial.html)、参照日2026-10-22。
取得本文の表示は **Brazil / Updated September 10, 2026**。Australia指定URLでは本文を取得できなかったため、Australia実機での再現確認とは扱わない。
該当節は「Add a server script to query an instance table」と「Embed an existing widget」。HTML template内のAngularディレクティブからserver更新やclient側処理を呼ぶ例があり、templateを受動的な文字列として除外できないことを確認した。
この根拠はtemplateも権限境界に含める判断に使用し、任意のHTMLやscriptタグが必ず実行されるとの保証には使用しない。

## 修正方針・互換性

- 両操作の入口で `requireScripting()` を呼ぶ。同helperは最初に `requireWrite()` も実行するため、両方が文字列 `true` の場合だけ書込みに進む。
- 内容や真偽値・aliasの検出ではなく、操作全体をTier 3にする。scriptなし・空値・templateのみ・名前/CSSのみの変更にも適用する。
- metadataだけをTier 1に残す条件分岐案も確認したが、今回はウィジェット定義の作成/更新を一つのauthoring境界とする。**従来WRITEのみで可能だったmetadata-only更新と空widget作成も拒否する意図的な互換性変更**として、ツール説明とTOOLS.mdに明記した。
- 許可された呼出しのフィールドmapping、alias優先順位、空文字列によるクリア、結果summaryは変更しない。
- 一覧・取得は引き続きTier 0。通常portal/page作成のTier 1も変更しない。
- 隣接するwidgetコピー経路 `clone_artifact` は既にscriptingを要求していることを確認した。未対応のImport Set汎用宛先の問題を、この修正で解消したとは扱わない。

## 回帰テスト

- 修正前RED：WRITE有効・SCRIPTING無効でtemplateだけを指定する作成が成功し、拒否テストが失敗した。
- 修正後：create/updateの全script表現・templateを拒否。updateでは非空文字列・空文字列・null・undefinedを確認。
- Angularイベント/式・埋込みwidget・静的HTMLを区別せず、templateの変更には同じ権限を適用する。
- metadata-only作成/更新もSCRIPTING無効なら拒否。SCRIPTINGのみ有効でWRITE無効なら `WRITE_NOT_ENABLED`。
- 拒否時はServiceNowへのcreate/update/read/queryを行わないことを確認。
- public `executeTool` dispatchからも同じ拒否を確認。
- 両権限有効なら作成/更新、alias変換、両aliasの優先順位、空値クリア、metadata-only操作が成功する。
- 両権限無効でもwidgetの一覧/取得は可能。既存portal/page操作、closed schema、権限helper、routerテストも実行。

## コマンドと結果

```text
bdo npm run build
bdo npx vitest run tests/tools/portal.test.ts tests/tools/permissions.test.ts tests/tools/schema-hardening.test.ts tests/tools/router.test.ts
bdo npx eslint src/tools/portal.ts tests/tools/portal.test.ts
bdo git diff --check
```

build成功、対象4ファイル109テスト成功、ESLint error 0（portal.tsの既存any警告7件）、diffチェック成功。
独立したread-onlyレビューでも、対象範囲の具体的な残存バイパス・意図しない退行は見つからなかった。

### 全体テストの初回失敗を含む記録

`bdo npm test`：122ファイル中120成功、3,198テスト成功・2失敗。

- `r2-approval-manifest.test.ts`：期限切れ承認の拒否理由が、期待した `approval_expired` でなく `manifest_untrusted`。
- `soft-deadline.test.ts`：第2解析の開始フラグが、期限までに1にならなかった。

両ファイルだけの再実行 `bdo npx vitest run tests/review/r2-approval-manifest.test.ts tests/review/soft-deadline.test.ts` は74テストすべて成功。
対象のreviewソース/テストはHEADから未変更（`bdo git diff --exit-code HEAD -- src/review tests/review` 成功）。
並列負荷の影響が疑われるが、単独成功だけで根本原因を断定せず、初回失敗を消さない。
製品の期限・設定・対象外ソースは変更せず、worker数を抑えた全体再実行を別に確認する。

再実行 `bdo npm test -- --maxWorkers=2`：**122ファイル・3,200テストすべて成功**（39.82秒）。
これは制限した並列度での成功であり、通常並列実行の2失敗が解消したという主張ではない。

## 未実施・範囲外

PDI/ServiceNowへの操作・設定変更は行わず、API境界はmockによる合成検証のみ。
公式Web資料は参照したが、対象ウィジェットをブラウザで表示・実行してはいない。
既存の完了済みスキャンと指摘・証拠・履歴は変更しない。
