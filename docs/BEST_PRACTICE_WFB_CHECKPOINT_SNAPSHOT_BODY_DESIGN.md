# WF-B：checkpoint本文snapshot・容量・失敗時停止の詳細設計

Version: draft-0.5 / Date: 2026-11-06 / 調査基準HEAD: `12dcc37` / レビュー修正の基準HEAD: `f8cd328` / strict値契約の基準HEAD: `ff2c56f`。

draft-0.5: [strict値契約§9](BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CONTRACT.md)の内部型・10 variant・件数／encoded上界・局所関係を合成専用coreとして実装した。[検証記録](E2E_BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CORE_2026-11-06.md)。private capture・集約source・本文encoder／保存への接続はない。

draft-0.3のレビュー修正: 観測停止後に作られたworker行の扱いを§5へ追記し、値契約の修正に揃えた。

draft-0.3: [strict値契約・固定encoding・row幅](BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CONTRACT.md)を追加。10 variant・全rowのfield順／enum／局所関係と構造幅を固定案として整理した。本文なし失敗variant・更新中worker／sampleのcutoff・反復counterを維持する。設計のみで、値型／parser実装・運用cap承認は行っていない。

draft-0.1のレビュー修正: 採取器の失敗時や観測開始前に本文を固定できず`stop_requested`を作れない矛盾を、本文なし失敗variant（§3.1）で解消した。recorderの停止理由と`cause`の対応を追加した。現行Store上限は契約最大値に収まらないと明記し、上限見直しをStore接続の前提とした。`cutoff`がworker／sampleも固定するようにし、容量式へ`scope_tails`・添字の定義・write slice枠を追加した。反復counterの所有者と枠を定めた。実装・承認状態は変更していない。

Status: **型・strict値検査・局所関係と上界計算のみ合成実装済み。raw JSON parser・集約・capture・本文保存と本文保存の合成受入は未実装／未実施。** 正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。証拠発行・実接続・実通信・実機操作・再採取・証拠保管・設定変更・Pushは行わない。容量／時間枠・保存先・保持期間・運用capの承認は代替しない。

親は[固定採取器契約](BEST_PRACTICE_WFB_FIXED_RECORDER_CONTRACT.md)§4と[Store／recorder接続契約](BEST_PRACTICE_WFB_STORE_RECORDER_BRIDGE_DESIGN.md)。[DT-A〜C](BEST_PRACTICE_WFB_SLOT_DEADLINES_RECORDER_TERMINAL_DESIGN.md)の期限・FIFO・一度限りack・通知分離・terminal処理は維持する。本書の型名・版名は提案で、利用可能な発行口ではない。

## 1 現状・差分・非目標

| 根拠 | 現状と今回の差分 |
|---|---|
| `store-recorder-kernel.ts` のpersist | `wfb-checkpoint-1`のversion／sequence／trigger／atだけを保存する。本文は受け取らず、headerの実最大95 byteに対してDT-Cの式を確認済み |
| `parent-observation.ts` | ParentObservation instanceごとに4096 event。review／worker／requestはそのinstance内のordinalで、seq／時刻も別instanceと共有されない |
| `review-test-scope.ts` | scopeの開始点からの単調msを使用。diagnosticsはpending数・worker lifecycle・ParentObservationのcopy。観測はstrict応答受理や所有process終了の証拠ではない |
| 親契約のreporter上限 | case 20000、相関event 20000、sample 600、module 1000。今回repo内では実reporterの対応実装を確認できていない。既存契約上の上限として維持し、接続済みの保証と数えない |

差分は、固定6triggerに必要な限定detailと、そのうち4triggerの時点snapshotを、同run／budget／source／checkpointに結んで保存すること。actual reporter・OS sampler・ProcessOwner、manifest／session票、比較run、実Store backendの接続は範囲外。製品timeout・並列数・既存観測件数を変更しない。

## 2 所有者・供給順・private binding

| 所有者案 | 固定責務 |
|---|---|
| AggregateOwner | 同source／run内の検査済みeventだけを集約し、boundedな現在値とstickyな欠落理由を保持。生message・例外・認証値を本文へ流さない |
| CaptureOwner | 同checkpointのtrigger受理時にaggregate世代／event cutoffを固定し、一度だけimmutable capsuleを作る。readyなcap／費目profileがなければ生成不可 |
| SnapshotCustody | 最大6 slot（集約本文は最大4）を先行確保。承認済みcapsuleの所有責務を保持し、ack前に勝手に失わない |
| Bridge／EvidenceStore | 同capsuleから固定encoding・期待size／digestを得て、同bytesを一度保存・private消費・ackする。本文入力／任意encoderをcallerから受け取らない |

