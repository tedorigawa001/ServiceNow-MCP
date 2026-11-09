# WF-B (C)：pending／failure内部型・先行生成と固定回収／finish gateの詳細設計

Version: draft-0.1 / Date: 2026-11-09 / 読み取り照合基準HEAD: `fbfe6dd`。

Status: **設計のみ。** 親は[停止・所有境界／detach後照合設計draft-0.4](BEST_PRACTICE_WFB_TRANSFER_TAKING_BOUNDARY_DESIGN.md)と[下位移譲claim・pending／holder設計](BEST_PRACTICE_WFB_SUPPLY_TRANSFER_DESIGN.md)。[unused controlの検証・レビュー修正](E2E_BEST_PRACTICE_WFB_UNUSED_CONTROL_BOUNDARY_2026-11-09.md)を前提とするが、回収・退役済みの証拠には転用しない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。今回の作業はMDだけ。実装・claim消費・pendingへの通常payload移動・detach・holder公開・C実行・実期待値pin・実source照合・S発行・core／実接続・実通信・実機操作・設定変更・Pushは行わない。以下はprivate設計案であり、既存API／権限の追加ではない。

## 1 現行との差分と先に解く制約

現行新入口はprepare／checkNormal／checkRelation／close／fail／inspectだけで、finishはない。bind後の停止は元ownerのclearを経由せず、payload・anchor・borrow／Snapshotを保持する。bind前close／failureだけは既存の消費前close／fail＋clearへ送る。下位claim消費・pending記録・detach・公開は0。

今回具体化するのは、容量1のpending active slot／failure custodyと、その生成失敗を含む一度限りの回収・未確認保持・root終端許可である。現行の新入口にはこの機能がなく、takingを有効にする前に整備する。

**空のpendingだけを見て退役成功にはできない。** 現SupplyUseControlはreadonlyなsource／anchor／claimを持ち、claimもanchorを参照する。sourceのnormalControl、local control／issuedControlから同anchor→table→bytesへ到達し得る。local payload／anchorだけをclearしても、controlを残せば本文参照が残る。反対にsourceのnormalControlを単純にundefinedへ戻すと、再bind拒否や同control gateの根拠を失う。

このため、payloadを含まない不変identity coreと、退役可能なprivate live bindingを分離する。旧factoryを一括変更せず、新段階のprivate経路で移行・回帰を検証する。通常slot集約や実移譲の安全性は、この回収設計だけでは確認済みにしない。

## 2 内部型・容量・権限

型名は設計名。constructor／brand／issuer／受領helperはexportせず、既存compositionのlexical境界内だけで生成する。

| 内部対象案 | 必須内容・容量 | 許すこと／許さないこと |
|---|---|---|
| ConstructionOrigin | 同生成の空opaque token、1個。本文・source objectを格納しない | 部分生成前からshellと診断を同生成へ結合する。権限や実予算ではない |
| RetentionRoot | 同constructionの先行責務owner、1個。生成済みslotの固定表を持つ | 最後の既知保持先。未生成を生成済み、未確認を空へ補完しない |
| PendingShell | 同construction・role=pendingの不変origin、1個 | unbound→boundの一度限り。通常利用／再移譲の権限なし |
| PendingActive | privateなempty／held／clearedの状態、payload容量1 | 同bindingの同PreparedSupplyPayloadを保持。overwrite・再装填・copy採用なし |
| FailureShell | 同construction・role=failureの不変origin、1個 | 未生成なら存在を報告しない。別ownerへの回収口にしない |
| FailureCustody | 同bindingと生成段階・未退役保持箇所を束ねるlive cell、容量1 | 固定slotの責務を追跡し、一度だけ回収する。snapshot要約をpayloadとして採用しない |
| ControlIdentity | 同owner／source／claimのpayload-free origin tokenと不可逆状態 | source gateが同じcontrolを保持し続ける。unusedへの復帰・再bindなし |
| ControlLiveBinding | source object／anchor／元claim object等の実参照、容量1 | 使用中は正規tupleを検査、退役時にcellを空にする。identity coreへ本文参照を移さない |
| SourceRootSlot | 正規source/rootへの内部参照、最大1 | payload退役後のroot finish専用。候補anchorから別rootを取り出さない |
| RetirementAttempt | 専用cleanup originとunused／running／done／unconfirmed | 下位移譲claimと別のone-shot。close／fail／finishが共有する |
| PayloadGoneEvidence | 同owner／source／control originと固定空確認世代、最大1 | 同private root終端consumerだけが一度使う。公開診断から復元不可 |
| Diagnostic／TerminalSlot | 先行理由・停止・回収・root終端の各軸、各固定1slot | 本文・anchor・control live bindingを含まない。不変結果の保存を責務移譲の代用にしない |

