# BP-5：候補A専用OAuth登録の作成前・読み取り専用調査

Date: 2026-10-18 / Status: 読み取り調査。登録・認可・トークンE2Eは未実施。

## 1. 範囲と方法

対象はdev441827（Australia、既存のリリース観測による）。Chromeの既存ログインセッションで
Machine Identity Consoleの既存登録とREST API Auth Scopes一覧を参照し、公式資料と照合した。
リリースの再取得、候補A本人でのログイン、APIの実効権限試験は今回行っていない。

[専用OAuth設計書](BEST_PRACTICE_BP5_PER_USER_OAUTH_DESIGN.md)の作成前ゲートに対する調査であり、
成功したOAuth E2Eや最小権限の実証として数えない。

- 既存ServiceNow SDKのAuthorization Code詳細、Public Client/Redirect URLのヘルプ、Advanced optionsを参照。
- メニュー検索からREST API Auth Scopesへ移動し、未フィルター一覧の件数と列名を確認。
- 入力値・チェックボックスは変更せず、New/Create/Save/Update/認可操作は実行していない。
- 登録作成、トークン発行、アカウント/ロール/ACL/設定変更は行っていない。
- client ID/secret、token、code、cookie、コード本文は本記録に収録しない。既存登録は流用しない。

## 2. PDIで観測した事実

| 項目 | 観測 | 証拠の限界 |
|---|---|---|
| Authorization Code | 既存ServiceNow SDK登録にAuthorization code grantの詳細画面あり | 専用新規登録の保存成功ではない |
| Public Client | This is a public clientがオン。ヘルプはsecret検証を省略しPKCE flowを使うと説明 | PKCEなし等の要求を実際に拒否した証拠ではない |
| PKCE S256 | 閲覧したinbound詳細/Advanced optionsにはS256専用の設定を確認できなかった | プラットフォーム全体に設定が存在しないという断定ではない |
| Redirect URLs | 既存値は相対パス`/sdk-oauth.do`。ヘルプは絶対URL・カンマ区切りと説明 | 既存値とヘルプの差を一般化せず、提案URIの受理は未確認とする |
| スコープ限定 | Auth scope欄、API関連付け欄、Allow access only to APIs in selected scopeが存在。既存登録では同チェックがオン、scopeはuseraccount | useraccountは広い特別scope。オンというだけでGET限定とはいえない |
| APIスコープ関連付け一覧 | REST API Auth Scopesの未フィルター表示が0件。method/resource/versionへの一括適用、Disable client restriction等の列あり | 閲覧主体から見える一覧の観測。全レコード/ACL/ポリシーの完全な棚卸しではない |
| 寿命 | Access token lifespan (seconds)欄の既存値1800、Refresh token lifespan欄あり | 900秒以下の保存可否・実発行寿命・refresh発行有無は未検証 |
| 別の制限設定 | Advanced optionsにEnforce token restrictionが存在し、既存値はオフ | scope限定チェックとは別項目。意味や拒否動作を同一視しない |

## 3. 公式仕様の照合

参照日は2026-10-18。公式一次資料のみを根拠とし、検索本文のfamily表示と直接URLの表示を区別する。

| 根拠 | 該当箇所・確認内容 | 留保 |
|---|---|---|
| [Configure an OAuth authorization code grant](https://www.servicenow.com/docs/r/platform-security/authentication/configure-an-oauth-authorization-code-grant.html) | 公式検索本文はAustralia・2026-03-12更新。Before you beginにoauth_admin/mi_admin/admin、ProcedureにMachine Identity Consoleからの設定経路 | ロールの必要条件を候補AのAPI権限と混同しない。新規保存は未実施 |
| [Authorization Workflow](https://www.servicenow.com/docs/r/platform-security/authentication/authorization-workflow.html) | Public Client - PKCEの認可表にSHA-256 challengeとmethod=S256、交換表にcode_verifier | 直接本文も取得したがAustralia固定URLの取得は失敗。汎用URLのfamily固定を保証せず、PDIのS256強制の実証にはしない |
| [Configure REST API Auth scope](https://www.servicenow.com/docs/r/platform-security/authentication/configure-rest-api-auth-scope.html) | 公式検索本文はAustralia・2026-03-12更新。HTTP Method/Version/Resourceの指定とTable API GET限定の構成例 | 表/列/レコード単位の制限やPDIでの有効化を保証しない |
| [REST API Auth Scope](https://www.servicenow.com/docs/r/platform-security/authentication/rest-api-auth-scope.html) | 公式検索本文はAustralia・2026-03-12更新。useraccountの特別扱いと、保護追加による既存tokenへの影響 | 共有APIの変更は既存利用への影響審査・別承認が必要 |

outbound用「Connect to a third-party OAuth provider」のCode challenge method設定は、
今回のinbound登録でS256を強制できる証拠として採用しない。
古い公式ブログのlocalhost HTTP例も、Australiaの固定loopback IP URIの受理実績にはしない。

## 4. 未確認事項と次の判断

1. **S256強制**：plain、challengeなし、不正verifierの拒否。欄/ヘルプ/仕様の存在だけでは完了にしない。
2. **ループバック受理**：`http://127.0.0.1:18765/bp5/oauth/callback`の保存可否、認可時の完全一致、
   別port/path/hostの拒否。今回入力・保存・認可は試していない。
3. **専用GET scope**：既存の適切なmappingは確認できず。新設するなら共有APIへの影響、
   他client、未scoped API、unversioned URL/一覧/単一取得への適用を審査する。
4. **トークンの実効制限**：GET以外・対象外APIの拒否と既存ACLの維持。
   実レコードを変更しない拒否試験の設計と別承認が先。広いtokenで試験を代替しない。
5. **寿命・本人性・引渡し**：短寿命の保存/発行、本人確認の固定GET、安全なメモリ内token供給は未検証/未実装。

結論：基本設定UIの存在は確認したが、専用登録の作成可能性・S256強制・loopback受理・
読み取り専用tokenは未実証。作成/発行ゲートは未完了のまま維持する。
本記録は将来の登録作成・認可・設定変更の実行許可ではない。
