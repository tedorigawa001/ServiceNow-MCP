# WF-B C-02後半：固定private call・receiver入口と同start試行／格納

Version: draft-0.4 / Date: 2026-11-11 / 読み取り基準HEAD: `ff866f9`（C-02前半実装 `4f70522`、前半レビュー対照 `ff866f9`、draft-0.1レビュー修正基準HEAD: `0f3fae0`、内部契約の限定実装基準HEAD: `3fc15ab`、draft-0.3レビュー修正基準HEAD: `983fa24`）。

draft-0.3のレビュー修正：§13のbridge準備は、23件の一時変異のうち12件でVitest・compiledの両方が通っていた。prepareBodyPinBridgeのbefore／checked／blocked各点にあるPC02再検査・identity再照合・callActive／entryBusyの節と、bodyPinBridgeIdentityのcaller照合は、どれも後段の検査が同じ拒否理由で受けるか、注入対照がなかった。compiledには3点への単独注入9件を追加した。callActive・busy・receiver関係（固定accessのflag）・route境界・metadata固定化数のいずれかを壊し、節を除くと最初の拒否理由かbridge位置が動くことを確かめる。callActiveのliteral初期値の対照も追加した。Vitestにはclose時の`build.stopFirst`=closedと`stopRequested`を追加した。残る3件は§14で等価と判断した。

draft-0.1のレビュー修正：§8の2か所で、境界の軸を取り違えていた。receiver行の「failurePrefix=none／before又はafter」は、before／afterが`BodyBindPrefix`の値に読めるが、before／afterを持つのは`failureBoundary`（`BodyReceiverFailureBoundary`）である。冒頭の「未callは既存BP02 before／checked」は、現行`failBodyPinStart`がroot側`#bodyPinFailureBoundary`へbefore／after、source側（`#bodyPinStartFailureSourceBoundary`と元sourceの`failureBoundary`）へbefore／checkedを書く2軸を混ぜていた。どちらも軸ごとに書き分けた。文書だけの修正で、契約・CR／CE・未実装範囲は変えない。

Status: **§13の内部型・先行field・readonly private bridgeと診断位置写像だけを合成依存限定で実装。PC03固定call・receiver試行／格納は未接続。** 親は[private pin設計](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)と[bind・先行borrow設計](BEST_PRACTICE_WFB_BODY_BIND_BORROW_DESIGN.md)。生成の来歴は[source生成・停止設計](BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_STOP_DESIGN.md)、前半の実績は[C-02前半検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_START_2026-11-11.md)、今回の実績は[bridge内部契約検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_BRIDGE_2026-11-11.md)を参照する。

正式発行口・既存C実行入口・body起動は閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。現在の実装許可は§13の限定範囲だけで、固定call・試行／格納・実接続・実通信・実機操作・設定変更・Pushは行わない。§1〜12は作成時の将来設計／文書検証であり、そこで述べるactive call・格納成功を実装済みとはしない。

## 1 現行との差分・適用範囲

現行createProbeBodyPinStartFakeは同constructor・同prepareのactive frameでBS→BP00〜01→C-01→PC01／02を通り、pin_call_not_connected／construction_unconfirmedで固定停止する。receiverはprivate値view／PayloadEmptyの読取りだけ。rootの開始予約は済むが、pinCallReached=false、receiver試行false・expected-source3参照空である。

| 対象 | 現行 | 本書で具体化する将来差分 |
|---|---|---|
| 固定call | PC02最終検査後に停止 | 同prepareの継続でPC03の同期call。返却済みrootは再開しない |
| receiver入口 | bodyPinValues／bodyPinPayloadEmptyだけ | private発行元／同start／元sourceを照合し、一度だけ試行 |
| 保持 | expected-source issued／current／rejectedは空 | 元sourceをissued→currentへ捕捉し、全検査後confirmed。所有権はrootに残る |
| 失敗writer | failBodyPinStartがBP02／preflightとbefore／checkedを固定 | BP02を保存しつつ、実際のBP03 caller位置とreceiverの別位置を記録 |
| 状態確定 | preparingConfirmed／pinPostChecked=false | 本書ではfalseのまま。BP04／C-03は別実装単位 |

