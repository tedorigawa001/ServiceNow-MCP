# BP-5：専用Authorization Code登録・ロール境界・トークン管理設計

Version: draft-0.3 / Date: 2026-10-18 / Status: 設計案・実装/運用承認前。

本書は登録作成・認可・トークン発行・アカウント/ロール/ACL作成・設定変更の実行許可ではない。
別記のG0はローカル合成試験のみで、アカウント/ロール/ACL、既存OAuth登録、共有API保護、
MCP接続設定は変更しない。既存service-accountのdev接続とは分離し、根拠不足を権限付与や別認証で補わない。

## 0. 方式の決定：読み取り境界は利用者ロールで強制する（方式R、2026-10-18）

利用者の判断により、GET限定を**トークンのscopeではなく、検証用利用者のロール/ACLで**サーバー側に強制する。

- **REST API Auth Scope、API Access Policy、共有Table APIの設定は作成・変更しない。**
  REST API Auth Scopeを付けると、そのscopeを持たない既存OAuthが当該APIへアクセスできなくなる
  （公式資料R5、Australia・2026-03-12更新の本文で確認）。方式Rはこの共有影響を発生させない。
  useraccount関連の8登録、関連なしの有効Client3件、外部OIDC、Basic/mTLS利用者のいずれにも設定変更は及ばない。
- トークンの実効権限は**検証用利用者のロール/ACLそのもの**。scopeによる二重防御は得ない。
  トークン流出時は、その利用者が持つ権限が有効期限まで使われ得る。短寿命・メモリ保管（§7）で軽減する。
- 読み取り専用はクライアント側でも維持する。BP-5の取得は固定GET・3テーブル・bounded上限のみ（既存実装）。
  ただしクライアント側の制限はトークン流出後の権限を制限しない。サーバー側の境界はロールだけである。
- 候補A（46ロール保持、admin/security_adminなし）は、最小権限の主張に使えるロール構成ではないため、
  本PoCの検証主体から外す。検証は**専用の検証用利用者**（以下「検証利用者」）で行う（§5）。
- [G1読み取り棚卸し](E2E_BEST_PRACTICE_OAUTH_G1_INVENTORY_2026-10-18.md)は、共有変更を避ける判断の根拠として保持する。
  同記録§4.2–4.3のdashboard/telemetry調査（ServiceNow側の実装・PDI固有の問題）は、方式Rの判断を変えないため打ち切る。
  「このPDIではアプリ別の利用統計を取得できない」を結論とし、3登録の利用実績・担当者の特定はG1の完了条件から外す。

## 1. 目的と前提

**検証利用者**本人の認証で、既存Update Set`9055f6338c9503100a22deb6dd2b4ead`への読み取り可否、
専用ロールが対象2表へのreadだけを追加するロール構成、BP-5の安全側停止（リリース未観測時のC方式を含む）を確認する。
検証利用者は一般の内部利用者の権限も持ち得るため、利用者全体の読み取り専用・最小権限は確認対象にしない（§5.2）。
氏名/ユーザー名/メールは記録しない。sys_idも識別情報であり匿名化値ではない。

以下は方式Rの決定前に、候補A（sys_id `06f97342c37030009b5efcfc5bba8fc3`）について行った観測の記録である。

前回の読み取り観測（2026-10-18、dev441827 / Australia）：

- 候補Aはactive・ロックなし。sys_user_has_roleの個別照会で一意46ロール、継承行を含む47行を観測。
  admin/security_adminなし。これはログイン時のACL評価結果ではなく、候補本人の可視性は未検証。
- 現行devのOAuth登録client001はClient Credentials。構成のclient ID一致はboolだけで照合した。
  Public Clientはオフ、Redirect URLは従来画面で空表示。PKCE値は当該grant画面では未確認。
  scope=useraccount、Enforce token restrictionはオフ。Authorization Code利用可能とは判定しない。
