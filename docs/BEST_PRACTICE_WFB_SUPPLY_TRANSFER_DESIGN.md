# WF-B (C)：下位移譲claim・pending／非実行holderの差分設計

Version: draft-0.3 / Date: 2026-11-09 / 読み取り照合基準HEAD: `0e98c56`（レビュー修正基準HEAD: `8b5af60`、preflight実装基準HEAD: `35c1d2a`）。

draft-0.3: §11の第1段階だけを合成依存で実装した。発行anchor・未消費の別brand claim・空のpending／holder／failure shellを同ownerへ結合し、消費前の固定拒否を確認する。通常利用slotからの移動・公開・C実行は未接続。[検証記録](E2E_BEST_PRACTICE_WFB_SUPPLY_TRANSFER_PREFLIGHT_2026-11-09.md)。実装境界は§12を参照。

draft-0.2のレビュー修正：現行の供給準備ownerは`finish()`だけでなく`close()`と`fail()`も終端前に無条件で`clear()`を呼ぶため、移譲開始後の停止・失敗がこれらを経由すると元aliasと計数を消してしまう点を§7に明記し、ST07／ST09へ対応する変異対照を加えた。

Status: **第1段階のanchor・未消費claim・空shellと消費前拒否だけ実装。移動・公開・移譲後discardは未実装。** 親は[canonical供給表・非実行view設計](BEST_PRACTICE_WFB_CANONICAL_SUPPLY_VIEW_DESIGN.md)と[同snapshotの所有・停止契約](BEST_PRACTICE_WFB_SNAPSHOT_READ_LIFECYCLE_DESIGN.md)。[供給準備の検証・post検査レビュー修正](E2E_BEST_PRACTICE_WFB_CANONICAL_SUPPLY_VIEW_2026-11-08.md)を前提とするが、その成功を移譲済み証拠へ転用しない。

正式発行口閉鎖・C実行入口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。draft-0.1／0.2はMDのみ、draft-0.3の実装は§12の合成preflightだけ。C実行・実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行わない。移動・公開・移譲後discardの記述は引き続き設計案であり、実行権限を追加したものではない。

## 1 現行との差分と非目標

現行CanonicalSupplyAssemblyは、同constructionの全file registry／table／viewを準備し、自身のfieldへ保持する。供給準備claimは既にone-shotだが、下位移譲claimはnot_issuedのままである。

現在のvalidate()は準備ownerのenvelope／registry／table／view・発行済み参照を直接読む。clear()はそれらを全消去してpreparationStateをdiscardedにし、finish()はその後に内側Cの終端・borrow退役へ進む。この3つを移動処理としてそのまま使うと、元fieldを空にした後のpost検査や、pendingが保持中のborrow寿命と整合しない。

差分は、通常利用slotのdetach、検査用の発行根拠anchor、pending／holder／失敗保持slot、専用移譲claim、固定discardを分けること。table／view／canonical file・sourceを再生成せず、同じ参照を移す。hash／source操作・kernel生成・実budget／clock・resource cleanupは追加しない。

非実行holderが持つ権利は検査・固定discardだけである。kernel_owned／実行権限／S／permit／cleanup確認済みへの昇格、holderやsummaryを次のkernel供給へ再利用する分岐は作らない。

## 2 生成元・配置・旧入口

既存composition moduleのlexical境界内にprivateな移譲ownerとissuer／consumerを置く。新しい固定合成診断factoryをcreateCanonicalSupplyTransferFake、薄い入口をtests/review/fixtures/canonical-supply-transfer-fake.tsとする。draft-0.1／0.2ではfileやexportを作らず、draft-0.3で非実行preflightの診断入口だけ追加した。

新factoryのconstructionは同じprivate CanonicalSupplyAssemblyを生成し、同rootで開始・供給準備を行う。旧公開facade／summaryを呼んで採用する方式は不可。private継続だけが同ownerの発行物をcapture／detachでき、constructor・anchor・claim・payload・pending／holderやadopt helperはexportしない。外部map／bytes／ops／callbackも受領しない。

旧B／C-start／canonical供給準備のfactory、export集合・facade・既存挙動は維持する。新入口を使わなければ移譲slot・anchor・claimを生成しない。新入口の公開操作名は実装時に固定するが、引数なしの有限な診断操作だけとし、戻り値は固定状態／理由／計数のみ。private参照をfacadeへ返す口にしない。

## 3 内部型・保持slot・役割

