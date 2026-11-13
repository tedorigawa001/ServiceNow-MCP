# WF-B：R-bのprivate供給・returned実field全照合・終端所有の接続差分

Version: draft-0.2 / Date: 2026-11-13 / 読み取り基準HEAD: `fe1e2484f41fdd4ad710071fd5bc32072604e9e1`。§15の準備限定実装基準HEAD: `3ab8caf`。

Status: **§15のprivate供給・最小安定検査抽出・実field入力化だけを合成準備として実装。運用継続からの呼出し・受理・終端routingは未接続。** [PC08 returned全体設計](BEST_PRACTICE_WFB_BODY_PIN_RETURNED_ACCEPT_SEAL_DESIGN.md)の§2／4／5と§7〜9を、R-a値契約・レビュー補強後の実装からの差分として具体化する。[C-c単一cache設計](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)の既存所有権は維持する。

正式発行口・既存C実行入口・body起動は閉鎖、全体受付は無効、Unknown、VM／監視／telemetry調査保留を維持する。§1〜14はdraft-0.1の将来契約／文書履歴、今回の限定実装は§15で区別する。実受理・G_R／G_A・C-03・body起動・実接続・実通信・実機操作・設定変更・Pushは行わない。

## 1 現状と変更しない境界

R-aの`createProbeBodyPinReturnedPreparationFake`はconstructor固定の準備modeで、source・frame・call・seal・cacheのない初期状態だけを直接確認し、原始codeで固定拒否する。先行4scalarにoperational writerはなく、pre／postの正例は値検査の対照である。レビュー補強`fe1e248`の初期owner単項破損・実slot投影・accepted状態拒否と、残る等価5節を維持する。実績は[R-a検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_RETURNED_PREPARATION_2026-11-13.md)であり、本書の受入実績に加算しない。

C-cの`prepareBodyPinFinalCaller`は、実call-result・同start・1call・最終marker・callee firstを最小分類した後、source失敗記録と`pin_return_not_connected`のsealへ進む。この**最初の失敗writerより前**に、fresh constructor固定のR-b専用分岐を設ける案とする。旧C-c／R-aのfactory・script・返答・export・拒否順を変更しない。R-aの拒否済みshellやC-cの失敗済みsource／seal／cacheを新modeへ切り替えない。

R-bは同一の正規構築鎖を合成依存で通す案であり、実sessionやruntimeの登録口ではない。公開boolean、任意callback、公開receipt、同値summary、外部object登録からR／S／Tを復元する入口は作らない。

## 2 private供給元・配置・先行順

R＝元`CanonicalGateDraftRoot`、S＝同Rが正規発行して保持するsource、T＝同Rの元`binding.target.start`、I／C／J＝Tのexpected-source issued／current／rejected実slotとする。

配置は既存package除外の`tests/review/fixtures/snapshot-read-composition-fake.ts`内。同classの固定継続と既存module-private `probeStartAccess`の限定読取りを使い、runtimeへfixture台帳・friend・新登録口を持ち込まない。新しい万能accessorや公開checkerは作らない。

| 順序 | 生成／供給と所有契約 |
|---|---|
| RB01 | 同constructorの固定mode・先行4scalar・既存failure／停止／cacheの原始slotを、部分構築より前に用意。新FailureOwner・source利用claim・終端cacheは確保しない |
| RB02 | 既存正規構築が元seed／binding／link／duty／control／exit／BS shellとTを保持。bindingOwnerとcellOwnerは別の正規関係を保つ |
| RB03 | 同RがSを1回生成・metadata固定化／確認。Sの元参照をRのissued/currentに保持し、元生成履歴BP00〜01を残す |
| RB04 | 同prepare・同public入場・同外側frameで既存BP02／固定call／callee最終postを実行。R-b用に第2source・trial・callを発行しない |
| RB05 | 元dispatchの実primitiveを既存call-resultへ代入した元callerが、同R内の固定private継続へS／Tを借用で渡す。callee完了の分類とreturnedの全照合は別に行う |

