# RD-A FinishContextEvidenceの詳細型・private発行契約

Version: br006-finish-context-rda-draft-0.2 / Date: 2026-11-02。
Status: **RA-01の値型・bounded projection／比較だけ合成依存で実装。RA-02／03のprivate発行・受理とlive証拠は未実装。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `a62c897`。[SR-D接続設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_SRD_DESIGN.md)§1〜3・9のRD-Aを具体化する。[SC2-D](BEST_PRACTICE_ABORT_SCOPE_WORKER_RECOVERY_CONTINUATION_DESIGN.md)と[通常WJ-C](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)の既存契約は維持する。コード・公開JSON／MCP・設定を変更する指示ではなく、実接続・実通信・本番cap／Permit投入の承認ではない。

## 1 入口と保証の分離

初期対象はworker期限型のSC2-D private handoffだけ。phase型SR-Bのsummary、SC2-Dのauthority:none summary、任意aggregate JSONは受理しない。現planにないUpdate Set ID／構造化release／reviewed期待contextを、応答や現在値から復元しない。

**FinishContextEvidenceは空の別brand opaque handleであり、外から渡せる証明書JSONではない。** 実体は同ownerのprivate slotが保持する下記snapshotへの一度限りの対応。型キャスト・コピー・同じID／hash／日時からは作れない。

| 層 | 保証 | 保証しないこと |
|---|---|---|
| strictな値projection | 型・上限・集合／時刻・期待contextの整合 | 発行元の本人性・実sessionの取得証拠 |
| private issuer slotとhandle | 同合成owner／plan／receipt由来、発行・受理が各一度 | 実payload／解析済み結果、OS workerの生存 |
| live routeの再検査 | 同fake frameがready、cleanup未開始、元guard生存 | 将来までの生存。finish直前には再検査が必要 |
| AcceptedFinishContext | RD-B/Cへ渡すprivateな非実行期待値 | finish実行権限、候補、正常cleanup証拠、実結果 |

full schema／wire／findingsの検証と実結果公開はRD-Aの保証に含めない。未実装の入力証拠やsource lifecycleをUnknownのまま受理せず、次段への封印を拒否する。

## 2 固定発行元と配置案

配布対象外の同test-only module内に、**新しい合成finish assembly factory**を置く案とする。旧`createSyntheticSoftRecoveryIssuer(seed, facts, check)`はそのまま残し、追加証拠を持たない旧fixtureはSC2-Dのsummary／固定discardだけを引き続き使える。

- 新factoryは独立した合成ownerとfixture専用の構築データからprivate補助slotを準備する。共通の内部構築kernelを使う場合でも、元ownerのguard／busy／hard slotは一つ。既に存在するowner／本物のsessionを後から登録・昇格させるfactoryやfriendは作らない。
- fixture構築データは合成前提の値で、strict検査してpinする。任意値を受けること自体を実取得・実analyze受理の証明にしない。合成入力にもsource／window／release／receiptの同一性を要求する。
- headerは回復応答を見る前、receiptの期待context／結果参照は元の合成受理を表す構築継続で保持する。soft後に新input・新T_i・再解析を作らない。
- 発行操作案`issueFinishContext(binding, handoff)`はraw header・結果・factory callbackを受けない。既に同構築でpinしたprivate補助slotと、同SC2-D受取slotだけを読む。
- 返すのはopaque handleだけ。新factory／issuer／brand／scopeはtests配下へ限定し、src・dist・宣言／mapへ持ち込まない。runtimeのclaim台帳／fixture登録口は共有しない。

このfactory名と共通kernel配置は案。既存exportへ任意の追加引数や厳密でないoptionsを足す方式は採らない。実装時は旧API・旧試験を維持する別の変更単位で配置を確認する。

### 2.1 private slot一覧