| 内部対象案 | 内容・権限・上限 |
|---|---|
| SupplyIssuanceAnchor | 元供給owner／prepared／borrowと同envelope、正規registry、table origin、発行済みtable／view／declarationsの同参照。元の発行根拠を1回captureし、候補から作り直さない |
| NonExecutingSupplyTransfer | 同移譲owner／元供給owner／anchor／受領先shellへ結合するprivate origin・one-shot状態。将来のkernel用claimと別brand、1つだけ |
| SourceNormalSlot | 移譲前の同registry／table／view bundleへの通常利用slot。claim消費時に利用を禁止し、detach後は空にする |
| TransferPendingSlot | 受領前・部分移動を追跡する先行確保slot、容量1。taking中の責務を持つが通常利用・再移譲はできない |
| NonExecutingHolderShell | 同owner／claim／anchorに結合する先行確保shell、容量1。post後の単一slot置換でだけpayloadを受理し、固定discard以外に使えない |
| TransferFailureSlot | 同上位ownerの先行確保slot、容量1。pending／holder等の未退役責務を保持し、再prepare・再take・kernel利用・追加discard試行の権限を持たない |
| TransferDiagnosticSlot | claim消費・公開済み・停止・discard試行・退役確認を分離して保持する固定slot。結果準備失敗でも先行理由を捨てない |

payloadは既存の同registry／table／view／declarationsを束ねる参照集合であり、fileやbytesをcopy／再decode／再hashしない。Snapshot／canonical files／rowsの同参照を保つ。actual長を宣言長へ補正したlegacy Fileを作ることもない。

anchorは検査専用で、通常利用slotではない。ただしstrong referenceなので、anchorだけでもtable経由でbytesの寿命を延ばし得る。発行根拠を保つことを「本文参照なし」と報告せず、anchorも最終退役対象へ含める。同じ不変objectへの複数参照と、通常利用権の複数発行は区別する。WeakRef／GCを発行証拠や退役確認に使わない。

上限はanchor・claim・pending・holder・failure slot各1、tableのfile最大32／rows12という既存構造枠を維持する。これらは実確保layout・全heap上界の実証ではない。実OOM時の診断必着もUnknown。

## 4 同一性・検査根拠・停止の分離

同一性の根拠は同constructionの元供給ownerと、移譲前にcaptureした元の発行物である。claim・pending・holderのpayloadだけを見て「期待値」を再構成する自己照合は禁止する。

| 検査群 | 必須の同一性 |
|---|---|
| 元construction | owner／Snapshot／setId／map／files／rows／session origin／budget origin／prepared／発行borrow |
| 発行物 | anchorそのもの、元の正規registry・table origin、発行済みtable／view／declarationsの参照とorigin |
| file対応 | 原順序のordinal、files[i]そのもの、registry[i]のfile／source origin／record、bindingとdeclarationの同参照関係 |
| 移譲経路 | 同移譲owner・claim origin・元owner・pending slot・受領shell・受領対象、未消費または期待するtaking状態 |
| liveness | 正規close／先行失敗／終端・借用失効を、pointer混入とは別に判定する。opaque budgetの一致を実予算・期限検査にしない |

元のvalue検査は再実行して別mapを作らず、準備段階の意味検査を済ませた同参照を利用する。ID／path／digest一致・同値copy・再freeze・別snapshot／同setId・公開summary・legacy結果では代替できない。sort／dedup／再検索による補正も行わない。

準備postと移譲pre／postで共用する場合は、binding関係の検査を明示的なprivate anchor／候補引数へ切り出す案とする。準備側は従来の保持field、移譲側は同pendingまたは未公開holder候補を渡す。元fieldを空にしたことだけで移譲postが不一致になる実装にしない。pureな関係検査と、同rootの現在停止・claim／slot状態の検査は分ける。外部から任意のanchor／候補を渡せるexportにはしない。

cleanup／discard用には、close後も元のowner／claim／payloadの同一性を確認できるanchorを保持する。現在の通常利用を許すcontext()がclose後にundefinedになることを理由に、既存責務のdiscardをskipしない。逆にcleanup用identityだけで通常利用を再開しない。

## 5 状態・claim消費点・公開点

準備claimと下位移譲claimは別slotとする。準備済みは下位claimの消費済みを意味せず、下位claimは新しいsession／budget／creditの発行ではない。

