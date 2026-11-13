# WF-B：R-b開始claim・拒否診断と失敗終端ownerへの受渡し

Version: draft-0.3 / Date: 2026-11-13 / 読み取り基準HEAD: `0e35e852e1a84aa864b86b8d60dd05704f1b6a36`。§15の閉鎖契約限定実装基準HEAD: `2790830`。§15実装のレビュー修正基準HEAD: `eebc1f1`。

draft-0.2のレビュー修正：§15の閉鎖契約（`eebc1f1`）に78件の一時変異を入れたところ、Vitestで1件、compiledだけで39件が落ち、38件が両方を通った。不足していた対照は次の11件。T.first（receiver）の先行失敗・不正値の2分岐（root／sourceにしか注入がなかった）、停止flagが非booleanのときのCL08 invalid_state 3分岐、origin比較のうちissued source・C/E control・root failureの単独破損3件、記録の`point === identity`許可1件、不正状態でのrejectClass invalid_state化1件とsourceRecord非書込み（`valid &&`）1件である。compiled closed対照に、scratch setterによるT.first注入3件（receiver_unconfirmed／不正literal／receiverで許可されないconstruction_unconfirmed）、非boolean停止3件、origin単独破損3件、identity点の正常拒否、不正slot対照のrejectClass／sourceRecord assertと、不正状態×foreign source（withheld経路）3件を追加し、11件をkillした。残る27件の等価判断と、CL07の判定位置は§16に記録した。fixtureの挙動は変えていない。

Status: **§15の狭い内部型・先行2scalar・origin leaf・固定拒否／root-only診断保持だけを合成依存限定で実装。開始claim・source書込み・失敗終端受渡しは未接続。** [R-b接続差分設計](BEST_PRACTICE_WFB_BODY_PIN_RETURNED_BINDING_TERMINAL_DESIGN.md)の§3／6〜10を、同書§15のreadonly準備境界から先の差分として具体化する。[PC08全体設計](BEST_PRACTICE_WFB_BODY_PIN_RETURNED_ACCEPT_SEAL_DESIGN.md)のR08順序、既存C-c／R-aの閉鎖挙動を維持する。

正式発行口・既存C実行入口・body起動は閉鎖、全体受付は無効、Unknown、VM／監視／telemetry調査保留を維持する。§1〜14はdraft-0.1の将来契約／文書履歴、今回の限定実装は§15で区別する。開始claim消費・実受理・G_R／G_A・C-03・body起動・実接続・実通信・実機操作・設定変更・Pushは行わない。

## 1 現状と今回の解消対象

現行の`bodyPinReturnedSupplyMatches`は元R/S/T・provenance・安定条件・生成履歴・停止なし・first none・実I/C/Jを確認し、`bodyPinReturnedInput`が68項目を読み出す。元fixture内の入力化call siteは0、returned4scalarのoperational writerも0。[準備境界の検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_RETURNED_SUPPLY_2026-11-13.md)はこのreadonly境界の保証であり、開始／受理／終端接続の実績ではない。

供給のundefinedだけでは、混入・停止・先行失敗・状態不整合を分類できない。また同供給検査は正常状態を要求するため、close後・first記録後のsource停止／失敗writerの資格には使えない。本書は開始claimより前の拒否分類、消費後に戻さない失敗履歴、元callerだけの終端所有を対で定義する。

既存`prepareBodyPinFinalCaller`は最小復帰分類後にsourceを失敗化してsealする。将来のR-bは**その最初の失敗writerより前**のfresh constructor固定分岐からのみ入る。失敗済みC-c、拒否済みR-a、公開summary／cacheを新modeへ切り替えず、既存factory・calling条件・source生成・claim・trial・call数を変えない。

## 2 元owner・開始資格と受渡し先

Rは元root、Sは同Rの正規source、Tは元binding.target.start。元callerは同public入場・同prepare外側frameを所有するprivate継続で、終端ownerも同Rの既存診断／返答系統である。受渡しは**同owner内の制御移行**であり、別FailureOwnerやreceipt objectを発行する所有権移転ではない。

