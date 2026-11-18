# JR-B実行前内部契約・先行slotと失敗後writer資格の差分詳細設計

Version: native-diagnostic-jrb-execution-seed-contract-draft-0.7 / Date: 2026-11-18。
Status: §10の初期field・狭い値型・未使用seed検査・固定拒否、§11参照先の非実行variant／origin／値postと、§12参照先の閉鎖実運用型／実field post／failure保持だけを合成依存限定で実装。seedの基準HEADは`48900ac`。[closure／tuple・post設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_HANDLERS_POST_TERMINAL_DELTA_DESIGN.md)HC06〜08・HP04〜09・HW02〜05・HT01〜07を、[JoinRuntime設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JOIN_RUNTIME_GENERATION_DESIGN.md)の同role pendingと[固定pin設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_RUNTIME_PIN_DELTA_DESIGN.md)RS05後半〜RS10へ接続する前の内部契約へ具体化する。native実行状態への遷移・参照取得は未実装・未接続である。

draft-0.7のレビュー修正：レビュー修正の基準HEADは`f9a8be2`（修正時のHEADは`f9a8be2`）。同コミットで、Statusを§12参照先の限定実装に合わせて書き換えた一方、版はdraft-0.6のままだった。版を上げ、参照元の版参照を直した。受渡し設計とseed→実行設計への参照も、それぞれdraft-0.3とdraft-0.6へ更新した。内容・実装・試験は変更していない。

draft-0.6のレビュー修正：レビュー修正の基準HEADは`f3746c4`（修正時のHEADは`ed57855`）。§10は固定拒否を「必ず」とし、retentionの書込み資格不成立ではhookを呼ばないと定めていた。ところが独立oracleは製品を非strictの合成realmで実行しており、書込み不可・accessorへの代入が黙って無視されていた。このためretention書込み条件を外す変異3件がsource・compiledの両対照を通過した。また実際のES module（strict）では、readinessを書込み不可にすると固定拒否の記録中に例外が出る。catch内の再記録でも同じ例外が出るため要求の外へ抜け、slot fault・同期revokedが残らなかった。readinessにもretentionと同じown data・writableの書込み資格を課し、合成realmをstrictへ改めた。readiness／retentionの書込み不可・setter付きaccessor・descriptorが継承するwritable getterの8対照と、書込み資格の構文正常変異5件を加えた（§10）。

draft-0.5のレビュー修正：レビュー修正の基準HEADは`6c798d9`。§12に受渡し設計への参照節（2026-11-18追記）を加えた一方、版はdraft-0.4、Dateは2026-11-17のままだった。版と日付を更新し、参照元のJoinRuntime設計・handler設計・構築Join設計・受渡し設計の版参照を直した。内容・実装・試験は変更していない。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択・AP01〜06未承認を維持する。draft-0.1はMDだけの設計だった。draft-0.2の先行実装・合成検証は§10へ分離し、Promise生成・closure呼出し・観測登録・通知／copy／settler呼出し・private公開・dispatch・実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行わない。

## 1 現行との対応と非実行の実装境界

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)は同shellへ3closureと凍結tupleを保持し、handlers_readyまでを確認できる。3closureの本体はrejectClosedJoinHandlerによる固定拒否だけで、executor入場・settler捕捉・callback観測は行わない。candidate／work／resolve／reject／ackはnull、observerClaim／settleClaim／通知／copy試行はfalseのliteralである。[303件・compiled10本の記録](E2E_BEST_PRACTICE_NATIVE_JOIN_HANDLERS_PREP_2026-11-17.md)はその非実行境界の実績で、本書の将来契約の成功件数へ加算しない。

次の先行実装単位は、全fieldの初期配置・狭い値型・未使用seedの検査・固定拒否までに限定できる。状態を進める値oracleはtest側だけとし、製品へ任意event／field更新の注入口を作らない。この単位では同P呼出し・3closure呼出し・then適用・通知／copy／settler呼出しを0に保つ。seed検査のtrueや値projectionを、呼出し可能な証拠／引数／登録ticketとして返さない。

constructorを実際に一度呼ぶ後続単位は、安全な候補観測と固定abort／失敗終端を同時に備える。現在の固定拒否executorを単にnew Pへ渡しても、settlerを保持せず無期限pendingを作り得るため不可。生成だけを有効化し、拒否観測や終端を後工程へ残す分割を認めない。

## 2 同owner・型と保持位置の共通規則

