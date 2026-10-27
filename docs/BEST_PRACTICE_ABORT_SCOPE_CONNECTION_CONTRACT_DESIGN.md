# AU-BR-006 接続契約：worker計画・観測・比較応答・上位診断

Version: br006-connection-contract-draft-0.2 / Date: 2026-10-26。
Status: **非同梱の検証専用worker IPC・XML/AST計画・比較・fixture上位結果を接続。本番worker／実source issuer／公開結果への接続・承認は未実施**。
親：[owner設計](BEST_PRACTICE_ABORT_SCOPE_OWNER_DESIGN.md)、[スコープ証拠・取得設計](BEST_PRACTICE_ABORT_SCOPE_EVIDENCE_DESIGN.md)。

HTTP側の証拠専用受信枠・最終再読の動的予約・停止分類は[bounded予算詳細設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md)を参照。予約台帳とstream課金/中断/oracleは合成実装したが、実transport/workerへの接続は未実施。合成channelのIPC枠と区別し、既存全体60秒/210試行は維持する。

証拠の実発行元とprivateな受領物、同sourceのReleasePermit/選択payload/予算への結合、固定GETと最終sealは[固定source issuer詳細設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_ISSUER_DESIGN.md)へ具体化した。合成の初回／最終接続・局所継続・sealは実装したが、実接続・本番seal・cap承認はまだ行っていない。

実workerへ渡す前段の[実session claim・private受領物・終了時失効の詳細設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)を追加した。選択window／payload開始・移譲claim、認証／permit結合、停止とphase世代の失効を扱い、実worker ownerが未接続の間は本文移譲口を有効化しない。

## 1. 対象と現状

合成ownerはpayload/初回/最終handleを生成して純粋比較器へ接続済み。ただし合成callerがcontext/hash/時刻を与えられ、実取得の証明ではない。本書は実session/source/jobへの接続条件と、後工程で実装するstrictな内部契約を定義する。現行のready/analyze/finish、公開0.2/0.3、明示14/既定3規則、固定評価セットは変更しない。

追加protocolの提案名は`br006-worker-0.1`。公開schema番号ではない。AU-BR-006要求時だけ利用する案とし、公開登録・次版schema発行は別工程。実source/workerを信頼するローカル構造であり、悪意ある同一processコードや侵害されたworkerを隔離する保証ではない。

## 2. strict schemaの共通規約・境界

以下の表はJSON契約の規範案。実行可能なschema定義ではない。**全objectを再帰的にstrict**にし、列挙していないキー・省略・型強制・default補完を拒否する。nullableは明記した箇所だけ。数値は有限のsafe integer。日時は既存と同じUTC ISO datetime、sys_idは小文字16進32桁、hashは同64桁。tableは`^[a-z][a-z0-9_]{0,79}$`。任意エラーメッセージ・stack・コード断片はfieldとして設けない。

§10の合成実装ではこの構造をZodのstrict schemaとchannelの意味/状態検査へ具体化した。本書の表自体は設計記述であり、schemaの構造検査だけで相関/状態の検査を代用しない。

親子のopaque handle/WeakMapは転送しない。送信側でサイズと構造を検証し、受信側もサイズ→構造→相関→状態→意味の順で検証する。structuredClone/postMessageは受信側検証より前に複製が起きるため、受信後の検査だけで複製メモリを防げるとは主張しない。固定送信者の送信前検査・既存workerメモリ上限を併用する。

### 2.1 固定envelope

| field | 型・制約 |
|---|---|
| protocol | literal `br006-worker-0.1` |
| run_nonce / worker_generation | 親内部で独立生成する各64桁小文字16進文字列。外部入力/ログへ出さない |
| request_id | 1以上のsafe integer。同worker世代内で単調増加・再利用なし |
| job_id | asset要求は1..100のrun内番号。helloのみnull |
| kind | 要求：`hello` / `prepare` / `observe_initial` / `observe_final` / `compare`。応答：対応する`*_ok`または`error` |
| body | kindごとのstrict discriminated object。自由形式object/unknownをwire契約に残さない |

