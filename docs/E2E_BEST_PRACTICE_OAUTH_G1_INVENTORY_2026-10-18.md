# BP-5 G1：APIスコープ・OAuth関連・APIアクセスポリシー棚卸し

Date: 2026-10-18 / Status: 読み取り観測。G1の変更開始条件・人の承認は未完了。

## 1. 範囲と証拠の扱い

対象はdev441827。Australiaは既存のリリース観測によるもので、今回ビルド情報を再取得していない。
Chromeの既存UIセッションで一覧・保存済みレコード・関連一覧・限定したDictionaryメタデータを参照した。
API認証の代替としてcookie/CSRF情報を取り出さず、新規認可・token発行・API実効権限試験は行っていない。

[候補A専用OAuth設計](BEST_PRACTICE_BP5_PER_USER_OAUTH_DESIGN.md)と
[最小検証計画](BEST_PRACTICE_BP5_OAUTH_MINIMAL_VALIDATION_PLAN.md)のG1に対する部分的な証拠である。
候補A本人による可視性、最小権限達成、スコープの実効拒否を証明する記録ではない。

- OAuth一覧は20件＋最終1件まで参照。他の下記一覧は表示総件数と関連行を照合した。
- 「未フィルター」はUIの表示条件。ACL・ドメイン・閲覧主体のロール・その他の不可視範囲の網羅検証ではない。
- 同名だけで関連数を数えず、参照先IDの内部比較で一意件数/重複を確認した。IDの対応表は収録しない。
- client ID/secret、token、code、cookie、個人の氏名/メール、スクリプト本文は本記録に収録しない。
- credential/tokenレコードの実値は取得しない。登録作成・アカウント/ロール/ACL/設定変更・重複整理は行っていない。

## 2. スコープとOAuth登録

| 対象 | 表示範囲/結果 | 解釈の留保 |
|---|---|---|
| `sys_auth_scope` | 未フィルター2件：test、useraccount | testという名前から読み取り専用とは推定しない |
| `sys_api_access_scope` | 再取得した未フィルター一覧0件 | 既存の利用可能なGET mappingは確認できない。全環境での不存在の断定ではない |
| `oauth_entity_auth_scope_mapping` | 未フィルター9行、参照先OAuth登録8件。全行useraccount | 登録の関連メタデータであり、発行済みtokenのscopeではない |
| `oauth_entity` | 未フィルター21件、2ページを参照 | 下表の登録種別を区別する。21件すべてをinbound OAuth Clientとは呼ばない |
| スコープ検査プロパティ | `name=com.glide.rest.api.auth.scope.check.enable`の限定一覧は0件 | 明示値を観測できず、false/無効とは判定しない。公式の既定trueも実効値の確認とは別 |

Auth Scope参照先のDictionary照会で`oauth_entity_auth_scope_mapping.auth_scope`と
`sys_api_access_scope.auth_scope`を確認してから正規関連一覧を参照した。
Dictionaryにcredential関連の参照も表示されたが、そのcredentialテーブルの値は照会していない。

| 登録種別 | 件数 | 観測 |
|---|---:|---|
| OAuth Client | 11 | 有効10、非アクティブ1（ServiceNow Classic Mobile App） |
| External OIDC Provider | 6 | OAuth Clientと別種。稼働/実API利用は未確認 |
| OAuth Provider | 4 | outbound用途の種別として分離。直接のinbound Table API利用者数へ加算しない |

useraccountへの参照先8登録はclient001、Offglide AIEX、ServiceNow Agent、Mobile API、
Build Agent OAuth Grant、ServiceNow Request、ServiceNow Classic Mobile App、ServiceNow SDK。
Offglide AIEXの2行は同じ参照先IDであることを確認した。重複の実効影響は未検証で、削除対象にはしていない。
testへのOAuth関連は、この表示範囲では確認できなかった。

