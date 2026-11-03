# FailureOwnerとOB-01とkernelの接続差分

Version: br006-recovery-failure-binding-draft-0.8 / Date: 2026-11-03。
Status: **FB-01〜03の同construction・private kernel／sink・同上位custody移譲／元owner固定discard・合成停止／予算供給点まで実装。実resource・実予算・全work上界は未保証。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `196ca0c`。[失敗owner寿命設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_OWNER_LIFETIME_DESIGN.md)§9と[OD-B設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ODB_TRANSFER_DESIGN.md)§11からの差分。同一constructionでFailureOwnerを先行確保し、OB-01の失敗通知と既存kernelのresource生成・cleanupを結ぶ。既存の独立factoryを二つ呼び、summaryやID一致で接続する方式は採らない。

## 1 追加するものと維持する境界

旧単体entryの[OwnedMixedSupply](../tests/support/review/synthetic-recovery-kernel.ts)は、DATAと同pins／行対応を準備するだけでrecovery kernelを作らない。旧standalone [FailureCustody](../tests/support/review/synthetic-failure-custody.ts)は別token・別frameで4roleを管理し、公開issuerのfactsは合成由来だけである。双方の単体試験は接続済みの証明ではない。

新しいclosed合成constructionを一つ追加し、privateな供給・lifecycle・失敗coreを同じ生成継続に置く。旧factoryの入力・brand・返却surface・診断は維持する。新entryは合成DATAを受けるだけで、既存root／session／owner／issuer／callbackを登録する引数を持たない。

accepted採用・移譲先seal・内容比較は本差分の対象外。実session、実transport、実worker、source-closeの新しい実発行口、MCP登録も追加しない。

## 2 同一constructionと生成順序

新constructionの順序を固定する。

1. 入力を読む前に、固定の上位診断slot、FailureOwner、custody slot、first-hard slotを確保する。既知の安全な内部初期値だけを使い、callerのguardやupper objectをこの段階で実行・採用しない。
2. 共通construction tokenとfake停止境界をpinし、OB-01のstrict DATA投影を開始する。不正DATA／依存形状も同上位診断へ固定理由で残す。旧standalone factoryの例外動作は変更しない。
3. 同生成元のOwnedMixedSupply・pins・行対応を準備する。外部へpinsや実issuerを返さず、既存の一度限りprepare claimを維持する。
4. resourceを担当する固定creatorと、追跡対象範囲を結ぶprivate RoleBindingを準備する。生成claim占有前にFailureOwnerへcreatingを登録し、その後だけ対応する生成処理へ進む。
5. 同pinsとprivate初期topologyから既存kernelの新経路を構成する。sourceや旧世代がこの時点で既に存在するなら、同生成元の初期所有証拠を必要とする。後からcallerの参照を登録して済ませない。
6. 最初のhardを一度通知し、内容権限を同期失効する。busy区間を抜けた後、固定外側callerがcleanup-only・report封印・上位custody受理・元owner最終discardへ進む。

OB-01の公開prepared handleやFailureCustodyの公開issuerを、汎用DIで互いに渡す方式は禁止する。必要な共通化はprivate coreの同居・固定生成継続とpure検査の抽出に限定し、共有tokenやlive frameを受け取る公開factory／attach／register関数を作らない。private coreを同じ内部moduleに置く場合も、公開するのは旧fresh factoryと新fresh DATA entryだけとする。

## 3 private接続契約

以下は全接続の型案。FB-01は§10、FB-02は§11、FB-03は§12の範囲で実装した。

