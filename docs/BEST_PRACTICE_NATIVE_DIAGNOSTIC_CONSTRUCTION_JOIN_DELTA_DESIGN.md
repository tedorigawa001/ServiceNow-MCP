# 旧rootの部分生成回収とJoinCell生成公開の差分詳細設計

Version: native-diagnostic-construction-join-delta-draft-0.2 / Date: 2026-11-16。
Status: CP00〜05の回収anchor・保護区間・failure copy・失敗専用closeだけ限定実装（§11）。設計基準HEADは`79aef94`、実装基準は`1707e8d`。[CF制御設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_CF_CONTROL_RESOURCE_DESIGN.md)§3／5／7／10に対する差分であり、active JoinCell生成・公開・dispatchとCP06は未接続である。

部分生成の失敗を同ownerへ戻す経路を先に作り、その回収先を確保できた場合だけJoinCellを生成・先行保持する。空cellの存在、Promiseのsettle、public診断のsealは、生成完了・resource解放・正式受理の証拠ではない。

旧入口・旧試験・期待値を維持する。正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、Unknown、通常経路未切替、VM／監視／telemetry調査保留、LOAD6／LOAD7選択とAP01〜06未承認を維持する。§11の合成依存による限定実装・検証以外は進めず、build／runner設定変更・実接続・実通信・実機操作・公開・コミット・Pushは行わない。

## 1 draft 0.1時点の現行と設計差分

| 対象 | 現行の事実 | 追加する契約 |
|---|---|---|
| 準備の生成 | [旧creator](../src/review/abort-scope-evidence-native-diagnostic.ts)はupper／writerの後にholderと6objectを生成・freezeする。生成区間のcatchはない | 先行回収anchorと失敗専用facadeを用意し、各生成・freeze・照合を保護する。未生成のconstや正常snapshotへ依存しない |
| 部分保持の試験 | [6prefix試験](../tests/review/fixtures/native-control-preparation-model.mjs)がscratch側のcatchで参照を保持する | 製品側の同owner保持・失敗copy・closeを別の合成条件で検証する。旧6件を製品回収の成功へ加算しない |
| 同owner検査 | canonical参照と全fieldの空値を同時に検査する | 常時不変のidentity／readonly topology検査と、空／生成中／公開済み等の段階別検査を分離する |
| join公開 | `runWork`／`cleanupWork`はPromise executor内のenqueue呼出し後に代入される | Promise生成はresolver捕捉だけ。root内部への保持・全post確認が済むまでqueueを呼ばない |
| 外側保持 | ND-03の`owner = construct...`はcreator復帰後の代入。途中throwならownerは未設定 | 旧root内のprivateな二段階構築でfacadeを外側固定slotへ先に保持し、それから保護対象を構築する |
| copy生成 | [state](../src/review/abort-scope-evidence-native-diagnostic-state.ts)のreject／stop／snapshotは割当てを伴う。sealはsealed更新後にcopyを作る | 理由と進行位置の先行scalarを先に保存する。seal呼出し成功とcopy取得成功を分け、copy失敗時も参照を消さない |

ここで「公開」は旧rootのprivate join slotへ同Promiseを保持する点であり、resolverや新しい操作口をcallerへ出す意味ではない。既存executeが返すPromiseとcloseのwrapperは従来の公開面のままにする。

## 2 回収anchorと保持先

名称は同creator／旧root内だけの内部契約案で、export・raw受付・global登録・外部installerを追加しない。freshな回収anchorの実参照が構築単位を識別し、後段のRootControlLink origin／bindingとは同値比較しない。

