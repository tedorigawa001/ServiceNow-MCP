# WF-B (C)：BP02〜04段階別検査・同root／同startのprivate pin接続差分

Version: draft-0.11 / Date: 2026-11-12 / 読み取り基準HEAD: `b3776da`（(B)実装: `c28b423`、再検査／不在projectionレビュー修正: `b3776da`、C-01実装基準HEAD: `554ef9a`、C-01レビュー修正基準HEAD: `86d2560`、C-02前半実装基準HEAD: `a3f1f66`、C-02前半レビュー修正基準HEAD: `4f70522`、後半接続差分設計基準HEAD: `ff866f9`、bridge内部契約実装基準HEAD: `3fc15ab`、固定call／入場実装基準HEAD: `9f4361c`、格納／未接続停止差分の設計基準HEAD: `8d95d5c`、§19の格納／初回rejected差分設計基準HEAD: `1f41240`）。

draft-0.4のレビュー修正：C-02前半の開始前route未使用条件`bodyPinStartRouteUnused`の10節と、PC02の`bodyPinStartPreflightMatches`のroute 9節は、単独で外してもvitest・compiledの両方が通っていた。compiledのphase対照はsource 13fieldだけを壊し、route scalarを壊す対照がなかった。context条件のbase／storage／payload／来歴の4呼出し、entry/after の2回目caller照合、非accepted時の`#fixed`先行返却（内部拒否のrefusalを`foreign_source`へ上書きしない）、admit内refusalの初回保持、pin-start失敗時のshell failed反映も固定されていなかった。route 13scalarをentry/beforeとpreflight/beforeへ単独注入する26対照（節除去で拒否位置が動く）、context 4呼出しの注入と除去対照、同値copyへの差替えでcallerの再照合を確かめる対照、2回の再入でrefusalの初回保持を確かめる対照をcompiledへ追加した。context拒否8件ではrefusal=noneも比較する。vitestにはpin-start失敗後の`storage.state`=failedを追加した。等価・観測不能な節は§14に記録した。

draft-0.2のレビュー修正：§11は「BP02 entry値checkerだけを同ownerに接続し…3位置で再確認」としていたが、`bodyPinContractsMatch`のentry呼出しを`true`へ置き換えても、vitestとcompiledの両方が通っていた。compiledの対照が来歴・属性・初期値・安定性・payload6参照にしか注入しておらず、source進行13fieldとreceiver pin値を同owner経路で壊す対照がなかったためである。同じく、PayloadEmptyのoccupancy／bindingState／bindPrefixの3節、checked位置の再検査、失敗時のshell failed反映、source不在時の`receiverPin`の`not_created`とallowlist、冒頭の`#bodySourceState = 'held'`も固定されていなかった。source13field・receiver12fieldの単一注入と写像除去の対照、checked位置の4注入（除去で拒否位置がafterへ移る）、payload scalar3節の対照、receiver投影allowlistの対照をcompiledへ追加した。vitestにはstorage.state・build.state・`receiverPin`の不在投影を追加した。等価・観測不能な節は§12に記録した。

Status: **C-01／C-02前半・§16の内部bridgeに加え、§17の固定call・receiver入場／一度限り試行記録までを合成依存限定で実装。** 現行範囲は§11〜13・16〜17と[C-02前半検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_START_2026-11-11.md)・[固定call検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CALL_2026-11-11.md)。§1〜10はdraft-0.1時点の将来設計／文書検証、§18の差分のうち狭い状態・先行境界・格納前準備だけを子設計§13で限定実装。参照格納・PC08・BP04は未接続。親は[生成・停止設計](BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_STOP_DESIGN.md)と[bind・先行borrow設計](BEST_PRACTICE_WFB_BODY_BIND_BORROW_DESIGN.md)。前工程の実績は[(B)検証記録](E2E_BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_2026-11-11.md)と[C-01検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CONTRACTS_2026-11-11.md)。将来の正常modelと現在の固定拒否modelは区別する。

正式発行口・既存C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。本書の(C)はprivate pinの設計区分であり、既存C実行入口の解禁ではない。既存の限定実装は§11のC-01・§13のC-02前半・§16のbridge準備・§17の固定call／入場までで、§18は差分設計を主とし、限定準備だけを子設計§13へ接続する。参照格納・source利用claim消費・payload借用／bind・構築ready・body起動・実接続・実通信・設定変更・Pushは行わない。

## 1 現行からの差分と今回の正常到達点

現行(B)は同rootのBS00〜14→BP00〜01を通り、source_held_unpinnedで返す。source metadataConfirmed=true、buildStage=confirmed、生成位置BP01／after、source initializing／unused／pinCallReached=false。同startにはexpected-source3参照とpayload6参照が先行済みだが、すべて空でpin操作は存在しない。

bodySourceStableMatchesはreceiver全初期値を含み、bodySourceDataMatchesはpinCallReached=false・phase=BP01／boundary=after等を要求する。このままpin後へ再利用すると正規の非空pinを拒否する。逆にORで非空を許すと、旧field限定のsource不在やpin未開始条件を崩す。将来(C)は安定検査と段階別の狭い検査を分離する。

正常到達点は**BP04 post後の閉鎖保持**だけ。source preparing／claim unused、pinCallReached=true、bindCallReached=false／postConfirmed=false。同startのexpected-source issued=current=元source、rejected不在、pinAttemptUsed=true／pinStage=confirmed。payload6参照は空、occupancy=free、bindingState=empty／bind prefix=none、同BS shellはbuilding・13carrier未開始、root／shell ready=falseである。BC00開始・data生成・grant／duty消費・body開始は0。