| 型案 | 固定内容 | 検査と所有権 |
| --- | --- | --- |
| ClosedConstructionIdentity | 共通token、供給owner、kernel scope、失敗owner、上位slot | 新constructorのみ生成。別factoryのtokenを後付けしない |
| RoleBinding | role、creator identity、追跡範囲、allocation identity、generation ticket、frame／source identity、cleanup sink | 同生成元の参照だけ。raw IDやsummaryでは発行不可 |
| ClosedCreatorSetProof | 対象roleで生成を開始したか、全creator claimを閉じたか、既存resourceの供給元を覆うか | absence発行の前提。未登録・未対応はabsenceでなくUnknown |
| KernelFailureNotice | 確定済みfirst hard code、固定phase、failure serial、construction | 元失敗点だけが一度発行。raw Error／messageを渡さない |
| CleanupOnlyCapsule | 同role／frame／sinkへの固定停止・結果受領継続、未解決状態 | review／ready／dispatch／accepted／sealの操作を含めない |
| RoleTerminalProof | 同birth／frame／sink・scopeに結合した終了またはcleanup証拠 | 証拠の種別と一度限りclaimを維持。文字列statusを昇格させない |

FailureCustodyが現在生成する内部frameとkernel frameは独立している。新経路ではbirth時のRoleBindingから両者を固定対応させるか、一つのprivate frameを共有する。readyが返った後に「同じ世代らしい」と対応付けることは不可。metadata allocation、生成処理開始、生成結果の受領、ready受理を別の節目として扱う。

## 4 OB-01の失敗通知と参照破棄

OB-01のconstructor内拒否、prepare／row／discardのguard、重複・混入・失効拒否を対象とする。既存のfirst_failureが確定する箇所に、新経路専用の固定通知継続を置く。外側catchが例外の文字列やinspectを読み直して証拠を再発行する案は採らない。

失敗処理の順序は次とする。

1. 元の規則で優先される失敗を確定する。prepare内で保留したbinding不一致よりpost guardの取消／期限が優先される順序を変えない。
2. 同constructionのfirst-hard slotへ固定noticeを一度格納し、新しい生成claimを閉じる。通知先の追加失敗で元のcodeを置換しない。
3. OwnedMixedSupplyのDATA／pins／元本文／prepared handleと移譲途中の一時値を外す。FailureOwnerへ本文を渡して退避しない。
4. 元操作を終了させ、busyを解く。外側の固定失敗callerが、保持済みnoticeと責務を使う。失敗中のpublic facade再入でseal／commitを呼ばない。

noticeの一度限りclaimは書込み前に占有する。同じfirst hardを既存actのcatchが再びfailへ渡しても、同serialの通知を二重発行せず、元claimを戻さない。通知処理の成否にかかわらずfinallyでpayload clearとbusy解除を行い、通知失敗を理由に本文を保持しない。

通知先は任意callbackではなく、先行確保したprivate固定slotへの書込みとする。通知経路の不成立は別の固定faultとして残し、成功応答を返さない。旧factoryをこの新通知先へ後付け参加させない。

prepare前の拒否では、この接続経路がresourceを生成していないことと、run全体にresourceが存在しなかったことを区別する。後者を覆うClosedCreatorSetProofがなければ、4roleの未生成証拠を自動発行しない。空map・pin_builds=0・DATA-onlyだったことだけで全runの解放confirmedにしない。

## 5 kernelの生成点と4roleの対応

| role | 対象となる現在の節目 | 新経路で先に保護するもの | 成立させない推論 |
| --- | --- | --- | --- |
| source | tracked kernelのconstructorでsource identityを生成。beginSourceClose／settleSourceCloseで状態更新 | constructor前のRoleBindingと初期source所有証拠。clear前のcleanup-only責務 | bind前だからsourceなし、source closedだから全transport／cleanup完了 |
| transport_group | 現kernelには全HTTP attempt／readerの台帳がない。verify accountingは件数・byte値だけ | 同run・同budgetの全attempt ownerからの集約証拠と保護範囲 | C=0／G=0／P=0、verify非実施、source閉鎖からquiescentを生成 |
| old_generation | beginWorkerClosure、confirmWorkerUnstarted、settleWorkerClosure | 同初期topologyの旧frame／creator、closure lease、終了とcleanupの別facts | worker_state=none／close_requests=0だけでabsence、片方confirmedだけで両完了 |
| new_generation | claimWorkerGenerationでframe／sinkを割当て、startWorkerGenerationで開始、ready受理でroute origin確定 | claim前の予約、同frame／cleanup identity／sink、作成途中と開始結果 | frame確保／generationStarts／ready_eventsだけでphysical terminationやcleanup完了 |

