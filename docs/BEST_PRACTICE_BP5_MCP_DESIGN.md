# BP-5：Update SetベストプラクティスレビューのMCP統合設計案

Version: bp5-mcp-design-0.2 / Date: 2026-10-17。
Status: **1件/集約JSON契約、bounded取得プリミティブ・認証固定と合成テストを実装。MCP登録・リリース解決器・解析/集約アダプター・同期解析の強制中断は未実装**。
製品採用・根拠/判定境界・人手品質の承認は未実施。実装や公開を承認する文書ではない。
契約の実装範囲・使い方・未実装境界は[第1段階の契約記録](BEST_PRACTICE_BP5_CONTRACTS.md)を参照。PDI照会/書き込み・本試行ケース作成は行っていない。
取得プリミティブの実装範囲・制限・検証は[bounded取得記録](BEST_PRACTICE_BP5_BOUNDED_ACQUISITION.md)を参照。

## 1. 初版の範囲

提案ツール名：`review_update_set_best_practices`。まだ存在しないツール。
対象はローカルUpdate Set（sys_update_set）に保存されたsys_update_xmlの**payload版**だけ。
サーバー上の現行資産、sys_remote_update_set、子Update Set/バッチの再帰探索、名前検索は対象外。
sys_id指定で同名/別scopeの取り違えを避け、現行コードへの黙ったフォールバックはしない。

初版の規則はAU-BR-001/002、AU-CL-004だけ。Business RuleとClient Scriptのscript本文を対象とする。
残り24規則、Script Include等の検出は統合だけでは増えない。SCAやSecurity Centerとは別機能。
公式台帳の表引き/キーワード検索を利用し、埋め込み・外部LLM・CDN/OSVへの送信は行わない。
結果は候補/low/info、本文非返却。実行経路・実機違反・脆弱性・例外承認を確定しない。

## 2. 既存部品と追加が必要な境界

| 既存コード | 再利用する部分 | そのままでは足りない部分 |
|---|---|---|
| [updateset.ts](../src/tools/updateset.ts) のscan_update_set_sca | 親取得→metadata一覧→対象payload詳細という取得の段階分離 | SCA専用の抽出/外部照会/集計契約は流用しない。既存のextractUpdateXmlTextも使用しない |
| [client.ts](../src/servicenow/client.ts) のgetRecord/queryRecords | 既存インスタンス・認証・fields指定・Table API経路 | requestはresponse.json()/text()を読むため、取得後の文字列長チェックだけでは受信上限にならない |
| [payload-review.ts](../src/review/payload-review.ts) | reviewUpdateSetPayloadのbp3-0.4ローカル解析 | 1件単位のみ。入力のrelease証拠は呼出し側から供給。MCP取得/集約は未実装 |
| [update-xml.ts](../src/review/update-xml.ts) | 拒否型XML抽出、識別照合、既存容量/深さ制限 | 抽出前のHTTP受信/全体処理の上限は別途必要 |
| [result-schema.ts](../src/review/result-schema.ts) | bp-review-0.1と由来/coverageの項目間検証 | 1件用。外側契約に加え、operator_config/assertedを保持する1件契約の別版が必要（§4.1） |
| [server.ts](../src/server.ts)、[tools/index.ts](../src/tools/index.ts) | セッション別InstanceContext、定義登録/dispatch/annotations | ツール未登録。serverの一般エラー出力/ログへ原エラーを通さないアダプターが必要 |
| [package.json](../package.json) | 現在はdist/reviewをnpmから除外 | 統合後は依存する実行コードを梱包する必要あり。除外を消すだけで公開せずpackテストで確認 |

## 3. 提案入力契約

全階層で追加キー拒否、JSON Schemaとランタイムの双方で検証する。

