# BP-5：専用OAuthの最小検証・ロール境界計画

Version: draft-0.2 / Date: 2026-10-18 / Status: 未承認・未実行の手順案。

本書は[専用OAuth設計](BEST_PRACTICE_BP5_PER_USER_OAUTH_DESIGN.md)の実行前計画。
同設計§0のとおり、読み取り境界はトークンのscopeではなく**検証利用者のロール/ACLで強制する（方式R）**。
REST API Auth Scope・API Access Policy・共有Table API設定は変更しないため、共有APIの影響審査・
canary・共有設定の復旧は本計画の対象外とした（draft-0.1の§5–§7から変更）。
[読み取り調査](E2E_BEST_PRACTICE_OAUTH_READINESS_2026-10-18.md)ではUIの存在まで確認したが、
S256強制・loopback受理・ロール境界の実効動作は未実証。本書は実行前の手順設計であり、
利用者/ロール/ACL作成・登録作成・認可/同意・code/token発行の実行を許可するものではない。

## 1. 検証する主張と限界

| 主張 | 最低限必要な証拠 | 証拠にならないもの |
|---|---|---|
| S256を利用できる | Public ClientでS256認可→正しいverifierによる交換成功 | UIの説明だけ |
| S256が強制される | 上記成功に加え、plain/方式省略/challengeなし、verifier不正/なしの拒否と、その段階/理由 | クライアント自身が不正要求を送らなかったこと、PKCE一般の仕様 |
| 固定loopback URIが使える | 設計URIの保存後再読取、同URIへの認可応答、同URIでの交換成功 | HTTP localhostの古い例、入力欄の存在 |
| 検証利用者がレビュー対象を読める | 検証利用者のtokenで親/所属metadata/payloadのGETが成功し、BP-5が既存Update Setを解析する | 管理者セッションでの成功、ACL定義の照会だけ |
| 専用ロールが書込み権限を追加しない | 専用ロールに紐づく全ACL操作の照会（新設ACL 2件がreadのみ）と、検証利用者の実効ロール（暗黙の`snc_internal`を含む）の記録。実ログインでの本人sys_id一致 | 変更methodの拒否試験（実施しない）、ローカルGETガード、scope名 |

検証範囲は専用client・固定PDI・検証利用者・BP-5が使う3テーブルのGETだけ。
主張は「専用ロールが書込みを追加しない」までで、検証利用者が書込み権限を持たない、最小権限を達成した、
書込み拒否を実測した、のいずれも主張しない。検証利用者は暗黙の`snc_internal`等による一般の内部利用者の
権限を持ち得る（設計§5.2・§9の留保、2026-10-18訂正）。

## 2. 承認ゲートと中止条件

すべて未承認。段階をまとめて自動実行せず、対象・操作・復旧範囲を人が確認する。

| ゲート | 実行前に確定する内容 |
|---|---|
| G0：ローカル合成試験 | callbackのstate/Host/path/期限/サイズ検査、秘密非出力、受信先制御、tokenメモリ保管・廃棄、キャンセル。既存CLIは使わない |
| G1：ロール/ACL棚卸し | BP-5が読む3テーブルのread ACLとロール、候補ロールに紐づく全ACL操作、継承ロール、フィールド単位ACL。§5に読み取り照会の結果を記録 |
| G2：検証利用者・ロール・登録 | 新規の検証利用者、ロール構成（R-2なら新規ロールとAllow If read ACL 2件）、Public Client・固定callback・短寿命の専用登録。作成/無効化/削除と復旧の承認。既存ロール/ACL/登録・共有API設定の変更は含まない |
| G4：認可と交換 | ケースごとのcode/token発行、最大回数、短寿命、異常成功時の失効方法・担当を承認。検証利用者本人が通常ログイン/同意 |

方式Rにより、旧G3（共有API保護）と旧G5（変更methodの実証）は廃止した。共有設定を変更せず、
書込み不能はロール/ACL構成の照会で示し、変更methodの実リクエスト試験は行わない。

G0のローカル合成ハーネスは[実装・検証済み](E2E_BEST_PRACTICE_OAUTH_G0_2026-10-18.md)。
ただし実PDI用HTTPS接続/本人確認API/実MCPへのtoken引渡しは未実装または未確定で、G0の人の承認も未完了。
これらを実装/承認するまでG4へ進まない。以下のP/L/Rケースは未実行のまま。
G1は§5.1の読み取り照会で開始条件を満たす見込みだが、人の確認は未完了。
旧G1の[共有API棚卸し記録](E2E_BEST_PRACTICE_OAUTH_G1_INVENTORY_2026-10-18.md)は、共有変更を避ける判断の根拠として保持する。
公開clientが成立しない、S256降格が受理される、URIが外部へ流れる、検証利用者が想定外の表を読める/書けると判明する、
予期しないtoken発行、既存clientの不具合、token/秘密漏えいの疑いで即中止する。
adminや広いロールへの切替、ACL緩和、既存ACL/ロール/共有clientの変更で継続しない。

