# WF-B：PC08 returned全照合と受理・失敗・診断sealの接続差分

Version: draft-0.5 / Date: 2026-11-13 / 読み取り基準HEAD: `e7bda024e1298c18707be6fca248ef8ba1299421`（C-c実装`8ffaf0a`と、そのレビュー補強`e7bda02`を維持）。レビュー修正基準HEAD: `ed37be3`。§15のR-a限定実装基準HEAD: `d9002e02026451f55b1e1767701dbc02b2c1507d`。§15実装のレビュー修正基準HEAD: `88204c5`。§17のR-b差分設計基準HEAD: `fe1e248`。

draft-0.1のレビュー修正：§7のinput_rejected写像（rootはそのまま、sourceはstate_invalid）を現行fixtureと照合したところ、旧`fail()`系は同じだが、C-cの最終観測中の記録分岐はsource側をconstruction_unconfirmedにしていた。到達するscriptはないが、本書を正としてC-c分岐を直し、compiled対照を追加した（[C詳細設計draft-0.9](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)）。これにより旧C-cの等価節は31件になったため、RT16の件数を合わせた。他の本文・R08／RT条件は変えていない。

draft-0.3のレビュー修正：§15のR-a実装（`88204c5`）に84件の一時変異を入れたところ、Vitestで12件、compiledだけで45件が落ち、27件が両方を通った。そのうち22件はcompiled対照が当該節を単独で壊していなかっただけである。初期owner確認の不在節14件（seed・draft・probe owner・binding・run link／duty／seal・seed shell・source生成試行・metadata確認・build段階・route試行・source current／rejected）は、残存cellとsource issued以外に単独対照がなかった。公開projectionの7件（stateValid・fixedCalls・sourceGenerations・cacheRetained・sealed・attempts・bodyStarts）は初期値でしか観測されていなかった。共通値検査のphase checking節は、状態型として正しいaccepted（post=true、現在点post／blocked）をpre／postへ渡す対照がなく、外してもpost検査がacceptedを通した。compiledに初期owner単独破損14件、実slotを動かす投影7件、accepted状態3件の対照を追加し、22件をkillした。残る5件の等価判断は§16に記録した。fixtureの挙動は変えていない。

Status: **§15のR-a狭い値型・returned専用値検査・先行scalar・初期状態だけの固定拒否を合成依存限定で実装。実PC08開始claim／受理・G_R／G_A・C-03は未接続。** 親は[C-c最終返却・単一cache設計](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)と[private pin接続設計](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)。[confirmed・内部返却契約](BEST_PRACTICE_WFB_BODY_PIN_CONFIRM_RETURN_DESIGN.md)と[C-c検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_FINAL_POST_2026-11-12.md)は前段実績、[R-a検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_RETURNED_PREPARATION_2026-11-13.md)が今回の限定範囲である。§1〜14の将来接続契約と文書作業履歴は保持し、実装済みへ読み替えない。

正式発行口・既存C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。今回の実装は§15の合成準備だけ。実受理・body起動・実接続・実通信・実機操作・設定変更・Pushは行わない。source利用claim消費・payload借用／bind・BC00・構築ready・Journal供給・field clear／root終端も対象外である。

## 1 C-cとの差分と二つの受理境界

現行createProbeBodyPinFinalPostFakeは、同calleeの最終postとliteral acceptedの実復帰を最小分類した後、元callerがconstruction_unconfirmedを固定し、sourceをfailed／claim unusedとして診断をsealする。rootのcallPhaseはreturned、route位置はBP03／call／after、source位置はBP03／callのまま。実I/C/J・元metadata／未使用base／BS／payloadの**復帰後全照合は行っていない**。

本案はその固定失敗writerより前で分岐する、package除外・fresh constructor固定の別合成modeである。旧C-cの挙動・factory・返答・最終markerの意味は変えない。失敗済みsource、seal済みroot、返却済みcacheから再開せず、新rootも元constructorから同sourceを1回だけ生成する。公開boolean、任意callback、公開receipt登録やruntime friendは追加しない。

| 事実 | 確定する位置 | そこから推定してはならないもの |
|---|---|---|
| callee完了／実primitive復帰 | 既存G_P・固定finally・元call-resultへの実代入と原始分類 | PC08全照合、source利用、正常cleanup |
| PC08受理 | 本書のreturned pre／post全照合とG_A | BP04のpreparing／専用post、body、正式資格 |
| 操作診断seal | 元callerの固定終端位置、初回理由・位置・sourceReason・終端dispositionを記録した後 | 返答生成成功、外側frame退出、外部保存ack |
| 閉鎖返答の公開 | 同public入場の実外側復帰と元#fixedの照合後 | 参照退役、未確認責務の解消、実行permission |

PC08だけを接続する段階では受理後もC-03へ呼び出さず、BP03 returnedで固定未接続停止する。sourceをpreparingへ進めるのは別承認のC-03だけ。PC08受理済みの失敗rootを後から再prepareしてC-03へ進める経路は作らない。