unbound shellはconstructionへだけ結合し、source／controlの権限をまだ持たない。source／anchor／claim／controlが揃った後、同source origin／owner origin／claim origin／shell origin／受領先を一度だけbound tupleへpinする。同値copy・別construction・別source・別claim・別shell・公開summaryによる代替を拒否する。

FailureCustodyの容量1は「一つの同payload責務とその既知alias群」の意味であり、alias一本だけを保持する意味ではない。任意配列・任意owner集合を受け取る汎用回収器にしない。foreign候補の混入を検出しても、foreign source／Snapshotのmethodを呼ばず、自construction内の保持参照と正規SourceRootSlotだけを処理する。

## 3 control・claim参照の退役契約

identity coreには空のowner／source／claim origin tokenだけを置く。source class instance、anchor、PreparedSupplyPayload、元のfrozen claim objectをtoken代わりに残さない。現在のclaim objectはanchorを保持するため、そのobject自体も退役対象である。

control instanceは同sourceのgateに残せるが、live binding cellをclearした後はstopped／retiredだけを返し、通常利用や再bindを許さない。全通常gateは「unusedかつ正規live bindingあり」を許可条件とし、現行のstoppedだけを拒否する条件を状態追加後へ流用しない。rootがreadonly Snapshotを残していてもretired controlから通常利用を復活させない。mutable private cellを持つ不変shellを用いる案とし、frozen objectのreadonly fieldをcastで書き換える方法は採らない。source側のcontrol発行済み状態はclearしない。

local controlが候補copyへ差し替わっていても、回収権限はpin済み正規controlから取る。候補aliasはlocal slotから除去し、候補のretire methodを呼ばない。current／issuedのいずれにもlive bindingを残さないことを確認する。同じcontrolを複数slotで参照する場合は、cell退役を一度、alias空確認を各slotで行う。

下位claimの消費0／1と回収状態を混同しない。unusedのままcloseして回収した場合も回収claimは1になり得るが、下位claimは0のまま。将来taking後を扱っても、回収で下位claimが返却されることはない。本段階の実装開始時にはtaking遷移・consume口を作らない。

## 4 先行生成順と部分生成の記録

1. construction originと先行Diagnostic／TerminalSlot、RetentionRootを確保する。これらの存在を実OOM時まで保証できるとは主張しない。
2. SourceRootSlot・PendingShell／PendingActive・FailureShell／FailureCustody・RetirementAttempt・PayloadGoneEvidence発行slotを空で用意する。生成成功ごとに直ちに固定保持表へ記録する。
3. 元sourceのprivate生成・既存strict準備へ進み、source／部分生成物の捕捉を先に行う。元供給失敗なら下位claimやbound shellを作らない。
4. 同issuerのanchor／参照wrapper／元未消費claim／controlを生成する。生成直後にRetentionRootの対応slotへ記録し、次の故障点へ進む。本文の再copy・再decode・再hashはしない。
5. 同identity coreとlive bindingを検査してsourceへ一度bindし、pending／failure shellを同tupleへbound化する。関係検査の成功だけでbound化しない。
6. すべての先行slot・回収先・空確認／終端slotを確認し、非実行のprepared状態を固定する。pendingはempty、下位claim0、detach0、holder公開0のまま。

step2までのshellは容量を予約するだけで、通常payloadをpendingへ記録しない。source生成が既に失敗していれば、先行shellがあってもsourceへbound済みとは報告せず退役対象として回収する。

現在のsource constructorは一括生成なので、途中throwで返らなかった内部状態を「未生成」と推測しない。後続実装では、失敗し得る初期化より前にprivate source shellを捕捉する固定producer、または同生成のpartial failure受領物を返す契約を先に必要とする。任意callbackや外部sinkを追加しない。捕捉できないconstructor内部故障はUnknownであり、回収成功・root未生成・正常finishを認定しない。合成故障は既知の生成／捕捉前後を区別し、実OOM保証へ昇格させない。

## 5 固定保持表・clear対象・残してよいもの

空確認は8固定群を対象とし、群内の一部clearだけでは群を空と認定しない。動的listの長さや要求回数で表を増やさない。

