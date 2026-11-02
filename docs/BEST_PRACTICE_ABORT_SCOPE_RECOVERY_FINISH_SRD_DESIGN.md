# SR-D 回復planからfinish検証・終端候補への接続設計

Version: br006-recovery-finish-srd-draft-0.6 / Date: 2026-11-02。
Status: **SR-D finish接続は未実装。前提のRA-01／RA-02①②とRB-A生成境界だけ合成限定実装。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実finish／runtime接続・実通信・設定変更・本番cap／Permit投入の承認ではない。**

基準HEAD: `31cff06`。[SC2-D接続契約](BEST_PRACTICE_ABORT_SCOPE_WORKER_RECOVERY_CONTINUATION_DESIGN.md)§13、[soft回復設計](BEST_PRACTICE_ABORT_SCOPE_SOFT_RECOVERY_CLAIM_DESIGN.md)§2〜9・11、[通常WJ-C](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)§13との差分を定める。本書の型・操作名は内部役割案で、実在するAPIや実装済み保証ではない。

## 1 適用範囲と接続前の不足

最初は**worker期限型のSC2-D private handoff**を対象とする。SR-Bのphase型planは現在公開の非実行dataを返す別経路であり、そのsummaryを本入口へ昇格させない。phase型のprivate移譲は別の差分設計・実装単位に残す。通常WJ-Cの未完了receipt拒否も維持する。

| 根拠 | 既存保証 | SR-Dで埋める差分 |
|---|---|---|
| [SC2-D issuer](../tests/support/review/synthetic-soft-recovery.ts) | 同ownerの新frame・immutable集合／input・S／全L／O／U・verify snapshotを封印し、同owner内の受取slotへ移す | handoff受理とfinish開始claimを同private継続で結ぶ。現受取側は固定discardだけでfinishしない |
| [SC2-A入力](../tests/support/review/synthetic-worker-recovery-input.ts) | reviewedはstate／IDだけ、他stateはreason等を保持。receiptとT_iはprivateに保持 | reviewedの期待context・元の検証済み結果参照、集約header／selection等の証拠は不足。state／IDだけから復元しない |
| 同RecoverySeed | release／sourceはopaque参照。run identity・元時刻を固定 | Update Set ID、instance binding、releaseの構造化値、要求rule／schema等は不足。opaque参照の一致を値検査の代わりにしない |
| [WJ-B/C owner](../tests/support/review/synthetic-worker-time.ts) | 通常finishのheader・集合・T_i／E・候補消費を検査 | SC2-C新frameはこのownerのjob台帳に未登録。既存finishへ渡すだけでは通らない |
| [WJ-A job owner](../tests/support/review/synthetic-worker-job.ts) | 同generation／supervisor／worker／id／kindの応答相関 | SC2-Cのframe／ready証拠から、同ownerのfinish専用jobへ一度移すprivate接続が必要 |
| SC2-C cleanup sink | 同新frameの診断snapshotを停止後も記録可能 | 診断やinspect値だけから候補の解放証拠を作らない。正常時の固定cleanup継続と内部確認slotを結ぶ必要がある |

**現状のSC2-DだけではWJ-C相当のfinish全検証を行えない。** 足りない列をresponse・summary・任意aggregate JSONから補わない。既存の12列準備入力、旧seedのstrict keys、通常WJ-Cの公開合成APIを暗黙に拡張しない。追加証拠は別の内部契約として設計・合成実装し、欠けたままの旧SC2-D fixtureは引き続きsummary／discard専用とする。

## 2 接続方式とprivate証拠

同じ回復ownerの固定継続内にSR-Dの受理slot・finish job・候補slotを置く案とする。必要ならprivate child viewへ分けるが、元のguard／busy／停止slotを共有し、別rootや別予算を生成しない。`createSyntheticWorkerTimeIssuer`を新しくbindして旧receiptや新frameを再登録する救済は行わない。

WJ-Cの純粋なheader／E／asset比較をtest-only coreへ最小抽出して再利用することを検討する。共有は値比較だけで、通常WJ-Cのjob claim・未完了receipt拒否・候補／cleanup台帳を緩めない。抽出と通常WJ-C互換試験を独立工程にし、共有しただけで実class／compiled保証が成立したとはしない。

