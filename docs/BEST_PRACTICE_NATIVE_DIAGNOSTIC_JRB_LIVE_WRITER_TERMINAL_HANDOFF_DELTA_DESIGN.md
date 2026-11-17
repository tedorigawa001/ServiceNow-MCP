# JR-B同shellの実行writer・安全観測・固定終端受渡しの差分詳細設計

Version: native-diagnostic-jrb-live-writer-terminal-handoff-draft-0.1 / Date: 2026-11-18。
Status: MDだけの差分設計。基準HEADは`f7e3889`。値契約の実装commitは`3755cba`。[seed→実行設計draft-0.5](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_SEED_EXECUTION_TRANSITION_DELTA_DESIGN.md)§2〜6・9と、[先行field契約draft-0.5](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_EXECUTION_SEED_CONTRACT_DESIGN.md)EI／EF／EW／ETを、同shellの固定writerと後段責務の受渡しへ具体化する。追加済みのRoleGenerationSlot限定拡張方針は維持する。[固定pin設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_RUNTIME_PIN_DELTA_DESIGN.md)の安全な同候補・同P／then前提を置き換えない。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択・AP01〜06未承認を維持する。本書は実装・Promise生成・closure呼出し・観測登録・通知／copy／settler呼出し・private公開・dispatch・実接続・実通信・実機操作・設定変更を承認しない。今回は試験再実行・build／pack・stage・コミット・Pushも行わない。

## 1 現行との差分と閉鎖単位

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)の実shellはJoinExecutionSeedのfalse／null初期型、実slotは準備位置まで、期待alias14個はconst nullである。JoinExecutionValue／Inspectionはreadonlyの値投影で、origin leafと値postも製品callerを持たない。requestJoinExecutionはfalse、3closureはclosed_call固定拒否のままである。[既存検証記録](E2E_BEST_PRACTICE_NATIVE_JOIN_EXECUTION_VALUES_2026-11-17.md)の401件／compiled12本はこの閉鎖境界の履歴で、本書の実行writer・native観測・終端の成功ではない。

| ID | 既存境界 | 今回定める差分・禁止 |
|---|---|---|
| WD01 | readonly値variant | 値投影をmutable shellへcastしない。実shellの不変originとrole別可変fieldを最小分離し、初期値・配置を維持した同objectの運用型を後続で定義する |
| WD02 | RoleGenerationSlotの準備variant | 親設計§2のexecutor／reject／resolve／candidate位置・checked phase・実行失敗位置を使う。同pendingをcloneせず、旧empty／claimed／準備postを緩めない |
| WD03 | 値post／期待alias | 実fieldの固定writerと取得時aliasが必要。値postのtrue、同値copy、外部event、現在fieldの再pinでは書込み資格を作らない |
| WD04 | retained origin leaf | 同一性だけを確認する。constructorの新規取得資格、登録資格、後着callback資格、限定settle資格はそれぞれ別の固定履歴と組み合わせる |
| WD05 | 生成・観測・終端の未接続 | 呼出し可能な後続単位は生成→安全観測→固定abort／失敗終端を一体で持つ。生成だけを有効化した中間状態、旧要求の転用、新export／friend／mode／登録口は作らない |

本書の継続名・writer名・検査段階名は契約上の呼称であり、新しい製品関数・受付ticket・台帳の発行ではない。管理された同realmと漏出しないprivate control flowが前提で、state flag・関数の形・stackからnative呼出しの真正性を証明しない。任意のmodule捕捉前改変・内部field破壊・OOM下の完全回収はUnknownである。

## 2 同objectの物理保持・実field post

主保持先は同RecoveryAnchorのrunGeneration.pending／cleanupGeneration.pendingだけとする。shell／identity／pin／context／3closure／tupleは既存の実体を継続保持する。旧runPending／cleanupPending・EmptyJoinCell・runWork／record.cleanupWorkを新writerの保持先へ変えず、legacy execute／cleanに新生成を併走させない。