| 群 | 検査対象 | clear後の確認 |
|---|---|---|
| R1 source通常alias | registry／table／view、buildingRegistry／buildingBindings／buildingDeclarations | 各private slotが空。旧clearの計数やイベントを流用しない |
| R2 source発行根拠 | envelope／issuedTable／issuedView／issuedDeclarations／tableOrigin | anchorに保持したため消してよいという推測ではなく、各slotを確認 |
| R3 local wrapper | payload／issuedPayload | current／issued両方が空 |
| R4 local anchor | anchor／issuedAnchor | current／issued両方が空 |
| R5 pending | 同shellのactive payload | empty／clearedの実slot確認。phaseだけを根拠にしない |
| R6 failure custody | live参照cell・部分捕捉物・未退役alias群 | 数値診断だけを残し、cellの本文参照は空 |
| R7 control／claim | 正規controlのlive binding、元claim object、候補control aliasとそのlocal保持 | live cell空、未消費／既消費の履歴だけ残る。source gateは不可逆に閉鎖 |
| R8 その他の受領alias | RetentionRootの各capture cell、issued control経由のlive cell、検査中／結果準備中の一時payload参照等 | 許可されたSourceRootSlot以外の捕捉aliasを空確認。固定lexical scopeから持出さない |

PendingActiveとFailureCustodyを空にすること、sourceDetach、各発行aliasの退役を別操作として記録する。source wrapperが同じ参照でも、alias空確認をskipしない。wrapperからanchorを作り直す、sort／dedup／ID再検索で回収対象を補正する方法は不可。

clear後も残せるのはpayload-freeなorigin／control core、先行原因・段階・確認bit・計数、正規SourceRootSlotとrootが許可するreadonly Snapshotである。SourceRootSlotを残す間は、そのsource自身のR1／R2／R7が空であることが必要。Snapshotの宣言mapを保持する正常方針と、実bytesを持つsource record／table／anchorの退役を区別する。退役証拠の対象は自ownerの固定保持経路からの参照除去であり、foreign ownerの参照不存在、全object graph、物理メモリのゼロ化は保証しない。

固定payload clearを同source専用のprivate継続として設けるが、既存CanonicalSupplyAssembly.clear／finishは呼ばない。discardPasses／supply_references_clearedは旧準備discardの費目のまま残す。正常slot集約後は保持表を対応更新し、旧fieldがなくなったことを未確認clearとして扱わないよう版を固定する。

## 6 一度限りの回収開始・処理順

close／fail／finishは同RetirementAttemptを共有する。受付は終端→先行診断保持→正規control／construction identity→現在の回収状態の順。unused→runningの同期置換が回収開始点であり、以後の再入・二重要求・throwでも試行を追加しない。下位claim消費点とは別である。

固定順序：通常gate停止 → 正規FailureCustodyへ既知責務を捕捉（未生成ならRetentionRootが保持）→ R1〜R3の参照退役 → R5のpending退役 → R7のcontrol live binding／元claim／候補alias退役 → R4のanchor退役 → R6のcustody live参照退役 → R8と全8群の空確認 → PayloadGoneEvidenceのprivate発行 → root終端gateへ。

検査に必要な正規identityはpayload-free coreとSourceRootSlotへ先にpinする。anchor／control bindingを消した後でそれらからrootや期待値を再取得しない。clear途中に関係検査の成功を要求して回収を止めず、正規ownerと固定保持表に基づいて退役する。不正candidateは通常受理しないが、local aliasの除去はできる。

各slotへのcaptureは参照をclearする前に確認する。captureできたというbitを先に立てない。clearの実行済みbitと空確認bitも分ける。故障で一部だけ消えた場合は復元せず、その時点の残存参照を保持してunconfirmedへ進める。固定回収内にawait・任意hook・source I/O・clock採取・追加のunbounded確保を挟まない。

## 7 失敗位置と最後の保持者

