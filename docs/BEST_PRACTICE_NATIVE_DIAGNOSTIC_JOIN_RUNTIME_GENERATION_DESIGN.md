# JoinRuntimeの段階型と生成資格およびPromise保持失敗境界の詳細設計

Version: native-diagnostic-join-runtime-generation-draft-0.12 / Date: 2026-11-18。
Status: JR-A（§12）、JR-Bの先行shell／非実行pin／失敗保持・closure／tuple準備と非実行variant／origin／段階別値post（§13）だけを合成依存に限定して実装。設計基準HEADは`c466b75`、JR-Aの基準HEADは`b770e59`。[構築回収・Join公開設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_CONSTRUCTION_JOIN_DELTA_DESIGN.md)§5〜7の生成・保持部分を具体化する。closureの実捕捉／観測body・同Promise／settler生成・拒否観測・失敗終端・private公開は未実装・未接続である。

draft-0.12のレビュー修正：レビュー修正の基準HEADは`6c798d9`。JoinRuntime設計§13はJR-Bの下位設計（pin・handler・seed・seed→実行）を参照してきたが、同shellの実行writer・安全観測・固定終端受渡し設計（draft-0.1）への参照が欠けていた。§13へ参照を加え、seed設計（現draft-0.5）・seed→実行設計（現draft-0.4）の版参照を直した。製品コード・試験は変更していない。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`ec7b768`。§12は拒否時に同期revokedへすると定めていたが、独立oracleは拒否後のprimaryだけを確認しており、`rejectJoinGeneration`の`revoked = true`を外した変異がsource・compiledの両対照を通過した。全ての資格／同一性拒否と失敗保持でrevokedを確認し、同期失効を外す変異を構文正常な変異の12件目に加えた（§12）。製品コードは変更していない。

生成資格の確認と失敗の保持先を、Promiseの生成より先に確保する。構築readyはrunの生存資格ではなく、Promiseの保持・終端はnative cleanupや正式受理の証拠ではない。runとcleanupを同じ停止条件で扱わず、既存の単一状態・元floor・同ownerの責務を維持する。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、Unknown、通常経路未切替、VM／監視／telemetry調査保留、LOAD6／LOAD7選択とAP01〜06未承認を維持する。§12・13の限定実装・合成検証以外は進めず、Promise生成試験・dispatch接続・実接続・実通信・実機操作・設定変更・build／runner設定変更・公開・コミット・Pushは行わない。

## 1 現行の事実と対象範囲