旧(B)／C-01／C-02前半factoryのmodel・正常停止・期待値は変更しない。将来はconstructorで固定選択する別の閉鎖合成継続を用い、同prepareのPC02後から進める。公開booleanモード・任意continuation・第2prepareでの再開・旧summaryからの復元口を追加しない。親§1のBP04正常到達点は(C)全体の将来像であり、PC03〜07だけの完成を意味しない。

現行prepareBodyPinStartを呼び、その固定失敗から戻った後にcallを足してはならない。将来の共通化はPC02最終検査までのprivate前段だけを最小抽出し、旧wrapperは従来どおり固定停止、新wrapperはその失敗処理より前から同frameのcallへ分岐する。旧checkpoint順／再検査／診断prefixを独立対照で維持し、failed sourceをinitializingへ修復しない。

## 2 配置と信頼済みanchorの供給

同package除外snapshot-read-composition-fake.ts内のCanonicalGateDraftRootと、同binding.target.startのRetirementStartAssemblyだけで接続する。別root／frame／予算／failure owner・registry／friend・token／Pin objectは作らない。

固定callは既存probeStartAccessに相当するmodule-private固定橋からreceiverのprivate methodへ1回だけ渡す。引数は、正規rootのprivate継続で得た**信頼済みroot anchor**と、同継続が保持する元source／正規startだけ。root anchorはlexical this由来で、source.custodian・任意候補・JSON・public summaryから探索／復元しない。

逆向きの照合は、root classのstatic初期化で一度だけ固定するmodule-private access案probeBodyPinRootAccessに限定する。そこからrootのprivate issued／current・発行来歴・現在のcall区間を直接検査する。accessの関数・表を引数や返答として渡さず、per-root callback・登録口・外部checker注入を作らない。receiverは候補のmethodを呼ばず、rootが返すpublicなsameOwner／accepted booleanを資格として採用しない。

bridgeへ渡すstartも、rootの元target.startとの参照一致をCR01で確認してから使う。Proxy／別start候補に対してmethod取得やprivate field読取りを先に行わず、CR02中にcall先候補を差し替えない。正常bridgeが呼ぶのは確認済み正規startだけであり、callee自身も入場後に元root関係を再確認する。callee側の混入試験は、正規classの実startを相手にして無書込み拒否を比較する。

root anchorは未検査候補とは別の役割である。未知rootをcastしてこのaccessへ渡す経路は設けない。外側の候補rootは既存のidentity-first資格検査で先に拒否する。receiverで試すforeignは、信頼済みanchorと異なるsource／実callee startの組、又は正規の別root anchorと元callee startの組とする。scratch内でprivate発行slot自体を改竄する対照はguard感度用で、任意改竄に対する来歴証明へ昇格させない。

## 3 同一性と検査の分離

| 区分 | 固定関係・検査 | 書込み可能性 |
|---|---|---|
| 最小同一性 | candidateSourceがanchorRootの元issuedかつcurrent、actual receiverが元binding.target.start、rejected source不在 | 不一致はfield読取り／reflection／診断書込みより前に拒否 |
| 来歴 | metadata確認・生成試行・9固定化・build confirmed、22key／descriptor、custodian／shell／binding／link／duty／control／start／rootFailureが元参照 | 元issuedの同一性が成立した後だけ反射検査 |
| receiverの元関係 | 実private probeIssuedBinding／runIssuedLink／runIssuedDuty／exit bundleがanchorRootの元保持と一致し、元cell・frame・controlが対応 | public projectionで代用しない |
| call区間 | 新継続をconstructorで固定選択、元root active frame、PC01済み、PC03／call／before、callActive=true、source pinCall=true／BP03／call | caller資格だけではreceiver試行・格納はまだ不可 |
| 安定条件 | 元base未使用・同BS空storage・payload6参照空／free／empty／prefix none、元first／stopなし | 各新規保持前と確認前に再検査 |
| 狭いphase | 本書§6の同時に許されるsource／receiverの組だけ | 値checkerのtrueを実発行証拠にしない |