## 3. S256の最小ケース

認可要求もcode/同意記録等の作成を伴い得る。ブラウザーでの拒否確認を「読み取りのみ」と呼ばない。
同一条件の専用clientを使用し、各ケースで新しいstate/verifier/codeを使う。codeは1回だけ交換、
失敗後に同じcodeで正常系を再試行しない。交換はsecretなし、固定HTTPS endpoint、redirect拒否。

| ID | 正常系から変える項目（1つずつ） | 期待/合否 |
|---|---|---|
| P01 | なし：S256 challenge＋正しいverifier | 認可/交換成功、token_type/寿命/scope/本人性確認。基準ケース |
| P02 | 正しいS256 challenge、交換時に別verifier | tokenなしで交換拒否。RFC7636 §4.6のinvalid_grantに対応するか記録 |
| P03 | 正しいS256 challenge、交換時にverifierなし | tokenなしで交換拒否 |
| P04 | method=plain、plainに対応する正しいchallenge/verifier | 認可段階で拒否を第一期待。codeが出た場合は即停止し、交換は別承認なしに行わない。S256強制は未証明/要調査 |
| P05 | challengeあり、methodなし | 省略時plainへの降格を受理しないこと。codeが出たらP04と同じ停止 |
| P06 | challenge/methodともになし | Public Clientで認可拒否。codeが出たら停止 |

P02/P03の前に正常P01が成立していること。ログイン失敗・scope不正・期限切れ等の別理由では採点しない。
エラー名の違いは固定カテゴリに分類し、期待した検査の段階/理由が不明ならinconclusive。
P04/P05でcodeが出ただけなら「S256でないtokenが発行された」とは断定しないが、ゲートは閉じる。
予期せずtokenが返った場合はAPIへ使わず、§7の異常時失効/隔離へ移る。

## 4. loopback URLの最小ケース

提案URIは`http://127.0.0.1:18765/bp5/oauth/callback`。登録にはこの1件だけを設定する案。
保存後の再読取で同一値を確認し、listenerを127.0.0.1だけに先にbindする。
正常P01をL01として共用し、追加の正常token発行を減らす。

| ID | ケース | 期待/判定 |
|---|---|---|
| L01 | 設計URIで保存・認可・交換 | 同一URIで成功。保存/認可/交換の各段階を別記録 |
| L02 | pathだけを`/bp5/oauth/callback-other`に変更 | 認可拒否。不正URIへcode/tokenを返さない |
| L03 | hostだけを`localhost`に変更 | 未登録の別hostとして拒否を期待。hosts/DNS/外部hostへ変更しない |
| L04 | portだけを18766に変更 | RFC8252 §7.3/§8.4はloopbackのport差を許容。受理/拒否を互換性として記録し、受理だけで安全性不合格にしない |
| L05 | 交換時のredirect_uriだけを変更 | 新しい正常codeを使い、path違いの交換拒否を確認。L04のport差とは分ける |

L02〜L04は保存済み登録を変えず認可要求だけを変える。試す宛先は自端末の制御下だけ。
各宛先の受信口は秘密を記録せず、想定外のcodeを交換しない。異なるhost/pathの認可が受理されたら停止。
L04でcodeを受け取る場合も交換せず期限切れ待ちとし、異常扱いの失効要否は承認計画に従う。
RFCのport可変性と、ハーネスがportを18765に固定して他portへ自動代替しない方針は別物。
固定portをサーバー強制することが必須なら、RFCとの違いを明示して設計を再承認する。
異常応答の観測にURL全文/スクリーンショット/HARを保存しない。

## 5. ロール境界の最小ケース（方式R）

### 5.1 G1：ロール/ACLの読み取り照会（2026-10-18、AIによる照会。人の承認ではない）

dev441827（Australia）で`sys_security_acl`・`sys_security_acl_role`・`sys_user_role_contains`を読み取り照会した。
詳細は[設計§5.1](BEST_PRACTICE_BP5_PER_USER_OAUTH_DESIGN.md)。要点：

- `sys_update_set` readは`update_set_picker`等、`sys_update_xml` readは`update_set_previewer`等。
  両表のDeny Unlessは`UserIsAuthenticated`だけ。両表に有効なフィールド単位read ACLはない。
