# WF-B：(C)最終post・内部accepted返却・PC08未接続停止と返答cache所有の差分詳細設計

Version: draft-0.2 / Date: 2026-11-12 / 設計読み取り基準HEAD: `7343af3ec1befe854326d43a32fbfbe833be692f`（レビュー`7eb7b9b`を維持）。§15の(C-a)限定実装基準HEAD: `8e3f043140ba3f824c507ebd9ad57d782aa89570`。

Status: **§15の(C-a)狭い型・先行scalar・seal／単一cacheの閉鎖契約だけ合成実装。C-bの全入口routing／実公開、C-cの最終post・accepted返却は未接続。** 親は[確認・返却設計](BEST_PRACTICE_WFB_BODY_PIN_CONFIRM_RETURN_DESIGN.md)と[格納・PC08未接続停止設計](BEST_PRACTICE_WFB_BODY_PIN_STORAGE_RETURN_STOP_DESIGN.md)。実績は[(B)検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CONFIRMATION_STAGES_2026-11-12.md)と[(C-a)検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_FINAL_CONTRACTS_2026-11-12.md)。本書は親のFC06〜09／FE05〜12を、現在の(B)と診断／cache実装からの差分として具体化する。既存の[private pin全体設計](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)のPC08／BP04／C-03は接続しない。

合成依存限定。正式発行口・既存C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。§1〜14はdraft-0.1の将来接続契約・当時の検証履歴であり、今回の実装を示すのは§15だけ。実接続・実通信・実機操作・設定変更・Pushは行わない。

## 1 現行との差分と限定到達点

現行(B)のcreateProbeBodyPinConfirmationStagesFakeは同owner上でchecked／confirmedと各post・blocked再照合まで進み、receiver_unconfirmed／rejected_attempt、root construction_unconfirmed／pin_final_post_not_connectedへ固定停止する。最終markerのwriterは0。callerはacceptedを一律state_invalidとして拒否する。

| 境界 | 現行(B) | 新(C)案 |
|---|---|---|
| calleeの終端 | confirmed／after・中間post2個true、最終marker false・first receiver_unconfirmed | 最終post成功時だけconfirmed／after・最終marker true・first none、literal accepted |
| caller | accepted一律拒否、正常もcallee失敗を保持 | Cだけ実primitiveと同Tの原値を分類し、PC08未接続停止。旧modeは一律拒否を維持 |
| 上位正常停止 | pin_final_post_not_connected | pin_return_not_connected／construction_unconfirmed／ok=false |
| 返答所有 | generic #fixedとmode別cacheに別objectが入り得る | Cの終端objectは元rootの#fixedだけ。mode別cacheへのcopy／別object生成なし |
| 外側frame | prepare内で返答を生成し、その後finallyで#frame=false | 内部保持と公開を分離。外側の実復帰を確認するまで終端cacheを公開しない |

新入口案はpackage除外のcreateProbeBodyPinConfirmationFake／wfb-body-pin-confirmation-1。constructor固定のfresh合成modeとし、既存(B)の成功したblocked再照合の直後、receiver失敗記録の**前**だけから分岐する。Bの失敗済みinstanceの再開、first解除、既存markerの意味変更、試行／sourceの再発行はしない。

acceptedはcalleeの内部完了通知にすぎず、正式証拠・source利用資格・PC08受理・run成功ではない。新(C)でもsourceは元rootに保持したままfailed／claim unused、receiverの正常完了と上位未接続停止を併存させる。preparing／BP04・BC00・構築ready・payload借用／bind・bodyへ進めない。

## 2 同owner・同参照と二つの返却境界

Rは元CanonicalGateDraftRoot、Sは元正規source、Tは元binding.target.start、I/C/JはTのexpected-source実slotとする。Rのissued=current=S・rejected不在、元shell／binding／link／duty／control／rootFailure、sourceのmetadata9／進行13fieldを保持する。bindingOwnerとcellOwnerは各元関係で比較し、同一objectへ統合しない。RがSを所有し、TはI/Cの借用と既存Jの保持責務を負う。CはJを追加しない。

返却境界を二段に分ける。