親にある「BP04後にBCへ進む」は将来の全接続順であり、今回の(C)設計の到達点ではBC00を呼ばない。sourceのheld_unready／postConfirmed=trueはBD04専用で、pin確認に流用しない。expected-source pinは元source参照の先行保持であり、新しいPin object／BodyRoutePin／CanonicalGatePin、利用claim、実行permissionではない。

## 2 配置・生成順とprivate呼出しの来歴

配置は既存package除外composition module、custodyは同CanonicalGateDraftRoot、受領側は同binding.target.startのRetirementStartAssemblyに限定する。別root／owner／frame／duty／予算・台帳／friend／登録APIは作らない。既存のbindingOwnerとcellOwnerはそれぞれの正規関係を検査し、両者を同一ownerへ統一しない。

将来の新しい固定合成継続は、元base／probe／run／exit anchor→BS00〜14→既存BP00〜01→BP02〜04→閉鎖保持を同prepareの同保護frame内で続ける。既存(B)factoryは未pin保持のまま変更せず、返却済みの(B)rootや旧seed／live／bundleを第2prepareで再開しない。公開booleanモードや任意continuation引数を追加しない。

正規rootが既に保持するissued sourceと正規startを直接使い、module-private固定継続からだけpinを呼ぶ。root側issuer照合は、実private issued/current・metadataConfirmed・生成試行と固定化prefix、同source／同start／元metadataの関係を確認する。候補のcustodianから呼出し先を探索したり、候補のmethod／getterを呼んだりしない。正規root参照の来歴は閉じた構築経路で確保し、未知objectをclassへcastしてprivate fieldを読む設計にしない。

cross-classの橋は既存probeStartAccessと同様のmodule-private固定access継続に限定する。root／source／startや照合関数をpublic引数・返答・registryへ露出しない。receiverには公開sameOwner／accepted booleanではなく、正規rootのprivate発行slotと同startの実保持を照合できる固定境界を用意する。任意callbackを引数として受け取らず、source JSON／summary／同値copyから正規資格を復元しない。

拒否順は、(1) 信頼済みroot／startと元issuedの最小の同一性・来歴を確認してforeignを無書込み拒否、(2) 正規rootの停止／先行失敗を優先、(3) 同じ正規sourceの実行中／保持済み試行ならrefused_existing、(4) 初回だけ全entry条件、の順とする。重複を「receiver全空でない」という失敗に変換せず、foreignをduplicateとして既存処理へ混ぜない。初回(C)には構築時に固定選択した継続・同prepareのactive保護frameも要求する。routeAttempted=falseだけでは返却済み(B)rootの再開を許可しない。

## 3 生成時診断とpin進行の内部型・writer

現行のsourceBuildPhaseはnone／BP00／BP01、stepはfix_0〜8等を含む生成用の有限型である。これへBP02〜04を足して生成履歴を上書きしない。BP01完了時のcreationAttempted=true、fixedCount=9、metadataConfirmed=true、buildStage=confirmedと生成位置をpin中も保持する。pin拒否／closeで確認済み事実をfalseに戻さない。

| 保持先 | 内部値・初期状態の案 | writer／責務 |
|---|---|---|
| rootのpin開始 | bodyPinRouteAttempted=false、routeState=not_started／running／held／failed | 同rootの固定入口だけ。一度開始した履歴を返却せず、利用claimとは分ける |
| rootのpin現在位置 | phase=none／BP02／BP03／BP04、step=none／preflight／call／returned／recheck／commit／post／held、boundary=none／before／after | caller側だけ。BP03中はcall位置を保持し、callee内部のissued等を推測してcopyしない |
| rootのpin初回失敗 | recorded=false、first=none、phase／step／boundary=none | pin専用の最初の理由と位置。既存sourceFailureRecorded／生成失敗位置は変更しない |
| rootのpin確定履歴 | preparingConfirmed=false、pinPostChecked=false | BP04の状態代入確認／専用post確認だけ。source.postConfirmedやreadyとは別で、後発失敗でも戻さない |
| rootのpin refusal | none／in_progress／duplicate_pin／foreign_source、初期none | 同caller側だけ。既存receiver／source firstを書き換えず、利用claimや第2試行資格にしない |
| receiverのpin現在位置 | bodyPinStep=none／preflight／attempt／issued／current／checked／confirmed | 同startのpin継続だけ。既存pinStageの保持prefixと操作位置を分ける |
| receiverのpin初回位置 | bodyPinFailureStep=none | 同startの最初のpin失敗だけ。既存receiver first・failurePhase=pin・failureBoundaryを再利用し、bind failurePrefixはnoneのまま |
| 返答保持 | 同rootの空private reply参照 | 新しい閉鎖modelの失敗返答をcache。別failure ownerを生成しない |

追加fieldは原始literal／undefinedだけを先行する。sourceの22 own key・readonly metadata9／writable進行13は増やさない。receiverの既存9参照とpinAttemptUsed／pinStageを再利用し、新しいpin状態objectや第2claimを作らない。旧19field検査／projectionはその契約のまま維持し、新しく先行するpin診断の初期値は(C)専用検査で確認する。

現行bodySourceTrustedFailureとfailBodySourceは生成側位置を記録するため、そのままpin失敗に流用しない。将来の固定failure分岐は、BP01までなら従来の生成writer、pin入口以降なら上表のpin writerを選ぶ。pin側はsource.failurePhaseにBP02〜04の正しいcaller位置を記録し、receiver内部位置はreceiverに残す。rootの共通first・source first・receiver first・配送／refusalは別軸のまま、最初の非noneを保持する。phase選択を外部引数で切り替える口は作らない。

## 4 安定検査の分離と段階別の狭い入力