| 位置 | 回収claim／責務 | 許す終端 |
|---|---|---|
| Diagnostic／RetentionRoot確保前の実確保失敗 | 先行ownerの存在自体を保証できない | Unknown。診断必着・回収成功を主張しない |
| pending／failure shellの部分生成 | 生成済みslotはRetentionRootが保持 | 下位claim0。存在しないcustodyへ移譲済みと報告しない |
| source／anchor／controlの途中生成・bind前 | 捕捉済みpartial slotを同RetentionRootが保持 | 未生成・捕捉失敗・生成済みを区別。controlなしでも消費前の元停止契約を維持 |
| bound後、pending empty | 正規controlと元source＋local aliasを固定表で追跡 | gateを閉じて回収。関係値のokやpending空だけでfinish不可 |
| 将来のpending held／元alias残留 | 同FailureCustodyが同payload責務と既知aliasを追跡 | 未公開の固定回収だけ。holderや元通常slotへ戻さない |
| custody捕捉／個別clear／空確認失敗 | 元保持先またはcustodyのうち、確認できた保持先を維持 | payload_unconfirmed。anchor／borrow／Snapshotを一律退役済みにしない |
| payload証拠発行・結果準備失敗 | payloadが既に空ならその事実を維持し、正規root責務を保持 | 空確認済みと証拠未発行を別表示。証拠を再発行しない |
| root finish／失敗Snapshot退役の途中失敗 | SourceRootSlotが残るroot責務を保持 | root_unconfirmed。既に消したpayloadを復元せず、root終端を再試行しない |

unconfirmedでは、回収claim spentと保持箇所・確認済み段階・先行原因を固定する。反復finish／closeは同診断を返すだけで、clear・root finish・retireFailedを追加実行しない。後日の再回収や外側隔離は未対応の別契約である。

## 8 PayloadGoneEvidenceとroot finish gate

証拠は正規issuerだけが、通常gate閉鎖・回収claim running・8群すべて空確認済み・同root identity確認済み・未発行を満たすとき一度発行する。本文・anchor・元claim・live controlを保持せず、payload-freeなRootSlotOrigin（空token）と発行slotの結合で同rootを特定する。root instanceやSourceRootSlotそのものを証拠へ格納せず、正規consumerが自身のSourceRootSlotを照合する。公開の保持bitや要約を入力として発行しない。

root終端consumerは、同construction／source／control origin・同private発行slot・証拠未消費・回収確認世代・root終端未開始を検査する。失効した証拠・同値copy・別root・別owner・消費済みを拒否し、証拠だけで別のrootを終了できない。証拠消費とroot終端開始を同じ同期区間で一度だけ確定し、以後の失敗でも未消費へ戻さない。

通常停止・正規closeは回収証拠の発行／消費を禁止する失効ではない。ここでの失効は発行slot／確認世代の無効化、owner終端等によるcleanup権限の終了を指す。通常利用向けcontextが消えたことだけで、正規回収証拠の消費をskipしない。

許可後は新private継続から正規root finishを一度呼び、移譲側firstまたはroot lifecycleFirstがnoneでない場合はretireFailedを明示的に一度呼ぶ。closeRequested／supplyFirstによる既存退役も確認する。CanonicalSupplyAssembly.finishを経由せず、旧discardPassesを増やさない。root finish後に失敗条件があるのにSnapshotを保持したまま正常終了へ落とすことは禁止。

結果軸はpayload_retired／payload_unconfirmed、root_not_started／root_finished／root_unconfirmed、Snapshotのretired／kept_readonly／unconfirmedを分ける。正常回収でreadonly Snapshotを残す既存方針は維持できるが、失敗／正規closeの退役条件を上書きしない。root finishが途中まで進んだ場合は実際のborrow／Snapshot保持を記録し、一括で未開始や完了へ補完しない。

TerminalSlotへpayload-freeな不変結果を一度固定し、その後の新入口close／finishはrootへ伝えず同結果を返す。これは将来の新入口の契約であり、旧factoryの終端後close挙動を変更するものではない。不変結果の構築自体が失敗する実OOMでは、先行mutable診断と保持責務を優先し、結果公開の必着はUnknownとする。

## 9 停止・理由・非出力

bind前closeは元ownerの同期close・必要なSnapshot退役へ、bind前failureは既存failへ伝える。ただし新しく捕捉したlocal参照やshellがあれば、その回収責務はRetentionRootが別に保持する。元ownerのclearが実施されたことだけで新ownerのR3〜R8が空になったとはみなさない。

bind後は正規controlの停止継続だけで通常利用を閉じる。生成失敗を扱う段階では、現行binding_mismatchだけの写像へread_prepare_unavailable系を追加する必要がある。元のsupplyFirst／lifecycleFirst／readFirst／readStop、上位first／stop、回収理由、root終端理由を別slotで保持し、後着close・二重回収・結果失敗で先行診断を上書きしない。

開始前closeはfirstを立てない、開始後closeは先行firstがなければsupply_closedという現行方針を維持する。回収開始は「新しい通常開始」ではなく、閉鎖／失敗後でも正規identityから実施できる。cleanupDispositionはresource未開始のままで、本文・digest・path全文・raw例外・private参照を診断へ出さない。