| 入力 | 制約・既定値 |
|---|---|
| update_set_sys_id | 必須、32桁小文字16進。名前・URL・encoded queryを受け付けない |
| rule_ids | 任意、既定は先行3規則。3規則の列挙、重複不可、1〜3件。未実装IDは入力拒否 |
| max_records | 任意、整数、既定20、1〜100。対象外/削除を含むmetadata行の予算であり解析成功数ではない |
| instance | 既存serverが消費する選択値。ハンドラーへ転送せず、選択済みclientを固定して使う |

raw payload、コード、query、fields、table、URL、release、actor/impersonation、code_return_mode、
任意の保存先は入力に設けない。利用者が「Australia」「管理者権限」を自己申告する経路を作らない。
初版は同期1コールのみで、継続cursor・ジョブ・保存キャッシュは提供しない。

## 4. 取得経路と版の扱い

以下のTable API呼び出しは**実装案**。今回PDIで実行していない。

1. 入力検証後、MCPセッションのclient/認証文脈を固定し、期限・受信予算を開始する。
2. sys_update_setを指定IDで取得。fieldsはsys_id,state,application,sys_updated_on,sys_mod_countのみ。
   取得不可なら終了。名前で探し直したり、別インスタンスへ切り替えたりしない。
3. §4.1のC方式で証拠を取得する。sys_cluster_stateはfields=build_nameだけ、最大21行、
   可視ノード上限20。読めなければ有効な運用者設定を利用し、実測/設定の由来を区別する。
   ノード混在・上限超過・実測と設定の不一致はunknownで、設定による上書きは禁止。
   内部アドレス・証明書等は要求/返却しない。権限昇格やロールの自動付与は行わない。
4. リリース不一致/不明ならpayloadを取得せずpartialで終了。mismatched/unknownを明示し、
   評価済み規則・指摘を0件とする。metadata自体も未収集と記録する。
5. sys_update_xmlを固定クエリupdate_set=<検証済みID>、sys_id昇順、limit=max_records+1で一覧取得。
   fields=sys_id,update_set,name,type,action,sys_updated_on,sys_mod_count。最大101行なので初版は1ページ。
   metadataでも必須値/所属/IDの重複を検証する。上限超過なら先頭max_recordsだけを対象にする。
6. 対象資産はnameのテーブル接頭辞と後段XMLの識別を照合する。表示用typeだけで本文種別を確定しない。
   DELETEは削除として記録。対象外種別も行予算に数え、無制限に次を探さない。
7. 対象行ごとに、sys_id=<行ID>かつupdate_set=<親ID>の固定条件で詳細を1件取得。
   fields=sys_id,update_set,name,action,sys_updated_on,sys_mod_count,payloadだけを要求する。
   所属・ID・版/メタデータが一覧と一致しない場合は解析せずchanged_during_review等にする。
   必須列がACL等で省略されても空値として安全とみなさない。原エラーやpayloadは返さない。
8. 資産に適用する要求規則だけを割り当て、証拠の別版契約に対応させたローカル解析へ内部転送する。
   BRには要求されたBR規則、Client Scriptには要求されたCL規則を渡す。
   適用規則0件はnot_applicableとして外側へ記録し、空配列を1件用スキーマへ渡さない。
9. 同じmetadata一覧と親を再照会し、ID/順序/版/所属の観測差を確認する。これはトランザクション的な
   snapshot保証ではない。範囲外の変更、ACLによる不可視、観測間で元に戻った変更等は証明できない。
10. 集約不変条件と全1件結果のスキーマを検証し、本文を含まないJSONだけを返す。

最後の照合が失敗/中断/変化検出なら、analysis_complete=false、consistencyをunverified/changedとし、
収集済み候補が残る場合も「観測時点の暫定結果」と明示する。current_recordへ差し替えない。
再照会予算は先に確保し、予算切れを「変更なし」としない。

### 4.1. リリース証拠：C方式（結果契約のみ実装、取得/解決は未実装）

sys_cluster_stateを読めることを全利用者の必須条件にしない。cluster_node_admin等のロールを
このツールのためだけに要求/付与するA方式ではなく、実測優先＋運用者設定のC方式を採用する。
PDI（Australia）のACL定義は読み取りで照会済み（sys_cluster_stateはcluster_node_admin等、
sys_update_xmlはupdate_set_previewer等）。最小権限アカウントでの実効アクセスと他環境の条件は未検証。