## 2 配置・同一性・所有権

Rは元CanonicalGateDraftRoot、Sは同Rが正規発行し保持する元source、Tは元binding.target.start、I/C/JはTのexpected-source実slotとする。配置は既存package除外composition moduleに限定する。正規生成のprivate継続から同R/S/Tを渡し、Sのcustodianを探索してrootを得る方式にはしない。

最初に同Rのconstructor固定mode・元発行経路、R.issued=R.current=S・root rejected不在、T=元startを直接比較する。未知objectをclassへcastしたprivate-field access、getter／ownKeys／prototype／descriptor探索を同一性確認より先に行わない。TのI/Cは参照を比較するだけで、候補のfieldやmethodは呼ばない。公開sameOwner／marker／summary、同値copy・別rootの受理値は根拠にしない。

| 保持物 | 所有・借用と禁止事項 |
|---|---|
| 元S／BS shell／生成履歴 | Rが保持。source metadata9・進行13の22key、BP01の生成位置／fixedCount9／build confirmedを保つ。pin進行で生成診断を上書きしない |
| 元binding／link／duty／control／failure／run seal／exit anchor | 元関係を検査。bindingOwnerとcellOwnerは別の正規関係であり、同一ownerへ統一しない |
| TのI/C/J | I=C=S・J不在が正常。所有権を移さず同Tの借用責務を保つ。returned失敗で新J捕捉・再格納・clearをしない |
| source利用claim／duty／grant | 元claim unused、duty未負担・grant空を維持。returned検査用の第2実行claimやPin objectは発行しない |
| 終端返答 | 元Rの既存#fixedだけ。新mode用cache・別FailureOwner・外部object登録なし |

元Sをfield読取り／書込み可能とする根拠は、同private発行参照・生成確認・元metadata関係である。metadataConfirmedという公開値や「descriptorがplainに見える」ことだけから来歴を作らない。failure／closeで書く時もその時点の元issued/current・生成確認を再確認し、失われていればroot-only診断と保持責務を正とする。

## 3 内部状態と先行scalarの案

以下は将来の型・writer契約で、今回fieldは追加しない。新mode flagと原始scalarは同Rのconstructor処理／部分生成より前にliteralで先行する。旧modeでは非活動、source22keyとTの既存slotは増やさない。

| 内部項目案 | 初期値・有限値 | writerと不変条件 |
|---|---|---|
| returnedPhase | not_started。checking／accepted／blocked／failed | 同固定継続だけ。not_started→checkingが一度限りの開始消費。accepted→blocked又はfailedは許すが、checking／not_startedへ戻さない |
| returnedPostChecked | false | G_Aだけtrue。受理後close／後続失敗でもfalseへ巻き戻さない。phase failedでもtrueを保持し得る |
| returnedPoint | none。identity／pre／post／blocked | 元callerの固定観測点だけ。callee final pointとは別 |
| returnedFailurePoint | none又は上の固定点 | 最初の実失敗だけ。正常なC-03未接続停止をpost失敗へcopyしない |
| call分類／completion | 既存先行scalarを再利用 | 実call-result・実call数・同Tのmarker／first原値だけから分類。completion_observedはPC08受理と別 |
| root pin現在／初回位置 | 既存BP03／callからreturnedへ | 本書の固定群と同phaseの失敗writerだけ。source生成位置・callee位置と分離 |
| first／sourceReason／seal／reply phase／#fixed | 既存slotを再利用 | 第2診断owner／第2cacheなし。診断の先行記録とsealを分ける |

厳密な状態型は、not_startedではpost=false・受理開始なし、checkingではpost=false・cache空／未seal、acceptedではpost=true・cache空／未seal、blockedではpost=true・C-03未接続終端、failedではpostは到達事実のまま、とする。先行終端・開始前closeはreturnedPhase not_startedでも存在できる。phase値だけを終端seal資格にしない。

同一性／停止の拒否で開始claimへ入れなかった場合はnot_started→failedの固定失敗遷移も許す。これはcheckingへ入った履歴を作らず、元sequenceの開始済み／失敗／sealによって再試行を拒否する。開始前closeはreturned継続自体を呼ばず、元の閉鎖終端へ合流する。

同startの新trialやsourceの再発行を開始消費の代わりに使わない。checking中／accepted後の第2private入場は固定拒否で元prefixを変えず、元継続だけが先行停止を確認して終端へ合流する。不正組はstate_invalidとして保持し、正しい組へ補完しない。これらのscalar・原始参照も公開資格として返さない。

## 4 calling専用検査からの最小分離

現行bodyPinBridgeActiveはcallActive=true・BP03 call before・source boundary callを要求する。正規returnedではcallActive=falseなので、そのまま呼べない。逆にcalling又はreturnedを許すORへ緩めない。現行bodySourceDataMatchesもreceiver全初期値・pinCallReached=falseを要求するため流用しない。