Sのcustodianを読んでRを探索しない。R自身と元保持slotを起点に供給する。private引数の型やbrandはコンパイル時の限定であって実行時来歴の証明ではなく、次節の参照・元生成関係の直接確認を省かない。追加の「資格object」を発行して値判定を能力へ昇格させない。

借用は元外側frame内だけ。SはR、I／C／JはTの既存保持責務に残り、検査用viewはその場限りの値である。viewや参照を返答／cache／外部台帳へ保存しない。検査後の借用スコープ退出と、Tの保持参照の退役／clearは別である。

## 3 同一性と読取り資格の固定順

| 順序 | 実照合 | 拒否時の制約 |
|---|---|---|
| 1 元R／mode | 呼出しが同constructor固定の元継続に属し、元public入場／prepareを所有する | foreign rootをclassへcastしてprivate fieldを読まない |
| 2 元S／T | Rのissued/currentが同S、root rejectedなし、Tが元binding.target.start | 比較対象のfield・getter・methodを呼ばず参照だけで拒否 |
| 3 元生成来歴 | source生成試行・metadata確認・build confirmed・fixedCount9・BP01履歴、同BS shell／failureと正規生成関係 | 公開metadataConfirmedやplain形状だけを根拠にしない |
| 4 元関係 | metadataのcustodian／construction／binding／link／duty／control／start／rootFailureとprivate brand、Tの元binding／cells／link／duty／exit | コピー・別ownerの同値関係・未知Proxyは不合格。相手slotへ診断を書かない |
| 5 固定構造 | 正規Sの22key、metadata9のreadonly descriptor、進行13のwritable descriptor、seal、元参照一致 | 同一性確認後の既知objectだけを有限反射。未知候補のownKeys／prototype／descriptor探索なし |
| 6 停止・既存状態 | R.closed／sourceStopRequested、S.stopRequested／first、T.first、root firstと元履歴 | 不正値をfalse／noneへ正規化せず拒否。先行理由を保持 |

この順序はpre／post／受理後guardと、sourceへ失敗・停止を書き込む直前の資格確認にも適用する。参照関係を確認できなくなった場合、最後の元参照を保持するが、それだけで現在の書込み資格を認めない。未知S／Tは無読取り・無書込みとし、信頼済みRの先行slotだけへ有限診断を残す。

## 4 calling専用条件からの最小共有

現行`bodyPinBridgeActive`はcallActive=true・root BP03 call before・source callを要求する。returnedで使うためのOR緩和や、`bodySourceDataMatches`のreceiver初期値／pin未到達条件の削除はしない。

必要ならSourceProvenance／BaseUnused／StorageEmpty／PayloadEmptyだけをprivateな固定検査へ最小抽出する。旧callingは旧順序・旧入力集合のまま同検査を組み合わせ、returnedは内側busy=false・外側frame=trueと実復帰履歴を独自に足す。共通化後も旧拒否理由・最初の失敗点・export・期限を不変とする。

BaseUnusedは元use／duty／grant・run seal／exit・body／capture未開始、StorageEmptyは同BS／failure・13carrier未開始・予約／call false・data3参照空、PayloadEmptyはTのbundle／draftのissued/current/rejected計6参照空・occupancy free・bindingState empty・bind prefix noneを確認する。returnedではI／Cが同Sを保持するため、I／Cまで空にする旧初期checkerを再使用しない。

## 5 実fieldからの値入力化と全照合

private owner検査とpure値検査は**両方必須**。R-aの期待表は比較の右辺だけとする。`BODY_PIN_RETURNED_ROOT_FIXED`等のspreadやliteral accepted／trueを入力へ埋めて期待値を証拠にしない。公開inspect／summary・以前の値viewを再入力せず、各固定点で元fieldから取り直す。