実shellはEF01〜15の既存own writable dataを利用し、実行直前・executor内・callback内でfieldや保持objectを追加しない。共通のreadonly originを最小抽出しても割当て・freeze順と実参照は不変とする。初期literal型へboolean／unknownをintersectionして解除したことにせず、実運用型と未使用projectionを区別する。RoleGenerationSlotの型拡張も準備variantと実行variantを区別し、type assertionだけでcheckedへ進めない。

期待aliasは同rootの既存lexical宣言位置に置く。取得するfieldだけをwrite-onceの保持型へ限定拡張し、主fieldに直接保持する同じ原始同期群で一度記録する。runはresolve／reject、cleanupはresolveだけで、cleanupのreject／terminalCopy／rejectPayload aliasはnull固定。candidate／ack／copyは保持有無と値を別管理し、null／undefined／0を受け取っても「未取得」へclearしない。aliasは照合用で、別生成物・新owner・独立cacheではない。

実field postはcanonical shell・同slot・固定段階の実dataを直接読むlexical検査とする。positionはslot、各履歴はshell、期待値は取得時aliasから供給する。callerのInspection object・診断copyを採用しない。executor／callback内で既存値post用のprojection／配列／tupleを新規生成せず、反射・正常ready検査も呼ばない。共有化する場合はrole別prefixや有限関係の最小・非割当てpredicateに限定し、従来のreadonly値入口と独立oracleを残す。共通化のためにnative操作・writer・任意raw入力を値kernelへ持ち込まない。

途中postと完了postは別である。特にthen復帰直後のackHeld=true／ackState=held・observerState=registering／busy=trueは保持途中の正当な区間であり、完了したchecked／登録returnedの値postをそのまま適用しない。専用の部分postで同ack候補・実prefixを確認し、全条件後の固定同期群だけでverified alias／登録完了へ進める。既存値postの完了条件を途中状態に合わせて緩めない。呼出し自体のthrowと復帰後postの失敗も別siteにし、取得済みackを失わない。

## 3 writer資格と書ける範囲

roleは同closureの固定値で選び、raw.kind／raw slotからwriterを選ばない。raw集合はcanonical実参照と比較してから自ownerのdataだけを読む。以下の区間は互換でなく、origin leafのtrueだけではどのwriterも呼べない。

| ID | writer・入場資格 | 書ける範囲・禁止 |
|---|---|---|
| WW01 | 同rootの生成前継続 | 同owner・未使用seed・handlers完了・元run停止／同record cleanup条件・live pin・後段保持先を確認。まだsettler／候補を採用しない |
| WW02 | 同固定constructor call frame | constructorClaim、not_called→calling→returned／threw、返却unknownの直保持と同alias・位置だけ。JR-Aの開始claimを再消費しない |
| WW03 | 同Pへ渡した固定executorの初回entry | entry claim→running→run reject→resolve／cleanup resolve→退出の実prefix。再入frameが外側の退出・busyを代行せず、descriptor・通知・copy・Error確保・queue・settler呼出し0 |
| WW04 | constructor外の候補・登録継続 | 同candidateの安全確認、同work／registrationWork、observer claim／busy／到達、返却ack保持／確認。別work・再登録・新callback／tuple生成0 |
| WW05 | 同登録の固定reaction closure | 同work／handler／到達・共有callback claimを確認し、原始observed／terminal・自身の退出と固定callbackFaultだけ。raw value／reason／thisの保存・property読取り・通知・drain・throw・thenable返却0 |
| WW06 | 生成同期群内の原始execution failure | 自roleの最初のfaultAt／fault→空の場合だけ元primary→同期revoked→failed_retained／unconfirmed。参照・保持位置・準備detail・実factsを消さず、準備用failJoinHandlersへ巻き戻さない |
| WW07 | 同retained originの固定drain | 一度限りのdrainと操作別資格で既存upper記録／共有通知／run copy／固定payload／同settlerへ渡す。constructor／reaction frameの内部では呼ばない |
| WW08 | 早過ぎるcall・foreign・終端後の再要求 | 自ownerの固定拒否／先行診断保持だけ。foreignへの書込み、関数／候補交換、claim返却、通常利用への復帰、公開・dispatchは0 |