| 共通化可能な有限部分 | returned側の固定条件／既存保証 |
|---|---|
| SourceProvenance | 元発行参照、22keyのstrict shape／seal、metadata9のreadonly descriptor・進行13のwritable descriptor、元metadata関係と生成履歴。phase／pinCallの初期値は含めない |
| BaseUnused | 元seed／binding／link／duty／control／run seal／exit、未使用use・duty未負担・grant空・body未開始・capture未呼出し |
| StorageEmpty | 同BS shell／同failure・building／ready=false／execution closed、13carrierの未開始・予約／call false・data3参照空 |
| PayloadEmpty | Tのbundle／draft各issued/current/rejectedの6参照空、occupancy free・bindingState empty・bind prefix none／bind未到達。I/C全空は要求しない |
| pure値core | BODY_PIN_PHASE_CHECKS.returnedはpost時のsource initializing／BP03 after・pin confirmed値にだけ再利用可。実参照・frame／call履歴・marker／診断・来歴は別に照合 |

抽出する場合も旧factoryの条件・順序・最初の拒否点・export・期限は不変にする。候補値objectを読むだけのpure成功を同ownerの全照合成功にしない。固定pre／postのprivate関数を別々にし、callerがphaseや検査を選べる公開汎用checkerは作らない。

既存bodyPinConfirmationStateのpost_returningはcallee復帰直後のsource callを想定する。G_R後にS.boundaryをcallと偽ったcopyを作って合わせず、returned専用の実位置・実参照・receiver原値を検査する。共通部分を抽出してもcalling側の旧入力集合を拡大しない。

## 5 returned全照合の順序と狭い二段階

preは**実primitiveは復帰済みだがsource位置はまだcall**、postは**G_Rでsource位置をafterへ記録済みだがPC08受理前**を検査する。rootの実外側prepare frameはどちらもactive、同public入場busy=true・rootEntryExit not_observedである。calleeのentryBusy=false・dispatchのcallActive=falseと、外側frame=falseを混同しない。

| 検査順 | 必須条件 |
|---|---|
| 1 同一性／来歴 | §2のR/S/T最小同一性とprivate発行origin。生成試行済み・metadata9固定化／確認・build confirmed、rootの元rejected不在。未知候補はここで無読取り拒否 |
| 2 停止／先行診断 | R.closed=false・sourceStopRequested=false・root first none、元S stop=false／first none・failure／refusal／delivery初期値、T first／failure／refusal初期値。先行理由があればそれを保持して拒否 |
| 3 元入場／復帰 | 固定新mode、同prepare frame active・未ready、同public busy・退出未確認、固定call数1・実result accepted・callPhase returned、callActive=false・T.entryBusy=false |
| 4 全安定 | SourceProvenanceの全metadata関係／22key属性とBaseUnused／StorageEmpty／PayloadEmptyを全確認。外部booleanや保持件数だけで代用しない |
| 5 実callee保持／履歴 | I=C=S、J空、attemptUsed=true・pinStage／step confirmed、receiver境界after・hold not_started、referencePost／checkedPost／confirmedPost／最終markerの原値true、元prepared／blocked検査履歴true |
| 6 root履歴 | routeAttempted true・routeState running、pin failure未記録・sourceReason none・confirmation診断未記録、原始分類completed_value_only／completion_observed。preparingConfirmed／pinPostChecked false。新returnedPhase checking・post=false、未seal／未生成・終端disposition none・reply empty・#fixed空、callee最終失敗点none |
| 7 固定位置 | pre点はroot BP03 call after・S initializing／unused／BP03 call。post点はroot BP03 returned before・S initializing／unused／BP03 after。固定関数に対応するreturnedPoint原値もpre／postに一致。両方pinCall=true・bindCall／postConfirmed=false |

段階間の観測でclose／prior／不整合が入ったら次段へ進まない。acceptedだけ、markerだけ、pure returned値だけ、busy=falseだけから受理しない。後述のG_A後はchecking用postを再使用せず、accepted専用の狭いblocked guardで同一性・停止・履歴と受理済み事実を確認する。

## 6 固定更新順・受理確定点

R08-01〜09は操作種別であり、実guard数・work単位ではない。内部操作名は設計案で、同名のAPIや証拠を今回追加しない。

