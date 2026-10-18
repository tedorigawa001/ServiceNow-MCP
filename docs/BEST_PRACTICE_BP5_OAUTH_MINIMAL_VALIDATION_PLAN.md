# BP-5：専用OAuthの最小検証・共有Table API影響/復旧計画

Version: draft-0.1 / Date: 2026-10-18 / Status: 未承認・未実行の手順案。

本書は[候補A専用OAuth設計](BEST_PRACTICE_BP5_PER_USER_OAUTH_DESIGN.md)の実行前計画。
[読み取り調査](E2E_BEST_PRACTICE_OAUTH_READINESS_2026-10-18.md)ではUIの存在まで確認したが、
S256強制・loopback受理・GET限定は未実証。本書は実行前の手順設計であり、
登録作成・認可/同意・code/token発行・設定変更・拒否試験の実行を許可するものではない。

## 1. 検証する主張と限界

| 主張 | 最低限必要な証拠 | 証拠にならないもの |
|---|---|---|
| S256を利用できる | Public ClientでS256認可→正しいverifierによる交換成功 | UIの説明だけ |
| S256が強制される | 上記成功に加え、plain/方式省略/challengeなし、verifier不正/なしの拒否と、その段階/理由 | クライアント自身が不正要求を送らなかったこと、PKCE一般の仕様 |
| 固定loopback URIが使える | 設計URIの保存後再読取、同URIへの認可応答、同URIでの交換成功 | HTTP localhostの古い例、入力欄の存在 |
| tokenがGETに限定される | 許可GET成功、変更method/対象外APIのscope起因の拒否、関連設定の照合 | scope名、ローカルGETガード、ACL拒否/不存在404だけ |

検証範囲は専用client・固定PDI・候補A・承認済みAPI/version/resourceだけ。
Table APIのGET限定と、表/列/レコードの限定は別。後者は既存ACLとローカル取得制限を維持するが、
scopeだけで成立すると主張しない。候補Aが元から書けないこともmethod限定の証拠にはしない。

## 2. 承認ゲートと中止条件

すべて未承認。段階をまとめて自動実行せず、対象・操作・復旧範囲を人が確認する。

| ゲート | 実行前に確定する内容 |
|---|---|
| G0：ローカル合成試験 | callbackのstate/Host/path/期限/サイズ検査、秘密非出力、受信先制御、tokenメモリ保管・廃棄、キャンセル。既存CLIは使わない |
| G1：読み取り棚卸し | §6の既存依存関係、利用者/影響範囲、正確な設定キー、保存前値、復旧担当・手段。表示0件だけで不存在を確定しない |
| G2：専用登録 | Public Client、固定callback、短寿命、専用scope、非管理者の本人同意、作成/無効化の承認。共有API変更は含まない |
| G3：共有API保護 | §6の影響・停止時間・canary・復旧案の独立承認。未scoped method/API拒否とDisable client restrictionの実効意味を確認 |
| G4：認可と交換 | ケースごとのcode/token発行、最大回数、短寿命、異常成功時の失効方法・担当を承認。本人が通常ログイン/同意 |
| G5：変更methodの実証 | §5の安全な対象とscope起因の判定手段を承認。実書込みや制御tokenが必要なら別承認/別環境 |

G0のローカル合成ハーネスは[実装・検証済み](E2E_BEST_PRACTICE_OAUTH_G0_2026-10-18.md)。
ただし実PDI用HTTPS接続/本人確認API/実MCPへのtoken引渡しは未実装または未確定で、G0の人の承認も未完了。
これらを実装/承認するまでG4へ進まない。以下のP/L/Sケースは未実行のまま。
G1の[読み取り棚卸し記録](E2E_BEST_PRACTICE_OAUTH_G1_INVENTORY_2026-10-18.md)は部分的な構成証拠であり、
G1の変更開始条件は未完了。実利用/owner、実効設定・不可視範囲、canaryと復旧snapshot/担当の確認が残る。
対象3登録の追加調査でも実利用未確認・owner未特定のまま（同記録§4.1）。P/L/Sケースの実行状況は変更しない。
公開clientが成立しない、S256降格が受理される、URIが外部へ流れる、scopeが広がる、
予期しないtoken発行、既存clientの不具合、token/秘密漏えいの疑いで即中止する。
adminへの切替、useraccount/空scope、ACL緩和、共有clientの変更で継続しない。

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