- 内側：Tのliteral acceptedが既存receiver wrapper／dispatcherを通り、Rの実call-result fieldへ代入されること。最終markerだけでは実復帰を証明しない。
- 外側：Rの固定prepare等が実際に戻り、元root frameが非活動であることをC専用public wrapperが確認してから、閉鎖返答を返すこと。内部cacheの存在だけでは公開可能としない。

busy=false・frame=falseはそれぞれの固定finallyの事実であって、参照解放／cleanup証拠ではない。値を補完して退出確認にしない。内側の退出異常を閉鎖返答で報告することと、外側の復帰未確認cacheを公開しないことも別である。

## 3 狭い型・先行scalarと返答の値契約

既存BodyPinConfirmationStateのbefore_final_post／post_returningを使うが、両方を実操作へ自動昇格しない。C専用の活動型は同R/S/T・元call／trialに閉じ、before_final_postでconfirmed／step confirmed／境界before・最終marker falseを要求する。post_returningはG_P直後の到達記述であり、追加checkerを呼ぶphaseではない。

| 内部状態案 | 先行初期値・所有 | 意味／writer限定 |
|---|---|---|
| C constructor mode | false／固定literal、R | 旧A/Bから切替不能。fresh入口だけtrue |
| 最終marker | 既存Tのliteral false | 最終post成功後のG_Pだけtrue。中間post2個と別 |
| final現在点／初回点 | none、R | none／final_post_beforeだけ。正常な上位未接続停止をcallee最終post失敗点へcopyしない |
| completion分類 | none、R | completion_observed／rejected／refused／unreturned／inconsistent等の有限値。資格ではない |
| terminalSealed | false、R | 終端診断を固定済み。first noneで確定する開始前closeも区別する |
| terminalDisposition | none、R | 診断固定時に1回だけ決定。返答生成や後発closeから作り直さない |
| replyPhase | empty、R | materializing／private_cached／replayable／failed_empty／failed_cached |
| publicEntryBusy | false、R | 固定public wrapperの入場予約。同じ入口の復帰確認／公開だけに結合し、別methodの復帰を代用しない |
| rootEntryExit | not_observed、R | 上の入場を所有するwrapperだけが同root固定入口の実復帰／throwを記録。公開値から供給しない |
| deliveryFirst | none、R | view_unconfirmed／root_exit_unconfirmed／input_refused／reentrant_reply等の有限な後発軸。操作firstと別 |
| #fixed | 既存の空参照、R | C終端返答の唯一の保持先。新C用の第2cache／owner／結果tokenを作らない |

宣言位置は既存root／startのconstructor処理・部分生成より前とする。新source key・利用claim・Pin objectは追加しない。物理表現の厳密な型／writer一覧は将来の最初の実装でcompiled監査へ固定する。JS object自体やconstructor初期literalの確保失敗、factoryをユーザーへ返す前の失敗、OOM時の診断必着はUnknownのまま。

C終端返答は自前の既知plain object・shallow freezeで、strict 10項目だけとする。model=wfb-body-pin-confirmation-1、ok=false、disposition=固定allowlist、first=既存有限RunFirst、authority=none、execution=closed、formalIssuance=closed、wholeRunAdmission=disabled、implementation=unknown、investigations=on_hold。終端dispositionはpin_return_not_connected／closed／input_rejected／binding_mismatch／state_invalid／construction_unconfirmed／internal_unconfirmedの7値。正常未接続のfirstはconstruction_unconfirmed、未知値はinternal_unconfirmedへ写像する。非終端viewはnot_ready／blocked_frame_execution／construction_in_progress／deferred_frameの別4値で、終端cacheへ入れない。Error／message・生参照・owner／brand・source値を入れない。

## 4 最終postの検査順・固定schedule

FRC01〜09は有限な操作種別であり、全guard数／実費ではない。sourceの位置はBP03／call、claim unused・bindCallReached=false／postConfirmed=falseのままにする。