スコープ関連が見つからない有効OAuth ClientはTrino Connector、Prism、WebKit HTML to PDFの3件。
これは**優先して実利用を確認すべき候補**であって、「Table APIを使っている3件」「変更で停止する3件」ではない。
useraccount関連のある8登録も、実tokenのscope・制限フラグ・利用経路が未確認なので影響なしとは判定しない。

## 3. APIアクセスポリシーと認証プロファイル

`sys_api_access_policy`は未フィルター4件。下記Active等は保存済み表示を観測した値。

| ポリシー | Active | API/path | method/version/resource等 |
|---|---|---|---|
| Table GET API Access Policy | false | Table API / now/table | 詳細でGET・latest・/now/table/{tableName}を確認。Global/all methods/resources/versions/tablesはオフ |
| Table POST API Access Policy | false | Table API / now/table | 詳細でPOST・latest・/now/table/{tableName}を確認。Global/all methods/resources/versionsはオフ |
| Build Agent API Access Policy | true | Build Agent API / sn_build_agent/build_agent_api | 一覧でall methods/resources/versionsオン、Globalオフ |
| Trino Connector REST APIs | true | Trino Connector API / now/integration | 一覧でall methods/resources/versionsオン、Globalオフ |

Table用の詳細画面では「Loading tables」を観測した。Tables選択値が空に見えることを、
確定した対象表リストや全表許可の証拠にはしない。非アクティブの2件を完成済みの保護として流用しない。
Table GET画面にはHigh Riskファイルの変更警告も表示された。
表示ソート順を評価優先順位と混同しない。method/resource/version等による優先は公式仕様との照合が必要（§6）。

API Access Policy参照のDictionaryから`sys_auth_profile_mapping.api_access_policy`を確認し、
正規関連一覧の全3行を参照した。

| APIポリシー | 関連認証プロファイル |
|---|---|
| Build Agent API Access Policy | OAuth Authentication for Build Agent Service |
| Build Agent API Access Policy | API Key Authentication for Build Agent Service |
| Trino Connector REST APIs | Trino Connector mTLS |

Table GET/POSTへの関連はこの一覧で確認できなかった。認証方式やscopeを未確認のまま有効化しない。

- `inbound_auth_profile`：未フィルター10件、有効5件。その他5件は非アクティブ。
- 汎用OAuth tokenプロファイル：有効、Type=OAuth、OAuth Entity欄は空。
  Authentication Policies関連は挿入行だけで、保存済み行は表示されなかった。
- Build Agent用OAuthプロファイル：有効、Type=OAuth、OAuth Entity=Build Agent OAuth Grant、
  Allow access for Build AgentというAuthentication Policyへの関連を確認。候補A向けに流用/編集しない。
- `sys_authentication_policy`：未フィルター13件。MFA/セッション関連も混在し、13件すべてをTable API適用とは数えない。
- Global Blocking Policy：有効、説明上は認証前の対話/非対話アクセスに対するブロック用途。
  Policy Inputs関連は表示0件。これだけで全体に制限がない、またはAPI固有のGlobalポリシーがあるとは判定しない。

## 4. 共有Table APIへの影響候補

| 変更案（未承認） | 影響候補/注意 | 必要な確認 |
|---|---|---|
| 専用GET scopeとTable API mappingの新設 | 一致するmethod/resource/versionへの既存OAuth/OIDC要求を拒否し得る。専用clientだけの変更ではない | 有効Client10件/外部OIDC6件の実利用を切り分け、特に関連なし3Clientを優先。既存tokenの実scopeは未確認 |
| 既存Table GET/POSTポリシーの有効化 | auth scope新設と別の共有変更。許可認証方式によりBasic/mTLS等の接続にも影響し得る | 関連プロファイル、対象表の読込、適用優先、全利用者/canary/復旧値を確定。現状のまま有効化しない |
| useraccountや既存関連の編集 | 複数の既存登録が共有。専用scopeと混同しない | 編集・救済用の一括追加・重複削除は今回の対象外 |
| Build Agent用プロファイルの再利用 | 既存登録への固定関連と別APIへの依存がある | 専用登録のために既存entity/policy関連を書き換えない |