供給順は、同run／budgetとsource pin → 必須cap／対象shapeの事前検査 → 集約入力の検査 → trigger／capture claim → immutable capsule → 固定encoding → 同Store保存／receipt消費 → 同queue先頭ack。

private bindingはowner／run origin／budget origin／source digest／inventory digest／checkpoint参照／schema版／aggregate世代／cutoffを含む。JSONにあるdigestや同値DATAを、このidentityや発行権限へ昇格しない。scope／case対応はsource側のprivate登録情報から供給し、messageに書かれたscope IDだけでは受理しない。実台帳・既存fixture台帳と共有しない。

triggerとcutoffの確保は一つの同期区間にし、途中のawait／caller callbackを挟まない。後から届いたeventは当該snapshotへ混ぜない。本文copy／encodingを後で行う場合も、元prefixを固定できる方式だけを使い、mutableな現在値の再読をsnapshotと呼ばない。具体的なjournal／copy方式は実装前に選定し、その保持費を加算する。

同triggerは各1回、queueは最大6、writerは1本のまま。既発行triggerの反復は有限counterへ集約し、新capsuleや再encodingを発行しない。counterはAggregateOwnerが先行確保した固定6 slotに保持し、確定済みcapsuleへ加算しない。公開先はfinal artifactの設計で固定する（未確定）。counter overflowは停止理由であり、黙った飽和や0への復帰にしない。失敗したcapture claimを返却しない。

## 3 新wire契約案と6trigger

本文付き版は`wfb-checkpoint-2`を予約する。旧v1は既存のheader-only合成経路としてそのまま残す。新しい別の閉じたassemblyでschema版をpinし、v1 receipt／headerからv2本文の保存成功へ昇格させない。暗黙の版fallback・既存header試験の一括置換はしない。

v2共通fieldは`version, sequence, trigger, at, binding, detail`。本文trigger4種はさらに`snapshot_status`と`snapshot`を持つ（§3.1）。sequenceは1〜6で発生順、triggerは既存6値、atは元checkpointのsafe非負整数を変えない。bindingの公開DATAはsource_digest／inventory_digest（各小文字hex64）だけとし、private originをserializeしない。scopeの時刻やsnapshot採取時刻からatを再計算しない。

| trigger | detailのstrict項目案 | snapshot field |
|---|---|---|
| conditions_ready | conditions_digest、正のapproval_revision、固定gate判定 | **禁止**。集約本体なし |
| child_started | lease_ordinal、固定startup状態 | **禁止**。集約本体なし。leaseの存在は終了確認ではない |
| first_anomaly | kind=case／module／hook／unhandled／collector、対応するordinalまたはnull、固定reason | **必須**（§3.1の失敗variantを含む） |
| slow_hint | threshold_ms=120000、元の経過値 | **必須**（§3.1の失敗variantを含む）。停止命令へ変換しない |
| test_terminal | test_result、measurementの限定状態、元の終端receiptとの対応 | **必須**（§3.1の失敗variantを含む）。callerの成功boolを根拠にしない |
| stop_requested | cause=cancelled／outer_deadline／collector_failure、stop_reason、固定cleanup開始状態 | **必須**（§3.1の失敗variantを含む）。process終了をconfirmedにしない |

各variantで未知／不足field・不正ordinalの組合せ・snapshotの余分／欠落、`snapshot_status`と`snapshot`の不一致を拒否する。条件・起動・試験終端のdetailの実発行元は未接続で、現在のreserve(true)だけではその証拠にならない。

明示cancelのatは既存モデルの最終既知時刻で、新しい通知時刻の採取を意味しない。本文は別のcapture時点とcutoffを持つ。trigger時点のprefixを固定できなかった場合、最新集約値へのすり替えをせずcapture拒否とし、§3.1の失敗variantを使う。

`stop_reason`はrecorderの最初の理由をそのまま固定値で保持する。`cause`との対応案は次のとおり。bridgeの`store`／`discarded`／`notification`等はrecorder通知を経由して`recorder`になる。