| ID | 固定操作 | 直後の事実 |
|---|---|---|
| FRC01 | 同fresh C modeのB blocked再照合成功直後、失敗writer前からprivate最終継続へ | 中間post2個true、B中間履歴true、I=C=S・J空、最終false・receiver first none |
| FRC02 | Tの現在境界をbeforeへ記録し、final_post_beforeだけを観測 | confirmed／confirmed／before。最終post未完了 |
| FRC03 | 下記順序の最終checkerを1回実行 | 成功でもまだmarker false |
| FRC04 | G_P：境界after→既存最終marker true、直ちにliteral accepted | post_returning。receiver診断は初期値のまま |
| FRC05 | 既存同期wrapper／finallyをそのまま復帰し、実primitiveをRへ代入 | 実代入できた場合だけcallPhase returned／caller境界after |
| FRC06 | 原始値によるC専用分類→非割当て診断固定→terminalSealed | PC08未接続停止又は元失敗を固定。source失敗とcallee履歴を別に保持 |
| FRC07 | 1回だけ返答を生成・freeze→G_Cで#fixed／private_cachedへ保持 | まだ外部公開不可 |
| FRC08 | 元root入口の実復帰とframe=false、同private cacheの戻りをC wrapperが確認 | 失敗なら保持だけ、公開しない |
| FRC09 | 同public入場の最後の公開guard→自分のbusy解除／replyPhase replayable→同#fixedを直接return | 閉鎖返答の再読だけ可能。PC08／実行資格なし |

最終checkerは、(1)固定C modeと最小R/S/T同一性、(2)元metadata／source発行来歴と各owner関係、(3)元frame／running／BP03 call before・callActive／entryBusy、(4)root/source停止・先行firstなし、(5)未使用source／空BS13carrier・payload6参照／free・empty・prefix none、(6)既存trial・I=C=S／J空・hold not_started、(7)中間post2個とB再照合履歴の原値true、(8)confirmed／step confirmed／境界before・最終marker原値false・全receiver診断初期、の順に照合する。未知候補を反射探索せず、候補の値fieldより同一性を先に判定する。

同値copy・正しい値view・公開sameReference／post=trueからの昇格は禁止。最終post中にsource利用claimを消費したり、I/Cを再格納したりしない。失敗は到達済みconfirmedと中間postを保持し、final=falseのまま固定拒否する。現行B matcherはbefore_final_postを受けないため、その許容phaseを一括拡大せず専用境界を作る。

## 5 G_Pからprimitive復帰までの非介在

最終checkerのtrueからG_P・literal returnまで、追加checker／projection／Object.freeze／reply／clock読取り／script／通知／callback／awaitを挟まない。G_Pは既知Tの直接代入2個だけで、群中故障checkpointやmarker=true後のpost_afterは作らない。

receiver入口finallyは元entryBusy=false、dispatcher finallyは元callActive=falseだけを行う。中間wrapperはprimitiveを変換・複製・再消費せず直接返す。新C modeのfinallyでもsource診断・参照clear・cache生成・任意退出callbackを入れない。literal acceptedの実代入前に離脱したら結果はnoneのまま。marker=trueからacceptedやbusy解除を補完しない。

finallyへのthrow／返値差替え、G_P間への呼出し混入は局所compiled負の対照だけで行う。実装へ配送故障hookを追加しない。これは同期的非介在であり、OOM／process停止に対する物理atomicityではない。

## 6 C専用callerと診断seal

旧A/Bのaccepted一律state_invalidは変えない。Cだけconstructor固定mode・実固定call数・実call-result・同Tのprivate最終marker／first原値を使ってcompletion_observedを記録する。既存completed_value_onlyタグ又は公開診断を実完了資格へ読み替えない。

| 実状態 | Cの処理 |
|---|---|
| accepted・call=1・同T final原値true・receiver first原値none | 内部完了通知を観測。上位はpin_return_not_connectedで停止 |
| acceptedだがcallなし／marker不正・false／receiver先行理由 | binding又はstate不整合で拒否。先行理由を保持し、履歴を修復しない |
| rejected_attempt | 実receiver理由とroot/source先行理由を各軸に保持。receiver_unconfirmedだけをroot construction_unconfirmedへ写像 |
| nested refused_existing | 元試行へ混ぜず、refusal軸へ。第2call／再pinなし |
| throwでcall-result未代入 | unreturned。caller beforeを保持し、callee final=trueでも復帰済みにしない |

実primitive代入→caller現在位置記録→分類→診断固定の間にallocatingなbodyPinValues／position object／replyや任意観測を挟まない。call=0／target未生成ならreceiverを読まず、当該callの既知target以外を読まない。