- 別用途のAuthorization Code登録が5件あるが、標準/別統合の登録を流用しない。
- ブラウザーの通常UIは参照できたが、Table APIへの直接ナビゲーションは未認証として拒否された。
  ブラウザーのログイン成功をOAuth APIの成功と同一視せず、cookie/CSRF情報を抽出して代替しない。

専用登録の作成前に行った追加の[読み取り専用調査記録](E2E_BEST_PRACTICE_OAUTH_READINESS_2026-10-18.md)：

- 既存ServiceNow SDK登録のAuthorization Code画面でPublic Clientオンを観測。
  ヘルプは「client secret検証を省略しPKCEを使用」と説明する。既存登録は流用・変更しない。
- Redirect URLs欄と絶対URL・カンマ区切りの説明を確認。ただし提案loopback URLの入力/保存/認可は未実施。
- S256は公式仕様に記載されるが、当該inbound画面でS256専用の強制設定は確認できず、
  plain/PKCEなし/不正verifierの拒否動作も未検証。outbound OAuthの設定項目を証拠に流用しない。
- Allow access only to APIs in selected scopeの設定欄あり。既存登録ではオンとuseraccountを観測するが、
  これをGET限定の証拠にしない。REST API Auth Scopesの未フィルター一覧は表示0件。
  全ACL/別経路/ポリシーの網羅確認ではなく、利用可能な既存GET mappingを確認できなかったという意味。
- Access token lifespan (seconds)欄（既存値1800）を確認。900秒以下の保存可否・実発行寿命は未検証。

設定欄の存在、公式仕様、保存時の受理、認可/拒否動作は別の証拠として扱う。
今回の調査で実行開始ゲートを完了扱いにしない。

S256強制・loopback受理・GET限定の[最小検証/共有API影響・復旧計画](BEST_PRACTICE_BP5_OAUTH_MINIMAL_VALIDATION_PLAN.md)は
未承認・未実行の手順案。作成・発行・共有設定変更を段階別に承認し、403/404だけをscope拒否の証拠にしない。
G0の[ローカル合成ハーネス検証](E2E_BEST_PRACTICE_OAUTH_G0_2026-10-18.md)は完了したが、
実PDIへの接続・本人確認・実MCPへのtoken供給は未実装、登録作成/発行ゲートは未完了。

[G1読み取り棚卸し](E2E_BEST_PRACTICE_OAUTH_G1_INVENTORY_2026-10-18.md)では、Auth Scope定義2件、
API-scope関連の表示0件、OAuth-scope関連9行/8登録、REST APIポリシー4件、scope関連なしの有効Client3件を観測した。
これは、共有Table APIへscope/policyを追加した場合の影響候補の記録である。方式Rでは共有設定を変更しないため、
3登録の利用実績・担当者の特定や、dashboard/telemetryの不具合調査（同記録§4.1–4.3）は本PoCの前提から外した。
[maint担当者向け証拠取得計画](BEST_PRACTICE_BP5_TELEMETRY_MAINT_EVIDENCE_PLAN.md)も方式Rの決定により保留とする。
これらの記録は、将来共有APIの保護を別途検討する場合の参考として残す。

## 2. 登録案と責任分離

| 項目 | 第一案 | 未確認/承認条件 |
|---|---|---|
| 識別名 | BP5 Candidate A - Authorization Code PoC（仮称） | 専用登録。作成許可は別途必要 |
| 接続先 | `https://dev441827.service-now.com`だけ | 再割当・ホスト変更時は失効扱い、再承認 |
| grant | Authorization Codeのみ | Client Credentials/Password/Implicitへの切替なし |
| クライアント種別 | ネイティブ公開クライアント、PKCE必須、client secretを保持しない | PDIのPublic Client欄とPKCEのヘルプは確認済み。S256強制/降格拒否は未検証 |
| 実行主体 | 検証利用者本人のログイン・同意 | サービスアカウント固定ユーザー、impersonation、パスワード共有は使わない。§5のロール構成以外を付与しない |
| callback | `http://127.0.0.1:18765/bp5/oauth/callback` | loopback HTTP許容・完全一致登録をPDIで確認。未登録の設計値 |
| scope | 専用scopeを作らない。REST API Auth Scope/API Access Policyを変更しない | 実効権限は検証利用者のロール/ACL（§0、§5）。登録に関連付けるscopeの実際の値と発行tokenのscopeは記録するが、GET限定の根拠にしない |
| token寿命 | 検証用に短くする。15分以下を承認候補とする | per-clientの寿命入力欄は確認済み。900秒以下の保存/実発行寿命は未検証。全体プロパティは変更しない |
| refresh | 初回PoCは使用・保管・自動更新しない | サーバーが返す場合も保存しない。発行済み状態が残る可能性を別途管理 |

