# RC-03：比較器入力化・上位時刻整合の接続契約

Version: br006-release-comparison-time-binding-draft-0.8 / Date: 2026-11-01。
Status: **CT-Aの受領物・固定入力化・一度限りの非実行候補受理をfixed fake継続だけに限定実装（§10）。TB-A／Bで上位時刻値scopeとCT-A／元run失効を同fake経路だけに接続した。worker job／T_i／E・CT-C・比較候補の実source採用は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実source差替え・実接続・実通信・実機操作・設定変更・実Permit発行・Pushは行わない。**

設計基準`01ac88d`、CT-A基準`4c691ed`。[RC-03親設計](BEST_PRACTICE_ABORT_SCOPE_RELEASE_ADOPTION_RC03_DESIGN.md)、[deadline再利用契約](BEST_PRACTICE_ABORT_SCOPE_RELEASE_DEADLINE_REUSE_DESIGN.md)、[観測UTC契約](BEST_PRACTICE_ABORT_SCOPE_RELEASE_OBSERVATION_UTC_DESIGN.md)の次段階を対にする。①同projection／sourceの値から固定比較器入力を作る、②空200を含むOを保持し同worker jobのT_i／Eを照合する。CT-Aの限定範囲は§10に分離し、片方だけの成功で上位まで結合済みとは数えない。

## 1 現在あるもの・不足するもの

| 根拠 | 現状 | CT-Aの範囲と残る差分 |
|---|---|---|
| [session](../src/servicenow/bounded-read.ts)のRP-01 | 同this／source／composition key・originに結合したS／全L／pin済みPを一度生成・消費 | CT-A／TB-Bで同受領物・比較候補と固定fakeの時刻移譲まで限定継続。worker終端への移譲は未実装 |
| [source](../src/review/bounded-source.ts)とOU-01 | 同rows projection後のguardからUTCを一度採取し、fakeの既存分岐で再利用 | CT-Aで元ack・同rows／Oを渡すprivate hookと一体のreceiptを追加。OU-01のUTC文字列だけを同一性証拠にはしない |
| [純粋比較器](../src/servicenow/review-kernel/release-comparison.ts) | strict値入力・固定判断・凍結非実行draft。時計／session／Permitなし | CT-Aで固定入力化とprivate候補受理のみ接続。legacy判定・実Permitへの採用は未実施 |
| [worker監督](../src/review/worker-supervisor.ts) | workerごとの連番id・1要求ずつの処理・同workerのlistener・最大262144 byte・元残時間／取消・失敗時close | 親側のrun／source／projectionとworker世代／job claimの結合、返却時刻と期待assetの照合 |
| [adapter](../src/review/update-set-adapter.ts)／[集約finalize](../src/review/aggregate-finalize.ts) | payload取得UTCをreviewed_atに使用。workerがEを採りschema検証 | 空200の非公開Oと最後のT_iを親側に保持し、同jobの返却前後で検査 |

現在のfixed fake継続にworker解析・集約までの接続はない。既存production adapterも、新たなprivate O ownerを参照してはいない。workerの現在の親側検査は限定的なenvelope／結果形検査であり、本契約の厳密なjob／時刻照合が実装済みとは扱わない。通常実sourceの値判定は変更しない。

## 2 供給元・所有権・identityの結合

以下はprivateな内部型の**役割名案**。公開API・既存実装名・権限tokenではなく、正確な配置は実装レビューで確定する。新friend・外部session登録・callerのrows／日時採用口は作らない。

| 役割 | 固定発行元／保持先 | 必須binding・禁止事項 |
|---|---|---|
| ProjectionLease | RP-01の元sessionが生成し、一度消費した値を同run内の継続へ移す | 同session／source／key／origin。S・全L・Pはその値だけ。remainingから再計算・provider再実行禁止 |
| RowsObservationReceipt | 同sourceのprivate body ack消費・行projection・OU採取／guardを完了する固定継続 | 同projection origin／run／source／keyと、そのack消費claim。rowsとOを別々のcaller値から寄せ集めない |
| ComparisonSlot | 同run ownerが受領物を一度消費して固定比較器結果を保持 | 原受領物／projectionとの結合。JSON・hex・draftの形や値の一致だけで採用しない |
| TimeOwner | 同run ownerがS／LとO・最後の受理UTCを保持 | source close後の新発行は禁止。終端検査を担当する上位ownerへ必要な値だけを固定移譲する |
| WorkerJobClaim | 親の固定dispatch継続が各要求前に生成 | 同run／source／origin、同worker object／世代、job kind、監督id、親側の唯一のclaim identityと期待target／T_i。数値id単独は証拠でない |

