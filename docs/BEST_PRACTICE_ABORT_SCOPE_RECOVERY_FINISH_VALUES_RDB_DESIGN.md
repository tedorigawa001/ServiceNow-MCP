# RD-B 回復finish期待値封印・集合／時刻比較 詳細設計

Version: br006-recovery-finish-values-rdb-draft-0.3 / Date: 2026-11-02。
Status: **RD-B01のstrict構造projectionとRD-B02の最小scalar共有・通常WJ-C接続まで合成限定実装。RD-B03〜04は未実装。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `4653cd2`。[SR-D](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_SRD_DESIGN.md)§2〜5・8のRD-Bと、[RA-03-A／B](BEST_PRACTICE_ABORT_SCOPE_FINISH_ISSUE_ACCEPT_DESIGN.md)§10〜11の間の差分。実装・証拠発行・fake finish dispatch・実接続・実通信・設定変更・Pushの承認ではない。

## 1 現状の根拠と不足

| 現行実装 | 使える根拠 | 今回も証明しないこと |
| --- | --- | --- |
| [回復kernel](../tests/support/review/synthetic-recovery-kernel.ts)のacceptedFinish | 同ownerの発行・受理後に保持する元plan／frameとprivate projection。元集合・receipt／S・全L・O・T_i・Uを保持 | finish job・応答・E・候補とのbindingはない |
| acceptedTerminationとRA-03-B | 同source／新frameの固定discard責務を一度消費。解放後の正常closeまで合成確認済み | finish候補用SourceClosed／NewCleanupConfirmedの発行ではない |
| [finish pin生成](../tests/support/review/synthetic-finish-pins.ts) | reviewedの合成参照はID・T_i・expected_contextに固定。omittedにはreviewed_originの有無を保持 | **元review結果本文・findingsのsnapshot／digestは持たない。実analyzeのpost-guard受理captureでもない** |
| [通常WJ-C値比較](../tests/support/review/synthetic-worker-time.ts) | header・release／rule・T_i／E・asset state／集合の局所比較 | reviewed結果本文全体の一致・full集約schema・実wire上限の保証ではない |
| [通常WJ-C試験](../tests/review/synthetic-worker-finish.test.ts) | 既存の未完了receipt拒否・集合／時刻／候補消費・0.2／0.3の回帰基準 | 回復集合のnot_processedを許可する証拠にしない |

不足値を応答や公開summaryから補わない。元reviewed pinの参照一致を、元結果本文の一致と同義にしない。RD-Bはlocal value比較の非実行結果までを扱い、未導出の内容証拠を確認済みにしない。

## 2 型と供給元を分ける

下記は内部役割の全体案。RD-B01では§11のstructure-only型とprojectionだけを追加し、sealed期待値・実比較結果・owner接続は追加しない。

| 内部役割 | 唯一の供給元・内容 | 消費／出力 |
| --- | --- | --- |
| RecoveryFinishExpectationDraft | 純粋coreが厳密な合成値から作るreadonly value-only projection | 比較試験用。owner／ready／routeの証拠へ昇格しない |
| SealedRecoveryFinishExpectation | 同kernelのaccepted移譲継続。元owner／plan／source／window／release／frame、元時刻と固定manifest、必要header事実 | 別brandの空opaque handle。元slot以外から登録しない。RD-Cの一度限りjobへ渡す設計 |
| RecoveryFinishReplyProjection | 将来の固定受信継続または合成fixtureから供給する比較対象の値 | 応答は期待値を生成・置換できない。job相関とfull schemaは別工程 |
| RecoveryFinishValueCheck | 純粋coreの局所比較結果。checked範囲と未確認範囲、有限枠使用量だけ | authority:none。候補・Permit・finish成功を表さない |

純粋coreが受ける値と、ownerが受けるopaque handleを静的brand／関数／slotで分離する。runtime／srcのfactoryやfixture台帳へ追加しない。公開JSON・MCP・既存workerメッセージは変更しない。

## 3 同acceptedからの一度限り封印

操作案`sealRecoveryFinishExpectation(binding, accepted)`は同kernelのprivate acceptedFinishだけを読む。raw header・manifest・receipt・E・frame・任意getter callbackを引数にしない。