| 値区分 | 実供給元／項目 | owner側で別に確認する事実 |
|---|---|---|
| state 4 | Rのreturned phase／postChecked／point／failurePoint原値 | 同元継続の開始消費と単調履歴 |
| source 13 | 同Sのstate・claim・pinCallReached・bindCallReached・stopRequested・postConfirmed・phase・boundary・first・failurePhase・failureBoundary・refusal・deliveryFirst | 元発行参照・metadata9・22key属性と生成履歴 |
| receiver 14 | 同TのattemptUsed・stage・I/C/J在否・I=S／C=S・step・failureStep・first・failurePhase・failurePrefix・failureBoundary・refusal | I=C=S／J不在を実参照から直接確認。同値copyのbooleanは受け付けない |
| root 31 | 下表の29固定事実とrouteStep／routeBoundary原値 | 同frame／public入場・元R/S/T・既存診断slotの所有関係 |
| callee 6 | 同Tのstorage boundary・rejected hold・reference／checked／confirmed／final post原値 | 正規同Tのprivate accessorによる読取り。markerだけでは受理不可 |

root31項目の供給を次のように固定する。下の項目名はR-a値契約のkeyであり、新たな公開fieldではない。

| 項目群 | private実供給 |
|---|---|
| stopped／first | R.closedとsourceStopRequestedを各々厳密検査した停止状態、および元failure.first。片方だけの停止も拒否し、不正booleanを`=== true`によるfalseへ隠さない |
| frameActive／ready／publicBusy／rootExit | R.frame／ready／finalPublicEntryBusy／finalRootEntryExit原値 |
| calls／result／callPhase／callActive／entryBusy | fixedCalls／実call-result／callPhase／callActive、同T.entryBusy。数やprimitiveを最終markerから推定しない |
| classification／completion | 元実primitiveから記録したconfirmationClassification／finalCompletion |
| routeAttempted／routeState／routePhase／routeStep／routeBoundary | 元pin routeの各原始slot。pre／postの期待位置を入力へ注入しない |
| failureRecorded／sourceReason／diagnosticRecorded | 元pin failureRecorded／callSourceReason／confirmationDiagnosticRecorded |
| preparingConfirmed／pinPostChecked | 元BP04専用2flag。returnedPostCheckedとは別 |
| terminalSealed／replyAttempted／replyPhase／terminalDisposition／cacheRetained | 元final診断／返答状態と`#fixed !== undefined`。第2cacheの不在で代用しない |
| finalFailurePoint／prepared／stagesChecked | callee最終観測失敗の元slot、元confirmation準備／段階post履歴 |

入力objectの生成・pure checkerのthrowも失敗として扱う。失敗writerより前のview生成に失敗したら、追加のview・位置object・Error診断を作らず、信頼済み原始slotで現在prefixを記録する。出力用のallowlist／strict boolean投影と、検査入力の原値保持を混同しない。

## 6 pre／post／受理後の固定接続

[親設計§5〜6](BEST_PRACTICE_WFB_BODY_PIN_RETURNED_ACCEPT_SEAL_DESIGN.md)のR08-01〜09を変更せず、所有と供給を次の三段に限定する。

| 境界 | private実条件と後続 |
|---|---|
| returned開始前 | 実primitiveが元slotへ戻り、1call／同T／最終marker／firstからcompletionを分類。同R/S/T資格・停止なし・first none・phase not_startedを確認してのみchecking／preへ一度進む |
| pre | root BP03 call after・source initializing／unused／BP03 call、内側callActive／T.entryBusy=false、外側frame／publicBusy=true・rootExit not_observed。§3〜5と全元履歴を検査しpure preへ渡す |
| G_Rの前提と結果 | pre成功直後の3直接代入だけ：root step returned→root boundary before→S.boundary after。実装は別承認。位置記録であって受理ではない |
| post | 同資格・停止・全fieldを再読し、root returned before・source BP03 after・point postでpure postを検査。pre viewの再利用なし |
| G_Aの前提と結果 | post成功直後の3直接代入だけ：root boundary after→returnedPostChecked true→phase accepted。実装は別承認。最後の代入が論理受理点 |
| accepted後 | checking専用postを流用せず、accepted専用guardで同資格・停止なし・全安定・post=trueを照合。C-03未接続の固定終端へ進み、BP04へは進めない |

guard成功から各固定群の末尾までchecker／hook／観測／通知／clock／projection／allocation／await／finallyを介在させない。群途中の故障scriptは正規イベントにせず、compiled局所破損で拒否と未補完を確認する。JSのOOM／process停止に対する物理atomicityはUnknown。