| slot案 | 作る時点・内容 | 終了条件 |
|---|---|---|
| PinnedFinishSeed | 新合成factory。strict header基礎値、元source／window／release参照 | hard／正常終端で破棄。responseから置換しない |
| AcceptedReceiptLedger | 同構築のreceipt受理前提を固定。receipt→ID／T_i／期待context／受理stateとimmutable結果参照 | planとの照合後に同snapshotへ移す。receiptを再登録しない |
| SourceLifecycleSlot | 同sourceのfakeなopen／closing／closed／failedと単調なclose開始事実 | open以外は新受理不可。正常close証拠の発行はRD-Dまで未接続 |
| FinishContextIssueSlot | `unused → issuing → issued`。同handoff／snapshot／handleを一度保持 | issue失敗はfailed。再発行・復元なし |
| NewFrameRouteSlot | 同SC2-Cのframe、ready受理継続、cleanup serial／開始状態、route claim | cleanup開始・hard・closeで失効。ready counterのcopyで作らない |
| FinishContextAcceptSlot | `unused → accepting → accepted`。受理済みprivate期待値と別brand handle | handoffと証拠の消費は一度。失敗後の再準備不可 |

各slotはowner内だけに置き、共有の可変registryやpublic setterを作らない。公開inspectには状態・件数・固定失敗stageのみを示す。handle／frame／receipt／ID・時刻列／release値／結果本文をinspectから回収できないようにする。

## 3 FinishContextEvidenceのstrict内部項目

snapshotのtop-levelは次の**10項目だけ**とする。これらはissuer内部で組み立てる欄で、外部JSONをこの形へparseしただけで証拠になるものではない。

| 項目 | 型役割・固定条件 |
|---|---|
| kind | literal `synthetic_finish_context_v1`。内部契約版で、公開review schemaではない |
| owner | 同ownerのprivate binding参照 |
| run_context | strictな`run, session, source, key, origin, budget, release, window, started_at, deadline_ms, observed_at, upper_utc`。参照8個は元seed／planと同一。時刻4値は元S／全L／O／U |
| plan | SC2-Dの同private plan identity。対応handoffと受取slotの同一性はslot側で保持し、数値serialだけで代用しない |
| header | §3.1のdiscriminated projection。schema以外も同source／window／releaseからpinした値 |
| selected | 同plan.rowsのimmutable ID列。最大100件・重複なし・canonical順。新しい選択一覧へ差替えない |
| inputs | §3.2の同receipt ledger projection。最大100件、元T_iを保持 |
| outcomes | §3.3の選択ID全件に対応するstrict union。元completed／未処理状態を維持 |
| route | §4のprivate route witness。frameとready provenance、cleanup未開始の同一性を結ぶ |
| source_lifecycle | 同SourceLifecycleSlotへのprivate参照。元sourceが現在openであることを受理時に再検査 |

run_contextのUTCは元契約のms精度24文字、Lはsafe integerで1〜60000。`S <= O <= T_i <= U <= S+L`、受理順は非減少、全inputの最大T_i=U。初期worker期限型はactive receiptを要するのでinput 0件は拒否する。元時刻を文字列で再申告させず、元ownerの同immutable timeとの結合も要求する。E・ended_at・finish id・候補はRD-A入力へ含めない。

### 3.1 header projection

0.2は次の**12項目だけ**：`schema_version, target, versions, started_at, instance_release, release_match, principal, collection, coverage, limits, limitations, errors`。0.3は同項目に`selection`を必須追加し、0.2ではselectionを禁止する。`assets, counts, ended_at, status`や権限bool・関数は受け取らない。status／consistencyはplanから、counts／Eは後工程から作る。

