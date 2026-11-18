# JR-B pre-call受付・write-once aliasとconstructor call 0停止の差分詳細設計

Version: native-diagnostic-jrb-precall-admission-alias-draft-0.2 / Date: 2026-11-18。
Status: §9の先行診断・一度限り受付・固定拒否・安全なfailure反映だけを合成依存限定で実装。限定実装の基準HEADは`2ecb117`。draft-0.1の実装照合基準は`f9a8be2`、補強試験・参照更新は別コミット`681bdd4`で保持した。[実writer／終端受渡し設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_LIVE_WRITER_TERMINAL_HANDOFF_DELTA_DESIGN.md)WH01・WC02・§9と、[seed→実行設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_SEED_EXECUTION_TRANSITION_DELTA_DESIGN.md)CS01〜04／PP01〜03への差分である。[固定pin設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_RUNTIME_PIN_DELTA_DESIGN.md)の管理された同realm・同P／then前提と、[先行field契約](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_EXECUTION_SEED_CONTRACT_DESIGN.md)EF／EW／ETの一度限り試行・保持責務は変更しない。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択・AP01〜06未承認を維持する。draft-0.1はMDだけで作成した。draft-0.2の限定実装・合成検証以外は進めず、全field受付・alias供給・Promise生成・closure呼出し・観測／終端・private公開・dispatch・実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行わない。

## 1 現行との差分・受付の意味

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)はdraft-0.1時点で同shellの実運用型view・実field post・原始failure／cold未確認保持までを閉鎖実装した。実field postはcanonical dataの関係検査であり、全write対象のown writable data受付・停止／live pin資格・native安全性の証明ではない。14期待aliasはconst null、旧requestと3closureは固定拒否のままである。§9の限定追加により、failure／cold保持への呼出しは未接続のpre-call拒否継続内だけに2か所あるが、実field postとpre-call入口への製品callerは0である。[既存検証記録](E2E_BEST_PRACTICE_NATIVE_JOIN_LIVE_STATE_2026-11-18.md)を生成資格・native取得・有限終端の保証へ加算しない。

pre-callは、同private継続のconstructor呼出し直前までの受付を指す。data受付だけで呼出しを許可せず、§6の安全観測・固定abort／失敗終端の構成が一つでも不足すればconstructor call 0で拒否する。現HEADでは実executor／観測／drainが未接続なので、layoutや値postが正しくても生成へ進めない。成功ticket・公開permit・raw mode・設定flagを新設しない。

先行の後続実装単位を受付・拒否・診断保持だけに分割する場合も、呼出し可能なreadyを外へ返さず固定拒否を維持する。実呼出しは生成→安全観測→固定終端を備えた一体単位だけで接続する。§2〜8は全体接続の契約であり、§9に明記した先行拒否の範囲以外は未実装である。

## 2 同ownerの読取り順と先行拒否保持

roleは同生成closureの固定値で、raw.kind／slot.roleからwriterを選ばない。raw shell／identity／pin／slotとroot／seed／cleanup contextの候補は、保持済みcanonical実参照と先に比較する。foreign／copy／Proxyを採用せず、rawのpropertyは読まない。

現在のorigin leafやsamePreparedControlは、参照比較の後にcanonical fieldを直接読む。自owner fieldのaccessor化も扱う受付では、未確認dataをそれらへ先渡ししない。捕捉済みの固定predicate／descriptor操作で当該読取りfieldを資格化した後だけ既存の関係postを使う。samePreparedControlを丸ごと呼び直さず、§4の固定参照集合へ関係条件を限定入力化する。他role slot.role等の表外fieldを直接読む既存helperを追加で呼ぶ場合は、その検査・費目・負の対照を別差分で先に列挙する。getter・setter・caller関数・任意then・budget／clockを検査中に呼ばない。

slotのfaultAt／fault／phase自体がreadonly・accessor・不正dataなら、recordJoinExecutionFailureを安全に呼べるとは限らない。この循環を避けるため、同root lexical区間にroleごとの次の4scalarを先行初期化する方針とする。追加object／Map／可変traceや第二primary ownerではない。

