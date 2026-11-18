# JR-B固定検査台帳・有限失敗IDと拒否確定前scanの差分詳細設計

Version: native-diagnostic-jrb-field-admission-scan-draft-0.3 / Date: 2026-11-18。
Status: §9の有限ID・固定schema・先行scalar／guardの閉鎖値契約だけを合成依存限定で実装。値契約の実装基準HEADは`a81534a`、draft-0.1の設計基準HEADは`08e646a`。[pre-call設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_PRECALL_ADMISSION_ALIAS_DELTA_DESIGN.md)PS／PF／PR／PCと§9、[先行拒否の検証記録](E2E_BEST_PRACTICE_NATIVE_JOIN_PRECALL_2026-11-18.md)への差分である。8scalar・最小3fieldのfailure反映や今回のschema照会を、全field受付が実装済みであるとは扱わない。

draft-0.3のレビュー修正：レビュー修正の基準HEADは`cd01d73`（修正時のHEADは`cd01d73`）。同コミットで追加された後続の入場・tail設計を参照する文書がなかったため、§8の後続単位の段落から[入場・tail設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_SCAN_ENTRY_TAIL_DELTA_DESIGN.md)への逆参照を追加した。§9の閉鎖値契約・実装・試験は変更していない。

draft-0.1では、別作業の補強試験・親文書更新8fileを別コミット`d147d18`のまま保持して本書だけを追加した。親設計のalias数・ownKeys容量に関する補足は§4・§7のまま維持する。draft-0.2では§9に明記した限定実装・検証とCHANGELOGを更新し、既存の先行拒否試験・実装を変更しない。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択・AP01〜06未承認を維持する。§9の閉鎖値契約・合成検証以外は進めず、scan実行・全field受付・Promise生成・alias供給・closure呼出し・private公開・dispatch・実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行わない。

## 1 現行との違い・確定点

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のrequestJoinPrecallは、raw参照照合直後にownerまたはcomposition拒否を記録し、primary／revokedを確定してから最小slotを調べる。従って、その後へ全field検査を追加すると、未使用・停止条件の検査が自分の拒否書込みを読むことになる。新scanは拒否確定前へ置き、次の3区間を分ける。

| ID | 区間 | 変更可能なもの・不変条件 |
|---|---|---|
| FS01 | 一度限り入場・同owner照合 | 当該attempted／busyとscan専用scalarだけ。rawのpropertyを読まず、constructor／entry claim・通常fieldは変えない |
| FS02 | 拒否未確定のowner field scan | 初回check／codeはnullのまま。成功した各局所検査を次の固定検査へ使うだけで、ready／ticket／新bindingを返さない |
| FS03 | 最初の拒否確定→固定failure tail | 不正・再入・例外はその時点で最初のID／codeを保持し、空の場合だけ元primary、同期revoked。全通過でも最後にcomposition／invalid_stateで拒否する |

FS02の完了は局所layout一致であり、停止／live pin・元期限の資格ではない。PG01〜08の観測／固定終端構成も不足しているので、今回の後続実装単位でも入口の返却型はfalse、constructor call 0、製品caller 0を維持する。既存の閉鎖requestを新しい成功入口に変えない。

## 2 同owner・先行scalar・借用元

固定roleは同creatorのprivate継続から供給し、raw.kindやslot.roleから選ばない。recovery／joinRecovery・同roleのshell／identity／pin／slotはlexical期待参照を使う。foreign・同値copy・Proxyをraw側で採用せず、先行参照比較の失敗はdescriptor 0のowner拒否とする。ここでの0はscanの取得数であり、その後のfailure tailの最大5descriptorとは分ける。

現行8scalarは維持し、将来のscan用として次を先行配置する。今回のMD作成で追加した実fieldではない。

