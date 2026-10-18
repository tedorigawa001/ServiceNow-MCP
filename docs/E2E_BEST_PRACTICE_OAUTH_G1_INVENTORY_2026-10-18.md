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

## 5. G1の残項目と進行条件

優先順位は以下。いずれも未完了で、G2/G3/G4へ自動で進まない。

1. **実利用/担当者**：上記3Clientを優先し、他の有効OAuth/OIDC登録もTable API利用の有無、
   method/version/resource/table、定期ジョブ、ownerを確認。未使用の標準/サンプル登録も推測で除外しない。
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

調査時の参照日2026-10-18。以下の公式検索本文はAustralia・2026-03-12更新と表示された。
汎用/r URLの直接本文はBrazilへ切り替わる場合があり、family固定の証拠と混同しない。

| 根拠URL | 該当箇所/用途 |
|---|---|
| [REST API Auth Scope](https://www.servicenow.com/docs/r/platform-security/authentication/rest-api-auth-scope.html) | Note/Configurations：既存tokenへの影響、useraccountの特別扱い、登録との関連付け |
| [Create REST API access policy](https://www.servicenow.com/docs/r/platform-security/authentication/create-api-access-policy.html) | 認証プロファイル関連、method/version/resource/Table指定。新設scopeとの責務の違い |
| [API access policy prioritization](https://www.servicenow.com/docs/r/platform-security/authentication/api-access-policy-prioritization.html) | non-global優先、method/resource/version等による優先。UIのNameソートは評価順ではない |
| [REST API scope troubleshooting](https://www.servicenow.com/docs/r/platform-security/authentication/rest-api-scope-troubleshooting.html) | scope検査プロパティ、useraccount、OAuth/OIDCとBasic/Session Cookie/証明書認証の違い |

Dictionaryの正規関連テーブル名と件数はPDIでの観測。公式資料を読んだことを、そのPDIでの
設定有効化・拒否動作・既存接続の互換性の実証として扱わない。