sourceや旧workerのように回復開始前から存在するものは、creatorの出生時追跡または同private初期供給証拠を必要とする。回復開始時のcaller-supplied topologyは現在もfake fixtureであり、実source originへ昇格しない。新結合試験でも証拠scopeはsynthetic_lifecycleに限定する。

new generationは「予約したが未開始」「作成中」「生成結果を受領」「ready受理」を分ける。生成が起きた後のpost guardで停止しても、birth factを未生成へ戻さない。作成を開始したが結果を確定できない場合はcreating／unconfirmedで保持し、同ticketの遅着結果をcleanup所有先へ結ぶ。

transport全件の供給元は現在未接続のため、初期接続ではUnknownを残す。新kernel区間でdispatchがなかったとしても、回復前のattemptを含む範囲を覆う証拠なしにgroup absenceを出さない。全roleが解決したという試験期待値を先に作らない。

## 6 hardとclearの接続位置

既存kernelでは`hard??=...`の後に`clear()`がsource identity・frame・acceptedTermination等を外す。新経路は、その前に既に確保してあるRoleBinding／CleanupOnlyCapsuleと確定済みfactsを失敗側へ保護する。hard発生後にinspectから参照を再構成しない。

新FailureOwnerへの通知はfirst hard確定直後、payload clearより前に行う。cleanup-onlyのrole metadataはrun利用権限と別slotで保持し、元healthy bindingやready originを復元しない。clearを止めて本文を残すのではなく、cleanupに必要な最小限の停止専用参照だけを残す。

現在のbeginWorkerGenerationCleanupはhealthy guardを通さず、発行済みsinkについてhard後も処理できる。この性質を維持する。既存source closeはhealthy actを要するため、hard後の代替source-close実行口を本接続で追加しない。sourceの操作・証拠が不足すれば、上位へ未解決のまま引き継ぐ。

コードとstageは明示写像にする。OB-01のshape／binding／order等はinternal_review_error、cancelled／deadline_exceededは同codeを維持する。kernelは確定したhard.codeをそのまま使い、phaseからFailureOwnerのprepare／transfer／cleanup／internalへ固定変換する。生成・準備はprepare、plan／finish系はtransfer、closure／source close／cleanup／discardはcleanupを基本とし、全phase unionを列挙して検査する。未対応phaseを文字列prefixで自動分類せずinternalへ止め、元の固定phaseは別の限定診断へ保持する。displayは外側表示の通知に限定する。

## 7 cleanup sinkからの観測契約

- old generationのsettle結果は、同private lease／contextの検査後にterminationとcleanupを別々に保持する。両方成立したときだけ返る既存closure evidenceを待つと、片方のみ確認済みのままfailするケースを失うため、clear前に確定済みfactsを保護する。
- confirmWorkerUnstartedからabsenceへ結ぶには、同creatorの開始未実施・閉鎖済みclaimを追加照合する。callerのworker_stateだけを根拠にしない。
- new generationのrecordWorkerGenerationCleanupは、同sink／frame・開始serial・validStartとstatusの検査結果を使う。参照を消す前に、受理できたcleanup factだけを固定継続へ渡す。foreign／unknown statusからconfirmedを発行しない。
- cleanup confirmedとworker_terminatedを別発行にする。現kernelのcleanup文字列やready countersに独立した終了証拠がなければ、終了はUnknownのまま。正常acceptedのcleanup証拠をhard後に復活させない。
- source closedは同sourceの固定settle proofに結ぶ。新FailureOwnerの保守的なsubsetが要求するsource cleanup factは、適切な固定完了issuerがなければUnknownとする。同じ文字列を二つの独立証拠へ複製しない。
- transport_quiescentには全対象attemptのtyped cleanup・in-flight／遅着生成なしの固定集約証拠を必要とする。現在の会計値は代替証拠にしない。