| ID | 先行scalar・初期値 | 固定責務 |
|---|---|---|
| PS01 | precallAttempted=false | descriptor等の依存操作前に一度だけtrue。constructorClaimとは別で、拒否後の再受付・条件復旧による再試行を許さない |
| PS02 | precallBusy=false | 最初のframeだけがtrueを獲得。finallyでそのframeだけがfalseへ戻し、内側の拒否frameは解除しない |
| PS03 | precallRefusalCheck=null | 最初の拒否checkを有限IDで保持。固定schedule／下表の静的fieldに対応する定数だけで、任意path・列挙結果・時刻・stackを保存しない |
| PS04 | precallRefusalCode=null | 最初の固定JoinGenerationFaultを保持。元primaryは既存lexical変数一つだけで、このscalarを新primaryへ採用し直さない |

roleごと4、同rootで計8scalarとする。同ownerの先行構築区間で、private継続が到達可能になる前に初期化する。初期化前／owner未成立・OOM等のbootstrap限界は既存構築責務・Unknownのままで、正常ownerを再生成して救済しない。

拒否では最初のPS03／04→空の場合だけ元primary→同期revokedを、slot／shellのpropertyに触れる前に原始値で残す。slotの最小3field（faultAt／fault／phase）がown writable data・既存の有限値域として確認できた場合だけ、既存primitive failureへ同じ理由を渡す。最初のslot faultは上書きしない。cold metadata保持も、この3fieldとsubjectの前提が成立する場合だけとする。不足すれば両helperを呼ばず、lexical拒否記録・元canonical参照・同期停止だけを保持し、診断成功や全解放へ補正しない。

## 3 全shell field・slot・共有writeの固定台帳

pre-call時は全fieldが準備済み・実行未使用seedの値であることを要求する。allocateJoinShell直後の未準備値へ戻す意味ではない。readiness=handlers_ready、retention=held、pinState=ready、pinFault=null、handlersClaim=true、handlersBusy=false、handlersState=ready、handlersDetail=complete、handlersFault=nullとする。context／identity／pin・3closure／tupleは同準備で保持した実参照で、run contextはnull、cleanup contextは同record／anchorである。生成・取得・観測・終端のfieldは既存未使用値（claim／held／busy／attempted=false、未取得参照=null、各有限stateは未開始）を保つ。次表は物理配置65fieldを重複なく列挙する。role欄は将来の一体単位で許すwriteの上限で、受付した時点のwrite許可ではない。全fieldのown data、writable／enumerable／configurable=trueとこの既存seed値を確認する。論理readonly fieldも既知のobject literal配置として検査するが、書込み権限を追加しない。

| ID | shell field | runのwrite許容 | cleanupのwrite許容 |
|---|---|---|---|
| PF01 | `recovery`, `root`, `seed`, `kind`, `contextRecord`, `contextAnchor` | なし | なし |
| PF02 | `context`, `identity`, `pin`, `pinState`, `pinFault`, `handlersClaim`, `handlersBusy`, `handlersState`, `handlersDetail`, `handlersFault`, `executorHandler`, `fulfilledHandler`, `rejectedHandler`, `observerArgs` | なし | なし |
| PF03 | `readiness`, `retention` | 全field | 全field |
| PF04 | `constructorClaim`, `constructorState`, `executorEntryClaim`, `executor` | 全field | 全field |
| PF05 | `resolve`, `reject` | 全field | `resolve` |
| PF06 | `candidateHeld`, `candidateSafety`, `candidate`, `work` | 全field | 全field |
| PF07 | `registrationWork`, `registrationReached`, `observerClaim`, `observerState`, `observerBusy` | 全field | 全field |
| PF08 | `ackHeld`, `ackState`, `observerAckCandidate`, `observerAck` | 全field | 全field |
| PF09 | `callbackClaim`, `callbackState`, `callbackFault`, `observed`, `terminal` | 全field | 全field |
| PF10 | `failureDrainClaim`, `failureDrainState`, `drainKind` | 全field | 全field |
| PF11 | `upperRecordAttempted`, `upperRecordState` | 全field | 全field |
| PF12 | `notifyAttempted`, `notifyState` | 全field | 全field |
| PF13 | `copyAttempted`, `copyHeld`, `runCopyState`, `terminalCopy` | 全field | `runCopyState` |
| PF14 | `rejectPayloadAttempted`, `rejectPayloadState`, `rejectPayload` | 全field | `rejectPayloadState` |
| PF15 | `settleClaim`, `settleState` | 全field | 全field |
| PF16 | `ackTerminal`, `dispatchStarted`, `entered` | なし | なし |