| 区分 | 根拠・責務 |
|---|---|
| 元caller資格 | constructor固定の新合成modeと元生成／入場経路。同private継続が保持するR/S/T・binding／link／duty／control／BS／failureの元参照。公開busy／sameOwner値だけで所有を認めない |
| 開始資格 | 元caller資格に加え、元source来歴・停止なし・先行理由なし・未使用returned状態、1callの実復帰と元履歴。元source利用claimとは別 |
| 停止／失敗の書込み資格 | 元参照・不変metadataの来歴に基づく§6。正常状態・first none・開始資格の成功は要求しない |
| 失敗終端owner | 同public入場を所有する元callerの固定出口。source資格を失ってもRの診断／保持責務を引き受け、別sourceへ探索しない |
| 後発／再入要求 | 非所有者。停止要求の先行記録又は固定拒否だけ。元callerに代わってclaim／seal／materializeしない |

sourceの所有はR、TのI/C/Jと局所保持はTに残る。受渡しでraw参照を公開せず、参照退役／cleanup／本文破棄を確定しない。元callerを失った異常ではRが診断・元参照・未解決責務を保持し、未実施の受渡しを成功扱いしない。

## 3 内部値型・先行slotの差分案

開始claimは既存returnedPhaseの`not_started → checking`を使い、claim objectや第2の利用claimは作らない。`failed`には開始前拒否も含まれるため、failedだけから「開始消費済み」と推定しない。開始回数の試験は実遷移eventを数える。

| 内部項目案 | 初期値・限定writer |
|---|---|
| 既存returned4scalar | phase not_started／post false／point none／failurePoint none。開始継続・固定失敗記録だけが将来更新する |
| returnedRejectClass（新しい原始scalar案） | none。binding_mismatch／stopped／prior_failure／invalid_state／observation_unconfirmed／continuation_unconnected。元callerの最初の実失敗だけ。再入拒否を混ぜない |
| returnedSourceRecord（新しい原始scalar案） | not_attempted。written／prior_preserved／withheld／unconfirmed。source失敗記録の結果を保持し、cleanup確認とはしない |
| 既存診断／停止／終端slot | root failure.first、pin first／failure位置／sourceReason／diagnosticRecorded、closed／sourceStopRequested、terminal disposition／seal／replyAttempted／replyPhase／#fixedを再利用 |

追加2scalarは、rootの初回理由へ写像すると失われる拒否種別と、sourceへ記録できなかった事実を、失敗後のobject確保なしで保持するための案である。全rootで部分構築より前にliteralで先行し、旧modeでは非活動とする。sourceの22key・Tの保持slot・既存返答schemaは増やさない。新FailureOwner・新cache・新公開資格は不要であり、実装承認時に2scalarの費目を明示する。

内部戻り値案は`claimed／refused_in_progress／refused_used／owner_rejected／failure_pending`の原始codeだけ。任意reason／対象owner／callbackを受け取らず、tuple・Result object・closure・公開receiptを作らない。codeの同値copyは開始資格でも終端資格でもない。

## 4 開始前の検査順と拒否分類

後発要求の拒否と、元callerの実失敗は別である。前者は元first・returnedRejectClass・callee firstを変えず、元callerの終端処理も奪わない。closeの単調停止処理は重複判定／cache短絡より先に独立して行う。

| 順序 | 判定・分類 | 元callerの記録／後続 |
|---|---|---|
| CL01 | 元private入場／constructor modeの資格なし | owner_rejected。未知R/S/Tのfieldを読まず、相手にも元処理にも操作診断を書かない |
| CL02 | seal／返答attempt／cache又は終了済みの元入場 | refused_used。確定操作診断を変えず、必要な配送拒否は既存delivery軸だけ |
| CL03 | rootに既知の有限先行firstあり | prior_failure。元firstと既存初回位置を保持し、Sを読む前に失敗経路を選べる |
| CL04 | 元参照／生成来歴の不一致 | binding_mismatch。未知候補は無読取り拒否。元Rへだけ記録し、Sへの書込みは別判定 |
| CL05 | 来歴確認済みS又は同Tに既知の先行firstあり | prior_failure。各所有者の理由／位置を保持し、rootへの有限写像を行う |
| CL06 | root closed／sourceStopRequested又は元S.stopRequestedがtrue | stopped → root closed。ただし先行firstを置換しない。源泉ごとの停止を単独でも拒否 |
| CL07 | returned checking中又はaccepted／blocked／failed済み | 活動中はrefused_in_progress、使用済みはrefused_used。新開始・reset・元prefix変更なし。先行停止／失敗の合流責務は元callerに残す |
| CL08 | 未使用組・元履歴・strict値の不整合、call数≠1、未知primitive | invalid_state → state_invalid。不正値をnone／falseへ補完しない |
| CL09 | 実primitive未復帰、合法な非accepted復帰、marker／finally未確認、検査又は入力化throw | observation_unconfirmed → construction_unconfirmed。既知の先行拒否理由があればそれを優先 |
| CL10 | 全開始前提を満たす | §5の開始消費へ。ここまででreturnedの実受理・source after・G_R／G_Aを作らない |