bindingOwnerとcellOwnerは既存のそれぞれの正規関係を保ち、互いに同じobjectであるとは要求しない。新たにpinした3参照が非空になるため、旧bodyFieldsInitialの「9参照全空」をPC05以降へ再利用しない。一方で、全phaseを許すORへ変更せず、SourceProvenance／BaseUnused／StorageEmpty／PayloadEmptyと固定phase checkerを組み合わせる。

最小同一性、call実行中の資格、call復帰後の安定照合は別の内部検査とする。callActiveはfinallyでfalseになるため、PC08の復帰検査にcallActive=trueを要求しない。逆に、復帰後検査だけをcallee入場資格に流用してはならない。親§12／14の等価・観測不能判断は前半限定で、call区間／reentryの新履歴で改めて評価する。

## 4 内部型・先行fieldとwriter

| 保持先 | 内部契約案 | writer／制約 |
|---|---|---|
| root | bodyPinCallActive=falseの原始scalar | PC03の固定call区間でtrue、同区間のfinallyでfalse。既存routeAttempted／source pinCallReachedの履歴は戻さない |
| 同start | bodyPinEntryBusy=falseの原始scalar | 正規入場の先行予約からfinallyまで。entry直後・attempt前の再入を拒否するため、pinAttemptUsedとは別 |
| root caller位置 | 既存BodyPinRoutePhase／Step／Boundary | BP03／call／beforeをcallee中保持。正常にprimitiveが戻った事実だけでcall／after、別単位の復帰検査後にreturned／afterへ |
| receiver prefix | 既存pinAttemptUsed、pinStage、expected-source3参照 | false→true、empty→attempting→issued→captured→confirmedのみ。受領参照は同元source |
| receiver操作／初回位置 | 既存bodyPinStep／bodyPinFailureStep | preflight→attempt→issued→current→checked→confirmed。first記録と最初の位置を対に固定 |
| primitive結果 | accepted／refused_existing／rejected_attemptの有限型 | source／Error／contextを載せない。値だけでcallerが次段階へ進まない |

新しい2scalarはconstructor副作用より先のliteral初期値とする。既存sourceの22 own key／metadata9・progress13、receiver9参照を増やさず、旧field検査の意味を変えない。callActive／entryBusyは再入防止用の一時状態で、履歴・権限証拠・cleanup確認ではない。callが戻らない場合にfinallyが必ず走るとはせず、実OOM／停止不能はUnknownのまま。

前半専用のBodyPinStartStepとbodyPinStartFailureSourceBoundary（none／before／checked）にBP03を押し込まない。call以降のcaller初回位置は既存BodyPinRoutePhase／Step／Boundaryとrootのpin failure fieldへ保持し、source.failureBoundaryは既存BodySourceBoundaryのcall／afterを使う。前半専用詳細fieldは旧factoryのまま残し、新factoryがそれをBP03現在位置として投影しない。writer選択はconstructorの固定継続とroot実保持位置に限り、外からphase／reason任意文字列を指定する公開口を作らない。

## 5 入口の拒否順と一度限り試行

rootの固定dispatch前は、信頼済みanchorに対する元参照／来歴→stop／先行first→callActive又は元source pinCallReachedによる再入／重複拒否→初回callReady全条件の順とする。source pinCallReached=trueだけを見て別候補をduplicateへ分類しない。PC01のrouteAttempted=trueは正規の前提であり、「root開始済み」を理由に最初のPC03を拒否しない。

receiverも同じ最小同一性→停止／先行理由→entryBusy又はpinAttemptUsed→初回条件の順とする。entryBusyは最初の合成checkpointより前にtrueにする。これにより、callee preflightで再入しても、まだpinAttemptUsed=falseだから再帰できる、という隙間を作らない。初回条件にはcall区間・空pin3参照／payload・receiver first／位置初期値を含める。

foreignはrejected_attemptで相手のbusy・step・first・試行／保持・refusalを更新しない。最小同一性は正規でも、停止／先行失敗があれば重複より優先して拒否する。入場前の拒否はroot caller側に理由を残し、receiverの未開始履歴を偽造しない。