readyは既存固定1キー通知を先に検査する。その後helloでprotocol/run/世代を照合し、`hello_ok.body={accepted:true}`を受理してからasset要求を許可する。hello要求bodyは`{}`。nonce一致だけでは証明にならない。親が保持する実Worker/port、未解決request、job台帳、期待kindがすべて一致することを要する。

同workerの未解決要求は1個。待機queueは作らず二重開始を拒否する。unknown kind/追加キー/重複/要求番号逆転/overflow/異なるjobはrun停止。close済み世代のlate messageは捨て、新しい世代へ移植しない。active時の不正messageを黙って無視してtimeout待ちにしない。

### 2.2 提案する下位byte/保持枠

サイズはenvelopeを含むUTF-8のJSON表現で送受信とも計測する。これらは**内部上限案で未承認**。既存全体上限を増やさない。

| 種類 | 上限案 |
|---|---|
| hello/error | 各4KiB |
| prepare要求 | 12MiB + 64KiB。payload自体は既存2MiB以下。JSON escapeで最大約6倍になる分を別に見込む |
| prepare応答 | 64KiB、site最大100かつ他規則と共有する候補残枠内 |
| 初回/最終観測要求 | 各16KiB。HTTP応答の16KiBとは別にenvelope込みで検査 |
| 観測ack / compare要求 | 各4KiB |
| compare応答 | 64KiB。従来のworker応答262,144 bytes以下も満たす |
| run内保持 | 子の計画累計256KiB以下、正規化観測/対応表と合わせて1MiB以下。AST/本文を計画として保持しない |

prepare要求だけは既存payloadを含む。本文非露出は「利用者向け結果/ログに出さない」という意味で、信頼する既存解析workerへの本文入力は必要。HTTP受信16MiB・payload累計8MiBを既存sessionで課金する。IPC転送を新しいHTTP受信とは数えないが、別のIPC/保持会計を省略しない。上限超過時は本文を返さず停止/未評価理由を残す。

## 3. prepare要求と計画応答

### 3.1 `prepare.body`

| field | 型・由来 |
|---|---|
| target | strict `{update_set_sys_id, update_xml_sys_id, asset_sys_id}`（すべてsys_id） |
| metadata | strict `{name:string[1..200], action:literal INSERT_OR_UPDATE, sys_updated_on:string[1..40], sys_mod_count:decimal string[1..20]}` |
| instance_binding | hash。同じ実session/sourceの固定値 |
| payload | string。取得済みの選択行payloadだけ。UTF-8 2MiB以下 |
| retrieved_at / started_at | 日時。親の受領/開始時刻から生成する |
| deadline_ms | 1..60000。実sessionの開始時に固定した期限幅 |

callerが自由にこのobjectを構成してMCPへ渡す口は作らない。sourceの詳細受領物と選択metadataを親のprivate台帳で結ぶ。workerは安全XML抽出・対象ID/action/BR型・when・AST制限を再検証し、payload/code hashを実際の受信文字列/抽出本文から既存方式で計算する。親が申告したhashで代用しない。

### 3.2 `prepare_ok.body`

共通fieldは`target`（要求の3 ID）、`payload_hash`、`code_hash`、`state`。state別に下記だけを許可する。

| state | 追加field |
|---|---|
| `needs_observation` | `plan_id`（job内固定1）、`collection`（table）、`sites`（1..100個） |
| `not_needed` | `reason`：`no_target_call` / `unsupported_when` / `receiver_unresolved` / `argument_unresolved` / `declared_table_unknown` |

siteはstrict `{site_id, start, end}`。site_idはjob内1..100・重複なし。start/endは各strict `{line, column}`、line=1..1,000,000、column=0..2,097,152の整数。安全抽出したscript内の位置で、start<=end・ASTノード位置と一致を子が検証する。引用本文は含めない。

`needs_observation`はbefore BRのcurrent由来・1引数setAbortAction(true)という限定構文に合う場合だけ。false・独自receiver・別GlideRecordは対象にしない。未解決のreceiver/引数は`no_target_call`に潰さない。when対象外は次版結果でmissing_contextに、未解決はanalysis_complete=falseに対応させる。

scopeの実値・AST・script・自由記述を応答へ含めない。子がjobごとにpayload scope tokenと位置/判定の必要最小限を保持する。collection=globalは具体的tableではなく`declared_table_unknown`。scope不足はtable取得で補完せず、最終比較でUnknownにする。planは同job1個だけで、再prepare/別payload差替えは拒否する。