安定部分は次の4区分へ分ける。既存(B)検査の意味・再検査位置・レビュー対照は維持し、抽出する場合も元(B)の呼出し順と厳密条件が同じであることを別に検証する。

| 区分 | 必須条件 | 含めない条件 |
|---|---|---|
| SourceProvenance | 正規rootのissued=current=当該source、rejected不在、生成試行済み／9固定化／metadata確認済み／build confirmed、全22key・descriptorと元metadata関係 | 現在source phaseやpinCallReachedの一括初期値要求 |
| BaseUnused | 元seed／binding／link／duty／control／run seal／exit anchorと同start、use未使用・duty未負担・grant空・body未開始／capture未呼出し | public保持件数だけによる代用、owner2種の同一化 |
| StorageEmpty | 同BS shell／同failure、building／ready=false／execution=closed・旧bind固定値、正規13carrierすべて未開始・予約／call=false・data3参照空 | BC生成済みDataStableとのOR、shell不在を許す旧field検査の変更 |
| PayloadEmpty | bundle／draft各issued/current/rejectedの6参照空、occupancy free、bindingState empty、bind prefix none、bind未到達 | expected-source3参照の全空要求。pinの参照は下表で検査する |

すべての成功検査にはroot未停止／元firstなし・source stop=false／firstなし・receiver先行失敗なしを要求する。未知候補の同一性不一致を先に拒否し、その候補へreflection／getter／ownKeysを行わない。shapeを確認できる根拠は元固定literalのwrite-once issued保持で、Proxyをdescriptor検査から非Proxyと推定しない。

| 検査点 | sourceの許可組 | receiverのexpected-source／試行prefix |
|---|---|---|
| BP02 entry | initializing／unused、pinCall=false、bindCall=false、post=false。入場時はBP01／after | 3参照空、attempt=false／stage empty、診断初期値 |
| BP02 preflight通過・call直前 | 同上、source位置BP02／checked。元provenance・base／storage／payload空を再検査 | entryと同じ。root route running、未call |
| BP03 receiver entry | initializing／unused、pinCall=true、source位置BP03／call | 3参照空・attempt=falseを再検査。来歴／同start／停止を格納前に再確認 |
| BP03 attempting | 同上 | attempt=true／stage attempting、issued/current空。正規来歴を再確認してから格納へ |
| BP03 issued | 同上 | attempt=true／stage issued、issued=元source、current空／rejected空 |
| BP03 captured／確認直前 | 同上 | attempt=true／stage captured、issued=current=元source、rejected空 |
| BP03 confirmed／復帰 | 同上。caller復帰後だけsource位置BP03／after | attempt=true／stage confirmed、issued=current=元source、payloadは依然空 |
| BP04 pre／commit前 | initializing／unused、pinCall=true、source位置BP04／before→checked | 正規pin confirmed・両側同一性、全安定条件と停止を再検査 |
| BP04 post／閉鎖保持 | preparing／unused、pinCall=true、source位置BP04／after→held。bindCall／post=false | 正規pin confirmed・payload空／free。BC00未開始・ready=false |

これは列挙した各点だけを受ける狭い型／checkerの案であり、任意caller指定のphaseや複数状態を広いORで受ける汎用検査ではない。source Initial型はBP00のまま保持し、pin途中／preparingは既存BodySourceHistoryに沿う別の狭い型とruntime検査を対にする。failedは成功経路へ戻さず、claim unusedも再開資格にしない。

同sourceの再入／重複refusalはrootの専用refusalへ記録し、source／receiverのfirstやrefusalを汚して元sequenceを失敗させない。この(C)の成功経路ではsource／receiverのrefusalはnoneのまま、root refusalだけは正規の再入履歴を許す。receiverのpin失敗診断はrejected_attemptのうち当該正規startで開始した試行に限定する。異なるstartへの拒否は相手の診断を更新しない。

## 5 固定schedule・一度限りの呼出し境界

| ID | 所有側と固定操作 | 直後に保持する事実 |
|---|---|---|
| PC01 | rootの新固定入口で未開始・未失敗・未停止を確認し、routeAttempted=true／runningを直接固定 | 同rootの第2pin sequence不可。source利用claimはunused |
| PC02 | BP02で全entry条件→安定条件と両側初期値を再検査 | call未到達・receiver未試行、生成診断不変 |
| PC03 | call前guard後、root位置BP03／call、source.phase=BP03／boundary=call／pinCallReached=true→固定receiver呼出し | callerのcall到達履歴だけ。receiverの捕捉成功は未確認 |
| PC04 | receiverが同root／元source／同start・停止・空pin／payloadを再検査→attemptUsed=true／stage attempting | 試行は最大1回。失敗でも戻さない |
| PC05 | 正規元sourceをexpected-source issuedへ直接保持→stage issued | issuedだけ捕捉済み。sourceの所有権はrootに残る |
| PC06 | 同issuedをcurrentへ直接保持→stage captured | 元参照2slotを区別。負の対照のcopyはcurrentだけ |
| PC07 | 来歴・issued=current=元source・全安定／停止を検査→pinStage confirmed | pin確認済み事実。payload借用／readyの証拠ではない |
| PC08 | 固定primitive結果をcallerへ返し、rootはBP03 returnedと実private保持を確認 | acceptedだけでBP04を省略しない |
| PC09 | BP04で全安定・狭いpre条件・元first／停止を再検査→source.state=preparing／root preparingConfirmed=trueを直接固定 | 一度限りのpin後状態確定。claim／occupancy／readyは不変 |
| PC10 | preparing専用post→root pinPostChecked=true／source位置held／root route heldで閉鎖保持 | BC00開始0・bind未接続。正常返答もok=false |