| ID | 元callerの固定順序 | 直後の事実／失敗prefix |
|---|---|---|
| R08-01 | 元dispatchが実際に戻ったprimitiveを既存call-resultへ代入。1実callの返値がある場合だけcallPhase returned→root call境界afterを直接記録 | 未復帰はresult none／caller beforeのまま。finally未確認を修復しない |
| R08-02 | 元Rのidentity点を先行記録→R/S/Tを最小照合し、同Tのfirst／markerとraw primitiveを非割当て分類。正常時completion_observedを記録 | source failed化・root construction_unconfirmed・sealはまだ行わない。非accepted／不整合は既存の失敗分類へ |
| R08-03 | 正規・未停止・元firstなし・returnedPhase not_startedを確認。phase checkingへ一度だけ遷移しpre点を記録→§5のpre全照合 | 失敗後も開始消費を戻さない。root BP03 call after／source call |
| R08-04 | pre成功直後のG_R：root routeStep returned→root routeBoundary before→元S.boundary after | source.phaseはBP03のまま。source afterは実復帰位置の記録で、受理済みではない |
| R08-05 | post点で固定観測→同R/S/Tと§5のpost全照合 | beforeはreturned post未確認。source after・callee confirmedと最終markerを保持 |
| R08-06 | post成功直後のG_A：root routeBoundary after→returnedPostChecked true→returnedPhase accepted | 最後のaccepted記録を論理受理確定点とする。利用claim・BP04・readyには触れない |
| R08-07 | blocked点で固定観測→accepted専用の全安定／停止guard | close／先行失敗なら受理済み履歴trueを保持して失敗。新checkingへ戻さない |
| R08-08 | C-03未接続の固定境界：post失敗点を作らず、root/sourceへconstruction_unconfirmedと実BP03 returned afterを先行記録→phase blocked→新終端disposition→seal | source failed／claim unused、T confirmed・first none、PC08受理履歴trueを保持。BP04未開始 |
| R08-09 | 同元終端から1回だけmaterialize→同#fixedへ非公開保持→元外側frameの実復帰確認→閉鎖返答の公開 | C-bの単一cache／退出・再読契約を維持。配送失敗は別軸 |

G_Rは既知R/Sの3直接代入、G_Aは既知Rの3直接代入だけとする。pre／postのtrueから各群の末尾まで、新checker・script・projection・通知・clock・allocation・callback・await・finallyを挟まない。群内checkpointや、到達flagだけを後付けするfault scriptは置かない。論理的な同期非介在であり、OOM／process停止に対する物理atomicityの保証ではない。

postでI/C不一致等が見つかってもG_Rを戻さない。G_A後の失敗でもreturnedPostCheckedを戻さず、phase failedと併存させる。group途中の不正prefixはcompiled局所故障として保持・拒否し、残りの代入をcatchで補完して受理しない。

## 7 同期停止・再入・診断sealの所有

新modeのcloseは、cache／phaseの短絡判定より先にR.closed・sourceStopRequestedを単調に立て、元sourceの書込み資格を確認できる場合だけS.stopRequestedへ同期反映する。閉鎖要求は新しいcallee first・J・pin解除を作らず、T.close／回収／Journalへ迂回しない。root closedだけが立ちsource側へ未反映でも、次のguardは必ず停止する。

同public入場／外側frameが活動中なら、close・余分な入力・先行failは既存slotへ非割当てで最初の理由／実caller位置だけを保持し、終端をseal／materializeしない。close中に元primitive結果やPC08受理を予測しない。元継続が現在の到達prefixと実結果を分類して固定終端へ合流する。checking中の再入は第2開始を拒否し、refusal／非終端通知は元処理のfirstや受理履歴へ混ぜない。

診断sealを所有するのは、同public入場に属する元callerの**失敗又はC-03未接続の固定終端**だけ。G_A自体はseal点ではない。成功したreturned pre／postはfirstを書かない。failure writerは先行root first→当該source自身の先行firstを保持し、binding不一致はbinding_mismatch、状態不整合はstate_invalid、停止はclosed、未復帰／検査throw／post未確認はconstruction_unconfirmedへ写像する。先行input_rejectedを後発closedへ変えない。

rootのinput_rejectedはそのまま保持し、Sの既存first型へ入力拒否を反映する場合はstate_invalidとする。Sにreceiver_unconfirmed／post_unconfirmedが先行していればSの値と位置はそのまま、rootにはconstruction_unconfirmedへ写像する。root first・source first・call側sourceReason・callee first・配送firstは別軸で、上位の値を全軸へ同じ文字列でcopyしない。

primitive未復帰時・calling中の先行停止はC-c以前の単一所有経路を保持する。returned開始後は、source生成writerやcalling専用位置mapperへfall-throughさせず、rootの実BP03／call又はreturnedと§8のsource境界を使う。診断前にallocatingなposition／bodyPinValues／返答objectを作らない。失敗時は最後の信頼済み原始slotだけを使い、未知候補の反射診断をしない。

最終dispositionとterminalSealedを記録するまで、terminal allocationは行わない。seal後はfirst noneを含め操作診断を確定値として保持する。後発closeはstop履歴だけを単調反映し、配送失敗・入力拒否はdelivery軸へ分離する。開始前closeのfirst noneと、構築後の意図的未接続停止のconstruction_unconfirmedを同一視しない。

## 8 失敗位置・同参照と未確認責務の保持