| 保持先案 | 固定field群と所有者 | 寿命と制限 |
|---|---|---|
| RecoveryAnchor | upper生成結果、既存6準備slot、失敗facade、run／cleanup用生成途中slot、failure copy slot | 同creatorだけが書く固定slot。upper・部分生成物を得た直後、次のfreeze／bind／observerより前に保持する |
| 構築scalar | 最後に保持した固定checkpoint、構築中／停止済み／ready、copyの未試行／準備中／ready／失敗、closeの未開始／処理中／完了／未確認 | 外部依存より先に初期化。最初の理由は既存root primaryを使用し、別のrun primaryを作らない |
| 失敗専用facade | 既存execute／stop／close／diagnosticsの4method。closureは同anchorだけを捕捉し、未生成Linkを参照しない | 正常継続が未接続なら実行拒否だけ。live handle、writer、resolver、anchorは返さない |
| FailureCopy | 同upperから取得した封印済みsnapshotと既存の固定operations／counts／permissionsを組み合わせた値copy | 1成功copyを保持。部分参照・例外・checkpoint・writerは含めない。権限・再構築入力に使わない |
| 生成途中JoinRuntime | 同anchor／root／kind／空seed、work、role別settler、生成prefixと一度限り履歴 | runとcleanupで各1固定slot。生成途中から同slotに保持し、別ownerへ救済移譲しない |

新anchorは可変traceや第二のsession／claim台帳ではない。既存primary／revoked／started／current／last・sampling・issue／consume claimは1組を維持する。checkpointは構築の保持位置だけ、JoinRuntimeの履歴はqueue制御だけを表し、run phaseやbudgetを複製しない。

空seed側の6objectはfreeze後に書き換えない。現行holder自体はmutableであり、freeze済みとは扱わず、保持中の6参照をcanonical constへ照合する。active用のJoinRuntimeは空seedを同参照で指す別のprivate固定slotとし、EmptyJoinCellのnull／false型を緩めて実Promiseを詰め込まない。同ownerの正規生成だけがこの対応を作り、診断copy・同値seed・任意Promiseから復元しない。

## 3 保護区間と固定構築順

保護するのは制御可能な同期throw・故障注入・不正復帰であり、process終了・強制停止・任意のOOMからの完全回復を保証しない。回収anchor自体を生成できない場合は「同owner回収未成立」で、未生成のupperや成功copyを補完しない。

| ID | 区間と保持順 | 失敗時の出口 |
|---|---|---|
| CP00 | 呼出し側の固定保持slot・原始scalarを用意し、RecoveryAnchorの生成を試みる。raw／budget／Responseは読まない | anchor未成立。固定internal_review_errorへ正規化できる範囲だけ正規化し、root診断は未取得のまま。native取得・dispatch 0 |
| CP01 | anchor保持→state creatorの結果を保持→同upper bind→固定writer保持 | 取得済みupperだけを使うbootstrap失敗。未boundをboundと報告しない。facade未成立なら呼出し側が固定拒否し、既存の外側finallyを省略しない |
| CP02 | 失敗専用facadeを構築し、旧入口／driverの固定slotへ同参照を保持。正常継続はまだ無効 | facadeの割当て／freeze／保持確認失敗はbootstrap失敗。正常ownerとして返さず、外向きは既存BoundedReadErrorのinternal_review_errorに固定（例外生成可能な範囲）。例外本文を転送しない |
| CP03 | 先行6slotを用意→origin→root→run空cell→RunLink→cleanup空cell→duty。各段階は同参照保持→freeze→post確認 | facade保持済みなので同anchorへ戻る。保持済みprefixを残し、未生成のcanonical constをcatchから参照しない |
| CP04 | identity／空段階全検査→既存raw strict検査→正常closure／返却aggregateの構築・freeze・同参照確認 | failure copy経路へ固定。raw拒否はinvalid_input、同一性不一致はevidence_binding_mismatch、生成throwはinternal_review_error |
| CP05 | 全post成功後、同facadeに正常継続をprivateに結合し、最後にreadyを一度確定する | ready確定前の任意失敗は失敗facadeのまま。bindの再試行・別normal ownerへの差替え・失敗後ready化をしない |
| CP06 | 初回executeで同ready確認→元startedを消費→同runのJoinRuntime生成区間へ入る | 正常継続へ入れない場合はfailure copyまたは既存再execute拒否。第二workで救済しない |

CP02の保持は同旧root内の直接代入で行い、callback／installerをcallerから渡す方式にしない。ND-02 wrapperは同facadeを保持してからprivate初期化へ進む。ND-03のdriver beginもowner slotへ同facadeを保持してから初期化し、constructor復帰待ちの代入だけに依存しない。§11の限定実装でこの配置へ変更し、未接続のCP06以降とは分ける。

