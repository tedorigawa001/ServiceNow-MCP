# OD-B 失敗ownerの寿命と最終discard条件

Version: br006-recovery-failure-owner-lifetime-draft-0.6 / Date: 2026-11-03。
Status: **固定4roleとFB-01〜03の同construction・合成kernel／sink・同上位custody移譲／元owner固定discardまで実装。実resource・実予算・全work上界は未保証。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `35541ab`。[OD-B設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ODB_TRANSFER_DESIGN.md)§7・10のOB-02開始条件を具体化する。hard後の診断と解放責務は、利用可能なaccepted／planとは別に保持する。最終discardはownerの保持参照を外す操作であり、resource解放完了の証明ではない。

## 1 現在の境界

[既存kernel](../tests/support/review/synthetic-recovery-kernel.ts)の`fail→clear`は、live accepted・acceptedTermination・source identity・pins・plan等を破棄する。発行済み新世代cleanup sinkは条件を満たせばhard後も扱えるが、通常のsource close／accepted discardはhealthy guardとbindingを要するため、hard後に再実行できるとは扱わない。

`recordWorkerGenerationCleanup`では、normal acceptedのcleanup証拠への結合条件に`!hard`が含まれる。hard後のcleanup confirmedを、そのままaccepted正常discardやsource closedへ昇格してはならない。

OB-01のOwnedMixedSupplyは実resourceやrecovery kernelを作らず、discardは合成DATAの参照破棄だけである。その既存動作は変更しない。本設計は、OB-02以降でresourceを持つ合成lifecycleへ接続する新経路の契約であり、既存のdiscardを流用して解放済みと見なす案ではない。

## 2 hard前に確保するownerと責務

同constructionで、内容ownerとは別にFailureOwner、固定UpperFailureOwner、cleanupの所有先を示すprivate custody slotを確保する。custodyとは「残ったcleanup操作・結果を誰が引き受けるか」の所有権であり、任意resourceを後から登録する口ではない。上位ownerも外部から注入・採用せず、新constructionの固定生成継続だけが作る。

FailureOwnerは最初のside effectより前に発行され、resourceの作成claim占有前に、該当roleを`creating`として登録する。後から返る生成結果もその同じslotに属する。handleが未設定というだけで`not_created`にしない。hard後は新しい生成claimを拒否し、遅着した生成結果は既に登録したcleanup先へ渡すだけとする。

| role | 未解決として追跡するもの | 完了とするための根拠 |
| --- | --- | --- |
| source | 同sourceのclose未開始／進行中／終了未確認 | 同sourceの固定close完了証拠。transport groupの完了を代用しない |
| transport group | 同run内のattempt／delivery／readerの未終端と遅着生成 | 既存transport ownerが、同attemptのtyped cleanupを全件消費し、in-flight／遅着生成もないと示す固定証拠 |
| old generation | 旧workerの終了・cleanup、未起動の確定不足 | 同旧世代の終了とcleanup両証拠、または生成claimが閉じた未起動証拠 |
| new generation | 新workerの終了・cleanup、startup中／遅着生成 | 同新frameの終了とcleanup両証拠、または生成claimが閉じた未起動証拠 |

FailureOwner自身は最大100行の本文や全attempt台帳を複製しない。transportの最大210試行は既存owner側の枠で追跡し、失敗ownerはその一つのgroup参照と固定scalar件数だけを持つ。共有cleanup ownerが未接続のroleはUnknownとして残す。

`not_created`は同生成元の未起動証拠でだけ確定する。`not_required`というcaller文字列、C=0、mapが空、handleがundefined、cleanup関数が呼ばれなかったことは、単独のabsence証明にはしない。

## 3 保持する型と捨てる情報

以下は全体の合成内部型案。独立した合成owner／証拠の実装範囲は§9、既存kernelやresourceへの結合は未実装とする。