| 最初の失敗位置／事象 | R／Sの位置と診断 | 保持責務と禁止事項 |
|---|---|---|
| 実primitive未復帰／receiver finally throw | 元call before・source call、completion unreturned。callee final trueでも補完しない | 元SとT I/C/J、busy原値を保持。PC08開始・G_Rなし |
| R08-02の混入／不正結果 | call実復帰の事実だけ保持。foreign候補は無読取り／無書込み拒否 | 元R／正規S／Tが責務を保持。別source／startの診断・slotに触れない |
| pre又はG_R前のthrow／close | root BP03 call after・source failureBoundary call。returnedFailurePoint pre等を初回保持 | confirmed・I/C・最終markerを保持。source afterを先取りしない |
| G_R後・post失敗 | root BP03 returned before・source failureBoundary after。post未確認・post=false | source.boundary afterは保持。G_R rollback・再pin・新Jなし |
| G_A後・blocked guardの実失敗 | root BP03 returned after・source after、post=true・phase failed | 受理到達をfalseに戻さず、先行理由と実blocked失敗点を保持 |
| 正常なC-03未接続停止 | 同returned after、construction_unconfirmed・phase blocked・returnedFailurePoint none | S failed／unused、T first none／confirmed。BP04専用2flag falseのまま |
| metadata／source資格を失った失敗 | 元rootへ実位置・信頼喪失を保持。不正位置組はprivate診断でnone、公開表示でunconfirmedへ有限写像 | 未確認Sを読まず書かず、最後の元参照と未解決責務を保持。保持をcleanup確認にしない |
| seal後の生成／freeze失敗 | 操作first・位置・post履歴不変、delivery view_unconfirmed、failed_empty | #fixed空でも再生成不可。S／Tをclearしない |
| cache保持後の外側finally／公開失敗 | 同診断と元#fixedを保持、failed_cached・配送未確認 | 再公開・別cache採用・frame強制解除・参照退役なし |

PC08のcaller側検査失敗をTのcallee失敗として記録しない。Tの正常first none／confirmedはそのまま、元calleeに既にfirstがあればそれも保持する。root finalFailurePointはcallee final_post_before専用であり、returned post失敗をそこへcopyしない。sourceの生成failureRecorded／BP01位置も変更しない。

Sの所有者はR、I/C/Jの借用と元局所保持の責務はTに残る。busy解除・受理済みflag・凍結cacheはcleanup、借用退役、本文破棄、停止後解消費の証拠ではない。最終discard／clear／root終端は別承認であり、本案のfail-closedはその完了を主張しない。

## 9 単一cache・全入口routing・公開診断

新modeも既存#fixed／terminalSealed／replyAttempted／replyPhase／publicEntryBusy／rootEntryExit／deliveryFirstを再利用する。mode別cache・accepted object・公開receiptは作らない。原始受理履歴はprivateに保ち、公開値は観測用の非終端projectionだけである。

新入口名案はcreateProbeBodyPinReturnedFake、終端値型は新mode専用の狭い型とし、既存BodyPinFinalReplyのmodel／dispositionの入力集合を拡大しない。既存#fixedの保持枠は共通でも、候補生成・有限検査はconstructor固定modeごとのstrict契約で行い、任意string／objectを受け取る汎用materializerにはしない。

新modeの終端schema案は既存同様のstrict10項目：model=wfb-body-pin-returned-1、ok=false、dispositionはpin_prepare_not_connected／closed／input_rejected／binding_mismatch／state_invalid／construction_unconfirmed／internal_unconfirmedの7値、firstは既存有限RunFirst、authority=none、execution=closed、formalIssuance=closed、wholeRunAdmission=disabled、implementation=unknown、investigations=on_hold。新literalは新modeにだけ許可し、旧C-cのmodel／allowlist／pin_return_not_connectedを変更しない。新modeではpin_return_not_connectedを使わない。名称とschemaは設計案であり、今回のAPI追加ではない。

pin_prepare_not_connectedはR08-07正常通過後・C-03未接続の固定境界だけで選べる。first=construction_unconfirmed、PC08 post=true、BP04未開始を併記する。state_invalid／closed／先行理由のある経路へこの正常未接続dispositionを流用しない。新モデルを選ぶためにcaller指定objectをmaterializerへ渡さず、constructor固定modeに属するliteralだけで候補を作る。

| writer／reader | 新modeへの接続契約 |
|---|---|
| 元C-c callerからの分岐 | 既存のfailed化／診断記録／sealより前で固定選択。旧factoryの固定停止はそのまま |
| fail／close／input／inspect入力 | 新mode・実returned phaseを先に選び、活動frameでは先行診断だけ。旧allocating mapperへの迂回、callerの二重診断／sealなし |
| prepare早期失敗／catch／固定終端 | source生成前・metadata未確認・BP02・call中の既存単一所有を保持。returned検査中のthrowは現在prefixで診断し、同元終端からseal。seal後throwは配送軸だけ |
| materializer／#fixed writer | seal後の最大1回だけ。attemptを先行消費し、生成／freeze後のG_Cで同#fixedへ保持。失敗後の再試行なし |
| 公開wrapper／check／checkLegacy | 同public入場の実外側復帰・frame非活動・戻り値===元#fixed・private_cachedを全確認。accepted履歴やsource afterだけでは公開しない |
| 再読／後発close | replayableの同objectだけ。closeはstopを先に反映し、確定診断／cacheを変えない。failed_empty／failed_cachedは非再生成／非再公開 |