| 内部役割案 | 固定発行元・保持内容 | 消費・拒否 |
|---|---|---|
| RecoveryHandoff | 同SC2-D受取slot。元run／session／source／key／origin／budget／release、window、新frame、S／全L／O／Uと集合 | slotとopaque handleの同一性で一度消費。summary・copy・別owner・消費済みは拒否 |
| FinishContextEvidence | 同合成assemblyのprivate issuer。元source／window／releaseに結合したheaderと、receipt別の受理済み期待context／結果参照 | SR-D受理前に発行・pin。run内の一度限りclaim。応答を見て期待値を発行しない。欠損・混入で停止 |
| FinishRouteLease | 同ownerのSC2-C ready継続。同じ新supervisor／worker／generationと、まだcleanup開始していないfinish専用route | raw frame登録不可。新世代を起動し直さず同leaseだけを使う。新analyze・input受理不可 |
| RecoveryFinishJob | 固定fake dispatcherの直前claim。元run／新frame／kind=finish／単調なidと封じた期待値 | runにつき発行最大1・pending最大1。同期throw／send失敗でもclaimとidを返さない |
| RecoveryFinishCandidate | 同jobの相関・値検査・post-guard後の固定継続。E・集合証拠・元plan identityを保持 | raw応答やhandle自体は候補ではない。正常終端へ一度移譲し、失敗時は同期失効 |
| NewCleanupConfirmed／SourceClosed | 同ownerの固定fake cleanup／source終端継続。新frame／source identityと一度の正常完了 | 旧世代のconfirmed・公開診断・callerのboolで代替しない。hard後の診断回収から新能力を発行しない |

FinishContextEvidenceの合成発行口は配布対象外の独立assemblyに留める。実sessionやReleasePermitの証拠を発行する口にはしない。元receiptごとの値をpinする合成前提と、実payload／解析結果から発行された正式証拠は別保証として扱う。

### 2.1 不足値の供給順

1. 元constructor／準備継続の合成issuerが、source／window／releaseのopaque参照とheader値を結ぶ。schema 0.2／0.3、Update Set ID、instance binding、target_version、versions／要求rule、principal／collection／selection、limitsと必要limitations／errorsをpinする。0.3の候補window制限を消さない。
2. 旧解析の受理時に同receiptへ結ばれた期待contextを、完了記録と一緒に保持する。reviewedはT_i、record_updated_at、target／release／要求rule／必要limitationsを検査済みであることを必要とする。元の検証済み結果はimmutable参照で保持し、payload／code／findingsを親で複製しない。
3. soft終端化時に未完了receiptをnot_processedへ移す。完了済み記録を消した後に再生成しない。SC2-Aで確定した集合とreceipt対応をFinishContextEvidence側の記録へ照合する。
4. 同SC2-D planと追加証拠がすべて揃い、元guardが生きている場合だけ受理する。欠けた列を空値・現在時刻・別release・再解析で補完しない。

追加値のstrict schema・bounded projection／比較はRA-01の合成値層だけ実装した。[RD-A詳細型・発行契約draft-0.7](BEST_PRACTICE_ABORT_SCOPE_FINISH_CONTEXT_RDA_DESIGN.md)§9〜10参照。RA-02①②の独立assembly・private fixture pinまで追加したが、元SC2-D owner／handoff・元受理captureへの接続、private発行slot・ready／cleanup開始の真正性・一度限りのissue／acceptは未実装。[RA-02③接続差分設計draft-0.2](BEST_PRACTICE_ABORT_SCOPE_FINISH_ASSEMBLY_RA02_BINDING_DESIGN.md)で実装順を分け、RB-Aの共通kernel生成元・閉鎖した新入口だけ実装した。RB-B〜Dのpin／live route／handoff結合は未実装。ローカル上限（深さ8・配列100・object項目30・訪問10,000・保守的文字費262144）はsnapshot全体で共有し、比較時は両入力で共有する。これは合成projectionの有限枠であり、新たな本番日時長cap・実メモリ上界を承認するものではない。

## 3 固定状態遷移と一度限りのclaim