将来のwrite候補はrun42field・cleanup36fieldで、残りrun23／cleanup29は読取り・不変確認だけである。cleanupのrunCopyState／rejectPayloadStateは親EFのskipped_cleanup／skippedへの固定記録だけで、copy／payload取得を許さない。ackTerminalはruntimeで確認手段がない間unobserved固定で、scratch結果を戻さない。dispatchStarted／enteredはfalse固定である。

同role slotは8field（`role`, `claimed`, `phase`, `position`, `fault`, `pending`, `published`, `faultAt`）を検査する。全てown data・既知flags、値は同role・claimed=true・building／handlers・fault／faultAt=null・pending=同shell・published=nullである。将来のwriterが変えてよいのはphase／position／fault／faultAtの4fieldだけで、claimed再消費・pending差替え・role変更・published writeは禁止する。

共有writeは同RecoveryAnchorの`notified`だけで、own writable data・既知flags・booleanを確認する。既存trueをfalseへ戻さず、同通知入口を共有して試行済みならskipする。元primary／revoked・既存notifyingはlexical変数でdescriptor対象ではない。started／sealed／sampling／runWorkは受付上の読取りだけで、新run開始・deadline／sample・旧workの第二writerを作らない。upper／operations／counts／token／reader／driver／sessionは元ownerへの固定受渡し責務で、pre-callの直接write対象ではない。

65＋8＋1の計74cellを直接write関連layoutの検査集合とする。shell／slotのown key集合は既知65／8だけでsymbols・余分なkey・欠落を拒否し、sort／dedupやraw入力のkeyで台帳を補わない。identity／pin・readonly topologyは次節で別確認し、74cellへ重複計上しない。

## 4 読取り参照先・停止条件・live pin

次表の値はcanonical参照か固定初期値と照合し、参照先をgetterから取得しない。readonly nodeは既存のshallow freeze・own data／flagsを維持し、tupleのlength／index属性も固定確認する。表外のgraphを再帰探索して安全性を推定しない。

| ID | 読取り対象・own descriptor集合 | 固定条件 |
|---|---|---|
| PR01 | RecoveryAnchorの`status`, `runGeneration`, `cleanupGeneration`, `preparation` | ready・元2slot・元controlPreparation。同notifiedは前節で確認済み |
| PR02 | controlPreparationの`origin`, `root`, `run`, `duty`, `runJoin`, `cleanupJoin` | 保持済みcanonical6参照。新root／seedを採用しない |
| PR03 | controlRootの`origin`, `binding`, `upper`, `writer` | 同binding・同診断owner／writer。別state／診断copyから再pinしない |
| PR04 | controlRunの`root`, `join`, `window`, `attempt`, `record`, `startClaimed` | 同root／runJoin、残りは元readonly templateのnull／false |
| PR05 | controlDutyの`root`, `run`, `join`, `anchor`, `record`, `readerIdentity`, `retention` | 同root／run／cleanupJoin、元null／undefined／emptyを維持 |
| PR06 | runJoin／cleanupJoinそれぞれの`root`, `kind`, `work`, `resolver`, `dispatchStarted`, `entered`, `settled` | 同root・各role、work／resolver=null、残りfalse。書込み先へ転用しない |
| PR07 | 同identityの`recovery`, `root`, `seed`, `kind`, `context` | 同owner／role、runはcontext=null、cleanupは同保持context |
| PR08 | 同pinの`runtime`, `identity`, `basis` | 同shell・同identity・元module基準。readyだけで完了しない |
| PR09 | cleanup contextの`record`, `anchor` | 同保持record／anchor。runでは参照先なし |
| PR10 | cleanup recordの`anchor`, `cleanupWork` | anchorは同参照。cleanupWorkはown descriptorの欠落またはdata undefinedだけを新規生成前提とし、継承読取り・既存legacy work採用はしない |
| PR11 | cleanup anchorの`binding` | 同binding。response等の未使用参照先は辿らない |
| PR12 | 固定tupleの`0`, `1`, `length` | 同fulfilled／rejectedの順・length=2、own keys3・基準Array prototype・凍結属性。同3closureは実参照／typeof／非Proxyだけを照合し、name／length／文字列／stackを起源証明にしない |
| PR13 | module live pinの6descriptor | P.prototype、prototype.constructor／then、P.species、global Object、Object.isFrozen。既存PIのvalue／get／set／flags・prototype連鎖を捕捉済み操作で照合し、検査でspecies getterを実行しない |

