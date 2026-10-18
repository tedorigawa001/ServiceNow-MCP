# BP-5 方式R-2：固定GET本人確認・メモリ内token引渡し

Version: draft-0.2 / Date: 2026-10-18 / Status: 内部PoCを実装・合成検証。実機/運用は未承認・未検証。

[実装・合成検証記録](E2E_BEST_PRACTICE_R2_IDENTITY_SYNTHETIC_2026-10-18.md)を参照。
交換後の内部session/同一プロセスMCPまでの部分実装で、実OAuth交換・runner/OS終了処理は未接続。

未接続部分の責任分離・交換応答・所有権移譲・開始ページ・OS終了処理は
[実PDI OAuthアダプター/runner接続設計](BEST_PRACTICE_BP5_R2_PDI_ADAPTER_RUNNER_DESIGN.md)に具体化した。
同設計のアダプター単体は[合成検証](E2E_BEST_PRACTICE_R2_PDI_OAUTH_SYNTHETIC_2026-10-18.md)済み。
sessionへの接続・runner/HTTP待受は未実装で、実機操作やtoken発行を許可しない。

## 1. 範囲と不変条件

[専用OAuth設計§0・§5–7](BEST_PRACTICE_BP5_PER_USER_OAUTH_DESIGN.md)を具体化する。
telemetry調査・maint担当者への依頼は保留を維持する。本書は実機操作・登録/利用者/ロール/ACL作成・
token発行・実装の実行許可ではない。既存のG0合成ハーネスも変更しない。

- 専用利用者・専用OAuth登録・固定PDI・1認可単位。R-2は専用ロールと新設read ACL 2件を採用する設計で、
  作成は未承認。候補Aや既存service-accountを代用しない。
- OAuth交換後の同じaccess tokenで本人確認し、成功後だけレビューへ渡す。
  JWTの未検証sub、ブラウザー表示名、指定利用者レコードの可視性だけでは本人確認しない。
- token、本人ID、接続先、専用clientの対応を開始時に固定する。変更は新しい承認済み認可単位とし、
  実行途中のtoken差替え・refresh・service-account/impersonationへのフォールバックを禁止する。
- 本人確認とC方式リリース確認は独立したゲート。片方の成功で他方を省略しない。

## 2. 信頼済み開始コンテキスト

呼出し側のtool引数ではなく、実行担当が承認した非秘密の計画から、正規化済みHTTPS origin、
専用clientの識別情報、期待する検証利用者sys_id、固定Update Set、許可規則、C方式の設定参照を固定する。
期待sys_idは承認済み利用者レコードの対応表から取得し、本人確認応答やJWTから逆に設定しない。
sys_idは識別情報であり公開結果には出さず、対応表は承認済み非公開領域で管理する。

開始に必要な情報が不足/不正なら認可へ進まない。任意URL・任意query・任意expected_user・
tokenを利用者のMCP入力として受け取る口は追加しない。

## 3. 本人確認の固定GET（採用候補・実機成立は未確認）

| 項目 | 固定する値/条件 |
|---|---|
| origin | 承認済みPDIのHTTPS origin。URL内のユーザー情報・追加path/query/hashを拒否 |
| method/path | `GET /api/now/table/sys_user`のみ |
| `sysparm_query` | 定数`sys_id=javascript:gs.getUserID()`。URLSearchParamsで符号化し、入力文字列を連結しない |
| `sysparm_fields` | `sys_id`のみ |
| その他 | `sysparm_limit=2`、`sysparm_display_value=false`、`sysparm_exclude_reference_link=true`、`sysparm_suppress_pagination_header=true` |
| 認証 | 交換直後のaccess tokenによるAuthorization Bearer。AcceptはJSON。cookie・impersonationヘッダーなし |
| 取得上限（設計値） | 1要求・再試行なし・総時間10秒・解凍後本文64KiBまで。読取り途中も上限/Abortを監視 |
| 接続制御 | redirect拒否、TLS検証維持、共有cookie jarなし、応答をログ/キャッシュへ保存しない |