不正XML/ID不整合/構文解析不能はnot_neededではなく既存固定抽出/解析拒否としてerrorへ返す。hashの計算自体も実認証の証明ではなく、実source受領物との結合が別途必要。

## 4. 初回/最終観測要求・ack

`observe_initial.body` / `observe_final.body`はstrict `{plan_id:1, payload_hash:hash, code_hash:hash, observation:Observation}`。envelopeのjob/世代・prepare結果と完全一致を要求する。Observationは次のstrict union。

共通：`source='sys_db_object.current'`、`visibility_scope='caller_acl'`、`phase='initial'|'final'`、`observed_at=日時`。kindとphaseは一致必須。

| state | 追加field |
|---|---|
| `rows` | rows：0..2件のstrict Row |
| `unavailable` | reason：`not_collected` / `not_found_or_not_visible` / `field_unavailable` / `invalid_observation` / `ambiguous_table` / `upstream_unavailable` / `evidence_limit` / `final_recheck_unavailable` |

Rowはstrict `{sys_id, name, sys_scope, sys_updated_on, sys_mod_count}`。sys_id/table/版は共通制約、sys_scopeは`global` / sys_id / null。nullだけがscope取得不能で、空/表示名/reference objectをGlobalへ変換しない。必要列欠落・形不正をwireでそのまま渡さず、固定sourceが`field_unavailable`/`invalid_observation`へ正規化する。sys_scope=nullは比較でUnknown。2件は曖昧、0件は不存在/不可視を区別できない状態として扱う。name不一致はbinding不正で停止する。

HTTP応答の任意キーをspreadせず、必要5列を固定射影する。外部URL/query/fields・token・raw response・証明済みbooleanを追加しない。401/403、全体予算/期限/取消はこのunavailable列挙に入れず、親の全体停止経路で扱う。

ackのbodyはstrict `{plan_id:1, phase:'initial'|'final', accepted:true}`。これはphaseの受理確認だけでknown scope/一致を意味しない。初回受理後だけ最終要求を許可し、同phase再送も拒否する。table cacheの共有原観測を各子contextに結び直す際も、別jobのhandleは転用しない。

## 5. compare要求・応答

`compare.body`はstrict `{plan_id:1, payload_hash:hash, code_hash:hash, compared_at:日時}`。親内部の現在時刻を使うが、実時間中断は同sessionのremainingMs/signalとsupervisorで別途強制する。日時の自己申告一致をdeadline保証にしない。

`compare_ok.body`はstrict `{plan_id:1, payload_hash:hash, code_hash:hash, result:Comparison}`。Comparisonは既存純粋比較器の固定fieldだけを持つ：

- `status`：`compared` / `insufficient` / `changed`（`rejected`は正常応答にしない）。
- `comparison`：`same_literal` / `same_reference` / `different_reference` / `unknown`。
- `temporal_relation`：literal `payload_vs_current_declared_table`。
- `reason`：null、または既存の不足/変更理由のみ。`declared_table_unknown` / `global_table_target_unknown` / `initial_evidence_unavailable` / `final_evidence_unavailable` / `table_changed` / `scope_missing_or_invalid` / `global_alias_unproven`。
- `evidence_phase`：`initial` / `final` / null、`unavailable_reason`：§4の理由 / null。
- `limitations`：現行`SCOPE_EVIDENCE_LIMITATIONS`の固定8要素を過不足・重複なしで保持。自由な補足文字列は不可。

意味検証も必須。comparedはreason/phase/unavailable=nullでunknown不可。changedはcomparison=unknown・reason=table_changed・phase/unavailable=null。insufficientはcomparison=unknownで、初回/最終unavailableのreasonとphase/詳細理由が対応し、それ以外はphase/詳細理由=null。Global literalと参照IDのalias未証明をdifferent_referenceへ変更しない。

比較claimは実job台帳に置き、比較前の検査で失敗しても戻さない。純粋比較器がrejectedならerrorを返してownerを停止する。insufficient/changedでも再比較しない。親はwire結果をそのまま上位へ渡さず、実worker/未解決要求/active状態を確認して親realmのprivate completionへ変換し、上位ownerへ一度だけ格納する。raw JSON/合成receipt/直接比較の結果ではこのcompletionを作れない入口にする。