REST API auth scopeとAPI access policyは別の層。scope新設の結果からBasic/mTLSへのmethod制限を主張しない。
一方、API access policyまで変更するならOAuth以外の利用者も審査する。
allow-only-scope/Enforce token restriction/Disable client restrictionの意味・組合せを同一視しない。

### 4.1 対象3登録の実利用・担当者の追加調査

2026-10-18、既存Chromeセッションで登録詳細・既存メトリクス・関連設定と限定したDictionaryを
読み取り専用で確認した。**3登録ともTable APIの実利用は未確認、運用担当者は未特定**。
以下は未使用・影響なし・停止する登録の判定ではない。

| 登録 | 登録詳細で確認した非秘密情報 | 実利用/担当者について分かった範囲 |
|---|---|---|
| Trino Connector | Active=true、Public Client=false、Application=Global、Commentsは空表示 | §3のTrino API→mTLS関連は別の構成証拠。OAuth登録との実行時の対応やTable API利用、人の担当者を証明しない |
| Prism | Active=true、Public Client=false、Application=Global、Commentsは空表示 | 表示した既定フォームにOwner/Contactはなく、用途・担当者を特定できなかった |
| WebKit HTML to PDF | Active=true、Public Client=false、Application=Global。Commentsに`Used by the service WebKit HTML to PDF` | サービス用途の説明であり、Table API利用や人の担当者の証拠ではない。表示した既定フォームにOwner/Contactはなかった |

Trino Connectorの表示した既定フォームにもOwner/Contactはなかった。
作成者・更新者・接続用アカウントを、運用責任者とみなす推定は行っていない。

| 確認経路 | 観測結果 | 確認できなかった理由/限界 |
|---|---|---|
| Machine Identity Console → Metrics → Unique API calls in last 7 days | 表示総数351行。先頭15行でTable APIの`now/table/sys_update_xml`、`now/table/sys_update_set`等を確認 | **351は一覧の一意な組合せの行数で、リクエスト総数ではない**。表示列はidentity/authentication/resource/method/type/最終アクセス時刻で、OAuth application/clientの列はない。全351行は精査しておらず、同一identityから3登録へ帰属させない |
| Metricsの既存リンクからInbound API Integration Usage dashboard | `Can't display this dashboard` / `The dashboard that you are looking for was not found` | 初回観測。追加調査で標準メニューとの参照先不整合を確認したが、正しい参照先でも利用不可（§4.2）。修復・権限追加はしていない |
| Registered Integrations（`inbound_integration_provider_registry`） | 未フィルター6件。OAuth Entity参照はAzureAD、client001、Okta、ADFS、Auth0、Googleで、対象3登録は含まれなかった | 登録一覧での不在であり、実呼出しがない証拠ではない。Basic Auth Userの個人情報は記録しない |
| Auth Client Server Mappings（`auth_client_server_mapping`） | 観測済み3登録の参照IDで`auth_client`を限定した一覧は0件 | 関連設定の表示0件のみ。Table API未利用や他の経路の不存在は証明しない |

メトリクスの「7日」はUIの表示名。PDIでの収集開始・欠損・保持期間・除外条件の実効値は未確認。
公式資料にはInternal Integration User=trueのアカウントをMetricsから除外する旨があるが、
対象3登録の利用アカウントとそのフラグは未確認である（§6）。

追加のメタデータ確認は次の範囲に限定した。**生のtransactionログやcredential/tokenの値は取得していない**。

- `sys_dictionary`の`reference=oauth_entity`は12件。関連先を確認し、上記registryとclient/server mappingだけを追跡した。
  token/credentialを参照する表も候補に出たが、その内容は照会していない。
