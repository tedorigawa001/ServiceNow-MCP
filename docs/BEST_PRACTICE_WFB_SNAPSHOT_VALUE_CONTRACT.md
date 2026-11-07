# WF-B：snapshot strict値契約・固定encoding・row幅

Version: draft-0.9 / Date: 2026-11-07 / 基準HEAD: `ff2c56f` / レビュー修正の基準HEAD: `04260f2` / 純粋core実装基準HEAD: `70cbffb` / core修正の基準HEAD: `b37214f` / RC-A基準HEAD: `5b03dfc`。

draft-0.9: [RC-A実装境界](BEST_PRACTICE_WFB_RPC_PRIVATE_VALUE_BRIDGE_DESIGN.md#11-rc-a実装境界)を反映。単一値engine・失敗prefixのdetailed計数と旧API projectionを合成実装した。[検証記録](E2E_BEST_PRACTICE_WFB_VALUE_CORE_RCA_2026-11-07.md)。raw接続・受付・発行／保存は未実装のまま。

draft-0.8: [RP-C同AST・2V／計数診断保持の差分設計](BEST_PRACTICE_WFB_RPC_PRIVATE_VALUE_BRIDGE_DESIGN.md)を追加。Vとstructuralの別単位、失敗時observed／unavailable、5理由の1対1保持と旧API projectionを具体化した。設計のみで既存値core・課金・公開型は変更していない。

draft-0.7: [RP-B構文境界](BEST_PRACTICE_WFB_BOUNDED_RAW_JSON_PARSER_DESIGN.md#9-rp-b構文だけの閉鎖した固定継続)と[合成記録](E2E_BEST_PRACTICE_WFB_RAW_JSON_RPB_2026-11-06.md)を追加。有限stack・重複key・canonical数値とpath／node／token制限を構文専用で実装。本値coreは呼ばず、値受理・発行／保存は未接続。

draft-0.6: [RP-A byte境界](BEST_PRACTICE_WFB_BOUNDED_RAW_JSON_PARSER_DESIGN.md#8-rp-a実装境界計数と破棄)と[合成記録](E2E_BEST_PRACTICE_WFB_RAW_JSON_RPA_2026-11-06.md)を追加。UTF-8／外側framingだけを検査する非実行metadataで、raw JSON構文parserや本値coreへの接続は未実装。値規則・旧v1・発行／保存経路は不変。

draft-0.5: [bounded raw JSON parser詳細契約](BEST_PRACTICE_WFB_BOUNDED_RAW_JSON_PARSER_DESIGN.md)を追加。raw bytes専用の初期subset、入力所有／上限／検査順・固定理由・独立oracleを具体化した。設計のみで、現行値core・旧v1・発行／保存経路は変更しない。

draft-0.3のレビュー修正: `observed`以外のmetricは`not_supported`も含めてprefix incompleteとする規則に確定した。`passed`と矛盾するcaseに`not_run`のmodule／hook failureを含めた。空snapshotのrun complete拒否をcoreへ実装した。

draft-0.3: 合成依存限定の内部値型・10 variant・件数／encoded上界・局所関係検査を実装した（§9）。[検証記録](E2E_BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CORE_2026-11-06.md)。旧v1・既存保存経路には接続しない。

draft-0.1のレビュー修正: 観測停止後に作られたworker行を表せるよう`worker_ordinal`をnullableにした。`source_event_ordinal`の局所検査と、`prefix=complete`のときの`first_reason`を定めた。pinをrecorder生成の前提とした。`R_p`の導出を注記した。幅の上界は変わらず、実装・承認状態も変更していない。

Status: **合成専用の型・値validator・上界計算と局所関係試験を実装。別入口のraw JSON構文解析も実装済みだが、本値coreへの接続・encoder・実source写像・capture・本文保存は未実装。** [本文snapshot設計](BEST_PRACTICE_WFB_CHECKPOINT_SNAPSHOT_BODY_DESIGN.md)の「全field・enum・row幅の固定」を具体化する。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。証拠発行・実接続・実通信・実機操作・設定変更・再採取・保管操作・Pushを行わない。

ここでいうcaptured／complete／gates=trueは**値の表現**であり、capture証拠・承認・保存／終了確認を発行しない。private owner／source／budget／cutoffへの結合・cap承認は別契約である。旧`wfb-checkpoint-1`・DT-A〜C・既存ParentObservationを変更しない。未承認のStore上限も引き上げない。

## 1 構文・scalar・値検査の境界

全recordは下表のfieldだけを列挙順に持つ。未知／不足／symbol／accessor／独自prototype／Proxy／sparse array／cycle／許可外型は拒否し、getter・toJSON・外部iteratorで値を採らない。optional fieldは作らず、nullを明示するfieldと、variantごとに禁止するfieldを区別する。入力の黙った補正・sort／dedup・丸め・既定値挿入はしない。

| 記号 | 値の範囲 | compact JSON scalar幅の上界 |
|---|---|---:|
| U／P | safe整数0〜9007199254740991／そのうち正。−0は禁止 | 16 |
| C／M | 正のcase ordinal≤20000／module ordinal≤1000 | 5／4 |
| O／Z | scope内の正ordinal≤4096／0も許可 | 4 |
| C0／M0／Z600 | 0〜20000／0〜1000／0〜600のsafe整数 | 5／4／3 |
| T | finite非負number≤MAX_SAFE_INTEGER、−0禁止。小数を丸めない | 32（下記の構文制約込み） |
| H | 小文字hex64のstring | 66（quote込み） |
| B | boolean | 5 |
| nullable(X) | Xまたは明示null | max(Xの幅,4) |

Tのcanonical number tokenは32 ASCII文字以下とする。JSON数値のleading zero・不要な末尾zero等を許す別表記を追加しない。この幅は新値契約の**構造制約案**であり、Number formatterの全入力証明や運用capの承認ではない。pure coreのscalar検査は変換後tokenの幅と往復同値をchecked検査し、満たせない値を停止する。body encoderは未実装。Number objectや任意callbackをformatterとして受け取らない。

enumは後掲の完全な集合だけを受け、JSONではASCII文字列をquoteする。U等の数値を文字列へ置き換えることは不可。standalone snapshotのcontainer深さは最大4、checkpoint envelopeからは最大5（root objectを1、object／arrayの入れ子ごとに加算しscalarは数えない）。raw bytesからのUTF-8・duplicate key・token／work上限付きparserは別実装で、JSON.parse後の検査で代替しない。

最初のpure coreは候補値・shape・encoded長と固定拒否理由だけを扱い、実台帳／clock／I/Oを呼ばず、issuer／receipt／保存権限を返さない。値検査からheap／wall-timeの上界が証明されたとは扱わない。外部の巨大なunknown objectをnative reflectionで調べる費用も未確認で、runtime入力口は閉じたままとする。

## 2 checkpoint envelope：10 variant

共通field順は `version, sequence, trigger, at, binding, detail`。

- version=`wfb-checkpoint-2`、sequence=1〜6、triggerは親の6値、at=U。
- bindingのfield順は`source_digest:H, inventory_digest:H`。未pinのdigestを全zero等で補完しない。source喪失後の失敗variantは先行pinを使う。pinはrecorder生成の前提とし、pinのないrecorderやqueue要素を作らない。pin前の生成失敗はowner診断だけで、v2 frameを捏造しない。
- conditions_ready／child_startedは共通fieldだけ。snapshot_status／snapshot／snapshot_reasonは禁止。
- 本文trigger4種のcapturedは共通fieldの後に`snapshot_status='captured', snapshot:Snapshot`。snapshot_reasonは禁止。
- 本文trigger4種のunavailableは共通fieldの後に`snapshot_status='unavailable', snapshot:null, snapshot_reason:SnapshotReason`。本文を再読／captureする権限はない。

| trigger | detailのfield順・型 |
|---|---|
| conditions_ready | `conditions_digest:H, approval_revision:P, gates`。gatesは`offline_checked:true, approval_bound:true, scope_locked:true`の固定3 field |
| child_started | `lease_ordinal:P, startup:'started'|'ready_wait'`。leaseやready待ちは終了確認ではない |
| first_anomaly | `kind:AnomalyKind, case_ordinal:nullable(C), module_ordinal:nullable(M), scope_ordinal:nullable(P), reason:AnomalyReason` |
| slow_hint | `threshold_ms:120000, elapsed_ms:T`。elapsed_ms>120000。時刻原点の真偽はprivate側で確認 |
| test_terminal | `test_result:'passed'|'failed'|'incomplete', measurement:'complete'|'incomplete'`。終端receiptはJSON fieldでなくprivate側に結ぶ |
| stop_requested | `cause:'cancelled'|'outer_deadline'|'collector_failure', stop_reason:StopReason, cleanup_state:'not_requested'|'requested'|'unconfirmed'`。confirmedは受け付けない |

AnomalyKindはcase／module／hook／unhandled／collector。AnomalyReasonは順にcase_failure／module_failure／hook_failure／unhandled_error／collector_failureで、kindと1対1で対応する。caseはcase／module ordinal必須、moduleはmoduleだけ必須でcase／scopeはnull。hookはmodule必須、case／scopeはnullable。unhandled／collectorは全ordinalをnullableとする。どの場合もscopeが非nullならcase／moduleも非null、caseが非nullならmoduleも非nullで、本文がある場合は同じ参照先と一致する。全体に発生した異常へ架空のcaseを割り当てない。

StopReasonはcancelled／deadline／window／state／binding／clock／checkpoint／recorder。causeは親設計の対応表に一致させる。SnapshotReasonはobservation_not_started／source_unavailable／snapshot_binding／snapshot_invalid／snapshot_limit／snapshot_encoding／snapshot_secret／snapshot_cancelled／snapshot_deadline。observation_not_startedはstop_requestedだけに許可し、そのcleanup_state=not_requestedを要求する。

unavailableでtest_terminal.measurement=completeが記録されていても、先行受理値の保持としてのみ扱う。snapshot unavailableを新しいcoverage completeの根拠にはしない。値validatorだけで元終端結果を上書き／昇格しない。

## 3 Snapshot：全fieldとenum

Snapshotのfield順は`version, generation, cutoff, coverage, modules, cases, scopes, events, workers, samples`。version=`wfb-observation-snapshot-1`、generation=P。配列はすべて必須で、空でも省略しない。

- cutoffの順は`source_event_ordinal:U, scope_tails:ScopeTail[], sample_count:Z600`。ScopeTailは`scope_ordinal:P, last_seq:Z`。
- coverageの順は`prefix:'complete'|'incomplete', run:'complete'|'incomplete', first_reason:CoverageReason`。
- CoverageReasonはnone／source_unavailable／inventory_unknown／missing_case／missing_module／missing_scope／event_gap／capacity／clock／observer／protocol／secret。prefix incompleteでnoneは禁止、prefix completeならnoneを要求し、run completeならprefix completeを要求する。正常な途中prefixはcomplete／run incomplete／noneでよい。

| row | field順・型 |
|---|---|
| Module | `module_ordinal:M, state:ModuleState, failure_class:FailureClass, case_counts:CaseCounts` |
| Case | `case_ordinal:C, module_ordinal:M, state:CaseState, duration_ms:nullable(T), failure_class:FailureClass, scope_coverage:'observed'|'outside_scope'|'unknown'` |
| Scope | `scope_ordinal:P, case_ordinal:C, origin_ms:T, log_count:Z, log_limit:4096, active:B, incomplete_reason:'none'|'capacity'|'clock'|'observer'` |
| Event | `scope_ordinal:P, seq:O, at_ms:T, review:Z, worker:Z, request:Z, event:EventName, phase:Phase, detail:EventDetail, code:EventCode` |
| Worker | `scope_ordinal:P, worker_ordinal:nullable(O), created_ms:T, ready_ms:nullable(T), analyze_started_ms:nullable(T), finish_started_ms:nullable(T), last_reply_ms:nullable(T), terminate_ms:nullable(T), exit_ms:nullable(T), exited:B` |
| Sample | `at_ms:T, scope:'root'|'owned_tree', cpu_ms:Metric(T), rss_bytes:Metric(U), owned_process_count:Metric(U)` |

CaseStateはdiscovered／running／passed／failed／skipped／todo／not_run／unknown。CaseCountsはこの順の8 keyをすべて持ち、各値C0。ModuleStateはdiscovered／running／completed／failed／not_run／unknown。completedはmoduleの実行終端を表し、配下caseの全passedを意味しない。FailureClassはnone／assertion／module／hook／unhandled／collector／not_observed。

Metric(X)はfield順`status, value`。observedではvalue:X、unavailable／not_supportedではvalue:nullのみ。optional reason／unit文字列は追加しない。単位はkeyで固定し、未取得をobservedの0へ補完しない。

### 3.1 WF-A event enumの固定値

`parent-observation.ts`（基準HEAD）の型と照合した値集合を固定する。元standalone fixtureのrecord APIや製品worker protocolは変更しない。

- EventName: review_start, review_end, factory_start, factory_return, factory_throw, ready_observed, reply_observed, post_try, post_return, post_throw, terminate_try, terminate_settle, terminate_throw, worker_exit, close_start, close_end。
- Phase: none, review, ready, analyze, finish, cleanup。
- EventDetail: none, matched, duplicate, unmatched, fulfilled, rejected。
- EventCode: none, other_fixed_code, invalid_input, access_denied, authentication_failed, cancelled, deadline_exceeded, worker_unavailable, internal_review_error, review_busy, metadata_unavailable。

request>0ならphaseはanalyzeまたはfinish。0は元の未対応sentinelだけに使う。event／phase／detail／codeの追加の因果検査はsource adapterの別契約で、文字列がこの集合にあるだけでstrict reply受理やOS終了を証明しない。

## 4 局所関係検査とprivate側の証明を分ける

| pure coreで検査する関係 | 補完してはいけないもの |
|---|---|
| modules／cases／scopes／scope_tailsは各ordinal昇順・重複なし。workersはscope昇順で、同scope内は番号付き行をworker昇順・重複なしで先に置き、`worker_ordinal=null`の行をその後へ受理順に置く。nullは`active=false`のscopeだけに許可する | sort／dedupで壊れた入力を受理しない。worker ordinalのgapはfactory throw等で生じ得るので欠番だけで拒否しない。nullの行へ番号を補完しない |
| 全caseのmodule参照、全scopeのcase参照、event／workerのscope参照が存在する | 私的なcase／scopeの登録済みという真偽は証明できない |
| 各moduleのCaseCountsが同moduleを参照するCaseのstate別件数と一致し、総数も一致 | moduleのcompletedやcaseのpassedを配列位置から推測しない |
| scope_tailsはscopesと同じscope集合。last_seq=log_count、scope別event seqは1から連続してlast_seqまで。同scope内at_msは非減少 | sourceからeventが落ちていない真偽、別scope原点の同一性はprivate側の証明を要する |
| eventsはaggregateで受理した順を保持し、scope別seqを検査する。global時刻sortやscopeごとの並替えは禁止 | scope-local at_msの大小でrun内の前後を推論しない |
| `source_event_ordinal=0`なら全配列が空でsample_count=0。`N_e≤source_event_ordinal` | source側で受理したevent数の真偽はprivate側の証明を要する |
| sample_count=samples.length、sampleは受理したprefix順でrun相対at_msが非減少。同時刻の標本を勝手に削除しない | sample値の採取・owned_treeの所有・OS終了の証拠を推論しない |
| active=trueならscope reason none、active=falseならnone以外。workerの非null時刻はcreated_ms以上、exitedとexit_ms非nullは同値 | event tailがworker行の更新をすべて表すとは仮定しない。exitとterminateの順も一律固定しない |
| outside_scopeのcaseにscope行なし、observedのcaseに1件以上のscope行。unknownはcoverage不足を残す | scope外Unknownだけで不完全にせず、outside_scopeの正当性はprivate inventoryへ照合する |

Caseのdiscovered／runningはfailure_class=none、duration=null。passedはnone、failedはassertion／module／hook／unhandledのいずれか。skipped／todoはnoneかつduration=null。not_runはnone／module／hook／not_observedでduration=null。unknownはcollector／not_observedでduration=null。実行済みterminalのduration=nullは未観測であり、必要coverageが満たされたとは扱わない。

Moduleのfailedはmodule／hook／unhandled、unknownはcollector／not_observed、それ以外はnoneとする。module completedでもfailed caseを保持できる。case unknown／scope対応unknown・inactive scope・`observed`以外のmetric（`not_supported`を含む）があればprefix incompleteと固定理由を要する。その環境でmetricを取得できなければrun completeにならず、実samplerの接続時に見直す。途中のdiscovered／runningや未観測のworker phaseだけで異常を捏造しない。

run completeなら、局所的にもrunning／discovered／unknownのcaseや非終端moduleを残さず、必要な値と参照が揃うことを要求する。ただし、局所的に矛盾がなくても**期待対象集合・reporter終端・generation／cutoffの真正性を満たしたとはいえない**。private ownerが別途照合するまで候補DATAである。test_terminalがpassedなら、captured本文に明示failed case／module failure／unhandled error（`not_run`caseのmodule／hook failureを含む）がある矛盾を拒否する。未観測をfailedやpassedへ変換しない。

実Vitestのstate／retry／parameterized case、inventory、scope原点、worker ordinalと更新世代、samplerの正規化は未接続。本契約はそれらのmapを承認しない。対応不明ならsource_unavailableで接続拒否し、配列index＋1やnull→0で埋めない。

## 5 固定encodingの幅

ASCII key／enum／hexと上記scalarだけを使い、空白なし・key順固定・UTF-8・envelope末尾LF 1 byteとする。文字列のquoteは幅に含める。compact JSON objectの幅は、field数n>0について`2+Σ(key.length+3+valueWidth)+(n−1)`。配列のrow幅Rにはseparator上界1 byteを含める。各fieldの独立上界を足すため、同時達成できない値の組合せを含む保守的上界である。

| row／固定部 | 記号 | 上界byte |
|---|---|---:|
| Case | R_c | 177 |
| Module（CaseCountsを含む） | R_m | 218 |
| Event | R_e | 227 |
| Scope | R_s | 181 |
| Worker | R_w | 409 |
| Sample（Metric 3個を含む） | R_p | 264 |
| ScopeTail | R_t | 51 |
| Snapshotの固定部（空配列の括弧、cutoff／coverage含む） | K | 321 |

`R_p`のMetricだけはstatusとvalueの対応を使い、variant別の最大（observedは`30+X`、それ以外は39）を幅とする。fieldごとに独立に足すと279になるが、到達できる最大は264である。CaseCounts単独は127、coverage単独は78、空scope_tailsを持つcutoffは77 byte以下。recordの同じrowを二度課金しない。SはSnapshot objectそのもの（末尾LFなし）の幅上界とし、`S=321+177N_c+218N_m+227N_e+181N_s+409N_w+264N_p+51N_s`。N_s R_tを落とさない。

| trigger | detail上界 | captured envelope上界（LF込み） | 本文なし上界（LF込み） |
|---|---:|---:|---:|
| conditions_ready | 200 | 対象外 | 486 |
| child_started | 57 | 対象外 | 340 |
| first_anomaly | 125 | S+449 | 500（unavailable） |
| slow_hint | 69 | S+389 | 440（unavailable） |
| test_terminal | 55 | S+379 | 430（unavailable） |
| stop_requested | 88 | S+413 | 464（unavailable） |

最悪共通式は`E_full=S+449`、本文なし全variantの共通上界は`C=500`。500は**この値契約の構造式の結果**で、運用B_controlの承認や既存Storeの変更ではない。実装時は別のgolden文字列・数え上げで検証し、count pass／write passの同じ間違いで互いを正当化しない。

契約上の件数最大N_c=20000、N_m=1000、N_e=20000、N_p=600を代入した保守式は`E_full=8,457,170+232N_s+409N_w`。N_s／N_wのcapは未承認で、この式から一つの実run容量を承認しない。上界が大きいこと自体を実データの必要最小値と混同しない。現行64KiB Storeに契約最大値の本文が収まらないという親の前提は維持し、Store接続前の別承認を省略しない。

## 6 shape・計数の受付条件

N_c≤20000、N_m≤1000、N_e≤20000、N_p≤600。N_s≤明示L_scope、N_w≤明示L_worker、各scopeでevent／worker row数≤4096。scope_tails長はN_s。`N_e≤4096×N_s`とworker総数の同様の式もchecked乗算で照合し、1 scopeにrun全eventを押し込める形を拒否する。空snapshotでは全件数0を許すが、それだけでrun completeにしない。

追加のbyte／work capは親契約どおり未導出・未承認。pure候補実装にも必要な入力上限を明示供給し、未指定／0を無制限にしない。宣言shapeだけを信用して任意objectをwalkせず、実際のbounded値から得たshapeと一致させる。加算・乗算・encoded長・work残量のoverflowは固定拒否である。

値の厳密検査・row関係検査・添字作成・算術・scalar文字列化・copyの費用は別々に数える。これらをDT-Cのheader用clock／copy式へ無料で足さない。新しいCPU work unit／統合予算profile・実heap／wall-timeは未確認で、この計数結果から実行permitを作らない。

## 7 本文なし予約と切替えの前提

最初に6 slot分のcontrol構造予約`6C=3000 byte`を確保する案とする。実際に保存するcontrolだけをStoreへ1回渡す。control予約を本文の予算として先に使わず、捕捉／encoding失敗後に残slotのunavailableを作れる枠を失わない。

保守的なrun予約案は`6C+ΣE_full,i+B_other_artifacts`。captured用E_fullはcontrol予約と別に所有させ、同slotの未使用control枠は返却して別slotの成功に使わない。これは予約の上界で、Storeの実charged byteへ二重課金する指示ではない。実出力6ファイルは最大4本文＋2controlであり、6個の本文を許す意味でもない。

captured→unavailableは親設計どおりStore開始前だけ一度許す。sourceの再読／capture retryはしない。本文と失敗variantの一時copyが同時に存在する場合のscratch、元capsuleの退役／custody責務・固定discard証拠は後続契約を要する。本pure値契約は切替えや破棄を実行する権限を持たず、同値DATAを渡して既存claimを再開しない。失敗variant自体がencodeできなければ停止し、再帰しない。

## 8 純粋実装の範囲と検証条件

最初の実装は本契約の内部値型・strict variant・局所関係検査・shape／encoded上界の純粋計算だけ。新規合成fixtureで値を作っても、private capture／custody／issuer／receipt・Store保存には接続しない。旧v1・既存型／試験・正式閉鎖状態を維持する。

| 対照 | 必須の独立検証 |
|---|---|
| 10 variantと全enum | 既知値・不足／未知field・null／禁止field・statusの不一致。JSONのcaptured／completeだけで証拠を発行しない |
| 全row・関係 | case/module集計、scope/tail集合、local seq、worker gap、worker_ordinal=nullの位置とactive=true時の拒否、source_event_ordinal=0と件数の矛盾、coverage 3項目の組合せ、global event原順序、metricのnullと0を区別 |
| 幅と算術 | 上記object式とは別のgolden文字列、行数0／1／上限、N_s R_t、Metricのvariant別最大、末尾LF、overflow、numeric token幅の境界 |
| value parser | accessor／Proxy／prototype／cycle／sparse array等を拒否し、hookを実行しない。raw JSONのduplicate-key試験は別parser未実装なら未実施と明記 |
| 失敗 | 小さな合成capで不足を拒否し、cap引上げ／間引き／v1 fallback・保存0。固定理由だけ返しraw値／秘密を出さない |

draft-0.2時点ではfield・enum・幅の算術をMD作成時の読み取り専用計算で照合しただけで、validator／encoderの合成試験ではなかった。今回の明示指示により§9の純粋coreを追加したが、encoder・実sourceへの写像・capsule切替え／custody・Store上限見直し・運用capと実機承認は未確認／未承認のままである。

## 9 合成専用coreの実装境界

配置は`tests/review/fixtures/snapshot-value-core.ts`、試験は`tests/review/snapshot-value.test.ts`と`value-core-detailed.test.ts`。依存はProxyの非実行判定用`node:util.types.isProxy`と純粋な`value-core-accounting.ts`だけ。故障用の別assemblyはcoreからimportしない。実台帳・clock・recorder・Store・runtimeのimportはない。`src`／build／packageの入口は変更しない。`CheckpointValue`は2 control＋4 captured＋4 unavailableのreadonly unionであり、nominalな発行証拠ではない。

| 純粋API | 受付・返却 |
|---|---|
| `validateCheckpointValue(value, limits)` | 固定field順のown-data record／dense標準arrayを検査し、入力参照を残さず全containerをcopy／freezeする。局所関係を照合した`non_executable_value`・実測shape・当該variantのencoded上界・workだけを返す。bytes／receipt／保存関数は返さない |
| `inspectCheckpointValueDetailed(value, limits)` | 同private engineを一度実行。固定modelと`accounting`を追加し、失敗でも完了した課金を保持する。成功はobserved work必須、失敗はobserved／unavailableを区別する。legacy APIは同結果から旧成功／失敗形へprojectionするだけ |
| `calculateSnapshotBounds(shape, limits)` | shapeの順は`cases, modules, events, scopes, workers, samples`。件数上限・scope局所aggregate上限とchecked算術を検査し、S、最悪captured=S+449、control=500、6control=3000を返す。渡されたshapeの真正性は証明しない |

limitsの固定順は`max_scopes, max_workers, max_nodes, max_work, max_snapshot_bytes, max_control_bytes, max_file_bytes`。全て明示の正safe整数で、0／欠落／余分fieldを拒否する。これは**合成呼出しの拒否閾値**で、本番cap承認ではない。validatorはcapturedならSと当該frame上界、control／unavailableなら当該本文なし上界を検査する。standalone計算器は最悪captured・500を検査する。3000は構造式の返値だけで、予約操作やその受付を実行しない。

内部計数は`structural, relation, arithmetic, number_formatting, copies`とその総和を分ける。limitsの固定初期計数8、各record入口／field・array入口／index・scalar／discriminator検査、明示の関係検査／索引処理、上界式のchecked加算／乗算、数値のintrinsic formatter呼出し＋token長、copyしたscalar／containerをそれぞれ計数する。enumの有限比較等は当該scalar単位に含む。`max_nodes`はstructural計数、`max_work`は総和の上限であり、実CPU命令数・allocator byte・DT-Cのclock／copy式ではない。失敗は`schema / relation / limit / overflow / invalid_value`だけで、raw値・例外・秘密は返さない。

数値は捕捉したintrinsic Number formatterで32文字以下・往復同値を確認し、小数を丸めない。これはbody encoderではない。fieldを読むgetter・toJSON・外部iteratorは呼ばず、Proxyはreflection前に拒否する。schemaが有限で再帰参照を持たないためcycleは許可される終端型へ到達できず拒否される。異scopeのevent原順序・worker欠番・inactive scope末尾の複数null worker・同時刻sampleを維持する。

**未確認:** raw bytesのUTF-8／duplicate key／token制限はRP-A／RP-Bの別入口で合成実装したが、本値coreへの接続は未実装。任意unknownに対するnative reflectionの一時heapと実時間、Number formatter全binary64入力の証明、実reporter／inventory／worker世代／cutoffの真正性、統合work／scratch費、private owner・予算・custody結合、発行・capture・保存は未実装／未承認。合成成功やJSONのcompleteを根拠にUnknownを確認済みへ変えない。
