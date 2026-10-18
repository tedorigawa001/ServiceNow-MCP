# BP-5：候補A専用Authorization Code登録・トークン管理設計

Version: draft-0.2 / Date: 2026-10-18 / Status: 設計案・実装/運用承認前。

本書は登録作成・認可・トークン発行・設定変更の実行許可ではない。
今回の成果物は文書のみ。アカウント/ロール/ACL、既存OAuth登録、共有API保護、MCP接続設定は変更しない。
既存service-accountのdev接続とは分離し、根拠不足を権限付与や別認証で補わない。

## 1. 目的と前提

候補A（sys_id `06f97342c37030009b5efcfc5bba8fc3`）本人の認証で、既存Update Set
`9055f6338c9503100a22deb6dd2b4ead`への読み取り可否とBP-5の安全側停止を確認する。
氏名/ユーザー名/メールは記録しない。これらのsys_idも識別情報であり匿名化値ではない。

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

## 2. 登録案と責任分離

| 項目 | 第一案 | 未確認/承認条件 |
|---|---|---|
| 識別名 | BP5 Candidate A - Authorization Code PoC（仮称） | 専用登録。作成許可は別途必要 |
| 接続先 | `https://dev441827.service-now.com`だけ | 再割当・ホスト変更時は失効扱い、再承認 |
| grant | Authorization Codeのみ | Client Credentials/Password/Implicitへの切替なし |
| クライアント種別 | ネイティブ公開クライアント、PKCE必須、client secretを保持しない | PDIのPublic Client欄とPKCEのヘルプは確認済み。S256強制/降格拒否は未検証 |
| 実行主体 | 候補A本人のログイン・同意 | サービスアカウント固定ユーザー、impersonation、パスワード共有は使わない |
| callback | `http://127.0.0.1:18765/bp5/oauth/callback` | loopback HTTP許容・完全一致登録をPDIで確認。未登録の設計値 |
| scope | 専用GET用scope（仮名 `bp5_review_read`）だけ | §5の実現性/共有影響を確認するまで作成・関連付けしない |
| token寿命 | 検証用に短くする。15分以下を承認候補とする | per-clientの寿命入力欄は確認済み。900秒以下の保存/実発行寿命は未検証。全体プロパティは変更しない |
| refresh | 初回PoCは使用・保管・自動更新しない | サーバーが返す場合も保存しない。発行済み状態が残る可能性を別途管理 |

運用者が登録・scope・寿命を承認し、候補A本人がログイン/同意する。実行担当はパスワードを扱わない。
公開クライアントが成立しない場合は停止する。秘密クライアントへの変更は自動代替せず別設計/承認とする。

## 3. コールバック受信

RFC 8252 §7.3/§8.3を根拠に、localhost名ではなくloopback IPを採る（根拠R1）。
固定portは今回のPoCで登録値を明確にするプロジェクト判断で、RFCが固定portを要求するという意味ではない。

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
   専用scope、state、challengeだけを組み立てる。URLをログ/チャットへ出さず、外部ブラウザーで候補A本人が操作する。
4. 管理者cookieと分離したブラウザープロファイルで通常ログインする。ログイン不可なら停止し、パスワード変更しない。
5. callbackのstateを照合し、開始時のホスト/client/callback/scope/verifierと対応付ける。
   issuerパラメーターを使う場合の期待値は事前確認し、不一致は拒否。別ホストのissuer/token endpointへ追随しない。
6. /oauth_token.doへauthorization_code、code、同じredirect_uri/client ID、verifierをHTTPSで1回だけ送る。
   client secretは送らない。redirectは拒否、TLS検証は維持。提案10秒/応答64KiBの上限を設ける。
7. 交換のタイムアウト/結果不明では同じcodeを再送しない。トークンが既に発行された可能性を記録し、
   「発行なし」と断定しない。新規認可や失効操作は別承認を受ける。
8. token_type=Bearer、空でないaccess token、有効なexpires_in、承認scopeとの対応を検証。
   scopeの追加/変更/省略をどう確認するかはPDI応答と公式仕様で確定するまで実装開始ゲートとする。
   JWTを未検証でdecodeしたsubだけでは本人性を判定しない。

ServiceNowの認可/トークンエンドポイントは外部PDIへの処理であり、トークン発行や同意記録を伴い得る。
後続の「読み取りE2E」の許可だけから、これらの実行許可を推定しない。

## 5. scopeと読み取り境界（共有影響を伴うため別承認）

useraccount、空scope、既存の広いscopeへフォールバックしない。scope名をreadにしてもGET制限は成立しない。
専用scopeとAPI/resource/HTTP methodの関連付け、clientへの許可、要求/発行scopeの対応をセットで確認する。
Table APIのGET用mappingの公式例はR4にある。PDIには管理一覧があるが、未フィルター表示は0件だった。
利用可能な既存GET用mappingは確認できず、新設の保存可否・実効動作は未検証。

| 用途 | 許す対象案 | 追加権限の扱い |
|---|---|---|
| 本人確認 | sys_userの本人ID確認だけ。固定の現在ユーザー照会でsys_idのみ | 表示名・メール等は取得しない。既存ACLで拒否なら本人性未確認として停止 |
| 親 | sys_update_setの指定IDとBP-5必須メタデータ | 既存ACLを維持 |
| 子 | sys_update_xmlの所属条件付きmetadata/payload | payloadはプロセス内解析だけ、本文非返却 |
| リリース | sys_cluster_state.build_nameだけ | 読めなければC方式。ロール追加/ACL緩和なし |

REST API Auth ScopeではGETとresourceを指定できるが、汎用Table APIの{tableName}resourceだけで
上表の表/列/レコードに制限できるとは断定しない。POST/PUT/PATCH/DELETEを許すmappingは割り当てない。
unversionedの実際のBP-5 URLが対応するresource/version、および一覧と/{sys_id}の双方を確認する。
API外の呼出しを拒否するclient側設定も適用対象を確認し、広い未scoped APIへのアクセスを許容しない。