| 項目 | strict条件・照合元 |
|---|---|
| schema_version | `bp-mcp-review-0.2`／`bp-mcp-review-0.3`。同構築の固定schemaに一致 |
| target | `update_set_sys_id`=32桁lower hex、`target_version`=update_set_payload、`instance_binding`=64桁lower hex。source側の同pinに一致 |
| versions | 既存aggregateのknowledge_base／ruleset／asset_schemaだけ。要求ruleと既存ruleset導出の整合を確認 |
| started_at | 元Sと完全一致。残時間から作り直さない |
| instance_release | 既存`releaseEvidenceStructure`のstrict union。元release参照に結ばれた同構造化snapshotを使い、応答側で補完しない |
| release_match | 既存release値から導出した値に一致。初期のworker解析回復routeはmatchedを前提とし、unknown／mismatchedから本routeを作らない |
| principal | auth_modeだけ。per-user／service-accountの同合成snapshot。credential／本人IDは含めない |
| collection | scope=caller_acl_visible、status=complete／failedでplanと一致。metadata_seenは0〜101、selectedは同selected.length、truncatedは同windowのfake観測値。見ていない件数を追加しない |
| coverage | 要求ruleは既存enumの1〜14件・重複なし、skipped_rulesは既存strict項目・最大14。analysis_complete=false。0.3ではanalysis_scope=selected_candidate_window、candidate／update_set_inventory_complete=falseも必須 |
| limits | max_recordsは1〜100の同pin、max_findings=100、max_response_bytes=262144、deadline_ms=60000。実効Lを宣言値で延長しない |
| limitations | 最大100文字列。初期局所比較は既存WJ-Cと同じ1〜200文字のsubsetとする。aggregateが許す最大2000文字を本局所経路がすべて扱えるとはしない |
| errors | schema別の既存strict stage／code／任意target ID、最大100件。既存の打切り／error_details_truncated規則を維持し、回復由来の必要理由を失わせない |
| selection（0.3だけ） | 既存filter_version・requested_asset_types・action_scope・order・null excluded_countsをそのまま検査。要求rule／同windowと一致させる |

collection.selectedはlimits.max_records以下かつmetadata_seen以下とし、等号を許す。poc_only=true／code_return_mode=noneは固定継続が作る定数で、headerの可変入力にはしない。通常WJ-Cより広い文字列や公開aggregateで合法な値でも、今回の局所subset／総量枠を超えれば対応範囲外として停止し、全schema対応を主張しない。

値schemaと意味検査を分ける。構造化releaseのbind・configのS時点有効性と`expires_at > S+60000`、rule／versions、selectionと要求asset typeを検査する。release観測UTCと将来のEの比較はRD-Bに残すが、reviewed期待値については元T_i時点の既存release検査が必要。config日時の新しい長さpolicyは承認せず、既存ISO検査と局所総量上限で停止する。

planのsoft／verify由来limitations・errorsをheaderに固定合流する際、limitationsは既存の一意化後も最大100件で、超過は拒否して必要制限を削らない。errorsは既存の最大100件・error_details_truncated規則を使い、打切り時も元のsoft／verifyの型付き事実はprivate slotで保持する。成功扱いにする削除や、plan.consistency=changed／unverified、collection failedをheader値で上書きすることを許さない。ここでのprojection検査をaggregate full schema検証と呼ばない。

### 3.2 inputsとreceiptの結合

各inputはstrictな`receipt, update_xml_sys_id, retrieved_at, state, expected_context`の5項目。先頭4項目は同plan.inputsと一対一・同順序で、stateはcompleted／not_processed。receipt参照・IDはそれぞれ一意で、選択集合の部分集合。後からreceiptを再発行／再受理しない。

expected_contextは、元の合成受理で保持した場合だけstrictな5項目`record_updated_at, instance_binding, instance_release, requested_rule_ids, release_limitations`を持ち、保持していない場合は**明示null**。欠落やundefinedは拒否する。日時・hash・release／ruleと局所上限は既存WJ-BのpinExpectedを基準とし、同receipt／ID／T_iとのbindingも要求する。

- reviewedまたは元reviewedからomittedになったinputはexpected_context必須。target／Update Set／record_updated_at／release／rules／必要limitationsと、reviewed_at／target.retrieved_at=T_iの受理済み記録へ結ぶ。
- 未完了inputをnot_processedへ終端化してもreceipt／T_iは保持する。元期待contextが存在すればそのまま保持するが、欠けていたものをreviewed用の値へ補完しない。finishで再解析しない。
- rejected等でreceiptがない選択行に新receiptを作らない。inputが存在する場合だけ対応を検査し、値だけのstate記録を解析受理証拠へ昇格しない。