移譲状態はunused → taking → held_for_discard → discardedを正常経路とする。pre拒否は消費0のままdiscardedへ、taking後の拒否は消費1のまま固定discardへ進む。責務を確認できなければretained_unconfirmedへ進み、unusedやheld_for_discardの成功へ戻さない。kernel_ownedはこの状態集合へ入れない。

固定手順は次とする。

この手順に入る前に、同元ownerで供給準備が完了し、先行拒否・終端・closeがないことを固定受付で確認する。既に失敗している元ownerに対して移譲先のslotを生成せず、元の診断とdiscard経路を維持する。

1. 同ownerの診断slot・pending・受領shell・failure slotを先行確保する。元viewを外へ出さず、全slotが同ownerへ結合していることを確認する。確保失敗は移譲claim消費0、元の準備claimは戻さない。
2. 同prepared・発行物のanchorを1回captureする。先行失敗／終端／正規closeを先に分類し、同一性・元ownerの通常利用が1つ・移譲未消費をpre検査する。拒否したownerは終端へ進め、消費0を再試行可と解釈しない。
3. **claim消費点**：同じ同期区間でtransferStateをtakingへ置換する。ここで元ownerの通常利用gateを閉じる。以後は再入・二重take・生成失敗・停止があっても消費1で、元slotへ利用権を返さない。
4. 同payload参照を先行pending slotへ記録し、その後に元ownerの通常利用slotを空にする。pending記録を先にして未保持の空白を作らない。二つのfieldに参照が一時的にあっても、takingで元の通常利用は既に禁止されている。途中故障ではpendingを優先して保持し、未detachの元aliasも固定discard対象として追跡する。
5. 同pending／claim／anchorから非公開holder候補を準備し、現在停止とpostの全同一性を検査する。追加のtable／view／registryを生成せず、外部callback・await・source操作・clock採取を挟まない。
6. **公開点**：post通過後、同受領shellのactive slotを1回置換し、held_for_discardへ進める。これはprivate consumerへの受理点で、step3の不可逆なclaim消費点とは別。pendingは通常保持を終え、元ownerには寿命管理・診断参照だけを残す。
7. 公開後に結果投影や後着停止が失敗しても、所有者はholderのまま。元ownerや別holderへ巻き戻さず、固定discardまたはfailure slot保持へ進む。診断戻り値を作れたかと、公開済みかを混同しない。

step3〜6の間に通常利用できるownerはない。pendingは受領準備・破棄専用であり、holderも非実行のdiscard専用である。JS／TypeScriptのreadonly型や値のmove風記法だけでは排他を保証できないため、private claim状態と固定consumer入口で検査する。

## 6 失敗位置と所有責務

| 位置 | 責務保持者・許す処理 |
|---|---|
| 元の供給／開始／準備が既に失敗 | 元の先行診断を維持。下位claim0・移譲先生成なし。既存の供給準備discardを行い、別rootへfallbackしない |
| 先行slot確保・capture・pre拒否 | 元ownerがpayloadを保持したまま通常利用を止める。下位claim0、固定discardへ。slot確保に失敗しても元ownerの既存保持先を捨てない |
| taking直後、pending記録前の故障 | 元slotの参照は残るが利用権は消費済み。同上位ownerが元参照を固定failure slotへ保持し、再利用せずdiscardする |
| pending記録後・元detach途中 | pendingが責務を持つ。元aliasは通常利用不可のまま追跡し、同objectを二重に処理せず両保持slotを退役対象へ含める |
| holder候補生成・post拒否 | pending／候補を同failure保持先にまとめ、未公開のまま固定discard。第2候補生成・claim再発行なし |
| 公開後・戻り値失敗・後着close | holderが責務を持つ。公開済みを取り消さず、停止診断を保持してdiscardする |
| discard途中・保持確認失敗 | failure slotに未退役参照と段階を保持しretained_unconfirmed。成功したclearを巻き戻さず、未確認を空と補完しない |

failure slotは既存のresource cleanup custodyとは別である。本段階にhandle／FDは存在せず、resource cleanupDispositionはnot_startedのまま。failure slotへの参照移動自体も、payload退役や物理解放の確認ではない。

failure slotそのものの先行確保に失敗した場合は、元ownerの既存保持slotを最後の責務保持先とする。通常利用を止めたまま固定discardを試し、空を確認できなければ元参照・borrow／Snapshotを保持してunconfirmedとする。存在しないfailure slotへ「移譲済み」と報告しない。

同じaliasが複数slotに残り得る故障では、owner／claimと元payload identityで同一責務として追跡する。任意の参照集合を受け取る汎用回収器やID再検索を作らず、固定された元slot・pending・候補・holder・failure slotだけを処理する。