運用者が登録・寿命・検証利用者のロール構成を承認し、検証利用者本人がログイン/同意する。実行担当はパスワードを扱わない。
公開クライアントが成立しない場合は停止する。秘密クライアントへの変更は自動代替せず別設計/承認とする。

## 3. コールバック受信

RFC 8252 §7.3/§8.3を根拠に、localhost名ではなくloopback IPを採る（根拠R1）。
固定portは今回のPoCで登録値を明確にするプロジェクト判断で、RFCが固定portを要求するという意味ではない。
RFC 8252 §7.3/§8.4はloopback redirectのport差を許容する。サーバーが別portを受理しただけで
安全性不合格にせず、ハーネス自身が固定port以外へ自動代替しないこととは分けて検証する。
18765固定・競合時停止の方針は維持するが、PDIがportを含む完全一致を強制するかは未検証。
保存済みURIと同じ値を要求/交換へ渡すクライアント方針と、サーバーが別portを拒否するかという実測を区別する。

- listenerを127.0.0.1:18765へ先にbindし、成功後だけブラウザーを開く。0.0.0.0、LAN、公開トンネルへ公開しない。
- 競合時は停止。他port/localhost/IPv6へ黙って変更しない。PDIがこのURIを拒否してもTLS検証を緩めない。
- path・Host・GETを固定し、追加path、過大なURL（提案8KiB）、重複code/state/error、形式不正を拒否。
  Hostは127.0.0.1:18765だけ。Origin等からHost検査を代替しない。CORSを開放しない。
- clientが開始した1トランザクションだけを扱う。state不一致の要求では交換せず、認可待ちも乗っ取らせない。
- 有効な応答は1回だけ処理。state一致のOAuth errorは固定理由で終了し、error_description/URIを出力しない。
- 認可待ちは提案5分で打切り、listenerとstate/verifierを破棄。成功/失敗/キャンセルでも終了を待つ。
- callbackのquery、code、state、リクエスト全文をアクセスログへ残さない。
  応答はno-store/referrer-policy:no-referrerの汎用完了画面とし、外部画像/解析/スクリプトを読み込まない。
  完了時に履歴のURLからqueryを除く設計とするが、ブラウザー等の全履歴消去を保証しない。
- callback URLをコピーしてチャット/CLIへ貼る方式は採らない。今回のURIで既存CLIを動かせるという意味でもない。

## 4. PKCE・state・交換の契約

公開クライアントPKCEとstateの必要項目は根拠R2/R3、以下の期限や停止条件は本PoCの設計判断。

1. 毎回CSPRNGの32byteから独立したstate（hex 64文字）とverifier（base64url、43文字）を作り、メモリだけに置く。
2. challengeはverifierのSHA-256をbase64url化し、method=S256を明示。plain/PKCEなしへの降格は禁止。
3. 認可URLは固定PDIの/oauth_auth.do、response_type=code、専用client ID、完全一致redirect_uri、
   登録で許可されたscope、state、challengeだけを組み立てる。URLをログ/チャットへ出さず、外部ブラウザーで検証利用者本人が操作する。
   方式Rではscopeを実効権限の根拠にしない（§5）。要求したscopeは開始時に固定し、応答との対応を記録する。