## 5. GET限定scopeの最小ケース

専用scopeは仮`bp5_review_read`。clientにuseraccount/全method scopeを関連付けない。
Allow access only to APIs in selected scopeをオンにする案だが、保存/実効動作は未検証。
Enforce token restrictionは別のAPI access policy用設定であり同一視しない。
Disable client restrictionを既存client救済のために切り替える案は採らない。

最小mapping候補は実際のBP-5が使用するTable APIのGET、一覧と単一取得のresource、unversioned URLに
対応するversionだけ。UI/実メタデータで正確なresource/versionを特定してから設定案を確定する。
`{tableName}`でsys_update_set等だけに絞れるとは仮定しない。all methodsの有効化は禁止。

| ID | ケース | 判定条件 |
|---|---|---|
| S01 | 固定Update Setの親GETと所属metadata GET。必要最小fields、limit=1。payloadはこの試験で取得しない | 候補Aの既存ACLで読めれば成功。ACL拒否ならvisibility失敗として分離し、scope成功にしない |
| S02 | 承認済みの別APIに対する固定GET | APIが実在し候補AにACL上読めると独立確認でき、scopeによる拒否を特定できること。不明ならinconclusive |
| S03 | POST/PUT/PATCH/DELETEをそれぞれ1件、承認した安全な検証先へ | 全methodのscope起因の拒否を個別に確認。成功/曖昧ならGET限定と報告しない |
| S04 | 許可mapping外のversion/resourceを固定GETで照会 | URL解決先とscope判定を確認。存在しないAPIの404はscope拒否に数えない |

**S03を既存業務レコード/sys_update_set/sys_update_xmlへ送らない。** 空body・同じ値の更新・不存在sys_id・
無効な表を「無副作用だから安全」と仮定しない。POSTは新規作成、更新/削除はBR/監査等を起こし得る。
OPTIONS/HEADの成功や、ローカルfetch mockによる拒否も実際のmethod制限の証拠にならない。

実行前に次のいずれかの証拠経路を確定する。現在はいずれも未確定。

- **非更新経路を優先**：プラットフォーム公式の認可判定ログ/診断機能で、固定プローブのscope拒否と
  handler到達前拒否が確認できるか読み取り調査する。機能がなければ利用できるとは書かない。
  不存在IDプローブを使うとしても、実行順序・副作用なしの独立根拠と操作承認を先に得る。
- **隔離試験**：上記が成立しなければ、別の隔離環境の使い捨て表/データで行う案を別途承認する。
  同じ利用者・同じACL・同じAPI/methodでscopeだけを変えた正常対照が必要。
  対照tokenには書込み能力が生じるため、新しい権限付与・fixture作成・実書込み・後始末の別承認が必要。
  候補Aへロールを追加せず成立しなければ今回のPDIではinconclusiveで止める。

401は認証失敗、403はscope/ACL/policy/CSRF等の区別が必要、404/405/400は不存在/経路/入力検査の可能性がある。
応答だけで区別できなければ、正確な判定段階の証拠または上記対照が得られるまで未確認とする。
有限の試験で全API拒否を証明したとはせず、設定照合と試験した組合せの範囲を記録する。

## 6. 共有Table APIへの影響審査

GET mappingの新設でも既存tokenを拒否し得る。専用clientにscopeを付けるだけの変更とは分ける。
以下を読み取りで確定し、秘密を含まない変更台帳と、非公開の復旧用詳細を分離する。

G1ではAuth Scope定義2件、API-scope関連の表示0件、OAuth関連9行/8登録、REST APIポリシー4件、
policy-profile関連3件を観測。Table GET/POSTは非アクティブでprofile関連も表示されなかった。
scope関連なしの有効Client3件（Trino Connector/Prism/WebKit HTML to PDF）を実利用の優先確認候補とするが、
他のOAuth/OIDCやBasic/mTLS利用者を影響審査から除外しない。
非アクティブTableポリシーの有効化、既存useraccount/専用用途profileの編集、重複関連の整理を
scope新設の一部として自動実行しない。スコープ検査プロパティの表示0件も無効化の証拠にしない。