cleanupを始めるときも、同capsuleから一度要求し、同結果を元kernelと失敗ownerへ二重消費させない。元sinkの唯一のconsumerが固定の受理receiptを作り、そのreceiptから許された診断factsだけを派生させる。上位へcustody移譲後は共通holderがcleanupを制御し、元local facadeは操作不可とする。late factsは受理済みreportを書換えずupperのcurrent診断へだけ反映する。

## 8 停止と費目と未対応

healthy stopは生成・解析・accepted等を止め、cleanup-only stopは元全deadline・既存残予算の範囲で責務を回収・報告する。両guardを同じ戻り値処理で包まない。FailureCustodyの停止checkpointは待機を作らず診断へ記録するが、それだけで実budgetが結合したとはしない。

共通token／先行slot、初期所有証拠・role対応、first-hard写像と通知、payload clear、sink受理と派生facts、上位custodyと最終discardが追加費目となる。source／worker処理を通知のために再実行せず、C/G/P・retry・210試行・全60秒を増やさない。総work／heap・中断粒度・外側executorの終了保証はUnknownを維持する。

## 9 合成受入条件とOB-02の開始条件

1. FailureOwner／上位slot確保前にOB-01のraw validationやguardが実行されないことを確認する。不正DATA／依存例外にもfirst hardが一度残り、本文がfailure側へ漏れない。
2. constructor・各prepare／row／post guardの失敗で元の優先codeを保持し、body／pins／preparedを破棄する。通知の例外・swallowed再入で先行診断を置換せず、成功handleを返さない。
3. source／旧世代の初期存在、new frame予約・未開始・作成中・生成結果・ready前後を区別する。別frame／sink／construction、summary由来の証拠、未開始と未確認の混同を拒否する。
4. old generationの終了だけ／cleanupだけ、新世代cleanup confirmedだけ、source closedだけ、accountingだけのケースで解放confirmedを出さない。欠けるissuerはUnknownのまま上位へ移す。
5. clear前のfactsとcleanup-only参照を保持し、hard後も発行済みsinkだけが結果を受ける。late生成／cleanupをlocal／upperの唯一のholderへ配送し、normal acceptedやreadyを復活させない。
6. 先行hard→payload失効→cleanup-only→immutable report→同上位custody受理→元owner最終discardを連続fakeで確認する。責務移譲を実resource解放と扱わない。
7. 旧OB-01・kernel・FailureCustodyのstandalone入口と試験を維持し、新factory／private issuerをpackage非同梱にする。runtime／I/O／clock／worker起動・秘密漏出の負の対照も維持する。

| 分割案 | 最初の実装範囲 | 未接続のまま残すもの |
| --- | --- | --- |
| FB-01 | 同construction shell、先行FailureOwner／上位slot、OB-01 first-hard固定通知とpayload失効。欠けるrole証拠はUnknown | kernel生成・accepted採用・移譲先seal |
| FB-02 | 同初期topologyとkernelのRoleBinding、生成点・clear前保護・既存cleanup sinkからの固定factsをfakeで接続 | transport全件証拠・独立終了証拠のない項目、実resource |
| FB-03 | 未解決のまま上位へ移す連続試験、停止／診断／同予算供給点・費目を確認 | accepted／plan結合とdest seal |

この3段階の失敗停止・責務保存と欠ける証拠の扱いを確認した後に、OB-02の同pins／accepted／planを一つの移譲claimへ結ぶ。Unknownをconfirmedに変えることで開始条件を満たしたことにはしない。

draft-0.1はMDと親参照の更新のみ。draft-0.2の実装範囲は以下のFB-01に限定する。

## 10 FB-01の合成実装と残す境界