第2開始・再入・失敗後の再prepareではclaimを戻さず元prefixを維持する。accepted前失敗はidentity／pre／postの元点とpost=false、受理後の実失敗はblocked点・post=true、正常なC-03未接続停止はblocked・post=true・failurePoint noneとする。開始前closeは開始履歴を作らず元閉鎖終端へ合流する。

## 7 同期停止と元callerへの合流

closeはcache短絡より先にR.closedとsourceStopRequestedを単調に記録する。同Sの書込み資格を再確認できる場合だけS.stopRequestedへ同期反映する。T.close／clear／Journal／回収を呼ばず、callee first・Jを新設しない。

同public入場又は外側frame活動中のclose／入力拒否／先行失敗は、元slotへの先行理由・実位置の非割当て記録だけ。再入へは既存非終端通知を返し、元callerに代わってseal／materializeしない。元継続が実call結果と到達prefixを確認し、固定失敗出口へ合流する。root-only close、source-only stop、先行firstのみのいずれも次guardで停止する。

ここで活動中として拒否するのは、**先行入場を所有しない後発要求**である。元caller自身は同publicBusy=trueのまま終端を所有できる。非活動時のcloseが自分の入場を予約した後、そのbusyを再入と誤認して終端を放棄しない。元callerを失うthrowで合流できなければ、確認済みの診断・seal／attempt原値と保持参照を残して公開を拒否する。未実施のsealや生成attemptを配送失敗の表示に合わせて補完しない。

失敗は先行root firstを保持する。sourceへの入力拒否写像はstate_invalid、rootはinput_rejectedを保持する。sourceのreceiver_unconfirmed／post_unconfirmedが先行する場合は元source値・位置を維持しrootへconstruction_unconfirmedと写像する。binding_mismatch／state_invalid／closed／検査throwの分類は親§7に従い、後発理由で初回理由を上書きしない。

## 8 失敗prefixと参照保持責務

| 失敗位置 | 到達事実・診断 | 元参照／未確認責務 |
|---|---|---|
| source生成前／部分生成 | 既存BP00〜01診断を保持。returnedの位置を捏造しない | Rの生成済みshell／fieldを保持。未生成をclear済みと扱わない |
| primitive未復帰／finally未確認 | result none又はbusy残留・call beforeを保持、PC08開始なし | Rが元S／Tを保持。最終marker trueでも復帰を補完しない |
| identity拒否 | 信頼済みRへbinding_mismatchと元位置。開始前失敗の履歴だけ | foreign参照は探索せず書かない。元S／Tの保持は解除しない |
| pre／G_R前 | root call after・S failureBoundary call、post=false | TのI/C/J・confirmed・markerを保持。S.afterを先取りしない |
| G_R後のpost失敗 | root returned before・S failureBoundary after、post=false | G_Rをrollbackせず、I/Cをclear・再pin・Jへ移動しない |
| G_A後の実停止／失敗 | root returned after・S after、phase failed／post=true | 受理到達を維持。失敗でnot_startedへ戻さない |
| 正常C-03未接続停止 | construction_unconfirmed、phase blocked／post=true／failurePoint none | S failed／claim unused、T confirmed／first none。BP04・bind・body未開始 |
| source資格喪失 | Rの元位置・信頼喪失を有限記録、root-onlyで停止 | 未確認S／Tを読まず書かず元参照を保持。診断用の修復・再発行なし |

returned失敗をTのcallee失敗にcopyしない。callee最終failurePointとreturnedFailurePoint、source生成診断BP01とpin現在位置は別である。既存confirmation失敗mapperはBP03 callだけを有効位置としているため、そのままreturnedで呼んで位置noneへ落とさない。R-b専用の非割当て記録経路を元診断slotへ合流させ、既存calling mapperの入力集合は拡大しない。

元SはR、TのI/C/J・局所保持はTの責務のまま。固定未接続停止や失敗を、利用claim消費・借用退役・本文破棄・cleanup確認・root終端成功へ昇格しない。不足する解放証拠はUnknown。新FailureOwnerへ責務を移したことにして元slotを消さない。

