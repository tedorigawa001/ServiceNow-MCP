# WF-B：同start参照格納・全確認とPC08未接続停止の接続差分

Version: draft-0.6 / Date: 2026-11-12 / 読み取り基準HEAD: `8d95d5c`（固定call実装: `1b929dc`、一点対照・等価判断のレビュー追加: `8d95d5c`、限定準備実装の基準HEAD: `7a9a613`、draft-0.2レビュー修正基準HEAD: `10e2f96`、§15の差分設計基準HEAD: `1f41240`、§16の限定格納実装基準HEAD: `ad00f28`、§17の完了／未接続停止差分設計基準HEAD: `ebe739e`）。

draft-0.2のレビュー修正：§13の格納準備に23件の一時変異を入れたところ、18件はstorage又はcall側のVitest・compiledの意味的なassertで落ちた（busy節はanchorを保った変異で再確認）。残る5件は試験変更なしで通ったが、いずれも重複防御か単一writerであり、検証記録は「単一の失敗診断要求」「到達不能／重複防御」とまとめて書くだけで節を特定していなかった。§14に節ごとの根拠を記録した。文書だけの修正で、fixture・試験・契約は変えない。

Status: **§13の格納前準備を維持し、§16の同issued/current格納・初回rejected保持を別合成modeで限定実装。pin confirmed・PC08・C-03は未接続。** 親は[call／receiver設計](BEST_PRACTICE_WFB_BODY_PIN_CALL_RECEIVER_DESIGN.md)と[private pin設計](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)（設計読み取り時の版はdraft-0.6／draft-0.8）。前段は[固定call検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CALL_2026-11-11.md)、準備範囲は[準備検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_STORAGE_PREPARATION_2026-11-12.md)。§1〜12はdraft-0.1時点の将来設計／文書検証であり、全確認・証拠発行・PC08受理を与えない。

正式発行口・既存C実行入口・body起動は閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装は§13／16の合成依存に限り、実接続・実通信・実機操作・設定変更・Pushは行わない。

## 1 現行と今回設計する到達点

現行createProbeBodyPinCallFakeは同constructor／同prepareの固定callから同startへ入り、一度だけattemptingへ進み、参照格納前にreceiver_unconfirmedで止まる。callerはacceptedをstate_invalidとして拒否する。後段用の値checkerはあるが、実保持への接続・PC08受理を証明していない。

| 区分 | 現行の固定call入口 | 本書の別合成継続案 |
|---|---|---|
| receiver | attempting、issued/current/rejected空、receiver first=receiver_unconfirmed | 元sourceをissued→currentへ保持、checked→confirmedと最終検査。通常到達のreceiver first=none |
| primitive | rejected_attemptで固定停止 | 最終検査まで通ったcalleeだけacceptedを通知。権限・参照・成功receiptは返さない |
| caller | acceptedはstate_invalid | 新継続だけacceptedの復帰を「PC08未接続」として固定停止。受理／BP04へ進まない |
| 正常到達の上位 | construction_unconfirmed／pin_storage_not_connected | construction_unconfirmed／pin_return_not_connected／ok=false |
| 不変 | claim unused・payload空・ready false・body 0 | 同じ。sourceの所有者は元rootのまま |

入口案はpackage除外composition内のcreateProbeBodyPinStorageFake／model=wfb-body-pin-storage-1とする。既存call factory／model・固定停止・script／期待値・facade exportを変更しない。名前は将来実装用の案で、今回exportやコードを追加しない。

## 2 配置・分岐と一度限りの生成継続

同CanonicalGateDraftRootと同binding.target.startのRetirementStartAssembly、既存module-private固定accessだけを使う。新constructor固定modeは公開boolean・任意callbackとして渡さず、固定合成factoryからのみ選択する。root／frame／owner／予算／registry／friend・Pin／receipt objectを増設しない。

receiverの分岐は現行attempting全検査の後、既存のreceiver_unconfirmed記録より前に置く。callerの分岐は同固定callからprimitiveを受け、callActiveのfinallyを離脱した後、現行のaccepted拒否・通常失敗理由写像より前に置く。旧modeは旧分岐へ進める。現行の失敗返答を受け取ったrootを第2prepareで再開したり、failed sourceをinitializingへ戻したりしない。