非終端のnot_ready／blocked／in_progress／deferred通知は既存固定値系統と分離し、終端claim／cacheを使わない。返却object数を1個とするのは終端cacheだけで、inspect等の都度の非終端view確保を隠さない。raw source／owner／brand／Error／message／stack／cause・任意keyを返さず、allowlist・strict boolean・既知plain graph／freezeを守る。

## 10 C-03との接続限界

将来のC-03は、同元frameでG_A後・停止なし・first noneのままBP04へ分岐し、別のpre／commit／postでsource initializing→preparing、preparingConfirmed／pinPostChecked、heldを確定する必要がある。本案のR08-08で一度failed化／sealしたinstanceは入口にしない。別rootのaccepted値や返答をC-03へ輸入しない。

現段階ではその継続を存在させず、BP04前で固定停止する。C-03接続時にもclaim unused、bindCallReached／source.postConfirmed false、payload空／free、BC00・ready・body 0を維持する。source.postConfirmedはbind専用、root pinPostCheckedはBP04専用、returnedPostCheckedはPC08専用で、相互に代用しない。新段階のterminal seal位置と正常閉鎖返答は、C-03の差分設計で別に定める。

## 11 追加費目とUnknown

費目のownerは同R／元frame owner。新modeと先行4scalar案、原始分類・固定pre／post／blocked照合、22key／metadata descriptor・13carrier／9参照の有限走査、G_R／G_A、各実prefixの診断／同期停止と1回のseal、既存materializer／cache／公開guard、有限projectionを追加費目へ置く。R08番号は費用単位・全guard数ではない。

元S・BS／owner／利用claim・trial／call・中間post／最終marker・#fixedを再発行／二重計上しない。no-hookの固定accessやcheckerが実allocation 0とは扱わず、失敗writer前の純粋検査用値viewの確保失敗も現在prefixで止める。失敗後は新たな値viewを作らず先行slotだけで記録する。

新clock・開始UTC／全deadlineの変更・残時間からの再計算・本番cap・実会計更新はない。実E／S・unit係数／全体work上界・layout／allocation／GC／OOM・停止後解消予約・診断／返答必着・cleanup／借用退役はUnknown。sourceを保持したまま止めることを、解消費用の導出完了や受付可へ昇格しない。

## 12 独立合成・compiled受入条件（すべて未実施）

| ID | 必須対照 |
|---|---|
| RT01 | 旧A/B／C-a/b/cの返答・export・prefix・期限・C-a非echo11件・C-b単一記録経路／公開9対照・C-c completion／実call数／root closedの3対照を維持 |
| RT02 | 新modeが同constructor／同prepareからだけ入り、失敗済みC-c／seal済み／cache／同値summaryから再開できない。第2source／trial／call発行なし |
| RT03 | R/S/T・shell／binding／link／duty／control／failure／metadata・I/C/J個別混入／copy／Proxyを拒否。未知hookと相手slotへの書込み0、正しい値view偽装でも実参照照合が拒否 |
| RT04 | 実primitive未復帰・marker trueのみ・marker欠落・accepted差替え・第2call・receiver busy残留・dispatch未退出を区別。PC08／C-03／readyへ補完しない |
| RT05 | returnedでは内側busy2個false・外側frame active／public入場busy trueが必要。外側frame falseの偽装や別入口の復帰を受理根拠にしない |
| RT06 | preのsource callとpostのsource after、root call afterとreturned beforeを別に検査。BODY_PIN_PHASE_CHECKS.returnedの値成功だけでは元ownerが進まない |
| RT07 | 各固定観測点でthrow／close／prior／再入、root closedだけ・source stopだけ・firstのみを注入。最初の拒否位置と元理由、未実施suffix・未確認責務を独立event oracleで予測 |
| RT08 | G_R／G_Aの3直接代入と非介在をAST固定。checker省略・重要節除去で到達／位置／post／診断が変わる単独対照。群内の部分破損は局所compiledだけで扱い、修復を禁止 |
| RT09 | G_R後のpost失敗でsource afterを保持し、G_A後のcloseでpost=trueとphase failedを併存。正規C-03未接続停止はpost=true・failurePoint none・source failed／unused・T first none |
| RT10 | 開始claimはcheckingから再発行不可。再入拒否は元first／calleeに混ざらず、活動close／inputでseal／attempt／cacheを先取りしない |
| RT11 | 新modeの全writer／readerを列挙し、早期失敗も同#fixedだけ。呼出し中・復帰後・seal後のcatchを分離。生成／freeze前後はfailed_empty、保持後の外側throwはfailed_cached、再生成なし |
| RT12 | 私有cacheのcopy・別root object・活動frame・実外側復帰なし・wrong resultを公開しない。公開guard直後の直接群・同object再読・後発closeの初回診断保持を確認 |
| RT13 | semantic compile-failでprivate returned継続／受理writer／phase更新・metadata書込み・不正状態組／newmode外disposition・公開値からの能力復元を拒否 |
| RT14 | strict10終端・非終端通知の分離、全allowlist／strict boolean・凍結plain graph・秘密非出力・fixture梱包混入0。新公開値を復帰・受理の入力へ使わない |
| RT15 | C-03未接続時BP04／preparingConfirmed／pinPostChecked／BC00／利用claim消費／bind／ready／body／正式発行0を実field・trapで確認。単なる固定0投影を証拠にしない |
| RT16 | 旧C-cの31等価節とC-a／C-bの判断を新returned経路で再評価し、等価／重複／到達不能／未確認を節ごとに記録。固定費目・保持／解消未確認とUnknownを維持 |