[実装](../tests/support/review/synthetic-recovery-kernel.ts)のfresh DATA entry `createSyntheticFailureBoundSupply`は、入力／依存のstrict検査より先に同construction token、既存FailureOwner coreの4role台帳・custody・上位slotとprivate通知slotを確保する。既存FailureCustody coreを同moduleへ移し、[旧module](../tests/support/review/synthetic-failure-custody.ts)は同じfresh factory・error・typeだけを固定importして公開する。旧API／brand／独立台帳は維持し、public issuerを接着する方式にはしていない。

OB-01のprivate供給coreは同tokenと固定通知slotだけを内部生成継続から受け取る。旧DATA entryにowner登録引数は増やさない。最初の失敗理由を確定し、通知claimを先に占有して固定code／prepare stageを同FailureOwnerへ書く。cancelled／deadline_exceededはそのまま、他の供給reasonはinternal_review_errorへ写す。同じ失敗のcatch／再操作では通知数1を維持する。通知先はcaller callbackでなく同coreの固定writeであり、原文Error・本文を格納しない。

通知処理はfinallyでDATA／held／preparedを外す。prepareの途中movingとbusy、discardのbusyもfinallyで解放する。元のpost guardと保留binding不一致の優先順を維持する。constructorの不正DATAだけでなく不正依存も新entryでは失敗済みfacadeとして診断へ残し、旧standalone entryの不正依存throwは維持する。constructorの元raw／余分引数も参照から外す。JS heapの物理消去・OOM時の診断確保は保証しない。

新facadeはOB-01のprepare／固定失効操作とimmutableな`failure()`診断だけを返す。診断のcurrentは同coreから導出する限定snapshotで、sealed reportやcommit receiptではない。issuer／local／upper／seal／commit／finalDiscardを公開せず、通知faultを注入する任意callbackも持たない。上位slotは先行確保するだけで、上位受理はfalseのまま。正常なsource／cleanup／discard失効自体をhardやresource解放と扱わない。

4roleは全てunknown、release=unconfirmed／unresolved=4を維持する。DATA-onlyでC/G/P=0でもabsenceを発行しない。kernel生成・初期topology／RoleBinding・cleanup-only capsule／sink・同予算／全deadline・上位custody移譲はFB-02〜03へ残す。新entryは`createRecoveryKernel`を呼ばず、accepted採用・移譲先seal・実発行口を持たない。

[合成試験](../tests/review/synthetic-failure-bound-supply.test.ts)と[検証記録](E2E_BEST_PRACTICE_FAILURE_BINDING_FB01_2026-11-03.md)で、不正入力、全prepare checkpointの停止、握り潰した再入、foreign／copy／summary、post guard優先、固定依存・旧入口不変を確認する。通知先はprivate固定writeで外部から差替え不能のため、内部通知の任意throw注入は今回の試験保証に含めない。新marker非同梱と固定import／runtime・I/O・clock・workerの負の対照も維持する。

追加費目は先行4role／custody／上位slot、同tokenと通知slot、first-hard写像・固定write・clearである。回数は通知1、固定4roleだが、これを全work／heap上界と扱わない。実会計・C/G/P・retry・210試行・全60秒は変更せず、総上界・中断粒度はUnknownのままとする。実接続・実通信・実機操作・設定変更・token／Permit／候補発行・Pushは行っていない。

## 11 FB-02の同topology・kernel／sink接続

新fresh DATA entry `createSyntheticFailureBoundKernel`は旧FB-01 entryを昇格せず、同private供給core・FailureOwner coreから新constructionを作る。callerが渡せる依存はfake guardだけ。DATAはOB-01と同じstrict契約で、既存root／seed／facts／source／issuer／callbackを登録しない。旧entryのsurface・brand・動作は維持する。

prepare成功後、同tokenで保護したprivate bridgeだけが同OwnedMixedSupplyを参照する。同じ入力receiptをactive inputへ結び、同時刻・選択順・最小completed値・会計から回復準備値を作る。元reviewed本文やaccepted値はkernelへ渡さず、元supplyの固定discardとfinallyでheld／bridge／元rawを外す。固定fake範囲ではverify continuationをnullとし、既存のno-verifyモデルを通す。実runの必要verifyを省略できる証拠ではない。