新modeの選択確認も同rootのprivate固定継続に限定する。receiverが公開診断や候補sourceのmethodからmode／anchorを求めない。既存のcaller資格・同start入場・一度限り試行を再発行せず、その同じ入場の継続で格納する。

新modeも既存の固定call継続・active資格を前提とし、mode追加を理由にcallActive／entryBusyや元frame／source条件を緩めない。格納後の別段階検査は固定列挙で追加し、任意phaseをcallerから指定して起動する口にはしない。

## 3 同一性・所有権と書込み権限

| 保持先 | 関係と権限 | 失敗後の責務 |
|---|---|---|
| 元root | issued=current=元source、rejected不在。元BS shell／failure／binding／link／duty／control／start、生成9固定化・metadata確認・build confirmed | sourceとshellのcustodyを保持。metadata未確認ならsourceへの診断／停止書込みを行わずroot側へ保持 |
| 同startのissued | 確認済み元sourceを一度だけ直接保持 | 上書き・clear・再pinしない。sourceの所有権を引き取らない |
| 同startのcurrent | 同じissuedを一度だけ直接保持 | 元issuedを維持し、同値copyから補修しない |
| 同startのrejected | 当該正規試行で既にcurrentへ捕捉した不一致候補だけを、空slotへ一度保持 | 初回候補を置換しない。未確認ならcurrentも保持し解放済みとしない |
| payload6参照 | 常に空、occupancy free／bindingState empty／bind prefix none | 借用・格納・bind・cleanupを接続しない |

各格納前と確認前は、元root由来の最小同一性→元来歴→停止／先行first→BaseUnused／StorageEmpty／PayloadEmpty→当該phaseの順で照合する。最小同一性はfield読取り／reflectionより先。bindingOwnerとcellOwnerは各元関係を保ち、同一objectであることを要求しない。

sourceはcallee中initializing／unused・BP03／call・pinCallReached=true、bindCallReached／postConfirmed=false、first／failure位置／refusal／deliveryは初期値、stop=falseだけを受ける。rootは同active frame・running／BP03／call／before・未停止／先行理由なし、callActive=true。receiverはentryBusy=trueと当該試行の実保持を要求する。rootの正規nested refusalだけは元sequenceの失敗としない。

bodyFieldsInitialの「9参照全空」を格納後に流用しない。既存のbodyPinProvenanceMatches、bodySeedBaseMatches、bodySourceStorageMatches、bodyPinPayloadEmptyと狭い値checkerを固定に組み合わせ、初期／issued／captured／confirmedを広いORで受ける汎用checkerにしない。公開sameReference／confirmed値は診断だけで、private参照照合を代替しない。

## 4 内部値・writerと診断位置

既存BodyPinStage、BodyPinReceiverStep、expected-source3参照、source22key・metadata9／進行13を再利用する。issued／currentは元参照だけで、型assertionや値checkerのtrueから資格を作らない。既存C-01のissued／captured／checked／confirmed値型は実参照検査と対に接続する。

| 項目 | 内部契約案 | 制約 |
|---|---|---|
| 保持prefix | empty→attempting→issued→captured→confirmed | 試行true・到達stageを失敗で払い戻さない。checkedはstepでありstageではない |
| 操作位置 | attempt→issued→current→checked→confirmed | 直接記録又は確認した最後の位置。次の保持前guardだけで先にstepを進めない |
| 格納中の現在境界 | 同startの先行primitive BodyPinStorageBoundary=none／before／after案 | 新modeの当該入場だけが更新。branch到達時after、次の固定guard前before、各直接記録後after。finallyで消さない |
| receiver初回診断 | 既存first／failurePhase=pin／failurePrefix=none／failureBoundary、bodyPinFailureStep | 初回だけ現在step／境界をcopy。bind用prefixへissued等を入れない |
| caller位置 | 同rootのBP03／call／before又はafter | calleeのissued等をroot位置へcopyしない。callPhaseのreturnedもPC08受理ではない |
| 新閉鎖返答 | 同rootの先行空private reply参照案 | 凍結・有限allowlist、初回失敗返答を一度cache。後発closeは別inspectで示す |

現行catchの「stepがattemptならafter、それ以外はbefore」は格納後には使えない。新modeは上記境界を各同期群の外側／末尾で保持し、issued／current／checked／confirmedの失敗位置を正しく固定する。格納前guard失敗は最後のstep／before、直接記録後の失敗はそのstep／afterとする。不正境界をbeforeへ丸めずstate_invalidで内部拒否し、位置が未確認ならnoneと未確認診断を使い、架空のbefore／afterを作らない。旧modeの診断writer・期待値は維持する。