`gs.getUserID()`は**サーバーで認証された現在の利用者**を求める目的の定数式。
任意スクリプトを実行する機能や、既存CLIの`sys_idINSTANCEOF`を流用する設計ではない。
limit=2は複数件を検知するためで、先頭1件を採用しない。

受理条件はすべて必須：

1. HTTP 200、JSON Content-Type、上限内の正常JSON。JSONは重複キーを拒否する方針とし、
   クエリ/認証/解析のエラーを成功へ読み替えない。
2. トップレベルは`result`だけを持つオブジェクト。resultは配列でちょうど1件、
   レコードは`sys_id`だけ、値は小文字16進32桁の文字列。display-valueオブジェクト等は受理しない。
3. sys_idが開始前の期待sys_idと完全一致する。同じtoken/origin/clientであることを内部コンテキストで維持する。
4. 期限・キャンセル・終了状態を応答受理直前にも検査する。

このGETのsys_user自己参照、固定式の評価、最小フィールド返却がAustralia/R-2で成立するかは未検証。
公式の一般的なクエリ例だけでは証明しない。不正queryの無視やACLによる行の不可視もあり得るので、
実機承認時には対象版の仕様と挙動を確認し、可能なら別主体の既存承認済み証拠/対照で
「指定レコードを読むだけではない」ことを確認する。そのための追加token発行は別承認とする。
評価成立の根拠が得られなければ、この経路は未承認のまま停止する。
別の本人確認APIが必要なら別設計とし、API探索やACL/ロール追加で黙って継続しない。

**ACL定義からの見込み（2026-10-18、AIによる読み取り照会。実ログインでは未確認）**：
`sys_user`のreadは`snc_internal`、`sys_user.*`は`snc_internal`で、説明は「利用者は自分のレコードを読める。
ロールを持つ利用者は他の利用者レコードも読める」。検証利用者はログイン時に暗黙の`snc_internal`を得るのが通常で
（Explicit Rolesの有無は未確認、[設計§5.1–5.2](BEST_PRACTICE_BP5_PER_USER_OAUTH_DESIGN.md)）、自己参照は追加ロールなしで成立する見込み。

- 検証利用者はR-2の専用ロールを持つため、上記説明どおりなら**他の利用者レコードも読める**。
  したがって固定式`sys_id=javascript:gs.getUserID()`が無視・誤評価された場合、2件以上が返り`limit=2`で
  `identity_unconfirmed`として止まる見込み。PDIでは不正な条件が黙って無視されることを観測済み
  （[対象選択契約§6.1](BEST_PRACTICE_BP5_TARGET_SELECTION_CONTRACT.md)）なので、この検知は必須とする。
- 逆に、可視の利用者が自分1件だけになる構成では、条件が無視されても1件だけ返り得るため、
  「固定式が評価された」ことの証拠にはならない。実機では、この区別ができる構成であることを
  記録してから本人確認の成立を判断する。
- 自己参照が読めない場合に`snc_internal`を明示付与するかは、設計§5.2のとおり別途審査とする。

本人確認はBP-5実行前の独立した固定GETであり、製品のbounded取得にsys_userを追加しない。
レビュー開始後の3テーブル・100件・受信量・全体60秒・worker中断の既存上限は変更しない。

## 4. 失敗時停止と出力契約案

| 状態 | ローカルハーネスの固定理由（新規案） | 後続 |
|---|---|---|
| 401/403 | `identity_access_denied` | レビュー未開始、refresh/別資格情報へ代替しない |
| 404・空結果・複数件・不正形式/余分なフィールド | `identity_unconfirmed` | レビュー未開始。空結果を未知ユーザー/ACL拒否と決め付けない |
| 期待ID不一致 | `identity_mismatch` | レビュー未開始。期待/実IDも出力しない |
| redirect・5xx・通信失敗 | `identity_request_failed` | 自動再試行なし |
| サイズ超過・時間切れ・cancel・寿命不足 | `identity_budget_exceeded` / `cancelled` / `token_expired` | 未完了リクエストをAbort、終了処理へ |
| リリース不明/不一致 | 既存BP-5の固定失敗理由 | 本人確認成功でもmetadata/payloadの取得許可を発行しない |