ND-02では保護対象の失敗後も同じ失敗専用facadeを返せるが、ND-03のbeginはprivate readyが成立しなければ固定BoundedReadErrorをthrowし、実class側のcatch／finallyへ進める。codeは既存upperのpublic写像に合わせ、コピー診断をready資格へ昇格しない。停止通知が失敗してもbeginを正常復帰させず、後続のreserve／parent／release dispatchを止める。失敗facadeはowner slotに残るので、closeと診断取得は別に可能な範囲で行う。

失敗catchは同anchorに保持済みのfieldだけを読む。state creatorが復帰する前の内部部分生成物はanchorから取得できず、CP01で同upperの回収済みと扱わない。BG01 state内部の再設計は本差分に含めず、このbootstrap残差とnative操作0を区別して記録する。

部分構築の再実行、凍結されなかったobjectの外部公開、別upper生成、getter再観測、budget／schedulerによる復旧は行わない。CP00〜02にはfacade未成立の残差があるため、全生成位置で必ず4methodを返せるとは主張しない。

## 4 failure copyと診断の固定順

構築失敗時は、既存primaryへの最初の固定code保持→revokedと正常継続の無効化→失敗checkpoint保持→同upperへのreject／stop→必要な既存bridge stop→seal／copy取得、の順とする。最初のscalar群は割当て・外部通知より前で、通知失敗／copy失敗が元codeを上書きしない。readyの巻戻しやstarted／dispatch claimの復活はない。

| 原因 | code／stageの契約 | 保持する区別 |
|---|---|---|
| 構築・freeze・copy前段の例外 | internal_review_error／binding | 例外のname／message／stack／未知値は保存・出力しない |
| 同owner／canonical参照不一致 | evidence_binding_mismatch／binding | public_codeは既存upperのinternal_review_error写像を使う。foreignの理由・台帳には触れない |
| raw不正 | invalid_input／binding | 未読rawを後から検査して、先行構築失敗をinvalid_inputへ置換しない |
| 再execute | 既存invalid_state／acceptanceとrequest_rejected | cleanupへの正規合流まで重複として拒否しない |
| runのPromise／queue制御異常 | internal_review_error／stop | 構築理由・既存HTTP理由が先なら保持する |
| cleanupのPromise／queue制御異常 | internal_review_error／cleanup | native cleanup理由を新しい制御理由で上書きしない。未実行操作をconfirmedへしない |

failure copyの公開shapeは既存kind／scope／phase／upper／operations／counts／token_held／request_rejected／foreign_unchanged／7permissions=falseを維持する。CP03〜05の取得前失敗ならphase=closed、operations／countsは0、token_held=false。upperのHTTPは未観測、cleanup・teardownはnot_startedを維持する。noResponse、no_body、cleanup confirmed、self-teardown confirmedを捏造しない。

copyは同upperの封印snapshotを取得できた場合だけ完成とする。同upperのprimaryが元の先行理由と既存public写像に整合し、stopped／sealedを確認できることも必要である。upper記録が失敗してprimary未設定のままなら、正常に見えるsnapshotをfailure copyとして返さずcopy不能とする。upper.sealが内部scalarを更新した後にthrowする可能性も扱い、「sealを呼んだ」「sealedになった」だけでcopy readyにしない。上位停止通知、upper記録、seal、copy組立ての各成否は固定scalarへ分離し、後段の処理は可能な範囲で一度ずつ試みる。

seal／copyの生成区間は合計一度だけ試行する。成功copyは同slotへ保持してから返し、close／diagnosticsは同copyを再利用する。copy生成に失敗した場合はcopy状態を失敗に固定し、正常snapshotへfallbackせず、同anchor・prefix・元理由を保持する。facadeのdiagnostics／close／executeは固定internal_review_errorで拒否し、無限pending Promiseや呼出しごとのcopy再試行で代用しない。外向きErrorを生成できないprocess障害まで回復済みとはしない。

通常のready ownerのdiagnostics／seal動作をこの失敗専用copyへ一括置換する変更は含めない。正常経路のcache方針や公開fieldの増設は別レビューとする。