## 5 固定格納・全確認schedule

SG01〜09は操作種別であり、実call数・全guard数・unit係数ではない。sourceのphase／boundaryは最後までBP03／callのまま。

| ID | 固定処理 | 同期群の直後／次段の条件 |
|---|---|---|
| SG01 | 同入場のattempting全検査後、新境界noneを確認して新継続を開始しafterへ | attempt=true・stage attempting・step attempt、3参照空、busy2軸true |
| SG02 | 境界before、attemptingと全安定・停止・issued空を再検査 | 試行・参照の予約を再発行せず元組だけを使う |
| SG03 | 元source→issued保持、step issued／stage issued／境界afterを直接記録 | issued=元source、current／rejected空。記録群の直後だけ観測 |
| SG04 | 境界before、issuedと全安定・停止・current空を再検査 | issuedをcopy／置換せず次段へ |
| SG05 | 同issued→current保持、step current／stage captured／境界afterを直接記録 | issued=current=元source、rejected空。記録群の直後だけ観測 |
| SG06 | 境界before、captured・両側実参照・全安定／停止を照合→step checked／境界after | stage capturedを維持しchecked専用検査。確認後の観測点でも再入はbusyで拒否 |
| SG07 | 境界before、checked・同参照・全安定／停止を再照合→stage confirmed／step confirmed／境界afterを直接記録 | 到達事実は保持。ただし最終post成功をstageだけから推定しない |
| SG08 | confirmed・同参照・全安定／停止を最終検査し、成功だけacceptedを直接返す | 最終検査後とreturnの間にscript／hook／awaitなし。receiver finallyでentryBusyだけ解除 |
| SG09 | caller finallyでcallActive解除、実primitive復帰をcall／afterへ記録し、PC08未接続停止 | rootはreturned stepへ進まず、source境界もafterへ進めない |

SG03／05／07の直接記録群にはallocation・getter・guard・診断projection・script／通知／callback／awaitを挟まない。固定accessと既知private／plain data fieldだけを使い、群の途中を故障checkpointにしない。guard直前、群完了後、checked後、confirmed記録後・最終post前だけに有限のthrow／close／prior／再入観測を置く。最終post前にcloseされた場合はconfirmedを保持したままacceptedを返さない。

各phase検査は元参照の実照合と同じsnapshotから作った狭い値viewを使う。原値の不正booleanを公開用strict boolean投影でfalseへ潰してから検査しない。格納を増やすためにBS空storageをDataStableとOR結合したり、BCを起動したりしない。

## 6 copy混入・初回rejectedの限定保持

正常なcurrentは同issuedを直接保持するだけで、任意候補を受け取らない。負の対照は固定合成script又は局所compiled変異で、元sourceから事前に作った同値copyをcurrentだけへ混入させる。Proxy等を使う場合も未知候補の属性を検査せず、最小同一性の不一致だけを読む。

当該root／同start／実行中の同一試行が確認済みで、元issued保持を壊さずにcurrent不一致を検出した場合だけ、空のrejectedへ当該current参照を直接保持してbinding_mismatchを記録できる。candidate.custodian等からrootを探索しない。異なるstartへの侵入・試行開始前のforeign拒否では、相手のrejected／first／busyへ一切書かない。

rejected保持はprefixの回収ではなく不一致候補のcustodyである。保持直前に停止・先行理由があれば、候補の新規保持を始めず元currentを残す。保持後のthrow・通知失敗でも元issued／current／初回rejectedをclear／置換しない。rejectedの保持確認が失われても再保持や別候補補完を行わず、元slotと未確認責務を同ownerに残す。

## 7 PC08未接続時の固定停止

SG08のacceptedはcalleeの完了通知で、callerがpinを受理した証拠ではない。新modeのcallerは実callからの固定primitiveだけを分類し、参照・public診断から結果を復元しない。accepted以外は既存の拒否／失敗の経路を保つ。nested refused_existingを元callの結果へ混ぜず、同じsourceへの第2callを認めない。