主保持先は既存RecoveryAnchor.runGeneration.pending／cleanupGeneration.pendingだけとする。同RecoveryAnchor／controlRoot／role slot／seed／shell／identity／pinと、cleanupの既存contextRecord／contextAnchor／contextを結合する。旧runPending／cleanupPending、EmptyJoinCell、runWork／record.cleanupWorkを新しい書込み先へ変えない。

raw引数はcanonical実参照と比較してから自ownerのdataだけを読む。roleは同closureの固定値で、raw.kind／slot.roleから別ownerのwriterを選ばない。foreign／同値copy／Proxy／診断projectionを採用せず、拒否診断はlexicalに保持した自ownerのrole slotへ記録する。canonical aliasは同取得時に一度だけ記録する参照であり、可変holderから期待値を再採取する第二cacheではない。

| ID | 内部型の差分 | 固定条件 |
|---|---|---|
| EI01 | 既存JoinRuntimeShellの同object拡張 | group別object／Map／配列を追加せず、§3のprimitive／参照fieldを同shellのown writable dataとして先行配置。identity／pinは凍結したまま後書きしない |
| EI02 | role別settler／work | 既存private JoinResolve／JoinReject／JoinWorkのrole区分を再利用。runはWorkflowSnapshot用resolveと固定BoundedReadError用reject、cleanupはundefined用resolveだけでreject=null。関数型やtypeofだけをorigin証拠にしない |
| EI03 | candidate／ackの保持型 | unknown候補と未取得を、参照のtruthinessで判定しない。保持有無・安全性／確認状態を別fieldにし、null／undefined等の不正候補も取得事実を消さず拒否。安全確認前は呼出し・awaitしない |
| EI04 | 最後の保持位置 | 既存empty／claimed／runtime／context／identity／pin／handlersにexecutor／reject／resolve／candidate／checkedを追加。constructor試行やcallback／通知失敗は保持位置ではない。ack途中保持は観測detailへ記録し、positionはcandidateのまま |
| EI05 | 最初のfault site | 準備位置型と分離し、既存siteにconstructor_pre／constructor_call／executor_entry／reject_capture／resolve_capture／executor_exit／candidate_check／observer_pre／observer_call／ack_hold／observer_post／callback_entry／callback_write／drain_entry／upper_record／notify／run_copy／reject_payload／settle_pre／settle_callを固定追加。任意文字列・stack・時刻を保存しない |
| EI06 | 共通phase | 最初は既存building、生成・捕捉・観測の全post後だけprivate checkedへ進める。失敗はfailed_retainedに固定。drain退出や実終端を理由にcheckedへ戻さず、published=null・dispatchStarted=false・entered=falseを維持 |

EI04のexecutorはexecutor入場の履歴であり、closureの保持ではない。runはexecutor→reject→resolve、cleanupはexecutor→resolveとし、constructorが返したらcandidateを保持する。constructorがthrowし参照を返さなければcandidateを推定しない。未完了prefixを完成variantへassertion／cloneで置き換えない。

既存handlersFault／handlersDetailは準備履歴として保持する。後段のexecutor／observer異常をfailJoinHandlersのclosed_callへ流して生成位置をhandlersに戻さず、同roleの新しい原始failure継続でEI05のsiteを最初のfaultへ記録する。slotの先行fault／faultAtとroot primaryは上書きしない。元のHTTP・取消・期限は別primaryを作らず保持する。

既存shell／identity／pin／3closure／tupleのcanonical aliasに加え、各roleのcapturedResolveExpected／capturedRejectExpected／candidateExpected／registrationWorkExpected／ackExpected／terminalCopyExpected／rejectPayloadExpectedを同root lexical区間へ先行宣言する。初期値はnull、cleanupのreject／run専用payload aliasはnull固定。取得値を主fieldへ保持する同じ原始群でaliasを一度だけ記録し、先行field検査単位では全てnullのままとする。これらは同参照の照合用aliasで、公開slot・別生成物・再採取cacheではない。取得有無は主fieldの固定履歴と併せて判定する。

## 3 物理配置と全先行field

次表の「拡張」は既存fieldの型の限定拡張、「追加」は新しい固定fieldを指す。すべてshell割当てのobject literal内へprimitive初期値／nullを直接配置し、Promise生成直前の追加objectやcallback中の保持先割当てへ遅延しない。表の複数field表記は物理的に別fieldであり、実装時に可変collectionへまとめない。