controlOriginは同凍結・null prototype・own key0の既存originとする。tuple／readonly topology／pinのpredicate・ownKeys／prototype操作も固定捕捉だけで、現在globalへのfallback・ownerごとの再捕捉はしない。module捕捉前の改変等で前提を説明できない場合は接続しない。

runの最終停止条件は、元status ready・started=true・primary=null・revoked=false・sealed=false、pre-call外の既存producerが走っていないこと、旧runWorkが未接続であること。cleanupは同status／started・未sealedと同current record／anchor／bindingを確認し、先行HTTP理由やrevokedだけで必要read-only cleanupを拒否しない。ただし別record、既存cleanupWorkとの二重生成、sampling／notifying中の再入は拒否する。値の条件復旧・見かけのreadyではPS01を返却しない。

元task／cleanupの期限・単一予算判断は元caller／元floorの既存位置で成立していることが必要で、pre-callはbudget.read／sample／clockを呼ばず、残時間から起点／deadlineを作り直さない。同ownerの期限前提が未結合なら§6の不足としてcall 0にする。停止／live pinの最終確認から同constructor callへ、caller callback・await・通知・未知依存を挟まない。

## 5 write-once aliasの供給元・消費点

製品の14aliasは現状const nullのままである。後続の一体単位で、runの7aliasとcleanupの4aliasだけをrole別の狭いlet保持型へ限定拡張し、cleanupのreject／terminalCopy／rejectPayloadの3aliasはconst nullを維持する。同primitive群の同取得値から直接記録し、主field再読による期待値化、同値copy／summaryからの復元、generic setter／登録口での更新を禁止する。

| ID | alias suffixと主field | 唯一のproducer・再利用拒否 |
|---|---|---|
| PA01 | CapturedResolveExpected → resolve | 同constructorの初回executor引数。entry claim後、runはreject保持後、cleanupはresolveだけ。role型／typeofだけで外部関数を採用しない |
| PA02 | CapturedRejectExpected → reject | runの同executor第2引数を最初に保持。cleanupはnull固定。半捕捉後の不足補完・二度目の引数採用0 |
| PA03 | CandidateExpected → candidate | 同P callの返却unknown。candidateHeldで未取得とnull／undefined等の取得済みを区別し、検査前に直保持 |
| PA04 | RegistrationWorkExpected → work／registrationWork | 同candidate安全確認後の同参照alias。新workを作らず、observer claim前後の途中失敗でも再pin・第二登録0 |
| PA05 | AckExpected → observerAckCandidate／確認済みobserverAck | 同then返却unknownを直保持。ackHeld／stateで取得・不適格・喪失を分け、verifiedだけを同参照へ限定。追加then列0 |
| PA06 | TerminalCopyExpected → terminalCopy | runの同owner・正常終了条件を満たす実copyを取得時に固定。copyAttempted／copyHeldで最大1試行。CPの0計数copy・正常snapshot fallbackは使わず、cleanupはnull固定 |
| PA07 | RejectPayloadExpected → rejectPayload | runでcopy不能時の固定internal_review_error payloadだけを最大1回保持。外部例外を採用せず、cleanupはnull固定 |