- `update_set_picker`は`sys_update_set` readだけ。`update_set_previewer`はプレビュー表・リモートUpdate Set表への
  write/deleteも持つ。両ロールとも継承なし・elevated=false。
- `sys_cluster_state`は両ロールでは読めない見込み。リリース証拠はC方式（運用者設定）となる。

- `sys_user` readは`snc_internal`（または`public`＋script）。`snc_internal`には359表へのwrite/create/delete系ACLがある。
  Explicit Rolesによる`snc_internal`の暗黙付与の有無は`sys_plugins`の読取不可で未確認（設計§5.1）。

ロール構成は**R-2（専用ロール＋Allow If read ACL 2件。専用ロールは書込みを追加しない）を採用**した（2026-10-18、利用者の決定）。
検証利用者は暗黙の`snc_internal`等の一般利用者の権限を持ち得ることを受け入れる（案1、同日決定）。
R-1（既存2ロール、残存書込みあり）は採らない。G2の前に、作成するレコード（専用ロール・ACL 2件・検証利用者）の
具体値、security_admin昇格、復旧（無効化/削除）を人が承認する。採用の決定はこれらの作成の実行許可ではない。

### 5.2 Rケース

R01の固定GET候補と、失敗時停止・メモリ内token引渡し・秘密非出力・終了処理の設計は
[方式R-2本人確認/token引渡し設計](BEST_PRACTICE_BP5_R2_IDENTITY_TOKEN_DESIGN.md)を参照する。
設計の具体化のみで、実装・G0追加試験・実機でのR01成立を完了扱いにしない。

各ケースは検証利用者の正常token（P01=L01で得たもの、または承認済みの追加発行）を使う。
BP-5製品の取得経路（固定GET・3テーブル・bounded上限）を通し、本文・payload・原応答は出力しない。

| ID | ケース | 期待/判定 |
|---|---|---|
| R01 | 本人確認：同じtokenで現在ユーザーのsys_idを固定照会 | 検証利用者のsys_idと一致。読めなければ本人性未確認として停止（ロール追加で補わない） |
| R02 | 親：`sys_update_set`の指定IDをBP-5必須fieldsで取得 | 成功。拒否ならロール/ACL構成の不備として停止 |
| R03 | 子：`review_targets`で`sys_update_xml`の候補一覧とpayloadを取得し、BP-5が解析 | 0.3の結果で対象資産がreviewed。ACL拒否はvisibility失敗として記録 |
| R04 | リリース：`sys_cluster_state`の読取りが拒否/空になり、運用者設定でassertedになる | `source=operator_config`・`resolution_status=asserted`・`partial`。運用者設定がなければrelease_unknownで停止することも確認 |
| R05 | 構成照合：(a) 専用ロールに紐づく全ACL操作（新設ACL 2件の内容）、(b) 検証利用者の実効ロール（明示付与・継承・ログイン時の暗黙付与。`snc_internal`の有無を含む）、(c) ロール不要・`public`のACLが残ること | (a) read以外の操作なし。(b) 専用ロールと、暗黙の`snc_internal`等の一般利用者ロールだけ。想定外の明示ロールがあれば停止。(c) 一般利用者の権限が残る前提で記録し、合否の対象にしない |
| R06 | 検証利用者で、BP-5の対象外の表を固定GETで1件照会（承認した表のみ） | ACLにより拒否または0件。「対象外を読めない」の参考。全表の網羅ではない |

**変更method（POST/PUT/PATCH/DELETE）の実リクエスト試験は行わない。** 実レコードの作成・変更・BR実行を起こし得るため。
専用ロールが書込みを追加しないことはR05(a)の構成照合で示す。検証利用者が書込み権限を持たない、「書込み拒否を実測した」、最小権限を達成した、とは報告しない。
R06の拒否は、ACL・ドメイン・データ有無のどれによるかを区別できない場合がある。判定できなければinconclusive。

## 6. 共有Table APIへの影響（方式Rでは対象外）

方式RはREST API Auth Scope・API Access Policy・共有Table API設定・既存ロール/ACLを変更しない。
R-2で作るAllow If read ACLは新規ロール保持者へのreadを追加するだけで、既存の利用者・OAuth/OIDC/Basic/mTLS接続の
アクセスを狭めない。したがって旧§6の共有API影響審査・既存3登録の実利用/owner確認・canary・共有設定の復旧は不要とした。