WW06は割当て・依存呼出し前の原始保持であり、snapshot・bridge・正常終了copyを成功したことにしない。ownerを照合できないraw参照には書かず、拒否先はlexicalに保持した自role slotとする。先行HTTP・取消・期限のprimary、最初のlocal site／code、handlers準備履歴は別々に保持する。

固定理由は、owner／alias混入がevidence_binding_mismatch、重複・段階／claim不整合がinvalid_state、pin／constructor／観測／通知等の制御異常がinternal_review_errorである。固定abortのcancelledは元primaryが空の場合だけとし、local故障codeとの同一視・先行理由の上書きをしない。siteは既存JoinFaultSiteのconstructor_pre／constructor_call、executor_entry／reject_capture／resolve_capture／executor_exit、candidate_check、observer_pre／observer_call／ack_hold／observer_post、callback_entry／callback_write、drain_entry／upper_record／notify／run_copy／reject_payload／settle_pre／settle_callを対応する固定操作位置で使う。外部例外のmessage／code／stackや時刻・引数本文を診断へ採用しない。公開codeの写像・stageは元ownerの契約を維持する。

正規の後着reactionはfailed／revoked／sealed・current交換後でも元workの反応と自身の退出だけを記録できる。これは新規生成／別record cleanupの資格ではなく、元primary／role fault・checked／公開診断を変更しない。早期・同期・重複等のcallback異常は同shellの最初のcallbackFaultへ限定記録し、既に封印した上位診断へ追記しない。未封印の実行失敗を上位へ渡す場合も、原始記録を先に残し、callback外のdrainだけがその責務を引き取る。

## 4 claim消費・同期確定点

| ID | claim・既存履歴 | 消費点・失敗後の条件 |
|---|---|---|
| WC01 | JR-A role claim／handlersClaim | 準備で既に消費済み。実行開始時に再消費・返却せず、同slot／同3closureを使う |
| WC02 | constructorClaim | WW01全postと後段保持前提の確認後、callingより先にtrue。未呼出し中断でも非返却で、2回目のconstructorは0 |
| WC03 | executorEntryClaim | 同固定call frame・calling・未使用entryを確認し、引数参照保持より先にtrue。run rejectのみ等の半prefixを完成へ補完しない |
| WC04 | observerClaim | 安全な同candidate／workと同tupleを確認後、登録開始前にtrue。最終post拒否はrefused・到達falseで、条件回復後も再登録0 |
| WC05 | callbackClaim | 同origin／同registrationWork・登録到達を確認できた最初のentryでtrue。早過ぎる／異ownerは正規観測にしない。登録busy中の同期entryもclaim非返却・synchronous faultで、反応成功へ数えない |
| WC06 | failureDrainClaim | 同retained origin・固定abortまたは最初の失敗を確認後、依存操作より先にtrue。再入で第二drainを開始せず、finallyもclaimを戻さない |
| WC07 | upperRecordAttempted／notifyAttempted | 判断へ入る前に消費し、sealed／共有通知済みskipも再判断しない。notifyはRecoveryAnchor.notifiedも共有し、入口試行と実成功を分ける |
| WC08 | copy／payload／settle試行 | 実依存呼出し前にそれぞれ先行消費。cleanup copy不要・payload不要・既終端／settler不足のskipは親EF契約どおり未試行と区別し、drain非返却により再検討しない |

busyを解除できるのは当該試行で獲得したframeだけである。内側拒否frame・stop／closeは外側のbusyを解除しない。callbackClaimはfulfilled／rejected間で共有し、2本の独立claimを作らない。正常／失敗いずれもclaimと保持参照は非返却である。