rowsは同body bytesの既存decode／projectionの結果を使い、比較のための再取得・再decode・別body採用をしない。receiptの発行時にboundedなprivate copyを作る場合は行最大21／各build_name最大40の既存制約を保持し、copy費を計上する。受信bytesは元ownerが既に課金しており、receipt作成でC/G/Pを再課金しない。ack／attemptの実際の固定対応が追跡できなければreceiptを発行しない。後付けUUIDやdigestだけで生成元を証明したことにしない。

workerへ渡るのは既存のdata-only解析入力／集約入力だけで、session・receipt・private tokenをstructured cloneしない。親側のclaimは送信元objectと固定継続が保持し、返却JSONから再構築しない。workerを作り直す場合は世代identityも新しくし、同じ連番idが再登場しても別jobとして扱う。

## 3 比較器への固定入力化と一度限り消費

complete_200の順序案は、**同projection消費→同body／ackの一度限り受理→行projection→取得後guard→OU-01のO採取→post-guard→receipt発行→receipt消費→固定入力生成→比較前guard→固定compareRelease→比較後guard→private slot受理**。

1. receipt発行claimをcallback前に消費し、同sourceのrowsと同Oを不可分の観測として固定する。Oは空配列・不完全・未知・21行にも必要。再入・二重発行・別ack／別source／別projectionの混入は拒否する。
2. 消費側はreceiptをslot／台帳から先に除去してconsumingへ進む。同identity・origin・生存を検査し、失敗してもreceipt／projectionのclaimを戻さない。
3. 生成する値入力は次の表に限定し、固定モデルを使う。callerのschema型・公開draftを採用済み入力と見なさない。

| 比較器field | 唯一の供給元 |
|---|---|
| model_id | 固定release-comparison-v1 |
| timing.started_at | 同ProjectionLeaseのS |
| timing.deadline_ms | 同ProjectionLeaseの全L。元の設定pin値と一致 |
| timing.observed_at | 同RowsObservationReceiptのO。再採取しない |
| policy | 同ProjectionLeaseのpin済みP。assertion／issueを再判定して書換えない |
| observation | 固定kind=complete_200と同receiptのrows |

4. pre/post guardでは同session／source／key・origin・元停止ownerを維持する。比較器を注入関数に置換しない。比較器invalid_inputはtrusted入力矛盾として内部停止し、先行取消等は保持する。
5. 正常draftを一度だけComparisonSlotへ移す。unknown／mismatchedも値比較の正常結果であり、解析開始やPermitの権限ではない。コピーを既存`#completeRelease`へ渡す、warningsを再付与する、公開snapshotを凍結強化する等の実source差替えは今回の接続範囲に含めない。
6. 最初のfake段階は比較候補・整合診断の内部確認に限定し、既存legacy判定を比較結果で上書きしない。既存fake baselineの内部Permit動作を、新候補が発行・有効化したとも説明しない。試験用summaryが必要なら別途その非実行出力契約をレビューし、任意のprivate状態取得friendを追加しない。

not_requestedは、別途確定した同ownerの**dispatch前**の不取得claimがある場合だけの枝とし、Oを持たない。現fixed fake経路はbinding不一致でもrelease bodyをdispatch済みのため、これをnot_requested receiptに偽装しない。D03の別assemblyのGET=0保証を流用しない。invalid_observation・非200／native・cleanup未確認のreceiptを空200へ変換することも禁止する。

## 4 空200のUTC保持と上位ownerへの移譲

TimeOwnerはS／全L、complete_200のO、最後に受理したUTC U、先行停止・終端状態を持つ案。P／rows／bodyを時刻検証のためだけに保持し続けない。初期U=S、受領物のOを検査してU=Oとし、後続のT_iで更新する。等号は許可し、逆行／S+L超過は固定内部停止。mono guardの期限・取消は別に必須で、UTC値で延長しない。

空200で比較結果がoperator_config／source:noneになっても、Oを同TimeOwnerへ一度保存する。公開evidenceにobserved_atを足さず、後でevidenceからOを復元する設計にしない。review対象0件でも最終Eとの照合は必要。