| 状態案 | 固定処理 | 先行消費・失敗時の扱い |
|---|---|---|
| handoff_pending | 同plan／追加証拠／liveな新routeを受理 | handoffと追加証拠slotをpre-guard前に取り外す。期待値不足でも返さない |
| expectation_sealed | 元集合・header・時刻・完了／未処理記録を固定 | 集合追加・新T_i・新verify・新analyze禁止。summary分岐とは排他 |
| finish_claimed | 同新frameへ一度のfake finishイベント | 開始claimとidを先に消費。未dispatchなら送信0、送信を試みれば1。再送・再回復なし |
| reply_checking | 同jobの応答相関→値検査→post-guard | pendingを最初に取り外す。旧job／ready／二重応答は拒否 |
| candidate_held | E／集合検証済みのprivate候補を保持 | cleanup責務は残る。候補を結果・終了証拠・Permitにしない |
| closing | source正常解放と同新frameの固定終了／確認 | 順序はsourceの合成正常close→新frame close要求→同終了確認。元guard失効後も開始済みcleanupと診断は回収する |
| terminal_consuming | 同候補・正常source終端・新cleanup証拠を一度消費 | pre-guard前に候補を取り外す。最終checkpoint／post-guard後だけ限定summaryを返す |
| failed／closed | 診断回収・固定discardだけ | slot復元・新root・finish再開・新世代起動禁止 |

各処理はclaim→元pre-guard→固定処理→元post-guard→発行／commit。応答比較の不一致は一時的な固定失敗状態として捕捉し、post-guardの取消／期限を優先してから拒否する。getter／Proxy／unknown例外のraw値やstackを保存しない。部分的に移ったprivate参照も失敗時に破棄し、cleanup責務を失わせない。

現SC2-Dのhandoffはcleanup済みのplanもdataとして保持できるが、**SR-Dでfinishを始めるには新routeがまだreadyかつ未closing／未closedである証拠が必要**。cleanup済みframeをready_events=1だけで復活させない。既存のsummary／固定discard経路は維持し、そこへ進んだhandoffをSR-Dへ戻さない。

## 4 集合・receipt・結果の整合

送信前の正本は同planの選択ID集合と順序、completed、receipt／T_i、soft終端化したnot_processedである。要求headerやworker応答の配列長を正本にしない。最大100件、ID／receiptの一意性・部分集合・元windowへのbindingを引き継ぐ。

- 同planの各選択IDは期待manifestに一度だけ現れる。追加・欠落・重複、長さを維持した重複による隠蔽を拒否する。内部のcanonical順は保持し、応答の値照合は通常WJ-Cと同じID集合照合（応答順だけの違いは許容）とする。
- reviewedは同receiptの元期待値・受理済み結果と結合する。返却reviewed_at／target.retrieved_atは同T_iと完全一致し、target ID・Update Set ID・target_version=update_set_payload・record_updated_at・release／rule contextも維持する。
- 元reviewedから許す変更は、既存finalizeの全結果単位のresult_omitted／reason=response_limitだけ。response_truncated等の必要制限を要求する。送信前からomittedだったものも元receiptとUを消さない。未検証reviewedをomitして期待値不足を救済しない。
- rejected／result_omitted／not_applicable／skipped_deleted／retrieval_failed／not_processedのstate・reason・asset_typeを既存値schemaに従って保持する。非reviewedをreviewedへ昇格しない。softで未完了だったものはnot_processed／deadline_exceededのままで、未処理をomittedや解析済みにしない。
- T_i未採取の選択行に時刻を作らない。未処理にした受理済みinputは同receipt／T_iを保持し、Uから落とさない。SC2-Aの一般化（実adapterの「未完了は処理中1件・そのT_i=U」は未保証）は変えず、全受理済みT_iを下限検査に含める。
- collection failed／truncated、consistency changed／unverified、soft・verifyの固定error／limitationsを保持する。soft回復でanalysis_completeやcompletedを主張しない。collection failedならrun_status failed、それ以外はpartialを基準とし、schema制約との整合を別に検査する。

通常WJ-Cの「未完了receiptがあればfinish拒否」は削除しない。回復用private planが同receiptを終端化済み集合へ一度組み込んだ証拠だけを、別の固定入口で受ける。入力やanalyzeを再発行して通常台帳を満たす方法は禁止する。

## 5 同新世代のjob相関とE

finish jobは同run／新frame／supervisor／worker／generation／kind=finish／idへ結合する。数値idは同新frame内で単調に一度消費する。旧世代と同じ数値idでも参照が違えば拒否し、readyイベント・旧analyze応答をfinishへ読替えない。SC2-CのreadyをWJ-Aの新しいstart／ready呼出しで作り直さない。

時刻は次を同時に検査する。

`S <= O <= T_i <= U <= E <= S + L`（受理済み全inputについて）。inputなしではU=Oが必要だが、初期対象のworker期限型planはactive receiptを要し0 inputを受理しない。0 inputは通常WJ-Cの既存試験を維持し、phase型拡張前に回復planの前提を緩めない。