## 6. 実session/source/jobと期限の結合

| 境界 | 必須結合・検査 |
|---|---|
| 親owner生成 | 実BoundedReadSession参照・認証snapshot内部identity・実BoundedUpdateSetSource・同sourceが発行したmatched ReleasePermit。session側生成claimは失敗後も戻さない |
| asset job | 選択metadataの私有受領物、同Update Set/Update XML/asset ID・版、同sourceのpayload受領物、実worker/世代/要求の台帳。任意scalarだけで生成しない |
| prepare | workerが同受領payloadを解析。返ったtarget/hash/planを親の対応表へ一度だけ格納。別行/別世代で再利用しない |
| table観測 | 固定GET issuerだけが発行。検証済みcollection、同session/認証、初回/最終の受領時刻・source receiptへ結合。親台帳とwireは別物 |
| 子の証拠 | 現realmで新しいcontext/handleを生成。nonceやhashだけで真正性を宣言せず、固定親portとjob進行を検査 |
| completion受理 | 同owner/session/世代/jobと親/metadata/最終table再照合を確認後、一度だけ上位結果へ確定 |

通常phase50秒・整合phase55秒・全体60秒を延長しない。全table最終観測と比較・整合の完了は55秒まで、残りは既存集約/worker終了処理に使う。時刻逆行/比較前後の矛盾は固定理由で停止し、clampで救済しない。

初回table観測は同runの別payloadより前でもよいが、最終は当該payloadと初回の両方より後。同run8table案のcacheだけを共有し、他認証/runへ持ち出さない。soft cutoff時は新prepareを止め、未完了BR-006は理由付き未評価。集約用の新workerで旧jobの証拠発行を再開しない。

## 7. error schema・固定理由・上位保持

`error.body`はstrict `{stage, code}`だけ。envelopeのjob/requestは元要求と同じ。stageは`protocol`（hello失敗のみ） / `prepare` / `initial` / `final` / `compare`。codeは下表のworker由来に限り、hello失敗はinternal_review_errorに固定する。元例外・URL・scope値・nonce・認証identity・payloadは含めない。

親側の型付き終端案：strict `{state:'stopped', stage, code, cleanup}`。stageは`owner` / `prepare` / `initial` / `final` / `compare` / `protocol` / `output`、cleanupは`not_started` / `confirmed` / `unconfirmed`。実owner内で最初のstage/codeをprimaryに固定し、後のcleanup失敗で上書きしない。追加cleanup理由は固定1件だけとし、履歴を無制限に積まない。これは**内部契約案**で、現行公開JSONへキーを追加しない。

| 発生元・固定code | 意味・上位での扱い |
|---|---|
| 子：既存asset抽出/解析拒否code | `aggregate-schema.ts`のrejected.reasonの現行列挙に限定。対象assetをrejected・BR-006未評価。原文は返さない |
| 子：`evidence_invalid` / `evidence_missing` | 不正/欠落を補完せずrunのowner停止。上位内部diagnosticへ同codeを保持 |
| 子：`evidence_binding_mismatch` / `invalid_phase_order` / `invalid_state` | 別証拠/順序/再利用違反。run停止、再生成・自動再送禁止 |
| 子：`invalid_evidence` / `invalid_observation_time` / `table_binding_mismatch` | 純粋比較のrejected。固定reasonを保持してrun停止 |
| 子：`comparison_deadline_exceeded` | supplied時刻が比較期限に達した。上位の停止codeはdeadline_exceeded、内部primaryには元reasonを保持 |
| 親：`protocol_invalid` / `worker_unavailable` / `worker_exited` | 不正応答/起動不能/途中終了。run停止。同jobを別workerへ再送しない |
| 親：`authentication_failed` / `access_denied` | 既存transportの全体停止をそのまま優先。scope不足へ変換しない |
| 親：`deadline_exceeded` / `cancelled` / `request_budget_exceeded` / `receive_budget_exceeded` / `payload_budget_exceeded` | 既存の全体停止/partial契約を維持。残件に理由を付け、証拠の再生成で迂回しない |
| 親：`scope_evidence_limit` | 下位table/受信/保持枠不足。当該BR-006を未評価、他規則は従来契約の範囲で保持 |
| 子/親：`internal_review_error` | 列挙へ安全に分類できない内部失敗。生例外を出さず停止 |