| ID | 配置・最小値域 | 責務 |
|---|---|---|
| SL01 | 同root共有のscanOwner＝none／run／cleanup | scanとそのfailure tailを外側1frameだけが所有する。既存role別busyを置き換えず、別ownerと共有しない |
| SL02 | 同root共有のscanInterrupted＝false／true | scanOwnerがある間の同role／別role再入を不可逆に通知。外側の次のguardで通常scanを止め、内側からfailure helperを呼ばない |
| SL03 | role別scanEffectAttempts＝0〜291／307 | scanで実際に試みた捕捉済みnative操作を呼出し直前に加算。throwも1。数を条件復旧・失敗・finallyで戻さない |
| SL04 | role別scanLastCompleted＝0〜291／307 | 局所条件とpost-guardまで正常に終えたprefixのeffect位置。attempts以下。途中結果を完了済みに繰り上げない |

追加は共有2＋role別2×2＝6scalar、現行8と合わせて14scalarである。第二primary・Map・可変trace・診断objectを作らない。SL01／02はその所有frameだけが取得・退出管理する。SL03／04は同roleの最初の試行だけで初期化し、失敗後も保持する。localには固定role・現在の有限ID・1個のdescriptorまたはkey配列、後述のreadonly借用参照とentry時のlexical停止値だけを置く。

共有scalarの初期値はnone／false。新たな適格outer frameだけが、scanOwner=noneと自身の拒否履歴なしを確認してscanInterruptedをfalseへ初期化し、所有を取得する。退出時はownerをnoneへ戻すが、既存のrole別理由・計数を消さない。次の別roleの初回試行で共有中断bitを初期化することも、以前の拒否を取り消す意味にはしない。

同rootでscanOwnerがある間の再入は、requested roleのbusy拒否を原始記録し、scanInterrupted=trueにする。requested roleのattemptedがまだfalseでも、残ったcheck／codeにより後日の新scanを禁止する。既存診断のある他roleが再入してもSL02が必ず変わるので、primary／revokedが既に同じ値であることから再入を見逃さない。inner frameは共有owner・外側busy・進行位置を解除しない。

cleanupのrecordはentry時のcurrent実参照をlocalに借用する。contextは同じ凍結identityの資格化済みcontext descriptorからだけ借用し、context.recordをそのcurrentと照合し、context.anchorを同record.anchorと照合する。shell.context／contextRecord／contextAnchorとも一致させる。mutable shellやcurrent.anchorの直接読取りから新しい期待値を再pinしない。readonly identityの既存private生成元を前提とし、raw context／record／anchorの採用口や新しいissuerを作らない。

## 3 固定node・field台帳

nodeごとに、非Proxy確認→必要な直接prototype確認→exact対象のownKeys照合→必要な凍結確認→D01以降の順で進む。各取得前後に§5のguardを置く。subset対象は正規object全体のkey数をこの部分表から推定せず、列挙しない。表の番号はschema位置であり、runtimeでkeyからIDを組み立てる規則ではない。

Nxx.proxy siteでは、まず必要な参照の存在とtypeofを原始比較する。N17〜19はfunction、その他は非null objectを要求し、primitiveをdescriptor／ownKeysへ渡さない。その後に捕捉済み非Proxy確認を行う。typeof等はnode別の比較予約に含め、native操作を増やさない。