**運用者設定の境界**：instances.json等のサーバー側インスタンス設定へ、提案キー
`review_release_assertion`を追加する案。現時点では未対応で、既存設定へ追加する作業は行わない。
設定者は接続先と導入/アップグレード履歴を確認できる運用者。MCP呼び出しの引数・ヘッダー・
会話中の申告・payloadの値で設定を上書き/更新できるAPIは提供しない。

| 設定要素（案） | 検証と扱い |
|---|---|
| family | カタログと照合する正規化可能なファミリー名。未知名をAustraliaへ変換しない |
| instance_binding | 対象インスタンス設定のIDと正規化した接続先との対応。接続先変更時は失効させる。生URLは結果へ出さない |
| asserted_at / expires_at | 運用者の確認時刻と明示的な期限。未来の確認日時・期限なし・期限切れ・逆順は無効。自動延長しない |
| evidence_reference | 運用者が確認した導入/アップグレード情報の私有参照。コード/秘密を入れず、MCP結果にはその内容を返さない |
| 設定権限・版 | 運用者だけが変更できるファイル/秘密管理領域で管理。一般利用者が書込可能なら信頼設定として採用しない |

許容する最大有効期間と再確認の運用周期は実装前に運用者が承認する（未決定）。明示期限だけで
設定の正しさを保証しない。アップグレード時は期限前でも失効/再確認し、設定再読込は版を検証して
呼び出し開始時に固定する。原設定パス・運用者の実名・証跡本文を返さない。

設定申告で開始するには、asserted_at ≤ started_atかつexpires_at > started_at + deadline_msを要求する。
残り有効期間が60秒以下（同値を含む）ならpayload取得を始めず、none/unknown、
config_validity_insufficientを記録しrelease_unknownで全要求規則をスキップする。
集約は開始時の設定証拠を検証し、終了時刻で再採用/失効判定しない。
1件結果はreviewed_at基準を維持し、集約では0 ≤ ended_at − started_at ≤ deadline_msも検証する。
これらの結果契約上の制約は実装済みだが、取得アダプターの開始判定・実時間の中断は後工程。

| 実測の観測 | 設定の状態 | 採用証拠・処理 |
|---|---|---|
| 可視範囲で値が1ファミリーに一致、20行以内 | 未設定または同じfamily | source=sys_cluster_state.build_name、resolution_status=resolved。設定が期限切れ等ならその警告は残すが、正当な実測は利用できる |
| 可視範囲で有効な実測あり | 設定familyが異なる（期限切れも含む） | source=conflict、resolution_status=unknown、release_evidence_conflict。実測優先で黙って採点しない |
| ノード値混在・部分的欠落/不明形式・21行目あり | 有効設定を含む任意の状態 | unknown、release_observation_inconsistent/incomplete。設定で矛盾/不完全な観測を覆わない |
| 当該テーブル403/404、正常0行、全行値なし、当該照会のtimeout/5xx等 | 接続先一致・期限内の有効設定 | source=operator_config、resolution_status=asserted。observedではなく申告由来として候補解析を許可する案 |
| 上記の取得不能 | 設定なし/期限切れ/不正/接続先不一致 | source=none、resolution_status=unknown。payloadを取得せずrelease_unknownで全要求規則を未評価 |
| 認証401、親Update Setの拒否、全体期限/受信予算切れ | 任意 | 設定で認証/親権限/予算を回避しない。§7の停止・失敗契約に従う |

一部の行だけ欠ける観測と、列が全く読めず実測証拠が得られない状態を区別し、取得失敗の固定理由を残す。
実測値があって設定構造自体が不正なら、設定を無視せずconfig_invalidとしてレビュー開始を拒否する。
認証/通信/ACLによる失敗の原文は露出しない。実測が取得できた後のカタログ不一致を設定で救済しない。