- S／全L／O／Uは元ownerの値。実効Lをremainingから再計算せず、declared deadline=60000も変更しない。Lが短ければそのままE上界を短くする。
- Eは同finish応答に結合した値を一度受け、親側で時計を読んだりclamp／再採取したりしない。最初は固定合成issuerが供給するms精度UTCで、実時計の採取保証には数えない。実[finalize](../src/review/aggregate-finalize.ts)が入口でEを一度採り、その後のomissionで採り直さない現行動作は変更しない。
- E=U／E=S+Lは値として許すが、元run guardの取消／期限失効は優先する。正常なEを持つ遅延応答でもpost-guard失敗なら候補を発行しない。
- headerのschema 0.2／0.3、target／元S／要求rule／releaseと必要limitationsを固定期待値へ比較する。構造化releaseには既存checkReleaseEvidenceを再利用し、観測UTCとEの整合を確認する。
- operator_configのexpires_atは引き続き厳密にS+60000より後を要求する。E後ならよい、または実効Lが短いからS+Lまででよい、とはしない。古い設定をresponse側のreleaseで置換しない。

[監督](../src/review/worker-supervisor.ts)の262144-byte上限と[集約schema](../src/review/aggregate-schema.ts)のfull検証は別責務である。親側の局所header／集合／時刻比較をfull schemaや実wire保証と呼ばない。最初の合成値試験はその不足を明示し、将来のdata-only fake応答検証との接続時にfull schema・wire上限・counts／selection／findings・omission整合を別に確認する。現workerのJSON契約は変更しない。

## 6 候補・cleanup・上位終端

候補は応答相関と全値比較のpost-guard後だけ発行するopaque handleで、同plan／job／E／集合証拠をowner内へ保持する。応答JSON・公開summary・inspectから候補を生成しない。二度目のconsumeFinish／候補格納、同slotへの上書き、copy handleを拒否する。

候補を得てもsource／新frameの解放責務は残る。次の全条件を固定terminal consumerで確認する。

1. 元sourceと同identityの正常source close証拠がある。現rootのsource参照だけでは証拠不足であり、別の合成source lifecycle継続が必要。異常session closeやrevokeを正常closeへ変換しない。
2. SC2-Cから引き継いだ同新frameのclose要求とcleanup confirmedがある。旧終了証拠や単独の公開diagnosticは不可。既存sinkの正常記録継続でprivate確認slotへ結ぶ設計とし、別ownerで二度closeを数えない。
3. 元候補を最初のguard前に取り外し、同plan／job／E・source／新frameの終端証拠を一度消費する。最終の元guard／checkpointに通った場合だけ正常root破棄と時刻破棄へ進む。
4. 返回はauthority:noneの限定終端summary（同E・集合件数等）まで。実review結果・Permit・実終了証拠は発行しない。SC2-Dの検査用summaryと同様、再入力の権限にしない。

cleanupは元ownerから固定終端ownerへ一度だけ論理移譲し、物理的なsink／同frame contextは共用する。途中失敗時の責任者を空にしない。hard後は発行済み診断sinkで要求済み／失敗／未確認を回収できるが、private正常終端能力を新発行しない。候補はすでに失効済みで、後からconfirmedになっても復活しない。

source解放・worker cleanupは別軸で、片方の成功や最終resource数0だけで両方の固定section実行を証明しない。通常WJ-Cの閉鎖順を基準としつつ、SC2-Dにはsource lifecycleも要求／確認型の新cleanup継続も未接続であることを明記する。実session close・実terminate・OS終了・外側強制終了／最終checkpointはWJ-D／CT-C以降へ残す。

## 7 失敗分類と診断保持

| 失敗 | 固定処理 |
|---|---|
| handoff／証拠不足・混入・copy・二重開始・不正schema／集合／時刻・未知例外 | internal_review_errorでhard停止。slotを同期失効し、raw例外を出さない |
| 元guardのcancelled／全体期限 | cancelled／deadline_exceededを保持。比較不一致よりpost-guardの停止を優先する |
| fake startup／finish不能 | 既存のworker_unavailable等の固定分類へ合わせる。finish失敗から2回目のsoft回復・新世代生成はしない |
| fake send同期throw／reject・不正応答 | claim／idは返さず、既存分類の固定codeで停止。初期案は未知send失敗をinternal_review_errorに固定 |
| source／新cleanupの失敗・未確認 | 先行hardを保持しつつ別のcleanup slotに残す。候補消費・正常summary・normal closeを拒否 |