| node | 対象・保持元 | D01からの固定field順 | key集合／追加検査 |
|---|---|---|---|
| N01 | 同shell期待参照 | recovery, root, seed, kind, contextRecord, contextAnchor, context, identity, pin, pinState, pinFault, handlersClaim, handlersBusy, handlersState, handlersDetail, handlersFault, executorHandler, fulfilledHandler, rejectedHandler, observerArgs, readiness, retention, constructorClaim, constructorState, executorEntryClaim, executor, resolve, reject, candidateHeld, candidateSafety, candidate, work, registrationWork, registrationReached, observerClaim, observerState, observerBusy, ackHeld, ackState, observerAckCandidate, observerAck, callbackClaim, callbackState, callbackFault, observed, terminal, failureDrainClaim, failureDrainState, drainKind, upperRecordAttempted, upperRecordState, notifyAttempted, notifyState, copyAttempted, copyHeld, runCopyState, terminalCopy, rejectPayloadAttempted, rejectPayloadState, rejectPayload, settleClaim, settleState, ackTerminal, dispatchStarted, entered | exact65、D01〜65 |
| N02 | 同role slot | role, claimed, phase, position, fault, pending, published, faultAt | exact8、D01〜08 |
| N03 | 同RecoveryAnchor | notified, status, runGeneration, cleanupGeneration, preparation | subset5、D01〜05 |
| N04 | 同controlPreparation | origin, root, run, duty, runJoin, cleanupJoin | exact6、D01〜06 |
| N05 | 同controlRoot | origin, binding, upper, writer | exact4・凍結、D01〜04 |
| N06 | 同controlRun | root, join, window, attempt, record, startClaimed | exact6・凍結、D01〜06 |
| N07 | 同controlDuty | root, run, join, anchor, record, readerIdentity, retention | exact7・凍結、D01〜07 |
| N08 | 同runJoin | root, kind, work, resolver, dispatchStarted, entered, settled | exact7・凍結、D01〜07 |
| N09 | 同cleanupJoin | root, kind, work, resolver, dispatchStarted, entered, settled | exact7・凍結、D01〜07 |
| N10 | 同identity期待参照 | recovery, root, seed, kind, context | exact5・凍結、D01〜05 |
| N11 | 同pin期待参照 | runtime, identity, basis | exact3・凍結、D01〜03 |
| N12 | N10から借りたcleanup context | record, anchor | cleanupだけ、exact2・凍結、D01〜02 |
| N13 | entry currentと同じrecord | anchor, cleanupWork | cleanupだけ、subset2、D01〜02 |
| N14 | N12／13が一致するanchor | binding | cleanupだけ、subset1・凍結、D01 |
| N15 | 同roleの固定args期待参照 | 0, 1, length | exact3・凍結・直接Array prototype、D01〜03 |
| N16 | 同controlOrigin | fieldなし | exact0・凍結・直接null prototype |
| N17 | 同roleのexecutor期待参照 | fieldなし | typeof function・非Proxyだけ。name／length／本文を読まない |
| N18 | 同roleのfulfilled期待参照 | fieldなし | typeof function・非Proxy、N17と別参照 |
| N19 | 同roleのrejected期待参照 | fieldなし | typeof function・非Proxy、N17／18と別参照 |

descriptorの固定順は親PF台帳を展開した順であり、Objectの実際の挿入順と同一であることは要求しない。exact集合の照合ではsort／dedupしない。正常長Kを確認してから固定K範囲だけを走査し、各keyのstring型・固定許可集合への所属・既出keyとの不一致を確認する。native ownKeysは重複を返さないが、独立oracleでも集合の重複を同じkeyとして救済しない。Symbol・余分・欠落は当該node.keysで拒否する。

N01／02とN03.notifiedはown data・writable／enumerable／configurable=true。N01の値は親設計の準備済みhandlers_ready seedと実行未使用値、N02はclaimed=true・building／handlers・pending=同shell・published=null・fault／faultAt=nullである。notifiedはbooleanで、trueをfalseへ戻さない。N04も既存mutable配置の属性を維持する。凍結nodeはown data・writable=false・configurable=false、元のenumerable値を確認し、N15.lengthだけenumerable=falseとする。

N03の残り4fieldとN13は既存mutable配置、N14は凍結配置に照合する。N13.cleanupWorkだけはown descriptor欠落またはown data undefinedを許す。継承getterを読まず、既存work・別Promise・任意thenableを採用しない。欠落の1probeを省略しない。通常fieldのmissingは許容しない。

各field値は親PF／PRの期待literalまたは既存lexical実参照と比較する。readonly templateのnull／false／undefined／emptyを維持し、context／record／anchorの一致とclosure／tuple順を個別に確認する。descriptor.valueを得ること自体を期待参照の発行とせず、借用可能なのは§2で指定した既存immutable生成経路だけである。

実行順はN16→N03→N04→N05→N06→N07→N08→N09→N10→N11→〔cleanupだけN12→N13→N14〕→N17→N18→N19→N15→N02→N01と固定する。後段期待値に必要なreadonly借用を先に資格化し、未確認canonical fieldを読むsamePreparedControl／origin leaf／旧postを途中で呼ばない。

## 4 有限失敗ID・理由・最初の拒否