| ID | group・既存／追加 | fieldと初期値、許される値域 |
|---|---|---|
| EF01 | constructor・追加 | constructorClaim=false、constructorState=not_called。stateはnot_called／calling／returned／threw。claimはtrue後に戻さない。returnedと実executor正常退出は独立 |
| EF02 | executor・追加＋拡張 | executorEntryClaim=falseを追加。既存executor=not_enteredをrunning／normal_exit／abnormalへ拡張。entry claimを引数保持より先に消費し、退出前の半捕捉を残す |
| EF03 | settler・拡張 | resolve=null／reject=nullを同executor起源のrole別関数参照へ限定拡張。runのreject保持が先、cleanupのrejectはnullだけ。期待aliasも同捕捉時に一度記録し、失敗時に交換／clearしない |
| EF04 | candidate・追加＋拡張 | candidateHeld=false、candidateSafety=uncheckedを追加。safetyはunchecked／safe_same_work／unsafe_retained。既存candidate=nullを返却unknownの直接保持へ拡張。work=nullは安全確認後だけ同candidateのnative Promise aliasになる |
| EF05 | 登録origin・追加 | registrationWork=null、registrationReached=false。registrationWorkは安全な同workのwrite-once alias。canonical期待aliasも同時に記録し、別origin object／二本目workを生成しない |
| EF06 | 登録制御・拡張 | 既存observerClaim=false、observerBusy=false、observerState=unstarted。stateはunstarted／registering／returned／threw／refused。claimは一度、busyは当該試行が獲得・解除。呼出し前の最終post拒否はrefusedで到達なし。returnedだけで登録post成功やcallback退出にしない |
| EF07 | ack・追加＋拡張 | ackHeld=false、ackState=emptyを追加。stateはempty／held／verified／unsafe_retained／return_lost。observerAckCandidate=nullを返却unknownの直保持、observerAck=nullを確認済み同参照aliasへ拡張。ack実終端は別field |
| EF08 | callback・追加＋拡張 | callbackClaim=false、callbackState=not_enteredを追加。stateはnot_entered／inside／exited／unconfirmed。既存observed=unobservedはfulfilled／rejectedを追加。callbackFault=nullはearly／synchronous／duplicate／origin_mismatch／write_unconfirmedだけを追加。生のvalue／reasonは保持しない |
| EF09 | drain・追加 | failureDrainClaim=false、failureDrainState=unstarted、drainKind=none。stateはunstarted／inside／exited／unconfirmed、kindはnone／fixed_abort／fault。fixed_abortは同ownerの未dispatch候補を終了させる固定継続だけで選択 |
| EF10 | upper診断・追加 | upperRecordAttempted=false、upperRecordState=unattempted。stateはunattempted／calling／returned／threw／skipped_sealed。復帰は診断の受理／seal／解放確認を自動的に意味しない |
| EF11 | 通知・拡張＋追加 | 既存notifyAttempted=falseをbooleanへ拡張、notifyState=unattemptedを追加。stateはunattempted／calling／returned／threw／skipped_shared。同RecoveryAnchor.notifiedを共有し、通知入口試行・bridge呼出し・成功を分離 |
| EF12 | run copy・拡張＋追加 | 既存copyAttempted=falseをbooleanへ拡張、copyHeld=false、runCopyState=unattempted、terminalCopy=nullを追加。stateはunattempted／building／verified／failed／skipped_cleanup。返却unknownを検査前に同slotへ保持し、verifiedのときだけ同ownerの実WorkflowSnapshotとして照合。失敗copyも参照を消さない |
| EF13 | fallback payload・追加 | rejectPayloadAttempted=false、rejectPayloadState=unattempted、rejectPayload=null。stateはunattempted／building／held／failed／skipped。runでcopy不能な場合だけ固定internal_review_errorを最大1個確保。元例外は読まない |
| EF14 | settle・拡張 | 既存settleClaim=falseをbooleanへ、settleState=unattemptedをcalling／returned／threw／skipped_terminal／unavailableへ拡張。適格settler呼出し前にclaimを消費。省略・不足は試行済みと区別し、終端観測を作らない |
| EF15 | 終端／退出・拡張＋追加 | 既存terminal=unobservedはfulfilled／rejectedだけを追加し、正規work反応と整合。ackTerminal=unobservedを追加しfulfilled／rejectedは同ackを確認できた時だけ。責務状態retention=heldを追加し、held／unconfirmedだけ。JR-Bではreleased／discardedを作らない |