| stop_reason | cause |
|---|---|
| cancelled | cancelled |
| deadline、window | outer_deadline |
| state、binding、clock、checkpoint、recorder | collector_failure |

### 3.1 本文なし失敗variant

本文trigger4種は`snapshot_status=captured`（`snapshot`はobject）か、`snapshot_status=unavailable`（`snapshot=null`、固定の`snapshot_reason`を必須）のどちらかである。`snapshot_reason`は§8の固定reasonから選ぶ。

- **使う場面**: 観測開始前のGated／Reservedでの停止（`observation_not_started`）、source喪失、入力不正、上限超過、秘密疑い、capture／encodingの失敗。正常な取消や期限ではsourceが健全なら`captured`を使う。
- **再帰しない**: 集約を読まず、capture claim・capsule・custodyを使わない。失敗は集約側でstickyとし、以後の本文triggerもこのvariantになる。capture失敗から観測停止へ進んでも、`stop_requested`がcaptureを再試行することはない。
- **queue**: triggerをqueueへ積む同じ同期区間で`captured`か`unavailable`かを確定する。本文未定の要素をqueue先頭に残さない。sequence／at／detailは元checkpointの値のままで、FIFOとackは他のvariantと同じである。
- **切替えは一度だけ**: capsule確定後にencodingが失敗した場合は、Store保存の開始前に限り、同checkpointの本文を捨てて失敗variantへ切替える。Store保存の開始後はcreate失敗も含めて切替えず、既存どおり未ackのままとする。失敗variant自身のencoding失敗は固定理由で停止し、再帰しない。
- **容量**: 固定長の上界を`B_control`で検査する。本文保存が後続slotの失敗variant分を使い切らないよう、未発行slot分の`B_control`を`B_run`から先に確保する。この枠が確保できなければ観測を開始しない。
- **意味**: unavailableはcoverageの証拠ではない。`measurement=complete`やrun completeの根拠にせず、先行のtest_resultも変更しない。旧v1や最新集約へfallbackしない。

## 4 Snapshot値契約案

snapshotのstrict共通fieldは`version='wfb-observation-snapshot-1', generation, cutoff, coverage, modules, cases, scopes, events, workers, samples`。全配列を必須とし、空と未取得はcoverageで区別する。payload／コード／例外本文・stack／生protocol message・URL／sys_id／PID／process引数／環境変数を追加する拡張fieldは設けない。

以下は概要。fieldの完全な集合・enum・固定key順・null／禁止field・局所関係は[strict値契約](BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CONTRACT.md)§1〜§4を参照する。runtime sourceの真偽やprivate bindingを、値の整合性で代替しない。

| 集合 | 限定rowの項目案・検査 |
|---|---|
| modules | module_ordinal、state、固定failure_class、case_counts（discovered／running／passed／failed／skipped／todo／not_run／unknownの固定8整数）。ordinal重複・参照case数との矛盾を拒否。hook／module失敗で本体未実行のcaseをpassedにしない |
| cases | case_ordinal、module_ordinal、state、duration_msまたはnull、固定failure_class、scope_coverage。stateはdiscovered／running／passed／failed／skipped／todo／not_run／unknownの別variant。欠落durationを0にしない |
| scopes | scope_ordinal、対応case_ordinal、scope clock原点との対応、log_count／log_limit=4096、active、固定incomplete reason。対応は供給元のprivate登録と一致させる |
| events | scope_ordinalに加え、既存ObservationEventのseq／at_ms／review／worker／request／event／phase／detail／code。enumは元型のallowlistと完全一致。生request IDは受け取らない |
| workers | scope_ordinal／worker_ordinal、既存WorkerLifecycleの時刻fieldとexited。時刻未観測はnull、ready／exit／terminate要求・返答を別に保持する |
| samples | at_ms、scope=root／owned_tree、cpu_ms／rss_bytes／owned_process_count。それぞれvalueとstatus=observed／unavailable／not_supportedのstrict variant。未取得を0へ補完しない |

自由記述のtest fullname・repo pathも`wfb-observation-snapshot-1`本文には直接入れず、pin済みの試験inventoryへordinalで対応させる案とする。inventory自身の安全な供給／容量／動的caseの対応は未確認で、未対応の名前をhashしただけで確認済みにしない。親契約が許可するrepo相対識別を禁止へ変更するものではなく、供給方法が未実証な間の新本文経路を閉じる方針である。