追加調査ではMetricsに一意な組合せ351行が表示されたが、先頭15行の確認と表示列だけでは
Trino Connector/Prism/WebKit HTML to PDFへ呼出しを帰属できなかった。アプリ別usage dashboardは
初回「not found」で表示不能。registryの6件に対象参照がないこととclient/server mappingの対象0件を、
未利用・影響なしとは判定しない。用途コメントやTrinoの別API/mTLS関連もTable API利用の証拠ではない。
G3の前に、責任者と非秘密のclient→resource帰属、対象期間、収集・保持・除外/不可視範囲を確定する。
dashboardの復旧・ロール追加・ログ有効化はこの読み取り調査に含めず、必要なら別の変更/復旧承認を得る。
生のtransactionログやcredential/tokenの値は今回取得しておらず、既存ログ全体を調べ尽くしたとは扱わない。

[G1記録§4.2](E2E_BEST_PRACTICE_OAUTH_G1_INVENTORY_2026-10-18.md)の追加調査でMetricsと標準メニューの
参照先不整合を確認したが、正しい参照先でも`Inbound Integration Usage is not available`となった。
保存済みmetering設定true・Framework導入記録・確認した入口ACLのadmin overrideだけでは、
telemetryバックエンドの稼働や下流権限、PDIでの提供条件を保証しない。
限定した既存`syslog`と標準処理の照合では`QueryServiceHttpClient.this.logger`未初期化による
二次エラーの疑いがあるが、行番号付きスタック・元のHTTP失敗原因は未確認。実測確定とは採点しない。
リンク修正、標準処理改修、プラグイン修復、ログ有効化や権限追加をG1の読取操作として実施しない。
秘密を含まない既存の相関/スタック証拠の確認を優先し、変更が必要なら別途承認と復旧計画を用意する。
統計を取得できないまま3登録を未利用と判断してG3へ進めず、P/L/Sは全件未実行を維持する。

同記録§4.3では、限定した既存ログ24行中、接続設定のヘッダーJSON解析エラー14行とconnectorの
undefinedエラー10行を確認。ヘッダー解析は回復処理で空ヘッダーへ置き換わり、空値の代替オブジェクトでも
失敗し得るため、JSON破損や元のHTTP失敗の原因と断定しない。要求単位の相関も未確認。
接続設定表のread ACLはmaint必須・Admin overrides=false。一覧の表示0件を設定欠落と扱わず、
Script Include実行・別API・権限追加で迂回しない。今回の限定ログでは元のHTTPステータス/応答/失敗理由を
確認できず、logger未初期化の疑いとは独立した未解決事項とする。
権限を持つ担当者から秘密を除いた既存証拠を得る手順を先に整理し、連絡・変更・再試験は別途承認する。
G1未完了とP/L/S全件未実行の扱いは変更しない。

1. 権限/スコープ/ドメイン/件数制限による不可視を確認し、既存API-scope、OAuth関連付け、
   API access policyの順序/条件、制限フラグと適用API/version/resourceを全ページ棚卸しする。
2. Table API利用clientの担当者、認証方式、scope、利用method/version/resource、定期処理を列挙する。
   useraccountの特例だけで影響なしと決めない。tokenの列挙/値取得はしない。
3. 各ownerが正常時のcanary GETを定義する（固定record/最小fields、結果はstatus/件数のみ）。
   その他のmethodは設定影響を審査し、読み取りcanaryで書込み互換性も証明したとはしない。
4. 隔離環境を優先。共有PDIしかなければ変更時間帯、影響を受け得る全利用者、停止許容、
   監視時間、復旧担当、既存の独立した管理UIへのアクセスを確保する。
5. 新設/変更予定の正確なレコードとfieldの保存前値・関連・順序を非公開領域に記録し、
   復旧方法（無効化/元値復元/必要なら承認済み削除）を実行前に管理者が確認する。
   secretsを含む一括エクスポートをGit/このMDへ貼らない。

影響対象が不明、owner不在、復旧用管理経路がない、拒否がscope起因と特定できない場合はG3不成立。
既存client全体へのscope追加、useraccount追加、ACL/全体プロパティ変更を互換性対策として自動実施しない。

## 7. 停止・復旧・終了（実行前に別承認）