特に、**共有Table APIへのscope保護の追加は他の既存OAuth clientを拒否し得る**（R5）。
新規OAuth登録の作成承認だけでは、共有APIへのscope/policy追加・既存scope編集を許可したことにしない。
先に既存API-scope/policy/client関連を読み取りで棚卸しし、管理者が影響・回復手順を別途承認する。
既存の適切なGET用mappingがあれば利用可否を審査し、なければ安全に新設できるまで停止する。
本書の目的でScripted RESTやACL迂回経路を追加しない。

検証ハーネスにもPDI固定・GET固定・表/fields/query固定ガードを置き、製品のBP-5上限を維持する。
ただしこのガードはトークン流出後の権限を制限しない。サーバー側GET/対象外API拒否を確認できなければ
「読み取り専用トークン」「最小権限達成」とは報告せず、広いtokenを発行して書込み試験もしない。
対象外APIや変更methodの拒否試験は、実レコードを変更しない方法を先に設計・承認する。

## 6. 本人性・MCPへの引渡し・C方式

- 取得後、同じtokenで実行ユーザーのsys_idを読み取り、候補AのIDとの一致だけを記録する。
  sys_user一覧の先頭、指定した候補Aレコードが読めること、UIの表示名では本人性を証明しない。
  固定の現在ユーザー照会または承認済みの本人確認APIを実機で確認する。拒否/不明なら停止。
- 初期検証ハーネスは専用client、authMode=per-user、開始時にtoken/接続先を固定。
  401/失効でrefreshやservice-accountへ代替しない。HTTP MCP BearerとServiceNow tokenを混同しない。
- 同じ設定ID/ホストを使っても既存devを上書きしない。運用者設定は専用ID（仮bp5_candidate_a）でbindingを計算し直す。
  リリース証拠に候補本人の自己申告を使わず、運用者確認・期限・ファイル信頼検査を維持する。
- 新規トークンのまま、設定なし→有効C方式→期限/binding不正の順で確認する案とする。
  実測できた場合はresolvedとし、フォールバックできた実績として数えない。
- token取得後の安全なMCP引渡しは**未実装**。既存のperUserBearerToken受け口があることと、
  tokenを秘密保管から安全に供給する経路があることは別。HTTPヘッダーや任意tool引数への追加はしない。
  同一プロセスの検証ハーネス等の供給設計・実装/合成試験が必要で、ハンドラー直呼びの結果を実MCP認証E2Eと混ぜない。

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

Keychainを使う場合はorigin＋専用client識別子＋候補A sys_id＋用途でキーを分離し、期限/scope/本人確認結果も対応付ける。
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
- [ ] 新規専用登録の作成内容を承認。既存client001/標準登録/候補Aのロールを変更しない。
- [ ] 専用GET scopeとAPI mappingの既存影響、対象外APIの拒否、回復計画を審査。scope文字列だけで済ませない。
- [ ] callback receiver、state/S256、期限、交換結果不明、安全なtoken引渡しを合成試験で確認。
- [ ] 本人確認の固定GETが候補Aで成立するか確認し、失敗時に停止する。
- [ ] サーバー寿命とローカル寿命を承認。refresh不使用、必要なら失効操作の対象/手順を別途承認。
- [ ] 候補A本人のログイン/同意、外部ブラウザー起動、token発行に実行時の承認を得る。
- [ ] C方式の運用者証拠・専用binding・期限と非公開設定配置を別途承認。

## 9. 根拠と未確認事項

参照日2026-10-18。公式一次資料のみ。記載された仕様と、PDIでの実現性・本プロジェクトの設計判断を区別する。

| ID | 根拠URL・該当箇所 | 使う範囲/制限 |
|---|---|---|
| R1 | [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3) §7.3、§8.3/§8.5 | 外部ブラウザー/loopback IP/ネイティブclientの秘密。PDIで当該callbackを受理する実績ではない |
| R2 | [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.1) §4.1–4.6 | verifier/challenge/S256と検証。候補アカウントの権限は規定しない |
| R3 | [ServiceNow Authorization workflow](https://www.servicenow.com/docs/r/platform-security/authentication/authorization-workflow.html) Public Client - PKCE、認可/交換の表 | 公式検索結果にAustraliaとS256/stateの記述。汎用/r URLの直接表示は別familyに切替わるため、作成前にAustralia本文/画面の再照合が必要 |
| R4 | [Configure REST API Auth scope](https://www.servicenow.com/docs/r/platform-security/authentication/configure-rest-api-auth-scope.html) Table APIの3構成例 | 公式検索結果はAustralia、GET/method/version/resourceの指定例。PDIでの設定/拒否実績は未確認 |
| R5 | [REST API Auth Scope](https://www.servicenow.com/docs/r/platform-security/authentication/rest-api-auth-scope.html) Note / Configurations | scopeのAPI/client関連付け、useraccountの特別扱い、既存tokenへの影響。検索結果はAustralia、直接本文はBrazil表示で確認。Australia実機の承認根拠として単独採用しない |
| R6 | [Configure an OAuth authorization code grant](https://www.servicenow.com/docs/r/platform-security/authentication/configure-an-oauth-authorization-code-grant.html) Before you begin / Procedure / Details form | 追加調査の公式検索本文はAustralia・2026-03-12更新。設定経路とロールを確認。PDIでの新規保存成功を意味しない |

loopback公開client、専用GET scope、15分/5分/10秒等の提案値、Keychain保管は未検証の設計であり、
この文書をもって導入済み・安全性確認済み・最小権限達成とはしない。