同private生成継続がsourceと初期worker参照をfresh生成する。pointが未起動なら旧creatorを閉じ、初期workerを作らない。他のpointでは旧frameを生成し同generationとRoleBindingへ結ぶ。kernelには外から取得した参照を採用せず、tracked constructorのsource identityを出生時に結ぶ。source／old roleの生成ticketはその生成より前に予約する。これらはsynthetic lifecycleの発行前提だけで、実source originやOS workerの証拠ではない。

| 接続点 | 固定の処理 | 未確認のまま残すもの |
| --- | --- | --- |
| 初期source | private creator予約→kernel constructorのidentity／同source参照→created | 実origin・source cleanup |
| 旧worker | private creator予約→同worker／generation→created。begin closureの同leaseを固定sinkへ結ぶ | caller文字列だけのabsence・実終了origin |
| 旧未起動 | 同constructionが旧creatorを閉鎖しworkerを作らなかったprivate前提＋同closure lease／context検査後だけabsence | worker_state=noneだけ／未観測のrun全体absence |
| 新worker | generation claim占有前の予約→frame／cleanup identity／sinkの割当て→start時のcreated | metadata確保だけのcreated・独立したworker exit |
| transport_group | 集約issuerなし。C/G/Pやverify回数から生成・absenceを作らない | 常にUnknown |

kernelの最初のfailはclearの前に専用checkpointを通す。保持中のsource identity／参照、旧worker／generation、新frame／sinkを出生時RoleBindingと照合し、同FailureOwnerへ固定codeと明示的な全Phase→Stage表で通知する。参照照合は最初の1回だけで、重なるfail／catchでは通知claimや診断を戻さない。外側拒否のnoticeとclear前checkpointを分離し、clear後のcatchだけでprotected=trueにはできない。同一性不成立は限定binding_faultへ残し、元のfirst hardは置換しない。

既知のframe／sinkは出生時から失敗側の固定slotに保持する。kernelのclearは通常のbinding／seed／facts／ready／generation inputs等を外し、新entryの失敗finallyも健康側の準備値・lease等を外す。cleanup-only参照からreview／ready／acceptedを復元しない。

新frameの割当て後、claimのpost guardで停止すると公開ticketは未発行のままである。新経路に限り、private保持sinkがある間はkernelの最小cleanup contextをclearで落とさない。固定`cleanupOwned`が同sinkのbegin→recordを一度だけ行える。旧経路にこの保持例外は適用せず、旧試験を維持する。割当てだけで未起動のroleはcreatingのまま保持し、not_requiredを終了／absenceへ昇格しない。

旧settleは同lease／元context検査後、終了とcleanupを別々にFailureOwnerへ写してから元の成功条件を判定する。片方が失敗してclosure evidenceを返せなくても、成立した片方のfactはclearで失わない。新cleanupは同frame／sink／開始serialに関する既存validStart・開始状態を、参照を消す前に検査する。同begin claimを通った開始済みframeのconfirmedだけをcleanup confirmedへ写し、その他は未確認／不成立のまま。終了factは別issuerがないためUnknown。source closeも同identityの閉鎖だけを写し、source cleanupは確認しない。

`bindings.*.cleanup_pending`は消費可能な固定sinkが残るかだけを示し、責務全体の解決判定ではない。sink消費後も役割の未解決facts／最小frame対応は残る。sourceのsettledもsource閉鎖の受理だけで、解放完了ではない。最終的なreleaseは既存FailureOwnerの別factsから保守的に導出する。

公開surfaceは固定の合成lifecycle操作とimmutableな限定診断だけ。seed／source／pins／private issuer／kernel object・accepted採用／seal／commit／最終discardは公開しない。hard後に通すのは既存新世代sinkのcleanup-only操作だけで、source／旧settleの新しいhard後実行口は追加しない。正常なsource closeはhealthy guardに従う。