CL04では、private継続から受けた元参照とRの保持参照を直接比較してから、既知Sのmetadataへ進む。型cast・public marker・S.custodian探索を起点にせず、未知候補のgetter／ownKeys／prototype／descriptorを呼ばない。

先行sourceのreceiver_unconfirmed／post_unconfirmedはsourceにそのまま残し、rootはconstruction_unconfirmedへ写像する。input_rejectedはrootに保持し、sourceへ反映する場合だけstate_invalidとする。calleeのfirstやfinalFailurePointをreturned側の失敗で作り直さない。既知先行理由と今回の観測不足を同じ文字列で全軸へcopyしない。

同Tが未確認ならT.firstも読まずCL04へ。既知の正常slotに不正literalがあればCL08であり、外部文字列を公開診断へechoしない。検査途中のthrowはその時点までの信頼済み原始slotだけでCL09へ分類する。

root firstが不正literalの場合、CL03の先行理由として採用しない。rootの有限値確認でCL08相当のinvalid_stateへ閉じ、元raw値は修復せず、公開firstは既存有限写像のinternal_unconfirmedへ限定する。source／calleeの不正firstも既知理由へcopyせず、originを確認した後の不正値拒否とする。正当な先行理由を後発エラーで置換することとは区別する。

## 5 一度限り開始の消費点と失敗prefix

開始前提は、同入場・frame active／publicBusy true・rootExit not_observed、未seal／返答未試行／cache空、phase not_started・post false・failurePoint none・point none又はidentity、rejectClass none・sourceRecord not_attempted。元source生成／準備履歴、1実call・実result accepted・callPhase returned・callActive false・T.entryBusy false・同T最終markerと初回理由も確認する。

位置はroot routeAttempted true／running／BP03 call after、S initializing／unused／BP03 callであり、元classification completed_value_only／completion_observedを要求する。同Tのattempt使用済み・stage／step confirmed・I=C=S／J空・各中間post／最終markerの実値も確認する。これらの開始前提は、開始後の68項目全照合を省く根拠ではない。

CL01〜07で元入場・未seal・未使用を確認してから、同元callerのidentity観測点を記録する。再入又は使用済み要求のために元pointをidentityへ戻さない。CL08〜10を満たした直後、固定同期群で`returnedPhase = checking → returnedPoint = pre`の2直接代入だけを行う。**最初のchecking代入が開始claimの論理消費点**である。消費からpre点の記録までhook／checker／通知／clock／projection／allocation／await／finallyを挟まない。sourceのclaim・state・phase・boundaryやTのI/C/Jは更新しない。

| prefix | claimと失敗時の保持 |
|---|---|
| 開始前の拒否 | checking遷移は0。元callerの実失敗ならidentity点／post falseのfailedへ退役し、再開始は拒否。活動要求の拒否だけなら元状態を変えない |
| checking記録後・pre点記録前 | 消費済み。群途中の部分prefixはcompiled局所故障として保持・停止し、preへの残り代入や開始履歴をcatchで補完しない |
| pre点記録後・入力化前／入力化throw | 消費済み、point pre／post falseを保持。非割当て診断→同終端ownerへ。not_startedへ戻さない |
| pre照合まで成功しても後続が未接続 | continuation_unconnected → construction_unconfirmedの固定失敗。post=falseのまま。pin_prepare_not_connectedやacceptedを選ばない |

部分群の不正な原値は保持し、失敗位置には最後の確認済み点だけを使う。failedへ退役できても、checking／point組が正常に完成した証拠にはしない。OOM／process停止に対する物理atomicity・診断必着はUnknown。

本書はG_R／G_Aを実装対象にしない。将来それらを接続する場合もpre／post各点で実fieldを再取得し、claim成功や68項目の値一致だけを受理にしない。開始済みだが後続未接続の段階では固定失敗へ閉じる。

## 6 停止後に使えるorigin資格と限定書込み

正常な`bodyPinReturnedSupplyMatches`、`bodyPinStartContextMatches`、allocatingな`bodyPinReturnedInput`／provenance反射走査を、失敗writerの資格として呼ばない。特にclosed／first none／S.initializingを要求すると、記録が必要な停止後に資格を失う。