## 5 生成から安全観測・固定終端への受渡し

次表は将来の一体実装の固定順であり、今回は一切実行しない。受渡しは同lexical originと実fieldを利用し、公開packet・証拠object・新owner・handoff ticketは作らない。

| ID | 確定区間 | 次段へ渡すもの・拒否条件 |
|---|---|---|
| WH01 | 生成前の全post | 同root／slot／pending／identity／pin／3closure／tuple、元停止条件、観測・drain・未確認保持先。安全観測と固定終端を対にできなければconstructor call 0で停止 |
| WH02 | constructor calling→executor捕捉 | 捕捉済み同Pと同executorだけを一度使用。entry→run reject→resolve／cleanup resolveの順に同shellとaliasへ記録し、各位置と正常／異常退出を分ける |
| WH03 | constructor復帰またはthrow | 返却値を検査／通知前にcandidateと同aliasへ直保持しcandidateHeldを記録。先行executor faultがあっても失わない。throwで未返却ならcandidateを推定せず、外部例外本文も保存しない |
| WH04 | 安全な観測候補への限定受理 | 同生成関係・同保持candidateを先に照合し、固定predicateでProxy拒否→native Promise→同prototype→own constructorなし→P／then／species等のlive pinを確認。失敗は保持するがthen getter・同化・await・別Promiseで救済しない |
| WH05 | 同workへの登録 | 同candidateをwork／registrationWorkと同aliasへ結合。claim→registering／busy→最終live post→registrationReached→捕捉thenの一度適用。constructor成功と観測資格は別で、failed候補も安全性が成立する場合だけ対象 |
| WH06 | ack候補保持→登録post | 返却unknownをobserverAckCandidate／同aliasへ直保持しackHeld／held。部分post・native安全確認後にverified aliasと登録完了へ進む。不適格はunsafe_retained、復帰参照喪失はreturn_lost。native call throwと返却後post異常を混同せず、再登録しない |
| WH07 | 正規reactionの原始記録 | 先行保持の同2closureと同work・到達・共有claimを照合。未観測／fulfilled／rejectedとcallback退出を別に書き、引数の内容は保存・出力しない。後着でも同private記録以外の通常処理を再開しない |
| WH08 | 外側finallyから固定drain | 未dispatch正常候補もfixed_abortとして同drainへ合流。元理由が空ならcancelled、既存理由は保持。観測不能・必要settler不足・副作用失敗は同pendingに未確認責務を残し、正常公開・slot clear・全解放へ進めない |

WH04のnative安全性は「正常生成成功」と独立で、slot fault／revokedを消す必要はない。ただし別ownerのnative Promiseを同prototypeという理由で採用せず、同値candidateをmutable fieldから再pinしない。型・value post・関数のtypeofは起源証明ではない。getterを実行する検査はせず、then適用時に使われる既知のintrinsicと基準species条件だけを固定pinの範囲で扱う。

WH06の完了途中は§2の部分post、完了後は登録完了postと実fieldからの値関係を照合する。復帰後postが失敗しても、実際に返ったackの保持を取り消したり「native callがthrowした」と書き換えたりしない。work反応／callback退出／ack実終端は独立で、ackを確認するために追加then列を作らない。

固定drainは既存upperと元診断stage（runはstop、cleanupはcleanup）を使い、upper記録→共有停止通知→runの実copy確認→必要時の固定internal_review_error payload→適格な同settlerの順とする。各試行は呼出し前、throw後も先行理由と次の適格責務を保持する。sealed upperはskipped_sealed、通知入口試行済みはskipped_sharedで、公開診断や既存共有履歴を更新して成功へ見せない。

runのresolve対象は、同ownerの実operations／counts・token退役・元の正常終了条件を専用postで確認した実WorkflowSnapshotだけである。snapshot()の単独呼出し、sealだけ、CP構築失敗の0計数copyはその代替にならない。既存resourceのrelease／cleanup factsを新drainが捏造することもない。正常copyを確認できなければ、保持した固定payloadを適格な同rejectへ一度渡す限定分岐だけを検討する。resolve直前には同copyの固定shape・到達prototype上のthen不在を確認し、確認から呼出しへ任意介在を挟まない。