acceptedで復帰しても、PC08のreturned checker・復帰後の全安定検査・BP04 pre／commit／postを実行しない。call／afterの記録後、任意の新checkpoint・通知・返答生成より前にrootの「復帰後確認未接続」を固定する。先行root理由・source理由・停止があればそれを優先し、通常の未接続理由で上書きしない。単なる未接続をcalleeのreceiver_unconfirmedやstate_invalidへ誤分類しない。

| 通常の格納完了→未接続停止 | 必須値 |
|---|---|
| 返答 | model案wfb-body-pin-storage-1、pin_return_not_connected、first construction_unconfirmed、ok=false |
| root | route failed、BP03／call／after、preparingConfirmed=false／pinPostChecked=false。共通firstとpin初回位置を固定 |
| 元source | 確認済みならstate failed、first construction_unconfirmed、failurePhase BP03／failureBoundary call。claim unused・pinCall true・bindCall／post false |
| receiver | stage confirmed・step confirmed・issued=current=元source・attempt true、first／failure位置はnone、rejected空 |
| 離脱 | callActive=false／entryBusy=false。finallyは活動だけを解除し、履歴・参照は保持 |
| 閉鎖 | authority none／execution closed／formalIssuance closed／wholeRunAdmission disabled／implementation unknown／investigations on_hold |

receiver first=noneとsource failedの共存は矛盾ではない。上位の未接続停止を正常に完了したcalleeへ強制伝播しない。source metadataが未確認ならsourceのraw fieldへ書かず、root側の既知位置・診断・保持責務だけを正とする。sourceをpreparingへ移すことも、root stepをreturned・source boundaryをafterへ進めることもPC08の別実装まで禁止する。

現行call modeは引き続きacceptedをstate_invalidとして拒否する。新modeのaccepted分類は成功許可ではなく固定停止へのrouteだけであり、calleeを省いてacceptedだけ返す変異でも受理／ready／C-03へ到達してはならない。実格納／最終postの欠落は独立oracleが実private prefixとの差で検出し、偽のconfirmed参照を補完しない。

## 8 失敗prefixと診断・所有責務の保持

| 失敗位置 | 同startに保持する最後の事実 | caller／source側 |
|---|---|---|
| 格納前・SG02 | attempting／step attempt、試行true、3参照空。guard前ならboundary before | call到達済み・unused claim。未格納を解放済みと推定しない |
| issued直後／次guard | stage issued・step issued、issued=元sourceのみ。before／afterは実境界 | 第2call／current補完なし。元rootもsourceを保持 |
| current直後／checked前 | stage captured・step current、issuedとcurrent・初回rejected候補 | copyを元issuedへ修復せず、検出済み不一致を保持 |
| checked後／confirmed前 | stage captured・step checkedと両参照、実before／after | checkedをconfirmed済みと扱わない |
| confirmed記録後・最終post失敗 | stage confirmed・step confirmed・両参照、callee初回理由／実境界 | confirmed到達を戻さないがaccepted通知／復帰後受理はしない |
| primitive復帰未確認 | 最後のprefix・calleeが実記録した診断だけ | root BP03／call／before、捕捉／復帰未確認はconstruction_unconfirmed。source側は既存receiver_unconfirmed等へ固定写像 |
| accepted復帰・PC08未接続 | confirmedと両参照、receiver診断noneを維持 | §7の上位未接続停止。root call／after、source call境界 |
| 未接続診断後のclose／配送異常 | 元prefix・firstを保持し、calleeへ新firstを作らない | cacheより先に同期停止、配送は既存delivery軸。初回理由／位置・返答同一性を維持 |

calleeの正規入場後のbinding不一致→binding_mismatch、状態不正→state_invalid、停止→closed、捕捉／確認未確認→receiver_unconfirmedを用い、rootへは最後だけconstruction_unconfirmedに写像する。元root先行理由、元source先行理由、receiver first、生成BP01診断、停止／配送／refusalは独立に保持する。pin側のfailurePrefixは常にnoneで、issued／capturedをbind prefixへ誤記しない。

closeは元root stopをcacheより先に単調記録し、確認済み元sourceだけへ同期反映する。calleeは次の固定guardで停止して自分のfinallyへ進む。root closeからpin解除・receiver診断強制更新をせず、旧start.close／request／drain・回収／field clear／Journalへ迂回しない。失敗後に再prepare／再pin／再配送して修復しない。全保持は未解決の解放責務で、cleanup証拠・借用退役・root終端成功ではない。

## 9 等価判断の再評価条件