## 9 診断seal・単一cache・公開の三境界

seal ownerは同public入場に属する元callerの固定失敗／C-03未接続終端だけ。G_A・inner busy解除・pure成功はseal資格ではない。順序は、実prefix確定→初回理由／caller位置／sourceReason保持→資格を持つ元Sの失敗記録→terminal disposition→seal。診断が未確定のまま終端objectを割り当てない。

新modeのstrict10終端案は親§9を再利用し、model=`wfb-body-pin-returned-1`、通常未接続disposition=`pin_prepare_not_connected`とする。後者はaccepted後の固定境界だけで選び、closed／state_invalid／先行失敗には使わない。旧C-cのmodel／`pin_return_not_connected`は不変。source claim unused／BP04未開始を変えず、ok=false・authority none・execution／formalIssuance closed・wholeRunAdmission disabled・implementation unknown・investigations on_holdを保つ。

| 終端段階 | 所有・一度限り・失敗責務 |
|---|---|
| 診断seal前 | 元callerが先行診断と保持参照を所有。active close等は記録だけ、二重sealなし |
| seal後／生成前 | seal済み診断はfirst noneも含め不変。同Rの既存replyAttemptedを先行消費しmaterializingへ。生成／freeze失敗はfailed_empty・delivery view_unconfirmed、cache空でも再生成不可 |
| cache保持 | mode固定literalの候補を検査／freeze後、既存G_Cで同`#fixed`へ保持→private_cached。第2cache・accepted object・任意候補採用なし |
| 外側復帰 | 元prepareの実復帰でrootEntryExit returned、frame=false、publicBusy=true、実result===元#fixed、sealed／attempted／private_cachedを全確認してのみ公開群へ |
| 公開／再読 | publicBusy=false→replayable→同#fixedを返す。外側finally／公開失敗はfailed_cached、元objectを保持し再公開・再生成しない。replayableの再読だけ同objectを返す |

materializerが返しただけでは外側frameの実退出ではない。公開guardの直後にhook／allocationを挟まない。後発closeは停止を先に反映し、確定診断／cacheを変更しない。生成失敗・外側throw・不正result・再入はdelivery軸で保持し、操作診断やcallee firstへ逆流させない。seal済み失敗rootをC-03へ再開しない。

## 10 writer／readerの閉鎖routing

新modeの分岐を診断／materializerより前に固定し、既存`bodyPinFinalEntry`系の同slot・同公開guardへ限定合流する案とする。保持枠の共用と、旧modelの入力集合拡大は別であり、旧typed materializerへ新dispositionをcastして通さない。

| 入口／出口 | R-bの固定責務 |
|---|---|
| prepareの早期拒否／catch | source生成前・BP02・calling中は元単一所有経路。returned以後は専用prefix記録。どのcatchも第2reply writerへ落ちない |
| 元callee復帰caller | C-cの失敗／seal writerより前で固定分岐。旧C-cは変更せず、R-bだけ§3〜9へ |
| fail／close／input／inspectへの余分入力 | 新modeと活動区間を先に分類。activeは記録だけ、seal後はdeliveryだけ。allocatingな旧mapperへ迂回しない |
| terminal／materialize | seal ownerから最大1回。既存#fixedだけをwrite、型・schemaはmode別strict。返信生成失敗は再試行なし |
| public wrapper／check／checkLegacy／再読 | 実外側復帰・元cache同参照・公開phaseを照合。初期not_ready等は非終端固定通知でcacheに入れない |
| inspect／projection | 有限allowlist・strict boolean・frozen plainの診断値だけ。raw参照／brand／Error／message／stack／causeを出さず、能力の再入力に使わない |

新modeから旧`#bodyPinConfirmationFixed`等のmode別cache、`reply()`の`#fixed ??=`、公開契約だけのseal helperへ流れないことをwriter／reader監査で確認する。旧経路に存在するwriterは撤去せず、R-bで未到達であることを実対照で確かめる。

## 11 費目所有と未確認範囲