下位の観測slot／観測ownerを正常終端としてcloseする前に、上位の固定終端ownerへ必要なS／L／O／Uと結合identityを一度だけ移譲する案。元slotは先に消費して原ownerを失効し、移譲先の検査成功後だけ終端検証を継続する。source close後にraw参照をたどって新しい証拠を発行しない。実sessionの取消／異常closeを正常移譲に読み替えて復活させず、元runの生存が必要な受理guardを省略しない。移譲が成立しなければ結果非公開で停止する。

上位ownerは新たな解析・dispatch・再採取の権限を持たず、既に発行したworker jobの終端照合・診断保持・固定cleanupだけを担当する。値の保持を新しいReleasePermit／source登録へ昇格させない。終端結果受理／失敗の後はUTC・identity参照も破棄し、固定診断copyだけを残す。保持したOは外部の時刻証明ではない。

## 5 worker jobの発行・応答消費

### analyze

1. 既存adapterが取得時に一度採るT_iを、変更せずretrieved_at／reviewed_atの期待値として使う。元run guard後にS <= O <= U <= T_i、T_i <= S+Lを検査し、UをT_iへ進めてjob claimを作る。送信失敗でも取得済み時刻をUから消さない。Oがない不取得枝で解析を開始しない。
2. claimは送信前にpendingへ一度進め、同worker instance／世代・kind=analyze・id・期待update_xml_sys_id・要求rule／release contextとT_iを固定する。新しいtimer／予算を作らず、既存監督と元残時間を使う。
3. 応答受理では同workerの同要求closureとidを照合し、pendingを消費してから検査する。kindは親の要求closureから固定し、現在のwire応答にkind echoがあると仮定したり、新fieldを追加したりしない。そのkindに対応するbody形と全stateのupdate_xml_sys_idを期待assetへ照合し、reviewedならさらにresult.reviewed_atとtarget.retrieved_atが渡したT_iと一致することを確認。別asset・別時刻・別世代・重複応答は採用しない。
4. rejected／result_omittedや集約時のomissionでも、取得済みT_iをprivateなUから消さない。時刻を持たない結果shapeへ変わったことを理由に、最終E検査の下限を下げない。時刻不整合のassetを黙って落として成功へ救済しない。

### finish

1. 同run／source／projection originと、保持O／U・受理済みjob群を固定したfinish claimを送信前に消費する。claimは同時に1つ。任意の集約JSONから元contextを復元しない。
2. workerは既存finalizeで一度採ったEと既存schemaを使う。親は戻った同finish jobの結果について、S <= E、O <= E（complete_200）、U <= E、E−S <= 全L、各受理済みreviewed_at <= Eを確認する。Oが公開evidenceにない空200／review0件でも同じ。
3. 既存schemaの宣言deadlineやoperator_config有効性制約も満たすことを必要とする。現adapterの宣言60000と実効低減Lは別に検査し、宣言値を実効期限の延長に使わない。供給統一・JSON契約変更は別レビュー。
4. Eを親で再採取・clamp・書換えしない。workerでのvalidation成功だけで親の非公開Oとの整合を省略しない。元予算／取消・worker終了確認・session cleanupの検査も残す。

現在の監督にはsequence・busy・同workerのlistener・終了処理があるが、本契約のprivate job claimやO／U結合はない。ready通知は解析job応答ではなく、同identity証拠として扱わない。通常のfull schema検証はtrusted worker、追加の期待context／時刻照合は親の責務として分け、全契約の再decode／無制限copyを親へ追加しない。

## 6 状態遷移と固定失敗

| owner／claim | 成功時の順序案 | 拒否・失効 |
|---|---|---|
| receipt／comparison | issued→consuming→compared→consumed | 任意の順序違い・二重消費・再入でfailed。issuedへ戻さない |
| TimeOwner | bound→observed→reviewing（0回以上）→finishing→sealed | clock／binding／時刻矛盾でfailed、closeでclosed。新sourceで復活しない |
| job | issued→pending→consuming→accepted | 送信失敗・取消・timeout・不正応答でterminal。遅延応答で復活しない |
| 上位終端移譲 | vacant→transferring→held→consumed | 別run／source／job・copy／二重移譲を拒否。失敗した原slotを再発行しない |

同identity／job混入、trusted入力矛盾、UTC逆行、期待時刻の不一致は既存公開codeのinternal_review_errorとして停止し、HTTP／cleanupとrunの先行診断を消さない。取消／close／元deadline／phase deadline・worker_unavailable等は既存の原因層と制御を維持する。新しい公開failure codeを追加しない。raw rows・body・資格情報・例外本文・private token／contextを固定診断へ混ぜない。