失敗用のorigin確認は、元private継続が保持する元参照とRの不変発行slotを固定比較するleaf案とする。Sが元issued=current、root rejected不在、元binding／BS／link／duty／control／T／failure、生成試行・metadataConfirmed・fixedCount9・build confirmedとBP01完了履歴を確認する。その後にだけ、**正規producerが固定化／seal済みで外部に渡していない元S**のbrandと不変metadata9を直接照合する。

この不変来歴が根拠であり、descriptor確認を失敗中に再実行して根拠を作る案ではない。元issued参照／固定metadataの不変性を証明できなくなった場合、未知候補を探索せず資格なしとする。元関係に不一致があれば、以前のqualified booleanだけで書かない。leafは固定直接比較・有限分岐だけで、配列／object／Error／keys列挙／descriptor／source値viewを確保しない。直接読取り自体がthrowすれば未確認として停止する。

| 資格区分 | 許可する更新 | 許可しないこと |
|---|---|---|
| R停止 | 同Rへのclosed・sourceStopRequestedの単調記録。source資格なしでも可能 | firstの上書き、source資格の捏造、参照clear |
| S停止 | 上のorigin確認とS.stopRequestedのstrict booleanを確認後、同SのstopRequestedをtrueへだけ更新 | healthy判定、claim消費、state／位置の修復、未知currentへの書込み |
| S失敗記録 | origin確認後、有限な元Sのfirst・state・claim・失敗位置とcaller prefixを確認。claim unused・state initializing又はfailedを要求し、既知の先行first／停止trueを許す | first noneへの巻戻し、BP04／preparingへの移行、不正progressを正値へ直すこと |
| seal後のclose | R停止と、資格があるSのstop bitだけ | 操作first／失敗位置／rejectClass／sourceRecord／disposition／seal／cacheの変更 |

停止資格と失敗記録資格は別である。Sの他のprogressに不整合があっても、originとstop bitの型が確実なら停止だけは可能だが、失敗位置等は補完しない。source自身のstop／firstが既に立っていてもorigin資格はそれだけで失効しない。未知literalは有限値へ変換してから書くのでなく、書込みを差し控える。

S又は元関係が未確認ならroot-onlyで診断し、sourceRecord withheldと元参照を保持する。source.stopRequestedを確認できない場合もrootの停止は残す。元Sではないcurrent／rejected、元TのI/C/J、別rootのsourceには書かない。

## 7 非割当ての失敗記録schedule

以下は元callerが実失敗を引き受けた場合だけの案であり、再入拒否の通知から呼ばない。理由・点・origin判定の局所値は有限primitiveだけとし、失敗writerより前にposition object／view／Errorを作らない。

| ID | 固定順と保持契約 |
|---|---|
| FD01 | 未sealを確認。root firstがnoneの場合だけ有限写像後の初回理由を記録。先行理由は触らない |
| FD02 | rejectClassがnoneの場合だけ元callerの最初の実分類を記録。returnedFailurePointと既存pin初回位置は最初の実失敗だけを保持 |
| FD03 | 元rootの現在route／call／段階原値を有限照合し、既存pin failure slotへ直接記録。位置が不正ならnoneで保持し、公開時だけunconfirmedへ投影。失敗prefix記録flagを後置する |
| FD04 | returned phaseをfailed、routeStateをfailedへ退役。postCheckedは到達原値を保持し、元claim・I/C/J・callee first／finalFailurePoint・source生成BP01履歴を変えない |
| FD05 | §6のsource記録資格を再確認。資格なしはsourceRecord withheld。元S.first noneなら実caller prefixからfirst→failurePhase→failureBoundary→state failedを直接記録し、完了後written。既知の先行firstがあれば理由／位置を保持してprior_preservedとする |
| FD06 | source記録／直接読取りのthrowはsourceRecord unconfirmedとし、root sourceStopRequestedを立てる。root firstを後発理由で置換せず、sourceへ再試行／rollback／残り代入の補完をしない |
| FD07 | rootの診断prefixとsourceRecord結果を保持後、既存confirmationDiagnosticRecordedを終端ownerへの記録完了markerとする。原始failure_pendingを元callerの固定出口へ返す。ここではseal／replyAttempt／cache生成なし |