費目ownerは同R／元frame。新mode分岐、先行4scalarの実writer、private資格・metadata22key／descriptor・元関係・13carrier／参照の有限照合、5区分68項目（4+13+14+31+6）の値入力化とpure比較、pre／post／accepted後guard、同期停止・prefix診断・seal、単一cache生成／公開／有限projectionを費目へ明示する。項目数は処理回数・guard総数・unit係数ではない。

元source・BS／claim／duty／trial／call・最終marker・#fixedを二重確保／二重計上しない。view構築、descriptor走査、freeze、通知・返答が物理allocation 0とはしない。失敗後は追加の検査viewを作らず先行scalarへ記録し、生成失敗時の未回収物も保持責務から外さない。

新clock・UTC・deadline・残時間再計算・本番cap・実会計更新はなし。実E／S要求量、全体work上界、unit、layout／GC／OOM、停止後の解消予約、診断必着・cleanup・借用退役はUnknown。保持やfail-closedの事実だけで受付を有効化しない。

## 12 独立合成・compiled受入条件（すべて将来条件）

| ID | 必須条件 |
|---|---|
| RBV01 | fresh固定mode／同生成順だけを通す。拒否済みR-a・failed／sealed C-c・cache・公開summaryからの再開0、旧factory挙動／期待値／export／期限不変 |
| RBV02 | R/S/T、metadata・binding／cells／link／duty／control／exit／failure、I/C/Jを1参照ずつ混入・copy・Proxy化。未知hook／相手書込み0、値viewを正常偽装しても実参照照合で拒否 |
| RBV03 | root31・callee6・source13・receiver14・state4を実slot単項破損し、入力builderの当該field省略／固定値化を検出。失敗を別guardの偶然で数えない |
| RBV04 | inner busy2個false／outer frameとpublicBusy true／rootExit未確認を独立対照。実primitive・calls・marker・first・classificationを別々に破損し未復帰を補完しない |
| RBV05 | preのcall/after／S.call、postのreturned/before／S.afterを独立位置oracleで検査。pure成功だけ・古いview・期待表copyでは進まない |
| RBV06 | R08固定順とG_R／G_A各3代入・guard後非介在をAST確認。単項guard除去・群部分破損・修復禁止をcompiled対照。実装承認前は実行しない |
| RBV07 | 各合法観測点のthrow／close／input／再入、root-only stop／source-only stop／先行first、資格喪失を独立event oracleで予測。元参照・未実施suffix・最初の位置を確認 |
| RBV08 | pre／post失敗と受理後失敗／正常未接続停止を区別。post=true保持、source.failureBoundary call/after、T.first／生成BP01履歴不変、claim／bind／body未開始を実fieldで確認 |
| RBV09 | active要求ではseal／attempt／cache 0。元callerだけが終端化。入力拒否写像、source先行理由、callee／delivery軸の非混同を独立対照 |
| RBV10 | source生成前・部分生成・calling・returned各失敗を同終端へ。materialize／freeze前後失敗、cache保持後throw、誤result／外側未退出をfailed_empty／failed_cachedへ分離。再生成／再公開0 |
| RBV11 | 全writer／reader・checkLegacy・後発close・inspect入力を監査。cache writer1系統・生成試行最大1・再読===同object、strict10／非echo／fixture梱包混入0 |
| RBV12 | semantic compile-failでprivate継続・field更新・raw参照供給・不正状態組・旧modeへの新disposition・summaryからの能力復元を拒否 |
| RBV13 | R-a等価5節・C-c等価31節と旧C-a/b判断を新経路で再評価。根拠を節別に記録し、到達不能だったbinding_mismatch写像等を自動継承しない |

oracleは実装のbuilder／checker／期待表／counterをimportせず、有限な意味eventと独自の項目表から期待prefix・位置・軸・保持物を計算する。型／構文エラーや注入anchor不一致を目的節の検出へ加算しない。旧試験は残し、値検査保証・実owner保証・compiled局所保証を分ける。

## 13 別承認後の実装順と閉鎖境界