## 5 JoinRuntimeの段階型と公開点

同owner検査は、最初にcanonical実参照を比較する不変部分と、JoinRuntimeの段階・対応fieldを検査する部分に分ける。段階に応じてkindやseed・workの検査を省略してはならない。空seedのcheckerを単にtrueへ緩める変異は拒否する。

| 段階 | 保持状態 | 許される次操作 |
|---|---|---|
| empty | 正規空seedのみ、active slotなし | 同ownerが一度だけ生成claimを消費 |
| building | 同runtimeを生成途中slotへ保持、work未確認、resolverは未取得または同executorから取得 | 固定executorとpost検査だけ。queue・normal body・外部callback 0 |
| published | 同native Promise／resolverを保持し、全post成功。private work slotへ同参照を公開済み | dispatch claimを一度消費。再入は同workへ合流または既存の拒否 |
| dispatching | enqueue呼出し中。dispatch claim済み、entry未開始 | 正常復帰確認のみ。同期callbackではbodyを起動しない |
| queued | enqueue正常復帰済み、entry claim未消費 | 同owner／cell／履歴を照合しentryを一度消費 |
| entered | 同taskが開始済み、退出未確認 | 同taskの完了・throw・固定finallyとcleanup責務の処理 |
| settled | 同resolverを一度使用済み、制御結果固定 | 読取り合流のみ。cleanup確認の意味は持たせない |
| failed_retained | 生成／公開／dispatchの失敗prefixと同参照を保持 | 可能なら同workを一度失敗終端。再生成・再dispatch・新しいnative操作は禁止 |

生成claim、dispatch claim、entry claim、settle claimは各slotの非返却履歴である。段階を巻き戻してclaimを再生しない。runとcleanupでbrand／kindを分け、双方の結果型も混ぜない。生成中の参照とPromiseをpublic summaryへ出さない。

runのworkは既存snapshot型のPromiseで、同executor由来のresolve／rejectを固定pairとして捕捉する。copy readyならresolveへ同copyだけを渡し、copy不能ならrejectへ固定internal_review_errorだけを渡す。cleanupのworkは既存Promise&lt;void&gt;で、制御失敗も同ownerへ記録してresolve(undefined)する。cleanupのvoid終端をcleanup confirmedと解釈せず、後続issueは既存guardと実factsで拒否する。role別settlerの取り違え、runを失敗理由未記録のままrejectする実装、copy不能なのにresolve待ちを残す実装を負の対照にする。

公開後のworkは一つを正とし、接続時は旧runWork／record.cleanupWorkの内部参照を同workへ統一する。旧変数と新cellに別Promiseや独立更新履歴を並存させない。既存public wrapper Promiseまで参照一致を要求せず、下位work・dispatch回数・操作数を照合する。

## 6 生成からdispatchまでの固定同期schedule

1. 同ready／root／kindと生成claim未使用を確認し、claimを先に消費する。cleanupの場合は同recordの固定cleanup資格を確認し、run停止だけを理由に必要なread-only cleanupを拒否しない。
2. 同JoinRuntimeを生成途中slotへ保持する。Promise生成前にその保持と失敗先を確認する。
3. 捕捉済みPでPromiseを一度生成する。executorは同roleのsettlerを同runtimeの先行fieldへ保持するだけで、enqueue・sample・writer・native操作・任意callbackを呼ばない。
4. 生成されたworkを同runtimeへ即保持する。Promise種別・kind・同executor由来settler・同root／seedを固定postで確認する。settlerだけ取得した失敗prefixも消さない。
5. 正規private work slotへ同Promiseを保持し、全postを行う。この最後の成功をpublished確定点とする。公開済みでもdispatch資格が自動的に増えるわけではない。
6. 同owner／公開済み／未dispatchを再確認し、dispatch claim消費→dispatching→既存enqueueを1回呼ぶ。Promise生成とqueue登録を同じexecutorに戻さない。
7. enqueue正常復帰後だけqueuedにする。同期callback、throw、登録後throwは失敗とし、後着callbackが来てもentryを許可しない。別queueや新timerで救済しない。
8. 正規queued callbackは同参照とentry履歴を確認してenteredへ進み、同じ旧taskを一度だけ実行する。停止したrunは取得へ進めず、cleanupは既存同duty・元floorのread-only責務だけを処理する。
9. 同task退出と必要な固定後処理を確認し、settle claimを先に消費して同roleのsettlerを一度使う。runのcopy不能は固定reject、cleanup制御失敗は記録後のvoid終端とする。resolveへ任意thenable・native handleを渡さない。copyの例外を別taskの未観測rejectへ逃がさない。