protocol_invalid等の新内部codeを現行公開errorsへそのまま渡さない。既存callerへ接続する間はinternal_review_error等の既存codeへ固定対応させ、元の型付きprimaryは上位内部ownerに保持する。新たな公開診断を必要とする場合は次版schemaで明示定義する。cleanup=unconfirmedをconfirmed/成功へ変換しないための新しい上位保持契約が必要であり、現行adapterが対応済みとはしない。

workerでない親の認証/予算/取消codeを子が自己申告することはできない。未知codeやstageとkindの不一致はprotocol_invalid。既存抽出拒否codeとowner不整合を混ぜて「単なる不正asset」として続行しない。

合成ownerの理由をwireへ移す際も固定対応を設ける。`binding_mismatch`/`session_claimed`/`invalid_session`は接続境界でevidence_binding_mismatch、`invalid_state`は同名、`phase_failed`は別途分類できる実source診断がなければinternal_review_errorとする。`limit`（job発行/予約の100件上限）は下位枠不足と同じ`scope_evidence_limit`へ対応させ、当該BR-006を未評価にする。closed/cancelled/worker_exitedは親の実終了状態と照合して親停止へ渡し、子の自己申告だけで親状態を書き換えない。合成fixtureの任意reasonを本番errorの自由文字列にはしない。

## 8. 上位レビュー結果への意味対応（次版の前提）

| 内部結果 | 次版上位結果で要求すること |
|---|---|
| not_needed/no_target_call | 限定構文の候補0。scope適合や実行成功を認定しない |
| unsupported_when / 未解決receiver・引数 | missing_context/未解決を保持し、評価済みclearと混同しない |
| compared/different_reference | before/current/trueの構文siteと安定観測が揃った場合だけinfo/low/candidate。実中止失敗と断定しない |
| compared/same_* | scope差候補0。payloadと現行設定の時間差・実table未確認等の制限は保持 |
| insufficient | BR-006未評価、固定理由と必須制限、analysis_complete=false |
| changed/最終観測不能 | 暫定BR-006候補を撤回、partial/未評価。既存他規則は従来失敗契約の範囲で保持 |
| 停止/cleanup未確認 | 正常な比較完了としない。primaryとcleanupを上位で保持し、全体の期限/取消契約に従う |

同じassetの他規則まで未評価とする必要があるかは停止の種類に依存する。scope不足/変更はBR-006限定、認証/期限/通信protocol不正はrun停止。この区別を集約refinementで検証する。source_approval_pendingを保持し、現行PoCのcompleted禁止も解除しない。

公開schema版・BR-006 follow-up語彙・新coverage理由の正式列挙は別工程で具体化する。この内部設計だけでは公開0.2/0.3へBR-006を混入させられない。

## 9. 実装前の決定・合成検証条件

承認待ち：本書の新byte/保持枠、8table/16KiB/256KiB・動的試行予約の提案値、時点差候補の採用と公開結果語彙。費目の所有者はtransportが全HTTP/受信/retry、sourceがtable受付/再読、supervisorがIPC/worker終了、ownerがclaim/相関/保持、集約が出力上限。重複課金/予約流用を防ぐ具体的な計数器は後工程で実装・独立計数する。

必須合成試験：全kind/全fieldの追加・欠落・型/上限・nonce/job/hash/phase違い、重複/late/restart、prepareの安全XML/対象/AST判定、全観測unionと不正な停止理由混入、comparisonのcross-field矛盾、部分証拠/直接比較JSONのcompletion偽造、失効競合、最初の診断保持とcleanup未確認、50/55/60秒・取消・予約/下位byte枠、本文/秘密非出力、旧0.2/0.3と固定評価セットの互換性。

次の実装単位は、まず**合成channelでのstrict envelope/body・相関・上位診断owner**までに限定する。その後、bounded下位予算/予約→固定source issuer→実worker/AST計画→次版上位JSONの順で接続する。本書作成では実装・実機操作・トークン発行・設定変更を行わない。VM/監視/telemetry保留・Unknown・全体受付無効・permit非発行を維持する。