sourceReasonは元S又は同Tから既に確認した有限理由だけを初回記録し、sourceが未確認ならconstruction_unconfirmedへ限定する。root first／pin first／source first／callee first／delivery firstは別軸。S側のinput_rejected写像はstate_invalid、元Sのreceiver_unconfirmed／post_unconfirmedは保持する。

FD03の有効位置は、開始前identity又はpre時のroot BP03 call after／S call。将来G_R後ならroot returned before／S after、G_A後ならreturned after／S afterを別枝で扱う。現在のcalling専用`recordBodyPinConfirmationFailure`へそのまま渡してreturned位置をnoneへ落とさない。旧writerは旧modeのまま維持する。

sourceRecordは最初の記録試行について単調に確定させ、written／prior_preserved／withheld／unconfirmedからnot_attemptedへ戻さない。部分代入後のfirstが残っても、unconfirmedをwrittenへ変更して成功扱いしない。BS shellは元参照・内容を保持するだけとし、旧mapperのBS.state failed化を自動で持ち込まない。rootの失敗／停止で利用を拒否し、未確認の下位責務を状態修復・clearで消さない。

## 8 失敗終端ownerへの一度限り受渡し

受渡しの条件は、同constructor mode・元public入場／外側frameの所有、元Rの失敗prefix／初回理由／sourceRecord結果の保持、未seal・reply未試行・cache空である。sourceの正常資格を終端ownerの入場条件にしない。そうしないと混入・停止後のroot-only失敗を終端化できなくなる。

受渡す物は既存Rのslotと固定primitiveの制御結果だけ。S/Tの所有権をcacheへ移したり、新FailureOwner／custody receiptを作ったりしない。`failed + diagnosticRecorded + sourceRecord確定 + 未seal`は診断待ちの内部状態であり、公開終端資格として受け付けない。

| 受渡し位置 | ownerと一度限りの扱い |
|---|---|
| 元callerが動作中 | 後発close／inputは先行記録又は非終端通知だけ。元callerが実結果・prefixをまとめる |
| FD07後 | 同元callerの固定出口が既存診断を確認。補助reason object・source値viewを再生成せず、mode別有限dispositionを決定する |
| seal | 操作理由・caller初回位置・source記録結果・dispositionを先行確定後、既存terminalSealedをtrueへ直接記録。ここが診断終端の論理確定点 |
| seal再要求 | 操作診断はfirst noneも含め不変。同cache状態の読取り又は既存配送拒否だけ。第2終端ownerは発生させない |
| 元caller退出を確認できない | 保持済みslotと元参照を残し公開拒否。未実施seal／handoff／replyAttemptを補完しない |

元caller自身はpublicBusy=trueのままsealできる。後発要求のbusy拒否と混同しない。非活動時closeは自分のpublic入場を所有して開始前閉鎖終端へ進めるが、returned開始claimは消費しない。構築前closeのfirst noneを維持する既存契約を、開始後のclosed失敗で上書きしない。

## 9 seal・返答生成・公開の分離

本書の受渡しは[既存の単一cache契約](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)へ接続する前提である。seal後だけ既存replyAttemptedを先行消費し、mode別strict候補を最大1回生成／freezeして同#fixedへ保持する。返答生成claimを開始claimやhandoffの代わりに先行消費しない。

| 失敗 | 保持と拒否 |
|---|---|
| 診断／source記録途中 | 元first・実prefix・部分source・元参照を保持。未確定markerを完了へ補完せず、未確認責務を残す |
| seal後・cache確保前 | 操作診断固定、failed_empty／配送view_unconfirmed。cache空でも再生成しない |
| cache保持後・外側復帰／公開失敗 | 元#fixedと診断を保持、failed_cached／配送root_exit_unconfirmed。再生成・再公開なし |
| 外側実復帰確認後 | frame false、元public入場、実result===元#fixed、private_cached・sealed・attemptedを全確認してだけreplayableへ進む |

新model／dispositionはR-b constructor固定のstrict契約で分け、旧C-cのallowlistへcastで混ぜない。開始だけ成功して後続未接続の場合はconstruction_unconfirmedで閉じる。`pin_prepare_not_connected`は将来PC08受理後の固定境界専用であり、開始成功／pre確認だけでは選べない。

materialize、freeze、busy解除、凍結cacheの存在はcleanup・借用退役・本文破棄・root終端成功の証拠ではない。再開しない保持と、一度限りの診断seal／返答生成は別の事実として確認する。

## 10 固定失敗例と保持責務