| 型案 | 必要な内容 | 保持しないもの |
| --- | --- | --- |
| FailureIdentity | 同construction token、failure serial、固定roleと元lifecycleへの結合 | callerが指定したIDや任意owner |
| FirstHardDiagnostic | 最初の固定code／stage。取消・期限も既存の確定順を維持 | raw例外・stack・URL・認証情報 |
| RoleObligation | 同roleの生成状態、停止要求、終了観測、cleanup観測、custody先、固定証拠の消費状態 | source／workerへの再利用可能なreview route |
| SealedFailureReport | 非実行のfirst hardとrole別診断snapshot、resolved／unresolved区別 | 本文・prefix・hash・T_i／UTC・receipt一覧 |
| FailureCustodyHandoff | 上位固定slotへ一度だけ移す内部cleanup参照と未解決状態 | JSON／summaryから復元できる能力 |
| FailureCommitReceipt | 同failure／report／custody serialを上位が受理したprivate証拠 | 外部から渡すack bool・success文字列 |

hard確定時に、body／pins／元reviewed／prefix／plan／accepted live route・移譲先内容・一時projectionを同期失効する。FailureOwnerに残すのは、固定診断とcleanupに必要な最小限のprivate参照だけ。resourceの停止だけに使える参照を、解析・dispatch・ready再生成・sealへ戻す継続は持たせない。

正常系のacceptedTerminationは内容利用とは別に扱うが、hard時にはその通常discard権限を復活させない。hard前に確定済みだったsource／worker等の終了factsだけを、FailureOwnerが同発行元へ結んで保持する。失効したnormal handleや、後から取得したsummaryで確定factsを再構成しない。

## 4 寿命と状態遷移

| 状態 | 保持する責務と許可操作 | 次の状態の条件 |
| --- | --- | --- |
| tracking | resource生成前からroleを追跡。新経路の利用権限は別owner | 最初のhardでfailed_drainingへ。本文利用権限はここで失効 |
| failed_draining | 発行済みcleanupだけを一度要求・記録。最初のhardは固定 | 期限／固定回収区間の終了で診断を封印。解放未確認でも次の報告段階へ進める |
| sealed_waiting_ack | immutable reportとcleanup custodyを保持。再生成・再解析・再試行は不可 | 固定UpperFailureOwnerがreportとcustodyを一つのprivate操作で受理 |
| committed_to_upper | 上位が診断と全残存責務を所有。元ownerのcleanup入力は上位へ固定転送するか失効 | 同FailureCommitReceiptを一度消費して元ownerをdiscard |
| discarded | 元ownerは本文・cleanup操作権限・pending handleを保持しない | 終端。prepare／accepted／seal／failure再発行へ戻らない |

`failed_draining`は無期限待ちや独自retryの許可ではない。同じrun開始時の全deadlineと既存終了処理の残予算を使い、残時間から新しいdeadlineを作らない。残予算0なら新しい待機を設けず、既存の非同期cleanupが未確定であることを封印する。runの60秒を延長するtimer・grace periodは追加しない。

cleanup-only経路をhealthy-run guardの再通過に依存させない。hard／取消は新しいreview処理を止めるが、同failure・同role・現在のcustody holderに属する発行済みcleanupの要求や結果記録まで禁止しない。期限後のlate factも追加の待機を作らず診断へ記録するだけとし、通常routeの復活や全deadlineの延長には使わない。

UpperFailureOwnerが引き受けるのは、既に存在するcleanup owner／結果sinkへの責務である。新しいbackground task、listener、worker、transportを起動しない。上位が未接続なら元ownerの最終discardを拒否し、payloadを除いた未解決責務だけを保持する。実resourceへの適用には、既存外側executorの有限な終了保証を別途結合する必要があり、そこがUnknownの間は実接続を有効にしない。

## 5 cleanup確認と解放確認を分ける

各roleは少なくとも、生成状態と終了観測・cleanup観測を別に持つ。cleanup開始／要求／settled／confirmed、physical termination、source closed、全group quiescenceを一つのbooleanへ畳み込まない。