4. 管理者cookieと分離したブラウザープロファイルで通常ログインする。ログイン不可なら停止し、パスワード変更しない。
5. callbackのstateを照合し、開始時のホスト/client/callback/scope/verifierと対応付ける。
   issuerパラメーターを使う場合の期待値は事前確認し、不一致は拒否。別ホストのissuer/token endpointへ追随しない。
6. /oauth_token.doへauthorization_code、code、同じredirect_uri/client ID、verifierをHTTPSで1回だけ送る。
   client secretは送らない。redirectは拒否、TLS検証は維持。提案10秒/応答64KiBの上限を設ける。
7. 交換のタイムアウト/結果不明では同じcodeを再送しない。トークンが既に発行された可能性を記録し、
   「発行なし」と断定しない。新規認可や失効操作は別承認を受ける。
8. token_typeは文字列であることを確認し、Bearerと大小文字を区別せず比較する設計とする（R7）。
   空でないaccess token、有効なexpires_in、要求scopeとの対応（拡大・不一致の検出）も検証する。
   scopeの追加/変更/省略をどう確認するかはPDI応答と公式仕様で確定するまで実装開始ゲートとする。
   JWTを未検証でdecodeしたsubだけでは本人性を判定しない。

ServiceNowの認可/トークンエンドポイントは外部PDIへの処理であり、トークン発行や同意記録を伴い得る。
後続の「読み取りE2E」の許可だけから、これらの実行許可を推定しない。

### 4.1 実PDIアダプターへの互換性上の注意（未実装）

- **token_type**：RFC 6749 §5.1/§7.1では大小文字を区別しない。実アダプターでは
  Bearer/bearer等を同じ型として比較する。ただし欠落/非文字列/未知の型/不要な空白は受理せず、
  token文字列そのものやscope名を小文字化しない。現G0は合成契約として`'Bearer'`完全一致のまま。
- **scope省略**：RFC 6749 §5.1では要求と同じ範囲なら応答scopeを省略できる。
  これは空scopeを要求してよいという意味ではない。実アダプターではG2以降の承認済み検証で
  ServiceNowの実応答、専用登録の許可scope、要求scopeとの対応を確かめ、
  省略時に要求範囲を実効scopeとして扱える条件と証拠を先に決める。
  接続先/client/要求scopeは開始時に固定し、明示応答の拡大/不一致/不明な範囲を黙って受理しない。
  GET成功だけで書込み不可や同一scope付与を証明したとしない。条件未確定なら安全側停止を維持する。
- **G0との区別**：G0はscope必須・完全一致を意図的に要求する合成テストであり、
  省略を拒否した結果はServiceNowやRFCの不適合判定ではない。今回G0のコード・42ケースは変更しない。
  実アダプターでは大小文字の違い、省略scopeの受理条件/拒否条件を別の合成テストにする。

上記は後続実装の設計条件であり、実PDIの応答や権限を検証済みにするものではない。

## 5. 読み取り境界：検証利用者のロール/ACL（方式R）

サーバー側の読み取り境界は、検証利用者に付与するロールと、それに対応するACLだけで作る。
REST API Auth Scope、API Access Policy、既存ロール/ACL、共有Table API設定は変更しない。
登録のscope（既定値・useraccountを含む）は実効権限の根拠にせず、実際の値を記録するだけとする。
これはscope保護から後退した「フォールバック」ではなく、§0で承認された方式の前提である。

### 5.1 PDIのACL観測（2026-10-18、AIによる読み取り照会。人の承認ではない）

dev441827（Australia）の`sys_security_acl`/`sys_security_acl_role`/`sys_user_role_contains`を読み取りで照会した。