terminalCopyは新run shell内の終端payload保持slotであり、構築失敗用RecoveryAnchor.copy／copyPhaseを流用しない。既存upperのseal／snapshotや実operations／counts／token状態の第二writerも作らない。cleanupではterminalCopy／rejectPayloadはnullを維持し、run専用payloadを混入させない。

candidateHeldとackHeldは「返却された値を保持した」という履歴で、安全性やnative実体の証拠ではない。ackState=return_lostは登録が到達したのに復帰参照を得ていない状態で、ackHeld=falseのまま未確認責務を保持する。未知参照をnullへclearして未取得へ戻さない。

copyHeldも返却値の保持履歴だけとし、throwで値を得ていない場合と、null等を受け取って検査拒否した場合を区別する。candidateSafetyやackState=verifiedも過去の確認点であり、その後のlive pin不成立を無視する資格ではない。現在の安全性は各依存操作の直前postで別に検査する。

初期安定点では各claim=falseと未開始stateを対にする。claim→busy／stateの原始代入は依存呼出しを挟まない固定群で、試行権だけが後から復活するvariantはない。upperRecordAttempted／notifyAttemptedは当該処理の判断へ入る前にtrueとし、seal済み／共有通知済みのskipでも判断を再試行しない。cleanupのcopyはcopyAttempted=falseのままskipped_cleanup、payload不要はrejectPayloadAttempted=falseのままskipped、既終端／不足のsettleはsettleClaim=falseのままskipped_terminal／unavailableとする。これらはfailureDrainClaimが非返却のため再検討できない。依存を実際に呼ぶものだけが各calling／buildingからreturned／verified／heldまたはthrew／failedへ進む。

`terminal`は`observed`の正規反応からだけ導出する固定値で、settler復帰から書かない。二つの独立writer／真実にしない。ackTerminalはruntimeで確認手段がない間unobservedを維持し、管理されたscratchの有限確認結果を製品へ再投入する口は作らない。

## 4 固定配置・生成順と未使用seed検査

| ID | 固定順 | 拒否・保持責務 |
|---|---|---|
| ES01 | 既存CP00のrole slot・最初のfault保持先を確保 | shell以前の失敗はrole slotに残す。CP構築回収とready後の実行失敗を同じcopyへまとめない |
| ES02 | 同shell割当て時にEF01〜15の初期fieldを全配置→pendingへ直保持 | 初期式はprimitive／既存canonical参照だけ。shell割当て自体が失敗すれば生成claim・role faultが保持先。未保持objectの回収を確認済みにしない |
| ES03 | 既存context→identity→pin→3closure→tuple／freeze→handlers post | run contextはnull。新fieldは初期値不変で、既存の保持順・canonical alias・busy所有・元停止条件を維持 |
| ES04 | 同owner・EF全初期値・未試行・同role・非公開のseed検査 | preparedShellMatched／preparedHandlersMatchedの段階は維持し、初期fieldの確認を追加する場合も既存null／falseや停止postを削らない。trueは呼出し権限ではない |
| ES05 | 将来のconstructor直前専用post | 未使用seed、handlers完了、同pin／Pのlive条件、同role停止条件を確認。ここまでの原始情報を保持し、caller callback／await／通知を挟まず次段階へ |
| ES06 | 将来のconstructorClaim消費→calling→同P／同executorを一度だけ呼出し | 同期群の開始。新run開始claimを再消費しない。先行実装単位ではこの操作へ接続せず、実行入口で固定拒否 |

初期fieldはshellのown writable dataで、観測登録前に検査し、登録後にfreeze／accessorへ変えない。identity／pin・tupleのfreezeとshellへの原始書込み資格は別である。未知objectやgetterを呼んでfield存在を補うことはしない。

将来のexecutorはconstructorState=calling・同executor・未使用entry claimのときだけ入場する。entry→run reject→resolveまたはcleanup resolve→退出の各prefixを直接保持する。型・関数名・length・stackから引数関数の真正性を推定せず、originと原始履歴が成立しなければ引数を呼ばず保持も交換しない。executor内でdescriptor再検査・通知・copy・Error確保・queue・正常settleを行わない。

constructorが返した候補は、executor異常・既存faultがあっても確認より前に同candidateへ保持する。constructorState=threwでも既取得settler・prefixを残し、外部throw値を保持しない。new Pが実際に返していない値をcandidateへ補完しない。

## 5 段階別checkerと失敗後の書込み資格