## 7 固定discard・借用退役・終端

discardには専用の一度限り開始状態を持たせ、通常終端・close・失敗unwindが重なっても試行は最大1とする。移譲claimとは別のcleanup排他であり、resource closeの予約／試行ではない。

正常な固定順序は、通常利用gate停止 → discard開始claim → 各固定slotのpayload／alias参照clear → 空の確認と発行anchor退役 → 非実行退役結果の準備 → 内側Cの結果固定／borrow退役 → 必要時Snapshot退役 → 上位不変診断固定、とする。正常discardで元readonly Snapshotを残せる方針は維持するが、準備・下位移譲claimは戻さない。

現行clear()は元owner内の全消去用として残し、通常利用slotのdetachには別のprivate処理を設ける。既存discardPassesを「移動回数」に読み替えず、sourceDetachと固定discard試行を別計数にする。発行根拠をanchorへ保持している間は、元fieldが空でもpayload完全退役とは報告しない。

現行finish()の無条件clear→内側finishも、activeな下位移譲へ直接流用しない。新移譲ownerがtaking／held_for_discard／retained_unconfirmedの責務を先に処理し、完了または未確認保持を判定する。旧準備factoryのfinish動作を変えるのではなく、新private経路にだけ停止gateを設ける。

同じ理由で、現行の準備owner `close()`（root closeの後に未終端なら先行理由を設定して`clear()`）と`fail()`（先行理由・親lifecycle停止の後に`clear()`）も、移譲開始後（taking／held_for_discard／retained_unconfirmed）には呼ばない。これらを経由すると、§6で固定failure slotへ保持すべき元aliasや発行済みtable／view／declarations・table origin・作りかけ参照が同期的に消え、discardPasses／`supply_references_cleared`も記録されて、sourceDetachと固定discard試行の分離・discard試行≤1が崩れる。移譲開始後の正規closeは新private経路から同rootのcloseだけを呼び、transferStopを記録して固定discardへ進む。binding／生成失敗も新private経路が親lifecycleの停止（既存の写像）だけを依頼し、元ownerの保持fieldは§6の責務保持者が固定discardで処理する。移譲開始前（claim消費0）の拒否・closeは従来どおり既存`close()`／`fail()`へ委ねてよい。

clear・anchor退役・failure slotへの保持確認が完了しない場合は、borrow／Snapshotをまだ退役させない保守的方針とする。上位結果にはretirement=unconfirmed、保持中slot、borrow退役保留を固定し、内側finishを呼んで「完了」にしない。同failure ownerが参照を保持し、反復finish／closeは追加discard試行・成功化を行わない。後日の回収再試行や外側隔離は別契約まで未対応である。

終端後にconstructionがGC対象になっても、最後のunconfirmed記録をretiredへ変えない。参照消去・alias消滅・GC・物理ゼロ化・実resource解放は別概念とする。確認不能な責務を捨ててborrow退役済みを装う実装は受け入れない。

## 8 固定理由・診断軸

元のsupplyFirst／lifecycleFirst／readFirst／readStopを保持し、新しくtransferFirst／transferStop、公開済みbit、discardAttempted、retirement状態を別slotへ置く案とする。source本文・digest・path全文・raw例外・private参照は出力しない。

| 原因 | 新移譲側の分類案・親への対応 |
|---|---|
| 元の先行失敗 | 元の固定理由を上位へ保持。新しい混入やcloseで上書きしない |
| slot／候補生成失敗 | transfer_prepare_unavailable。親への停止は既存read_prepare_unavailable写像を候補とし、rootに未開始readStopを新設しない |
| 異なるowner／anchor／claim／slot／発行物 | binding_mismatch。親lifecycleはbinding_mismatch、readFirst未設定ならbinding |
| 二重take／taking再入 | duplicate_transfer。新claim0、元処理も停止。親の開始claim違反duplicate_startと混同しない |
| 正規close | transferStop=supply_closed。先行transferFirstを維持し、元rootの同期close／readStop契約に従う。close後context不在を混入へ丸めない |
| discard／保持確認失敗 | retirement=unconfirmedと固定discard診断。先行binding／生成理由・公開済みbitを消さない |
| 終端後の再要求 | 非記録のread_already_used等の固定応答。既存終端・計数を変更しない |