| 対象 | 観測 |
|---|---|
| `sys_update_set` read（Allow If） | update_set_admin / teamdev_user / update_set_picker。Admin overrides=true |
| `sys_update_xml` read（Allow If） | update_set_previewer / upgrade_admin / teamdev_user / update_set_admin。Admin overrides=false |
| 両表のDeny Unless（read） | Security Attribute `UserIsAuthenticated`のみ。認証済み利用者なら通過する |
| 両表のフィールド単位read ACL | 有効なもの0件（`payload`等の列単位の追加制約は観測されなかった） |
| `update_set_picker`の全ACL | `sys_update_set` readの1件だけ。継承ロールなし、elevated=false |
| `update_set_previewer`の全ACL | `sys_update_xml` readに加え、**`sys_remote_update_set` read/write、`sys_update_preview_xml` read/write/delete、`sys_update_preview_problem` read/write/delete**。継承ロールなし、elevated=false |
| `sys_cluster_state` read | cluster_node_admin等（前回観測）。上記2ロールでは読めない見込み |
| `sys_user` read（Allow If） | `snc_internal`（Security Attribute `UserIsAuthenticated`）、または`public`＋script |
| `sys_user.*` read（Allow If、advanced） | `snc_internal`。説明は「利用者は自分の利用者レコードを読める。ロールを持つ利用者は他の利用者レコードも読める」 |
| `snc_internal`に紐づく有効なAllow If ACL | 997件。read 280、write 262、create 134、delete 114ほか。write/create/deleteを許すrecord ACLの対象表は359（`*`を含む）。各ACLのscript/条件で実効範囲はさらに絞られ得る |
| Explicit Rolesプラグインの有無 | `sys_plugins`の読取りが権限不足で拒否され、未確認 |

この観測はACL定義の照会であり、検証利用者でログインした実効アクセスの確認ではない。
（`sys_user`以下の4行は2026-10-18の追加照会。）
ドメイン分離・ACLのscript/条件・他のDeny Unless・キャッシュ等は実ログインの検証で確認する。

### 5.2 ロール構成案

| 案 | 付与するロール | 読める範囲 | 専用ロールが追加する書込み権限 | 変更の範囲 |
|---|---|---|---|---|
| **R-2（採用、2026-10-18）** | 新規の専用ロール1つ（仮`u_bp5_update_set_reader`、継承なし） | 新設する2件のAllow If read ACL（`sys_update_set`・`sys_update_xml`、当該ロールのみ）で両表 | なし（ただし下記の一般利用者の権限は残る） | 新規ロール・新規ACL2件・新規利用者。Allow If ACLの追加は当該ロール保持者へのreadを追加するだけで、他の利用者・既存OAuth/Basicのアクセスを変えない |
| R-1（不採用） | 既存の`update_set_picker`＋`update_set_previewer` | 両表 | **プレビュー表・リモートUpdate Set表への書込み/削除あり** | 新規利用者と既存ロールの付与だけ。ACLは作らない |

利用者の決定（2026-10-18）によりR-2を採用し、R-1は採らない。採用の決定は、専用ロール・ACL・検証利用者の
作成やsecurity_admin昇格の実行許可ではない（§8のゲートで個別に承認する）。

- **R-2の主張の範囲（2026-10-18訂正、案1）**：R-2で言えるのは「専用ロールはBP-5の対象2表へのreadだけを追加し、
  書込み権限を追加しない」までである。検証利用者そのものが書込み権限を持たないとは主張しない。
  Australiaでは、`snc_external`を持たない利用者はログイン時に`snc_internal`を暗黙に付与されるのが通常で
  （Explicit Rolesの有無は未確認）、その場合、検証利用者は一般の内部利用者の権限も持つ。§5.1のとおり
  `snc_internal`には359表へのwrite/create/delete系ACLがあり、自分の利用者プロファイルの更新や
  セルフサービスでの作成などが、各ACLの条件の範囲で可能になり得る。ロール不要・`public`のACLも同様に残る。
  したがって「最小権限を達成した」とは報告しない。
- `snc_internal`の暗黙付与は、本人確認（§6）の`sys_user`自己参照を、追加ロールなしで成立させる見込みの根拠でもある。
  これを外すため検証利用者を外部利用者（`snc_external`）にする案（案2）は、`sys_user`の読取不可や専用ロールの
  扱いが未検証のため採らない（2026-10-18、利用者の決定）。