| ID群 | 有限集合・個数 | 意味 |
|---|---|---|
| FI01 | 既存busy／attempted／owner／composition／control＝5 | 既存診断語彙を維持。正常scan終了後のcompositionも拒否である |
| FI02 | 表N01〜19のNxx.Dyy＝131 | 当該fieldの取得・own data／属性・値関係の失敗。表の有効な組だけを将来literal unionへ展開する |
| FI03 | Nxx.proxy＝19 | 各owner nodeの非Proxy前提。不適格objectのpropertyへ進まない |
| FI04 | exact対象Nxx.keys＝13 | ownKeys取得・長さ・string／所属／重複検査 |
| FI05 | 凍結対象Nxx.frozen＝11 | 捕捉済みisFrozenの確認 |
| FI06 | N15.proto／N16.proto＝2 | 直接prototypeの確認 |
| FI07 | A01〜07＝7 | 同roleの7aliasのnull固定確認。role別の別slotに記録する |
| FI08 | scan_interrupted／scan_state／scan_counter／scan_context＝4 | 共有再入・所属frame不整合・計数違反・借用の不成立 |

計192個を上限とする。N12〜14はrunでは到達しないが、型の集合には含む。Nxx.Dyyは表の略記であり、正規表現・任意prefix・外部number／stringを受けるAPIではない。source変更でfieldが増減したら、独立台帳・ID集合・費目oracleのdriftとして止め、自動登録しない。

この段階のalias検査は同roleの7個だけ。物理配置は全体14個、将来可変にする候補はrun7＋cleanup4、cleanupの残り3個はconst nullである。親PC03の「14alias」は全rootの配置数を指し、cleanup試行が他roleの取得値を再検査・消去する意味ではない。今回alias供給は行わない。

局所schema・属性・seed値の不整合はinvalid_state、正規node間のorigin／role／参照結合の不一致はevidence_binding_mismatch、捕捉済み操作のthrowはinternal_review_errorとする。例外時もIDは事前に置いた当該siteの定数を使い、message／stack・任意pathを作らない。内側で先にbusy拒否が記録されれば、そのID／codeを外側のfield失敗・例外・compositionで上書きしない。先行HTTP／取消等のprimaryも保持する。

制御IDのcodeは固定する。busy／attempted／composition／scan_interruptedはinvalid_state、owner／scan_contextはevidence_binding_mismatch、control／scan_state／scan_counterはinternal_review_error。これらは最初の局所codeの分類であり、先行する元primaryのcodeを置き換える規則ではない。

## 5 拒否確定前のschedule・再入停止

| ID | 固定操作・確定点 | 失敗・再入時 |
|---|---|---|
| SQ01 | 固定roleと共有scanOwnerを確認 | 他frameがあればSL02を立て、原始busy拒否だけ。descriptor／failure helper／inner finallyによる解除0 |
| SQ02 | 当該attempted／busyとcheck／code=nullを確認→初回claim | 拒否履歴だけがありattempted=falseの場合も再開しない。成功時だけ共有owner・own busyを所有 |
| SQ03 | raw4参照と元recoveryをlexical照合、current等をentry借用 | foreignのproperty 0。不成立はowner拒否→固定tail。current.anchorを直接読まない |
| SQ04 | 現在の有限IDを設定→pre-guard→effect計数加算→固定操作 | 上限・型不整合は呼出し前に拒否。throwでも試行数を戻さない |
| SQ05 | 操作復帰→post-guard→結果／局所値を検査→lastCompleted更新 | 再入・停止変化があれば、返ったdescriptor／keysを通常検査へ使う前に止める。結果の正常性で再入を打ち消さない |
| SQ06 | 固定node列→A01〜07→最後のguard | check／codeがnullのままでもlayout一致に過ぎず、まだ成功返却しない |
| SQ07 | composition拒否または既存の最初の拒否→固定tailを最大1回 | 生成構成不足を先に記録してscanを自己失効させない。catchでtailを再試行しない |
| SQ08 | 外側finallyで一時descriptor／keysとlocal借用を退役→共有owner／own busyを解除 | own attempted・理由・計数・lastCompletedは保持。innerは解除しない。元slot／shell／identity／pinをnullにしない |