正常完了通知ではreceiver first／失敗位置noneを維持し、root first construction_unconfirmed・pin初回位置BP03／call／after、call側sourceReason construction_unconfirmedを固定する。metadata確認済みかつ元Sがissued/current双方と同参照である場合だけ、source first noneならconstruction_unconfirmed／failurePhase BP03／boundary call、state failedへ記録する。既存source first／位置は不変。未確認又は混入sourceは読まず書かず、元rootが未確認責務を保持する。

非割当てwriterは元rootの先行診断slotを使い、正規phase／step／before-afterの組だけを記録する。不正な組は全noneへ写像し、既知位置を捏造しない。最後にterminalDispositionとterminalSealedを直接固定する。seal後はfirstがnoneでも確定値であり、後発入力／close／返答失敗で再選択しない。操作first・sourceReason・callee first・deliveryFirstは相互copyしない。

先行診断記録と終端sealは別である。callee／private call中のclose・priorは、rootの先行理由・実caller位置と確認済みsourceの停止を非割当てで先に残すが、その場でC終端をseal／materializeしない。実primitiveを分類する元callerが戻ってから、sourceReason等を完成させてsealする。これにより「close時のcaller before」と「後の実復帰after」を分け、未観測のcall結果を凍結返答へ先取りしない。dispatch未開始の早期abort／開始前closeは、その元入口の固定終端位置だけがsealできる。

## 7 単一cacheの状態遷移・生成と公開の分離

C終端objectの所有者はRだけ、保持先は既存#fixedだけとする。Cでは#bodyPinConfirmationFixed／#bodyPinConfirmationStagesFixed等のmode別cacheを使わず、同内容objectを2個生成しない。旧A/Bのcache方式はそのまま残す。任意public objectを#fixedへ登録する口、legacy cacheからの後付けupgrade、別root cacheの採用は作らない。

| replyPhase | #fixed | 許す操作／次状態 |
|---|---|---|
| empty | 空 | 未開始の非終端viewは別扱い。seal済み終端要求だけがmaterializingへ1回移る |
| materializing | 空 | 同sealのstrict返答を1個生成・freeze。再入は拒否。失敗でfailed_empty |
| private_cached | 同C返答 | 元root内の保持だけ。実外側復帰確認後にreplayable、異常でfailed_cached |
| replayable | 同一返答 | 公開wrapperから同参照再読だけ。再生成・再prepare・再pinなし |
| failed_empty | 空 | 生成再試行不可。診断と元参照を保持し、固定の非公開エラー経路へ |
| failed_cached | 同C返答を保持 | 公開・再生成・別cacheへの移動不可。診断と未確認配送責務を保持 |

生成claimはmaterializingへの先行scalar遷移で消費する。資格は同public入場に属する固定終端位置からのprivate継続に限り、first非none／closed／公開値だけでは足りない。try/catchの再実行、generic failからの再帰、別public methodからの再materializationでも戻さない。候補はstrictな公開値だけを含み、resource／secret参照を持たない。freeze成功後のG_Cは#fixed=当該候補→replyPhase private_cachedの直接代入だけ。群内にscript／guard／allocationを挟まない。候補生成／freeze失敗時に元SやI/C/Jを捨てたり、cleanup済みと表示したりしない。

private_cachedは公開可能の証拠ではない。rootのprepare等は内部で返答を作った後に外側finallyを通るため、C専用public wrapperが**自分の入場予約に属する固定入口の実復帰**・root frame=false・戻り値===元#fixed・private_cachedを確認してからFRC09へ進む。publicEntryBusyはroot呼出しより前に予約し、その入場を所有するwrapper以外はrootEntryExit／公開phaseを書かない。root finally内等から別public methodが戻っても、元入口の実復帰へ代用しない。source全安定／実I/C/Jのreturned再検査はここで行わず、PC08を接続しない。内側のbusy／退出異常は診断として保持でき、閉鎖返答の公開を成功cleanupと混同しない。

外側入口がthrowすれば、raw frameがfalseでも復帰成功を補完しない。保持済みobjectがあればfailed_cached、なければfailed_emptyとし、deliveryFirstを初回保持する。外側wrapperは自分のpublicEntryBusyだけを解除し、root frameを強制falseにしたり、新たな解放処理を呼んだりしない。FRC09の最終guardから自分のbusy解除／replayable記録・同参照returnまでは直接代入だけとし、その後に動くpublic wrapper finallyを置かない。replayableは返答再読の内部条件であり、外部callerが実際に受信・保存したというackではない。