hardなbinding／clock／内部矛盾でrun ownerが失効した後は、再採取・再比較・新jobでの再開を拒否する。一方、既存仕様が認める解析phaseの早期打切り→partial集約は、それだけで新たに禁止しない。旧解析jobはterminalにし、元runが健全で元残時間がある場合だけ、既存の手順で新worker世代のfinish jobを発行する。旧job／claim・失敗理由を使い回す、元S／Lを更新する、硬い時刻矛盾をsoft timeout扱いにする救済は禁止する。

## 7 費目・共有予算

receipt／rows copy・比較入力copy・結果copy・UTC保持・job claim／照合・移譲guardが追加費目。rows21、build_name40、選択asset100、同時worker要求1の既存有限範囲を守る。Uの更新は固定比較、E照合は既存の受理済み最大100件内で行い、worker messageごとに無関係な全履歴を再走査しない。exact layout／work・同期時間上界は未導出で、全体受付の根拠にしない。

GETのC、同bytesのG／P、final予約／返却、retry、native cleanup、workerメモリ／message上限は既存ownerへ残す。比較と時刻整合のための追加GET／chunk課金・期限更新・新budgetを作らない。元60秒・210試行・受信上限を維持する。job送信はHTTPのCではなく、worker監督の元予算内の操作として区別する。

## 8 合成受入条件（未実装・未実施）

| ID | 独立に期待する条件 |
|---|---|
| CT-01 | 同projection／receiptのS／全L／P／rows／Oだけで固定入力生成。同body・同ack消費元を追跡し、別source／key／clone・公開draftを拒否 |
| CT-02 | 発行・consume・比較・受理の再入／二度目、失敗後再開、close後発行を拒否。claimを戻さず他runを変更しない |
| CT-03 | 空200／全空もO保持。operator_config／source:noneの公開shapeを増やさず、正常なreview0件はO<=Eで成立 |
| CT-04 | 比較前後・receipt受理／上位移譲前後の取消／close／元期限を確認。計算済みdraftより先行停止を優先 |
| CT-05 | 同じ数値idでも別worker世代／source／target／kindを拒否。重複／遅延／timeout後応答でterminal jobを復活させない |
| CT-06 | reviewed_at／retrieved_atと送信T_iの完全一致、各T_iの非減少。rejected／omitted／集約omissionでもUを保持 |
| CT-07 | T_i／Eの1ms逆行、Oより前のE、E=S+L／S+L+1、同ms等号を確認。補正・再採取・証拠削除による救済なし |
| CT-08 | public evidenceにOがない空200と、異なるworker時計でも親が保持Oで検査。worker schema成功だけの不整合結果を拒否 |
| CT-09 | 低減Lと宣言deadline、設定expires_atの厳密境界を別検査。provider再実行・remainingによる再pinなし |
| CT-10 | C/G/P・予約返却／cleanup・worker終了と先行診断を独立oracleで確認。hard失敗と既存soft partial処理を混同しない |
| CT-11 | 非実行比較結果で実Permit／source登録を増やさず、旧legacy出力・warnings／copy可変性を維持。not_requested／非200の偽装なし |
| CT-12 | 旧実class回帰を維持し、B-03の専用開発build／compiled試験は別process・別集計。配布物へのdev口混入は負の対照で拒否 |

## 9 推奨分割と未解決事項

1. **CT-A（限定実装済み、§10）**：同projection・同sourceのrows／O receiptと比較器入力生成、非実行private候補の一度限り受理をfake依存で確認。上位owner用Oを失わない内部保持契約も同時に置く。
2. **CT-B（前半だけruntime classのfake経路へ限定接続）**：TimeOwnerと親側job claimを合成worker応答へ接続し、T_i／E・空200・omission・世代混入／遅延を検証。通常実source／adapter切替はしない。前半の[上位時刻owner・一度限りの終端移譲draft-0.7](BEST_PRACTICE_ABORT_SCOPE_RELEASE_TIME_OWNER_CTB_DESIGN.md)でTB-A／Bを限定実装し、固定fake継続のCT-A accepted消費・正常source cleanupと元run失効・固定discardを接続した。後半は[worker job binding・T_i／E詳細設計draft-0.5](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)へ分離した。WJ-Aの内部claimとWJ-BのT_i／U・analyze期待値照合を配布対象外の合成issuerだけで限定実装し、実worker／runtime台帳には未接続。WJ-C／DとCT-Cは未実装／未実施。
3. **CT-C（設計案）**：固定継続の連続fake試験・診断合流／解放を確認する。B-03のcompiled保証とは別集計にする。

