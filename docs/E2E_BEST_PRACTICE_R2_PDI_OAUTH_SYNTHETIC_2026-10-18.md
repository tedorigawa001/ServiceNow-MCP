# BP-5 R-2：実PDI用OAuthアダプター単体の合成検証

Date: 2026-10-18 / Status: 内部PoCの単体合成検証。実PDI・実認可・実token発行は未実施。

## 1. 範囲

[接続設計draft-0.2](BEST_PRACTICE_BP5_R2_PDI_ADAPTER_RUNNER_DESIGN.md)のアダプター単体を
`src/review/r2-pdi-oauth.ts`へ実装した。公開MCP/CLI/server.tsへ登録せず、既存認証も変更していない。
telemetry調査・maint担当者への依頼は保留。PDI操作、アカウント/ロール/ACL/OAuth登録/設定変更はない。

全交換は信頼済みfetch境界に注入した合成応答のみ。外部PDIにHTTP要求を送っていない。
認可URLの生成とcallback request-targetの検査は行うが、HTTP待受・開始ページ・ブラウザー操作・
runner・実R2ReviewSessionへの接続は未実装。合成token文字列の生成を実token発行と数えない。

## 2. 実装した内部契約

- 開始前にcanonical HTTPS origin・client ID・scope集合を固定する。任意endpoint/redirect指定はない。
  token/秘密の公開getter・ファイル保存・env/argv渡し・refresh・自動再試行は実装していない。
- stateとverifierは独立した32 random bytes。固定`/oauth_auth.do`でS256を要求する。
  認可URLを信頼済み内部consumerへ1回だけ渡す。consumerの戻り値/例外は公開しない。
- callbackは固定loopback pathの相対request-targetのみ。state一致、許可query、重複なし、
  code/error排他を確認する。不正callbackは交換せず、正当なstateを消費しない。
  正規errorは固定理由で停止。正規codeは交換前に消費し、並行/再送は拒否する。
- 固定`POST /oauth_token.do`、form-urlencoded、client secret/cookieなし、redirect:error、
  credentials:omit、cache:no-store。標準fetchのTLS検証を無効にする経路はない。
- 交換10秒・解凍後64KiB。上限を下げるテスト注入だけを許し、実chunkの合計も検査する。
  非協調fetch/reader/consumerはAbortとの競合で待機を停止し、遅延応答のbodyもcancelする。
- 応答は200/JSON/正常UTF-8/object、重複キーなし（Unicodeエスケープ同名も拒否）。
  許可fieldはaccess_token/token_type/expires_in/scope/refresh_tokenのみ。
  Bearerの大小文字は同一視するが空白を救済しない。token自体を変更しない。
- expires_inは整数1–900。scopeは明示必須・承認済み集合との一致（順序非依存）、
  拡大/縮小/未知/重複/空/不正形式を拒否する。scope省略は本PoCの安全側停止であり、RFC不適合の主張ではない。
  refreshは文字集合/8192文字上限を確認して捨て、後段に渡さない。未知field/error混在も拒否する。
- `consumeToken`はbearerToken/expiresInSeconds/issuedAtだけを凍結した値として1回消費する。
  issuedAtは交換開始時の単調時刻で、寿命は5秒差し引く。残り60秒超のレビュー開始条件は既存sessionの責任。
  consumerの戻り値は結果に含めない。成功/失敗/取消/期限で内部参照・timer・外部Abort購読を除去する。
- 公開状態/JSON/inspectはphaseとhasCredentialだけ。失敗は固定理由のみ、原例外/cause/応答を返さない。
  通信timeout/通信断はexchange_outcome_unknown、受信済み形式不正はinvalid_token_responseとして分ける。

HTTP method/Host/body/raw header重複の検査は将来のlistener側の責任で、単体APIの試験で代替しない。
信頼済みconsumerに渡す文字列・HTTP実装のコピー・JS/OSメモリの完全消去は保証しない。
成功時cleanupがrunner root signalをAbortしないことは単体確認したが、実sessionへの移譲はまだ検証していない。

## 3. 合成試験