**結果契約案**：`source`はsys_cluster_state.build_name / operator_config / conflict / none、
`resolution_status`はresolved / asserted / unknown。familyはresolved/assertedだけで保持する。
実測はobserved_at、設定はasserted_at/expires_atと取得したconfig版の識別子を記録し、
設定のfamilyをraw_buildnameとして偽装しない。sourceと状態/各時刻の対応を相互検証する。
conflict時は矛盾したfamilyだけを最小限に別記し、採用familyはnull。証跡未設定はnullで捏造しない。

release_matchはmatched/mismatched/unknownを維持するが、assertedのmatchedは**設定とカタログの一致**のみ。
実測で確認済みという意味ではなく、limitationsにrelease_operator_asserted、release_not_observed、
release_config_may_be_staleと取得不能理由を必須化する。設定でも非対応familyならmismatchedで解析しない。
asserted経路はstatus=partial固定、候補のみ、検証状態の昇格不可。resolvedでも可視ノードだけの観測という
限界は残す。source未承認・実行経路未検証の既存制限も除去しない。

**互換性上の前提**：既存bp-review-0.1はsource=sys_cluster_state.build_name、状態resolved/unknownに
限定されている。外側だけでoperator_configと書き、内部へresolvedと偽装する実装は不可。
1件結果/入力を提案bp-review-0.2へ別版化し、解析入口と項目間検証もassertedに対応する必要がある。
過去のJSON・固定セットは旧契約/プロファイルのまま再現する。本統合の外側も提案
bp-mcp-review-0.2として、ネストする1件契約の版を明示する。実装前にこれらの仕様を承認する。

## 5. 権限・情報境界

ServiceNowのTable/Record/Field ACLを通る既存の認証clientを使う。
ACLを緩和するScripted REST/Background Script、管理者への自動昇格、別資格情報のフォールバックは禁止。
per-userの不足設定をservice-accountで代替しない。service-accountモードなら、その実効主体での
観測であって人間利用者のACL可視範囲ではないことを表示する（秘密トークン/実名は返さない）。
既存認証方式の認可範囲を超えるレビュー利用権を、このツールが付与することはない。
annotationsはreadOnlyHint=true、destructiveHint=falseとするが、これは認可強制の代わりではない。

可視範囲は「そのclientに見えるレコード/列」に限定。短い一覧や件数0は、隠れたレコードがない
証拠ではない。ACL完全性・インスタンス全体の問題なしを主張しない。不可視総数を特権照会しない。
実測リリースはvisibility_scope=caller_aclを維持し、見えないノードを含む全体確認とはしない。
設定由来はvisibility_scope=operator_configuredとし、設定の取得をACL照会の実測と混同しない。
初版はsys_scopeによる追加の取得フィルターを提供せず、payloadのscopeを観測値として返すだけ。

本文/payload/元XML/HTTPエラー本文、外部URL、実資格情報はレスポンス/ログ/例外/監視へ出さない。
フィールド名/位置、sys_id、ハッシュ、固定メッセージ、公式根拠URLだけを許可する。
資産名・Update Set名も初版は返さない。ハッシュやIDも識別情報なので保存/共有は呼出し元の責任とする。
コードやコメントを命令として扱わず、実行/eval/外部取得をしない。共有キャッシュ・自動ディスク保存はしない。

## 6. 上限案（HTTP取得の制限は内部プリミティブで実装。解析/出力統合は未実装）