上記identity理由は**ハーネス用の設計案**で、既存の0.2/0.3 JSON契約へ追加したという意味ではない。
公開報告は段階、固定理由、本人一致bool、件数/時間、未確認範囲だけ。
HTTP原応答・例外のmessage/cause・ヘッダー・入力値を固定理由に埋め込まない。
失敗/中断後は認可待ちへ自動で戻らず、成功したような空レビュー結果も作らない。

## 5. メモリ内引渡しとMCPの境界

初回PoCは同一Nodeプロセスに閉じる内部の認可セッションを設計する。

`交換 → メモリ保持 → 固定GET本人確認 → verified capability → MCP call → bounded取得/worker解析 → 終了`

- tokenは非列挙のプライベート状態に保持。sessionは発行時点、単調時計の期限、origin/client/期待利用者、
  AbortControllerと状態を持つ。dump/JSON化/custom inspectで値を出さず、token取得用の公開getterを作らない。
- 本人確認成功時だけ、内部のオブジェクト同一性で検証する不透明capabilityを発行する。
  token、本人IDの入った文字列やシリアライズ可能な自己申告オブジェクトをpermitにしない。
  別セッション/複製/期限切れ/終了後のcapabilityは拒否する。
- 信頼済み内部bridgeがcapabilityに対応するtokenを専用のper-user clientへ一時供給する。
  `authMode=per-user`を明示し、開始前後にorigin/token/期限を固定。既存共有client・instance registryを変更しない。
  1セッション1レビュー同時実行までとし、実行中のswitch_instanceや別toolへの流用を認めない。
- SDKの同一プロセスInMemoryTransportによるMCP list/callと既存レビューexecutorを通す内部PoCを実装した。
  専用接続に私的なセッションコンテキストを関連付け、本人確認前のcallをbridgeで拒否する。
  共通サーバーへの認証バックドア/新規tool引数/HTTPヘッダーは追加しない。
  内部bridgeは既存のレビューtool executorへ接続する専用SDK Serverとして実装した。
  汎用server.tsを読み込まず、汎用サーバーの認証/登録は変更しない。
- `withUser({bearerToken})`や`createBoundedReadSession()`は既存接続点の候補だが、前者は共有状態を
  shallow copyする実装である。呼ぶだけで秘密の寿命・本人性・全参照の解放が保証されるとはしない。
  callback、client、snapshot、HTTP request、同時実行管理等に残る参照の所有者と破棄を実装前に列挙する。
- workerには既存の解析入力だけを渡し、token/本人ID/OAuth設定をworkerData・message・envへ渡さない。
  ServiceNow tokenとMCP自体の認証/ローカルtool権限を混同しない。R-2ロールをMCPの権限名へ自動変換しない。

この経路の成功は「同一プロセスMCP＋実PDI認証」の検証であり、実stdio/HTTP経由のper-user秘密供給の
実証ではない。既存stdio/HTTP E2Eは上流合成という範囲を維持する。
別プロセスへtokenを渡す必要が生じたら、argv/env/一時ファイルに退避せず別のIPC設計・承認へ戻る。

## 6. 寿命・秘密非出力・終了時の破棄

ローカル寿命は交換要求開始時の単調時計を基準に、検証済みexpires_inと15分の小さい方から
安全余裕5秒を引く案とする。交換/本人確認に使った時間も消費する。期限延長や時計の巻戻しで復活させない。
レビュー開始前に残り時間が既存の全体60秒を厳密に上回ることを要求し、途中失効はAbortで止める。
C方式設定の有効期限は別途`expires_at > started_at + deadline_ms`を要求する既存契約を維持する。