scan guardは共有owner=当該role、interrupted=false、own attempted=true／busy=true、own check／code=null、元recovery実参照とentry時lexical値の継続を検査する。lexical値はstarted／primary／revoked／sealed／currentで、未確認objectのpropertyはguard内で読まない。同cleanupの先行HTTP／revokedを一律falseへ要求せず、「entryから変わったか」と「将来の停止資格」を分ける。

最初の拒否では現行と同様、check／code→空の場合だけprimary→revokedを、未確認slotへの書込みより前に置く。通常scanへ戻らず、最初のIDと最後の完了位置を保持する。same-role再入はbusy拒否がそのroleの最初の理由になり、cross-role再入ではpeerにbusy、outerにはscan_interruptedを残す。peerのslotへ代理の失敗writerを走らせない。upper診断への追記・通知は0。

本書は全停止入口のevent捕捉・本番live pinを接続する設計ではない。既に同じprimary／revokedを持つownerへの冪等stopを、値比較だけで新しい停止eventとして観測できたとはしない。その捕捉・元floorとの同一性・最終pinの同期区間は次の停止／live pin単位のgateに残す。shared interruptionが保証するのは本scan入口への同root再入であり、全停止保証への昇格は禁止する。

## 6 固定failure tail・所有・未確認保持

SQ07以降は常に拒否済みであり、scan中に得た古い「slotが書ける」という結果を再利用しない。現行reflectJoinPrecallFailureと同じ最小3fieldを改めて順次確認し、適格な場合だけ同roleの既存primitive failureへ反映する。最後のdescriptorを退役してから、同canonical非Proxy shellのcold保持へ最大1回進む。正常scanのstrict seed値と、拒否tailの有限fault／phase値域を混同しない。

再入frameは原始拒否だけなので、tail中の再入でも第二のreflection／metadata保持を開始しない。tailのthrow・coldの部分失敗は先行理由を変えず、再帰catch・予算再取得・通常snapshot・第二shell／Promiseで救済しない。tailを試みたことは全field受付や全解放の証拠ではない。

不適格slot、失敗前の同pending、未確認metadataは元ownerが保持する。readonly借用をlocalから退役しても、既存のshell／identity／context保持鎖を解放済みとは扱わない。参照鎖自体が不正・構築途中なら、確認できたprefixと最初のIDまでで止める。最終discard・root終端・borrowの完全回収は別gateでUnknownのままとする。

## 7 計数上界・予約・容量の限界

下表は一つの外側attemptに対するsource-levelの捕捉済み操作数である。成功credit・実transportのC/G/P/R更新・新budgetではなく、元run ownerに帰属する受付費の保守台帳とする。途中拒否は実行prefix、再入／二度目はscan操作0。scannerの実試行数はSL03、tailは最大12操作の別予約として扱い、予約を「実行済み12」と表示しない。

| 操作 | run scan | cleanup scan | failure tail予約上界 | 合計run／cleanup |
|---|---:|---:|---:|---:|
| own descriptor取得 | 126 | 131 | 5 | 131／136 |
| descriptorのown value tag確認 | 126 | 131 | 5 | 131／136 |
| 非Proxy確認 | 16 | 19 | 2 | 18／21 |
| ownKeys取得 | 12 | 13 | 0 | 12／13 |
| 凍結確認 | 9 | 11 | 0 | 9／11 |
| 直接prototype確認 | 2 | 2 | 0 | 2／2 |
| 捕捉済みnative操作合計 | 291 | 307 | 12 | 303／319 |

owner descriptor126／131は親の直接74cell＋readonly52／57である。module live pinの6descriptorと最終再確認6は本scanに含めない。将来それらを加えた場合に限り、親の正常138／143・拒否143／148descriptor上界と一致する。live pinが未接続なのにこの上界を現coverageとして報告しない。

exact nodeの正常key総数はrun121／cleanup123。Kごとの重複比較はΣK(K−1)/2＝2223／2224、所属比較を各key最大K個とする上界はΣK²＝4567／4571、両者合計6790／6795回である。入力順は保持するが挿入順一致は要求せず、sort／Set／Mapを追加しない。長さ不一致ならkey要素を走査しない。