- ACL作成にはsecurity_adminの昇格が必要で、作成・削除の承認と
  復旧（ACL・ロール・利用者の無効化/削除）を別途得る。ACLは追加だけで、既存ACLの編集・無効化はしない。
- R-1はACLを作らずに済むが、`update_set_previewer`の書込み権限が残る。PDIでのPoCとして受容するなら、
  「読み取り専用」ではなく「レビュー対象表は読み取りのみ、プレビュー/リモート表には書込み可」と報告する。
- いずれも`sys_cluster_state`は読めない想定。リリース証拠はC方式（運用者設定）へフォールバックし、
  BP-5は`asserted`の`partial`を返す。これは方式Rの欠点ではなく、C方式の実機確認を兼ねる。
  `cluster_node_admin`等の付与で補わない。
- 本人確認（§6）の`sys_user`自己参照は、暗黙の`snc_internal`により読める見込みだが、実ログインでは未確認。
  読めなければ本人性未確認として停止し、`snc_internal`の明示付与を含むロール追加は別途審査する。

### 5.3 クライアント側の制限と報告の範囲

検証ハーネスにもPDI固定・GET固定・表/fields/query固定ガードを置き、製品のBP-5上限を維持する。
ただしこのガードはトークン流出後の権限を制限しない。サーバー側の境界は§5.2のロール構成だけである。

- 「読み取り専用トークン」「最小権限」とは報告しない。報告は「専用ロールはBP-5対象2表へのreadだけを追加し、
  書込み権限を追加しない。検証利用者は一般の内部利用者（暗黙の`snc_internal`）の権限も持つ」とし、
  ロール/ACLの照会結果と、実ログインでの読取成功を別の証拠として記録する。
- 書込みが拒否されることを確かめるための変更method試験は行わない。実レコードを変更し得るため、
  専用ロールが書込みを追加しないことの根拠はロール/ACL構成の照会とする（§9の留保を参照）。
- 本書の目的でScripted REST、ACL迂回経路、既存ACLの編集を追加しない。

## 6. 本人性・MCPへの引渡し・C方式

固定GET候補・安全側停止・同一プロセスの不透明capabilityによる引渡し・終了時の参照破棄は
[方式R-2本人確認/token引渡し設計](BEST_PRACTICE_BP5_R2_IDENTITY_TOKEN_DESIGN.md)に具体化した。
内部sessionと同一プロセスMCPは[合成検証済み](E2E_BEST_PRACTICE_R2_IDENTITY_SYNTHETIC_2026-10-18.md)。
実OAuth交換/runnerとの接続は未実装で、固定GETの対象版/R-2での成立と実機操作の承認は別途必要。

- 取得後、同じtokenで実行ユーザーのsys_idを読み取り、検証利用者のIDとの一致だけを記録する。
  sys_user一覧の先頭、指定した検証利用者レコードが読めること、UIの表示名では本人性を証明しない。
  固定の現在ユーザー照会または承認済みの本人確認APIを実機で確認する。拒否/不明なら停止。
- 初期検証ハーネスは専用client、authMode=per-user、開始時にtoken/接続先を固定。
  401/失効でrefreshやservice-accountへ代替しない。HTTP MCP BearerとServiceNow tokenを混同しない。
- 同じ設定ID/ホストを使っても既存devを上書きしない。運用者設定は専用ID（仮bp5_candidate_a）でbindingを計算し直す。
  リリース証拠に候補本人の自己申告を使わず、運用者確認・期限・ファイル信頼検査を維持する。
- 新規トークンのまま、設定なし→有効C方式→期限/binding不正の順で確認する案とする。
  実測できた場合はresolvedとし、フォールバックできた実績として数えない。
- token取得後の内部session→同一プロセスMCP引渡しは合成検証済み。実PDIアダプター/runnerからの
  供給と実stdio/HTTPへの秘密引渡しは**未実装**。HTTPヘッダーや任意tool引数への追加はしない。
  同一プロセスSDKと既存tool executorの試験を、汎用サーバーの認証や実stdio/HTTPのper-user E2Eと混ぜない。