| 事象 | 固定結果 |
|---|---|
| foreign S／T、source同値copy／Proxy | 元Rだけbinding_mismatch。未知hook／相手書込み0、開始遷移0、元参照保持 |
| 元rootに先行input_rejected、その後close | root firstはinput_rejected、Sへ書ける場合state_invalid。closeによる停止は別に残す |
| first closed又はS.stop=trueで開始要求 | 開始消費0。healthy供給を再使用せず、§6で停止／失敗記録し元ownerへ |
| checking中の再入 | 新開始0・元first／rejectClass／S/T不変、refused_in_progress。元callerの後続は停止guardに従う |
| 消費後のview確保／checker throw | claimを戻さずpre失敗。root先行記録→資格のあるSだけ失敗記録→failure_pending |
| source記録前にcurrentが別参照へ変化 | root-only、sourceRecord withheld。元issued保持、未知currentを停止／失敗化しない |
| source記録途中でthrow | 部分sourceをそのまま保持、sourceRecord unconfirmed・root停止、残り代入／再試行なし |
| FD07後の後発input／close | 元callerの操作診断を保持。seal前は元所有経路で合流、seal後はdelivery／stopだけ |

SはR、I/C/JはT、BSは元construction ownerの保持責務のまま。新scalarやdiagnosticRecordedが立っても、その責務を解放済みとしない。部分生成・資格喪失・元caller喪失時の最終解放証拠はUnknownである。

## 11 費目・上界と非割当ての範囲

同R／元frameを費目ownerとする。既存4scalar／診断／cache枠の再利用、追加2原始scalar、固定分類・origin leaf・開始2代入、FD01〜07、source限定書込み・同期停止、元終端への有限制御移行を費目へ置く。source／利用claim／trial／call／FailureOwner／cacheを二重発行しない。

非割当ては失敗記録区間に、object／array／Error／closure／spread／template／反射結果・位置view・通知object・clockを新たに作らず、有限primitiveの分岐と既知slotへの直接代入だけを置くコード契約である。helperの推移的呼出しも監査し、bodyPinValues・bodyPinReturnedInput・allocatingな旧mapperへ迂回しない。JS call frame・JIT・GC等の物理allocation 0を保証する意味ではない。

CL番号／FD番号は操作種別であり、全guard数・work単位ではない。実E／S、unit係数、停止後の解消予約、全体work上界、layout／OOM、診断必着・cleanupはUnknown。新clock／UTC／deadline／残時間再計算・本番cap・実会計更新は行わない。

## 12 合成・compiled受入条件（すべて将来条件）

| ID | 必須対照 |
|---|---|
| CFV01 | fresh固定mode・同元入場だけ。旧R-a／C-c・失敗root／cache／公開summaryからの開始0、旧export／期待値／期限不変 |
| CFV02 | R/S/T・各元metadata関係の個別混入／copy／Proxy、未知hook・相手書込み0。source資格喪失後のroot-only保持も確認 |
| CFV03 | CL01〜10の独立優先順oracle。先行root／S／T first、sourceの有限理由、input_rejected写像、root-only stop／source-only stopを別々に注入 |
| CFV04 | 未使用からcheckingへの実遷移最大1。前拒否は0、消費後throw／close／重複でも再消費0、開始群の2代入・非介在をAST固定 |
| CFV05 | healthy供給の失敗が停止writerの拒否理由にならない。stop=true／first先行でも正規originなら限定書込み可、origin喪失なら元Sにも書かない |
| CFV06 | 原始slotの不正literal、metadata未確認・生成途中、同値flagだけの偽装を拒否。固定期待値や以前のqualified値を再入力しない |
| CFV07 | FD各境界のthrow／close／再入、source部分書込み・sourceRecord unconfirmedの保持。初回理由／caller位置／callee診断・生成BP01履歴を独立確認 |
| CFV08 | 失敗writerと推移的helperの非割当て監査。object／array／Error／closure／反射／値view／clock／通知経路の混入を検出 |
| CFV09 | 活動中の後発要求はseal／replyAttempt／cache 0、元callerだけが終端化。handoff途中・元caller喪失を成功へ補完しない |
| CFV10 | seal→最大1回materialize→同cache→実外側復帰／公開。failed_empty／failed_cached・同object再読・後発closeを分離し、再生成／再公開0 |
| CFV11 | private開始／source書込み／終端継続・不正状態組・公開codeからの能力復元をsemantic compile-failで拒否。別の型不一致だけで成功扱いしない |
| CFV12 | strict有限projection・秘密非出力・fixture梱包混入0、G_R／G_A・実受理・BP04／C-03・claim消費・bind・ready・body・正式発行0を実field／trapで確認 |