module／case stateとVitest versionの実値の写像、retry／parameterized case／hookの識別は未確認。実adapterは、未知値をunknownへ無条件変換して続行せず、固定source-unavailable診断で接続拒否する。既に検査済みのprefixで本当に未観測だった項目だけにunknown／nullを使う。

cutoffは`source_event_ordinal`、`scope_tails`（scope_ordinal／last_seqのstrict row、scope順・重複なし）、`sample_count`（採取済みsampleのprefix長）を持つ。0は空prefixだけに許可する。coverageは`prefix, run, first_reason`を必須とし、first_reasonはnone／source_unavailable／inventory_unknown／missing_case／missing_module／missing_scope／event_gap／capacity／clock／observer／protocol／secretの固定値。prefix incompleteでnoneは禁止。途中の正常prefixはrun incompleteかつ理由noneでよく、試験全体の成功を意味しない。

## 5 時刻・対応・coverageの意味

- ParentObservationのseq／ordinalはscope内の値。keyは`(scope_ordinal, seq)`とし、別scopeのseq=1を重複と誤判定しない。review／worker／requestの0は元契約の未対応sentinelだけに使い、正のcase／module／scope identityとは区別する。
- 現行diagnostics.workersの配列rowはworker ordinalを持たない。factory throwでordinalだけ進む場合があるため、配列index＋1で補完しない。同factory／scopeのprivate対応証拠を供給するadapterは未実装で、対応不明なら接続拒否する。観測停止後に作られたworkerはordinalが0で対応を持たないので、inactive scopeの`worker_ordinal=null`として表し、番号を補完しない。
- ReviewTestScopeの時刻はscope開始からのms。run開始からのmsへ足すには、同じ単調clockに結ぶscope開始receiptとchecked加算が必要。異なる原点をそのまま比較せず、UTCや残時間で作り直さない。原点が未証明なら停止し、0 offsetを補完しない。
- at_ms／duration／cpuはfinite非負値、byte数・個数・ordinalはsafe非負整数（identityは正）。scope内event順の逆行と不正時間を拒否する。小数msを暗黙に丸めて既存観測を変えない。JSONの−0／NaN／Infinity、数値overflowは拒否する案とする。
- WorkerLifecycleは連番のない行をその場で更新し、event記録が止まった後も更新される。workers行はtriggerとcutoffを確保する同じ同期区間でcopyした値だけを使い、後から読み直さない。後読みする方式は、行ごとの世代を供給する場合に限る。copyした行とevent tailの間に時間の整合を推論しない。
- cutoffはsource内の受理prefixとscopeごとの最終seqを示し、後着eventを含めない。欠落／重複／遅着／順序違反を検出できない供給方式はcompleteの証拠にしない。module終端・未処理エラー・case terminalとの対応も検査対象とする。
- coverageは`prefix=complete|incomplete`と`run=incomplete|complete`を分け、固定理由を持つ。途中のprefix completeはrun全体の観測完了ではない。run completeは別の信頼済み終端・期待集合の照合が必要で、snapshotだけでownerの四軸を進めない。
- scope外caseのphaseがUnknownであることだけではincompleteにしない。scope対応不明なのか、正当にoutside_scopeなのかを区別する。期待されるscope内coverageの欠落、上限・source／clock／protocol不整合はmeasurement incompleteとする。
- ready／matched／fulfilled、worker exited=true、sampleのowned_process_count=0は、それぞれprotocol受理／所有process終了の証拠ではない。ProcessOwnerとscope drainの確認は後続契約へ残す。

## 6 件数・byte・work・scratchの必須枠

既存件数の契約上限はcase≤20000、module≤1000、sample≤600、相関event総量≤20000。ParentObservationは**instanceごと**にevent≤4096、ReviewTestScopeのlifecycle保持も各scope≤4096である。scope数／worker総row数のrun capは別に有限値を要する。global event枠を4096へ暗黙に縮めたり、scope数倍だけ20000を拡大したりしない。