## 7. トークン保管・寿命・終了

**初回PoCの既定はメモリのみ**。access/refresh token、code、verifier、callback全文を
tokens.json、instances.json、.env、argv、シェル履歴、クリップボード、Git、ログ、スクリーンショットへ保存しない。
既存devのtoken storeへ書き込まない。デバッグ/トレース/HTTPキャプチャでもAuthorization/bodyを記録しない。

| 保管案 | 方針 |
|---|---|
| メモリ | 1認可・1候補・1PDIで固定。本人確認失敗/期限切れ/終了で参照を破棄しプロセス終了 |
| macOS Keychain | 再利用が必要と承認された場合だけの第二案。専用項目・最小アクセス、同期/エクスポートなし。非対話的安全読込・ACL仕様は未実装/要検証 |
| 平文ファイル | 初期PoCでは採用しない。0600でも暗号化にはならず、共有tokens.jsonの代替にしない |
| 環境変数 | 現行runtimeの受け口はあるが既定案にしない。同一UID/子プロセス/診断への露出があるため、使うなら別途リスク承認 |

Keychainを使う場合はorigin＋専用client識別子＋検証利用者sys_id＋用途でキーを分離し、期限/scope/本人確認結果も対応付ける。
登録名や単一hostだけで別ユーザーのtokenを上書きしない。OSの秘密保管/プロンプトの設定変更も別承認が必要。
同一UID/root/悪意あるプロセスを完全に隔離できるという保証はしない。

クライアント保持時間の提案上限は15分。実際のexpires_inから安全余裕を引いた期限と、早い方で使用を止める。
BP-5開始前に全体60秒を超える有効余裕を要求する。短いローカル保持時間はサーバー上の有効期限を短縮しない。
サーバーが承認済み上限より長寿命にしかできない場合は、受容/失効計画の承認が得られるまで発行しない。
JavaScriptの文字列を完全消去できるとは主張しない。メモリダンプ・クラッシュレポート等も運用上の秘密管理対象。
終了時はlistener/worker/同時実行枠を解放してプロセス終了。ローカル破棄はサーバー失効とは区別し、
token失効・同意取消・登録無効化は操作対象と権限を確認し、別承認後だけ実行する。

## 8. 現行CLIとの差分・実行開始ゲート

[auth.ts](../src/cli/auth.ts)は固定localhost:8765/callback、手動code入力、state/PKCE未接続、
不適切な本人照会、host単位tokens.json保存の経路を持つ。getStoredTokenはサーバー起動へ未接続。
本設計はこれを修正したという意味ではなく、現行auth login/whoamiを本PoCの本人性証拠に使わない。
既存CLIのログイン/ログアウトも実token storeを書換えるため今回実行しない。

作成/発行前のチェックリスト（すべて未承認/未実装事項を解消してから個別に実行許可を得る）：

- [ ] PDIのPublic Client＋S256必須設定、固定loopback callbackの受理を確認する方法を承認。
  Public Client欄/PKCEヘルプの読み取り確認のみ完了。保存・降格拒否・loopback受理は未完了。
- [ ] 新規専用登録の作成内容を承認。既存client001/標準登録/既存利用者のロールを変更しない。
- [x] 検証利用者のロール構成としてR-2を採用（2026-10-18、利用者の決定）。
- [ ] R-2の具体値（専用ロール名・Allow If read ACL 2件・検証利用者）、security_admin昇格、
  復旧（無効化/削除）の手順を承認。既存ACLは編集しない。
- [ ] REST API Auth Scope・API Access Policy・共有Table API設定を変更しないことを確認（方式R）。
- [ ] callback receiver、state/S256、期限、交換結果不明、安全なtoken引渡しを合成試験で確認。
  G0ではloopback合成issuerへの受信/交換/メモリ内利用/取消を確認。実PDI用アダプターと実MCP引渡しは対象外。