同sourceの正規再入／重複はrefused_existing。rootの専用refusalへ最初のin_progress／duplicate_pinだけを残し、source／receiver firstや保持prefixを汚さない。正規のnested拒否結果はnested受取りだけで完結し、元のcall結果を上書きしない。初回固定callは新規試行を所有した実receiver結果だけを受け、後段PC08では相関しない返値を受理しない。refused_existingを新規成功や第2callの許可へ変換せず、拒否だけで既存の正規試行を失敗させない。

## 6 固定scheduleと狭い状態組

| ID | 同期操作／固定検査 | 操作後に許される事実 |
|---|---|---|
| CR01 | PC02 callReady後、元root／source／start、未stop／first、未callとcallee初期値を再検査 | root running／BP02・callActive=false、source initializing／unused／pinCall=false、receiver empty／entryBusy=false |
| CR02 | PC03 caller位置をBP03／call／before、source位置BP03／call・pinCall=true、callActive=trueへ直接記録→固定receiver call | callに到達した履歴のみ。receiver試行falseのままcalleeへ入る |
| CR03 | receiver最小同一性→停止→再入拒否→entryBusy=true、step preflight。receiverEntry／安定条件を検査 | source BP03／call、receiver empty／attempt=false／step preflight |
| CR04 | 最終入場guard後、step attempt・pinAttemptUsed=true／stage attemptingを直接記録 | issued／current／rejected空。以後試行を払い戻さない |
| CR05 | 元来歴・停止とattempting組を確認→元sourceをissuedへ保持／step issued／stage issued | issued=元source、current／rejected空 |
| CR06 | 元issued保持・元来歴・停止とissued組を確認→同issuedをcurrentへ保持／step current／stage captured | issued=current=元source、rejected空 |
| CR07 | captured組・全安定／停止→step checkedで再検査→stage confirmed／step confirmedを直接記録→confirmed検査 | confirmed・両参照・attempt履歴。payload空、ready=false |
| CR08 | 成功時だけ固定primitive acceptedで復帰。entryBusyはreceiver finally、callActiveはcaller finallyで解除。正常復帰のcaller位置だけcall／afterへ | sourceはまだinitializing／unused・BP03／call。call／試行／参照／confirmed履歴は保持 |

CR01は親PC02の再検査、CR02はPC03、CR03〜04はPC04、CR05／06／07はPC05／06／07に対応する。CR08は同期callを安全に離脱する境界までであり、PC08復帰後照合・C-03の正常保持を受入済みにしない。

callActive／entryBusyのtrueを要求するのはその操作の実行中だけ。sourceはCR02〜08のcallee中すべてinitializing／unused・BP03／call・pinCall=true、bindCall／post=falseで、source first／stop／refusalはnone／false。receiverの失敗診断は成功検査時にはすべてnone、payload6参照空・free／empty／prefix none。root側に正規再入refusal履歴があってもそれだけで失敗しない。

## 7 不可分の同期区間と故障観測点

| 区間 | 途中に挟まないもの | 観測できる点 |
|---|---|---|
| CR02のcall記録→固定call | allocation、value view生成、guard call、hook／通知／await、script評価、診断projection | 記録前、実callee入場後、call離脱後だけ |
| CR04のattempt記録 | field group間のhook／通知／await・任意callback・失敗注入 | 最終入場検査前、全直接記録後 |
| CR05のissued保持／stage更新 | 間のhook・再検査・failure通知 | 保持前guard、全記録直後 |
| CR06のcurrent保持／stage更新 | 同上。元参照をcopyするproducerも挟まない | 保持前guard、全記録直後 |
| CR07のconfirmed確定 | stageと操作位置の間のhook／await | 確定前のchecked、全記録後のconfirmed検査 |

固定access関数の参照はmodule初期化で固定し、CR02中にunknown methodを探索／bindしない。直接代入先は正規class private fieldと、確認済み元plain sealed sourceのwritable data fieldだけ。callee内の固定検査は区間外で行い、sourceのpinCall flagが立ったのに未callという人工checkpointを作らない。

callerのtry／finallyはCR02の直接記録より外側で用意し、flag記録後に新しいcleanup ownerやclosureを生成しない。receiverもentryBusy予約を自分のtry／finallyで保護する。故障を入れられる位置と、言語／OOMによる未確認は別に扱う。