| 観測したfact | 記録できること | 推論してはいけないこと |
| --- | --- | --- |
| worker cleanup confirmed | 同frameのcleanup観測がconfirmed | 別frameの終了、source close、全transport解放、正常accepted discard |
| 同workerの終了証拠 | そのworkerのtermination confirmed | reader／stream・listener・cleanup完了 |
| source closed | 同sourceのclose完了 | 別ownerの全attempt cleanup、旧／新worker終了 |
| 一つのreaderのcancel／closed／releaseLock完了 | 同attemptのtyped終端条件に含まれるfacts | 全attemptや全sourceの終了 |
| 全参照をmapから外した | 内容利用の失効・保持参照の削減 | OS resourceの解放確認 |
| deadline／取消・cleanup例外 | 停止理由と該当roleの未確認／失敗 | 時間経過による自動confirmed、成功応答への変更 |

観測factsは同construction・同role／frame／attempt／sinkに結合した固定発行元からだけ受ける。合成issuerのconfirmedは合成範囲のfactであり、実OS終了や実sessionの証明ではない。未知status・foreign sink・コピー・二重消費を拒否し、先行hardを置換しない。

## 6 最終discardの条件

元FailureOwnerの最終discardは、次を全て満たした場合だけ許す。

1. 同ownerのhardが確定し、body／live route／pending内容が全て失効済みである。
2. 作成claimは全て閉じ、生成中・遅着結果・発行済みcleanup sinkの所有先が同custody台帳で説明できる。後着を受ける継続が元ownerの本文を保持しない。
3. immutable reportを同UpperFailureOwnerの空の固定slotへ一度だけ格納した。表示・JSON serialization・summaryコピーの成功は受理証拠ではない。
4. 各roleは、同発行元の完了／未生成証拠で解決済みか、未解決のまま同上位custodyへ一度移譲済みである。記録だけを渡しcleanup権限を放棄することは不可。
5. reportとcustodyの同時commitに由来するFailureCommitReceiptが同failure／serialに一致し、未消費である。
6. 移譲途中のpendingがなく、元ownerへ再入中でもない。receiptを先に取り外し、固定検査後に元参照を外す。二重discardや別owner receiptを拒否する。

上位slotとcustodyの切替は同module内の一つの同期transactionで行い、検査途中の外部callbackやawaitを置かない。private custody slotのholderを一度だけ上位へ切り替えてcommit receiptを確定する。呼出し側の表示失敗や受取失敗が後から起きても、所有権を元へrollbackしない。途中失敗は未commitなら元が保持し、commit後なら上位が保持することを同slotから判定する。

sealed reportは不変にする。封印後のlate cleanup factは、同custody slotの現在のholderへ、発行済みの一度限りsinkを通して記録する。上位は必要なら別revisionの限定診断を作れるが、元のfirst hardや公開済みreportを書換えず、未確認の過去reportを成功だったことにしない。

### 6.1 終端結果の意味

| 元ownerをdiscardできる経路 | 失敗結果に残す状態 |
| --- | --- |
| 全roleが同証拠で解決し、上位がreportを受理 | outcome=failed、release=confirmed。レビュー成功や候補にはしない |
| 上位がreportと未解決custodyの両方を受理 | outcome=failed、release=unconfirmed、unresolved件数。上位は解放責務を保持 |
| 上位未接続・受理拒否・custody不一致 | discard拒否。元に非本文の診断・責務を保持し、release=unconfirmedを維持 |

この終端は正常系のclose／accepted discardと別brandであり、その代替証拠にしない。外部公開codeの新設やMCPへの写像は本工程では決めず、内部診断の区別だけを固定する。

## 7 固定上限と秘密非出力

FailureOwnerの台帳は4 role、first hard 1件、roleごとの固定診断slot、上位report／custody／commit各1slotに限定する。任意長のcleanup履歴・例外配列・row本文を蓄積しない。transportの内部台帳を複製せず、既存210試行の集約証拠を受けるだけとする。無効な通知の件数は有限上限で飽和させ、無制限に増やさない。