## 10. 合成channelの実装範囲

`abort-scope-evidence-protocol.ts`で全5要求/6応答kindとnested body、比較結果のcross-field制約を実装。`abort-scope-evidence-channel.ts`は実Workerの代わりに、生成した不透明な合成peerの参照一致を検査する。nonce/世代は合成fixture入力で、実認証/実session/実workerの証明ではない。raw wireは文字列だけを受理し、UTF-8サイズ検査後にJSON.parse→strict schema→要求/世代/job/kind→状態/意味検査を行う。JSONの重複キー検出専用parserではなく、JSON.parseの通常の解釈を使う。

beginは同時未解決1件・単調増加要求番号・hello/prepare/初回/最終/compareの進行を所有する。prepareのmetadata名とasset ID、時刻幅を検査し、最初のprepareのinstance/Update Set/開始時刻/期限幅へ後続jobを結合する。これは同じ合成scalarの固定であり、実source receiptの結合ではない。prepare応答のtarget、以後のhash/plan/観測phase/nameを照合する。job IDは1..100、同Update XMLの再prepareを拒否し、site累計100・plan応答累計256KiBを合成枠として適用する。既存他規則との候補残枠の共有はまだ接続していない。

不正wire/未知code/重複/別peer/相関違いは停止し、未解決要求と計画を破棄する。先行stage/codeをprivateな診断ownerへ固定し、診断snapshotは凍結データだけを返す。失効後は遅延応答を受理せず、新世代での再開入口も作らない。cleanupは合成通知であり実OSの解放証明ではない。unconfirmedは後のconfirmedで上書きできず、primaryもclose相当の再通知で消さない。

既存asset抽出/解析拒否はprepareに限りasset-localとして固定codeを最大100件保持する。後のrun停止でもその診断を消さない。他phaseで同じcodeを送るとprotocol_invalid。scope_evidence_limit等でこの合成channelが停止しても、実adapterの他14規則をどう保持するかは未接続であり、実runのpartial挙動を検証済みとはしない。

§2.2のbyte枠は合成検証用定数として適用しただけで、本番運用capの承認ではない。pending prepareの本文は応答までの一時保持で、応答後の計画に本文/ASTを残さない。run内保持1MiBの実allocator会計やcontrol workの独立計数、HTTPの証拠専用枠/動的予約、50/55/60秒の実時間中断は未実装。

現在のchannelはschema/相関/診断だけを確認し、XML/ASTを解析せず、比較器を実行せず、compare_okの比較データから上位レビュー結果や本番completionも発行しない。既存の合成証拠ownerとの一体接続、実ready受信/port、実source issuer、実worker/上位結果ownerの結合は次工程。準備計画のAST正当性や観測内容に対する比較の正しさは、wire構造検査だけでは証明できない。

検証は[合成channel検証記録](E2E_BEST_PRACTICE_ABORT_SCOPE_CHANNEL_SYNTHETIC_2026-10-25.md)を参照。旧公開0.2/0.3・明示14/既定3規則とnpm非同梱を維持し、VM/監視/telemetry調査は保留のまま。

## 11. 検証専用workerとfixture上位結果の接続

§10のchannel単独検証に加え、`abort-scope-evidence-worker-core/entry/worker-review`とsource用bootstrapを非同梱prefix内に追加した。既存`review-worker.ts`やMCP dispatcherは変更しない。source実行では専用tsx bootstrap、compiled実行では固定`abort-scope-evidence-worker-entry.js`を選択する。env／argv／execArgvは空、既存worker同等のmemory/stack上限を適用。本文は信頼するworkerへの入力だけで、解析対象JavaScriptを実行しない。

prepareは既存の安全XML抽出器でpayload／asset ID／BR型を検査し、実受領文字列と抽出scriptからhashを計算する。JavaScript parse失敗をunsupported_whenへ隠さない。既存の字句scope／受信側／限定定数解析へ任意optionのreport hookを追加し、before/current由来／1引数trueの位置だけを計画へ採用する。既存他規則のoption未指定経路は不変。false・独自同名method・別recordを候補にせず、未知receiver／引数・method差替えは未解決。runtimeで呼ばれることや中止の成否は証明しない。