alias=nullだけを未使用証明にしない。constructor／entry・candidateHeld・observerClaim・ackHeld・copyAttempted／copyHeld・rejectPayloadAttempted／stateと、同frameの固定一度限りcontrol flowを組み合わせる。主fieldとaliasの片方だけが残れば不成立prefixとして保持し、失敗後に欠けた片方を補完して成功へ戻さない。先行fault・PS01が残る経路には同producerの再試行がない。

## 6 観測・固定終端の不足gateとconstructor call 0

次表はcallerが渡すbooleanや関数表ではない。同rootの固定source／compiled call graphと、同ownerの保持・post・finally責務を備えた一体構成の条件である。typeof function・値postのtrue・型一致だけでは充足しない。未配線の現在は不足を固定拒否し、設定flag／friend／test eventで有効へ切り替えない。

| ID | 必須の一体構成 | 不足時の停止・禁止 |
|---|---|---|
| PG01 | 同executorの限定capture writer・entry／role別全prefixとfailure記録 | 現3closureの固定拒否をそのままnew Pへ渡さない。引数保持が未接続ならcall 0 |
| PG02 | 同candidateのnative安全確認・同P／then live条件 | 値post・instanceof・関数形状だけで代用せず、未知thenableをawaitしない。不足ならcall 0 |
| PG03 | 一度限り登録・ack直保持／部分post／完了post・到達前後の失敗保持 | 第二登録・別tuple・ack補完で救済しない。call throwと復帰後post失敗を分けられなければcall 0 |
| PG04 | 正規reactionの共有claim／非throw・undefined復帰・後着限定writer | callback内に通知／drain／copy／setterを入れない。sealed診断／別recordへのwriteを防げなければcall 0 |
| PG05 | 全生成経路の固定finallyと未dispatch正常候補のfixed_abort | assert／throw後にも同drain責務が残ることが必要。生成済みworkを後工程へ放置する構成はcall 0 |
| PG06 | 元upper・共有通知・run実copy／固定reject分岐・cleanup限定resolve | copy／payload／notify失敗・再入を一度限りに保持し、then安全性・先行理由を守れなければcall 0 |
| PG07 | 同work／同settlerの限定使用・四軸終端／未確認保持 | work反応・callback退出・ack実終端・外側resource責務を分ける。void／復帰／sealから全解放を作る構成はcall 0 |
| PG08 | 同ownerの元予算／停止前提と有限な合成終了経路 | 別予算・追加timer・再起算・global listenerで代替しない。危険な実故障caseの有限child／終了契約が未承認ならそのcaseを実行しない |

gateは将来の成功・OOM不発生を事前保証するものではなく、失敗時の適格分岐と保持先まで実装・検証された固定構成を要求する。setter喪失・観測復帰喪失等で終端手段が残らない故障を「unconfirmedを書けるから安全」として起動せず、承認前は値／静的対照に分離する。新throw戦略・第二Promise・無期限joinは本書の承認外である。

## 7 固定schedule・拒否時保持・費用所有