- `reference=inbound_integration_provider_registry`は0件、`sys_db_object`の`nameLIKEinbound_integration`はregistryの1件。
  この命名範囲の結果であり、プラットフォーム全体に別の利用統計経路がないとは判定しない。
- `name=syslog_transaction`で`element`を`oauth_entity,oauth_client,oauth_client_id,client_id,authentication_type,user,url,sys_created_on`
  に限定したDictionaryは`url`と`sys_created_on`の2件。選んだ候補ではOAuth clientの帰属キーを確認できなかった。
  全スキーマや別表との結合を網羅したものではなく、3登録別のtransaction件数は未集計。
- `name=oauth_entity`で`element`を`owner,owned_by,managed_by,support_group,assignment_group,contact,contact_person`
  に限定したDictionaryは0件。直接定義された候補名の範囲であり、継承項目・別名のカスタム項目・外部運用台帳は未確認。

したがって、既存設定から登録の有効状態と一部の用途は確認できたが、アプリ別の実績と人の責任者を
結び付ける証拠は得られなかった。ログの取得不能を「0呼出し」と置き換えない。

### 4.2 dashboardリンク不整合・利用不可の切り分け

2026-10-18の追加読み取り調査。既存UI・設定・標準処理・当日の限定した`syslog`を照合した。
§4.1のメタデータ照会と異なり、ここでは既存のアプリケーションエラーログを参照したが、
`syslog_transaction`の生ログやcredential/tokenの値は取得していない。
新規登録・認可/token発行・ロール/ACL/プロパティ/標準処理の保存変更・機能の有効化は行っていない。

#### 確認した事実

| 観点 | 観測 | 判定の範囲 |
|---|---|---|
| Metricsのリンク | `/now/platform-analytics-workspace/dashboards/params/edit/false/sys-id/99dd82d2ff222210469fffffffffff4c`を参照し、not foundを再現 | 標準メニューと参照先が異なる。なぜこのIDを参照するかは未確認 |
| 標準メニュー | 有効なSystem Web ServicesのUsage Dashboardモジュールは同経路のID`543b66e7f350321033d25169f6968c2e`を参照。必要ロールは`inbound_integration_metering_admin` | 同一セッションでdashboard名・フィルターを表示。統計の取得成功ではない |
| dashboard登録 | 両IDに限定した`par_dashboard`一覧は後者の有効レコード1件。`pa_dashboards`は両IDとも表示0件 | 今回の可視範囲での登録照合。プラットフォーム全体の不存在を断定しない |
| 正しい参照先の最終表示 | `Inbound Integration Usage is not available`。一時的な`Loading...`の後も統計を利用できず、利用者の提示画像とも一致 | 「正しいリンクなら利用可能」という結論には訂正が必要。リンク不整合と統計利用不可は別問題 |
| 有効化設定 | `glide.inbound_integration_metering.enabled`の保存値は`true` | 単純な設定falseの説明を支持しない。実効キャッシュ・全依存機能・バックエンド利用権まで証明しない |
| 導入記録 | `sys_plugins`でInbound API Integration Usage Framework（`com.glide.inbound_integration_metering`）、Install date=2026-06-12 14:33:40を確認。dashboard資産とtelemetry用の有効Script Includeも存在 | 画面/処理が丸ごと未導入とは考えにくい。導入記録は全依存の正常稼働の証拠ではない |
| プラグイン一覧の制約 | `v_plugin`のInbound検索には公開/契約に関係する追加条件が見え、Frameworkは表示されなかった | この一覧の不在だけで未導入としない。上記`sys_plugins`の観測と区別する |
| 権限 | セッション表示はSystem Administrator。表示名に対応する限定ロール一覧で有効なadmin関連を確認。Single Score Visualizationの`ux_data_broker/execute` ACLはActive=true、Admin overrides=true、Advanced=false、要求ロールは`inbound_integration_metering_admin` | 単純な入口ACLのロール不足は主因と考えにくいが、全ACL・下流サービスの権限を排除しない。非管理者での実効試験は未実施 |