- access/refresh token、code、state、verifier、認可URL/callback全文をログ・結果・argv/env・ファイル・
  tokens.json/instances.json・クリップボードへ出さない。tokenのハッシュ/接頭辞/長さも報告しない。
- stdout/stderr、SDKエラー、例外、request/responseの診断は固定の段階/理由へ変換する。
  code本文非露出の既存方針も維持する。ログ/通信キャプチャ/クラッシュ収集で秘密を捕捉しない運用が前提。
- refresh tokenが返っても保持・利用しない。メモリから参照を外すことと、サーバー側の発行/失効状態は別。
- 成功・失敗・cancel・期限切れ・SIGINT/SIGTERMを同じ冪等な終了経路へ集約する。
  新規利用停止→capability失効→全要求Abort→worker終了/レビュー枠解放→MCP接続/サーバー終了→
  callback listener/タイマー/イベント購読解除→全所有者のtoken/code/verifier等への参照を破棄→プロセス終了。
  Abort後に遅延応答が届いても結果を採用しない。cleanup待ちは有限とし、強制終了時は未確認を記録する。
- JS文字列のゼロ化やOSメモリからの完全消去は保証しない。SIGKILL/クラッシュ時の正常cleanupも保証しない。
  core dump等の既存運用が秘密非出力要件を満たせなければ開始を止め、OS設定を勝手に変更しない。
- token失効・同意取消・登録無効化は別承認。プロセス終了だけでサーバーtokenが失効したとは報告しない。

## 7. 後続の合成試験と承認ゲート

以下の内部session/同一プロセスMCPの範囲は合成試験で確認した（上記記録）。
実OAuth/runnerとの接続、実機承認ゲートは未完了のまま。

1. 固定GETの完全一致、Bearer同一性、fields/limit、redirect拒否、上限、TLS方針。任意query/URL追加を拒否。
2. 0/2件、ID不一致、表示値形式、余分なキー、重複キー、不正JSON、HTML、401/403/5xx、timeoutの安全側停止。
3. 未確認/別セッション/複製/期限切れcapabilityでレビューが一度も開始しない。release gateも独立に拒否する。
4. token差替え・refresh・service-accountへの代替なし。同時実行拒否、確認後/取得中/worker中のcancelと期限切れ。
5. SDK list/call経由の本人確認済みセッションだけが既存dispatchへ到達し、worker/結果/例外/出力に秘密マーカーなし。
6. 成功/失敗/中断の資源解放、再利用拒否、遅延応答破棄。G0と固定評価セットの互換性を維持。

実機前の未解決ゲート：固定GETの意味/自己参照ACL/対象版での成立、Public Client/S256/loopback、
token_type・scope省略の受理条件、R-2の作成/復旧、サーバー寿命、本人ログイン/同意、C方式設定。
G0の合成試験だけではこれらを満たさず、ロール追加や共有scope/policy変更で補わない。

## 8. 根拠と確認限界

参照日2026-10-18。公式検索本文で、[REST APIsのsysparm_query説明](https://www.servicenow.com/docs/r/api-reference/rest-api-explorer/c_RESTAPI.html)は
現在ユーザーを条件にする`caller_id=javascript:gs.getUserID()`の例を示す。
[GlideSystem getUserID()](https://www.servicenow.com/docs/r/api-reference/server-api-reference/c_GlideSystemAPI.html)は
現在ユーザーのsys_idを返すと説明する。これらを組み合わせたsys_user固定GETは本プロジェクトの設計判断。
Australia固定URLの本文は今回取得できず、family固定の再照合とR-2実機確認は未完了である。

接続点はローカルの`src/servicenow/client.ts`、`src/servicenow/bounded-read.ts`、
`src/review/bounded-source.ts`を読んで確認した。内部session/bridgeは実装したが、
公開CLIや既存HTTP/stdioへの秘密供給・実PDI本人確認が完了したとはしない。