PC03のcall到達flag→固定callの間と、PC04のattempt flag／stageの直接記録区間にはallocation／hook／通知／awaitを挟まない。故障／close観測点はその前とcallee entry／記録後に置き、「flagだけ立てて未呼出し」を後付けで作らない。PC05〜07の保持／stage更新も同じ既知fieldへの直接同期区間とし、保持直後だけ固定観測点を置く。段階途中で次の操作を始める前にはroot停止・先行理由を再確認する。

PC07 confirmed直後の故障でもpinStageを巻き戻さない。PC09のsource代入→root確認flagの間にはhook／通知／awaitを挟まない。その後のpost失敗／closeでは状態確定の到達履歴とconfirmed pinを残して失敗にする。PC10の返答生成がthrowしてもheld到達位置・preparingConfirmed／pinPostChecked・pin試行を払い戻さず、route stateのfailed／配送未確認と到達済み事実を分ける。配送は既存root sourceDeliveryFirst／source.deliveryFirstの単調な別軸で記録し、生成位置を変更しない。固定失敗返答を後から作れなければ先行診断／保持責務を正とし、OOMでの返答必着は保証しない。

private結果はaccepted／refused_existing／rejected_attemptの固定primitiveに限定する。raw Errorやsourceを結果に載せない。同sourceの再入／二重pinはrefused_existingで元first／prefixを壊さず、callerもそれを新規成功や元処理のfailに変換しない。foreign source／startは格納・試行flag・診断書込みより前にrejected_attemptとし、正規caller側だけへ理由を残す。正常receiverと異なる相手にfirstを伝播しない。

## 6 停止・失敗位置と所有責務

| 失敗位置 | 同rootに残すもの | 同startに残すもの／禁止事項 |
|---|---|---|
| BP01生成中のsource未確認 | 従来の生成位置・初回失敗・元参照。root-only停止規則を維持 | pin未呼出し。未知sourceへ停止書込みしない |
| BP02 entry／preflight | 保持済みの生成事実＋pin最初の理由／位置、元source／shell。異常注入でmetadata確認を失っていればraw fieldへ触れずroot側だけで拒否 | pin3参照空・試行falseを保持。route開始済みなら再sequence不可 |
| call到達後・receiver試行前 | source pinCall=true、root側call位置・返答未確認 | 試行falseならその事実のみ。callerから「pinなし／解放済み」を推定しない |
| receiver attempting／issued／captured | 元source・root位置、元first／生成事実 | 最後のpinStage・捕捉済みissued/current・初回rejected、初回pin失敗位置。clear／試行返却なし |
| receiver confirmed後・caller返答／BP04失敗 | pin結果未受理と元source failed・claim unusedを区別 | confirmedと元参照を保持。source失敗を理由にpinStageをfailed／emptyへ置換しない |
| preparing確定後／held後close・配送失敗 | 確定到達履歴・先行pin first／位置、停止／配送を別に記録 | 正規pin・空payload・試行済み。再pin／再prepare／別source補完なし |

closeは(B)の順序を維持し、固定返答cacheより前にroot停止を単調に記録し、metadata確認済みの元issuedだけへ同期反映する。生成時scalarをpin位置へ上書きせず、pin側の固定位置writerを選ぶ。未確認source・別current／rejectedへ触れず、source first／初回失敗位置があれば保持する。失敗だけでclose履歴を作らない。

同start側は各新規試行・格納・確認の前に正規root停止と正規source stopを確認する。closeはreceiverのpin解除・新first強制書込み・payload補修をしない。pinStageやconfirmedは保持prefixで、停止はroot／sourceの別軸である。callee実行中のcloseは次の固定guardで停止し、通常処理へ戻らない。旧start.close／request／drain・回収／field clear／Journalへ迂回しない。

root共通firstへの写像はbinding不一致→binding_mismatch、状態不正→state_invalid、停止→closed、callee捕捉／復帰／全post未確認→construction_unconfirmed。source pin firstには既存receiver_unconfirmed／post_unconfirmedを使えるが、旧ProbeRunFirstへ増やさずroot側で写像する。source failurePhase／boundaryにはcaller側BP位置、receiver failurePhase=pin・bodyPinFailureStepにはcalleeの実位置を残す。先行生成失敗があれば(C)へ入れず、sourceFailureRecordedをpin失敗で新たにtrueにしない。

初回receiver rejectedの保持は、正規root／同startを確認済みの試行でcurrent候補が不一致になったときだけ。当該startの元issuedを維持し、rejectedを以後の候補で置換しない。異なるstartへの侵入拒否で相手のslotを「診断のため」に使わない。全保持は未解決の解放責務であり、cleanup証拠・借用退役／root終端成功ではない。

## 7 公開診断と旧契約の維持

将来の開発専用model案はwfb-body-private-pin-1、正常disposition案はsource_pinned_unready。常にok=false／authority=none／execution=closed／formalIssuance=closed／wholeRunAdmission=disabled／implementation=unknown／investigations=on_hold。既存(B)のmodel／返答・export期待値をpin成功に読み替えない。実装時に新factoryを足す場合もpackage除外の固定合成入口だけとし、runtime friendを共有しない。

projectionは生成区分、root pin区分、receiver pin区分、停止／配送／refusalを分ける。位置／stage／firstはallowlist、booleanはstrict比較。不在sourceの7診断軸もnot_created、発行済み未確認はunconfirmedという`b3776da`の訂正を維持する。metadata確認済みでもsource failedとpin confirmedは同時に表示し、成功booleanへ畳み込まない。参照保持／同一性の値は診断に限り、復元・再開資格にしない。