cleanupは安全で同executor起源のresolve(undefined)だけを使い、reject／run copyを混入しない。既にrejectedを観測したworkを後続resolveでfulfilledへ修復したとは扱わず、既終端ならsettleを省略する。未観測はpendingの証明ではなく、同生成・捕捉履歴に基づく限定settleの判断と、後の正規実終端観測を分ける。必要settlerや安全payloadを欠けば、API拒否とprivate未終端を分けて保持する。

## 6 失敗prefix・診断・未確認保持

| ID | 最初の失敗位置 | 固定保持と禁止 |
|---|---|---|
| WP01 | claim前の混入・停止・pin拒否 | 自roleの最初のsite／code・元primary・既存準備を保持。constructor call 0、foreign read／write 0。条件復旧で同slotを再利用しない |
| WP02 | claim後未呼出し／constructor throw | 非返却claim・not_called／calling／threw・実際のentry有無を保持。呼出し0と試行1を区別し、未返却candidateを補わない |
| WP03 | executor再入・半捕捉・異常退出 | entry claim・run rejectのみ等の実prefix・取得時alias・最初のfaultを保持。constructorが返ればそのcandidateも保持する。再捕捉・第二constructor・準備位置への巻戻し0 |
| WP04 | candidate／pin不適格 | unknownを保持してunsafe／unconfirmed。生成失敗でも安全な同候補だけ限定観測へ渡す。未知thenableの同化・無期限join・別work補完0 |
| WP05 | 登録拒否／throw／ack喪失・不適格 | observer claim・到達・実呼出し結果・取得ack・busy所有・callback履歴を保持。post失敗をnative throwへ上書きせず、第二登録／第二ack／global listenerでの救済0 |
| WP06 | early／synchronous／duplicate／後着reaction | 最初のcallback faultと共有claim・原始反応・退出を分離。先行primary／role fault・既sealed上位診断は不変。内側callbackからdrainを起動しない |
| WP07 | upper／notify／copy／payload／settle異常 | 試行前履歴・実復帰／throw／skip・保持copy／payload・元実計数を残す。依存復帰やvoidを終端／cleanup confirmedにせず、copy／settleの再試行0 |
| WP08 | close／試験終了時の未確認 | 同pendingとwork／callback／ack／resourceの未解決責務を保持。参照clear・別正常cache・GC・process終了・診断sealを最終discardの証拠にしない |

保持位置は最後に記録できた参照prefix、faultAtは最初の故障siteである。executor故障後にcandidateが返ればposition=candidateまで保持し得るが、fault／primary・failed_retainedは戻さない。途中の主fieldとaliasの一方だけが記録された不成立も、残った実参照を保持した未確認であり、欠けた片方を後で補完してpost成功にしない。

正常条件で未dispatch workを作った経路は、同安全観測と固定abortで有限終端を確認できることが生成の前提である。一方、意図的なsettler喪失・任意field破壊・観測復帰喪失には、その前提を破って終端手段が残らない故障がある。そうした分岐を「unconfirmedを記録できるから安全に実行可能」とは扱わない。先行段階は値／静的対照に限定し、実故障対照は有限な別child／終了契約の承認・整備前に動かさない。新しいthrow戦略・追加Promise・timer・listenerで黙って救済する承認も本書に含めない。

固定drainの退出状態はexitedまたはunconfirmedで、retentionにreleased／discardedを追加しない。runtimeでack実終端を確認できない間はackTerminal=unobservedを維持する。scratchの有限確認結果を製品writerへ再投入する入口は作らず、外側resource・session close／予約返却・reader操作／driver disposeは元ownerの別責務としてUnknownを残す。

## 7 後続の合成受入条件と実装順