公式の必要ロールも`inbound_integration_metering_admin`（§6）。PDIでこの機能が一律利用不可とする
公式根拠は今回の検索では確認できなかった。これはPDIでの利用可能性を保証するものでもない。

#### 既存エラーと標準処理の照合

- 当日の`TelemetryDataHandler._fetchData: Error fetching data:`に限定した既存ログは、
  確認した表示10行すべてが`The undefined value has no properties.`だった。10は総発生件数とはしない。
- 当日の`messageSTARTSWITHTelemetry`一覧は表示総数30行、先頭20行を確認。その表示範囲で
  `TelemetryQueryServiceDataConnector.executeQuery`、`TelemetryDataProviderFacade.fetchData`、
  `TelemetryDataHandler._fetchData`に同じエラーを確認した。件数はAPI呼出し数ではなく、
  同一要求への帰属・相関IDの照合や全30行の精査はしていない。
- 標準処理はSingle Score Visualization → `sn_telemetry_data.TelemetryDataHandler` →
  `TelemetryDataProviderFacade` → `TelemetryQueryServiceDataConnector` → `BaseTelemetryConnector` →
  同スコープの`QueryServiceHttpClient`を参照する構成。別スコープの同名クライアントとは区別した。
  これは静的な参照経路であり、今回の要求の完全な実行トレースではない。

**疑い：`QueryServiceHttpClient`の`this.logger`未初期化。** 読み取った同クラスの`initialize()`は
`this.client`だけを設定し、クラス本文に`this.logger`への代入や`Object.extendsObject`はなかった。
一方、応答解析のcatchに`this.logger.error(...)`、HTTP失敗時の`_handleError()`にも
`this.logger.error(...)`がある。取得本文での該当箇所はそれぞれ142行・173行（版依存）。
元の通信/解析エラーを処理する際に二次エラーが発生し、最初の原因を隠す可能性がある。

これは**静的な不整合の疑いで、今回のundefined値を実測で確定したものではない**。
同クライアントのレコードIDを含む当日ログの限定検索は表示0件で、行番号付きスタックは確認できなかった。
`BaseTelemetryConnector.getApiConfig()`は取得値がfalsyなら明示的な別エラーを投げるため、
先に挙げた`apiConfig`欠落説をそのまま確定原因にはしない。元のHTTP応答・失敗段階も未確認。

#### 未確認事項と次の判断

1. Metrics側のIDの由来、画面資産の版・移行/更新との関係。
2. `this.logger`が実際の例外箇所か、元の通信/解析エラーは何か。既存の秘密を含まないスタックや
   相関情報が得られるかを先に確認し、ログ全文・応答・ヘッダー・接続設定の実値を無条件に収集しない。
3. telemetryバックエンドの提供/構成・PDI制約・下流権限との因果関係。現時点でどれも確定しない。

標準処理の修正、logger追加、新規ログ有効化、プラグイン修復、権限追加で仮説を試していない。
必要になれば別の変更承認・影響/復旧計画を先に用意する。3登録の実利用/ownerは依然未確認で、
dashboardが使えないことを「利用なし」「共有変更の影響なし」に置き換えない。

## 5. G1の残項目と進行条件

優先順位は以下。いずれも未完了で、G2/G3/G4へ自動で進まない。

1. **実利用/担当者**：上記3Clientを優先し、他の有効OAuth/OIDC登録もTable API利用の有無、
   method/version/resource/table、定期ジョブ、ownerを確認。未使用の標準/サンプル登録も推測で除外しない。
   §4.1の追加調査でも3件は未解決。既存の運用台帳・ジョブ設定等から責任者と非秘密のclient→resourceの
   帰属証拠を特定し、対象期間・収集/保持・除外・不可視範囲を記録する。担当者への連絡は別途許可を得る。
   dashboardの表示不能は修復やロール追加の許可ではない。新規ログ有効化・設定変更・token取得で補わない。
   §4.2のリンク不整合とtelemetryエラーの調査でも利用統計は取得できていない。
   logger未初期化は疑いとして保持し、確定原因・PDI一律制約・権限問題の解消とは扱わない。