1. 既存owner／busy／hard／bindingを検査後、自ownerのseal開始claimを外部guard前に占有する。同accepted期待値slotを局所pendingへ取り外し、失敗でも戻さない。
2. 同accepted handle・元plan／run／source／window／release・新frame／ready origin・cleanup未開始を再検査する。RA-03-Aでroute利用claimは既に消費済みなので、新しいunused routeや世代を作らず、その同じ所有権の継続として移す。
3. 元acceptedのheader／集合／receipt／時刻／reviewed起源をstrict boundedな期待値draftへ固定する。比較対象の応答から不足列を埋めない。
4. post guardと同live条件を再確認した後だけ、sealed slotと別brand handleを公開する。source close／cleanup開始／hardで同期失効する。

acceptedTerminationは固定終端側に残し、sink／resourceを複製しない。seal後も元accepted handleは**cleanup責務用にだけ**RA-03-Bへ渡せるが、期待値を再sealする権限は持たない。RA-03-Bのdiscard開始は新sealed期待値も失効・破棄するよう明示接続する必要がある。現行discardが将来slotを自動で消すとは仮定しない。

封印とdiscardは同busy／台帳で排他とする。別ownerのwrapper、既存WJ-C ownerへの再bind、同receiptの再登録、start／readyの作り直し、summary分岐からの復帰は禁止する。sealed slotを置いただけでRD-Cのfinish送信を許可しない。

## 4 期待値の固定列

純粋契約のkindはstrict固定値、可変mode分岐は設けず、余分／不足key・未知variantを拒否する。次のgroupごとに明示した項目だけを持ち、sealed側の不透明参照はcallerのobjectから再生成しない。RD-B01のexact keysは§11に固定した。

- binding：同owner／plan／source／window／release／frame／accepted originのprivate参照。純粋値比較だけでは由来を保証しない。
- time：元S・実効全L・O・Uと、receiptごとのT_i。remainingからLを作らず、Eは期待値へ事前設定しない。
- header：schema 0.2／0.3、target、versions、元started_at、構造化release／release_match、principal、collection、coverage、limits、必要limitations／errors。0.3ではselectionも保持する。
- selected：最大100件のcanonical順ID。outcomeは各選択IDに一度、input receiptは取得済みの行だけに対応させる。
- input ledger：同receipt・ID・T_i・state・expected_context。active inputのT_iだけをUと仮定せず、全受理済みinputを保持する。
- outcome manifest：state／reason／asset_type等の既存strict variant、reviewedの同receipt／合成元結果参照、omittedのreviewed_origin。応答に合わせてstateを補正しない。
- coverage evidence：context比較の供給範囲と、元結果本文・full schema・wire検査が未接続であること。Unknownを空bodyやダミーdigestで置換しない。

同型のheaderでも通常WJ-Cの現行FinishHeaderより列が多い。通常入口へ新しい必須列を暗黙追加せず、回復用の別strict契約として扱う。

## 5 集合・state・元結果の比較

期待集合は元selected／manifestが正本。応答順だけの違いはID集合で吸収するが、期待側のcanonical順は変更しない。追加・欠落・重複・同じ長さでのID置換を拒否する。別receipt・別window・同値の別ownerを同一としない。

| 元state | 許す値比較 | 拒否する変更 |
| --- | --- | --- |
| reviewed | 同receipt／T_i／期待target・release・rule context。既存finalize相当の全結果単位omissionはresponse_limitと必要response_truncatedを要求 | 未検証結果のomit救済、元context差替え、追加解析済み宣言 |
| result_omitted | 元reason=response_limitとreviewed_origin有無を保持。元receipt／T_iは保持 | reviewedへの復帰、元reviewed起源の偽造／削除 |
| rejected／not_applicable／skipped_deleted／retrieval_failed | 元strict variantのstate・reason・asset_typeを一致させる | state昇格、理由・asset_typeの差替え |
| not_processed | 元reason=deadline_exceeded。取得済みinputなら元receipt／T_iを保持、未取得なら時刻を作らない | reviewed／omittedへの変更、未処理inputの再投入、Uからの削除 |

reviewedの局所contextは、ID・Update Set ID・target_version・record_updated_at・instance_binding・reviewed_at／retrieved_at=T_i・applicable/requested rules・構造化release・必要limitationsを検査する。

**本文保証の停止境界：** 現在のaccepted_outcomeは元結果本文ではないため、同contextの応答でfindings等が変わっても、それだけで本文差替えを検出できるとは主張しない。純粋比較の成功には`scope=context_and_manifest_only`相当の固定区別を付け、full結果比較／候補へは昇格させない。元immutable結果の保護されたprojection／内容証拠と検証済みcaptureを接続するまで、その保証はUnknownである。reviewedをomittedへ変えてこの不足を解消したことにしない。

## 6 E・header・制限の比較