## 8 既存writer／readerのC専用分岐と早期失敗

今のgeneric #fixed ??= replyとmode別返答生成をそのままつないでは単一cacheにならない。Cでは以下を**全体で**閉じる。旧modeの条件・返答・期待値を変える共通置換ではない。

| 入口／場所 | C専用契約 |
|---|---|
| generic fail | legacyのallocating位置生成／replyより前で分岐。現在phaseの既知slotへ先行診断を固定。callee/private call中はseal／生成を保留し、その元callerが終端を所有する。早期abortは元固定退出位置でseal／単一materializerへ。未知sourceを読まない |
| generic reply／終端return | 終端ならC materializerへ集約。generic #fixed代入式で別objectを保持しない。非終端viewは終端claim／cacheを使わない |
| prepareの最初のcache読取り | C gateを先に通す。private_cachedを通常の#fixed存在だけで返さず、活動frameへの再入／再開始を拒否 |
| prepareのcatch | seal前の構築失敗は元phaseの診断へ。seal後の生成／配送throwはdelivery軸へ残し、fail／materializerを再試行しない |
| check／checkLegacy／inspect | C gateを再利用。非公開cacheから参照を抜き出さない。inspectは有限enum／保持有無だけで、実資格を返さない |
| close | cache読取りより先にroot停止を単調記録し、確認済み元Sだけへ同期反映。活動callee中は先行診断だけで終端を先取りしない。seal済み操作first／receiver first／cacheを置換しない |
| rejectInput／余分な引数 | seal前は通常のinput_rejectedを固定。seal後は独立refusal／delivery軸へ保持し、first noneを含む確定値やcacheを変えない |
| 公開factory wrapper | 元Rへの固定呼出し以外を受け取らず、同public入場の実復帰確認と公開を所有する。活動入場への別methodは公開しない。callback／foreign root／public receiptの採用なし |

早期失敗の範囲はadmission拒否、部分構築、BS生成、source生成／metadata未確認、BP02 preflight、BP03 call前後を含む。source発行前はroot／生成診断だけ、metadata未確認なら元source保持責務だけを残してfield読取り／書込みを増やさない。source診断は確認済み元Sに限定する。元generationの初回位置をBP03の位置へ変換しない。既存root diagnostic slotを再利用し、別FailureOwnerや無制限の履歴を増設しない。

このroutingは現行に未実装。特にgeneric fail／catch／cache early-returnが1箇所でもlegacyに残ればC受入未達とする。既存初回guardだけで全phaseの非割当て診断が既に成立しているとは扱わない。

活動入場へ返すin-progress／deferred viewと、元入口が返すC終端objectも別である。内部stop通知が必要でも第2の終端objectを作らず、非終端の固定値経路だけを使う。現行の「first非none又はclosedなら終端cache」というA/B条件はCへ無条件に流用しない。

## 9 正常／失敗prefixと所有責務

| 位置／事象 | Tの履歴 | R／source／cacheの扱い |
|---|---|---|
| C分岐前のB失敗 | 元B prefix、final false | Cへ入れず旧診断／I/C/Jを保持 |
| final_post_beforeのthrow／close／prior | confirmed／before・中間post true・final false、元first | 元実位置を保持。G_P／acceptedなし |
| 最終checker不一致 | 同到達prefix・final false | I/C混入と欠落／不正状態を分けて拒否。修復・新Jなし |
| G_P後、callee primitive未復帰 | confirmed／after・final true、callee正常ならfirst none | result none／caller before／unreturned。元Sの資格を復元せず、退出不明を保持 |
| 実accepted復帰 | confirmed／after・final true・first none | root call afterでPC08未接続停止。元S failed／claim unused。診断後だけ生成 |
| inconsistent accepted | 実際のmarker／first・参照を保持 | state/binding拒否。markerやfirstを補完しない |
| 診断seal後、生成／freeze失敗 | 履歴・I/C/Jをそのまま保持 | failed_empty、再生成なし。first／位置は変更せずdeliveryを別記 |
| cache内部保持後、root finally／外側復帰失敗 | 履歴と実busy／frame原値 | failed_cached、cacheを所有したまま非公開。解放済み扱い・再公開なし |
| 公開済み後のclose／入力拒否 | callee履歴・borrowはそのまま | 単調停止・後発refusalだけ。同cache／操作firstを保持 |