source／custodian／start／shell／pin参照・private brand／owner由来値・raw例外／message／stack／cause・任意keyを出さない。未確認候補のkeyを列挙して診断を作らない。失敗返答は同一参照をcacheし、後からcloseでfreeze済み返答を更新せずinspectの別値で停止履歴を示す。正常返答と違い、失敗後は再配送・再生成を試みない。

## 8 追加費目・共有範囲とUnknown

費目は同構築root／元frame ownerに帰属する。新たに数える論理操作は、pin用先行scalar／返答参照、BP02の両側preflight、private発行元照合、1回の固定call、receiverの試行記録・issued/current保持・各固定検査、BP04 pre/postとpreparing代入、停止／失敗保持・固定projectionである。既存BS／source literal生成・metadata9固定化／seal・既存owner／use／duty／payload6参照を二重計上しない。

PC01〜10は操作種別であり実call／guard数・単位係数ではない。22key検査／13carrier／9先行参照／6payload参照の有限走査と固定位置だけを使い、任意長履歴・再帰graph照合・再試行探索を禁止する。固定callbackなしの照合でも関数callや診断返答の実allocationが0とはしない。実E／S・layout／GC／OOM・実予算／cap・停止後解消予約・全体work上界はUnknown。実予算更新・新期限・残時間からのdeadline再計算は行わない。

## 9 独立合成受入条件（すべて未実施）

| ID | 必須条件・負の対照 |
|---|---|
| CP01 | 旧(B)の未pin保持・BP00〜01再検査7対照／enumerable2対照・不在7軸、旧field／seed／live／bundleの期待値とcompiled対照が不変 |
| CP02 | 正規BP01後だけ(C)へ入り、第2prepare／返却済みheld／失敗／停止／未確認sourceから再開できない。生成位置・固定化数・metadata確認はpin中不変 |
| CP03 | root／source／start／binding／link／duty／control／shell／failureの個別混入・copy／Proxyを各最初の検査で拒否し、未知hook=0。bindingOwnerとcellOwnerの誤統一も検出 |
| CP04 | 旧「全9参照空」の流用が正規pin後を拒否する対照、逆のOR緩和が不正phase／spent／occupiedを通す対照を別に持つ。4安定区分と段階別節の単独感度を確認 |
| CP05 | PC01〜10の許されたbefore／afterとcallee各保持prefixでthrow／close／再入。root call到達、receiver試行、issued/current/confirmedを独立oracleで区別 |
| CP06 | source pinCall記録→固定callとreceiver attempt記録の同期区間にhookなし。二重試行・失敗後再試行で元prefix／sourceを壊さず、call／格納最大1を確認 |
| CP07 | root生成失敗位置は(B)のまま、pin初回位置とreceiver実位置を別に保持。先行理由あり→後続別位置故障／closeの非等価対照で上書きを検出 |
| CP08 | receiver confirmed後のthrow／返答異常／BP04 post拒否／closeでconfirmedと両参照を保持。acceptedだけでpostを飛ばす変異、pin解除・第2source補完を検出 |
| CP09 | 同source再入／重複はrefused_existing。foreignはrejected_attemptで相手の試行／pin／first／payloadが不変。拒否をacceptedや正規元処理failに変換する変異を検出 |
| CP10 | 失敗cache後closeでもroot停止を先に記録し、元確認済みsourceへ同期反映。未確認／別候補への書込み・先行first／返答同一性破壊・生成位置誤記録を検出 |
| CP11 | BP04正常はpreparing／unused・pin confirmed・payload空／free・BC00／grant／duty消費／body／ready／正式証拠0。後段への自動継続を負の対照にする |
| CP12 | semantic compile-failで不正phase組・readonly metadata書込み・spent型／別pin型／外部private呼出しを拒否。runtimeの同値copy拒否と型拒否を混同しない |
| CP13 | 固定公開schema・全allowlist／strict boolean／freeze／有限graphと秘密非出力、配送失敗後保持。未知値echo・raw例外・summaryからの復元口を検出 |
| CP14 | fixture梱包混入0・旧配布設定／API維持、実接続／runtime台帳共有なし。新論理費目と既存費目の重複なしを確認し、E／S／全体上界はUnknownのまま |

oracleは本体のbuilder／状態表／checker／counterをimportしない。固定semantic event列からroot route、callee prefix、生成事実、call／試行と元参照の保持を別に計算する。guardの単一注入と除去で最初の拒否位置／call／保持が変わることを確認し、後段失敗・anchor消失・別対照への注入不一致だけをkill成功に数えない。重複防御・等価／到達不能・観測不能な節は根拠と範囲を記録する。`b3776da`の等価評価を新しいpin履歴へ自動移植しない。

## 10 将来の実装単位と今回の文書検証

別承認後の順序案は、C-01＝内部型／先行scalar・安定／段階別checker・固定診断、C-02＝BP02〜03の固定private call／同start捕捉・停止／失敗保持、C-03＝BP04の全postと閉鎖保持、である。C-01では試行／格納を行わず、C-02だけでは正常保持へ昇格しない固定停止を維持する。C-03まで進めてもBC00・claim消費・bind・構築ready・body起動は別承認に残す。

今回は本書と親2文書のMDだけを変更する。ローカルリンク・表列数・PC01〜10／CP01〜14の順序、生成用有限型とpin位置の分離、同root／同startと停止／保持条件、差分空白を文書として確認する。ソース／試験／CHANGELOG／manifest／lockfile／設定は変更せず、build・合成／compiled試験・梱包操作は行わない。上表は全て未実施であり、設計の整合確認を実装・受入成功にしない。本書作成時点ではindex登録・コミット・Pushなし。