| ID | checker／writer区間 | 必須の起源と書ける範囲 |
|---|---|---|
| EW01 | executionSeedUnused | 同canonical集合とEF全初期値、handlers完了、非busy、未使用constructor／observer／settle、元run停止／同record cleanup条件。値検査だけでclaimや参照を変更しない |
| EW02 | constructor／capture post | 同constructor試行・executor入場・role別半pair／完了pair・退出・同candidate保持。生成成功と候補の観測安全性を別結果にする。失敗を正常variantへ補完しない |
| EW03 | observation admission／registration post | 同candidateの安全性、same work、同先行tuple、live P／then、共有observerClaim・登録到達とbusy、ack保持／確認。failed_retainedでも安全な同候補の拒否観測だけを別資格で検討し、再生成を許さない |
| EW04 | callback origin leaf | 同shell／identity／pin／slot・write-once registrationWorkとcanonical alias・同handler・registrationReachedを照合。新規生成用のprimary／revoked／sealed／current一致条件は流用しない。原始観測・callback履歴・最初の固定faultだけを書ける |
| EW05 | 原始failure writer | 自ownerの最初のsite／code→先行primaryが空のときだけ固定→同期revoked→failed_retained／保持責務を記録。準備detail・参照・実facts・既存理由を消さず、通知／copyより先 |
| EW06 | drain資格／限定settle post | 同retained集合・drain一度・同workと捕捉済み同settler・必要観測・安全payloadを操作別に検査。生成成功を要求せず、未知候補／不足settlerを呼ばない。実終端を復帰値から作らない |

EW04はpreparedHandlersMatchedやshellPreparationLiveをそのまま再利用しない。両者は未使用fieldや正常生成条件を要求するからである。callback内ではlive descriptorやsnapshotを再取得せず、登録前に保持・検査した不変originと原始履歴だけを読む。registrationWorkの起源が失われれば、同値の別Promiseや診断copyで救済しない。

registrationReached=falseの早過ぎるcallは成功観測にしない。正規originと登録到達を確認できた最初のcallback entryで共有callbackClaimを消費する。登録busy中の同期entryはsynchronous faultとして観測値を採用せず、二度目はduplicateとして先行観測を上書きしない。これらをnative反応の真正性を証明した値eventと混同しない。

正規後着callbackはfailed_retained／revoked／sealed後でも原始work反応と自身の退出だけを記録できるが、primary／fault・成功phase・既sealed upper／公開snapshotを更新しない。currentが別recordになっても元registrationWorkの終端事実と現在resourceのcleanup適格性は別であり、別recordへnative factsを書き戻さない。新規取得・正常受理を再開する権限はない。

callbackはvalue／reason／thisのpropertyを読まず、引数を保存・出力せず、undefinedで復帰する。通知・copy・settler・別observer・throw・thenable返却は行わない。管理されたintrinsicとprivate dataの前提で非throwを検証し、OOM・任意内部改変時まで非throwや完全回収を保証しない。callback退出未確認もretention=unconfirmedへ残す。

fulfilled／rejectedの種別は先行生成した各closure本体の固定値であり、caller引数やtest eventの文字列から選択しない。test側の値遷移はこの起源を代替せず、正規native反応を実際に検証する後続単位と区別する。

## 6 観測・drainの固定状態遷移と終端の区別

以下は将来の実行単位の状態契約で、今回のMDや先行field単位で動かす手順ではない。