先にprivate供給／最小安定検査抽出・実field入力化の内部境界を準備し、旧calling互換と拒否を検証する。次に同callerの開始・pre／post全照合と診断／cache routingを、親R08全体の受入条件がそろう範囲で一体接続する。準備段階の値成功を受理と公表せず、G_Aだけの部分有効化や未sealのC-03素通しをしない。

R-b実装の承認も合成依存までで、C-03・実session／source差替え・実worker／runtime・実通信・正式発行・全体受付を含まない。各段階でテスト・compiled保証・CHANGELOG・設計／検証記録・梱包監査を更新し、実装範囲／未接続範囲と新しい等価判断を分離する。

## 14 今回の文書変更と検証

開始時HEADは冒頭の`fe1e248`、worktree／indexはclean。今回は本書と親2文書の参照／版だけを更新し、既存の§1以降の本文・レビューは全byte保持する。ソース・試験・compiled・CHANGELOG・設定／manifest／lockfileは編集しない。

検証対象はローカルリンク・表列数・節順・RB01〜05／RBV01〜13の一意順序、親本文保持、差分範囲・HEAD／indexと行末整合。build・合成／compiled試験・梱包・再採取・保管操作・index登録・コミット・Pushは行わない。文書整合はR-b実装／受理／cleanupの成功証拠ではない。

文書検証結果：Markdown3件のローカル参照25件、表34個の列数、節順（本書14・親17／23）、契約ID18件の一意順序に異常なし。親2文書の既存§1以降の本文・レビュー全byte保持、変更範囲が当該MD3件だけ、基準HEAD不変・index空とdiff --checkを確認した。これは文書だけの検証で、RBV条件は未実施である。

## 15 R-b準備限定のprivate読取り境界（2026-11-13）

既存package除外classへprivateな3methodだけを追加した。`bodyPinStableStorageMatches`はBaseUnused→StorageEmpty→PayloadEmptyの既存3呼出しを同じ短絡順で包み、`bodyPinStartContextMatches`の末尾だけを置換する。SourceProvenanceは既存`bodyPinProvenanceMatches`をそのまま再利用し、calling専用matcherをORで拡張しない。既存400method本文は不変、変更する既存methodはこの末尾抽出1件だけである。

`bodyPinReturnedSupplyMatches`は同R/S/Tを参照だけで先に照合し、元bridge関係・source生成確認／metadata・同start文脈／安定検査、BP01生成履歴・停止／first、実I/C=S／J空を確認する。`bodyPinReturnedInput`は成功時だけ同fieldから5区分68項目を作るreadonlyな内部境界であり、受理証拠ではない。資格拒否はundefined、検査／確保throwはそのまま元継続へ伝わり、この準備method自身は失敗診断・source・cacheを更新しない。終端合流は§7〜10の未接続課題である。

今回は新R-b factory／modeを発行しない。正規来歴の正例には**scratch内だけ**で既存C-cの実復帰・completion分類後／失敗writer前に観測を挿入する。同private生成鎖の実fieldを読む試験であり、元fixtureには`bodyPinReturnedInput`のcall siteが0、returned4scalarのoperational writerも0である。実stateはnot_started／point none／post=falseのままなので、R-aのchecking専用pre／post入力として受理できない。C-cは従来どおりpin_return_not_connectedへ失敗／sealし、R-aも初期拒否のままである。

全68項目の独立literal oracle、root40・source13・receiver20の単項変更、foreign／copy／Proxy5件・hook0、実I/C不一致を正常値viewで隠す対照、private3methodのsemantic拒否をcompiledで確認した。試験用のslot操作／捕捉変数／追加accessorはscratch生成物にだけ存在し、元factory・export・受領口へ追加しない。型検査・回帰・初回の試験側不備と梱包制約は[準備境界検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_RETURNED_SUPPLY_2026-11-13.md)へ分離する。

RBV全体、同owner開始claim・pre／post全照合の運用呼出し、G_R／G_A、accepted後guard、R-b診断seal／単一cache、新mode終端・C-03は未実装／未接続。不足証拠・費目上界・cleanupはUnknownで、§1〜14の将来契約を実績へ読み替えない。