追加費目は固定3roleの予約・出生写像、元100行上限内の準備値投影、明示Phase表、1回のclear前同一性照合、既存sinkの受理fact派生である。sink操作・C/G/P・retryを通知のために再実行せず、元210試行・全60秒を変更しない。同canonical予算・全work／heap・中断粒度・実cleanup／外側終了はUnknownのまま。

[合成試験](../tests/review/synthetic-failure-bound-kernel.test.ts)と[検証記録](E2E_BEST_PRACTICE_FAILURE_BINDING_FB02_2026-11-03.md)に、7初期point・独立終了／cleanup表・全guard・混入・再入・未公開sink・失効を記録する。FB-02 entryの上位slotは未受理のまま維持する。後続FB-03の移譲・停止／予算供給点は別entryとして§12へ接続した。accepted採用・実接続・実通信・設定変更・token／Permit／候補発行・Pushは行わない。

## 12 FB-03の同上位custody・固定最終discard・合成供給点

fresh entry `createSyntheticFailureCustodyRun`を、既存FB-02と同じprivate生成coreへ追加した。旧FB-01／FB-02 entryには上位操作を増やさない。新entryのstrict依存はguardとcleanup_guardだけで、既存owner・budget・上位receiver・任意capsuleの登録引数はない。DATAを読む前に同token、4role台帳、上位slot、resource slot、合成供給ownerを確保する。

resource slotはlocal／upperの2候補と一つのserialだけを持つ。同constructionの実際の合成kernel／固定cleanup操作objectを一つのcapsuleとして格納し、roleの診断コピーを渡すだけにはしない。transferFailureは既にfirst hardがある場合にだけ、固定seal→commitを一度行う。core commitのpost checkpoint後、同token／budget identityと空upper slotを照合済みのまま、capsule参照、report、custody holder、serial、commit receiptを同期確定する。確定区間にcaller callback／awaitはない。

commit receiptは同report・同capsule・同token／serialへprivateに結ぶ。finalDiscardはそのreceiptを先に消費し、同upperに同capsuleが残り、local slotが空であることを照合する。copy／foreign／report／余分引数は拒否し、失敗したclaimを戻さない。commit前の失敗はlocal、commit後のdiscard失敗はupperに責務が残る。元facadeに上位操作objectの直接lookupを残さず、各操作は現在のslotとholderを先に検査する。借り置きした旧操作関数もcommit直後から拒否する。元ownerのdiscardは上位capsuleの解放ではない。

上位facadeは固定cleanupOwnedとimmutableな診断だけを持つ。同kernelの唯一のsink consumerを使い、RoleBindingのfact受理先だけを同holderのupperへ切り替える。未公開frameのsinkも同capsuleで移る。seal済みreportは不変で、遅着cleanupはupper.currentだけを更新する。transport全件・source cleanup・新worker exitの不足はUnknownのままで、利用可能なcleanupを完了しても上位capsuleを自動discardしない。source／旧settleの新しいhard後実行口やhealthy routeは追加しない。

### 12.1 停止・予算の供給契約

同constructionで生成したfake budget identityをprivate seed.budgetへ渡し、同tokenと同budgetを検査してC/G/P prefix・開始UTC・全deadlineを一度pinする。resource slotとcommit／discardも同identityを照合する。残時間からdeadlineを再生成せず、新しいtimer／wall clockを作らない。pin前の失敗ではbudget_bound=false、prefix／開始UTC／deadline=nullのまま上位へ渡す。値がないことをゼロ予算や未生成証拠にしない。

cleanup_guardはseal／commit／discardとcleanupのpre／postに、同供給ownerからのimmutableな限定viewを受け取る。viewは実行権限を持たず、budget identity自体や本文・資格情報を含まない。取消／期限は停止観測へ保持し、cleanup-onlyの報告や解放を妨げず、先行hardを置換しない。まだhardがないcleanupで停止を観測した場合は、その停止を先に記録して健康側を失効してからcleanupだけを続ける。