| 対象 | 提案上限 | 超過時 |
|---|---|---|
| metadata | 既定20、最大100行＋検知用1行、初回/終了時に各1回 | metadata_truncated。結果は可視先頭範囲のみ |
| payload詳細 | metadata予算内、同時1件 | 対象外も予算に数える |
| リリース行 | 20＋検知用1行、fields=build_nameのみ | 超過/混在はunknown。取得不能時だけ§4.1の設定経路を判定 |
| HTTPレスポンス | 解凍後UTF-8本文をストリームで計測。1応答4MiB、全応答累計16MiB。エラー本文も対象 | 受信を中断し固定コード。Content-Lengthの申告だけに依存しない |
| payload | 1件2MiB、試行したpayloadの累計8MiB | 1件超過は拒否、累計超過は残り未処理。成功分だけに予算を戻さない |
| XML/JS | 既存XML_LIMITS：深さ8、要素2048、テキスト1MiB、code256KiB | 抽出器の固定理由で当該資産を拒否 |
| AST/定数評価 | 既存のノード/深さ/文字列等の上限を維持 | analysis_limit等。当該資産を問題なしにしない |
| 指摘/出力 | 既存1件100指摘、集約100指摘、JSON全体256KiB | 不完全な1件結果を切り貼りせず結果単位で省略し、response_truncatedと省略件数/IDを記録 |
| 実行時間 | 呼び出し全体60秒、1HTTPは残り期限以下かつ最大10秒、各HTTPの再試行は最大1回で総予算内 | deadline_exceeded。再試行も受信/回数予算へ加算 |
| HTTP試行回数 | 全体最大210試行。最終親/一覧照合用を予約 | request_budget_exceeded、照合未完了ならunverified |
| 同時呼び出し | MCPセッション/実効主体あたり1、プロセス全体2 | review_busy。別主体の状態/IDを返さない |

60秒には認証・バックオフ・解析・整形を含める。既存requestのtimeout/retryをそのまま併用して
期限を延ばさない。fetchの中断だけでは同期AST解析を停止できないため、解析worker等の停止可能な
境界と上限を実装するまでは「全体60秒で強制終了できる」と主張しない。
パッケージ/HTTP層が解凍する場合も実測する。上限を超えた本文を読み終わってから拒否する実装は不可。
省略ID一覧等も出力予算内に収める。固定100行の処理内訳を先に確保し、個別結果を載せられなければ
省略理由と未完了状態だけを残す。なお巨大レスポンスやCPU上限の対策は既存clientに未実装。

## 7. 外側JSON契約案と失敗時の扱い

外側schema_versionは提案`bp-mcp-review-0.2`、1件結果は提案bp-review-0.2（§4.1）。
既存bp-review-0.1の自由記述や履歴結果を上書きしない。

| 項目 | 内容 |
|---|---|
| status | completed / partial / failed。全体の統合処理状態。現在はsource承認待ちのため正常解析でもpartial |
| poc_only / code_return_mode | true / none。統合後もPoCを製品品質へ昇格させない |
| target / versions | update_set_sys_id、target_version=update_set_payload、catalog/ruleset/aggregate版、開始/終了時刻 |
| release / principal | 実測/設定/矛盾/証拠なし、resolved/asserted/unknown、matched/mismatched/unknown、資格情報モード、証拠ごとの可視範囲。秘密/実名は除く |
| collection | scope=caller_acl_visible、metadata_seen、selected、truncated、リスト照合の観測結果 |
| coverage | requested_rule_ids、資産別適用/評価/skip、analysis_complete、code/結果省略の内訳 |
| assets | 選択した各行につき1個の記述子。reviewed / not_applicable / skipped_deleted / rejected / retrieval_failed / not_processed / result_omittedと固定理由。成功分は検証済み1件resultを内包 |
| limits / consistency / limitations | 実際に適用した上限・打切り理由、stable_observation / changed / unverified、ACL/根拠未承認/未検証等 |
| errors | 段階、必要なら対象の可視sys_id、固定code。原サーバーmessage/本文/stackは除く |

statusのcompletedは将来承認を得て全適用規則・取得・一貫性確認が満たされた場合に限る。
候補が0件でも「安全」「違反なし」「全体レビュー済み」と翻訳しない。
source_approval_pendingや未承認のカード境界を隠さず、原解析resultのlimitationsも維持する。