文書検証結果：本書と親2文書のローカルリンク24件に欠落なし、21表の列数・末尾改行／空白に異常なし。本書の10節、PC01〜10・CP01〜14の順序／重複／欠落を確認した。現行ソースを読み取り、metadata9key＋進行13field、生成用phaseがnone／BP00／BP01に限定されること、現行failure writerが生成位置を使うことを照合した。作業中差分はこの3つのMDだけで、実装・試験・CHANGELOG・設定に差分なし。これは文書整合の確認であり、将来の(C)実装・pin受入の成功ではない。

## 11 C-01：内部契約・readonly入口検査と固定診断（2026-11-11）

package除外の同composition fixtureにcreateProbeBodyPinContractsFakeを追加した。固定合成script以外を受けず、APIはprepare／check／checkLegacy／close／inspectの5つだけ。model=wfb-body-pin-contracts-1、正常もpin_contracts_held／ok=false／authority=noneで、将来§7のsource_pinned_unreadyとは別である。同root／同startで既存BS→BP00〜01を再利用し、その同sourceを未pinのままreadonly検査して保持する。旧(B)factory・生成checker・返答は維持し、返却済み(B)rootの再開口は作らない。

rootへ将来のpin用13scalarと、C-01検査準備専用6scalar・空の返答参照を先行した。同startへpin操作位置／初回位置の2scalarをnoneで先行し、既存9参照・10scalarは変更しない。追加field initializerはliteral／undefinedだけ。rootのpin routeAttempted・state／位置・失敗位置・preparingConfirmed／postCheckedは全て初期値のままで、PC01の開始記録さえ実行しない。receiverのpinAttemptUsed／pinStage・expected-source3参照も書かない。

SourceProvenanceは元write-once issuedとの同一性をreflectionより先に確認し、生成来歴・全22key／descriptor・元root／shell／binding／link／duty／control／start／failureを照合する。BaseUnusedとStorageEmptyは既存の厳密なreadonly検査を再利用し、PayloadEmptyは6参照・free／empty／prefix noneを別に検査する。receiverのprivate primitive viewは同startからだけ作り、公開snapshotから復元しない。BP02 entry値checkerだけを同ownerに接続し、active保護frameと未停止・先行理由なし・root pin scalar全初期値も3位置で再確認する。

段階別値checkerはentry／callReady／receiverEntry／attempting／issued／captured／checked／confirmed／returned／pre／commit／post／heldの13個。各固定関数がsource／receiverの狭い組を検査し、caller指定の汎用phase文字列を受ける公開口はない。後段12個の正例はcompiled scratch内の原始値モデルだけで検証し、実source／receiverへpin flag・格納・confirmed／preparingを書き込んで正例を作らない。この値検査の成功はpin来歴・実観測・資格証拠ではなく、C-02以降の同ownerへの接続を代替しない。

検査準備位置はnone／before／checked／after／heldで、BP02〜04の進行位置とは別。C-01検査失敗はこの位置と初回理由を保持し、既存sourceFailureRecorded／生成失敗位置や将来pinFailureRecordedを更新しない。sourceは確認済み元issuedだけをfailedにするが、粗いsource位置は未pinの最後のBP01／afterのまま。これをBP01の生成失敗と解釈せず、C-01 preparation診断を原因位置として読む。生成中の失敗は従来(B)診断のままで、C-01検査は未開始と投影する。

build区分は既存(B)projectionの再利用であり、そのfirstは共通root first、source.firstはsourceの理由である。生成失敗かどうかはfailureRecordedと生成失敗位置で区別し、build内の共通理由だけを生成失敗と読み替えない。

closeは(B)同様に固定返答cacheより先にroot停止／元確認済みsourceへの反映を行い、返答同一性・先行理由・検査準備の初回位置を保持する。未確認sourceには触れず、receiverのpin位置や格納を補修しない。新projectionは生成・検査準備・将来pin route・receiver pin位置を別に固定allowlist／strict booleanで出し、参照・brand・raw例外は出さない。チェック済みという診断値をreadyや再開資格にしない。

合成・compiled範囲と初回RED／試験側訂正は[C-01検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CONTRACTS_2026-11-11.md)。CP01〜04／07／10／12〜14の該当部分だけの確認で、CP表全体・PC01〜10の実操作成功ではない。複製したprivate slotをscratchで故障させる対照はguard感度用であり、任意private-slot改竄に対する発行来歴の証明ではない。実allocation／E／S／全体work・OOM配送必着はUnknown。C-02／C-03、pin試行・格納・claim消費・bind・構築ready・body起動・正式発行・実接続は未接続、全体受付無効・調査保留を維持する。

## 12 C-01の等価・観測不能な節（2026-11-11、`86d2560`レビュー）

`bodyPinContractsMatch`の`#closed === false`と`#failure.first === 'none'`は、直前の`bodyPinContractsPoint`末尾の停止guardが同条件で先にthrowするため到達できず、等価と判断した。`#ready === false`は、C-01の閉鎖経路にreadyを立てる経路がなく観測不能である。receiver値の`issuedSame`／`currentSame`は、entryでは`issued`／`current`がfalseであることに含意されるため、entry単独では等価である（後段variantの区別には必要で、値checker側の単独除去対照は維持する）。

これらの判断はC-01の閉鎖準備だけに限る。C-02以降でpin試行・格納・ready経路を接続するときは、同じ節を改めて単独対照で評価し、本節の等価判断を自動移植しない。

## 13 C-02前半：private caller資格・開始予約とpin失敗（2026-11-11）