step 2〜5の間には外部callback、await、clock、budget、native getterを挟まない。故障注入は試験側の固定位置だけで行い、製品rawへscheduler／resolver／故障scriptの新しい受付を作らない。captured intrinsicの変更・prototype故障は既存の評価前／評価後の区別を維持する。

runには同run slot、cleanupには同recordのcleanup slotを公開先とする。公開前の失敗でも生成claimは戻らず、同workが取得済みならその失敗終端を一度試みる。work未取得なら別Promiseを「同work」として作らない。未公開のため合流不能であることを固定診断へ残し、facadeは固定失敗を返す。

## 7 失敗位置とclose責務

| 失敗位置 | 保持・終端の責務 | closeで禁止する処理 |
|---|---|---|
| anchor／facade成立前 | 取得できた固定保持先だけを使用。ND-03の外側driver／session finallyは独立して継続する | native=nullを「native回収確認済み」に変えない。存在しないownerへ操作しない |
| facade成立後・準備途中 | 同facadeがanchorとprefixを保持。同期停止→failure copyの一度試行 | 初回closeでclosedを元構築理由より優先しない。未取得cleanup／teardownに確認creditを付けない |
| Promise生成途中 | 生成claim、取得済みresolver／workを同slotに残す。workがあれば可能な一度終端を試みる | 第二Promise／第二resolver生成や、空seedへの巻戻しをしない |
| published後・dispatch前 | 同workの制御失敗を固定し、後続dispatchを拒否する | stop／closeが別のqueueを登録しない |
| enqueue異常・後着callback | 元cellと先行理由を保持し、entry拒否・同workの一度終端。未確認callback退出は別に残す | Promise settleをcallback退出確認やresource解放確認と同一視しない |
| cleanup未開始・resource既取得 | 同record／readerIdentity・未実行prefixを保持。生成／queue失敗をcleanup制御失敗として記録 | cancel／releaseを実施したと補わない。queue再試行・新floorで処理を再開しない |
| entered後の正常／throw／取消 | 元のfinallyと同cleanupへ合流。token退役、native cleanup、外側class closeを別軸で保持 | token teardown confirmedだけでreader／session／予約返却を確認済みにしない |
| failure copy／close失敗 | 元code・保持先・未確認責務を残し、固定拒否で終端。再closeは同結論 | 再seal・再copy・二重cleanup・未知参照のclearをしない |

closeの試行履歴は割当て・通知・awaitより前に消費する。再入／重複closeは同下位work／同copy／同固定拒否へ合流し、第二の回収runを作らない。dispatch claim未消費の構築失敗closeはnative・budget・schedulerを呼ばない。公開後のcloseは元workへjoinし、新しい60秒／10秒・第二sample履歴を作らない。

upperの診断終端とprivate保持の退役は別である。slotを空にするには当該producer／callbackの退出・同work終端・所有退役の確認が必要で、失敗copyの返却だけでは十分でない。未確認prefixはanchor／dutyに残し、GCやcallerの参照破棄を最終discardの確認に数えない。外側custodyへの移譲と最終discardは別gateのままである。

ND-03は旧root内のdriver.close・parent bytes disposeと、実class側session close／予約解放の所有者を分ける。実classの[既存probe finally](../src/servicenow/bounded-read.ts)にはclose→dispose→session closeの独立finallyがある。draft 0.1時点の旧root外側は`await driver.close(); driver.dispose();`で、closeのreject時に後者を省略し得た。§11で外側も独立finallyへ変更したが、解放成功は試行だけで補わない。