## 10 費目所有・有限上界

先行shell・各live cell・control分離・固定保持表・証拠／終端slotは移譲owner、既存source準備は元owner、root finish／borrow／Snapshot退役はroot lifecycleが所有する。回収の8群と各fieldの操作数を固定scheduleへ落とし、未導出Eへの後着課金・旧discardへの混算・退役の二重課金をしない。

construction／pending／failure／control live binding／回収claim／payload証拠／terminalは各最大1。回収開始・証拠発行／消費・root finish・明示retireFailedは各最大1。移譲の既存10event slotを維持し、回収の段階・8群確認は固定enum／bitとして管理する。要求回数に比例する診断listを作らない。

全CPU／heap／native費、各unit係数・実layout、全guard数・実E／S、constructor内部故障の完全捕捉、OOM時の診断必着はUnknown。Bのcap・D_stop900／D_end1000・guard131,524を変更して吸収しない。新段階では下位claim消費／pending通常payload記録／detach／holder公開・open／read／hash／resource cleanupは引き続き0とする。

## 11 独立合成受入条件（未実施）

| ID | 必須対照 |
|---|---|
| PC01 | unbound／boundの同construction・owner・source・claim・control・shellを各1項目だけ混入。copy／別root／summaryを拒否し、foreign rootを停止・退役させない |
| PC02 | 先行生成の各prefixへ故障注入。未生成／捕捉済み／捕捉未確認を区別し、部分shell・control・sourceを同RetentionRootが追跡。第2生成・再bindなし |
| PC03 | pending empty・関係okでもsource／issued／control経由に参照が残ればfinish拒否。現行controlや元claimを残す変異を検出 |
| PC04 | 8群・各fieldのcurrent／issued保持漏れを単独注入。aliasを消したこととpayload退役を区別し、群bitだけ偽装する変異も検出 |
| PC05 | 回収開始直前／直後・capture前後・各clear前後・空確認・証拠発行へclose／failure／再入を配置。試行≤1、権利復活・元slot復元なし |
| PC06 | custody未生成／capture失敗は元保持先を維持し、保持不明ならunconfirmed。根拠なく空・custody移譲済み・retiredへ補完する変異を検出 |
| PC07 | PayloadGoneEvidenceの未発行／copy／別owner／別root／再消費／失効／世代差を拒否。診断bitからの昇格や証拠消費前のroot finishを検出 |
| PC08 | 正常／close／binding／生成失敗の各root終端。root finish後の明示retireFailed漏れ、旧owner finish経由、borrow先行退役、Snapshot失敗退役漏れを検出。正常readonly Snapshot保持時もretired controlから通常利用・再bindできないことを確認 |
| PC09 | payload回収後・root終端途中の故障を分離。消したpayloadを復元せずroot_unconfirmedで保持し、反復finishで追加試行・成功化しない |
| PC10 | 独立の生成prefix／所有・寿命oracleで操作列と0／1を数え、旧discard計数0・下位claim0・holder公開0を確認。旧試験／compiled／梱包負対照・秘密非出力を維持 |

oracleは本体のslot表・clear関数・係数・proof builderをimportして期待値を作らない。正常経路だけでなく、狙う条件以外を整合した単独対照と有効基点を用意する。現行49件の新入口試験や既存の全体回帰成功を、未実装の回収・finishの代用にしない。

## 12 実装分割案と停止線

1. construction／RetentionRoot・unbound pending／failure shell・固定診断／結果slotと生成claimを合成依存で整備する。旧入口を維持し、payload移動・証拠発行・root finishはまだ閉じる。
2. 同source／controlへの一度限りbound化、payload-free core／retirable binding、正規SourceRootSlotと固定保持表を接続する。取り残すcontrol／claim aliasを単独対照で確認する。
3. unused／stoppedのまま固定回収・未確認保持とPayloadGoneEvidenceの発行／一度限り消費・root終端gateを接続する。正常／失敗Snapshot方針と計数を検証する。下位claimは0のまま。
4. PC01〜10・全失敗prefix・compiled変異・梱包を確認してから、別工程でtaking／pending記録／normal slot集約・detachの接続を検討する。holder公開・C実行はその工程でも閉じる。

本書では実装・合成試験・実費検証を行っていない。新しいfactory／exportの追加、source内部の配置変更、回収やfinishの起動も行わない。未確認事項を確認済みへ昇格させず、次の範囲は別依頼で確定する。