その他の論理比較はdescriptor site最大16、owner node最大8、scan guard最大32を実装coverageの上限とする。scan guardは各native操作のpre／post＋入口／最後等4回までとして586／618回。keyの型確認121／123・長さ確認12／13・own alias確認7を足した比較予約はrun27826／cleanup28962、failure tailの比較予約256を加えて28082／29218である。これは定義した論理比較の保守unitであり、native内部処理・JS engine命令数・実時間の上界ではない。実装時に独立oracleがsite別比較数も照合し、この係数を超える追加条件／helperを黙って持ち込まない。

16／8／32／256の係数は将来実装に課す予約契約であり、現在の08e646aから実測したcoverageではない。今回は表の算術だけを静的確認する。実装がこのsite別予約を満たす証拠は後続のsource／compiled対照で別に必要である。

effect予算303／319とtail比較予約256を、取得前に同ownerの固定費として確保する方針であり、実装時に実budgetの更新を別承認なしで開始しない。新しいclock／sample／remaining読取り・floor変更・期限延長は0。固定台帳に載らない操作が必要なら接続を止めて差分を更新する。

一時descriptorは1個、key配列も1nodeずつで、次の取得・tailへ持ち越さない。ただしownKeysの長さ検査はnative配列割当ての後である。不正なcanonical objectに大量の余分keyがある場合、走査数を0へ抑えても、そのnative内部処理・配列backing容量を65以内と事前保証できない。親の「最大65key」は正規key集合を満たす経路の保持値域に限定して読む。拒否経路まで含む実backing上界・OOM・完全回収はUnknownで、後付け長さ検査をcopy前の容量受付と呼ばない。この限界もconstructor call 0を外さない理由として保持する。

## 8 独立合成受入条件・後続単位

| ID | 必須対照 | 受入条件 |
|---|---|---|
| AT01 | source ASTの固定node／fieldと独立表 | shell65を含む各row、run126／cleanup131descriptor、exact／subset・凍結・prototype対象、192IDを過不足なく照合。driftで拒否 |
| AT02 | descriptorのmissing／accessor／flags／値／originを一つずつ変更 | 合格する基準行から1条件だけ崩し、正しい最初のID／codeを確認。getter／setter・foreign hook0、role別write権限を増やさない |
| AT03 | keyの順序交換・余分／欠落／Symbol／重複モデル | 順序交換は集合一致なら通過、その他はnode.keys。native結果容量と試験用bounded配列の保証を混ぜない |
| AT04 | 各effectのpre／post、throw・同role／peer再入 | 先行拒否がまだない位置でも停止し、返却結果を通常scanへ使用しない。inner解除・第二tail・失敗後の再scan0 |
| AT05 | 先行HTTP／取消・sealed・同値の冪等stop | 元primaryと未確認を維持。検出できた変化と、未接続のstop event資格を区別し、全停止保証と報告しない |
| AT06 | prefix別の試行／完了計数・tail例外／部分cold保持 | throwは試行1・完了0、計数／理由は非返却。上界超過前に停止、tail予約と実行数を分離、元slot／参照保持 |
| AT07 | 7alias／readonly借用・同値copy／peer混入 | 同roleだけを検査。mutable holderから期待値再発行0、借用元不足ならscan_context拒否、失敗後に補完しない |
| AT08 | 全scan通過・各gate不足・source／fixed dist／semantic／配布 | 末尾composition拒否、literal false、constructor／closure／新alias取得／public caller0。変異はdrift・構文確認を期待失敗の外で検査 |

最初の実装単位は、有限ID・固定node schemaと先行scalar／guardの閉鎖値契約までに分けられる。次に固定操作のscanと現行tailの一度限り接続を合成依存で検証する。その前段となる同owner入場・entry捕捉・対象固定tail・外側退出の形状と失敗prefixは[入場・tail設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_SCAN_ENTRY_TAIL_DELTA_DESIGN.md)で定め、固定検査へは進めずcomposition拒否で終える。停止／live pin・元期限との正式資格、write-once producer、安全観測／固定終端の一体接続は別単位で、今回の設計承認から実装・試験実行・発行を推定しない。