旧§6の記録（[G1棚卸し](E2E_BEST_PRACTICE_OAUTH_G1_INVENTORY_2026-10-18.md)、
[maint担当者向け証拠取得計画](BEST_PRACTICE_BP5_TELEMETRY_MAINT_EVIDENCE_PLAN.md)）は、
将来scope/policyによる共有APIの保護を別途検討する場合の参考として保持する。dashboard/telemetry調査は打ち切った。

## 7. 停止・復旧・終了（実行前に別承認）

| 段階 | 手順案・確認 |
|---|---|
| 直ちに停止 | 新しい認可/交換/API要求を止め、callback/worker/ハーネスを終了。タイムアウトは発行有無不明として管理 |
| 専用tokenの封じ込め | 承認した失効手段で今回のtoken/同意だけを対象にする。登録無効化やローカル破棄だけで既発行tokenが失効したと仮定しない。失効未確認なら有効期限まで隔離・監視 |
| 検証利用者 | 無効化（active=false、ロック）を第一案とする。削除は監査を確認してから別承認 |
| 専用ロール・ACL（R-2） | 新設したAllow If read ACL 2件を無効化し、専用ロールを検証利用者から外す。既存ACL/ロールへは触れない。削除は別承認 |
| 専用登録 | 今回の登録を無効化する案。無効化/失効の効果順序は事前確認。既存client001/標準登録へ触れない |
| 復旧確認 | 検証利用者でのログイン不可、新設ACLの無効化、専用登録の無効化を読み取りで確認 |
| 後始末 | 監査記録/バージョン履歴は保持。秘密の保存物は作らず、結果は集計/理由のみ |

方式Rでは共有設定を変更しないため、共有設定の復元手順・既存clientのcanary確認は持たない。

## 8. 最小実行順・結果票

G0 → G1（§5.1）→ G2の個別承認（検証利用者・ロール構成・専用登録）→ G4 → P01=L01 → R01 →
P02/P03 → P04/P05/P06 → L02/L03/L04/L05 → R02/R03/R04 → R05/R06 → 停止/復旧確認。
最初の不合格で停止。各ケースは1回、ネットワーク自動再試行なし。正常系共用を除きcodeの再利用なし。
G4の上限案は認可10回・交換5回（異常成功を含む）。超過/再実行は再承認する。

結果票：case_id / 実施日時 / gate承認参照 / ロール・ACL構成参照 / 対象表・method分類 /
認可・交換・APIの到達段階 / HTTP status / 固定理由 / code発行有無bool / token発行有無bool /
副作用確認 / pass・fail・inconclusive・not_run / 失効・復旧確認 / limitations。
code/token/state/verifier/client secret・URL query全文・レスポンス本文・コード本文は記録しない。
client識別の対応表/復旧詳細は別権限領域に置く。結果票は全件not_runから開始する。
成功時もS256利用可/強制、URI保存/認可/交換、読み取り成功、専用ロールが書込みを追加しないこと、検証利用者の実効ロール（暗黙の`snc_internal`の有無）を独立して結論にする。

## 9. 公式根拠と適用上の留保

参照日2026-10-18。仕様と本プロジェクトの厳格化を区別する。

| 根拠 | 該当箇所・用途 |
|---|---|
| [RFC7636](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.6) §4.3/§4.6 | method省略時plain、verifier照合/不一致拒否。plainが規格に存在することと本PoCのS256-only要件は別 |
| [RFC8252](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3) §7.3/§8.3/§8.4 | loopback HTTP/IP/受信口、port差の許容。PDIでの受理実績は示さない |
| [Authorization Workflow](https://www.servicenow.com/docs/r/platform-security/authentication/authorization-workflow.html) Public Client - PKCEの認可/交換表 | S256/challenge/verifier。family固定とPDIの降格拒否は未確認のまま |
| [Configure REST API Auth scope](https://www.servicenow.com/docs/r/platform-security/authentication/configure-rest-api-auth-scope.html) Table APIの3構成例 | 方式Rでは使用しない。将来scope保護を別途検討する場合の参考 |
| [REST API Auth Scope](https://www.servicenow.com/docs/r/australia/platform-security/authentication/rest-api-auth-scope.html) Note / Configurations | Australia・2026-03-12更新。scopeを付けたAPIへは同scopeを持たない既存OAuthがアクセスできなくなる、useraccountの特例、scope記録がないAPIは有効なOAuth登録がアクセス可。方式Rを選んだ根拠 |

未確定：検証利用者での実効アクセス（ドメイン分離・ACL script/条件・キャッシュを含む）、`sys_user`自己参照の可否、
R-2のACL作成時の保存制約、失効手段、検証利用者・ACLの無効化の効果。これらを推測で埋めない。