source所有はR、I/C/Jの借用と未解決責務はTに残す。cache生成失敗・public wrapperのthrow・busy解除を本文破棄・借用退役・cleanup確認・root終端へ読み替えない。clear／最終discard／回収gateは別設計・別承認とする。

## 10 一度限り・非終端view・closeの例外境界

未開始check／checkLegacyのnot_ready／blocked等は閉鎖された非終端viewであり、#fixedへ保持せず、terminalSealed／materializingを消費しない。frame中のconstruction_in_progress／deferred_frameも新試行を許さない非終端拒否である。view割当ての成功や必着はUnknownで、非終端viewの故障を最終post失敗にしない。

開始前closeはfirst noneでも終端としてsealし、正常な外側復帰後は同閉鎖返答をcacheする。その後のprepare・余分な引数は開始せず、first noneをinput_rejectedへ後付け変更しない。input_rejected等が先行していればその初回理由を保持する。closeは返答再読より先に停止を反映するが、callee final trueの正常履歴にreceiver_unconfirmedを追加しない。

materializing／private_cached中の再入は公開gateで固定拒否し、別cacheを作らない。publicEntryBusy中のcloseは停止の単調反映だけを先に行い、元入場の復帰／cache公開を代行しない。非終端viewの正常復帰後に次の入場を予約するときだけrootEntryExitを初期化でき、seal済み／cacheあり／失敗済みの入場状態は払い戻さない。failed_empty／failed_cachedからのprepare・close・checkで再生成・再pinは行わず、公開返答を生成できない場合は固定のprivate delivery不明コードで離脱する。新Errorの生成・inspectの成功まで無割当て／必着と主張しない。生Error／messageは公開projectionや秘密出力へ流さない。

## 11 C全体の独立合成・compiled受入条件（C-a限定結果は§15）

| ID | 必須条件・負の対照 |
|---|---|
| FRT01 | 旧A/B・reference／storage／callの返答・prefix・期限・exportを維持。Cだけfresh分岐し、失敗済みBの再利用を拒否 |
| FRT02 | 最終post前の実I/C/J・metadata／owner・frame／busy・source first／stop・空BS／payload・中間post履歴・最終marker原値を個別故障。正しい値view偽装でも拒否 |
| FRT03 | 最終checker又は個々の重要節の省略で、最初の理由・到達prefix・最終marker・未実施suffixが変わる対照。型／構文エラーだけをkillとしない |
| FRT04 | G_P直接代入2個→literal acceptedとwrapper／finallyをASTで固定。追加call／allocation／hook／awaitの混入を拒否 |
| FRT05 | 正常CでT first none／final trueとroot/source construction_unconfirmedを併存。pin_return_not_connected／ok false、PC08／BP04／ready／bodyは0 |
| FRT06 | 最終観測のthrow／close／prior／再入を独立oracleで比較。confirmed記録・中間post・最終post・primitive実復帰の4事実を分離 |
| FRT07 | finally throw・返値上書き・callee省略・marker不正・第2callを局所compiledで注入。final trueでもprimitive未代入はunreturned、busyをfalseへ補完しない |
| FRT08 | root/source先行理由・未確認source・同値copy混入を個別確認。未確認候補のget／ownKeys／prototype hook 0、相手のfirst／slot不変 |
| FRT09 | 診断seal前にview／position／replyを作らない構造。非割当てwriterの直接代入と初回理由／位置／sourceReason／seal guardを単独対照で検証 |
| FRT10 | Cの全terminal writer／readerを列挙監査。早期admission／部分構築／metadata未確認／BP02／BP03失敗でも同じ単一cache方針。活動callee中のclose／priorが先行診断だけを残し、元callerの分類前にseal／生成しない対照。legacy generic cache混入を拒否 |
| FRT11 | 生成・freezeのthrowはfailed_empty、cache保持後の外側finally throwはfailed_cached。同owner参照・診断・責務を保持し、catch／再prepare／別methodから再生成しない |
| FRT12 | private_cachedを活動frame中／同public入場の実復帰なしで公開しない。別method・別rootの復帰／同値cache・root frameだけfalseの偽装で代用不可。返答同一性、G_C、公開guard直後のbusy解除／returnを確認 |
| FRT13 | 未開始checkはclaim未使用、開始前closeはfirst noneで終端cache。後発入力／closeで確定noneを上書きしない。replayableは同object、cache copy／upgradeを拒否 |
| FRT14 | semantic compile-failでprivate最終継続／marker writer／cache publish／source metadata更新、不正段階型、public projectionからの実資格復元を拒否 |
| FRT15 | 公開allowlist／strict boolean／有限凍結plain graph・秘密非出力、fixture梱包混入0。prototype／brand／raw参照を返さない |
| FRT16 | 旧レビューの一点注入・等価節を保持し、新段階で節感度を再評価。追加費目／固定走査・破棄未確認を記録し、Unknown・受付無効を維持 |