| 失敗 | MCP/集約の扱い |
|---|---|
| 不正入力・未実装rule・親404/403・認証失敗 | isError=true＋固定エラーJSON、status=failed。親の不存在と不可視は区別できなければnot_found_or_not_visible |
| 初回metadata取得失敗 | failed。正常0件の空一覧とは別扱い |
| リリース未照合/不一致 | isError=false、partial、指摘0、全要求規則をrelease_unknown/release_mismatchで未評価 |
| 運用者設定の有効なasserted証拠 | isError=false、partial。カタログ一致時だけ候補解析。設定由来・古くなる危険と未実測を明記 |
| リリース証拠の矛盾/不完全な実測 | isError=false、partial、指摘0、release_unknownで未評価。limitationsに具体的な不一致/不完全理由を残す |
| 運用者設定の構造不正 | isError=true、failed、固定config_invalid。設定本文/パスは返さない |
| 1件のpayload列欠落/404/不正XML/解析拒否 | 記述子に理由を残しpartial。他の許可された資産は予算内で続行 |
| 実行中の401/403 | 全体の取得を停止しpartialまたは解析0ならfailed。自動昇格/ACL回避しない |
| 429/5xx/timeout | 規定の再試行だけ。予算内なら独立資産は続行可能、期限/全体障害なら残り未処理 |
| 変更検出・最終照合不能・件数/時間/容量/出力打切り | partial。暫定結果と未完了を区別し、打切り後の行はnot_processed/result_omitted |
| 集約/内部resultのスキーマ不整合・想定外例外 | isError=true、failed、当該呼出しの指摘を返さず固定internal_review_error。原例外を一般serverの応答/ログへ流さない |

一覧の短い正常応答は「可視範囲の収集完了」になり得るが、正常0件・全対象外・全拒否・全指摘0を
別々に集計する。選択行の記述子数、成功/拒否/未処理の総和、要求規則の適用/非適用/未評価の整合を検証する。

## 8. 実装前の決定事項と検証計画

- 人による規則/根拠採用・境界と、候補出力をMCPへ公開する範囲を承認する。カード案や公開校正22件をgold扱いしない。
- proposed上限、同時実行単位、受信中断/worker/認証の期限伝播、外側JSONの列挙値をレビューし固定する。
- C方式の設定キー/接続先対応/有効期間/更新権限と別版の1件/外側契約を承認する。設定ファイルを今回は変更しない。
- テスト：入力の追加キー/注入、名前拒否、セッション切替/認証主体分離、親/子の所属不一致、フィールドACL省略、
  不可視レコード、リリース混在/多ノード/拒否、種類混在、削除、同名別scope、実行中変更、重複IDを検証する。
- リリース証拠の試験：実測/設定一致、期限切れを含む不一致、mixed nodes、部分欠落、全値なし、上限超過、
  当該テーブル拒否と全体401の差、期限/接続先/設定構造不正、呼出し引数からの設定注入拒否、
  assertedをresolvedへ偽装できないこと、旧bp-review-0.1の互換再現を確認する。
- テスト：HTTPストリーム/エラー本文/解凍/再試行の上限、最大100＋1行、worker中断、全体期限、集約出力上限、
  一部拒否/全拒否/正常0件、最終照合不能、二重計上やcoverage漏れを確認する。
- 秘密を含む合成payload/原エラーで、レスポンス・ログ・監視にコード/資格情報が残らないことを検証する。
- 従来の固定セット/JSON契約は回帰用途で維持する。未使用の非公開48件を開発用テストへ取り込まない。
- 登録/dispatch/annotations/ツール数/文書、dist依存グラフとnpm packでreview実行コードの梱包を確認する。
- 実機確認は別途許可を得た読み取り専用の経路から開始し、ACL不足を修正するための設定変更は自動実施しない。

実装順案：外側契約/合成テスト → bounded取得/認証固定 → 1件解析アダプター/集約 → MCP登録/梱包 →
許可済み読み取りE2E → 品質/公開審査。現段階では外側/1件契約とbounded取得・認証固定のプリミティブ、合成テストを実装した。
人手運用48件の設計・保管先選定も別課題であり、MCP統合で完了したとは扱わない。