2. **実効設定/可視性**：閲覧主体・ACL/ドメイン/スコープによる不可視、プロパティ実効値、
   対象clientの制限フラグ、ポリシーの正確な対象表・条件/優先を確認。
   credential内容や既存tokenを収集する代わりに、承認した非秘密の証拠経路を先に設計する。
3. **変更・復旧の準備**：ownerのcanary GET、影響時間帯、復旧担当/独立管理経路、
   正確な保存前値/関連の非公開保管、復旧確認を確定。現観測は復旧用snapshot一式ではない。
4. **承認**：専用登録作成と共有API保護は別承認。未知の影響をuseraccount付与・ACL緩和・
   全体scope検査停止・既存ポリシー有効化で補わない。

結論：構成の表示範囲と影響候補を把握したが、実効権限/利用実績/復旧準備が未確認。
**G1の変更開始条件は未完了、最小検証計画のP/L/S実機ケースも全件未実行のまま。**

## 6. 公式根拠

調査時の参照日2026-10-18。下の最初の4資料の公式検索本文はAustralia・2026-03-12更新と表示された。
汎用/r URLの直接本文はBrazilへ切り替わる場合があり、family固定の証拠と混同しない。

| 根拠URL | 該当箇所/用途 |
|---|---|
| [REST API Auth Scope](https://www.servicenow.com/docs/r/platform-security/authentication/rest-api-auth-scope.html) | Note/Configurations：既存tokenへの影響、useraccountの特別扱い、登録との関連付け |
| [Create REST API access policy](https://www.servicenow.com/docs/r/platform-security/authentication/create-api-access-policy.html) | 認証プロファイル関連、method/version/resource/Table指定。新設scopeとの責務の違い |
| [API access policy prioritization](https://www.servicenow.com/docs/r/platform-security/authentication/api-access-policy-prioritization.html) | non-global優先、method/resource/version等による優先。UIのNameソートは評価順ではない |
| [REST API scope troubleshooting](https://www.servicenow.com/docs/r/platform-security/authentication/rest-api-scope-troubleshooting.html) | scope検査プロパティ、useraccount、OAuth/OIDCとBasic/Session Cookie/証明書認証の違い |
| [Machine identity metrics](https://www.servicenow.com/docs/r/platform-security/identity/machine-identity-metrics.html) | Australia・2026-03-12更新表示。Unique API calls in last 7 days、Internal Integration User=trueの除外。対象の実効除外状態は未確認 |
| [Monitor inbound API integration usage](https://www.servicenow.com/docs/r/api-reference/web-services/inbound-api-integration-usage-dashboard.html) | Australia・2025-09-29更新表示。アプリ別OAuth呼出し、`inbound_integration_metering_admin`、30日/13か月等の表示期間。PDIの保持・収集の実測ではない |
| [View inbound API integration usage dashboard](https://www.servicenow.com/docs/r/api-reference/web-services/view-inbound-api-integration-usage-dashboard.html) | Australia・2025-10-01更新の検索表示。アプリ/resourceの絞り込みと必要ロール。追加調査ではPDIの画面枠に到達したが統計は利用不可。直接本文はBrazil表示となり、Australia固定の根拠と混同しない |
| [Register Basic Authentication](https://www.servicenow.com/docs/r/api-reference/web-services/register-basic-authentication.html) | Australia・2026-03-12更新表示。Registered IntegrationsとOAuth Entityによる名称補完。registryの不在から未利用とは推論しない |

Dictionaryの正規関連テーブル名と件数はPDIでの観測。公式資料を読んだことを、そのPDIでの
設定有効化・拒否動作・既存接続の互換性の実証として扱わない。