新しいpackage除外factory createProbeBodyPinStartFakeは固定scriptだけを受け、prepare／check／checkLegacy／close／inspectの5methodを公開する。同constructorで選択した固定継続がBS→BP00〜01→C-01のreadonly準備を同active frame内で再利用する。元root／issued=current source／同startをprivate引数として直接照合し、外部context・summary・callback・cap／registryは受けない。bindingOwnerとcellOwnerの別々の正規関係を維持する。

callerの拒否順は元参照の同一性／来歴→停止／先行理由→同sourceのbusy／開始済み→初回entry全条件。foreignは候補のfield・getter・ownKeys・prototypeを読まず無書込み拒否し、外側固定継続だけが自分の失敗を記録する。同source再入はroot専用refusal=in_progress／duplicate_pinで、元source／receiver firstやC-01診断を更新しない。entry初期値の検査は正規in_progress履歴だけを許し、C-01の全初期値checkerは変更しない。

rootへ10原始scalarと空reply参照を先行する。start用busyはfinallyで必ず解除するが、PC01のrouteAttempted=true／running／BP02／preflightと元sourceのBP02／beforeは返却しない。同区間は同期の直接代入だけで、hook・await・新carrier生成を挟まない。これはrootのsequence開始予約であり、receiver pinAttemptUsed・sourceの利用claim・新しいgrantとは別である。

PC02はsource initializing／unused・未call、receiver全空と安定条件をBP02／before、checked後、最後のblocked境界で検査する。blocked境界でも最後のPC02 route boundary=afterを維持してcallReady全条件を再検査する。固定call直前の遅延混入をContextMatchesだけで受け入れない。固定停止はmodel=wfb-body-pin-start-1／pin_call_not_connected／ok=false、first=construction_unconfirmed。callBlockedはこの最後の検査を通った診断であり、pin成功・資格証拠・source_pinned_unreadyを意味しない。PC03固定call／receiver格納は0のまま。

pin側の失敗はrootのBP02／preflight／before又はafterに加え、identity／entry／started／preflight／blockedの詳細位置を保持する。確認済み元sourceだけにfirst／failedとBP02の粗いbefore／checkedを反映し、生成履歴BP01／after・sourceFailureRecorded=false、C-01 held／checked／preparationFirst=noneを変更しない。失敗後closeはcacheより先に元sourceの停止を同期記録し、pinの先行理由・初回位置・開始予約・返答同一性を保持する。開始前closeは従来どおり停止のみでfirst未記録。保持はcleanup／解放確認ではない。

compiledは実root同士の混入・停止優先順・phase値13fieldを4境界で壊す対照、active frame／C-01履歴・caller確認、各再検査の除去、初回位置保持、private型拒否を区別する。旧C-01 compiledのmodule全体「pin関連書込み0」は、新callerの4固定method・caller fieldへの15直接代入箇所だけを明示許可する。C-01／receiver／payload／source利用claimへの禁止は継続し、新compiledは開始予約のwriterが1箇所・trueのみであることを確認する。静的代入箇所数は実work費用ではない。§12の等価判断を新履歴へ自動適用せず、全guardの単独感度・任意private-slot改竄安全性を主張しない。

詳細なRED／GREEN・試験側訂正と結果は[C-02前半検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_START_2026-11-11.md)。残りはC-02後半のPC03〜08固定call／同start捕捉、C-03のBP04全post／閉鎖保持である。claim消費・bind・構築ready・body起動・正式発行・実接続は未接続。実allocation／E／S／全体work・停止後解消予約・OOM診断必着はUnknown、全体受付無効・調査保留を維持する。

## 14 C-02前半の等価・観測不能な節（2026-11-11、`4f70522`レビュー）

`bodyPinStartContextMatches`の`#closed === false`は、各呼出しの直前にある`bodyPinStartPoint`末尾の停止guardが同条件で先にthrowするため到達できず、等価と判断した。`#started === true`は、prepare冒頭で`#frame`と同時に立ち、以後戻す経路がないため、`#frame === true`が成立する限り観測不能である。

この判断はC-02前半の固定停止経路に限る。C-02後半以降で固定call・格納・再開経路を接続するときは同じ節を改めて単独対照で評価し、§12・本節の等価判断を自動移植しない。

## 15 C-02後半のcall・receiver試行／格納の差分設計（2026-11-11）

[固定private call・receiver入口の接続差分設計draft-0.1](BEST_PRACTICE_WFB_BODY_PIN_CALL_RECEIVER_DESIGN.md)で、PC03の同期callとPC04〜07の一度限り試行・元sourceのissued/current捕捉を対に具体化した。信頼済みroot anchorはlexical thisからだけ供給し、module-private固定accessでrootの実発行slot／同start／call区間を照合する。未知候補からrootを探索せず、公開資格・callback・registry／friendを作らない。

callActiveとreceiver entryBusyを別の先行scalarとし、前者のcall区間／後者のpreflight再入と、返却しないcall／attempt履歴を分離する。BP03 caller位置とreceiver実位置を別writerで保持し、issued／captured／confirmed後のthrow・closeでも参照／試行prefixを巻き戻さない。旧9参照全空checkerをpin後に流用せず、安定部分と狭いphaseの固定検査を使う。

本節と差分設計は文書だけ。現在の実装は引き続きC-02前半のPC02固定停止までで、call・receiver試行／格納・新field／access、PC08復帰照合、C-03のBP04は未接続。CE01〜14は未実施で、§12／14の等価判断を後半へ自動移植しない。正式発行口閉鎖・全体受付無効・Unknown・調査保留、実装・実接続・実通信・設定変更・Push禁止を維持する。

## 16 call／busy内部型・readonly bridge・診断写像の限定接続（2026-11-11）