SC2-Aの一般化した複数未完了input／非最新active receiptの許容は変更しない。active inputだけでなく全受理済みinputからUを確認し、実adapterの逐次順序を証明したとはしない。

### 3.3 outcomesとimmutable結果参照

outcomesは選択ID全件に一度対応する最大100件のdiscriminated union。ID順はselectedに合わせる。外から任意のfull result JSONをここへ追加しない。

| variant | 許す項目と発行前提 |
|---|---|
| reviewed | `state, update_xml_sys_id, receipt, accepted_outcome`だけ。同completedと同receipt、元の期待context照合後のprivate AcceptedOutcomeRefを必須とする |
| result_omitted | `state, update_xml_sys_id, reason, reviewed_origin`。reason=response_limit。元reviewedのomissionならreviewed_originはstrictな`receipt, accepted_outcome`の2項目で同receipt／AcceptedOutcomeRef、そうでなければ明示null。元受理stateを勝手に変更しない |
| その他の非reviewed | 既存`assetOutcomeStructure`の該当variantの項目だけ。同plan.assetsのstate／reason／asset_typeと一致。not_processedはdeadline_exceededの確定を維持 |

AcceptedOutcomeRefは、同合成assemblyの元受理slotにあるimmutable synthetic outcomeへのopaque参照。発行者がfixture値を作り、元receiptの重要contextを検査・post-guard受理した継続だけが発行する設計とする。現在のWJ-Bにこのexportはなく、capture hook／slot接続は未実装。通常WJ-Bの公開summaryやraw resultをあとから登録する口は作らない。

reviewed_originの有無は同private ledgerの元受理variantとomission継続から固定し、callerのboolやnull申告で選ばせない。元reviewedだった記録から参照だけを落としてnullにすること、逆に元omittedへreviewed起源を捏造することを拒否する。

親は必要contextだけをboundedにpinし、payload・code・findingsを再copy／再解析しない。結果のimmutable性が供給元で保証できなければUnknownとして封印拒否し、受理側で任意の可変resultを後からdeep-freezeして救済しない。局所context比較の受理をfull findings／wire検証の証拠へ昇格しない。

RD-Aは元reviewedを新しくomittedへ変更しない。RD-Bのfinish比較でだけ、既存finalizeによるreviewed→result_omitted／response_limitとresponse_truncatedを扱う。元reviewedの証拠不足をomissionで回避しない。

## 4 ready・cleanup未開始のprivate証拠

ReadyRouteWitnessの内部項目は`owner, frame, ready_origin, cleanup_origin, source_origin`の5つ。frameは同SC2-Cのsupervisor／worker／generationの束、ready_originは同lease／eventの受理継続から保持したprivate identity。counter・文字列ID・公開ready handleのcopyでは発行しない。

frameの内部項目はsupervisor／worker／generationの3参照。ready_originは同lease／event／post-guard受理slotのidentityへ結ぶ。cleanup_originは同lifecycle／frame／sink参照とstart_serial（未開始0、最初の開始claim後1、safe integer）を保持する。source_originは同source参照とSourceLifecycleSlotに結ぶ。いずれもprivate継続だけが作り、callerがこれらの形のobjectを作っても証拠にはしない。

cleanup_originは同新frameのprivate cleanup lifecycle identityと開始serialを指す。開始前serialを保存するだけでは不十分で、次をissue／acceptの各pre/post guard内で再照合する。

1. 元run／同bindingが生存し、同plan／frameにready受理済みで、finish未開始・pendingなし。
2. 同source lifecycleがopen。closing／closed／failedなら拒否する。
3. 新frameのcleanupが未開始、同serialのまま、同診断sinkが未消費。closing／closedやrequested事実があれば拒否する。
4. routeの利用claimが未使用。accept時に一度消費して期待値ownerへ移す。