oracleは本体のbuilder／checker／分類表／counterをimportせず、有限eventから開始回数・初回理由・位置・書込み対象・未実施suffixを計算する。群途中の局所破損はcompiledだけで扱い、通常scriptのhookで群を分断しない。構文エラー・anchor不一致・別guardでの拒否は目的節の検出へ加算しない。

R-a等価5節・C-c等価31節と従来の単一owner判断は、新modeの到達範囲が変わる時点で再評価する。旧試験を残し、値契約・元class／frameの保証・compiled局所保証を区別する。CFV条件は本書作成時点では未実施である。

## 13 別承認後の分割案

最初に狭い内部型・先行2scalar・origin leaf・固定拒否／非割当て記録の閉鎖契約を準備し、開始消費はまだ呼ばない。次に同元入場の開始消費と、後続未接続時の固定失敗／元終端への受渡しを対で接続する。開始だけを成功公開したり、健康なsource資格を失敗終端の必須条件にしたりしない。

その後のreturned pre／post全照合・G_R／G_A・受理後guardは別の承認範囲とする。C-03・実session／source／worker／runtime・実通信・正式発行・全体受付の解禁は含めない。本案の分割／2scalarは未実装で、旧modeへ先行適用しない。

## 14 今回の文書作業と確認範囲

開始時HEADは冒頭の`0e35e85`、worktree／indexはclean。新しい本書と親2文書の版／参照だけを更新し、親の既存§1以降の本文・実装記録・レビューは全byte保持する。ソース・試験・compiled・CHANGELOG・設定・manifest／lockfileには触れない。

ローカル参照・表列数・節順、CL01〜10／FD01〜07／CFV01〜12の欠落／重複・順序、親本文保持、MD3件だけの差分・基準HEAD／index・行末整合を確認する。build・試験・梱包・実装・index登録・コミット・Pushは行わない。文書整合は開始claim・失敗終端・cleanupの受入結果ではない。

文書検証結果：3文書のローカル参照21件、30表の列数、節順（本書14・親16／19）、CL／FD／CFVの計29IDに欠落／重複なし。親2文書の既存§1以降の本文・レビュー／実装記録の全byte保持、Markdown3件だけの変更、基準HEAD不変・index空、diff --checkを確認した。将来の受入条件は未実施である。

## 15 閉鎖契約だけの合成実装（2026-11-13）

package除外の既存classへprivate3method、module-privateの有限検査／理由写像7関数、先行2scalarを追加した。新factory／export／constructor flagは追加せず、既存404method本文を変更していない。2scalarは同classの最初のinstance fieldとしてliteralで初期化し、既存のfield確保／constructor部分生成より前に保持する。

| 限定実装 | 今回の意味と非接続部分 |
|---|---|
| 狭い型 | RejectClass7値、SourceRecord5値と閉鎖段階のsubset3値、claimedを含まないClosedCode4値、noneにはnot_attemptedだけを許す診断組。written／prior_preservedの実証拠や生成口は作らない |
| origin leaf | 元R／issued=currentのS・rejected不在、生成前提／BP01履歴、不変metadata9と元binding／BS／link／duty／control／T／failureを固定比較。source state／stop／first・rootの健康状態・receiver状態は資格に含めず、反射・配列・値view・進行更新なし |
| 固定拒否 | 同合成C-c元frameのscratch観測からだけ呼ぶprivate準備method。非所有／seal済み／使用済みを固定拒否し、初期段階のroot／source／callee先行理由・停止・origin不一致・観測throwを有限分類。正常でもcontinuation_unconnectedでfailure_pendingへ閉じる |
| 非割当て記録 | root firstと先行2scalarだけを記録し、初回理由・分類・sourceRecordを後発拒否で上書きしない。sourceRecordはnot_attempted／withheld／unconfirmedだけで、sourceを書いた／先行記録を確認したという完了値は出さない |
| 実行閉鎖 | 元fixtureのreturnedClosedRefusal呼出しsite 0。returned4scalarの代入site 0。source／BS／T、claim・route・failure位置／diagnosticRecorded・seal／attempt／cacheには書かない |