[call・receiver差分設計§13](BEST_PRACTICE_WFB_BODY_PIN_CALL_RECEIVER_DESIGN.md)と[今回の検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_BRIDGE_2026-11-11.md)の範囲だけを合成依存限定で実装した。新factoryはPC02最終検査までを同prepareで再利用し、module-privateな元root／source／startのreadonly照合を行ってpin_bridge_not_connectedで止まる。root callActiveとreceiver entryBusyはliteral falseの先行fieldだけで、trueへのwriter・固定receiver callはない。

calling／returnedの値契約とBP03 caller／sourceの境界写像の正例は純粋な原始値試験だけ。実ownerをactive／pin済みに偽装して受入成功にしない。新診断writerはroot実位置の写像を読み、前半用のbefore／afterとsource before／checkedの軸を混同せず先行診断を保持する。内部busyは原値、公開診断はstrict booleanに分けた。旧C-01／前半の禁止は新writerの6caller診断fieldに限って拡張し、receiver・source claim・payloadは未書込みを維持する。

§15の文書のみと本節の未接続状態は各作成時の記録。最新範囲は§17で区別し、CE全体は未受入。全体受付無効・Unknown・正式発行口閉鎖・調査保留を維持する。

## 17 固定call・receiver入場と参照格納前の固定停止（2026-11-11）

[call・receiver差分設計§15](BEST_PRACTICE_WFB_BODY_PIN_CALL_RECEIVER_DESIGN.md)と[固定call検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CALL_2026-11-11.md)の範囲だけを新しい合成factoryへ接続した。同constructorのPC02最終確認から元source／同startをprivate固定bridgeへ渡し、直接call記録→callee入場の間にはhook／guard／awaitを挟まない。旧factoryは未活動のまま、旧返答・期待値を変えない。

receiverは同一性・停止を先に確認し、既存busy／試行履歴は元prefixを変えず拒否する。entryBusyを自分のfinallyで解除し、preflight前後の全検査後に一度だけattemptingへ進むが、9参照は空のままreceiver_unconfirmedで止まる。caller finallyはcallActiveだけを解除する。利用claim・bind・PC08 returned確認・C-03・構築ready・bodyは未接続である。

BP03 callerのbefore／primitive復帰後after、sourceのcall境界、receiverのpreflight／attempt位置、生成BP01診断を分離する。receiverの既知失敗理由は上位へ保持し、初回理由・返答cache・試行／call履歴はcloseや再入で返却しない。合成43件とcompiledのlive区間／finally／無書込み混入／27field phase接続・型拒否等を記録し、参照捕捉成功やCE全体の受入にはしない。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

## 18 参照格納・全確認と復帰後確認未接続の差分設計（2026-11-12）

[同start参照格納・PC08未接続停止設計draft-0.1](BEST_PRACTICE_WFB_BODY_PIN_STORAGE_RETURN_STOP_DESIGN.md)でPC05〜07と、PC08未接続時の固定停止を対に具体化した。元rootがsource所有権を保持し、同startの既存issued/currentへ同じ参照を一度だけ保持する。初回rejectedは同試行で捕捉済みの不一致候補に限り、foreign入場を相手の保持slotへ書く根拠にはしない。

格納後のphaseに初期全空checkerを流用せず、元来歴・停止・未使用base／空BS／空payloadと実参照を狭い段階で照合する。checked／confirmed・保持prefixと現在境界を分け、catch・close・配送異常でも元参照と初回理由／位置を保持する。既存の等価判断は複数段階・新writer・異なる上位／callee理由が成立する条件で再評価する。

新しい閉鎖合成入口の案は格納前固定停止の既存call入口とは別にする。calleeが通常完了してもPC08を接続せず、rootはBP03／call／after・sourceはcall境界のままconstruction_unconfirmed／pin_return_not_connectedで止める。receiverのconfirmed／first noneを失敗へ巻き戻さず、preparing／BP04／構築ready／bodyへ進めない。

本節は差分設計で、[子設計§13](BEST_PRACTICE_WFB_BODY_PIN_STORAGE_RETURN_STOP_DESIGN.md)の狭い状態型・先行境界・格納前準備だけを合成限定で実装した。[準備検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_STORAGE_PREPARATION_2026-11-12.md)のとおり格納後7状態は値専用で、実参照格納・source claim消費・payload借用／bind・PC08・C-03は未接続、SE全体は未実施。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実接続・実通信・実機操作・設定変更・Pushは行わない。

## 19 格納writer・private実参照照合と初回rejected保持の接続差分（2026-11-12）

[同issued/current格納・初回rejected保持の差分設計draft-0.1](BEST_PRACTICE_WFB_BODY_PIN_REFERENCE_STORAGE_DESIGN.md)で、同R/S/Tへのprivate供給、固定同期群、実slot照合、失敗prefixと元slot／未確認責務を対にした。§18の全確認を一括で進めず、新中間到達点はcaptured／step currentまでで固定拒否する。confirmed・最終post・accepted・PC08・BP04／C-03は未接続のままとする。

rejectedはforeign入場の受け皿ではなく、正規試行で既にcurrentへ捕捉した不一致候補の初回保持だけとする。保持済みと保持post確認済みを分離し、close／後発throwで元参照と初回診断を捨てない。receiver／caller／sourceの位置・firstを別軸で保持し、finallyは既存busyだけを解除する。等価判断は前段の条件を明示したまま新実経路で個別に再評価する。

本節は参照追加だけで、新mode・実格納／rejected writer・保持確認scalarは未実装、受入条件は未実施。旧入口と格納前準備の挙動・期限は変えない。正式発行口・body起動閉鎖、全体受付無効・Unknown・調査保留を維持する。