| ID | 状態更新の固定群 | 固定結果・失敗時保持 |
|---|---|---|
| ET01 | candidate安全確認→同work／registrationWork alias保持→observerClaim消費→registering／busy→最終live post→registrationReached=true→捕捉thenを同workと同tupleへ一度適用 | 最終post拒否はrefused・registrationReached=falseでclaim非返却。到達前と到達後throwをregistrationReachedで区別。caller thenable・任意getter・別tuple／callbackを採用しない |
| ET02 | 戻ったackを直保持→ackHeld／held→同origin・native安全性／全post→verified alias→登録returned | 検査前に参照を保持。返却喪失はreturn_lost、受け取った不正ackはunsafe_retained。finallyは当該試行のbusyだけ解除。ack実終端は別 |
| ET03 | 正規callbackClaim→inside→原始observed／terminal→exited | body未実行を成功観測へしない。先行faultは不変。callback内にdrainを再入させず、callback復帰をackTerminal=fulfilledへ変換しない |
| ET04 | faultまたは未dispatch正常候補の固定abort→同retained origin確認→failureDrainClaim消費→inside | 正常候補の固定abortでも通常利用・private公開は0。固定abortで元理由が空ならcancelledを固定し、先行HTTP／取消／期限を上書きしない。重複／再入で第二drainを作らない |
| ET05 | upper記録試行→共有停止通知試行→run copy試行→必要時の固定reject payload確保 | 各試行を依存呼出しより先に消費し、throw後も次の適格な処理と保持責務を残す。sealedはskipped_sealed、通知済みはskipped_shared。各理由を新primaryにしない |
| ET06 | 同work・同settlerとpayload検査→settleClaim消費→calling→同settler→returned／threw | 既終端はskipped_terminal、不適格はunavailable。未観測をpendingの証明にしない。正規反応を得て初めてterminalを書き、後続resolveで先行rejectを修復したとしない |
| ET07 | work反応／callback退出／ack実終端／外側resource責務を別々に確認→drain退出 | 退出はexitedまたはunconfirmed。void、settle復帰、診断seal、busy=false、GCをcleanup confirmed／全解放へ昇格しない。参照clear・最終discardは接続しない |

ET01のcandidate安全確認は[固定pin設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_RUNTIME_PIN_DELTA_DESIGN.md)PI／RSの管理された同realm・native brand／prototype／constructor／species条件を再利用する。型assertion、instanceofだけ、candidate.thenの直接読取り、未知thenableのawaitで置き換えない。同thenへの適用から生じるackは最大1個で、ack確認のためのthen列を増やさない。

ET05の共有通知は既存notifyStopの入口とRecoveryAnchor.notifiedを使う。roleごとのnotifyAttemptedだけでは同bridgeの重複を防げない。既存notifiedは入口試行の履歴で、成功証明ではない。旧notifyStop全体を既に一度限りだとみなさず、新drain側の適格性・呼出し前履歴・既存共有履歴を併せて確認する。同期戻り値のthenable同化もしない。

terminalCopyは同ownerの実operations／counts・token退役・upper診断を反映した、既存正常終端条件を満たす実copyだけをverifiedにする。既存snapshot()は現在のcopyを作るだけなので、単独で呼んで正常終端を証明しない。正常終端未到達・copy不成立なら固定rejectへ分岐し、failConstructionの0計数copyや別正常snapshotで代替しない。先行取得copyが未確認ならその参照も保持する。

run resolve直前には、同copyの固定shapeと到達prototype上のthen不在を捕捉済み操作で検査し、その後にcallback／awaitを挟まない。検証不能なら適格な同reject＋保持した固定internal_review_errorだけを検討する。cleanupは適格な同resolve(undefined)だけで、reject参照・run copyを混入しない。必要参照の不足／payload確保失敗では固定API拒否とprivate未終端を分け、未知workへの無期限joinで代替しない。

登録後throw／復帰参照喪失は、workへhandlerが付いた可能性とack未取得を同時に保持する。第二登録・別Promise・process全体listener・追加timerで成功へ見せない。危険なnative故障対照を実施するには有限な別child／終了契約の承認が必要で、先行fake field検査のためにそのchildを起動しない。

## 7 失敗prefixと保持・退出責務

| ID | 最初の失敗位置 | 同ownerに残すもの・禁止 |
|---|---|---|
| ER01 | shell前／先行配置／handlers以前 | 既存role claim・先行faultと取得済みshell／context／identity／pin／closure。未取得objectを存在扱いせず、準備成功へ戻さない |
| ER02 | constructor前／entry／半捕捉 | constructor／entry claim・calling／退出履歴とrun rejectのみ等の実prefix。引数関数の呼出し・欠けるsettler補完・再constructor 0 |
| ER03 | constructor throw／返却候補不正 | 最後のexecutor prefix、返却された候補は値の真偽にかかわらず保持。未返却候補を補完せず、unknownをsafe workへ昇格しない |
| ER04 | 観測post／then適用／ack保持 | observerClaim・registrationReached・同registrationWork・取得済みack・busy所有とcallback履歴。参照喪失と不正参照を分け、再登録0 |
| ER05 | callback早期／同期／重複／後着 | callbackClaim・最初のfault・原始observedと退出状態。後着正規事実だけをprivateへ記録し、sealed upper／別recordは不変 |
| ER06 | upper／notify／copy／payload／settle | 各先行試行field・成功／throw／skipと取得参照、元primary・実facts。手順全体の再試行、CP回収への巻戻し、架空cleanup credit 0 |
| ER07 | close／stop／試験終了時に未確認 | 同pending・producer／callback／work／ack／resourceの未解決責務を保持。旧closeの正常join・slot clear・sealだけで退役／最終discardを宣言しない |