draft 0.1時点のdriver.disposeは内外のfinallyから呼ばれ得て、毎回bytes.fillを行っていた。§11では同driverの固定disposal claimを処理前に消費し、重複入口を同じ試行結果へ合流させる。一度目のfill失敗も成功へ補正せず、二度目のfillで救済しない。session close／予約返却のreceiptとは共有しない。

旧bridgeのstopは元の先行理由を固定し、notifyingのfinallyで通知中状態だけを解除する。構築失敗通知がthrow／再入しても同anchorを失わず、外側停止／closeを省略しない。新しいbridge call site／任意通知口は作らず、旧rootの固定stop継続だけから通知する。

## 8 将来の合成受入条件

以下は合成依存限定の将来試験で、今回は実行しない。oracleは固定生成schedule・同一性・操作数・元floorから作り、旧runnerのactual値copyで作らない。

| ID | 故障・対照 | 受入条件 |
|---|---|---|
| CJ01 | anchor／state／facade未成立 | 各prefixを区別。native／dispatch 0、診断未取得を成功copyで代替しない。外側finallyの残差を記録 |
| CJ02 | origin〜dutyの各保持前／保持後／freeze後／post失敗 | 同facade／upper、最後の保持prefix、先行理由を保持。未生成const参照による二次例外0、foreign不変 |
| CJ03 | upper reject／stop／bridge stop／seal／copyの各throw | 先行scalarが先。後段の固定試行を省略せず、copy試行1以下。copy不能なら固定拒否、秘密出力0 |
| CJ04 | failure copy取得後の重複close／diagnostics／execute | 同copyを再利用、再構築・再seal・native操作0。失敗後ready化を拒否 |
| CJ05 | copy失敗後の再入／close | 同保持slotと元理由不変。copy再試行0、無限pendingによる代用0、未確認をconfirmedにしない |
| CJ06 | 空／building／publishedのfield・kind・seed・owner変異 | identityの不変検査と段階検査が独立して拒否。copy／Proxy hook 0、holder値をcanonicalへ昇格しない |
| CJ07 | Promise executor・work保持・private公開の各失敗位置 | 生成claim非返却、取得済みresolver／workの保持、queue 0。公開post前にdispatchする変異を拒否 |
| CJ08 | 正規async queueと重複execute／clean／close | run1・cleanup1、同private work、queue各1以下。public wrapper参照一致を代替条件にしない |
| CJ09 | 同期callback／throw／登録後throw／後着・二重callback | publishedがenqueue前、正常復帰前entry 0、entry／settle各1以下、再dispatch0 |
| CJ10 | dispatch前／entry前の取消とcleanup中close | run取得0または元位置までのprefix、必要cleanupは同duty／元floor。第二timer・floor再計算0 |
| CJ11 | resource取得後のcleanup cell生成／queue失敗 | 同record／readerIdentity保持、未実行cancel／releaseのcredit 0。制御失敗とnative事実を分離 |
| CJ12 | ND-03 begin途中・close reject／dispose throw | 先行facade保持、close・dispose・session closeを独立確認。parent bytesの試行と成功を区別し、最初の理由不変 |
| CJ13 | 正常／throw／取消の全post・close・late settle | 元HTTP／native facts・sealed copy不変、token0、未知責務の誤clear0。native容量・全解放はUnknown |
| CJ14 | source／compiled／配布境界の負対照 | 旧4export・5fault・strict入力・7permissions=false維持。新setter／adoption／bridge口・fixture台帳共有・配布混入を拒否 |

旧source／compiled試験は残す。scratch prefixだけでなく製品の保護区間と固定driverの連続失敗を別に確認する。新compiled検査は固定出力だけを使い、TS／隣distへのfallbackなし。専用artifactやchild終了契約の完成とは数えない。元5秒・既定並列度、旧比較child60秒、製品全体60秒を変更しない。

## 9 実装順と停止gate

CP00〜05の先行保持・保護区間・failure copy・失敗専用closeを§11で合成依存に限定して実装し、CJ01〜05／12／14のうち検証した条件を記録した。全matrix完了とはしない。JoinRuntimeの段階型・生成／公開は次工程で、queueへ接続しない。bootstrapの回収限界とcopy不能時の公開拒否を維持できない場合はここで停止する。