親[call設計§14・16](BEST_PRACTICE_WFB_BODY_PIN_CALL_RECEIVER_DESIGN.md)と[private pin設計§12・14](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)の結論は元の所有経路限定であり、18件を一括で有効／無効へ読み替えない。実装前に元の変異・節・到達条件を個別に対応付け、次の変化がある項目を再検証する。

| 既存の等価根拠 | 再評価の契機／必要な対照 |
|---|---|
| 先行の同値検査：entryBusy／step／failureStep、2回目callActive | 格納後に初期条件を再利用していないか。新stageの実参照を壊して狭いcheckerの拒否点を比較。初回call前の重複は、同じ同期区間で値が変わらない根拠が残れば等価を維持可能 |
| busyが先に受けるattemptUsed／pinCallReached | callee完了後、上位失敗の固定前に新しい観測点や第2呼出しができないことを確認。今回もstoppedが先に受けるなら到達不能と明記し、到達可能な検証に見せるためstopを戻さない |
| constructor mode／identityの到達不能 | 新modeの選択経路・同startへの固定bridgeが増えた箇所を再照合。別root／source／start・copy／Proxyで無書込み拒否、hook=0。旧caller照合との重複が残るかは個別判断 |
| receiver first／refusalが単一writer・同値 | 格納guard・catch・rejected保持・返答前で第2診断要求が起き得る場合、異なる理由／位置を続けて発生させ初回保持を確認。正規再入はfirstを変えず、in_progress／duplicateの到達条件も別に評価 |
| attemptUsedとstageが同時記録 | CR04の群はそのままでもissued／captured／confirmedは別の到達prefixになる。実slotとstepを段階ごとに単独故障し、stage条件と参照条件の役割を区別 |
| inherited／receiver理由・sourceReasonが同一写像 | receiver完了none＋root未接続、confirmed後callee失敗、上位先行理由の組で軸が分かれる。source first guardも含め、未接続をreceiver失敗へ誤写像する変異を検出 |
| catchのcall回数・sourceReason初回保持が到達不能 | 格納中throw・最終post・callee離脱・新固定停止・返答生成に失敗位置が増える。実callの有無、初回記録の前後を別prefixとして比較 |
| active callActive／intervalの重複防御 | 新格納は活動中、PC08は未接続。格納後も活動条件を確認し、共同対照と単独節感度を区別。復帰後falseを入場に許すよう緩めない |

値viewだけの27field故障を実slot検証の代替にせず、issued/current/rejected・元owner関係を実保持で変える対照も追加する。段階別guardを外す変異は、同じ一点故障で最初の理由・操作位置・保持prefixのいずれが変わるかを確認する。anchor消失・構文／型エラー・環境失敗・後段の一律固定拒否だけを意味的killに数えない。観測不能・重複防御はその根拠と新境界での再評価待ちを明記し、全節の感度を主張しない。

## 10 独立合成・compiled受入条件（すべて未実施）

| ID | 必須条件と負の対照 |
|---|---|
| SE01 | 旧(B)／C-01／前半／bridge／callの正常停止・script・返答／期限・一点対照を維持。新mode以外で格納せず、第2prepareでの再開も拒否 |
| SE02 | 同root／source／start・全metadataと別owner種の元関係を個別混入。copy／Proxy／getterは候補field読取り前に拒否し、相手の全slot／診断不変・hook 0 |
| SE03 | 新正例は元root／同startで実issued/currentを保持。独立event oracleからcall=1／trial=1・格納各1／stage／step／境界／両busyを予測し、公開件数や値checkerだけを根拠にしない |
| SE04 | 全許可観測点×throw／close／prior／再入。未開始・attempting・issued・captured・checked・confirmed・復帰未確認・未接続固定後を分け、最後のprefixと初回理由を比較 |
| SE05 | current同値copy、初回rejected保持・その前後の失敗。元issued不変、current／rejected clear・置換・第2候補補完を拒否し、未確認でも責務保持 |
| SE06 | stageごとの実private参照・狭いsource／receiver値・停止／所有関係を単独故障。guard除去で当該最初の拒否点が変わる対照、等価なら§9の個別根拠を残す |
| SE07 | 各直接記録群の固定順・literal代入、群間hook／allocation／awaitなし、private access代入1回。finally除去で活動残留を検出し、参照／試行の巻戻しも検出 |
| SE08 | acceptedだけの偽装・callee省略・confirmed最終post省略でもPC08／C-03／readyへ進まない。正規完了はreceiver first noneのままpin_return_not_connected、source first construction_unconfirmed |
| SE09 | 生成BP01／after、caller BP03 call before／after、callee各stepと境界を分離。confirmed後のclose・異なる先行理由・配送異常でも元first／返答同一性・未解決custodyを保持 |
| SE10 | semantic compile-failでprivate入口／格納accessの外部利用、readonly metadata書込み、stageとstep／参照値の不正組、spent／preparingへの誤昇格を拒否 |
| SE11 | 新projectionのallowlist・strict boolean・凍結有限plain graph、不在／未確認の区別、raw参照・brand・owner由来値・Error／message非出力。診断からの復元口なし |
| SE12 | 新receiver writerはclass／method／field単位で限定許可。source claim／payload6参照・BC／body／ready書込み0、梱包混入0、runtime／旧facade export不変 |