例外はreceiver内の固定catchで自分の初回診断を記録し、callerでも自分の位置で停止する。raw Errorを返さない。throw／close／再入の注入点は有限列挙とし、任意callbackを同期区間へ挿入する試験APIは作らない。callActive／entryBusy解除はfinallyだが、失敗のfirst／位置・元参照をclearするfinallyにはしない。

## 8 BP03診断・closeと失敗時保持

現行failBodyPinStartをそのまま再利用するとBP03失敗までBP02／preflightへ誤記録する。本書の将来実装では、生成writer・C-01準備writerを変更せず、rootが実保持しているcaller phase／step／boundaryからpin初回位置を固定する。未callは既存のroot BP02／preflight／before又はafter、source BP02／before又はchecked、call中又はthrowで正常復帰未確認ならroot BP03／call／before、primitiveが戻った後ならcall／after、sourceの粗い失敗位置はどちらもBP03／call。callee内部位置をcallerの進行へcopyしない。

| 軸 | 最初に記録する内容 | 後発失敗／closeで維持する内容 |
|---|---|---|
| 生成 | BP00〜01の事実・固定化数・metadata確認・build stage | BP03を生成失敗位置へ入れず、生成failureRecordedをpin失敗で立てない |
| root共通／pin | binding_mismatch／state_invalid／closed／construction_unconfirmedと実caller位置 | 共通first・pin first／初回位置を上書きしない。call離脱後も未確認を成功へ変えない |
| 元source | 確認済み元issuedだけにfailedとpin側理由・caller BP位置 | source first／初回位置／pinCall履歴、unused claim。未知current／rejectedへ書かない |
| receiver | 正規入場後の実操作位置と最初の理由、failurePhase=pin／failurePrefix=none／failureBoundary=before又はafter | bodyPinFailureStep・first、試行／最後の保持prefix。confirmedをfailed／emptyへ変えない |
| 停止／配送／refusal | root stopと元source stop、既存delivery軸、専用root refusalを別々に記録 | 失敗だけでclose履歴を作らず、closeだけでreceiverへ新firstを強制しない |

最小同一性不一致はcaller binding_mismatch、正規の状態違反はstate_invalid、停止はclosed、捕捉／確認／復帰未確認はconstruction_unconfirmedへ写像する。source firstは必要なら既存receiver_unconfirmedを使いrootの理由へ写像するが、新しいProbeRunFirstは増やさない。正規receiverのfirstは既存BodyReceiverFirstで表す。sourceとrootのfirstは別軸で、元の非noneを保持する。

callee失敗からの復帰は、primitiveのrejected_attemptだけで理由を推測しない。同startのprivate診断を固定allowlistで読み、receiverのbinding_mismatch／state_invalid／closedは同じroot理由へ、receiver_unconfirmed又は診断未確認はconstruction_unconfirmedへ写像する。source側は捕捉／確認の未確認をreceiver_unconfirmed、単にPC08未接続で止める場合はconstruction_unconfirmedとし、confirmed receiverを失敗したことにしない。元sourceのmetadata確認が失われていればこのsource書込みを行わず、root側の診断／所有責務だけを保持する。診断viewは来歴／成功資格の代替ではない。

| 停止／故障時点 | receiverに残すprefix | root／sourceの責務 |
|---|---|---|
| CR01以前 | empty、試行false、3参照空 | 未callならpinCall=false。PC01開始済みなら再sequence不可 |
| 実callee入場後・CR04前 | empty、試行false。正規preflightを開始した場合だけその診断位置 | pinCall=trueとcaller call位置を保持。試行falseを未call／解放済みと同一視しない |
| CR04後 | attempting、試行true、3参照空 | 同sourceを再callせず、元ownerで未解決責務を保持 |
| CR05後 | issued、issued=元sourceのみ | currentを補完する再試行なし。元rootもsource保持を継続 |
| CR06／checked後 | captured、元issued/current、初回rejected候補があればそれも保持 | 候補の追加置換／clearなし。検査前に捕捉した事実を消さない |
| confirmed後／復帰異常 | confirmed、元issued=current、試行true | source failedとconfirmedの共存を許す。preparing／readyへ昇格しない |