上位への終端移譲・ownerとjob claimの正確な配置、低減Lと出力宣言の互換方針、全体費目／日時長capは未確定。今回の型役割・分割名は実在APIではない。実source判定／Permit採用・非200/native移行・friend撤去・全体受付の有効化は別承認。

draft-0.1作成時は既存コード・設計の読取とMD更新・参照／差分検査のみ。RP-01／OU-01やD01〜03の過去件数をCT保証へ流用しない。CT-Aでもworker protocol／公開JSONは変更しない。

## 10 CT-Aの限定実装・試験保証の区別

[値専用receipt owner](../src/servicenow/review-kernel/release-comparison-receipt.ts)を追加した。生成時に同projection referenceとS／L／P・session／source／key、元ack identity、check／rejectを固定する。issueはpre-guard前に発行claimを消費し、同projection／ackだけのrows／Oからstrict値入力をcopyしてopaque receiptを発行する。compareはreceiptを先にMapから削除し固定compareReleaseだけを呼ぶ。acceptもcandidateを先に消費し、post-guard後にだけ凍結された非実行draftとOを保持する。二度目・混入・再入・順序違い・失敗後再開を拒否し、失敗／closeでrows／O／draftを破棄する。

pin済みPは元のidentityのまま保持するが、比較の値projectionではassertion／issueがundefinedのときだけ当該optional keyを省略する。pin関数が有効設定にもown issue:undefinedを持つため必要な構造正規化であり、policyの意味再判定・元object変更ではない。未知fieldを選別して捨てたり、strict parserを緩めたりしない。

[source](../src/review/bounded-source.ts)の既存creator-only継続にoptionalなacceptReleaseObservationを追加し、元ack・同project済みrows・OU-01の同Oを、post-guard後に同sessionの固定callbackへ渡す。[session](../src/servicenow/bounded-read.ts)は元mint済みackと消費済みprojectionに結合したownerをprivate fieldで保持し、同origin／source／keyと生存を各段階で再検査する。callback内でissue→compare→acceptを固定接続する。新public getter／friend／caller入力／registryはなく、通常GETにはこのhookを渡さない。

accepted Oは空200でも同owner内に保持する。公開assertion／source:noneへobserved_atを追加せず、candidateもsession summaryへ出さない。既存legacyの値判定・内部Permit・prepared結果を比較候補で置換しない。CT-A時点では同期失効／finally／rollback／closeでownerをcloseし、cleanup後にOを復元できなかった。TB-Bで同accepted値を一度消費する固定移譲を追加したが、legacy非admittedなら移譲せず、元run失効でも上位値を消す。正常source cleanup後に保持するのは固定discardまでで、worker jobへの継続はまだない。

値ownerは任意のfake objectでも作成可能な内部値部品で、それ自体は実sessionの真正性を認定しない。unitの.inspectは非実行dataだけを返し、runtimeのprivate fieldは公開されない。unitで一度限り／混入／候補値を確認する保証と、実classの固定hook接続・既存結果／会計維持の保証を分ける。runtime候補を直接取り出す新friendは追加していないため、返却summaryから内部draftを読めたという主張もしない。

[CT-A検証記録](E2E_BEST_PRACTICE_RELEASE_COMPARISON_CTA_2026-11-01.md)に新規40件・初回10件失敗と正規化修正・回帰／型／梱包／全体結果を記録する。rows／入力／結果copy・Map最大各1枠・O保持とguardが追加費目で、C/G/P・予約／cleanupの再課金はしない。TB-Bの固定fake移譲・正常cleanupとrun失効は§9の子設計へ分離し、exact layout／全体workはUnknown。worker job／T_i／E・CT-C・B-03・日時長cap・通常実source採用は引き続き未実装／未承認。

draft-0.3の版数整理：CT-B前半の[上位時刻owner設計](BEST_PRACTICE_ABORT_SCOPE_RELEASE_TIME_OWNER_CTB_DESIGN.md)への参照を本文へ追加した変更で版数を上げていなかったため、版を上げ参照元のリンクを更新した。