**過去にready_events=1であることと、今finish可能なrouteであることを分ける。** cleanup開始claimは、要求処理や依存呼出しより先に単調な開始状態／serialを更新し、record／confirmed／失敗で巻き戻さない。新private lifecycleは未実装であり、現在のSC2-Cのstatus=not_startedやsinkが残っているという診断だけで代替しない。

受理後にcleanupが始まればAcceptedFinishContextのrouteも失効する。RD-Cでfinishを発行する直前にも元ownerの同live条件を原子的に再検査する。RD-Aでの受理を将来の生存証明やfinish job発行権限にしない。既にcleanup済みのSC2-D handoffは引き続きsummary／固定discardに使えるが、本入口では拒否する。

## 5 発行・一度限りの受理・状態

issueとacceptは同ownerのguard／busy／hardを共有する。先にbusy／hard／bindingを検査し、他ownerのslotを検索・消費しない。その後は自分のslotを先に占有するため、不一致handleによる失敗でも自ownerのclaimを戻さない。

| 操作案 | 最初のguard前 | 固定処理とpost-guard | 失敗時 |
|---|---|---|---|
| issueFinishContext(binding, handoff) | issue開始claim占有、private補助slotの発行可否を一度占有。handoffは参照照合だけでまだ移譲消費しない | 同受取plan、pin済みheader／receipt ledger、source／live routeを照合してsnapshot作成。post後だけopaque evidenceをslotへ発行 | 補助slot・未発行snapshotを破棄、hard停止。再issue不可。cleanup責務は残す |
| acceptRecoveryFinishContext(binding, handoff, evidence) | 同SC2-D受取slot／handoff、同evidence slot／handle、受理開始claim、route利用claimを一つの保護区間で取り外す | 再び同plan・集合・receipt／時刻・header・live routeを検査し、非実行ExpectedRecoveryFinishDraftへ移す。post後だけ別brandのAcceptedFinishContextを発行 | 全取得済み参照と能力を失効、元slotへ返さない。部分移譲を成功扱いしない |
| discardAcceptedFinishContext(binding, accepted) | acceptedを一度取り外す | 元source／新frameの固定cleanup責務へ引き継いでから期待値参照を破棄する。元UTCは従来の正常close／terminal discardまで保持 | 確認不足をnormal closeで隠さずhard停止。開始済みcleanupの診断回収は継続 |

discard開始後はfinish経路へ戻さない。正常なdiscard完了には同sourceの正常終端と同新frameのcleanup確認を必要とし、単に期待値参照を落としただけでは正常完了を返さない。これらのfake終端継続が未接続なら完了はUnknownで、発行済み診断sinkによる回収とhard終端dataの固定破棄だけを残す。これはRD-Dの候補用正常終端能力を先行発行する口ではない。

先にSC2-Dのsummary分岐を選べばhandoff自体が存在せず、issueを拒否する。issue後は同handoffの固定discardが競合し、消費・無効化されたら後のacceptは拒否する。handoffへ移したplanからsummary分岐を呼び戻さず、accept後もSC2-Dの固定discard・summaryへ戻さない。共存する二つの入口が別々に同planを消費できる台帳を作らない。

受理済みdraftは同owner／plan／frame／source lifecycle・元time・immutable集合と期待値をprivateに保持する。RD-AではE・finish job・候補・正常close証拠のslotは未導出のまま。必要な証拠不足で仮draftを作っても、acceptedへ進めず実行可能なpartsとして返さない。

各guard・await導入時の復帰後にも同ownerで失効確認し、残時間の保存値で生存を代替しない。現段階は同期fakeの状態モデルだけを対象とし、タイマー・実clock・I/O・workerを導入しない。

## 6 停止・解放責務・診断