通知やcopyの例外を理由に、既存token退役・reader固定操作・driver close／bytes dispose・実class session close／予約返却を省略しない。それらは元ownerの責務で、新JoinRuntimeのvoid終端や診断保持で確認済みへ代替しない。今回これらの実resource接続は設計対象外でありUnknownを残す。

## 8 将来の合成受入条件と実装分割

| ID | 先行field／内部契約単位での対照 | 受入条件 |
|---|---|---|
| EA01 | EF全field・既存初期値／同owner | role別の欠落・不正値・同値copy／Proxyを拒否。初期配置はhandlerより先、foreign hook／書込み0、旧pin／handler postと失敗prefixを維持 |
| EA02 | strict値型・有限遷移の純粋oracle | constructor／executor・登録／callback・drain／settleの未使用・途中・失敗を区別。run半pairとcleanup reject混入を拒否。値の一致からnative起源／authorityを発行しない |
| EA03 | 初回claim・部分prefix・先行fault | 値上の二重試行・再入・条件復旧を拒否し、試行中busyは取得者だけが解除。新field不正が旧diagnostic／元slotの保持を消さない |
| EA04 | 構文／semantic／compiledの負対照 | constructor・retained closure・then・notify／copy／settler呼出しを先行単位で0。role／有限state／literal閉鎖のsemantic負対照と固定distだけの検査。新export／friend／setter／登録口0 |
| EA05 | 後続の生成＋観測＋固定abortの一体対照 | 同P一度・executor半捕捉・失敗候補観測・ack喪失・停止／sealed後反応・通知／copy／settle故障を独立イベントoracleで確認。work／callback／ackの有限終端確認なしに成功へ数えない |
| EA06 | 旧保証・費目・配布 | 旧14関数・4export・strict raw・5fault・7permissions=falseと元5秒／既定並列度・旧child60秒・製品全体60秒を維持。新sample／clock／floor／queue・予算再起算・C/G/P/R成功credit追加0 |

EA01〜04は実Promise・closure呼出しなしに実装可能な先行単位である。ただし製品へfake event executorを置く・試験eventを真正なsettler／観測originへ昇格することはしない。native呼出しを含むEA05は別の後続単位で、未観測reject／無期限pendingの扱いまで整ってから接続する。

先行fieldは同run／単一予算ownerの費用に属する。roleごとにshell1・既存3closure／tuple1・candidate／work同参照1組・ack同参照最大1組、runのterminalCopy最大1・固定fallback payload最大1と固定primitiveだけを保持する。aliasは別生成objectとして数えず、到達可能性による寿命延長は別に扱う。primitive数が有限でも閉包／Promise内部／Error／copy／native resourceを含む実backing容量や完全回収はUnknownである。

## 9 draft-0.1作成時の静的確認と未実施範囲

基準HEADのshell割当て・同owner／post・固定拒否closure、既存notifyStop／snapshot／execute／close、CPのfailure copy、private role型と親設計を読み、現行と将来fieldを区別した。EI／EF／ES／EW／ET／ER／EAは設計IDであり、試験成功件数ではない。

draft-0.1作成時の変更は本書と親2文書の参照・工程境界だけとした。文書link／表／ID・末尾改行・差分と変更範囲を静的確認し、ソース・試験・CHANGELOG・依存・設定は変更しなかった。製品moduleのimport／実行、試験再実行・build／pack、Promise生成・closure呼出し、private公開・dispatch・実接続・実通信・設定変更・stage・コミット・Pushは行わなかった。

3文書のlocal link26件・表21個、新設計ID53個の順序／重複／欠落と末尾改行・差分空白を静的確認した。旧rootの内容は基準HEADと一致し、文書3file以外の変更・stageはない。これらは文書整合の結果であり、将来の生成／観測／終端試験を実施した結果ではない。

## 10 未使用seedの限定実装

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のshell object literalへEFの追加25fieldを先行配置した。constructor／candidate／登録／ack／callback／drain／通知／copy／payload／終端の未来の有限値語彙はprivate型として宣言するが、runtime seedはExtractによる初期literalの投影とし、既存work／settler／観測claim等もnull／falseのまま維持する。native参照を保持できる完成variantへの型拡張は行わない。retentionだけは固定拒否時にheldからunconfirmedへ進める。