draft-0.1の確認は文書の静的整合に限った。draft-0.2の値契約検査も実Promise・native安全性・実会計・実backing容量の証拠へ昇格させず、全体受付無効・Unknown・調査保留を維持する。

draft-0.1の静的確認（2026-11-18）：source ASTとN01の65field、既存slot／control／identity／pin／contextのobject形状を照合し、19node・31設計ID・192失敗ID、126／131descriptorと303／319操作予約、key比較・guard・論理比較予約の算術を確認した。相対link3・表7・末尾改行・差分空白を確認し、製品ソースは基準HEADと同一、他作業8fileのSHA-256も保持、stage0だった。これは文書台帳と予約値の整合確認であり、新scannerの実装・試験成功を示さない。当時の編集は本書だけで、実装・試験再実行・Promise生成・private公開・dispatch・実接続・実通信・設定変更・コミット・Pushは行わなかった。

## 9 有限ID・schema・先行scalar／guardの閉鎖値契約

draft-0.2では、旧rootにreadonlyのJoinScanFields／初期値型、192文字列literalの失敗ID型とswitch判定、19nodeの固定metadata照会・131個のkey照会を追加した。metadataはfield_count・key_count・frozen・prototype・role・kind・orderの固定原始値だけで、schema object／arrayやauthority ticketを生成しない。subset／functionのkey_countは−1、null prototype期待値は文字列null、無効照会は実値nullで区別する。照会が成立しても対象objectの検査は0である。

同creator先頭にSL01〜04の6scalarを先行配置し、元の8scalarを維持する。実際の値はnone／false／0だけで、新しいowner取得・中断bit更新・加算・完了writerは置かない。initial postは同rootと6初期値を読むだけで、先行拒否後にtrueでも未使用scan配置の一致を示すだけである。

guard postはrawRootとcanonical controlRootの同一性を最初に照合し、同recovery・共有owner／中断・同roleの先行claim／busy／拒否欄・計数値とentryStarted／primary／revoked／sealed／currentの同値を検査する。counter値はrun291／cleanup307以内の整数、0≦completed≦effectsである。全てlexical原始値／参照の比較であり、未確認objectのfield・descriptor・prototypeを取得しない。entry値の実捕捉・guardのpre/post呼出し・再入時の中断writerは未接続で、同値の冪等stopを新eventとして検出したとは扱わない。

既存JoinPrecallCheckは5値のまま、既存拒否writerへ新192IDを渡す接続も行わない。9つのcontrol IDのcodeだけを固定照会し、field IDから失敗原因・取得証拠を推定する関数は作らない。新guard／initial／ID／schema／key／control照会の製品callerは0、pure helper内のnode判定1callとguard内counter判定2callだけがある。native操作・反射・状態write・可変trace・new／await・公開／登録口は0。

これらのselectorを将来のscanのruntime dispatchとして組み込んだ証拠はない。ID／schemaのswitch比較・helper呼出し費を§7のsite予約へ自動的に含めず、後続で使う場合は別途coverageへ加算するか、固定siteへ展開する。現在のprobe費0と、将来の291／307操作予約・比較上界の実装適合を混同しない。

[source試験](../tests/review/native-join-scan-values.test.ts)、[独立oracle／strict scratch](../tests/review/fixtures/native-join-scan-values-model.mjs)、[固定dist検査](../tests/review/fixtures/compiled-native-join-scan-values.mjs)、[検証記録](E2E_BEST_PRACTICE_NATIVE_JOIN_SCAN_VALUES_2026-11-18.md)で、schema全欄・割当てAST・有限ID／意味境界・guard単独変化・変異を確認する。active guardの正対照はscratchだけで6scalarと既存claimの値を置いたもので、製品のscan開始・一度限りclaim・再入処理・停止資格・probe費の実測を示さない。scan実行・alias供給・生成／観測／固定終端・root終端は未接続で、実backing容量・完全回収はUnknownのままである。