oracleは実装のschedule／builder／checker／counterをimportせず、固定原始eventと独立条件式で期待する。最終post区間へ通常hookを足さず、故障は許可観測点又は局所compiled注入だけで行う。前工程の2,992件／compiled30本の成功をCの受入成功へ算入しない。

## 12 等価判断・追加費目とUnknown

親の(A)15等価節・作業中(B)8等価節は元範囲の履歴として保持する。Cではcallerのfirst none、実accepted、未復帰final true、全phaseの共通cache、seal済みfirst none、外側復帰失敗が新たに生じる。特にdisposition分類、sourceReason写像、初回診断guard／trusted source、cache読取り順、mode／identity／観測点節は再評価し、旧等価を自動移植しない。独立した単独故障と共同偽装を区別する。

費目は元R/Tの構築／frame ownerへ帰属する。既存owner・Sの22key・BS13carrier・9参照・trial／call・中間post2scalar・最終markerを二重発行／二重計上しない。追加費目はC固定mode・先行有限診断／seal／返答phase／配送scalar、最終checkerの固定走査、G_P、primitive分類、C専用早期失敗routing、返答1objectの生成／freeze、G_C・外側復帰／公開guard・有限projectionである。非終端viewは終端cache1個の数に隠さず別費目とする。

任意長の履歴・retry探索・再帰graph・再読込・新clock／新deadlineは導入しない。既存開始時刻・全deadline・設定・本番capは変更しない。実E／S・unit係数・実layout／allocation／GC／OOM・全guard数／全体work上界・停止後解消予約・診断／配送必着はUnknown。cache失敗後の原参照保持を解消費用の導出済み証拠へ読み替えない。

## 13 将来の分割と接続禁止

別承認後の順序案は、(C-a)狭い型・先行scalar・seal／単一cache／公開phaseの閉鎖契約、(C-b)fresh C入口と全早期失敗／public readerの集約・外側frame境界を固定拒否のまま接続、(C-c)最終post→内部accepted→caller未接続停止を対にして接続、である。C-bまではmarker true／acceptedを出さない。C-cもcalleeだけを先に有効化せず、診断・cache所有・異常経路の保証を一体で確認する。

PC08のreturned全照合・BP04／C-03 preparing／専用post・source利用claim消費・payload借用／bind・BC00／構築ready・body・Journal供給・field clear／root終端・正式発行・全体受付は別承認。literal acceptedや返答再読をその解禁条件にしない。

## 14 draft-0.1時の文書検証と変更範囲（履歴）

今回は本書と親2文書の参照だけを更新する。開始時にはCHANGELOG・親確認設計・(B)検証記録・compiled試験の4ファイルに作業中変更があった。親確認設計は既存draft-0.5の全byteを保持して末尾へ参照節だけを追加し、他3ファイルは編集しない。そのレビュー変更は確認中に別作業で`7eb7b9b`へ保存され、当方の3文書差分とは分離された。レビューの34変異／8等価節はその記述を保持するが、今回再実行・再承認した結果とはしない。

ソース・テスト・compiled fixture・CHANGELOG・既存検証記録・manifest／lockfile・設定は当方では変更せず、build・合成／compiled試験・梱包・index登録・コミット・Pushは行わない。FRC01〜09／FRT01〜16は設計上の条件で、未実施のまま。HEAD移動は上記の別作業として記録し、当方によるコミットとはしない。