origin確認のtrueはprivateな読取り結果だけで、停止／失敗writerの発行口ではない。先行source first・stop trueでもoriginは保持される一方、healthy供給は拒否される。未知候補・同値copy・元保持参照の喪失はoriginで拒否する。旧modeへこのleafを先行適用したり、古いqualified値を持ち込んだりしない。

既存C-cの正規来歴をscratchで使う限定正例であり、新R-b mode・実callerの所有証明は未追加。固定拒否のchecking／使用済み枝も値注入対照だけで、開始消費を伴うCL全順序・FD01〜07全体の実装ではない。root-onlyの原始診断を保持するところまでで、phase failedへの退役、source書込み、元終端ownerへの受渡し・sealは次の未接続範囲である。

旧R-b準備試験の「開始／受理writer 0」監査は、元の4scalarを明示して新診断2scalarと分けた。作業中に加わった前段レビュー補強（到達確認・偽装view対照・等価節等）は保持し、その変異監査を今回の実績へ加算しない。今回の独立対照・初回失敗・関連回帰は[閉鎖契約検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_RETURNED_CLOSED_2026-11-13.md)へ分離する。

CFV全体、同modeの運用入場・開始claim・返却全照合・G_R／G_A・受理・C-03・body・実接続は未完了のまま。root／source／callee／delivery診断の役割、単一cache、停止後の保持責務は将来契約として残す。物理allocation 0・実E／S・全体work上界・cleanup／借用退役はUnknownである。

## 16 閉鎖契約の等価節と判定順（レビュー修正、2026-11-13）

§15の閉鎖契約への一時変異78件のうち、修正後のcompiledでも検出できない27件を等価として記録する。いずれも現在の到達範囲で観測値が変わらないことを根拠とし、開始claim・失敗終端を実接続するとき又は呼出し元を増やすときに再評価する。

| 変異（件数） | 等価の根拠 |
|---|---|
| 入口検査の二重化（12）：拒否methodの所有4節（finalPost／finalEntry／frame／public入場）・使用済み3節（seal／reply attempt／cache）・phase非not_started節、記録methodの所有・使用済み・checking・phase非not_startedの各節 | 拒否methodと記録methodが同じ所有・seal・attempt・cache・phase検査を持つ。拒否method側を外しても記録methodが同じ固定codeを返し、記録method側を外しても拒否methodが先に返す。記録methodの呼出し元は拒否methodだけで、単独の入口にはなっていない |
| originの存在検査（6）：`source === undefined`・binding・BS・link・duty・exit slot値の真偽 | 直後の参照比較（issued／current一致、`source.binding === b`等）が先に偽になり、参照外しへ到達しない。undefined候補もissued比較で拒否される |
| originの固定mode節`bodyPinFinalPost === true`（1） | 呼び出せるのはscratchで既存C-c継続へ挿入した観測だけで、C-c factoryは常にtrueを渡す。新R-b modeを発行する時点で再評価する |
| 生成後に変更できないmetadata（2）：brand・custodian | sourceの生成時に固定され、issued=current参照一致を通った候補では常に成立する。同値copyや未知候補は参照比較で拒否済み |
| startの相互重複（2）：`source.start === start`と`b.target.start === start` | 正規sourceではsource.startとbinding.target.startが同じTを保持するため、片方を外しても他方が同じ候補を拒否する |
| 型で固定されたliteral引数（3）：記録methodのkind／record有限検査、`RejectableKnown`のnone除外 | 呼出しはすべて拒否method内の固定literalで、noneや未知値を渡すsiteがない。不正呼出しはsemantic compile-fail対照で拒否される |
| sourceRecordのnot_attempted条件（1） | 書込みはrejectClassがnoneのときだけで、そのとき診断組検査（noneにはnot_attemptedのみ）を通っているため、sourceRecordは常にnot_attemptedである |

判定順の注記：§4の表ではCL07（checking中／使用済み）がCL06の後に並ぶが、実装はCL02の直後、root first検査（CL03）より前で判定する。後発要求で元firstとrejectClassを変えないという§4の趣旨には、この順序の方が合う。CL01〜10の全順序は開始claimを接続するときにCFV03で確認する。

修正後にcompiledだけで検出する50件は、診断組・role・理由写像oracle、origin単項17件・foreign、停止／先行失敗13件（receiver 3件・非boolean停止3件を含む）、不正slot5件と不正状態×withheld経路3件、identity点、使用済み7件、初回記録保持、origin throw、最先行AST・非割当て・semantic拒否で確認した。Vitestで検出する1件は先行2scalarの初期値である。