外部へ出すのは固定stage／reason・role別state・件数・報告済みかのscalarだけ。認証値、ID、URL、hash、時刻、payload、prefix、任意例外、opaque handleを出さない。JS heapの物理消去は保証せず、権限失効と参照破棄を保証対象とする。

台帳の確保・更新、identity照合、seal copy、custody切替、ack消費、late診断と固定破棄は追加費目。固定slot数を全work／heapの証明にせず、共有予算・中断粒度・外側終了の実上界はUnknownのまま管理する。

## 8 合成受入条件と次の実装範囲

- resource未生成・生成中・既に終了済み・sourceだけ未確認・worker cleanupだけconfirmed等を独立表へ照合する。全cleanup confirmedでもterminationやgroup quiescenceが不足すればrelease=unconfirmedとする。
- hard前後の遅着生成、cleanup開始直前／途中／後、seal前／後、commit前／後のlate factを分ける。別role／frame／sink、unknown status、コピー、重複、握り潰した再入を拒否する。
- first hardを後続cleanup失敗・期限・取消・表示失敗が置換しない。snapshotをseal後に書換えず、late診断が新しいauthorityや候補を生まない。
- 上位へのreportだけ受理、custodyだけ受理、summaryからの偽ack、foreign commit receipt、二重handoff／discardを拒否する。未commit時は元、commit後は上位が唯一のcleanup所有者であることを確認する。
- 残予算0・停止中のguardでも新しい待機やretryを追加せず、未確認のまま終端報告できることを確認する。上位不在時のdiscardを成功扱いしない。
- discard後に元ownerが本文・cleanup権限を保持せず、同上位に未解決責務が残るケースを確認する。これを「全resource解放済み」の試験期待値にしない。
- 旧OB-01のDATA discard、既存正常accepted／seal／cleanup・固定終端試験を維持する。全て合成issuerとfakeイベントだけで検証し、実source-close発行口を追加しない。

最初の実装範囲は、固定4 roleのFailureOwner・immutable report・同生成元のUpperFailureOwnerとcustody slot・一度限りcommit receipt／discardの純粋内部契約である。accepted採用や移譲先sealより先に、失敗後の唯一の責務所有者を確認する。既存cleanup sinkとの実連結・外側executorの終了保証・実会計と上界は後続へ残す。

draft-0.1はMDと親参照の更新だけ。続く純粋実装の範囲を以下に分離し、実接続・実通信・実機操作・設定変更・token／Permit／候補発行・Pushは行わない。

## 9 独立した合成FailureOwnerとcustodyの実装

[新assembly](../tests/support/review/synthetic-failure-custody.ts)と[合成試験](../tests/review/synthetic-failure-custody.test.ts)をtests配下へ追加した。既存OB-01／recovery kernelは変更しない。新factoryのDATAは固定kindとupperのconnected／absent／reject条件だけで、resource／session／既存ownerを注入する項目はない。guardは固定したfake checkpointだけ。upper条件の後書換えを採用しない。

### 9.1 生成元と証拠

同constructionにissuer・local・upperの3facade、4roleの台帳、一つのcustody holderを生成する。固定issuerの生成claim／未生成証拠／生成結果／role別終了／cleanup証拠は空の別brand handleで、consumerは同token・role・private frame・ticketを照合して一度消費する。開始前・hard前に観測したfactsも同台帳へ残す。

hardは未使用の生成claimを閉じるが、absenceを自動でconfirmedにしない。生成中はcreatingのままで、遅着のcreatedは同ticketへだけ結ぶ。元ownerのdiscard後も、上位が引き継いだ台帳への同発行元の遅着証拠を受理できる。コピー・foreign・別role・unknown kind・余分な引数・重複は拒否する。

現実装は生成済みの全roleで、同roleの終了観測と要求済みcleanupのconfirmedを両方必要とする保守的なsubset。sourceもsource_closedだけではcleanupを推論しない。未生成は固定issuerの証拠を受理したときだけ解決済みとする。これは合成factsの整合であり、実source closeや全attempt消費の証明ではない。

### 9.2 封印と一度限りのcommit