受理済み全inputについて`S <= O <= T_i <= U <= E <= S + L`を検査する。初期対象のworker期限型はactive receipt必須なので0 inputを受けない。通常WJ-Cの0 inputではU=Oの既存挙動を維持する。

- Eは応答に結び付いたms精度UTCを一度受ける値。親の現在時刻で補完・clamp・再採取しない。RD-Bの純粋関数は時計を読まない。
- E=U／E=S+Lは値として許容するが、元guardの取消／期限失効を優先する。JSON宣言deadline_ms=60000と実効Lを混同しない。
- operator_configのexpires_atは厳密にS+60000より後。短い実効LやEへ置換しない。既存checkReleaseEvidenceと構造化releaseの比較を再利用する。
- 元headerの固定値を比較し、0.3のselection／候補window制限を消さない。ルール集合は順序差を許しても追加／欠落／重複を拒否する。
- 元collection failed／truncated、consistency changed／unverified、soft／verify由来limitations／errorsを保持する。analysis_complete=falseを維持し、failed collectionならrun_status=failed、それ以外はpartialを基準とする。
- omissions等で必要な制限を追加することと、元制限を削除することを分ける。新たな不足や不明事項を応答側のrelease／headerで救済しない。

counts／coverage／selection／findings／omission全体の厳密整合はfull集約schemaの別責務でもある。局所比較成功をその検証の代替にしない。

## 7 通常WJ-Cとの最小共有境界

通常実装はsynthetic-worker-time.ts内の`compare`／`header`／`finishTime`／`manifest`／`compareAssets`であり、独立したsynthetic-worker-finish.ts helperは存在しない。新実装時は同名試験ファイルと混同しない。

第一段階で共有候補にするのは、検証済み値に対するrule集合一致・release表現一致・target／T_iのscalar比較・E境界などの小さな純粋predicateだけ。現行WJ-Cのaccepted／pending／completed／job／candidate・guard・cleanupを抽出しない。

既存copy／field読取は個別呼出しに局所枠を持つ。これを一括抽出して新しい共有予算へ置換すると通常経路の受付範囲も変わるため、単なる機械移動とみなさない。回復用strict projectionは別に全体枠を定義し、共通predicateには既に検査済みの値だけを渡す。JSON.stringifyによる既存release比較等を意味の違う正規化へ変更する場合も、別途互換性判断が必要。

通常WJ-Cは`receipts.size > 0`ならfinishを拒否する既存owner検査を必ず維持する。`allow_pending` mode、未完了receiptの削除、新input／analyze再発行、回復ownerの新bindで通す方法は採らない。共通化によって通常側に回復用state／規則が混入しないことを負の対照にする。

## 8 有限枠・停止・費目所有

値projectionは非Proxyのplain／null-prototype object、own data descriptorのみ。getter／setter・symbol／循環／疎配列・不正数値を拒否する。RA-01相当の上限（深さ8・配列100・object項目30・訪問10,000・保守的文字費262144）を期待値全体で共有し、二入力比較は両入力で共有する。recordごと・headerごとの枠リセットで総量を拡大しない。実wireの262144-byte上限と文字費の値を同一保証にしない。

full worker応答をこの局所projectionへそのままparseしてfull schema済みと扱わない。比較対象projectionはstrict項目・有限枠を持つ別の合成値契約とし、将来の固定応答adapter・full schema・wire検査との対応をRD-Cで明示する。未知fieldを無制限に探索して必要列を探す処理は作らない。

不正型・集合／context不一致・証拠不足・上限超過・未知例外は固定拒否。owner接続では比較失敗を局所保持し、post guardの取消／期限切れと先行hardを優先する。再入をcatchされてもcommitしない。失敗後にclaim／期待値／routeを戻さず、同source／新frameの固定cleanup責務と診断回収を維持する。

| 費目 | 所有者 |
| --- | --- |
| seal claim・accepted取り外し・pin再照合・draft作成／freeze・opaque handle | 固定seal継続 |
| 集合／receipt索引・header／state／context／Eのbounded収集・比較 | 純粋RD-B core。比較ごとに計上 |
| guard／live再照合・失効・先行診断 | 各owner操作。pre／postを区別 |
| sealed期待値とaccepted終端責務の破棄 | 失効／RA-03-B固定discardの一度の継続 |

新HTTP／analyze／input／verify／finish dispatch・E採取は0。元C/G/P・retry prefixは変更しないが、追加work／allocation・exact layout・保持byte・全体上界はUnknownである。通常側と共有したcodeを無料とみなさず、全体受付や本番capは導出しない。

## 9 実装の優先順と独立検証条件