| ID | 固定順・確定点 | 失敗時の保持 |
|---|---|---|
| PC01 | PS01／02の初回獲得→raw実参照比較 | 重複／再入は外側busyを解除せず拒否。foreign property／constructor call 0 |
| PC02 | 捕捉済みintrinsics前提→同slot／shellの非Proxyとown layout | getterやunsafe slot書込みで確認せず、PS03／04・元primary／revokedを先に残す |
| PC03 | 74cell→PRのreadonly topology・同context／未使用値・14alias=null | 不正fieldのdata化・再割当て・freeze解除／cloneで修復せず、同参照と失敗prefixを保持 |
| PC04 | PG01〜08の一体構成・元期限前提 | 不足はconstructor_pre／invalid_stateを基本とする固定拒否。constructorClaim・entry claim・alias取得は0 |
| PC05 | 最終停止条件→同P／then live pin再確認 | 先行HTTP／取消／期限のprimaryを保持。混入はevidence_binding_mismatch、layout／claim不整合はinvalid_state、intrinsic確認の制御異常はinternal_review_error |
| PC06 | 全条件後の同frameでconstructorClaim→calling→同P | 将来の唯一のcall到達点で、現在は未接続。中断でもPS01／消費済みclaimを戻さず、型／ticketから再開しない |
| PC07 | 既存primitive failureへ安全に反映→適格cold保持 | 最小slot3fieldが不適格ならhelperを呼ばない。元shell／slot・最初の理由を保持し、failed_retained全post成立へ補正しない |
| PC08 | 当該frameのfinallyでPS02だけ解除 | PS01／03／04・role claim／fault・取得参照は非返却。既存request／pristine3closureの固定拒否は残す |

PS03／04とslot faultはローカルな拒否保持で、別primary ownerや診断発行口ではない。既sealed upperへ追記せず、外部例外message／code／stackや生payloadを保存・出力しない。slotへ書けない場合のlexical診断と参照保持を、上位記録／copy／resource回収確認済みとは扱わない。

順とfield集合は固定で、失敗時はそのprefixで止める。全通過側のdescriptor取得は74cell＋PR集合（run58／cleanup63、初回module6を含む）＋最終module再確認6の保守上界としてrun138／cleanup143回とする。PR10の欠落確認も1probeと数える。拒否側に最小slot3fieldの再確認とcold2field保持を足した保守上界はrun143／cleanup148回。これはdescriptor取得の上界で、実時間・heap byte・全操作数の上界ではない。

ownKeys／prototype／freeze／Proxy predicate・scalar比較は別費目とし、既知node／fieldだけを固定回数扱い、可変graph・sort／dedup・追加clockへ広げない。descriptorは順次判定・破棄し、同時保持1個、結果はlocal primitiveだけとする。列挙は一対象ずつ処理し、最大65keyの内部array一つまで。拒否記録8scalar・alias14参照の寿命延長、基準descriptor、closure／Promise内部等の実backing容量・完全回収はUnknownである。全費用は同run ownerで、新C/G/P/R成功credit・別budget・追加floorを作らない。

## 8 後続の独立合成受入条件と今回の範囲

| ID | 合成対照 | 受入条件 |
|---|---|---|
| PT01 | shell65・slot8・notifiedとwrite許容の独立台帳 | source ASTの全fieldと一対一に対応し、run42／cleanup36のwrite許容を別oracleで確認。余分key・欠落・accessor／readonly／flags変更を拒否 |
| PT02 | raw／canonical field混入・getter化・Proxy | supplied propertyと不適格canonical getter／setterを呼ばず参照比較・descriptor順を確認。current copy・別anchor／owner・再pinを拒否 |
| PT03 | slot故障欄不適格・shell未取得・cold保持不能 | unsafe helperを呼ばずPS拒否と同期停止を保持。条件復旧後の再受付0、bootstrap限界を成功copyで補わない |
| PT04 | role・停止／再入・live pin変更 | stopped runと同record read-only cleanupを分け元primaryを保持。sampling／notifying・scan中再入・最終pin driftはcall 0 |
| PT05 | alias11 write-once／cleanup3 null固定 | falsey候補・片側保持・二重capture／登録・summary／field再読の再pinを拒否。native起源を値event／typeofから発行しない |
| PT06 | PGの構成を一つずつ欠落 | 他のlayoutが全て正しくてもconstructor／executor／then／settler call 0。caller flag／fake関数表／friendで通過しない |
| PT07 | 拒否理由・費目・保持上界 | first check／code・先行primary／slot故障は不変。descriptor／列挙の固定上界を独立計数し、期限／予算を再起算しない |
| PT08 | source／fixed dist・semantic・配布 | guard省略・順序交換・再試行・早期call・unsafe failure書戻しを構文正常変異で拒否。新export／raw writer／fixture台帳共有0、旧14本文／4export・元期限／並列度を維持 |