元soft観測、最初のhard、旧世代cleanup、新世代cleanup、source正常終端を分離する。停止後は元S／全L／O／Uとscalar診断だけを終端discardまで保持し、候補Eは候補失効とともに破棄する。新Eの採取や候補の再生成は不可。正常終端ではprivate参照・集合・時刻を破棄する。JS heapの物理消去は保証しない。

## 8 費目所有と上界

| 費目 | 所有者と制約 |
|---|---|
| private受理／claim／guard／失効 | 同回復owner。handoff受理1、finish開始1、pending1、応答消費1、候補格納1、終端消費1。失敗試行も別計数 |
| 期待context／集合projection | 同input／集合owner。最大100 target、既存bounded copy、同receiptのimmutable期待値。新payload／findings複製なし |
| fake job／id／E | 同新frameの固定合成issuer。新analyze0・新input0・追加世代0・finish試行最大1・E受理最大1 |
| C/G/P・retry／予約 | 元会計を保持。finish検証やcleanupでHTTP／payloadを増やさず、SC2-Bのverify済み課金を足し直さない |
| source／新frame cleanup | 元の各ownerの固定section。要求・確認・diagnostic回収を別イベントにし二重closeなし |

追加work／layout／allocation、期待値copyや全schemaの全体上界、実cleanup待ちの上限はUnknown。60000msやテスト期限を延長せず、全体受付や本番capを導出しない。既存の停止後部分finish分岐はこのhealthy-run限定接続へ混ぜず、productionを維持する。

## 9 合成受入条件と実装分割案

| 段階案 | 範囲 | 必須試験 |
|---|---|---|
| RD-A（RA-01とRA-02①②の準備層のみ実装） | [詳細型・発行契約](BEST_PRACTICE_ABORT_SCOPE_FINISH_CONTEXT_RDA_DESIGN.md)のstrict projection／比較と新assemblyのprivate fixture pin。handoff／live route・発行・同owner受理・期待値封印は未実装 | 値検査・fixture pinを由来の証明にしない。source lifecycle等はUnknown。summary／raw manifest／別rootからの昇格0。元SC2-D互換 |
| RD-B | 通常WJ-C値比較の最小抽出と回復集合／T_i／U／E比較器 | 通常WJ-C82件維持、独立field差替え・集合／時刻oracle、受理済みreceipt以外を拒否 |
| RD-C | 同新frameのfinish専用fake job／一度応答消費／候補slot | 同id旧世代・ready／analyze応答・二重送信を拒否。全pre/post guard、send失敗でも再利用なし |
| RD-D | 同source終端・新cleanup内部確認slot・一度候補消費 | cleanup両軸と固定順序、hard後の診断回収と復活0、解放後最終checkpoint、正常時参照／UTC破棄 |

独立oracleは実装helperを呼ばず、固定集合・時刻表と有限イベント列から期待数を求める。S/O/T_i/U/Eの等号、E<U・E>S+L、設定期限の等号拒否、100件／超過、重複で欠落を隠す応答、全guard失効・再入・混入・不正getter／Proxy・秘密非出力を含める。通常WJ-A/B/C、SR-A/B/C①、SC2-A〜Dを維持する。

各段階は合成issuerのみで実装し、runtime／I/O／clock／worker依存と配布物の関数／brand／scope／map漏出を負の対照で確認する。実装後の試験結果と初回失敗は別の検証記録へ残す。本書は試験計画であり、新規試験成功やB-03 compiled保証を主張しない。

## 10 承認待ち・未確認事項

- FinishContextEvidenceのstrict型／発行slot・新合成assembly・元receipt／immutable結果参照・route証拠はRD-A詳細MD案へ分離した。実装時の具体配置とcapture hook、同新frameのprivate job台帳への接続方法は引き続きレビュー対象。任意入力で本物のsessionを登録するfriend／昇格口は追加しない。
- reviewedの完全な結果を親でcopyせず保持する配置、omission前の受理済み期待値の寿命、既存のconfig日時長policyは未確定。欠損時に検証済み扱いにしない。
- 同sourceの正常close証拠と新cleanup正常確認のprivate発行継続は未実装。現SC2-Cの診断sinkやSC2-Dのdata handoffだけでは代替できない。
- phase型SR-Bのprivate plan受理、実session／ReleasePermit／payload／worker jobの正式binding、実finish／runtime・実通信、実cleanup／外側終了、B-03、全体work上界は別工程。

今回作成するのは本設計と既存文書の参照だけ。コード・テスト・公開JSON／MCP・設定は変更しない。正式発行口閉鎖・Unknown・全体受付無効・調査保留を維持する。