| 分割案 | 実装範囲・受入条件 |
| --- | --- |
| RD-B01（合成実装済み） | 別brandのstrict期待値／応答projectionと、発行関数のない比較結果型。structure-onlyの純粋bounded値層。不足列・未知state・余分key・総量超過を拒否。本文／意味比較Unknownを明示 |
| RD-B02（合成実装済み） | 小さなscalar predicateの最小抽出と通常WJ-C接続。全旧試験と未完了receipt拒否を維持。独立field差替え・集合／E oracleで新旧の責務を分離 |
| RD-B03 | 回復manifest／T_i・U・E・header比較の純粋接続。state遷移表と0.2／0.3・operator境界の独立oracle。本文不足でfull検証／候補に昇格しない |
| RD-B04 | 同acceptedからの一度限り封印・同owner／frameへのbindingとRA-03-Bのsealed破棄連結。両guard・再入・混入・失効・競合を合成検査。job送信はしない |

期待値を応答から生成して同じ関数同士で比較するだけの試験にしない。正本fixtureと独立したID／state表・UTC算術・必要制限のoracleを用意し、追加／欠落／同長重複、未取得行と取得済み未処理、active T_i≠U、Eの両端±1ms、短いL、設定expiry境界、reviewed→omittedと不正昇格を確認する。

source／cleanup開始後のseal、summary／copy／別root、二重seal、seal中のRA-03-B discard・normal close再入、失敗後再利用を拒否する。他rootは不変、元frame・receipt／T_i／Uを再生成しない。全body一致を検査していないケースがcontext-only成功でもfull検証済みにならないことを負の対照にする。

各実装段階でbuild・strict型検査・既存全体合成回帰・梱包除外とI/O／clock／worker混入の負の対照を確認する。通常WJ-Cの旧試験数を固定値で断定せず、実装時のHEADで件数・fullNameを採取する。

## 10 残る承認・未確認事項

- 元reviewed本文の保護された内容projection／captureと、full内容一致を要求する境界は未導出。descriptor pinを実結果の証拠へ昇格しない。
- full集約schema・wire上限・counts／findings／omission整合との接続、finish job／Eの同新frame相関と候補はRD-C以降。局所比較だけで先行発行しない。
- 候補消費用のSourceClosed／NewCleanupConfirmed・解放後の最終checkpointはRD-D。RA-03-Bのdiscard専用受領情報は代替しない。
- 実verify・実session／ReleasePermit／payload／workerの正式binding、実clock／OS終了・外側監督との連結は対象外。
- 追加work／allocationモデル・本番cap・全体受付は未承認／Unknown。設定日時長の新capやruntime規則を追加しない。

draft-0.1はMDだけを作成した。後続の合成実装は§11〜12。回復用意味比較・封印はRD-B03〜04へ残す。新たな合成証拠／候補発行・実接続・実機操作・設定変更・Pushは行わない。

## 11 RD-B01の実装契約

[純粋値層](../tests/support/review/synthetic-recovery-finish-values.ts)は`projectRecoveryFinishExpectation(raw)`と`projectRecoveryFinishReply(raw)`の二つだけをprojection入口にする。比較・seal・owner／claim登録・ready／job／candidateの発行口はない。既存RA-01・WJ-C・回復kernelは変更しない。

| strict top-level | exact keys |
| --- | --- |
| expectation（kind=synthetic_recovery_finish_expectation_v1） | kind, binding, time, header, selected, inputs, outcomes, run_status, consistency, content_evidence |
| reply（kind=synthetic_recovery_finish_reply_v1） | kind, header, ended_at, run_status, consistency, assets, content_evidence |

bindingはowner／plan／run／session／source／key／origin／budget／release／window／accepted_originのopaque参照と、supervisor／worker／generationを持つstrict frame container。timeはstarted_at／deadline_ms（1〜60000）／observed_at／upper_utc。期待selected／inputs／outcomesは1〜100件、reply assetsは0〜100件とし、空replyと期待集合の不一致はRD-B03へ残す。

inputはreceipt／update_xml_sys_id／retrieved_at／state（completed・not_processed）／expected_context（明示nullまたは既存5列context）。reviewed期待outcomeはstate／ID／receipt／accepted_outcome、omittedはstate／ID／reason=response_limit／reviewed_origin（明示nullまたはreceipt／accepted_outcome）。他stateは既存asset variantを再利用し、not_processedのreasonはdeadline_exceededに限定する。