oracleは本体のbuilder／checker／状態表／counterをimportせず、有限な意味eventから期待値を計算する。pre失敗・post失敗・受理後の失敗・正常未接続・配送失敗を別に持つ。型／構文エラー、注入anchor不一致、別guardだけで落ちた変異を目的節のkillへ数えない。C-cまでの通過件数・過去の一時比較を本RTの実績に加算しない。

## 13 別承認後の分割案

(R-a)は狭い状態型／先行scalar・returned専用検査・固定診断の準備までで実受理は閉鎖、(R-b)は元callの実復帰→pre／G_R／post／G_Aと固定未接続停止・単一cacheを一体接続する合成範囲、(R-c)はC-03のBP04を別差分設計する段階、とする。名称・分割は提案であり、今回どれも実装しない。

calling用安定関数の最小抽出が必要なら、その互換移行を先に独立検証する。中途版でG_Aだけを公開したり、診断sealを外してC-03へ素通ししたりしない。各実装時に合成・compiled・CHANGELOG・設計／検証記録・梱包除外を更新する。実worker／runtime・実通信・設定・正式発行・全体受付の解禁はこの分割に含めない。

## 14 今回の文書作業と検証範囲

開始時HEADは上記`e7bda02`、worktree／indexはcleanだった。前回確認されたC-cレビュー補強4ファイルは同commitに取り込まれているため、その本文・対照を維持して読む。今回は本書と親2文書の版／参照追記だけで、既存の実装・試験・compiled・CHANGELOG・manifest／lockfile・設定は変更しない。

ローカル参照・表列数・節順・R08-01〜09／RT01〜16の欠落／重複、親の既存本文／レビュー保持、変更対象・HEAD／indexを文書として検証する。build・合成／compiled試験・梱包・index登録・コミット・Pushは行わない。RT条件はすべて未実施で、PC08受理・C-03・cleanupの受入成功ではない。文書整合の結果は作業終了前に本節へ追記する。

文書検証結果：3文書のローカル参照35件に欠落なし、29表の列数と末尾改行／行末空白に異常なし。節数は本書14・親各21、R08-01〜09／RT01〜16の順序・重複・欠落なし。親2文書の既存§1以降の本文・レビューの全byte保持、変更がMarkdown3件だけであること、基準HEAD不変・index空とdiff --checkを確認した。これは設計文書の整合確認だけで、新modeの実装・受入・実機操作を行った結果ではない。

## 15 R-aの値契約・初期owner確認と固定診断（2026-11-13）

package除外のcreateProbeBodyPinReturnedPreparationFakeを追加した。同CanonicalGateDraftRootへconstructor固定flagと本書の4scalarをliteralで先行するが、source／frame／C-c実行等の既存22flagは全false。正規source生成・call・returned開始claimは呼ばず、実ownerはnot_started／point none／post falseの初期状態確認だけを行う。旧C-cは入力拒否のsource写像修正`d9002e0`も含め不変である。

| R-aの実装境界 | 限定契約 |
|---|---|
| 狭い状態型 | not_started／checking／accepted／blocked／failed。失敗前post=falseのidentity／pre／postは現在点と初回点が一致する狭い枝、受理後失敗の値枝はblocked／post=true。未接続の後段正例は値だけ |
| 専用pre／post値検査 | strictなstate／source／receiver／root／calleeの5区分。preはsource call・root call after、postはsource after・root returned before。旧値coreを使うが旧calling入力集合を拡大しない |
| 来歴の限界 | root／calleeのboolean・issuedSame等は値契約だけ。同R/S/Tのprivate来歴・metadata／実I/C/Jを確認するowner検査ではなく、受理・実発行証拠へ昇格しない |
| 先行4scalar | phase not_started、post false、point／failurePoint none。全classでoperational writer 0、G_R／G_A／checking移行なし。初期条件破損はstate_invalidで拒否 |
| 新入口 | prepare／check／close／inspectの4固定method。引数は全拒否、callbackやraw値の受付なし。prepareは初期owner／source不在／未call／空cache等を直接検査しconstruction_unconfirmed／returned_not_connectedで固定拒否 |
| 診断保持 | 既存root firstだけを先行記録し、直接分岐で原始codeへ投影。開始前closeはfirst noneを保持、先行input_rejected・construction_unconfirmedを後発close／入力で置換しない。source診断・callee first・seal／cacheは未接続 |
| projection | 固定allowlist／strict boolean・frozen plainな有限値だけ。実source保持有無／call数／cache保持有無・body状態を読み、raw参照・能力を返さない。破損値4対照で秘密をechoしない |