oracleは実装のbuilder／schedule／checker／counterをimportせず、固定原始event列と独立条件式でprefix・初回位置・停止後の未実施suffixを計算する。SEは将来実装の受入条件で、親CE14条件や全費用証明を完了扱いしない。現在の既存試験結果を新格納経路の成功件数に含めない。

## 11 追加費目・Unknownと未接続範囲

追加論理費目は同startの先行現在境界scalar、新rootの固定mode／空返答参照、狭いprivate格納継続・各保持前／確認前の検査、issued/current保持・初回rejected保持、初回診断・finally・固定未接続停止・projectionである。既存root／owner／frame／source生成／metadata9固定化／BS13carrier／receiver9参照／callActive／entryBusy／PC01・CR04予約を再発行・二重計上しない。

22key／13carrier／固定参照の有限走査と列挙位置だけを使い、再帰graph・任意長履歴・再試行探索を導入しない。記録群の直接代入数はallocation数や実費ではない。実E／S・unit係数・実layout／allocation／GC／OOM・全guard数／全体work上界・停止後解消予約・診断必着はUnknown。新期限・残時間からのdeadline再計算・実予算更新・cap投入はしない。

PC08の復帰後受理、C-03のBP04 preparing／全post、source利用claim消費、payload借用／bind、BC00・構築ready・body・Journal供給・field clear・root終端・正式発行は未接続。confirmed到達・busy解除・参照保持を解放／cleanup証拠に読み替えない。

## 12 将来の分割と今回の文書検証

別承認後は、(1) 新modeの狭い状態・現在境界と格納前後検査、(2) 同issued/currentの格納・初回rejected保持・confirmed最終post、(3) accepted復帰後のPC08未接続停止と全prefix oracle、の順を想定する。各途中は固定停止を維持し、旧call modeの返答・失敗履歴を変更しない。実装の分割ごとに旧／新のcompiled・梱包の負の対照と§9の再評価を記録する。

次工程のPC08は同source／同start・実保持／confirmed・両busy=false・全安定／未停止を専用に再照合する別契約であり、本書では接続しない。その後のC-03も別承認とし、今回の格納完了や固定停止から自動開始しない。

今回は本書と親2文書のMDだけを更新する。ソース・試験・compiled fixture・CHANGELOG・既存検証記録・manifest／lockfile・設定は変更せず、build・合成／compiled試験・梱包操作・index登録・コミット・Pushは行わない。文書整合の確認結果は本節へ追記し、将来の格納経路の受入成功とは区別する。

文書検証結果（2026-11-12）：変更3文書のローカルリンク29件に欠落なし、24表の列数・末尾改行／行末空白に異常なし。本書12節・親17／18節の順序、SG01〜09とSE01〜12の重複／欠落なしを確認した。現行の空参照・attempting固定停止・accepted拒否、狭い値checkerと元来歴／空payload境界、既存catchの位置判定、レビュー§16の等価判断を読み取り照合した。作業中差分はMD3ファイルだけ、indexは空、HEADは基準の`8d95d5c`から変更していない。これは文書整合の確認であり、将来の参照格納・復帰後受理・全費用の検証成功を意味しない。

## 13 (1) 狭い状態・境界と格納前準備の限定実装（2026-11-12）