| 必須cap案 | 対象・規則 |
|---|---|
| L_scope／L_worker／L_ingest | scope／worker row・受信／更新操作数。instance内上限とは別のrun累積枠。既存件数capの範囲内でもbyte／work不足なら拒否 |
| L_repeat | triggerごとの反復counterの最大値。overflowは停止理由 |
| B_message／B_snapshot／B_control／B_file | raw受信、正規化本文、本文なしvariant（control 2種と§3.1の失敗variant）、UTF-8ファイル全体。どれも正の有限値を事前供給し、0／未指定を無制限にしない |
| B_run／B_queue／B_custody | 全artifact予約、最大4本文＋2controlのqueue、失敗時custodyの保持。保存済みbyte・失敗予約を返却しない |
| B_encode／B_reread／B_input_live／B_write_slices | serialization出力・再読・入力／正規化の同時保持と、write sliceの累積（≤W×E）。現行のA=4096上限とE=64KiBでは累積が約268MBになり得るので、Aだけで承認しない。bodyサイズだけでscratchを承認しない |
| W_ingest／W_capture／W_validate／W_encode | 収集・snapshot copy・shape／関係検査・encodingの各費目。元の同budgetから確保し、費用未導出を0と扱わない |

上記の具体byte／work値は**未導出・未承認**。件数の既存値を、そのまま保存容量の承認にしない。対象の事前shapeが不明なら契約上の最大値を使うか受付を拒否し、直近の小さいfixture実測だけで開始を許可しない。全caseの保存が必要な対象を、byte不足のため黙って間引かない。

strict rowごとの最大encoded長をR_c（cases）／R_m（modules）／R_e（events）／R_s（scopes）／R_w（workers）／R_p（samples）／R_t（cutoffのscope_tails）、固定key／配列／区切り等の上界をKとする。separatorを各rowに含めたうえで、`S_upper=K+N_c R_c+N_m R_m+N_e R_e+N_s R_s+N_w R_w+N_p R_p+N_s R_t`をchecked加乗算で求める。共通context／variant detailの上界を加えた`E_upper`がB_snapshot／B_file等へ収まることをcapture前に要求する。row幅や文字列最大長が未確定なら式もUnknownであり、受付証拠を発行しない。