guardのthrow／未知返値は固定internal_review_errorで止める。例外自身のcode／messageを信頼しない。共有busy／poisonにより、guardが内側の再入拒否を握り潰しても外側の移譲／discardを確定しない。cleanupのpre例外はsink未開始のまま残し、明示的な後続cleanup-only呼出しで処理できる。post例外は既に受理したfactを戻さず、消費済みsinkを再発行しない。待機・自動retryはない。

実sessionのcanonical budget／OS停止／cleanup deadlineの証明ではなく、合成供給点とprefix継続の検証だけである。

### 12.2 費目所有と独立計数

`fb03-fake-events-v1`はcount-onlyの合成イベントmodelで、各観測点を1件として数える。実work unit／heap／CPU費用の上界ではなく、全体受付には使用しない。

| 費目 | 唯一の計上元 |
| --- | --- |
| shell | construction先行slot確保時に1件 |
| budget_pin | 同token／budgetのprefix pin成功時に1件 |
| entry | local／upper／固定discardの操作入口。診断readは除外 |
| rejected_entry | owner／busyによるfrontdoor拒否だけ。全拒否費の総称ではない |
| healthy_checkpoint | OB-01／kernelのfake guard供給直前 |
| role_reservation | 同roleの生成ticket予約成功時 |
| role_fact | 同consumerが受理した個別birth／終了／cleanup／absence fact |
| clear_checkpoint | 最初のkernel clear前同一性照合に1件 |
| notice | 最初の供給／kernel失敗の固定writeに1件 |
| cleanup_request | 同roleの固定要求受理時 |
| terminal_receipt | 同sink／元contextの終端受領時。解放完了とは別 |
| cleanup_checkpoint | 各cleanup-only pre／post。throwの場合も到達1件 |
| seal／commit／discard | 各一度限りclaim占有時。失敗しても戻さない |

独立oracleの通常失敗→移譲→discard→上位cleanupは、上から順に1、1、10、0、24、3、6、1、1、2、2、8、1／1／1で計62件となる。内部modelから期待値を計算しない。C/G/Pは同prefixの10／20／30を維持し、移譲や通知のために再計上・retryしない。

台帳は固定15counter、総計4096件まで保持する。以降はsaturated=trueとし、未計数分・全workをUnknownへ残す。counter飽和で未解決責務やcleanup権限を捨てず、これを本番cap承認や正常受付に用いない。費目表にないJSON検査・投影・JS割当て等も含む全上界は未導出である。

[合成試験](../tests/review/synthetic-failure-custody-run.test.ts)と[検証記録](E2E_BEST_PRACTICE_FAILURE_BINDING_FB03_2026-11-03.md)で連続経路を確認する。FB-03が成立するのは閉鎖した合成範囲だけ。OB-02の同accepted／plan採用や移譲先seal、実origin／実会計・全work上界は別工程であり、正式発行口閉鎖・全体受付無効・調査保留を維持する。

## 13 正常系OB-02への接続設計

[同pins保持・private採用接続差分](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)で、正常内容の寿命と一度限りmove、同pinsを唯一のidentity起点にする新正常系、同accepted／planと内容を結ぶ移譲claimを設計した。新正常系の予算shellは同pins生成証拠へ一度結び、既存FB-03の固定identityやmodelを後から付け替えない。

hard時は同保護区間でnormal／pending／destとkernelのpayload参照を外したprivate receiptを必要とし、FailureOwner／上位capsuleへ本文を持ち込まない。未知の解放責務を保存する本書のcustody契約は維持する。後続NB-01〜03で同pins保持／private採用と一度限りtake・固定abort・PayloadClearedReceipt／同上位custody連結を別の閉鎖合成rootに実装した。同じFailureKernelLinkの出生・clear前保護を用い、新rootの一度結合済み予算参照／失効serialも照合する。旧FB-03のidentity／費目modelを変更せず、dest seal成功・正常終端・実予算／全体受付は未実装・未有効のままである。