reply reviewed assetはstate／ID／applicable_rule_idsと、resultの局所contextだけ。result exact keysはreviewed_at, target, instance_binding, instance_release, coverage, limitations。targetはupdate_set_id／update_xml_sys_id／target_version=update_set_payload／retrieved_at／record_updated_at、coverageはrequested_rule_idsのみ。他stateは既存非reviewed variant、omittedにはreviewed_originを受けない。full worker resultのfindings／code等を渡せば余分keyとして拒否し、黙って削除しない。将来の固定adapterが局所viewへ変換する契約であり、full JSON検証ではない。

headerはRA-01相当の0.2／0.3 strict列、matched release・complete／failed collection・analysis_complete=falseに限定する。0.3ではselectionと追加coverage列を必須にする。run_statusはpartial／failed、consistencyは既存3variant。構造化releaseやrule／reasonの型は既存schemaを再利用し、新しい本番規則や設定日時長capを足さない。

content_evidenceはoriginal_body=unknown／full_schema=unverified／wire=unverifiedのstrict固定3項目。project結果はauthority:none／validation_scope:structure_onlyと別々のprivate Symbol brandを持つ。unverifiedはbinding_provenance, context_and_manifest, time_consistency, original_body, full_schema, wireの固定6項目で、stateに応じて勝手に消さない。usageはnodes／character_unitsだけ。

`SyntheticRecoveryFinishValueCheck`はRD-B03向けの別brand型だけ定義し、constructor／factoryは実装しない。projectionにはmatches・成功候補・実行権を付けない。重複集合・時刻逆行・header不整合を型として読めても意味比較済みとはならない。後続consumerがstructure-onlyを比較成功として受理することを禁止する。

collectorは入力全体で深さ8・配列100・object項目30・訪問10,000・文字費262144を共有する。文字列とobject keyはUTF-16 length×3を課金し、配列index keyとlengthは文字費に数えない。opaque参照は1 nodeとして型／非Proxyだけを検査し、内部を読まず、freezeもしない。frame等のdata containerはcopyして深くfreezeする。node／文字費にZod内部copy・出力metadata・opaque graphの保持メモリ・ownKeys等のnative処理費は含めず、実メモリ／work／wireの上界はUnknownのまま。

不正shapeと局所limit超過は型付き`RecoveryFinishValueError`で区別するが、message／codeは常にinternal_review_error。raw値・Zod issue・例外causeを返さない。二入力共有予算を使う実比較はまだ存在しないため、その保証はRD-B03で接続・検証する。

[RD-B01合成検証記録](E2E_BEST_PRACTICE_RECOVERY_FINISH_VALUES_RDB01_2026-11-02.md)参照。RD-B02は§12。RD-B03の集合／時刻／context比較・RD-B04の同accepted封印とRA-03-B破棄接続は未実装。

## 12 RD-B02の最小scalar共有

[開発専用predicate](../tests/support/review/synthetic-finish-scalars.ts)を通常WJ-Cのcompare／finishTime／manifestへ接続した。import・clock・I/O・owner状態を持たず、入力がstrict検査済みであることを前提にする。parser／budget／guard／receipt・completed・job・candidate／cleanupは移動しない。

- `sameFinishRuleSet`：既存のlength一致＋every/includesをそのまま保持。上位rules parserが有限枠と重複拒否を担当する。predicate単独は重複の検証器ではなく、未検査配列を渡して集合検証済みとしない。
- `sameFinishReleaseEncoding`：呼出側で既存の構造検査・copy後にJSON.stringifyした表現を厳密一致で比較する。JSON key順を正規化せず、意味的release同値を新設しない。旧式の結果型に合わせundefinedも受けるが、単独の一致はrelease妥当性の証拠ではない。
- `finishEndOutsideBounds`：検査済みUTC epochと実効Lに対しE<UまたはE>S+Lだけを返す。両端はinclusive。有限値・UTC構文の検査やoperator_configのS+60000厳密expiry判定は既存callerの責務を維持する。target／T_iのfield読取・比較は抽出せず既存位置に残す。

通常ownerの`receipts.size > 0`拒否を維持し、allow_pending・新claim・回復owner接続は追加しない。通常WJ-Cの既存82件は抽出前後でfullName集合と成功を比較した。独立集合／UTC oracle・重複rule拒否・未完了receiptの負の対照は[RD-B02検証記録](E2E_BEST_PRACTICE_RECOVERY_FINISH_SCALARS_RDB02_2026-11-02.md)参照。既存局所枠の受付範囲・公開JSON／MCP・実Permitは変更しない。追加work／allocationはUnknownで、全体受付は有効化しない。