負の対照のcurrent同値copyは、元issuedを変えず固定合成scriptでcurrentだけへ注入する。正規root／同start／今回の試行で捕捉した不一致候補だけを空のrejectedへ一度保持でき、以後置換しない。foreign入場の候補を相手のrejectedへ預けない。rejectedの保持・失敗診断が未確認なら元currentをclearせず保持責務を残す。

closeは固定返答cacheより先にroot stopを単調記録し、確認済み元issuedへ同期反映する。calleeは次の固定guardで停止し、途中prefixを保持したまま自分のfinallyへ進む。root closeからcalleeのpin解除・診断強制更新をせず、旧start.close／request／drain・回収／field clear／Journalへ迂回しない。全保持は未解決の解放責務であり、cleanup証拠・借用退役・root終端成功ではない。

## 9 C-03へ渡す前の境界

PC03〜07実装だけの新合成入口は、同期callから戻ってもBP04を自動開始しない。acceptedはcalleeの完了通知であり、caller側PC08の元source／同start／issued=current／confirmed・元first／停止・空payload再検査を代替しない。PC08未接続の段階は「復帰後確認未接続」の固定閉鎖停止とし、root側理由・BP03位置を保持する。元source failed／confirmed pinは保持し、source_pinned_unreadyやheld成功を返さない。

将来の部分入口案はcreateProbeBodyPinCallFake／model=wfb-body-pin-call-1、通常到達もpin_return_not_connected／first=construction_unconfirmed／ok=falseとする。authority=none／execution=closed／formalIssuance=closed／wholeRunAdmission=disabled／implementation=unknown／investigations=on_holdを固定する。生成・C-01準備・callerのcall位置／初回位置・receiver prefix／初回位置・停止／refusal／配送を別に投影し、callActive／entryBusyはstrict boolean、参照は保持有無／同一性の有限診断だけを出す。旧前半modelは変更しない。実装前にこの名前をruntime exportや証拠発行口へ追加しない。

別単位のPC08実装後だけ、rootをBP03／returned／after、sourceをBP03／afterへ移し、狭いreturned条件で確認する。callActive／entryBusy=falseの復帰状態を検査し、元call区間のcheckerを流用しない。その後もC-03未接続なら固定停止する。将来C-03はPC09のpreparing確定→PC10の全post／閉鎖heldであり、source利用claim・payload借用／bind・BC00・構築ready・body開始はさらに別承認である。

## 10 追加費目とUnknown

追加論理費目はroot callActiveとstart entryBusyの先行2scalar、constructorの継続固定選択の保持／分岐、module-private固定accessの初期化、CR01〜08のcall／照合・有限phase検査、試行記録・2参照保持・初回rejected保持、finally・停止／失敗writer・projectionである。既存のsource生成・22key固定化、BS13carrier、元owner／frame／9先行参照・6payload参照・PC01予約を再計上しない。captureは借用参照の保持で、sourceの所有権や利用claimを移譲しない。

固定scheduleは操作種別であって実call数／guard上界／unit係数ではない。実装時には各entry／保持／確認・fail／close枝の再検査を台帳化し、旧予約と重複しない独立event oracleで確認する。新期限・残時間からのdeadline再計算・実予算更新・cap投入はしない。実E／S・allocation／layout／GC／OOM・停止後解消予約・全体work上界はUnknownのまま。

## 11 独立合成・compiled受入条件（すべて未実施）