| ID | 独立対照 | 必須条件 |
|---|---|---|
| WA01 | 既存未使用・request／3closure・value post | pristineの固定拒否、元14関数／4exportと初期descriptor期待値を維持。正常checked値を供給しても実writer／constructorへ昇格0 |
| WA02 | 同object・実slot拡張・取得alias | 同pendingのまま全実field／slot位置を照合。foreign／copy／revoked Proxy、alias再pin・半保持・fake eventからの実行資格復元を拒否し、foreign hook 0 |
| WA03 | constructor／entryとrole別全prefix | 未到達call 0、同期throwは試行1以下、entry1以下。run reject→resolve／cleanup reject=nullを固定順で確認し、再入／復旧後の再利用0 |
| WA04 | 部分ack postと登録完了post | ack held・registering／busyの途中を完了形と分ける。call復帰とpost故障・ack喪失／不適格を区別し、再登録0・ack最大1 |
| WA05 | 正規／同期／重複／後着callback | 同originと登録到達・共有claimを確認し、後着は元private事実だけ。引数hook／保存／出力・通知／drain再入・公開診断更新0 |
| WA06 | 固定abort・通知／copy／payload／settle故障 | 最初のsite／primaryと実計数を保持。共有通知・copy／settleの二重試行0。copy then安全性・run fallbackとcleanup resolveを混同しない |
| WA07 | 四つの終端責務 | work反応・callback退出・ack実終端・外側resource責務を独立判定。正常で安全な生成caseは試験終了前に有限終端確認し、未確認を成功件数／全解放にしない |
| WA08 | source／固定dist・変異・配布 | 未使用checkerを緩める／claim返却／post省略／先行理由上書き／誤終端creditを独立oracleで検出。source fallback・新export／friend／登録口・fixture台帳共有0 |

最初の実装候補は実運用型・同objectの実field post・原始failure／未確認保持までの閉鎖単位である。この段階でも固定call・constructor／observer／drainの実呼出し、既存request／3closureの実行分岐は開けない。型を広げただけの製品raw writerやtest event受付も作らない。

その後の呼出し単位はWH01〜08を一体で接続し、各生成経路のfinallyへ固定drain責務を残す。試験assertが失敗してもworkを放置しないことが必要で、観測・安全payload・限定settle・未確認保持先のいずれかを説明／検証できなければconstructor前で停止する。生成だけを先に接続する分割はしない。

元の個別5秒・既定並列度、旧比較child60秒・製品全体60秒は変更しない。新clock／sample／floor・別予算・native C/G/P/R成功creditを追加しない。費用所有は同run ownerで、aliasを別object数にしない一方、到達参照による寿命延長は別に扱う。実backing容量・完全回収・最終discard・JR-Cのprivate公開・dispatch／正常finishは本差分の保証外である。

## 8 今回の静的確認と未実施範囲

基準HEADのliteral shell・slot／14null alias、origin leaf・段階値post・固定拒否と、旧snapshot／execute／close・既存pin／claim／失敗契約を読み、現行の実装と将来のwriterを分けた。本書と親2文書の参照追記だけを対象とする。WD／WW／WC／WH／WP／WAは設計IDであり、試験成功件数ではない。

文書link／表／ID、末尾改行・差分空白・変更範囲と、ソース／試験／CHANGELOG／依存／設定が基準HEADと一致することを静的に確認する。製品moduleのimport／実行、試験再実行・build／pack、Promise生成・closure呼出し・観測・終端・private公開・dispatch・実接続・実通信・設定変更・stage・コミット・Pushは行わない。

MD3fileのlocal link34件・表19個、新設計ID45個の順序／重複／欠落・列数、末尾改行・差分空白を静的確認した。親2文書は基準HEADの全内容を保持した参照追記だけで、ソースは基準HEADとbyte一致し、変更はMD3fileだけ・stage0である。これらは文書整合の結果であり、新しいwriter・Promise・観測・終端を実行した試験結果ではない。