PTは全体接続の将来受入条件で、draft-0.1では実行しなかった。§9の先行実装ではPS診断と不足gateの固定拒否・安全なfailure反映に範囲を絞り、全field受付や生成の正対照は作らない。native呼出しの正対照はPGを満たす一体単位に限り、旧requestのfalseやreadonly値postをconstructor入口へ転用しない。

draft-0.1の静的確認（2026-11-18）：source ASTの割当てとshell65項目・各role slot8項目が一致し、重複／欠落0、role別write許容はrun42／cleanup36。設計ID64、3文書の相対link34・表19の整合、descriptor上界の算術、末尾改行・差分空白を確認した。親2文書は既存本文の後への参照追記だけで、旧root製品ソースは照合基準／更新後HEADと同一、stage済み差分0。本作業の編集は新設計書と親2文書だけで、別作業の補強試験・文書更新を変更していない。これは静的整合確認であり、契約の実装保証・native取得証拠ではない。ソース・試験・CHANGELOG・依存・設定に本作業の変更を加えず、Promise生成・製品moduleのimport／実行・試験再実行・build／pack・private公開・dispatch・実接続・実通信・設定変更・stage・コミット・Pushは行わない。

## 9 先行診断・閉鎖受付・安全なfailure反映の限定実装

draft-0.2では、initializeLegacyWorkflowの先頭でPS01〜04をroleごとに初期化し、control objectの生成と依存検査より前に8scalarを保持する。新しいprivate requestJoinPrecallはliteral falseだけを返し、製品callerを追加しない。旧requestJoinExecutionと3closureの固定拒否本文、14const null aliasは変更しない。

最初に固定role、当該busy／attemptedを判定し、初回だけattemptedとbusyを消費する。raw4参照を同shell／identity／pin／slotのlexical期待参照と照合し、不足・混入はowner／evidence_binding_mismatch、それ以外もcomposition／invalid_stateで固定拒否する。この参照比較は全owner fieldの資格検査ではない。先行check／code・空の場合だけ元primary・revokedをproperty検査より前に原始記録し、最初の理由を維持する。再入／二度目は原始拒否だけで、descriptor・helperを再試行せず、外側busyを解除しない。初回frameのfinallyだけがbusyを戻す。

reflectJoinPrecallFailureはcanonical slotの非Proxy確認後、faultAt→fault→phaseの3descriptorを順番に取得する。各fieldがown writable dataで有限値域を満たす場合だけ、既存recordJoinExecutionFailureへconstructor_preと保持済み理由を渡す。途中の不適格・例外ではhelperを呼ばず、slot／shellの元参照とlexical拒否だけを残す。最後のdescriptor参照も明示的に退役してから、同canonical shellが非Proxyである場合だけ既存cold保持へ進む。cold保持が失敗しても先行slot診断を上書きしない。sealedなupperへの追記・通知・copy・settlerは0である。

この閉鎖単位のdescriptor上界は初回3＋cold最大2＝5回、再入／二度目0回。一時descriptorは逐次扱い、coldへ持ち越さない。§7のrun138／cleanup143等は全field受付を含む将来上界であり、今回の実装coverageではない。全fieldのgetterを個別に変えた対照も固定拒否を保つが、それらを検査して合格させた証拠にはしない。停止／live pin・元期限の資格はまだ判定せず、生成call 0を維持する。

[source試験](../tests/review/native-join-precall.test.ts)、[独立対照／strict scratch](../tests/review/fixtures/native-join-precall-model.mjs)、[固定dist検査](../tests/review/fixtures/compiled-native-join-precall.mjs)、[検証記録](E2E_BEST_PRACTICE_NATIVE_JOIN_PRECALL_2026-11-18.md)を追加する。全field受付・alias writer・Promise／観測／固定終端は未実装・未接続で、PS診断から成功ticketや公開診断への昇格口は作らない。不足証拠・実backing容量・完全解放はUnknownのままである。