| 対象 | 受理前 | 受理後／失敗後 |
|---|---|---|
| header／receipt／結果参照 | 合成issuerの補助slotが所有 | acceptedへ一度移す。hard時にprivate参照・handleを同期破棄。既存immutable fixtureの外部copyや物理heap消去は保証しない |
| 新frame・cleanup sink | SC2-C／Dの元ownerが所有 | 同owner内の固定終端側へ論理移譲するが、物理sinkを複製しない。要求・確認を二重計上しない |
| source lifecycle | 元sourceのprivate fake ownerが所有 | open証拠は正常close証拠ではない。固定source sectionの責務を維持。実sessionは扱わない |
| UTC／会計 | 元ownerのS／全L／O／U・C/G/P | 変更・再課金・再採取なし。hard後は終端dataだけ、正常closeで破棄 |

混入・重複・不正項目・上限超過・証拠不足／Unknown・未知例外はinternal_review_errorで停止。元guardのcancelled／deadline_exceeded等の最初のhard理由を保持し、元soft・旧cleanup・新cleanup・source終端は別slotに残す。比較失敗とpost-guardの失効が重なれば後者を先に確定し、raw例外・秘密・stackを出さない。

hard後に同診断sinkからcleanup confirmedを回収しても、evidence／route／acceptedを再発行しない。診断からNewCleanupConfirmedの正常能力を作らず、その接続はRD-Dの健康な固定終端継続に残す。sourceと新frameの未確認解放は別軸で保持し、一方の成功や最終resource数0だけで両方のsection実行を証明しない。

元ownerは、受理前のhandoff、発行済みevidence、accepted期待値、cleanup責務のいずれかが残るnormal closeを拒否する。失敗時のcleanup責務はslotを落とす前から固定終端ownerに保持させ、診断回収の発行済みsinkを失わせない。実cleanup待ち上限・OS終了・外側checkpointはRD-Aでは保証しない。

## 7 有限枠・費目所有と実装分割

strict検査は非Proxyのplain／null-prototype objectとown data descriptorだけを扱う。余分／不足key・symbol・getter／setter・疎配列・非safe integer・循環を拒否する。配列は最大100、ruleは最大14、ID／receiptは一意。immutable outcome参照はtrustedな合成slotからだけ受け、projectionの外で任意getterをたどらない。

headerと全receipt／outcome projectionを合わせ、一つの収集予算で深さ8・object項目30・訪問10,000・保守的文字費262144以下とする。1 recordごとにこの枠をリセットして100倍にしない。結果本体を参照共有することと、projectionの消費量を0にすることは別。収集・比較・freeze／claim／guard／失効・discardを別イベントとして将来oracleで数える。exact layout／allocation・全体work上界はUnknownのまま、全体受付を有効化しない。

| 最初の実装分割案 | 合成だけで確認する範囲 |
|---|---|
| RA-01（値層実装済み） | 別brand・strict値型とbounded projection／比較。不足項目・不正variant・総量超過を拒否。発行や実行能力なし |
| RA-02 | 新合成assemblyのpin済み補助slot、receipt／immutable outcome由来、issue one-shot。旧factory／SC2-D互換、外部登録・responseからの昇格なし |
| RA-03 | 同handoffと証拠の原子的受理、ready／cleanup未開始・source openのfake lifecycleとclaim、失効／解放責務の接続。非実行acceptedまで |

RD-B/C/Dへ進む前に各段階の実コード配置・抽出範囲を確認する。通常WJ-Cの未完了receipt拒否、full schemaの責務、公開JSON／MCP、実transport／workerは変更しない。新しい本番capやconfig日時長policyを入れない。

## 8 合成受入条件・未対応事項

独立oracleは実装helperを呼ばず、固定ID／receipt対応表・UTC列・有限イベント位置から求める。