EI04の有限JoinExecutionPositionは型語彙だけで、実slot.positionの範囲はhandlersまでのままである。faultAtをJoinFaultSiteへ分離し、新しい固定拒否ではconstructor_preを最初のsiteとして記録する。先行handlersFault／detail・slotのfault／faultAt・root primaryを上書きしない。

joinExecutionFieldsUnusedは捕捉済みown descriptorで25fieldのdata属性・値・writable／enumerable／configurableを確認し、getterを読まない。旧preparedShellMatchedとhandlerStageMatchedへこの未使用検査を追加し、旧null／false・同owner・停止／record／pinの検査は削っていない。14個の期待aliasはconst nullで先行宣言し、未消費の参照取得資格にはしない。

executionSeedUnusedはcanonical shell／identity／pin照合を先に行い、同ownerのhandlers完了と14alias未使用だけを確認する。戻り値はbooleanで、呼出し証拠ではない。requestJoinExecutionは正常seedも不正seedも必ず固定拒否し、constructorClaim・entry／observer／drain／settle claimは消費しない。最初のconstructor_preまたは先行faultを残し、同shell／identity／pin／closure／tupleを保持、同期revokedへ合流する。readiness／retentionのdata書込み資格（own data・writable）が不成立ならhookを呼ばず当該fieldを保持し、例外を出さずにrole slotの固定失敗と同期revokedを残す。通常利用へ戻すreset口はない。

新要求・seed checkerはlegacyから呼ばず、seed checkerの唯一の内部callerはこの固定拒否要求である。旧handler完了checkerの唯一の追加callerもseed checkerに限定する。closure本体は従前の固定拒否のままで呼び出さない。EW02〜04／EW06とETの実行遷移、callback反応、通知／copy／限定settle・実終端は未接続である。EA02の将来全遷移oracleを実装済みとせず、現段階の値保証は有限型・初期field・固定拒否に限定する。

[source試験](../tests/review/native-join-execution-seed.test.ts)、[独立oracle](../tests/review/fixtures/native-join-execution-seed-model.mjs)、[固定dist検査](../tests/review/fixtures/compiled-native-join-execution-seed.mjs)で、field別拒否・混入・停止／先行理由・descriptor継承getter・38構文正常変異とsemantic不正15行を検査した。draft-0.6のレビュー修正で、合成realmを製品と同じstrictにし、失敗writerの8対照と構文正常変異5件（計43件）を加えた。初回RED・旧試験の移行差分・試験側の不備、結果と未実施範囲は[検証記録](E2E_BEST_PRACTICE_NATIVE_JOIN_EXECUTION_SEED_2026-11-17.md)へ分離する。作業中だったdraft-0.1と親文書の内容を保持してこの実装節・状態更新を追加し、stage・コミット・Pushは行わない。

## 11 seedから実行状態への接続差分

[seedから実行状態へのclaim・settler保持・post接続差分詳細設計draft-0.7](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_SEED_EXECUTION_TRANSITION_DELTA_DESIGN.md)で、同objectのunused／claim済み／calling／捕捉／返却／失敗variantとconstructor／entry claimの順序、role別settler保持、段階postを具体化した。同書§9ではreadonlyの8variant・同保持origin leaf・段階別値postだけを限定実装する。実shellのliteral型・未使用checker・14null alias・request／3closureの固定拒否は変更せず、値一致から実行権限を生成しない。constructor／entryの消費・native参照取得・生成／安全観測／固定終端は未接続で、一体接続の条件を維持する。

## 12 実field writerと安全観測／固定終端の受渡し（2026-11-18追記）

[同shellの実行writer・安全観測・固定終端受渡しの差分詳細設計draft-0.4](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_LIVE_WRITER_TERMINAL_HANDOFF_DELTA_DESIGN.md)で、EI／EFの同object保持、EWの操作別writerとETの非返却claim・固定drainを具体化した。同書§9では同shellへの実運用型view・実field post・原始failure／cold未確認保持だけを限定実装し、取得claimやnative参照を生成するwriterは置かない。call throwと復帰後post失敗、最初のfaultと最後の保持位置、後着private事実とsealed上位診断を混同しない。生成・安全観測・固定終端の一体接続条件、Unknown・全体受付無効・各閉鎖条件は不変とする。