| 観点 | 確認内容 |
|---|---|
| 固定接続 | canonical HTTPSのみ、固定path/POST/loopback/client、secret/cookieなし、redirect拒否 |
| PKCE | verifier形式/長さ、SHA-256からchallengeの一致、認可ごとのstate/challengeの独立性、S256固定 |
| callback | 提示前/不正state/重複/未知query/code+error/空/別path/絶対URL/fragment/不正escape/過大を拒否、正規denialは交換なし |
| 一度限り | URLの再消費、交換中の並行呼出し、成功/失敗後の再交換、二重token消費を拒否 |
| 応答 | Bearer大小文字、scope集合一致、省略/拡大/縮小/重複/空白/型不正、寿命/文字集合/長さ、余分field/errorを検査 |
| JSON | 配列/null/HTML/構文不正/UTF-8不正/escaped重複キー/不正Content-Type/redirected successを拒否 |
| 受信量 | 64KiBちょうど成功・1byte超失敗、虚偽/不正Content-Lengthでも実chunk上限、cancelが非協調でも待たない |
| 通信 | HTTP 302/400/401/403/429/500、非協調fetch/readerのtimeout、通信断、遅延成功の破棄、再試行なし |
| 中断/寿命 | 事前cancel/交換中cancel/非協調consumer中cancel/認可待ち期限/token期限、先に確定した理由の保持 |
| 秘密/資源 | JSON/inspect/固定結果/stdout/stderrに合成秘密・認可URL/state/challenge非露出、外部購読/timer除去、root signalを誤取消しない |

新規99テストは回帰ケース数であり、独立ブラインド評価標本や実環境の安全性証明ではない。
固定済みの評価セット・期待値と既存G0 42件は変更していない。

## 4. 実行結果

```bash
bdo npm test -- tests/review/r2-pdi-oauth.test.ts tests/review/oauth-g0.test.ts tests/review/r2-session.test.ts tests/review/r2-mcp.test.ts
bdo npm run type-check
bdo npm run lint -- --quiet
bdo npm test
bdo npm run build
bdo npm run test:pack
bdo git -c core.fsmonitor=false diff --check
```

- 新規単体：1ファイル・99テスト成功。
- G0/R-2を含む対象回帰：4ファイル・181テスト成功。
- 全体回帰：105ファイル・2,645テスト成功（実機E2E・transport専用構成は含めない）。
- TypeScript型検査、ESLint、build、差分チェック成功。
- 梱包：361 files。本番依存だけのインストールと既定worker解析/集約・MCP smoke成功。
  既存`!dist/review/r2-*`と梱包試験により新アダプターも非同梱。依存/配布設定は変更していない。

追加境界テストで3件の失敗を再現した。認可URL consumerを直接awaitしていたため中断時に戻らない点を
Abort競合へ変更。本文通信例外を形式エラーにしていた点を通信結果不明へ分離。
client IDのRegExp.testがundefinedを暗黙変換していた点を明示的な型検査で拒否し、再実行した。

初回梱包試験はsandboxからnpmキャッシュへ書けずEPERMで停止した。所有者/権限は変更せず、
許可された環境で同じ試験を再実行して成功。npmの一般的なroot所有の説明を実原因と断定しない。

## 5. 未確認・次工程

1. 承認manifestのschema/安全な読込、実行承認ゲート。現config型は内部用で、利用者のtool引数ではない。
2. 固定HTTP待受・Host/method/body検査、一度限りの開始ページ・HTML/CSP・bind競合。portは変更不可。
3. adapter→R2ReviewSession→固定GET→permit→MCPの接続。別アカウントcode注入の合成ケースで
   identity_mismatch後に取得へ進まない試験を含む。単体の交換成功は本人性の証明ではない。
4. runnerの全体期限・OS signal・worker終了/cleanup・終了票・発行済み可能性/refresh残存の扱い。
   通信結果不明や取消は「未発行」を意味しない。自動失効/新規認可/同じcodeの再送は行わない。
5. 実PDIのPublic Client/S256/loopback/応答/寿命/本人確認ACL・C方式。承認後の別工程であり、今回未実施。

ローカル参照破棄をサーバー失効と報告しない。実装・合成成功を実認可や実機操作の許可として扱わない。