文書整合確認（2026-11-12）：当方が編集した3文書のローカルリンク30件に欠落なし、27表の列数・末尾改行／行末空白に異常なし。節順は本書14・親18／20、FRC01〜09／FRT01〜16の重複・欠落なし。親確認設計の開始時39,491byteのSHA-256一致と、他の既存3変更ファイルの全byteのSHA-256一致を確認した。現在の差分は当方のMarkdown3件だけ、indexは空。初回のHEAD不変チェックは別作業の`7eb7b9b`保存により失敗したため、履歴と変更4件を読み取り、既存内容が保持されたことを確認して記録を訂正した。これは文書／保持の確認であり、新Cの実装・合成受入・正式発行の検証成功ではない。

## 15 (C-a)閉鎖契約だけの合成実装（2026-11-12）

package除外のcreateProbeBodyPinFinalContractsFakeを追加した。同CanonicalGateDraftRootのconstructor固定flagだけを立て、旧A/B／source／frameの生成flagは全falseとする。既存rootの#failure／#closed／#fixedを使い、source・owner・pin・receipt・実行資格を新規発行しない。旧prepare／close／fail／replyは呼ばない。C-bの新公開wrapperではなく、固定原始操作を検証する合成契約shellである。

| 今回の内部境界 | 実装・受入範囲 |
|---|---|
| 狭い値型 | 7終端disposition、2最終点、6completion分類、5delivery理由、6cache phase。cacheのretained／attemptedはphase別のliteral型で結合 |
| 先行scalar | constructorより前にseal／disposition／phase／attempt／public busy／root exit／delivery first／現在点／初回点／completionを初期化。最終点・completion・公開入場・退出は初期値のまま |
| 診断seal | 同rootのsealを一度だけ固定。開始前closeではfirst noneを保持し、後発入力はdeliveryFirst=input_refusedへ分離。先行input_rejectedはclose／生成失敗で置換しない |
| 単一materializer | seal前はnot_ready。attemptを先に消費し、生成／freeze後、G_Cの2直接代入だけで既存#fixed／private_cachedへ。再試行・任意object登録・mode別cacheの利用なし |
| 失敗保持 | 生成／freeze前後の合成throwはfailed_empty、保持直後の合成throwはfailed_cached。診断・既存cache参照は保持し、再生成・clear・cleanup扱いにしない |
| 公開の閉鎖 | publishはprimitive publication_not_connectedだけ。#fixedを返さず、publicEntryBusy／rootEntryExit／replayable writerは0。実outer finallyのthrowや復帰確認は未接続 |
| 値だけのphase oracle | 672組の独立条件式で空／生成中／非公開保持／公開可能値／失敗値を検査。replayable正例は値検査だけで、同入口の実復帰証拠ではない |
| 公開projection | 凍結plainな有限診断値のみ。実cache・owner・source・能力tokenなし。操作返値も原始codeだけで、第2の終端objectを作らない |

固定合成scriptは通常・生成throw・freeze throw・保持後throw・materializing中の再入だけ。入力object／callbackは参照せず、引数個数と有限文字列だけを受付判定する。cache内部schemaはstrict10項目・ok=false・全閉鎖値で、cache同一性／別rootの同値copyはscratch compiled注入だけで観測する。公開slotや登録口は追加しない。

旧modeのgeneric #fixed writer／early reader・source／calleeとの接続をC-aのfactoryへ流用していない。したがって§8の全入口routingが完成したという保証ではない。C-bで全writer／readerの分岐と実外側frame境界を一体接続し、C-cで最終post・内部acceptedと元callerの固定停止を一体接続する必要がある。C-aのseal()は合成の固定construction_unconfirmed、close()は合成の開始前closeであり、未観測のcallee結果をsealする入口ではない。

追加費目はrootの固定flagと先行10scalar、有限check／seal／原始code、最大1回の終端object生成／freeze、固定catch診断、固定projectionと凍結facade。新scalarは同classの先行fieldなので旧modeのrootにも初期化されるが、旧分岐・期待値・期限は変更しない。inspectionの都度生成する非終端診断viewは単一終端cacheの数に隠さず別費目とする。実layout・allocation／GC／OOM・unit／全体work上界・破棄予約・診断必着はUnknown。FRC01〜06／08〜09とFRT全体の受入成功は主張しない。詳細は[(C-a)検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_FINAL_CONTRACTS_2026-11-12.md)。