pre／postの値正例を実ownerへ挿入しない。実rootでcheckingやpost状態を作る公開slot／登録口はなく、準備shellが返すのは原始拒否codeだけ。1終端objectを作る段階でもないため、単一#fixedは空・seal／生成attemptは未使用のまま。後段のfull returned model／pin_prepare_not_connectedはまだ発行しない。新入口のmodelは診断用wfb-body-pin-returned-preparation-1で区別する。

追加費目は固定flag・先行4scalar、module固定の凍結値表／key表5個、有限state／pre／post検査、初期ownerの直接比較、非割当て固定診断分岐と有限projection／facade。値表はroot31項目・callee6項目、source13／receiver14と状態4項目の有限shapeへ限定し、任意graphを走査しない。既存rootの37slot等の確保、source／owner／利用claim／#fixedを二重発行しない。JS物理allocation・GC／OOM・unit／E／S／全体work・解消予約・診断必着はUnknown。

R-aの450状態組、pre／postの独立位置oracle81組・単項破損136件・shape60件、実初期条件15件・未知参照hook 0・projection4件・semantic拒否9行、公開入口の合成68件は[R-a検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_RETURNED_PREPARATION_2026-11-13.md)へ分離する。RT全体の成功、同R/S/Tの実returned全照合、受理claim／G_R／G_A・C-03・bodyは未接続のまま。次のR-bでは元call接続・private来歴／実参照の全照合・診断seal／単一cacheを改めて一体検証する。

## 16 §15実装の一時変異と等価節（2026-11-13）

R-aの追加コード（`bodyPinReturnedStateMatches`、`bodyPinReturnedCommonValues`、pre／post値検査、`returnedPreparationInitialMatches`、prepare／result／check／close／reject、`inspectReturnedPreparation`、factoryの入力判定）へ84件の一時変異を入れた。Vitest（`probe-body-pin-returned-preparation`）で12件、compiled（`compiled-probe-body-pin-returned-preparation`）だけで45件が落ち、27件が両方を通った。レビュー修正で22件をkillし、残る5件を次の理由で等価と判断した。各変異の後でfixtureを元に戻した。

| 節（件数） | 等価の根拠 |
|---|---|
| 固定mode flag（4） | 初期matcher・prepare・check・closeの`bodyPinReturnedPreparation`判定。唯一のfactoryがconstructor引数でtrueに固定し、他factoryからこれらmethodを呼ぶ経路がない |
| result写像のbinding_mismatch節（1） | R-aのroot firstはconstruction_unconfirmed／state_invalid／input_rejectedだけが書かれ、binding_mismatchは到達しない。外してもinternal_unconfirmedへ落ちるだけで公開入口から観測できない |

compiledだけで検出した67件（修正後）は、450状態・136leaf・60shape・81位置組・accepted状態3件・初期owner29件・投影11件・AST／非割当て監査で確認した。R-bで実ownerへ接続するときは、固定mode節と到達しない写像を含めて再評価する。

## 17 R-bのprivate供給・実field照合と終端所有の差分設計（2026-11-13）

[R-b接続差分設計draft-0.1](BEST_PRACTICE_WFB_BODY_PIN_RETURNED_BINDING_TERMINAL_DESIGN.md)で、同constructor／prepareのR/S/T供給・元参照／metadata資格と、実fieldからの5区分値入力・returned全照合を具体化した。期待表や公開summaryを証拠入力にせず、calling専用matcherをORで緩めない。既存C-cの最初の失敗writerより前のfresh合成mode案であり、R-aの拒否済みshellやseal済みrootは再開しない。

元callerだけの失敗診断／seal、同#fixedの一度限り生成、外側frame実復帰後の公開を分離した。source資格喪失はroot-only記録と元参照保持、post後の失敗は到達履歴保持、生成／公開失敗は配送軸で再試行禁止とする。R-a等価5節とC-c等価31節は新経路で再評価する。

今回の追加は文書だけで、§1〜16の本文・レビューを変更しない。実受理・G_R／G_A・C-03・body・実接続は未接続。正式発行口閉鎖・全体受付無効・Unknown・調査保留と、実装・実通信・実機操作・設定変更・Pushの禁止を維持する。