新createProbeBodyPinStorageFake／wfb-body-pin-storage-1をpackage除外compositionだけへ追加した。固定script以外の引数はhookを呼ばず拒否し、APIは凍結prepare／check／checkLegacy／close／inspectのみ。旧factory・model・期待値は維持し、新modeは元constructor／prepare／frameの同attempting検査後、旧格納前失敗writerより前にだけ分岐する。返却済みrootの再開・新owner／registry／friendは作らない。

BodyPinStorageStateはentry／attempted／before_issued／issued／before_current／captured／before_checked／checked／before_confirmed／confirmedの10variantで、source BP03／call／unusedとreceiver stage／step・境界を型と純粋検査で対にする。後続7variantは原始値だけの検証であり、実receiverへissued／currentやconfirmedを偽装して正例を作らない。実ownerのprivate checkerへ渡せるphase型はentry／attempted／before_issuedの3つだけ。

同startへ先行境界noneを追加し、新準備はbeforeでentryを検査→境界after／checkedでattemptedを検査→境界before／before_issuedで格納前条件を検査→blockedでも再検査して固定拒否する。各検査は同root／source／start・固定mode・実callActive／entryBusy、元来歴・同frame／未停止・空BS／空payloadと、同時点のsource／receiver／境界原値を照合する。issued/current/rejected・stageの新writerはなく、元参照はすべて空、stage attemptingのまま。

通常到達はpin_storage_not_connected／root first construction_unconfirmed、source／receiver first receiver_unconfirmed、receiver step attempt／failureBoundary beforeである。§7のpin_return_not_connected／receiver confirmed・first noneへは進めない。境界は正規owning経路でnone→after→beforeだけ、新しいfinallyは作らず元receiver／caller finallyでbusyだけを解除する。初回境界が不正ならstate_invalid、失敗位置が未確認ならfailureBoundary noneであり、未知値をbeforeへ丸めない。

有限観測はbefore／checked／before_issued／blockedの4点で、throw／close／prior／再入を比較する。新receiver診断writerは初回first／pin位置だけを保持し、rootが先に停止した場合のBP03 call beforeと、primitive復帰後のcall afterを分ける。先行生成診断・unused claim・返答cache・未解決custodyを保持し、後発closeはcacheより先に同期停止する。

追加保持はreceiver境界1scalar、rootの準備点／初回失敗点／再入結果3scalar・空reply参照とconstructor固定mode。既存callActive／entryBusy・source22key／metadata9・receiver9参照・PC01／試行予約を再発行しない。純粋検査の固定field走査・view生成・owner再照合・固定拒否／診断／projectionは追加費目だが、実E／S・allocation／GC／OOM・全guard数／全体work上界はUnknownのまま。

SE01／02／04／06／07／09〜12の今回境界に関係する部分だけを[検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_STORAGE_PREPARATION_2026-11-12.md)へ記録する。新35件、値専用10状態の270field拒否・100交差組、実準備4点のchecker迂回対照等は、実格納・初回rejected保持・confirmed最終post・accepted後停止の成功を証明しない。§9の等価判断も準備範囲だけで再評価し、格納後へ自動継承しない。参照格納・PC08・C-03・claim消費・body起動・正式発行は未接続、全体受付無効・Unknown・調査保留を維持する。

## 14 draft-0.2レビューの等価判断（2026-11-12）

格納前準備の現行所有経路だけでの判断である。(2)以降で参照格納・初回rejected保持・confirmed最終postを接続し、診断要求や呼出し元が増えるときは単独対照で改めて評価する。

| 節 | 等価の根拠 |
|---|---|
| `failBodyPinStorageReceiver`の`#bodyBindFirst === 'none'`による初回保持 | 準備の各失敗経路はwriterを1回呼んで直ちに戻り、catchへ来るのは未記録のthrowだけである。現行では2回目の診断要求がない |
| `storageMode`の`bodyPinBridgeIdentity` | 唯一の呼出し元`bodyPinReceiverEntry`が、入場時に同じ組の最小同一性を確認済みで、その後hookなしでattempting検査まで進む |
| `storageEvent`の`bodyPinStorage !== true` | 呼出し元`prepareBodyPinStorage`は、`storageMode`がtrueのとき（constructor固定mode）にだけ到達する |
| `storageEvent`の`bodyPinBridgeIdentity` | 同じく確認済みの元root／source／startの組だけで呼ばれ、準備中に組を差し替える経路がない |
| `bodyPinStoragePoint`の`bodyPinBridgeIdentity` | `storageEvent`が直前に同じ組の同一性を検査しており、その間にscriptはない |