| ID | 必須条件・意味的な負の対照 |
|---|---|
| CE01 | 旧(B)／C-01／C-02前半の挙動・返答／期限とレビュー対照、旧facade／配布exportを維持。開発compositionの新factory名追加だけを明示管理し、新継続を旧root再prepareで開始する変異を拒否 |
| CE02 | 正規root／source／startと全metadata関係、bindingOwner／cellOwnerを個別混入。copy／Proxy／getterを最小同一性で拒否しhook=0、相手の全slot不変 |
| CE03 | callActive外・旧継続・frame不在・停止／先行理由から呼べない。未知root候補をprivate accessへ運ぶ経路なし。call用／復帰用checkerの取り違えを検出 |
| CE04 | CR02の実call到達・CR04の試行・CR05／06の参照保持を独立event列で比較。call記録とcallの間へのhookやflag返却を検出 |
| CE05 | callee preflightでの再入はentryBusyによりrefused_existing、call／attempt／格納が最大1。finallyはbusyだけを戻し、履歴を返却しない |
| CE06 | 全許可観測点×throw／close／再入／先行理由。最初の拒否位置と最後のprefixをoracleで比較し、source／receiver先行first・返答同一性を保持 |
| CE07 | 段階別値の全field・root scalar・実private参照を単独故障。checker除去で当該最初の拒否位置が変わる対照を持ち、後段拒否だけでkillとしない |
| CE08 | issued／currentの同参照、copy混入と初回rejected保持を区別。失敗時clear・issued上書き・第2候補補完・confirmed巻戻しを検出 |
| CE09 | 生成BP01／after、root BP03／call、callee実位置を別に比較。旧BP02固定writer流用・後発closeによる位置上書きを検出 |
| CE10 | root closeはcacheより先に元sourceへ同期停止、未知候補に書かない。calleeは次guardで停止し、旧start.close／Journal等のcallは0 |
| CE11 | accepted偽装・復帰異常・停止後受理を拒否。正規nested refusalを元call結果へ混ぜず、PC08／C-03未接続を成功扱いしない |
| CE12 | semantic compile-failでprivate入口・accessの外部利用、不正phase／stage組、readonly metadata書込み、spent／preparingへの誤昇格を拒否 |
| CE13 | 固定allowlist／strict boolean／freeze／有限plain graph、参照／brand／raw Error秘密非出力。source不在／未確認も区別する |
| CE14 | 梱包混入0。ASTは新writerのclass／method／fieldを限定し、receiver書込みをmodule一括解禁しない。source claim・payload6参照／BC／body／ready書込み0 |

oracleは実装builder／schedule／checker／counterをimportしない。原始event列からcall回数・試行予約・各保持prefix・初回位置を計算する。anchor消失・構文／環境失敗はguard検出に数えず、節除去対照の意味的なassertで区別する。重複防御／等価／観測不能は実装後の新履歴で再評価して根拠を残し、現時点で全CP／CE合格や全費用証明を主張しない。

## 12 将来の実装順・今回の文書検証

別承認後の実装単位は、(1) call区間／receiver busyの内部型・private bridgeとBP03診断、(2) 同startの一度限り試行・issued/current捕捉・全確認と保持、(3) PC08のcaller復帰照合、(4) C-03のBP04全post／閉鎖保持、の順を想定する。各途中は固定拒否を維持し、未実装の後段成功を模擬しない。(1)で資格を作っただけで格納を許可せず、(2)のconfirmedだけでC-03へ飛ばない。

今回は本書と親2文書の参照更新だけ。ソース・試験・CHANGELOG・既存検証記録・manifest／lockfile・設定は変更せず、build・合成／compiled試験・梱包操作は行わない。実装・実接続・実通信・実機操作・設定変更・index登録・コミット・Pushは行わない。

文書検証結果：3文書のローカルリンク29件に欠落なし、23表の列数・末尾改行／空白に異常なし。本書12節・親15節／17節の順序、CR01〜08とCE01〜14の重複／欠落を確認した。現行ソースを読み取り、PC02後の固定拒否・BP02固定writer・receiverの空先行参照とreadonly viewだけという未実装境界を照合した。作業中差分は本書と親2文書のMDだけで、indexは空。これは文書整合の確認であり、将来のcall／試行／格納の受入成功ではない。

## 13 内部型・readonly bridgeとBP03診断位置の限定実装（2026-11-11）

createProbeBodyPinBridgeFake／model=wfb-body-pin-bridge-1をpackage除外compositionだけへ追加した。APIは従来同様のprepare／check／checkLegacy／close／inspectで、固定script以外のroot／source／start・任意callback・summaryを受け取らない。既存prepareBodyPinStartのPC02最終検査後、旧固定停止より前にだけ新constructor継続を分岐する。前段の順序・旧factoryの固定停止／期待値はそのままで、返却済み／failed sourceを再開しない。前段自体の抽出は今回不要とした。