新しい理由名・schemaの追加は新移譲診断factoryに限定して実装時に確定する。旧B／C-start／供給準備factoryの理由unionへ暗黙に混ぜない。公開成功・discard確認・借用退役・戻り値生成成功はそれぞれ独立した観測とする。

## 9 費目所有・有限schedule

供給準備のstrict検査・registry／表／view生成は既存準備側の所有とし、移譲側で第2生成として計上しない。移譲側は先行slot／claim／anchor準備、pre／post照合、pending記録・元detach・公開、固定discard・保持確認・終端を所有する。borrow／Snapshot退役は元lifecycle側と二重所有しない。

移譲preとpostの全件対応照合は各1回・最大32fileを基準とし、発行参照・slot照合は固定回数にする。実装前に正規・初回拒否・全失敗prefixを有限操作表へ落とす。未取得Eへ生成前費用を後着課金せず、opaque budget tokenを実会計に置き換えない。

動作観測はtransfer_claimed／pending_owns／source_detached／holder_published／discard_claimed／custody_holds／payload_cleared／anchor_retired／borrow_retired／snapshot_retiredの10固定event slotを候補とし、各slotは最大1回とする。既存retirementOrderの最大3件へ任意追加する方式や、要求回数ぶんの診断listを作らない。event slotと順序値も権限ではなく合成観測である。

全CPU／heap／native費・slotの実確保layout・C接続全体guard・実E／SはUnknown。実clock・実予算・共有期限の導入は別工程とし、Bのcap・D_stop900／D_end1000・guard131,524を延長・再計算して吸収しない。open／read／hash／resource cleanupは引き続き0。

## 10 独立合成受入条件（draft-0.3で消費前部分だけ実施）

| ID | 必須対照 |
|---|---|
| ST01 | 同owner／prepared／anchor／registry／table／view／borrow／session／budget originからだけ移譲。各1項目差、同値copy、別root／同setId、summary・旧結果を拒否 |
| ST02 | 各先行slot確保失敗・capture／pre拒否はclaim0。taking後の全prefixはclaim1のままで再準備・再takeなし |
| ST03 | pending記録前後・元detachの間で故障し、元aliasとpendingの責務が途切れない。通常利用権が二つにならず、第2holderへ渡せない |
| ST04 | 移動前の発行anchorを保持したまま元通常slotを空にしてもpost成功。候補からanchorを再生成・書換えする変異、元field依存のままの検査を検出 |
| ST05 | pending／holder shell／claim／発行根拠・file対応を個別に混入。狙う条件以外を整合した単独対照と有効基点を設け、各検査の感度を確認 |
| ST06 | 二重take・同期再入・公開直前／直後の故障。消費点と公開点を別イベントで検証し、公開済みを巻き戻さない |
| ST07 | closeをpre前・taking直後・pending中・post直前・公開後・discard中・終端後へ配置。正規停止とbinding拒否を分け、先行理由と既消費claimを保持。移譲開始後のcloseで内側準備ownerの`close()`を呼ぶ変異（元alias・発行参照の同期消去、discardPasses／`supply_references_cleared`の記録）を検出 |
| ST08 | 未公開・公開後の各固定discard失敗、alias／issued／anchor保持漏れを個別注入。未退役slotを保持し、unconfirmedをretired／空へ補完しない |
| ST09 | pending／holder／failure slotが未解決ならborrow／Snapshot退役を保留。現行finishを先に呼ぶ変異を検出。反復finishでもdiscard試行≤1・終端不変。移譲開始後のbinding／生成失敗で内側準備ownerの`fail()`を呼ぶ変異を検出し、失敗後もfailure slotが元aliasを保持することを確認 |
| ST10 | 同じtable／view／canonical参照・原順序を維持し、copy／sort／dedup／再decode・期待値補正・第2source生成なし |
| ST11 | 原因順序を替えて元診断・transferFirst／Stop・公開済み・discard／retirementを照合。終端後応答・秘密非出力を確認 |
| ST12 | 独立した所有・寿命event oracleで全失敗prefix・有限操作列を照合。構造計数と実費を区別し、10event上限・claim／slot最大1を確認 |
| ST13 | 旧B／C-start／供給準備の結果・export・compiled保証・梱包負対照を維持。新入口は固定診断だけ、kernel／SourceOps生成・C実行・正式発行は0 |

直前レビューでpost条件の単独対照を追加した方針を移譲検査にも適用する。現在の冗長条件の等価判定は、元fieldをdetachする新stageへ自動継承しない。独立oracleは本体の検査式・係数・anchor構築をimportして期待値を作らず、元の正規対応とclaim／責務の移動を別記述する。混入・故障は固定内部scriptでのみ表し、任意hook／callbackを追加しない。