local.hardで最初の固定code／stageを保持し、sealで4roleのimmutable reportを作る。reportもoutcome=failed、scope=synthetic_failure_diagnostic、authority=noneで、cleanup解決をレビュー成功へ変換しない。

commitはreport handleと空の同upper slotを検査し、report・proof・receiptの準備とpre/post checkpointを済ませてから、同期の代入だけでcustody holderをupperへ切り替える。reportだけ／custodyだけの公開受理口はない。commit後の表示失敗で元へ戻さない。upper不在／拒否・検査失敗なら元が責務を保持し、移譲claimは復活させない。

finalDiscardは同commit receiptを先に取り外し、同token／report／first hard／custody serialとupper所有を照合して一度だけ元ownerを終端する。未解決があっても、同上位に責務を移せた場合だけ元ownerをdiscardできる。これはresourceの解放confirmedではない。上位未受理・foreign／copy／summary・二重消費は拒否する。

### 9.3 診断と上限

上位の受理済みreportは書換えず、late factsは上位のcurrent診断だけを更新する。元localのconsumerはcustody移譲後に拒否され、上位の未消費証拠を奪わない。first hardは後続のcleanup失敗・protocol fault・表示失敗・停止観測で置換しない。

checkpointのcancelled／deadline_exceededは停止観測へ記録するだけで、cleanup-onlyのseal／commit／discardをhealthy guardで妨げない。throw／未知返値・再入はその操作を拒否し、commit前はlocal、commit後はupperが唯一の責務所有者として残る。fault件数は100で飽和させ、別のprivate poison flagで飽和後の握り潰した再入も検出する。

4 ticket、最大12個の未消費証拠slot、report／upper report／commit receipt各1slotだけを持ち、本文や例外履歴を受け付けない。native I/O、clock、timer、workerを呼ばず、残予算0相当の停止checkpointでも追加待機は作らない。一方で実deadline／共有予算／実cleanup・attempt inventoryは未結合であり、guard数や固定slot数を全work／heap上界とはしない。

inspectのruntime_resource_origin／actual_cleanup／attempt_inventory／canonical_budget／cleanup_deadlineは未保証のまま。OB-01の実payload失効や既存kernelのsink連結は後続であり、本実装が代行したとはしない。[検証記録](E2E_BEST_PRACTICE_FAILURE_CUSTODY_2026-11-03.md)参照。

## 10 OB-01とkernelへの接続差分

[接続差分](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)で、同constructionの先行owner確保、OB-01 first-hardの一度限り通知とfinallyによる本文破棄、4roleの生成点・初期所有証拠・frame／sink対応を具体化した。public issuerを接着する方法や、C/G/P・cleanup文字列からの全終端証拠の生成は採らない。sourceのhard後close・transport全件証拠・独立worker終了証拠の不足はUnknownへ残す。

FB-01は[接続差分§10](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)の同construction先行slot・OB-01固定失敗通知とpayload失効まで合成実装した。旧FB-01 entryの4roleは全てUnknownのままで、上位slotへのcommit／最終discardやkernel生成は公開しない。[記録](E2E_BEST_PRACTICE_FAILURE_BINDING_FB01_2026-11-03.md)参照。

FB-02の別fresh entryは[接続差分§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)の同private初期topology・RoleBinding・生成点・clear前checkpoint・既存sinkへ合成接続した。[記録](E2E_BEST_PRACTICE_FAILURE_BINDING_FB02_2026-11-03.md)参照。成立した終了／cleanupは別factsで保持し、transport全件証拠・新世代exit・source cleanupの不足はUnknownのまま。

FB-03は[接続差分§12](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)で、別fresh entryの同上位slotへ実際の合成cleanup capsuleをreportと同期移譲し、同receiptによる元owner最終discardへ接続した。以後のcleanupはupperだけが処理し、未知責務を保持する。[記録](E2E_BEST_PRACTICE_FAILURE_BINDING_FB03_2026-11-03.md)参照。実resource接続・canonical予算／全work保証・OB-02のaccepted採用は未実装である。