- 0.2／0.3のstrict key差、各variantの不足／余剰項目、unknown rule／不正release・selection・matched条件、0／1／100／超過を確認する。
- reviewed期待値や元受理参照が欠けたとき、omittedやsummaryで救済できない。未受理receipt、同ID別receipt、receipt重複、集合追加／欠落／state昇格、T_i書換え／逆行／U切下げを拒否する。
- 同owner／source／window／release／plan／timeへの結合、copy／別assembly／任意JSON／旧WJ-C summary／SC2-D summaryを拒否し、他ownerは不変であることを確認する。
- issue／acceptの全pre/post guard、再入・二重issue／二重accept・失敗後再準備、issue後のhandoff消費、同じ台帳の競合を確認する。
- ready履歴があってもcleanup開始／失敗／確認済み・source closing／closedなら拒否する。issue後・受理中・受理後にcleanupが始まってもrouteを復活させない。RD-Aのacceptだけでfinishを発行できない。
- 新analyze／input／HTTP／E採取／finishは0、同C/G/Pを保持。hard後のcleanup診断回収と能力復活0、元UTCの終端保持、秘密非出力を確認する。
- 既存SC2-A〜D・SR-A/B/C①・通常WJ-A/B/Cを維持し、関数／brand／scope／path／宣言／mapの非同梱、I/O／時計／worker依存と漏出の負の対照を別確認する。compiled保証／B-03は別工程。

private source lifecycle、cleanup開始serial、元analyze受理のcapture hook／immutable結果保管、新assemblyの発行slotは**すべて未実装**。RA-01だけでこれらを確認済みにしない。full結果／wire比較・Eと候補はRD-B/C、正常source／新cleanup能力と一度候補消費はRD-Dへ残す。phase型・実session／ReleasePermit／payload／worker jobの正式binding、実finish／runtime・実通信・設定変更は対象外。

## 9 RA-01実装範囲と制限

`tests/support/review/synthetic-finish-context-values.ts`だけに値層を置く。`projectSyntheticFinishValues`はreadonlyな非実行projection、`compareSyntheticFinishValues`は固定の比較結果を返す。privateなvalue-only Symbol brandと、発行関数のない`SyntheticFinishContextEvidence`型を分離し、projectionを証拠型へ代入できない。issuer・claim・runtime登録口は追加しない。

strictな0.2／0.3 header、input、outcome unionを検査し、S／O／T_i／U・集合・期待contextの値整合と元参照の一致を確認する。参照欄は非Proxy objectのopaque placeholderとして保持するだけで、取得元・immutable解析結果・ready／open／cleanup未開始の真正性を証明しない。元active receipt、plan由来のlimitations／consistencyなどとの照合はRA-02／03までUnknown。headerのrelease観測UTCと将来Eの関係はRD-Bへ残す。

深さ8・object項目30・配列100・訪問10,000・文字費262144を一つの収集予算で検査する。文字費はkey／文字列のUTF-16長×3であり、最大到達値262143と次の262146を境界試験する。比較は両入力で同予算を共有する保守的subsetで、個別projectionが合法でも二つ合わせて拒否し得る。非opaqueの共有参照は出現ごとに課金し、循環・getter／symbol・疎配列を拒否する。opaque参照の内部は読まず、freezeもしない。

projection内の通常containerはコピーしてfreezeするが、元route.frameのidentityは比較用の元入力から採取する。返却valueを元handle graphの代替・再発行素材として扱わない。比較APIへ渡すのは元の値graphであり、summaryからの証拠復元口ではない。失敗は固定`internal_review_error`と`shape`／`limit`／`mismatch`分類だけで、入力やZod例外は出力しない。

`Reflect.ownKeys`等の列挙自体の確保、exact layout／allocation・全体work上界は保証しない。文字量／nodeの局所枠を全体受付の根拠に昇格しない。新しい日時長policyや実Permitは導入しない。

[RA-01検証記録](E2E_BEST_PRACTICE_FINISH_CONTEXT_RA01_2026-11-02.md)：新規186件・全体11,446件成功、型検査・build・lint・非同梱検査を確認。RA-02／03と実接続の成功を意味しない。正式発行口閉鎖・Unknown・全体受付無効・調査保留を維持する。