## 11 次の実装分割案と停止線

1. anchor／claim・先行pending／holder／failure shellの内部型と同owner結合、claim消費前の固定拒否を実装する。通常利用slotからの移動・公開はまだ行わない。
2. taking・同参照pending記録・元通常利用detachとpost照合を接続する。途中故障・再入・closeと未公開破棄を確認し、kernel受領には進まない。
3. 非実行holderの単一公開点・専用discard claim・未確認保持とfinish保留を接続する。全prefixの費目／寿命oracle、compiled変異・旧回帰・梱包を確認する。

各段階で公開していないものを受理済み、保持中のものを退役済みと呼ばない。draft-0.3では第1段階だけ実装・合成試験済み。正常経路を実装してもholderの用途は固定discardに限り、C→kernel実行・実budget／stop／resource連結・実期待値pin・S／core／runtime接続は別承認・別検証まで閉じる。

## 12 第1段階の実装境界（draft-0.3）

新しい`createCanonicalSupplyTransferFake`は同composition内のprivate `CanonicalSupplyAssembly`を一つ生成し、同rootのbegin→prepare→prepareSupplyへ進む。facadeはprepare／close／finish／inspectの固定診断だけ。旧3factory／旧薄い入口は不変で、compositionのexport集合だけ新診断factoryを追加した4つになる。

module-private継続が元ownerのprepared／発行borrow・同envelope、registry、発行済みtable／view／declarationsとtable originをcaptureする。anchorは同transfer ownerを保持し、private発行slotと元ownerの現在の正規参照の双方を検査する。固定scriptによるanchor候補copyや1項目差は、候補側だけから期待値を作らず拒否する。元の不変registry／供給表のfile対応検査は準備側が所有し、この段階では再生成・再hashしない。

別unique-symbol brandの`NonExecutingSupplyTransfer`はstate=`unused`だけを表し、消費methodを持たない。pending／holder／failureのtyped shellは各1つ・同owner／source／anchor／claim／receiverへ結合し、payload型は`undefined`だけ。正常preflightでも原ownerのregistry／table／viewは保持されたままで、sourceDetaches／holderPublications／claimsConsumedは0。anchorのstrong reference保持はretainedAnchorとして明示し、本文参照なしとは報告しない。

準備の有限順序は元供給の受付→anchor capture→未消費claim発行→pending／holder／failureの空shell結合→pre検査。shell保持用のprivate slotは先行確保し、各shellの生成故障もclaim消費前に止まる。元供給が失敗していればanchor／claim／各shellの発行は0。構造計数は上記の局所生成prefixだけで、全確保費・実E・OOM診断必着の証明ではない。

拒否はsource_rejected／transfer_prepare_unavailable／binding_mismatch／duplicate_transfer_preparation／supply_closed。元診断はsource内の固定snapshotに保持する。失敗後はrejectedのまま再prepareを拒否し、claim消費0でも再準備・再発行を許さない。正規closeはstopReasonへ分離し先行firstReasonを上書きしない。先行確保失敗時に存在しないfailure shellへ移譲済みと報告しない。

全経路が移譲開始前なので、拒否／closeは既存の元ownerの固定clearを利用できる。finishは空shell／claim／anchor参照を消してから元ownerのfinishへ進み、borrow退役後は不変終端診断を返す。これは移譲後discard claim・custody保持・未確認時finish保留の実装ではない。taking以降の処理を追加する前に§7の旧close／fail／finishを迂回する専用境界が必要。

40種の単独混入対照、6箇所の生成故障prefix、正規close・元供給失敗・二重準備・外部hook非実行・終端不変を確認する。compiled対照はanchor9・claim7・shell共通8の24種と、current／issuedのanchor・claim・shell保持漏れ6種およびborrow先行退役1種の計7退役対照。retainedAnchor／retainedClaim／retainedShellsは発行済みaliasも含め、anchor退役時に元borrowがまだ保持されていたかを固定booleanで記録する。anchor table／viewは元current／issuedの同参照を二箇所で確認するため、その二条件は組で除去し、それ以外は単条件を除去する。これは将来detach後の冗長性を保証しない。ST01／02／05／07／11〜13の消費前部分だけを対象とし、taking・移動・公開・移譲後discard／保持未確認の受入条件は未実施のまま。