worker内部では同issuer/jobのpayload evidence・初回／最終phase・一度限りの比較claimを接続する。親と子の双方でstrict schema、run世代・要求番号・job・target・hash・phaseを照合し、同時未解決1件・job100・site累計100・計画256KiBを維持する。実Workerに結ばれたlistenerからの応答だけを受理するが、fixture入力とtrusted workerをTCBとする。nonce／hashを実source認証の証拠へ昇格させない。

`FixtureScopeWorkerReview`は残時間callbackを起動／通信／終了確認へ伝播する。増加／非有限／例外は固定失敗へ正規化する。取消・不正応答・worker終了では新jobを再送せずterminateを要求し、元の残時間内だけ終了を待つ。terminateのPromiseが確認できなければcleanupをunconfirmedに固定し、先行primaryがなければoutput/internal_review_error、あればそのprimaryを保持する。late終了で結果を成功へ改めない。厳密なOS資源消失や強制終了の最悪時間上界を実証したものではない。

上位は公開0.2／0.3ではなく`br006-fixture-result-0.1`という**検証専用strict契約**。provenance=fixture_input、synthetic=true、evidence_issuance=disabled、review_status=partial、analysis_complete=false、code_return_mode=noneを固定する。assetのnot_needed／rejected／comparison_only／not_completedと固定理由を分け、scope差候補数はcompared/different_referenceのsite数だけに対応させる。comparison_onlyは実中止失敗や正式findingを意味しない。停止／cleanup未確認後はcomparison_onlyをnot_completedに変更し、比較値と暫定候補数を撤回する。asset-local拒否は保持する。

固定sourceの`consumeObservations`は、親／metadata／全tableのfinalがstableでR=0、同sourceがactiveな場合だけ、同tableの初回／最終正規化データを一度返す。コピーしたraw HTTP応答やcaller指定時刻を登録する口ではない。changed／unverified／失効／再消費を拒否し、closeで保持を外す。これはfixtureデータの合成接続で、実session／worker jobに結合した正式receiptやsealではない。実worker試験では固定GET→Web Streams会計→一度のdelivery→prepare/observe/compare→上位JSONまでを通し、C/Gが再課金されないことを確認した。

本番の50/55/60秒・210試行を変更しない。本fixture workerは供給された残時間callbackを消費するだけで、実sessionのphase budget bindingは未実装。OAuth後の固定source移譲はOH-03でfixture限定に接続したが、正式な認証snapshot／ReleasePermit／選択metadata・payload receipt／worker job、公開BR-006語彙・coverage、全体work／保持上界・cap承認・実機検証は残る。したがって本番レビュー機能の最終完了／有効化とは扱わない。VM／監視／telemetry保留・Unknown・全体受付無効を維持する。

検証：[worker・上位結果統合の合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_WORKER_INTEGRATION_SYNTHETIC_2026-10-26.md)。

### 11.1 OAuth起点の連続検証（test-only owner）

[移譲設計draft-0.5 §14](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md#14-oauth起点のworker上位結果までの連続合成e2e)で、同fixture sessionのOAuth→固定source→planに従うtable初回／最終→一度のdelivery→native worker.observe／compare→finishを通した。元の開始時刻からの残時間と一つの取消signalを試験専用ownerが渡し、会計はsourceから上位結果まで作り直さない。

通常／OAuth retry、取消前・OAuth待機・table read・worker ready待機・比較後の取消、source changed／unverified、401／403、worker起動失敗を検証する。上位resultはpartial／analysis_complete=false／code_return_mode=none／fixture_input／evidence disabledと、従来の未接続limitationsを保つ。子Nodeのstdout／stderrも捕捉し、strict上位JSONだけを許可する。

外側ownerはtests内だけであり、実MCP dispatcher・実sessionの共通停止／予算ownerを実装したものではない。payload／instance_bindingも架空入力なので、本番receipt／jobの認証・由来を保証しない。

検証：[OAuth起点の連続合成E2E記録](E2E_BEST_PRACTICE_ABORT_SCOPE_OAUTH_WORKER_CHAIN_2026-10-27.md)。