構造幅の固定案は[strict値契約§5](BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CONTRACT.md#5-固定encodingの幅)に記載した。K=321、R_c=177／R_m=218／R_e=227／R_s=181／R_w=409／R_p=264／R_t=51で、numeric tokenの32文字制約を含む条件付き上界である。本文なしの共通上界500 byteは運用B_controlの承認ではない。formatter／validator／encoderの実証とbyte／work capが未承認な間は、正式な受付証拠を発行しない。

必要保持量は、sourceが持つ集約・scope log、正規化集約、最大4個のfull snapshot、2個のcontrol、writer／Store owned copy・write slice・再読、失敗custodyである。sourceと正規化copyを同じ領域と仮定しない。custodyへ同じcapsuleの所有権を移すだけなら内容を二重加算しないが、新copyを作る方式なら費目を追加する。JS heap／allocator／RSS・実wall-timeの保証とは区別する。

現行FakeEvidenceStoreの64KiB file／1MiB totalという合成構造上限は変更しない。新本文が収まらなければ新経路を拒否する。**契約最大値では収まらない**: 満杯の1 scope（4096 event）は1行16 byteになるが、9項目のevent行は配列形式でも最低19 byte必要で、20,000 caseなら1行3.3 byteである。shape不明なら最大値を使う上の規則により、現行上限のままではshape不明のrunは常に拒否される。Store上限の見直しはv2 Store接続の前提で、別設計・明示承認を要する。

## 7 固定encoding・同bytes・Store接続

任意objectへのJSON.stringifyを最初に呼んで、その後だけサイズを検査する方式は禁止する。unknown field・prototype・Proxy・accessor・symbol・sparse array・cycle・許可外型を拒否し、getter／toJSON／iteratorを実行して値を収集しない。外部bytesのparserは受信上限・UTF-8検査・深さ／token／work上限・duplicate key拒否を先に満たす必要がある。JSON.parse後のstrict schemaだけで重複keyを検出できたとはしない。

固定key順・variant・数値表現・末尾LFを定め、検査済みprivate capsuleを有限2passで数える／書く案とする。count passとwrite passは同じimmutable値を使い、checkedなencoded長が一致しなければ停止する。外部の自由文字列は持たず、hex／固定enum以外の文字列導入は別のUTF-8／escape上限を要する。数値文字列化も任意callbackを呼ばない固定境界へ閉じる。具体encoderと最大row幅の証明は未実装。

同じ一度だけ生成したowned bytesから期待size／digestを得て、同Store save→private receipt consume→同queue先頭ackへ進める。版・同run／budget／source／capture世代／cutoff／checkpointのpre／post guardと、D_saveの等値拒否を維持する。保存中の取消・期限・receipt不一致で再encoding／別slot／別Storeへ逃がさない。

DT-CのH≤95によるbyte／copy上界はv1 header専用で、v2へ流用しない。新encoded長Eに対するwrite試行`min(A,E+R)`、slice累積≤W×E、bridge／Store／再読のhash入力≤3Eに加え、capture／validation／serializationとguardの費用を別に再導出する。旧`4W+30／32`のclock式へ追加処理を無料で押し込まない。新profile／model bindingは設計・承認待ちで、全体受付には接続しない。

## 8 失敗時停止・所有権・四軸

| 失敗位置 | 固定処理 |
|---|---|
| pin／cap／source不足 | 観測開始前なら開始を拒否する。開始後のtriggerは§3.1の失敗variantにする。Unknownを保持し、旧v1や最新aggregateへfallbackしない |
| 入力不正・欠落・上限・秘密疑い | 新規観測／比較とcaptureを停止（sticky）。以後の本文triggerは§3.1の失敗variantにする。既受理queue／先行診断を保持。raw不正入力を公開診断へ反射しない |
| capture／encodingの失敗 | claimは消費済み。未受理candidate／部分encodingを固定unwindで破棄し、以前に受理したcapsuleや保存診断を上書きしない。同checkpointはStore保存の開始前に限り§3.1の失敗variantへ一度だけ切替える |
| Store partial／cleanup未確認 | 既存Storeがhandle責務を所有。元snapshotとqueue先頭は未ack、試行別cleanupを保持。snapshot側で二重closeしない |
| 保存済み未ack | receipt／実行claimを再利用しない。保存済みDATAと元queueを保持し、再保存／成功補完をしない |
| terminal／fatal | 実行可能なbinding／claim／scratch別名を退役。未保存の受理済みcapsuleはbounded SnapshotCustodyへ一度だけ責務を残す。queueの診断と本文所有を混同しない |

SnapshotCustodyは再保存権限や自動復旧口を持たない。ackで責務が解決したcapsuleだけを解放でき、未解決の最終discard条件と上位への移譲は、本文接続前に固定する必要がある。既存DT-Bのheader-only retireへ本文を付け、そのまま黙って捨てる実装にはしない。custody上限不足なら最初からcaptureを始めず、失敗後の無制限複製も禁止する。

新規内部reason案はobservation_not_started／source_unavailable／snapshot_binding／snapshot_invalid／snapshot_limit／snapshot_encoding／snapshot_secret／snapshot_cancelled／snapshot_deadline。既存bridge／Storeのfirst reasonとは別slotで保持し、現行unionへ今回追加したとは扱わない。捕捉するcallback内でassert失敗をthrowし、実装のcatchに吸収される試験を成功扱いにしない（`12dcc37`の修正を維持）。

通常のtest失敗はfirst anomalyであり、それだけでsuite停止を指示しない。snapshot／採取器の失敗は新規観測停止で、既受理test結果をpassedへもfailedへも書き換えない。measurement不足、preservation unverified、termination unconfirmedを別々に残す。source／保存／終了の証拠が不足する場合はUnknownのまま。ファイル削除・移動・chmod・別保存先への救済は行わない。

信頼済みtest_terminal受理前のcoverage欠落はmeasurement incompleteの入力になる。受理後のencoding／Store／cleanup失敗では、既受理のtest_result／measurementを変更しない。後着の矛盾で先行completeの根拠自体が疑わしくなった場合も黙って結果を書き換えず、別のcoverage conflict診断とUnknownを残し、run保全／比較許可を拒否する。四軸の更新ownerと受理順の厳密写像は本文接続前に確認する。

## 9 合成受入条件（本文接続は未実施）

draft-0.5でBS01・BS03〜06・BS12の**純粋値側だけ**を部分検証した（[記録](E2E_BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CORE_2026-11-06.md)）。BS02のprivate同一性、source原点／cutoff、raw bytes parser、本文create／保存・capture・custody・compiled実行等は未検証で、下表全体を完了にはしない。

| ID | 対照 | 必須結果 |
|---|---|---|
| BS01 | 6trigger、本文なし2種／本文あり4種／失敗variant4種、status不一致、未知／不足field | 固定variantだけ受理。旧v1を新本文へ昇格0 |
| BS02 | 別run／budget／source／scope／checkpoint・copy・cutoff混入 | 同値DATAでも拒否。元claimを再利用しない |
| BS03 | 複数scopeのseq=1、0 ordinal、原点差・小数ms・逆行 | local keyの対応を維持。不明offsetを0にしない |
| BS04 | case／module／hook／未処理エラー・scope外・欠落 | 必要な後処理／scope外Unknownを一律違反にせず、必要coverage欠落だけincomplete。not_runをpassedにしない |
| BS05 | 各件数cap・byte cap・work capの−1／等値／＋1、scope_tails込みの上界、算術overflow | 有限構造と全byteを事前照合。上限超過時の本文create=0、間引き／fallback0 |
| BS06 | getter／toJSON／Proxy／cycle／不正UTF-8／duplicate key／trailing data | 禁止hook実行0。bounded strict parserの拒否、秘密反射0 |
| BS07 | trigger後のaggregate変更・遅着event・worker行の更新・sample追加・二重capture | 元cutoffとimmutable内容を維持。新しい本文の混入／再発行0 |
| BS08 | count／write差・escaping境界・同長digest差・再読差替え | 同じbytesだけ保存／照合。全fieldの独立golden oracle、ack前の失敗停止 |
| BS09 | 4本文＋2controlの同時保持、成功ack／partial／未試行混在 | queue／custodyの上界と所有を維持。未解決本文の黙った消失／二重copy0 |
| BS10 | pre／post取消・D_save等値・clock異常・通知throw | 既存DT-A〜Cの一度限り停止／cleanup・四軸を保持。capture失敗から本文保存へ進まず、Store保存開始後は失敗variantへ切替えない |
| BS11 | capsule／公開summary／receiptの再利用・terminal後操作 | JSONからの証拠再構成0、再保存／再ack0、未解決責務はUnknown |
| BS12 | pure fake／compiled／配布境界 | runtime台帳・実I/Oを共有しない。内部issuer／friendを製品配布へ追加しない |
| BS13 | 入力不正／上限超過／秘密疑い／source喪失後のfirst_anomaly・stop_requested、Gated／Reserved停止、本文で枠を使った後の残slot | 集約読取0・capture claim 0・再帰0で固定長の失敗variantを各1回保存。FIFOが進み、completeの根拠0。予約不足なら開始拒否 |
| BS14 | 反復trigger、counterの等値／overflow | 確定済みcapsuleは不変。新capsule0、overflowは固定理由で停止し、飽和／0復帰0 |

golden本文・UTF-8長・件数・counter・操作列は実装のencoder／calculatorを呼ばず独立定義する。故障callback内は観測値を記録するだけとし、unwind後にassertして故障点への到達も確認する。合成fixtureの小さいcapを運用値へ昇格しない。

## 10 未確認・承認待ち・次の実装範囲

1. **最初の純粋実装は実施済み**: [strict値契約§9](BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CONTRACT.md)の内部値型／10 variant・件数／encoded上界・局所関係検査を合成専用で追加した。旧v1を維持し、証拠発行・本文保存・capture成功は未接続。raw bytes parser・encoder・統合費目は残課題で、後続実装は別の明示指示を要する。
2. 次にprivate aggregate／capture claim・cutoff・immutable capsuleと有限custodyを合成issuer限定で実装する。最終discard／所有移譲を先に固定し、Store上限の見直し（§6）を別途承認した後に、v2同bytesのStore接続へ進む。各段階は別の明示指示を要する。
3. reporter／sampleの実schema・既存artifactの版と上限、動的case／retry／inventory、scope原点の供給・case対応、source世代の固定方法は未確認。実reporterや過去artifactを取得・起動したとは扱わない。
4. row幅はstrict値契約の構造上界案として整理したが、新byte／work cap、収集／copy／encode／再読scratchと累積予約、実保存先・保持期間・運用時間枠は未導出／未承認。capが不明なまま正式受付を有効にしない。
5. schema・snapshot失敗理由と上位四軸／既存first reasonの写像（§3の`cause`対応は案）、反復counterの公開先、custodyの厳密型と最終discard条件、統合work model、ProcessOwner／manifest集合・session台帳は後続課題。unknownを成功や0費用に補完しない。