`storageMode`の固定mode節は、storage側の試験では観測できないが、旧call factoryで外すと格納準備へ進むためcall側のVitestで落ちる。等価ではないので本表に含めない。

## 15 同issued/currentの格納writer・実参照照合と初回rejected保持の差分設計（2026-11-12）

[格納・初回rejected保持の接続差分設計draft-0.1](BEST_PRACTICE_WFB_BODY_PIN_REFERENCE_STORAGE_DESIGN.md)で、§12の(2)をさらに分割し、同root／source／startの実issued→current保持と、同試行で捕捉済みの不一致currentだけを初回rejectedへ保持する境界を対にした。正規source所有はrootに残し、receiverの保持は借用責務であってsource利用claim消費ではない。固定同期群とprivate実参照照合を組にし、公開view／同値copyからの昇格口を作らない。

新中間継続の到達点はcaptured／step currentまでとし、checked／confirmed・最終post・accepted・PC08・C-03は接続しない。正常中間でもreceiver_unconfirmed／pin_confirmation_not_connectedで固定停止する別mode案であり、§7〜8の将来の全確認後のreceiver first none／pin_return_not_connectedとは区別する。既存準備factoryの空参照・attempting固定停止は維持する。

初回rejectedは停止／firstのない正規試行で既に捕捉した候補だけが対象である。保持と保持post確認を分け、失敗後も元I/C/J・初回理由・未確認責務を保持する。同期close後の追加保持、foreign候補格納、第2候補置換、finallyでの参照clearは許さない。§14の5節は新writer／失敗専用postの実経路ごとに再評価し、等価・非等価を自動継承しない。

本節と子設計は文書だけ。§13の限定準備実装は変更せず、新writer・保持scalar・新mode・RE01〜12は未実装／未実施である。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

## 16 同issued/current格納・実参照照合と初回rejected保持（2026-11-12）

[子設計§14](BEST_PRACTICE_WFB_BODY_PIN_REFERENCE_STORAGE_DESIGN.md)の中間範囲だけを別の閉鎖合成factoryへ実装し、[検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_REFERENCE_STORAGE_2026-11-12.md)へ結果と初回失敗を記録した。元rootがsourceを所有したまま同startのI/Cへ同参照を保持し、実slotとphase値を対に照合する。captured／step currentまでで固定停止し、pin confirmed・最終post・PC08・C-03へ進めない。§15の未実装記述は設計作成時の履歴である。

初回rejectedは同正規trialで捕捉済みの不一致Cだけを保持し、G_Jの前後で境界before／afterを分ける。保持post未確認でもJと初回診断をclearしない。中間post完了の先行scalarを加え、捕捉直後のthrowを通常の未接続到達と誤分類しない。旧準備の空参照・固定拒否は維持する。§14の初回保持guardは新G_J後のcatchで非等価になる対照を追加し、残る4節の重複防御と区別した。正式発行口閉鎖・全体受付無効・Unknown・調査保留は不変。

## 17 confirmed・最終postとcaller固定停止の接続差分設計（2026-11-12）

[完了・PC08未接続停止の差分設計draft-0.1](BEST_PRACTICE_WFB_BODY_PIN_CONFIRM_RETURN_DESIGN.md)で、SG06〜09の内部境界を具体化した。最終post前の境界before／専用phaseと、成功後の境界after・最終marker true→literal returnを分け、既存値型のconfirmed／afterを緩めない。G_K／G_M／G_Pと固定wrapper／finallyは非介在を維持し、confirmed記録だけから完了通知を作らない。

PC08未接続停止ではcallee first noneを維持し、root call after・source callでconstruction_unconfirmedを固定する。新mode専用の最小primitive分類、非割当ての上位診断固定、後続の返答生成／cacheを分離し、現行のallocating位置生成／receiver失敗写像をそのまま流用しない。実primitive未復帰、callee最終post失敗、正常callee→上位未接続、返答生成失敗のprefix／所有責務を別に残す。

本節と子設計は文書だけ。§16の限定格納実装・旧入口は不変、新確認／最終post／caller分岐・FC／FEは未実装／未実施。PC08のreturned検査・C-03・claim消費・payload借用／bind・ready／body・正式発行は未接続のまま、全体受付無効・Unknown・調査保留を維持する。