| 対象 | 現行の事実 | 本差分の契約 |
|---|---|---|
| 構築ready | [旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のready判定はRecoveryAnchor.statusだけを見る。正常stop／closeは別のrevoked／sealed等を更新する | readyだけで生成を許可しない。正規identityと同closureのrun／cleanup別資格を併せて検査する |
| 空seed | RootControlLink／RunLink／ResourceDuty／2空JoinCellはreadonly。現checkerはnull／falseも要求する | 空seedは変更せず、新slotの段階別検査を別にする。不変identityの検査は省略しない |
| 保持slot | 旧anchor直下のrunPending／cleanupPendingはliteral null。各roleのpendingはJR-B閉鎖準備でだけ先行shellを保持する | 同anchorが持つ各RoleGenerationSlot.pendingを主保持先とする。旧anchor直下のpendingを第二writerにせず、claimと失敗scalarを先行準備する |
| 実work | runWork／record.cleanupWorkは旧Promise executor内でenqueueする | 今回は変更しない。新旧workを同時生成せず、将来の採用時に唯一のworkへ統一する |
| 構築failure copy | CP00〜05は取得前失敗をclosed／sealedの同copyまたは固定拒否へ終端する | run／cleanupの生成失敗へそのまま流用しない。特にresource取得後に構築失敗としてseal・空扱いにしない |
| 補強試験 | raw不正の同copy終端、通知throw下のbegin拒否、正常aggregate後のcopy不能の3件は基準HEADに含まれる | [既存試験](../tests/review/native-construction-recovery.test.ts)を変更・削除せず保持する。今回の新契約の成功数には加算しない |

対象は旧root内だけのprivate型・固定slot・生成継続である。session／source／bridge／writer／resolver／Promiseを外部から採用する口、generic factory／installer、global台帳、試験用friendは追加しない。補強試験は確認開始時に未コミット差分がなく、既存commitの内容をそのまま維持する。CP00〜05のraw不正に関する意図した公開差分も本書では取り消さない。

## 2 唯一の所有者と固定slot

以下の型名・field群は最終形の内部契約である。JR-Aで実装した部分と未接続部分は§12で区別する。structural copyやreadonly viewはauthorityではなく、生成・消費の入口は同rootの固定closureだけにする。

| 内部契約 | 固定field群 | writerと同一性 |
|---|---|---|
| RoleGenerationSlot | role、未使用／消費済みclaim、最後の固定生成位置、失敗位置、pending参照、published参照 | run／cleanup各1個。CP00側で原始fieldを先行準備し、claimはruntime割当てより前に消費する。別ownerのslotを引数で受けない |
| JoinIdentity | 同RecoveryAnchor、同RootControlLink、同空seed、run／cleanup kind、role別context | readonly。run contextは取得前でrecordなし、cleanup contextは同current record／anchorへの実参照。空ResourceDutyのnullを実recordへ書き換えない |
| JoinRuntime | 同identity、generation phase／prefix、executorの未開始／実行中／正常退出／異常、candidate、検査済みwork、resolve、role別reject、観測用ack、観測中flag／観測状態、settle試行履歴、固定local fault | 同roleの生成継続だけが更新する。run／cleanupの型と結果型を分け、他roleのsettlerを代入できない |
| GenerationView | 同slotから読む段階ごとのreadonly値 | 検査用の非権限view。copyの再投入・view一致だけで生成資格を復元しない。hot pathの検査は固定code／真偽値を返し、汎用成功tokenを発行しない |

candidateはconstructorから戻った参照を直ちに保持するunknown slotである。検査済みworkは同candidateへのaliasに限り、別Promiseではない。pendingとpublishedも同JoinRuntimeへの参照で、cloneや第二runtimeを作らない。失敗後にcandidateやpublished参照が残っても、成功phaseとは扱わない。

同一性の不変検査は、正規anchor／root／seed／role slotの実参照を最初に比較し、その後に自分の固定dataだけを読む。foreign／copy／Proxyのfieldやfunction名を読んで正規性を推定しない。phaseを進めてもkind・seed・ownerを交換できず、foreign台帳の検索・失効・返却はしない。

既存primary／revoked／sealed／started／current、last／sampling、issue／consume claimは引き続き1組だけである。generation claimはwork生成の履歴で、第二のrun開始claimではない。local faultは当該生成slotの失敗位置を表すだけで、rootの先行理由を上書きする別primaryではない。

## 3 runとcleanupの生成資格

同owner不一致の拒否、正規合流、新規生成を区別する。入力照合で拒否した時点では生成claimを消費しないが、自rootの停止・先行理由は残るため、拒否後に資格を回復して再試行できるとはしない。foreign側へは書かない。

| ID | roleと入口 | 資格・固定分岐 |
|---|---|---|
| QJ01 | 共通identity | 同anchor／root／seed／roleと構築ready。正常継続・生成slotが同owner由来であること。公開診断・同値copyからは採用しない |
| QJ02 | run新規生成 | 同closureで!started、!revoked、primaryなし、!sealed、run生成claim未使用、pending／publishedなし。descriptor／Responseはここで読まない |
| QJ03 | run開始との同期群 | 元started=true→run生成claim消費を固定同期群にする。途中故障でもstartedを戻さず、第二executeは既存の再execute拒否へ。claim未消費のまま中断した場合も再生成資格を補わない |
| QJ04 | cleanup新規生成 | 同current recordとanchor.binding、同runへの所属、同role slot、!sealed、cleanup生成claim未使用。同recordへのprivate結合が未実装の間は実経路へ接続しない |
| QJ05 | cleanup停止下 | revokedや先行HTTP理由があっても、同既取得recordのread-only cleanup生成資格をそれだけで拒否しない。発行／受理は停止したまま。sealed後の新規生成は拒否し、責務を保持する |
| QJ06 | 正規合流 | 正規published workがあれば同workを返し、生成claimを再消費しない。runの重複executeは従来のrequest_rejected経路を維持し、cleanupの正規再合流を重複生成エラーにしない |
| QJ07 | 失敗後・生成途中再入 | claim消費済みで未公開、またはfailed_retainedなら再生成しない。同roleの固定拒否／失敗終端へ進み、別Promiseや別recordで救済しない |

資格検査のための新しいbudget.read、sample、bridge.check、native getter、scheduler呼出しは追加しない。構築readyや既存lastだけで期限内を証明したとはせず、元task／cleanupの元位置で同sample・floorを確認する。cleanupで元floor到達済みでも、生成metadataを解放確認へ変えたり、新しいwait／10秒／60秒を作ったりしない。

cleanupの正対照は、同ownerが実際に保持するrecordへ結合したものだけとする。生成単体の合成試験で使うprivate fake contextは実recordの所有保証とは別であり、別assemblyのsummaryやcallerのrecord供給でこの資格を代替しない。

## 4 段階型と不正variantの拒否

親設計のbuildingを以下の保持prefixへ細分化する。generation phaseはslotの制御進行、prefixは最後の取得・保持位置であり、run phaseやnative cleanup phaseとは別である。型のnarrowingだけでauthorityを与えない。

| 段階 | 必須の保持・履歴 | 禁止される状態 |
|---|---|---|
| empty | role slotのclaim未使用、pending／publishedなし | workやsettlerが存在、先行失敗の消去 |
| claimed_unheld | claim消費済み、runtime未保持、固定失敗先は先行確保済み | emptyへの復帰、第二runtime割当て |
| building | 同runtimeをpendingへ保持、candidate／workなし | queue・task・sample・native操作、publishedの成功扱い |
| capturing | executor開始履歴を一度消費。runはreject→resolve、cleanupはresolveを先行fieldへ保持 | cleanupのreject field非null、別roleのsettler、executor二重入場 |
| captured | 同executor由来のrole別settlerを保持し正常退出、constructor未復帰またはcandidate未保持 | candidateなしでwork型へ昇格、settlerだけでpublishedへ進む |
| candidate_held | constructor返却参照を同candidateへ保持、work未確認 | thenableへの自動同化、未検査candidateのnormal work採用 |
| checked | 同candidateが検査済みworkと同参照、settler整合・固定観測境界の確認済み | raw candidateや別Promiseをworkへ交換、失敗prefixの隠蔽 |
| published | 同runtimeの公開先参照と最終postが一致し、最後のmarkerのみ確定 | dispatch／entryを暗黙開始、公開済みをsettledやcleanup confirmedと解釈 |
| failed_retained | claimと取得済みprefix・candidate／work／settler・local faultを保持 | workの再生成、slotの空扱い、未知の終端／退役の補完 |

runのstrict型はPromise&lt;WorkflowSnapshot&gt;とresolve／rejectのpair、cleanupはPromise&lt;void&gt;とresolveだけを持つ。cleanupのrejectはliteral nullとする。capturingのrun rejectのみ保持したprefix、capturedだがworkなし、candidateがあるが未確認というvariantを明示し、不足fieldを非null assertionでpublished型へ押し上げない。

dispatch／entryは本差分のphaseに含めず、関連履歴を予約する場合もfalse／未使用に固定する。失敗時のsettleは「失敗を返すための限定終端」であり、正常task開始の許可ではない。settle試行履歴と実際のPromise終端観測は分ける。

## 5 同Promiseとsettlerの固定生成順

| ID | 同期区間の操作 | 保持・拒否境界 |
|---|---|---|
| GJ01 | QJ01〜07を照合し、既存startedとrole生成claimを所定順で消費 | 割当て・callback・awaitより前。失敗時の固定scalarと保持先を使用する |
| GJ02 | 同identityのJoinRuntimeを割当て、同pendingへ直ちに保持 | 次のfreeze／constructorより前。割当て途中の失敗でもclaimを戻さない |
| GJ03 | 捕捉済みPでwork候補を1回だけ生成 | executorは同slotへの原始履歴・settler参照の記録だけ。enqueue、budget、bridge、native、任意callback、正常resolve／rejectを呼ばない |
| GJ04 | executorでrunはreject→resolve、cleanupはresolveを直接保持 | 中間pair objectを先に割り当てて参照を失わない。関数の名前・length・shapeは生成元証拠ではない |
| GJ05 | constructor返却参照をcandidateへ保持し、prefixを先に記録 | workの検査前でも取得済み参照を捨てない。getter／thenを呼んで型判定しない |
| GJ06 | 同owner・kind・同executor履歴・settler・candidateを固定postで照合 | Proxy／非Promise／realm不一致等を拒否。同Pと捕捉済みprototypeを使い、任意thenableを同化しない |
| GJ07 | 同candidateへのwork aliasを保持し、固定の拒否観測境界を設置・確認 | 観測は成功／失敗の記録だけで、受理やnative cleanup確認へ昇格しない |
| GJ08 | roleのprivate公開先へ同runtime参照を保持→最終全post→published marker | この最後の成功が公開確定点。returnまでqueue／callback／awaitを挟まない |

GJ02〜08の正常同期群では外部注入依存を呼ばない。Promise executorに既存enqueueを移し戻すこと、生成中にraw descriptor／Responseを読むこと、観測のために新しいdeadlineを開始することは禁止する。正常時の内部workはroleごとに1個である。

candidateは先にProxyを拒否し、安全な組込み検査でnative Promiseであること、同捕捉Pのprototype／constructor条件を確認する。既存observeの制約を参考にするが、追加workを作る同関数をそのまま生成validatorとして呼ばない。settlerは同executorが直接保持した実参照だけを使い、caller由来関数やcopyしたpairを採用しない。

constructor／executorの例外でwork候補が既にrejectしている場合も、理由本文を出力せず固定local faultを残す。settlerが揃っていてもexecutorが異常退出した候補はcheckedへ進めない。拒否観測は同workに一度だけ付ける。捕捉済みthenによる派生ackを保持する場合は固定1slotに限定し、workや生成claimとは別物とする。observer callbackは原始観測だけを更新して正常復帰し、派生ackへ再帰的にobserverを増やさない。observerの登録・ack取得に失敗した場合はchecked／publishedへ進めない。

GJ07は捕捉済みintrinsicの境界である。constructor／species等のlive条件を固定descriptor検査で照合し、登録前後に同owner・停止・prefixを再確認する。observer登録中の同期callback／再入は異常として保持し、登録途中を成功観測にしない。descriptor一致だけで任意getterの安全性を証明したとはせず、既存のintrinsic捕捉条件が不成立・検証不能なら公開しない。正常生成の同期群にcaller callbackを追加する許可ではない。

現行observeがspeciesまで確認済みとは扱わない。基準realm由来の固定pinと新しいdescriptor検査の生成位置・拒否条件をJR-Bの前提に含め、期待descriptorをcallerから受け取らない。この前提を確定・検証できなければ、observerや公開の接続を止める。

「同Promise」とはexecution workの同一性であり、公開APIのasync wrapperや、上記の有限な観測ackまで全て同じobjectという意味ではない。observerの追加は新しいnative操作・dispatch・C/G/P/R計上を許可しない。割当て費・到達先容量や任意のintrinsic破壊下の完全回収を保証したとはしない。

## 6 失敗境界とCP構築回収との分離

CP00〜05のfailConstructionは取得前の構築失敗専用である。Join生成の失敗はready ownerのrun制御失敗として扱い、既存primary・HTTP・native factsを保持する。特にcleanup生成時のcurrent／readerIdentityを無視してclosed copyを作る、正常継続をfailure facadeへ差し替える、空のoperationsを報告する処理は禁止する。

| ID | 失敗位置 | 同ownerで保持・終端するもの |
|---|---|---|
| FJ01 | 資格／identity拒否 | 自rootの固定拒否と先行理由。foreignを変更せず、未消費claimを成功資格と解釈しない |
| FJ02 | claim消費後・runtime未保持 | 固定slotのclaim・生成位置・理由。workなしを記録し、別workを「同Promise」として作らない |
| FJ03 | executor／settler捕捉途中 | 同pending、実際に捕捉した関数、executor履歴。未取得resolve／rejectを推定しない |
| FJ04 | candidate取得後・検査失敗 | 同candidateを未知参照として保持。未検査thenable／Proxyをawait／resolveへ渡さない |
| FJ05 | work確認後・観測／公開post失敗 | 同workとsettler、観測成否、公開先へ書けた参照を保持し、通常利用から失効する |
| FJ06 | cleanup contextありで失敗 | 同current record／anchor／readerIdentity・既取得factsを保持。未実行cancel／releaseや未観測cleanupをconfirmedにしない |
| FJ07 | failure copy／settle処理自体の失敗 | 元理由・失敗prefix・取得済み参照・settle試行成否を保持。再生成・再copy・再settleで救済しない |

失敗理由の原始値保持と新規利用の同期失効を先に行い、その後に既存固定stop通知とrole別の終端を一度試みる。内部の不正遷移／二重生成はinvalid_state、同一性不一致はevidence_binding_mismatch、constructor／観測等の制御異常はinternal_review_errorを使い、既存public写像を維持する。run生成はstop、cleanup生成はcleanupのstageを使い、先行HTTP／取消／期限理由を上書きしない。通知等の後処理は生成の同期群の外で行い、元の単一budget／停止ownerへ従う。

runは同ownerの正常終端手順から得た検証済みsnapshotをresolveし、copy不能なら保持済みrejectで固定internal_review_errorを返す。構築時の0計数copyを流用せず、先行診断・実計数・token退役を反映する。cleanupは制御失敗を先に記録してから、まだpendingで適格なresolveを保持する同workをresolve(undefined)で終端する。既にrejectした候補を後続resolveで正常化したとは報告せず、実際の失敗終端を保持する。void終端もcleanup confirmedでなく、後続issueは元guardと実factsで拒否する。制御異常を架空のNativeCleanup factsへ変換しない。

settle claimはsettler呼出し前に消費する。work未取得・未確認、必要settler不足、観測不能等で同workを安全に終端できない場合はfailed_retained／終端未確認として保持する。公開API側は固定拒否し、未知workへの無期限joinで失敗応答を代替しない。APIの拒否wrapperを新たなJoinRuntime workとして登録せず、同workの終端確認ができたとも報告しない。process障害や未知候補の完全回収はUnknownのままである。

cleanupの生成claim消費後は、finallyからの再cleanでも第二生成を行わない。既存のtoken退役・外側driver close／dispose・session closeの責務は別々に試み、Promise生成失敗だけで省略しない。readerの固定実操作が未実行なら責務を保持し、別queue・別timer・新floorで再開しない。この追加失敗契約を実resourceへ接続するには、同duty保持と終端の連続検証が別途必要である。

## 7 private公開と既存workの所有

公開先はrun／cleanup各1個の同runtime参照とし、workの唯一の保管元は当該runtimeのwork fieldである。既存runWork／record.cleanupWorkとの統合時には、同公開slotからの読取りへ揃え、別々にPromiseを作る二経路を残さない。既存名をaliasとして残す場合も独立writerを持たせない。

公開先参照の保持とpublished markerの間で失敗すれば、参照を先に消してemptyへ戻さず、failed_retainedにする。normal join readerは同owner・同role・publishedを全て確認し、参照が存在するだけではworkを返さない。最終post後から内部returnまでに通知・Promise callback・awaitを挟まない。

publishedだけではdispatch資格・entry・cleanup確認・正式発行を与えない。実装を先行する場合も、旧execute／cleanは旧workのまま、新生成器は閉鎖した合成経路で検証する。旧taskに新旧2workを同時に割り当てる移行は不可。正常legacy経路への採用・同work統一は、旧期待値と追加故障条件を分けてレビューしてから接続する。

## 8 closeと保持責務

生成中のclose／stopは新規run生成・private公開を同期失効し、元のclaim／prefixを残す。既存recordのcleanupを全て拒否する汎用ready gateにはしない。正規published workへの合流と、未公開／failed_retainedへの固定拒否を分ける。

生成のみの合成試験では正常workが未dispatchのままpendingになるため、試験終了前に同ownerの固定abort／失敗終端を通す。このabortは試験側または閉鎖したprivate継続だけであり、公開resolver／adopt／abort登録口は作らない。無期限にpendingを残して成功とせず、settle試行と実終端観測を別々に確認する。

部分参照は当該producerの退出・同workの終端・所有退役を確認できるまで保持する。失敗snapshotのseal、observerの終了、slotのnull化、GCを最終discardとしない。外側custody／最終discard、native内部容量と全解放は別gate・Unknownのままである。

保持上限はrun／cleanup各1runtime・各1candidate／work（同object alias）・各1観測ack・固定role slotだけで、可変traceや再試行列は作らない。scalar／参照数が固定でも、Promise内部・captured closure・native resourceの実容量の上界を証明したとはしない。

## 9 将来の独立合成受入条件

以下は全工程の試験契約であり、JR-Aで実施した部分だけを§12と検証記録に記す。親のCJ06／07を中心に、固定位置・合法variant・所有関係・role別終端からoracleを作る。旧runnerのactualを期待値へcopyしない。

| ID | 対照 | 受入条件 |
|---|---|---|
| TJ01 | 構築readyかつrun停止／sealed／開始済み | ready単独の生成を拒否。新work 0、先行理由不変 |
| TJ02 | 先行HTTP／取消下の同record cleanupとforeign record | 正規read-only資格と混入拒否を分離。foreign hook／台帳書込み0 |
| TJ03 | kind／seed／root／role slotのcopy・Proxy・差替え | identityを先に拒否し、段階検査の省略やviewのauthority化を検出 |
| TJ04 | claim前後・runtime保持・settler捕捉・candidate保持の全prefix | claim非返却、取得参照と最後の固定位置を保持。生成・queueの再試行0 |
| TJ05 | run半pair、cleanup reject混入、不足work・不正phase | strict型・semantic compile-failとruntimeの両方で拒否。成功variantへassertionしない |
| TJ06 | constructor throw／executor異常／二重executor／不正候補 | 同candidateとprefixを保持、thenable hook 0。未知をnative Promiseへ昇格しない |
| TJ07 | 拒否観測・派生ackの生成／保持失敗 | 公開0、有限な観測だけを許し、未確認を終端済みにしない。未観測rejectionと固定API拒否を区別 |
| TJ08 | 公開先保持前後・最終post・return前の固定故障 | 同runtime／workのまま失敗保持。marker前の通常利用・dispatch 0 |
| TJ09 | run copy不能／必要settler不足／settle中再入 | 元理由保持、同settler試行1以下、第二work 0。公開拒否とprivate未確認を分離 |
| TJ10 | resource取得後のcleanup生成失敗 | 実計数・同readerIdentity保持、架空の0計数copy／cleanup confirmed 0。CP構築回収流用を拒否 |
| TJ11 | 生成中close・stop・finallyの重複合流 | 同claim／同work、追加timer・floor再計算・再生成0。未公開の無期限joinで代用しない |
| TJ12 | source／compiled・配布の負対照 | 旧4export・strict raw・5fault・7permissions=false、fixture台帳非共有。setter／登録／resolver漏出・source fallbackを拒否 |

「一度のwork」と「API wrapper／観測ack」の計数は分け、ack追加を第二execution workとして隠さない。成功・拒否・未知の全variantと、owner混入を見逃す／claimを戻す／公開markerを早める等の構文正常な変異を対にする。compiledは固定出力だけを使う。元5秒・既定並列度、旧比較child60秒、製品全体60秒を変更しない。

## 10 実装への分割と停止条件

JR-Aはrole別内部型・先行slot／claim・不変／段階検査・生成資格の非実行境界だけとし、Promiseを生成しない。JR-Bで同P／settler・candidate／work・拒否観測・失敗終端を合成依存だけに接続し、private公開とqueueは閉じる。JR-Cで同runtimeの公開先と最終postを接続するが、legacy採用・dispatch／entry／正常settleは別承認の工程に残す。

生成前の保持先、必要settlerの捕捉、未観測拒否への有限処理、resource取得後の責務保持を確認できなければ、後段を接続しない。外側custody、新LM03、専用artifact／終了契約、旧UN62移行、friend撤去・AP承認・全体回帰は別gateとする。

## 11 draft-0.1作成時の静的確認と未実施範囲

基準のRecoveryAnchor、構築ready、空seed checker、started／current、旧run／cleanup executor、sample／finally、失敗facadeと既存補強試験を読み、現行の事実と本書の未実装契約を分けた。QJ01〜07、GJ01〜08、FJ01〜07、TJ01〜12は設計IDであり、試験成功件数ではない。

sourceの構文解析でexecutor内のqueueを持つjoin代入2か所、bridge call site 4か所、nullのpending初期値2か所、statusだけを見る構築ready判定1か所を照合した。3文書のローカルリンク23件・表21個、QJ 7行／GJ 8行／FJ 7行／TJ 12行の重複／欠落0、末尾改行・差分空白を静的確認した。補強試験fileの内容hashは開始時と同一で、ソース・試験・CHANGELOG・設定の差分は0である。

変更は本書と親2文書の参照だけとする。ソース・補強試験・CHANGELOG・build／package／runner設定に変更を加えない。製品moduleのimport／実行、試験再実行、build／pack、Promise生成試験、dispatch接続、実接続・実通信・設定変更・コミット・Pushは行わない。既存CP検証の実績を新JoinRuntimeの保証へ加算しない。

## 12 JR-Aの限定実装

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のCP00側へrun／cleanup各1個のRoleGenerationSlotを先行保持する。empty／claimed_unheld／failed_retainedは別variantで、pending／publishedはliteral nullのまま。既存runPending／cleanupPendingもnull、空seedのreadonly型・checkerは変更しない。JoinIdentity、role別settler／結果型、run半pairを含むJoinRuntime段階型はprivate型だけで、runtimeやPromiseの実体は割り当てない。checked／publishedの値検査は将来形の非権限検査であり、同Promiseや発行資格を証明しない。

同closureのcanonical anchor／role slot／root／seedを先に照合する。foreign／copy／Proxyのfieldを読まず、自ownerのslotだけに固定faultを保持する。runは構築readyに加えて既存started／revoked／primary／sealedと未使用slotを検査し、started→claim→position→claimed_unheldの固定同期群だけを進める。通知・sample・scheduler・native操作は呼ばない。失敗はclaim／positionを戻さず、slotの先行faultと元rootのprimaryを保持して同期revokedにする。upperへの通知・終端はJR-B以降の別責務で、CP failure facadeや架空のcleanup factsを生成しない。

cleanupは同closureのcurrent recordとそのanchor実参照、同binding、元started、構築ready、未sealed、未使用slotを検査する。revoked／先行HTTP理由だけでは拒否しない。recordはcallerから採用せず、unknown引数は保持済みcurrentとの照合対象に限る。JR-A試験のfake recordは実resource所有・解放の保証ではない。正規published workへの再合流はJR-C以降であり、JR-Aは再生成を拒否するだけである。

新private継続はlegacy execute／cleanから呼ばない。scratch copyだけが同closureの関数を呼ぶ。製品のexport・friend・raw入力・登録口を増やさず、旧14関数・4exportを維持する。[新試験](../tests/review/native-join-generation.test.ts)、[独立oracle／scratch抽出](../tests/review/fixtures/native-join-generation-model.mjs)、[固定dist検査](../tests/review/fixtures/compiled-native-join-generation.mjs)で、資格拒否27・同一性拒否32／hook 0・phase値121・構文正常な変異12（レビュー修正で同期revoked省略を追加）、semantic正対照と8不正型を確認した。資格／同一性の各拒否と失敗保持では、primaryとともに同期revokedも確認する。各数値は別の保証単位で、244件のsource試験へ足して成功件数を水増ししない。

初回の変異anchor不一致と型検査反復による5秒timeout、修正後の結果・未実施範囲は[JR-A検証記録](E2E_BEST_PRACTICE_NATIVE_JOIN_GENERATION_JRA_2026-11-17.md)へ分離する。Promise／settler生成・観測・失敗終端・private公開・dispatch・正常採用は未接続、全解放はUnknownのままである。

## 13 JR-Bの先行保持・固定pinへの差分

[先行runtime・失敗保持先とPromise固定pin・観測前提の接続差分設計draft-0.6](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_RUNTIME_PIN_DELTA_DESIGN.md)で、同roleのpendingを唯一の主保持先とし、保持順と観測前提を具体化した。同書§12で先行shell／context／identity／owner pinの保持・非実行検査・失敗保持、§13でclosure／tuple準備だけ限定実装した。module基準とowner pin、生成成功と失敗候補の観測を分け、先行primary／同期revokedを維持する。closure呼出し・Promise生成・拒否観測・失敗終端・private公開・dispatchは未実装・未接続のままである。

[固定closure・tuple／段階別post／失敗後writer・終端責務の接続差分設計draft-0.5](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_HANDLERS_POST_TERMINAL_DELTA_DESIGN.md)では、handler準備claimと入場履歴を分け、現行postを緩めず段階別に検査する。同書§11の限定実装は、非実行の3closure・凍結tupleと同owner／停止／段階別postまでである。失敗後・sealed後の観測writer、通知／copy／settle試行と実終端は設計だけを保持し、private公開・dispatchは行わない。

[実行前内部契約・先行slotの差分詳細設計draft-0.6](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_EXECUTION_SEED_CONTRACT_DESIGN.md)で、同role shellに配置するconstructor／executor・登録／callback・drain／settleの全初期fieldと、保持位置とは別の最初のfault、失敗後writer資格を具体化した。同書§10で初期25field・未使用seed検査・固定拒否だけを実装し、実行は閉鎖したままとする。実Promiseを生成する後続単位では候補観測と固定abort／失敗終端も対にする。新しい書込み先・authority ticket・正常公開・dispatchは作らない。

[seedから実行状態への接続差分詳細設計draft-0.5](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_SEED_EXECUTION_TRANSITION_DELTA_DESIGN.md)で、constructor／entry claim・role別捕捉prefix・段階postと、閉鎖要求を維持したまま許可し得るprivate同期窓を明記した。同書§9で非実行8variant・origin leaf・段階値検査だけを追加し、literal-closed seed・requestと3closureの拒否・既存14本文／4exportを維持する。実生成・安全観測・固定終端を対にする後続単位が整うまで拒否を外さず、private公開・dispatchは行わない。

[同shellの実行writer・安全観測・固定終端受渡しの差分詳細設計draft-0.1](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_LIVE_WRITER_TERMINAL_HANDOFF_DELTA_DESIGN.md)で、同pendingの実field writerとclaim消費点、生成→安全観測→固定abort／失敗終端の受渡し順、失敗prefixと未確認保持を具体化した。MDだけの設計で、実装・Promise生成・closure呼出し・private公開・dispatchは行わない。