次に同Promise／resolverの生成とpublishedまでを接続し、CJ06／07をsource／compiledで確認する。その後だけdispatch／entry／settleへ進み、CJ08〜11／13と既存回帰を確認する。cleanupのqueue失敗は正常処理の単なる移動ではなく追加の故障契約として扱う。

active resourceとの全結合、RetainedDuty・外側custody／最終discard、新LM03、旧UN62移行、専用build／実行／stdio終端、friend撤去・AP承認は別gateに残る。正常経路の切替や正式発行を、このMDの作成で承認したことにはしない。

## 10 draft 0.1の静的確認と未実施範囲

旧rootの先行6slot、同owner checker、run／cleanup executor内のqueue、外側driverの生成／close、stateのreject／stop／seal／snapshot、実classの独立finallyと既存6prefix試験を読んで対応付けた。CP00〜06とCJ01〜14は設計IDであり、試験成功件数ではない。

sourceの構文解析でexecutor内のqueueを持つjoin代入2か所とbridge call site 4か所を照合し、旧root外側のclose→disposeの連続とscratch専用catchを確認した。3文書のローカルリンク28件・表20個、CPの7行とCJの14行の重複／欠落0、末尾改行・差分空白を静的確認した。ソース・試験・CHANGELOG・package／build／runner設定の差分は0である。

本書と親2文書だけを更新する。製品moduleのimport／実行、試験再実行、build／pack、native操作、依存導入、実接続・実通信・設定変更・コミット・Pushは行わない。以前の222件・compiled6本成功は履歴であり、本書の新契約の検証結果として再掲しない。

## 11 CP00からCP05の限定実装

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のprivate allocate／initializeに分け、同anchorへstate・writer・失敗facadeを先に保持する。正常継続は空seed・raw strict検査・正常aggregateのfreezeと最終同owner post後にだけ結合する。旧wrapperは同facadeを返し、ND-03 beginはfacadeをowner slotへ保持してから一度初期化し、private ready不成立なら固定拒否する。公開stopは引数なしの取消に固定し、既存内部driverのcode付きstopとは分離する。新export・採用口・登録台帳はない。

最初のprimary・revoked・sealed・phaseは正常継続と同じclosureに1組だけ置く。構築失敗ではそれらを先に固定し、upper reject／stop、既存stop通知、seal／copyの固定順を個別tryで進める。copyは同upperの停止・seal・理由整合を確認できた時だけ完成する。copy不能は固定拒否に終端し、再close・再execute・初期化再入で再生成／再sealしない。anchorと部分準備はclearせず保持する。

ND-03の外側closeとdisposeは独立したfinallyにし、同driverのdisposal claimを処理前に消費する。内外からの重複disposeは同結果へ合流し、fill失敗を再試行しない。先行HTTP／構築理由をcleanup異常で上書きせず、実class側の既存session close／予約返却とは別責務のままである。

[source試験](../tests/review/native-construction-recovery.test.ts)は実constructorのfreeze失敗・copy不能と実class／fake I/Oのbegin失敗・close失敗・dispose失敗を確認する。[固定oracle](../tests/review/fixtures/native-construction-recovery-model.mjs)は実ソース／出力JSのallocate関数を試験側だけで抽出し、24条件、通知再入・最終同owner不一致、6つの構文正常な変異を検査する。新しい故障引数や観測portは製品に追加しない。既存27拒否・9変異・6prefix・型境界のprobeはprivate初期化位置へ追従し、期待値を維持した。

CP00〜02のbootstrap未成立、state creator復帰前の内部部分生成、process障害の回復は保証しない。取得可能なanchor／upper／facadeのprefixだけを保持し、native操作0と診断回収成立を混同しない。runPending／cleanupPendingはnull、空seedはreadonlyのまま。active JoinCell生成・公開・dispatch、resourceとの新結合、外側custodyと新LM03は未接続である。実行結果・初回失敗・compiled／配布境界と未実施範囲は[検証記録](E2E_BEST_PRACTICE_NATIVE_CONSTRUCTION_RECOVERY_CP00_CP05_2026-11-16.md)へ分離する。