| 段階 | 手順案・確認 |
|---|---|
| 直ちに停止 | 新しい認可/交換/API要求を止め、callback/worker/ハーネスを終了。タイムアウトは発行有無不明として管理 |
| 専用tokenの封じ込め | 承認した失効手段で今回のtoken/同意だけを対象にする。登録無効化やローカル破棄だけで既発行tokenが失効したと仮定しない。失効未確認なら有効期限まで隔離・監視 |
| 専用登録 | 今回の登録を無効化する案。無効化/失効の効果順序は事前確認。既存client001/標準登録へ触れない |
| 共有設定を復元 | 今回の変更だけを依存関係の逆順で保存前値へ戻す。新設mappingは事前承認した無効化/削除、既存変更は元値復元。共有scopeを他clientが参照していれば削除しない |
| 復旧確認 | 保存前の設定/関連/順序との照合、ownerごとのcanary GET再実行、予定ジョブの監視。改善しなければ追加変更せず管理者へ移管 |
| 後始末 | 専用scope/関連の参照と残存tokenを確認してから承認済み範囲のみ整理。監査記録/バージョン履歴は保持。秘密の保存物は作らず、結果は集計/理由のみ |

共有mappingを外すことは元の広いアクセスを復活させ得る。復旧もセキュリティ影響のある設定変更として
範囲と実行時承認を得る。全scope保護停止やDisable client restriction変更を緊急の既定手順にしない。
適用前baseline自体が安全だと保証するものではなく、復旧後の残存リスクは別課題として報告する。

## 8. 最小実行順・結果票

G0/G1 → G2/G3の個別承認 → 変更前canary baseline → 承認済み変更/保存後再読取 → 変更後canary確認 → G4 → P01=L01 →
P02/P03 → P04/P05/P06 → L02/L03/L04/L05 → S01/S02/S04 → G5成立時だけS03 → 復旧/終了確認。
最初の不合格で停止。共有設定なしで試験できる部分を先に行う場合も空scope/useraccountへは代替しない。
各ケースは1回、ネットワーク自動再試行なし。正常系共用を除きcodeの再利用なし。
G4の上限案は認可10回・交換5回（異常成功を含む）。超過/再実行は再承認する。

結果票：case_id / 実施日時 / gate承認参照 / 設定snapshot参照 / 対象method・resource分類 /
認可・交換・APIの到達段階 / HTTP status / 固定理由 / code発行有無bool / token発行有無bool /
副作用確認 / pass・fail・inconclusive・not_run / 失効・復旧確認 / limitations。
code/token/state/verifier/client secret・URL query全文・レスポンス本文・コード本文は記録しない。
client識別の対応表/復旧詳細は別権限領域に置く。結果票は全件not_runから開始する。
成功時もS256利用可/強制、URI保存/認可/交換、scope設定/実効拒否を独立して結論にする。

## 9. 公式根拠と適用上の留保

参照日2026-10-18。仕様と本プロジェクトの厳格化を区別する。

| 根拠 | 該当箇所・用途 |
|---|---|
| [RFC7636](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.6) §4.3/§4.6 | method省略時plain、verifier照合/不一致拒否。plainが規格に存在することと本PoCのS256-only要件は別 |
| [RFC8252](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3) §7.3/§8.3/§8.4 | loopback HTTP/IP/受信口、port差の許容。PDIでの受理実績は示さない |
| [Authorization Workflow](https://www.servicenow.com/docs/r/platform-security/authentication/authorization-workflow.html) Public Client - PKCEの認可/交換表 | S256/challenge/verifier。family固定とPDIの降格拒否は未確認のまま |
| [Configure REST API Auth scope](https://www.servicenow.com/docs/r/platform-security/authentication/configure-rest-api-auth-scope.html) Table APIの3構成例 | 公式検索本文はAustralia・2026-03-12更新。GET/method/version/resource指定。PDIの適用実績ではない |
| [REST API Auth Scope](https://www.servicenow.com/docs/r/platform-security/authentication/rest-api-auth-scope.html) Note / Configurations | 公式検索本文はAustralia・2026-03-12更新。既存tokenへの影響、useraccountの特例、関連付け |

未確定：サーバー側の認可判定ログ/診断機能、保存時制約、正確なAPI resource/version、
制限フラグの組合せ、失効手段、隔離試験先、canary対象/担当者。これらを推測で埋めない。