- [ ] 本人確認の固定GETが検証利用者で成立するか確認し、失敗時に停止する。
- [ ] サーバー寿命とローカル寿命を承認。refresh不使用、必要なら失効操作の対象/手順を別途承認。
- [ ] 検証利用者本人のログイン/同意、外部ブラウザー起動、token発行に実行時の承認を得る。
- [ ] C方式の運用者証拠・専用binding・期限と非公開設定配置を別途承認。

## 9. 根拠と未確認事項

参照日2026-10-18。公式一次資料のみ。記載された仕様と、PDIでの実現性・本プロジェクトの設計判断を区別する。

| ID | 根拠URL・該当箇所 | 使う範囲/制限 |
|---|---|---|
| R1 | [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3) §7.3、§8.3/§8.5 | 外部ブラウザー/loopback IP/ネイティブclientの秘密。PDIで当該callbackを受理する実績ではない |
| R2 | [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.1) §4.1–4.6 | verifier/challenge/S256と検証。候補アカウントの権限は規定しない |
| R3 | [ServiceNow Authorization workflow](https://www.servicenow.com/docs/r/platform-security/authentication/authorization-workflow.html) Public Client - PKCE、認可/交換の表 | 公式検索結果にAustraliaとS256/stateの記述。汎用/r URLの直接表示は別familyに切替わるため、作成前にAustralia本文/画面の再照合が必要 |
| R4 | [Configure REST API Auth scope](https://www.servicenow.com/docs/r/platform-security/authentication/configure-rest-api-auth-scope.html) Table APIの3構成例 | 方式Rでは使用しない。scope保護を将来別途検討する場合の参考 |
| R5 | [REST API Auth Scope](https://www.servicenow.com/docs/r/australia/platform-security/authentication/rest-api-auth-scope.html) Note / Configurations | Australia・2026-03-12更新の本文（2026-10-18にAIが参照）：scopeを付けたAPIへは、そのscopeを持たない既存OAuthがアクセスできなくなる。useraccountは保護されたAPIを含め任意のAPIへアクセスできる。APIにscope記録がなければ有効なOAuth登録はアクセスできる。方式Rを選んだ根拠（共有影響の回避）。人による再照合ではない |
| R6 | [Configure an OAuth authorization code grant](https://www.servicenow.com/docs/r/platform-security/authentication/configure-an-oauth-authorization-code-grant.html) Before you begin / Procedure / Details form | 追加調査の公式検索本文はAustralia・2026-03-12更新。設定経路とロールを確認。PDIでの新規保存成功を意味しない |
| R7 | [RFC 6749 §5.1](https://www.rfc-editor.org/rfc/rfc6749.html#section-5.1)、[§7.1](https://www.rfc-editor.org/rfc/rfc6749.html#section-7.1) | token_typeの大小文字非区別、要求と同じscopeなら応答で省略可。G0の厳格な合成契約とは別。ServiceNowでの省略/付与範囲の実証ではない |

loopback公開client、§5.2のロール構成、15分/5分/10秒等の提案値、Keychain保管は未検証の設計であり、
この文書をもって導入済み・安全性確認済み・最小権限達成とはしない。

方式Rの留保：専用ロールが書込みを追加しないことの根拠は、ロール/ACL構成の照会と、新設ACLの内容の確認である。
検証利用者は暗黙の`snc_internal`（Explicit Rolesの有無は未確認）や、ロール不要・`public`のACLによる
一般利用者の権限を持ち得る。ACLのscript・条件・ドメイン分離、他のロールに紐づく将来の変更、ACLキャッシュ等により
実効権限は変わり得る。変更methodの拒否を実リクエストで確かめる試験は、実レコードを変更し得るため実施しない。
したがって報告は「専用ロールは対象2表へのreadだけを追加する」に留め、検証利用者が書込み権限を持たない、
「書込みが拒否されることを実測した」、最小権限を達成した、とはしない。