rootへcallActiveを含む7原始scalarと空reply参照、同startへentryBusy=falseを先行した。2活動flagにはinitializer以外のwriterがなく、trueへする継続・finally・receiver実行入口は未実装。残りはbridge検査の位置／初回失敗位置・identity確認／checked・active資格の観測・再入拒否診断である。source22key／metadata・receiver9参照・旧field契約は増やさない。constructorの新固定modeも外部boolean引数として公開しない。

module-private probeBodyPinRootAccessはroot static初期化で一度だけ固定し、identity／activeのreadonly検査だけを持つ。信頼済みrootはlexical thisから供給し、元issued=current／正規startを候補field読取りより先に比較する。receiverの正規binding／cells／run link／duty／exit bundleを9関係で照合するが、receiver入口を呼ばない。active検査は元来歴／未停止／active frame・BP03 caller位置・厳密source値・interval組を要求する。現在の実ownerはPC02・callActive=falseなのでactive資格は成立しない。

BodyPinIntervalはbefore／calling／returnedのstrict値組、BodyPinFailurePositionはrootとsourceの異なる境界を保つBP02／preflight、BP03／call、BP03／returnedのstrict値組である。後2つの正例は純粋な原始値だけのcompiled oracleで確認し、実root／sourceへactive flag・call到達・receiver prefixを格納して正例を作らない。failBodyPinBridgeはこの位置写像を使いroot初回位置を保持するが、現在のowning経路で成立するのはBP02だけ。BP03の実call／復帰位置との結合は後段で別途検証する。

新継続はbefore／checked／blockedの有限観測点で同identity・PC02条件・活動flag=falseを確認し、pin_bridge_not_connected／construction_unconfirmedで固定停止する。失敗／closeは新writerに限定し、生成BP01／after・生成failureRecorded=false、C-01準備診断を保持する。root側failureBoundary=afterとsource側failureBoundary=checkedを区別し、metadata確認を失った元sourceには書かずroot側だけで診断を保持する。closeはcacheより先に同期停止し、先行理由／初回位置／返答同一性を保持する。

内部busyの検査は原値を厳密比較する。公開projectionのstrict boolean化で不正値をfalseへ潰して資格判定に戻さない。公開値は別にallowlist／strict boolean／凍結plain graphへ投影し、参照・brand・raw Errorは出さない。C-01／前半compiledの書込み禁止は、新root診断writerの6caller fieldだけを明示追加し、receiver／payload／source claimは禁止したまま。追加flagへの書込み0も新compiledで確認する。

結果とRED／GREEN・未検証範囲は[今回の検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_BRIDGE_2026-11-11.md)。CE条件全体の受入やactive ownerの節ごとの感度を主張しない。CR02以降の固定call、receiver entryBusy予約／一度限り試行・issued/current格納、PC08／C-03は未接続。全体受付無効・Unknown・調査保留、実接続・実通信・設定変更・Push禁止を維持する。

## 14 draft-0.3レビューの等価判断（2026-11-11）

`bodyPinBridgeIdentity`冒頭の`source !== this.#bodySourceCurrent`は、直後の`bodyPinCallerMatches`が同じ比較を同じ理由で行うため、単独で外しても観測できない重複防御と判断した。`this.bodyPinBridge === true`は、identityを呼ぶ唯一の経路`prepareBodyPinBridge`がconstructor固定の同flagでだけ分岐するため、現行の所有経路では到達しない。`failBodyPinBridge`の`source.first === 'none'`による初回保持は、元sourceのfirstを書くwriterがこの継続ではfailBodyPinBridgeだけで、`#bodyPinFirst`と位置はfailureRecordedで固定済みのため、再書込みでも同値になる。

`bodyPinBridgeActive`のcallActive／interval節を外す変異は、calling組の型（`true`）へbooleanを渡すTS2345でだけ落ちる。実ownerではactive資格が成立しないため、節ごとの実行時感度は§13のとおり主張しない。これらの判断はcall未接続の現行経路に限り、CR02以降でcallActive・entryBusyのwriterやsource firstの別writerを接続するときは単独対照で改めて評価する。
