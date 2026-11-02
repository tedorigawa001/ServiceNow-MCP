# CT-B後半：worker job binding・T_i／E整合の詳細設計

Version: br006-worker-time-binding-draft-0.12 / Date: 2026-11-02。
Status: **WJ-Aの内部claim（§11）、WJ-BのT_i／U・analyze比較（§12）、WJ-Cの通常finish（§13）、SR-A／BとSR-C①の旧世代終了／世代なし証拠・one-shot消費（別設計§12〜14）を、配布対象外の合成issuerで限定実装。runtime／実worker・実回復route／新世代・WJ-Dは未接続／未実装。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実source差替え・実接続・実通信・設定変更・Permit発行・Pushの承認ではない。**

基準HEAD: `099dedf`。[上位接続契約](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)§4〜7と[CT-B前半](BEST_PRACTICE_ABORT_SCOPE_RELEASE_TIME_OWNER_CTB_DESIGN.md)の差分設計。TB-Bの固定fake準備処理内のdiscardを、既にworkerまで継続できる移譲と取り違えない。通常adapterへの切替・B-03・friend撤去は別工程。

## 1 現状と追加する境界

| 現行根拠 | 既にあるもの | 今回設計する差分 |
|---|---|---|
| [TB-B bridge](../src/servicenow/review-kernel/release-time-handoff.ts)／[session](../src/servicenow/bounded-read.ts) | accepted Oを同runの固定fake継続へ移し、正常source解放後に固定discard。run停止で同期失効 | 同じ生成元の一度限りの時刻leaseを、sessionが生存する固定worker継続へ接続する配置・寿命 |
| [worker監督](../src/review/worker-supervisor.ts) | 同worker listener、連番id、busy、元remaining／signal、262144 byte応答上限、失敗時terminate待ち | 親側のrun／source／origin・worker実体／世代・kind・対象／時刻に結合したprivate claim |
| [adapter](../src/review/update-set-adapter.ts) | 解析入力作成時にT_iを一度採る。worker期限型は旧終了後の新世代、phase期限型は既存workerを維持／未起動ならfinish用の初回起動で進む。停止後の部分finishも別にある | T_i採取済みinputの受領物、U保持、各応答の期待context照合 |
| [worker本体](../src/review/review-worker.ts)／[payload解析](../src/review/payload-review.ts) | data-only `{id,kind,input}`を処理し、`{id,ok,json}`を返す。reviewed_atは入力retrieved_at | 既存wireを増やさず、親の要求closureからkindと期待値を固定 |
| [finalize](../src/review/aggregate-finalize.ts)／[集約契約](../src/review/aggregate-schema.ts) | workerがEを一度採り、omission・全schema検証を行う | 親の非公開O／Uと同finish job、期待集約target／開始UTC／実効Lの照合 |

workerには独立したworker-protocol.tsはなく、現行wireは監督とworker本体に記述されている。readyにはjobのid／kind echoがなく、通常応答にもkind echoはない。存在しないfieldを検査前提にしない。

## 2 発行元・内部型・所有権

名称は役割案で実在APIではない。private生成継続だけを用い、public getter／外部session登録／任意callback・copyからの証拠昇格口は追加しない。

| 役割 | 唯一の発行元・所有者 | binding／消費 |
|---|---|---|
| RunTimeLease | 同runのCT-A accepted→TB-B固定移譲元。固定worker継続が一度受け取る | 同run／session／source／key／origin／canonical budget、元S／全L、O／U。JSONやinspect値から再構築不可 |
| AnalysisInputReceipt | 同選択payloadを受理し、既存入力を作る親の固定継続 | 同run／source／選択行／payload受領元、target ids、既存T_i、要求rule／release context。T_i受理claimはjobとは別 |
| WorkerGenerationLease | 監督の固定worker生成・ready受理継続 | 同run、監督object、実worker object、新しい世代identity。再生成・同じ数値idでも旧世代を再利用しない |
| AnalyzeJobClaim | 同親の固定postMessage継続 | 同RunTimeLease／input receipt／generation、実際に割り当てたid、kind=analyze、期待target／T_i。返却前に一度消費 |
| FinishJobClaim | 同親の固定finish継続 | 同run／source／origin／generation、kind=finish、実id、集約schema／target／S・最終Uと対象集合。runにつき一度だけ |
| TerminalTimeOwner | 固定上位終端継続 | E検査済み候補・固定cleanup／診断回収だけ。新job／HTTP／再採取の権限なし |

private identityは親processに残し、workerへstructured cloneしない。wireには既存data-only入力だけを渡す。数値id・日時・hashが一致しても同一性の証拠にしない。比較候補や時刻leaseはReleasePermitではなく、解析開始には既存のmatched／同sourceのrelease bindingを別に必要とする。

生成claimはcallback・guardより前に消費する。発行失敗・送信失敗・取消でも戻さない。世代leaseの生成元をcallerのfactory戻り値の形だけで認定しない。合成issuerの型・台帳をruntimeの正式発行へ共有しない。

## 3 寿命と正常source解放

現在のprepareNewReviewCompositionはprepared-onlyで終わり、TB-B値をdiscardしてsessionをcloseする。この公開挙動は変更しない。close後にそのsessionから新たなleaseを取り出す設計は禁止する。

将来の固定worker継続では、元session／runを生存させた区間でだけpayload取得・T_i受理・analyze／finish送信を行う。既存private生成元と固定継続を対にして移譲する配置をレビューし、単に#finishCompositionTimeのdiscardを削除して参照を残さない。正確なclass／module配置と移譲口の型は実装前レビュー事項で、現adapterへの接続済みとはしない。

正常source解放後は、**既にpendingのjobの返却検査・worker終了待ち・固定終端処理だけ**を許す。sourceを再登録したり、新しいanalyze／finishを発行したりしない。したがってfinishを送るならsource解放より前にclaimを確定する。現adapterはexecuteReview内でfinish応答を待ち、外側のreviewBoundedUpdateSetでworker.close待ち→finallyでsession.close→元残時間／取消の最終確認を行う。session.runで包んでいるとは仮定しない。解放を先へ移す必要はなく、解放後のpending許容は寿命契約の上界であって、今その順序へ変更する指示ではない。

production sourceに独立したclose APIがあるとは仮定しない。ここでの正常source解放はTB-Bのprivate protocolを一般化した役割で、実際のclass配置・正常終端のcleanup証拠とsession.closeの対応はWJ-D前のレビュー事項。sessionを閉じた後に新jobを作ること、異常closeを正常な証拠移譲に読み替えることは禁止する。

正常資源解放とrun取消／異常closeは別イベント。後者はsource用hookの有無にかかわらず全lease／pending job／候補を同期失効させる。source／session close後にraw参照から再発行しない。正常終端でS／L／O／U・identity・job参照を消す。異常停止では§4の巻戻し禁止のため、固定終端ownerがUTC値だけを診断用に保持し、固定discard時に消すことを許す。live identity・claim・再開権限は残さず、外部copy／heap物理消去の保証とはしない（合成WJ-Bの配置は§12）。

## 4 T_i受理とworker準備完了の分離

記号はS=構築時UTC、L=同deadlineMs getterの全deadline、O=同complete_200の観測UTC、U=最後に受理したUTC、T_i=解析入力のretrieved_at、E=worker集約のended_at。

1. S／全Lとpin済みrelease contextは元runからのみ取得し、remainingからLを再計算しない。初期時刻の受理後はU=O。空200でもOを保持する。
2. T_iは現adapterでpayloadとrecord_updated_atの検査後、analyze入力を作る位置にある同採取値を使う。別時計を追加せず、同input receiptで一度だけ受理する。
3. claimを先に消費し、pre-guard→同受領元／bounded値検査→`S <= O <= U <= T_i <= S+L`→post-guardの順とする。成功後U=T_i。等号は許可する。失敗時はrunを停止し、再採取・clamp・古いOの削除で救済しない。
4. 現監督は最初のCPU要求でworkerを遅延生成しreadyを待つ。通常はanalyze、解析0件などではfinishが最初の要求になる。T_i受理時にはまだ実worker／実idが存在し得ないため、**input receiptとjob claimを同時発行しない**。T_i／Uを保持し、その後ready済みgenerationへjobを結合する。
5. startup／ready・送信が失敗しても、受理済みT_iをUから消さない。rejected／result_omitted・集約omissionでも同様。input receiptの消費失敗を別workerでやり直さない。

not_requested／不正応答／非200からOを捏造しない。初期対象はcomplete_200由来かつ従来matchedの固定fake継続だけ。既存productionのrelease_unknown等の失敗集約を、この新契約だけを理由に変更しない。Oなし枝を新ownerで扱う場合は別のkind／受入契約を要する。

## 5 job発行・応答の一度限り受理

### 5.1 固定発行

ready受理で同実workerと世代を確認し、固定送信継続が実際のidを確定する。callerがsequence+1を推測してclaimを作らない。readyが内部sequenceを消費する現実装も保持する。idは正のsafe integer、overflow時は送信前に内部停止し、wrap／再採番で救済しない。

analyzeは未消費の同input receiptとready済みgenerationを一度結合する。job slotをpendingへ進めてから元run guard・送信を行い、同期throw／rejectでもterminalにする。同時pendingは既存どおり1。ready待ちは解析応答ではなく、ready通知でanalyze claimを消費しない。

### 5.2 analyze応答

同workerの同要求closure・generation・親idを確認し、pendingを先に取り外してconsumingへ進む。pre/post guard後だけacceptedにする。JSONのkind／tokenを信頼せず、kindは親closureから固定する。

親が追加する照合は次に限定する。workerによる既存full schema検証を無制限に重複させない。

- 既存262144 byte以下のenvelope／JSON検査を維持し、返却stateは現workerのreviewed／rejected／result_omittedだけ。全stateでupdate_xml_sys_idを要求assetへ照合する。
- reviewedではresult.targetのupdate_set_id／update_xml_sys_id、retrieved_atとresult.reviewed_atを送信値へ完全一致させる。target_version・instance_binding・要求rule集合／release contextも同要求の期待値と照合する。
- 親に既にあるmetadataや固定分類から導けないasset_sys_id／code_hash等を推測しない。payloadの再decode・再hashが必要な照合は別費目／別設計とし、今回の最初の実装に含めない。
- 返却のinvalid state／別asset／別時刻／別世代、重複・遅延応答は採用しない。時刻不整合をresult_omittedに変えて継続しない。

kind／idの正しい応答を受理しても、後続post-guardの取消／期限が優先する。先行停止済みjobを遅延JSONでacceptedへ戻さない。raw source・例外本文を診断に含めない。

## 6 finishのE照合・結果公開境界

同runの最終U、受理したtarget／T_i、集約schema_version・target・S・既存release contextを固定し、finish claimを送信前に一度消費する。解析0件・空200でもfinishのO／U下限を省略しない。

返却前後の元run guardと同finish jobの消費に加え、親は次を検査する。

1. schema_version、集約targetのupdate_set_sys_id／instance_binding、started_at=Sが要求と一致する。
2. workerが採った同Eについて`S <= O <= U <= E`かつ`E-S <= L`。等号は値境界として許可するが、元monotonic期限／phase guardに失敗すれば停止する。
3. 各reviewedの時刻は保存した同targetのT_iと一致し、E以下。rejected／omittedになった対象にも保存Uの下限を適用する。
4. 対象集合を別Update Set／別assetへ差し替えたり増やしたりしない。固定finalizeによるreviewed→result_omittedは許すが、非reviewed→reviewedへの昇格や不整合対象の黙示削除は許さない。集合・state照合の厳密な実装範囲は既存finalizeの規則と対にレビューする。
5. 既存JSON契約のdeadline宣言60000・設定expires_at制約も独立に満たす。実効低減Lを宣言値で延長せず、互換方針未確定のままJSONを変更しない。

Eを親で再採取・補正しない。worker側schema成功だけでO／Uとの整合を省略しない。正常結果も候補として保持し、worker終了確認・session cleanup・固定終端guardが成立するまで公開しない。終了未確認やcleanup失敗を正常なEで帳消しにしない。

## 7 停止・世代交換・診断

| 状態 | 成功遷移 | 失敗・再利用 |
|---|---|---|
| 時刻owner | held→active→finishing→validated→terminal | hard失敗／run失効でterminal。新S／Lで再開しない |
| input receipt | issued→consuming→retained | 二重受理不可。失敗後に別T_iで作り直さない |
| job | allocated→pending→consuming→accepted | 送信失敗・取消・期限・不正応答でterminal。claimを戻さない |
| generation | starting→ready→closing→closed | 旧worker終了確認前に新世代を開始しない。古いlistener／jobを継承しない |

binding／時計矛盾は既存internal_review_errorへ写像し、worker_unavailable／取消／元期限などの先行理由を保持する。新しい公開failure codeは追加しない。HTTP／cleanup・run・jobの固定診断は別slotで一度保持し、後続解放の失敗で先行理由を消さない。生成失敗では未発行jobを成功／cancel済みとして偽装しない。

現adapterのsoft partial finishは維持対象で、移行元は2種類ある（[adapter](../src/review/update-set-adapter.ts)のsoft分岐）。

- **worker期限型**：analysis段階の`ReviewWorkerError(deadline_exceeded)`。analyze送信後は旧jobをterminalにし、ready待ち中なら同inputを未送信のまま終端化する。旧workerのterminate／固定後始末完了を確認し、元runが健全で元残時間がある場合だけ新generationのfinishを許す。ready待ちに存在しないanalyze idを作らない。
- **phase期限型**：`BoundedReadError(phase_deadline_exceeded)`。metadata／payload／consistency等の段階を問わず、既存workerがあれば閉じず同generationを維持し、worker未起動ならfinish用の初回起動へ進む。consistency前かつ既存verify継続がある場合はsoft後に論理`verify()`を1回行う（親→metadataの2 GET、各最大1 retryで物理最大4試行。旧「GET1回」は訂正）。既にconsistencyなら再実行しない。旧generationの終了証拠は要求せず、pendingなし・元runの健全性／全体残時間を確認する。verifyは既存HTTP owner・費目のままで、追加の論理verifyや時計再採取として数えない。Uと元S／Lは引き継ぐ。hardな時計／binding不整合、取消、全体期限、終了未確認をsoft timeoutへ格下げしない。終端検査専用ownerや正常source解放後のownerは、新generation／finishを発行しない。

soft移行を公開のdeadline_exceededという文字列だけで認めない。生成元・phase／ready待ちか送信後か・世代状態と同runの健全な元予算観測を結合したprivateな回復claimを一度消費する。[soft回復claim詳細設計draft-0.8](BEST_PRACTICE_ABORT_SCOPE_SOFT_RECOVERY_CLAIM_DESIGN.md)に全発生点・失敗分類とSR-A〜Dを分離した。SR-A／Bに加えSR-C①の旧世代終了／世代なし証拠とone-shot消費を独立合成issuerで限定実装し、実生成元・実回復route・新世代・SR-C後半／Dは未実装。現fail／revoke後のidentityを復活させず、終端済みrunやcallerの「soft」申告から生成しない。

soft以外にも、停止後に途中結果をfinishする既存分岐がある。metadata段階の失敗と、payload／consistency段階のaccess_denied・upstream_unavailable・予算超過等では、未処理行を記録した部分集約／失敗集約をfinishで返す。receive_budget_exceededではsession自体が先に停止しており、その後も部分集約を返すことを既存試験（[adapter試験](../tests/review/update-set-adapter.test.ts)の累積予算試験）が保証する。この経路で§6の元run guardを要求すると既存の部分集約を失敗へ変えるため、初期範囲（WJ-A〜D）では新時刻契約の対象外とし、従来の部分finish・失敗集約を変更しない。停止済みrunでもO／U・T_iとEを照合する場合は、先行停止理由を固定保持し新job／generation・新GETを作らない停止後finish専用claimを別設計／別承認とする。対象外経路の集約を時刻検証済み・正常完了とは数えない。

## 8 費目・有限上限・不明事項

費目所有は、T_i受理／U更新とjob claimを親時刻owner、id／worker／listener／timer／terminateを既存監督、E採取・full schema・集約omissionを既存workerに置く。GETのC、受信G／P、final予約／retry・native cleanupは元ownerのまま。新GET・時計採取・新budget／期限延長を追加しない。

現行のselected／max_recordsは最大100、同時pendingは1。保存target／T_iは最大100、時計値は固定S／L／O／U。応答ごとに全履歴を走査せずanalyzeは同job、finishだけ最大100件の照合とする。要求rule集合も現行の有限契約を再利用し、private copyは必要な期待fieldだけ。payload／rowsを時刻確認のためだけに複製しない。

現adapter制御フローからはanalyze最大100、finish最大1、worker期限型soft移行によるworker世代最大2が候補上界となる（readyはjobとは別）。phase期限型は既存世代を交換せず、未起動の場合だけ初回の0→1となる。これは費目設計の仮説であり、独立イベントoracleで全成功／拒否／中断経路を数えるまで運用cap・全体受付の根拠にしない。既存のcatch分岐へ新たなfinish再試行を足さない。

claim／期待値copy・guard・失効・終了合流のexact layout／work上界はUnknown。日時長cap、低減LとJSON宣言deadlineの互換、選択payload／releaseの正式供給境界、終端ownerの正確な配置も承認／レビュー待ち。

## 9 合成受入条件（WJ-Aの部分確認は§11、全体の受入は未実施）

| ID | 独立に確認する条件 |
|---|---|
| WJ-01 | 同run／source／origin／budgetのleaseだけを一度移譲。copy／inspect・別runを拒否し、他runは不変 |
| WJ-02 | startup前に受理したT_iを、ready／送信失敗後もUに保持。O／S／Lの再採取・再pinなし |
| WJ-03 | 同idでも別worker／監督／世代／kind／assetを拒否。readyで解析claimを消費しない |
| WJ-04 | 発行／consume／返却pre/post guardの再入・取消・期限・closeで停止。重複／遅延応答で復活しない |
| WJ-05 | reviewed_at／target.retrieved_atとT_iの完全一致。1ms逆行・超過、同ms等号、T_i=S+Lと元guard期限切れを区別 |
| WJ-06 | rejected／omitted／集約omissionでもUを保持。解析0件・空200でもE<O／E<Uを拒否 |
| WJ-07 | E=S+LとS+L+1、別target／S／release、worker schema成功でも親時刻不整合を拒否。補正／再採取なし |
| WJ-08 | worker期限型はready待ち／送信後を区別し、旧世代終了後だけ新世代finish。phase期限型はpendingなしで既存世代維持／未起動から初回起動。必要verifyは既存HTTP費目で最大1。hard失敗・全体期限・取消では再開不可。元S／L／U不変 |
| WJ-09 | source解放後の新job禁止、run失効で既存pending／候補も破棄。終了確認・最終cleanup前に結果を公開しない |
| WJ-10 | C/G/P・予約返却／retry／時計採取・worker終了を独立oracleで確認。上位診断の非上書き・秘密非出力 |
| WJ-11 | 固定cleanup sectionを途中失敗後も通る保証を、最後のrollback救済と区別する。観測不能なら未確認のまま残す |
| WJ-12 | job／generation／失敗時終了の費目を全経路で計数。専用開発compiledと実class／値試験を別集計し、B-03完了へ流用しない |
| WJ-13 | 停止後の部分finish（metadata失敗・payload／consistencyの停止理由・受信／payload予算超過）は既存の部分集約・失敗集約を変えず、時刻検証済みと数えない。停止済みrunから新job／generation・新GETを作らない |

TB-Bレビューで判明したfinally継続の未保証は[TB-B記録§6](E2E_BEST_PRACTICE_RELEASE_TIME_HANDOFF_TBB_2026-11-01.md#6-レビュー修正2026-11-01)に残す。既存rollbackで最終資源数が0になることを、途中の全解放sectionを通った証明へ読み替えない。試験用の新public friend／runtime登録口は作らない。

## 10 推奨実装分割と非目標

1. **WJ-A（限定実装済み）**：合成issuerだけの内部binding・generation／input／job claim・one-shot／失効を純粋fakeで実装。時計値比較は元S／L／Oへの固定値入力とし、実worker／runtimeには接続しない。scope内の保証と未実装の全体保証は§11に分離する。
2. **WJ-B（合成issuerだけ限定実装）**：同input receiptのT_i受理、U保持とanalyze応答の期待値比較器を独立oracleで確認。startup・送信失敗、omitted、pre/post guardを含める。§12参照。runtimeへの供給／bindingは未実装。
3. **WJ-C（通常finishだけ限定実装）**：finishのE／対象集合・終了候補の一度限り消費を合成応答で確認（§13）。取得済みUを消さない。soft partialは[別の詳細設計draft-0.8](BEST_PRACTICE_ABORT_SCOPE_SOFT_RECOVERY_CLAIM_DESIGN.md)へ分け、SR-A／B・SR-C①の内部証拠消費を独立合成実装した。SR-C後半／Dの新世代・実接続は未実装である。
4. **WJ-D／CT-C**：私有の固定生成元・監督／注入channel・上位終端への連続fake接続を別承認で行う。現在のpublic prepared-onlyと通常adapterを維持する。
5. **B-03**：旧case対応表の未代替実class保証を残し、専用開発build／compiled・配布負の対照を別設計／別集計で確定する。今回の441ファイルの梱包成功で代替しない。

実Permit採用・正式発行・全体受付・本番cap・production adapter差替え、非200 fallback・friend撤去・実通信は非目標。draft-0.1／0.2は設計・文書検査のみ。draft-0.3のWJ-A限定実装と実施記録は次節へ分離する。

draft-0.2のレビュー修正：現adapterのsoft移行のうちphase期限型（同generationのままfinish、soft後verifyのGETあり）と、run停止後に部分集約をfinishする既存分岐（受信予算超過ではsession停止後も部分集約を返す）が抜けており、finish前後の元run guardをそのまま適用すると既存の部分集約を失敗へ変える設計になっていた。§1・§7・§8・WJ-08を2種類のsoft移行に分け、停止後の部分finishを初期範囲の対象外とするWJ-13を追加し、上位設計からの版数リンクも更新した。

## 11 WJ-Aの合成issuer限定実装・保証範囲

[合成issuer](../tests/support/review/synthetic-worker-job.ts)をtests/supportに置いた。runtimeのsession／registration／source／worker supervisorをimportせず、実classのclaim台帳とも共有しない。任意fakeのrun／session／source／key／origin／budgetと固定S／全L／O、Update Set idをdescriptorでpinし、各pre/post guardで同じ値・referenceを確認する。opaque handleは空の凍結objectで、発行元内のpointer／slot対応で消費する。copy・別issuer／世代・idだけの一致では通らない。

issuerあたりbindingは一度だけ。同じseedから別issuerを作ること自体は可能な非実行モデルであり、実sessionごとの唯一の生成証拠ではない。generationはstarting→ready→closing→closedをモデル化し、合成のconfirmClosedだけで前世代を解放する。この確認をOS terminate証拠と呼ばない。worker／supervisorは不透明なfake identityで、メソッドを呼ばない。閉じたworker identityは弱いtombstoneで再利用を拒否する。

inputはready前にも発行でき、同origin／targetを一度だけ登録する。時刻は固定のO <= T_i <= S+L、ISOミリ秒UTCだけを検査し、値を採取しない。WJ-AではinputのT_iをprivateに保持するだけで、連続T_iの非減少・U更新・結果のreviewed_at／Eとの一致はまだ検査しない。WJ-02／05〜08の全保証とは数えない。

analyzeは同ready generationと未消費inputを結合し、idの正のsafe integer・同世代内単調増加を検査する。finishは一度だけ。pending slotはguard前に占有し、consumeではguard前に取り外す。合成の返却contextは同generation／supervisor／worker／id／kind／targetをdescriptorで照合するが、実wire envelopeや結果JSONのparserではない。返る値はauthority:noneの凍結dataだけで、ReleasePermitや受理済み解析結果へ昇格しない。

24か所のライフサイクルpre/post guardで停止・捕捉再入・同期revokeを確認する。再入は、状態で既に拒否されるbindだけでなく、busy claimがなければ成功するinput／closeSource／analyze／finishをanalyze・consumeのguard内から呼んでも拒否し、新claimを公開しないことを別に確認する。失敗後は元binding／generation／input／pendingと時刻参照を消し、最初の固定code／phaseと数値counterだけを残す。正常source close後は新しいinput／generation／ready／jobを拒否し、既存pendingのconsumeと固定解放だけを許す。正常root close後の誤操作は拒否するがclosedや診断を書換えない。heapの物理消去やcallerが保存したcopyの破棄は主張しない。

合成モデル内の固定枠はgeneration最大2、input最大100、jobはinput一度ずつ＋finish一度の最大101、同時pending1。これは純粋試験を有限にする局所枠で、本番cap・§8の全既存分岐の導出済み上界ではない。公開handleを返せた生成数・post-guard後のconsume成功数をcounterに記録し、失敗試行の全費目を計数したとは主張しない。独立イベント列では100 input／100 analyze／1 finishとguard 610回を照合する。

新規[157件の合成試験](../tests/review/synthetic-worker-job.test.ts)、型・lint・配布負の対照・初回REDは[WJ-A検証記録](E2E_BEST_PRACTICE_WORKER_JOB_CLAIMS_WJA_2026-11-01.md)へ記録する。issuerは配布物に含めず、既存distへimport／宣言／mapが混入しないことも確認する。依存検査はI/O／timer／時計／worker系globalへの参照（呼出し形に限らない）・`Date.now`の値参照・`Date`のcomputed参照／生成を拒否し、意図的な混入を拒否する負の対照を持つ。字句検査であり、間接的なglobal取得を網羅した証明ではない。compiledされた開発assemblyの保証ではなく、B-03とは別。WJ-A自体の挙動は変更せず、WJ-Bは別owner（§12）、WJ-Cの通常finishは同ownerへの限定拡張（§13）とする。WJ-D・soft回復claim・停止後部分finishは未接続で、既存の2種類のsoft移行・部分集約を維持する。

draft-0.4のレビュー修正：WJ-Aの捕捉再入試験はguard内のbindだけを呼び、bindは状態で必ず拒否されるため、busy claimを外しても153件が通っていた。また依存検査は名前による直接呼出しだけを拒否し、`globalThis.setTimeout`・`queueMicrotask`・`Date.now`の値参照・`performance.now.call`を見逃し、検査自体の負の対照もなかった。正当な操作の再入試験4件と、参照単位の依存検査・混入負の対照を追加し、§11の件数・保証範囲と上位設計からの版数リンクを更新した。

## 12 WJ-B：同inputのT_i受理・U保持とanalyze比較（合成限定）

[WJ-B owner](../tests/support/review/synthetic-worker-time.ts)が非公開のWJ-A issuerを一つ所有する。runtimeのsession／source／workerはimportしない。公開面にWJ-Aの汎用consumeを再exportせず、analyzeは同inputに保存した期待値を必ず経由する。任意fake値は実sessionの証拠ではなく、正式供給元の唯一性・本番bindingを証明しない。

- 同じ10項目のseedをdescriptorでpinし、追加のpre/post guardでも同reference／値を確認する。Oを初期Uとし、`U <= T_i <= S+L`を検査し、**最後のpost-guard成功後だけ**Uを進める。等号を許す。input handleはorigin／target一度のWJ-A claimへ結合し、ready前に受理できる。時刻の採取・残時間からの再計算はない。
- inputは合成issuerの期待context（record_updated_at、instance binding、release証拠、rule集合、必要limitations）をdescriptor-copyする。時刻だけのreceiptも試験可能だが、analyzeには期待context付きreceiptを要求する。同jobへ結合する際に一度消費する。応答のpendingは**最初のguard前**に取り外し、WJ-Aの同generation／supervisor／worker／id／kind／target照合の後、同receiptの値を比較する。
- reviewedは§5.2の対象・T_i完全一致、target_version、元record_updated_at、instance binding、要求／applicable rule集合（重複拒否）、schema正規化したrelease contextの完全一致、必要limitationsの包含を検査する。追加engine limitationは許す。rejected／result_omittedは既存の理由契約と同targetだけを検査し、新しい時刻を作らない。state不正・時刻不整合をomittedへ救済しない。
- 既存値schemaだけを再利用し、findings等の全結果を親で再検証／copyしない。必要fieldのgetter／Proxyは拒否し、関係しないfindings getterは実行しない。full schema／262144-byte wire envelope検査は既存workerの責務で、WJ-Bが実wire検証したとはしない。必要contextの局所copyは深さ8・100配列要素・30object項目・10,000訪問node・保守的文字費262144以下。これは合成値projectionの枠で、本番日時長cap・全体メモリ上界の承認ではない。
- 比較エラーを候補状態として捕捉し、post-guardの取消／期限を優先してから固定理由で停止する。全guard成功後だけauthority:noneの凍結dataを返す。結果を正式review結果やPermitへ昇格しない。startup失敗・同期throw／reject相当のsend失敗・revokeでは全identity／input／pendingを失効させ、**受理済みS／L／O／Uのデータだけ**保持する。失敗後の再生成／再消費は拒否し、最初の固定code／phaseを残す。`discardTerminalTime`でUTCを破棄しても再開しない。正常closeでは時刻も破棄する。

[66件の試験](../tests/review/synthetic-worker-time.test.ts)は、独立したfield差替え表・100 inputの非減少UTC oracle、input全5guard／応答全6guard、startup／send失敗・取消・再入・混入・一度限り消費を確認する。時刻だけのreceiptからのanalyze発行、稼働中／正常close後の`discardTerminalTime`、ready済み世代への`startupFailure`は、それぞれ拒否されることを別に確認する。配布負の対照はWJ-Bの関数・path・runtime import／clock参照の混入を拒否する。WJ-Aの157件を維持する。実施結果・初回失敗は[WJ-B検証記録](E2E_BEST_PRACTICE_WORKER_TIME_WJB_2026-11-01.md)を参照する。

WJ-B時点のfinish／Eは未実装だった。通常finishの合成限定拡張は§13へ分離する。soft世代移行、上位への本番候補移譲・全体受付・exact layout／全費目は未実装／Unknown。WJ-C全体・WJ-D・B-03・CT-Cを完了とは数えず、従来のproduction adapter・停止後部分finishを変更しない。

draft-0.6のレビュー修正：WJ-Bの前提条件のうち、analyzeが期待context付きreceiptを要求すること、`discardTerminalTime`が停止後だけ許されること、`startupFailure`がstarting中の世代だけに適用されることの3点は、各判定を外す変異でも63件が通っていた。時刻だけのreceiptではrejected／result_omitted応答が同input期待値を経ずに受理され得た。3件の試験を追加し、§12の件数・保証範囲と上位設計からの版数リンクを更新した。

## 13 WJ-C：通常finishのE／対象集合と終了候補（合成限定）

同じ[WJ-B/C owner](../tests/support/review/synthetic-worker-time.ts)へ固定`finish`／`consumeFinish`／`consumeTerminal`を追加する。WJ-Aの汎用consumeは外へ出さず、同generation／supervisor／worker／id／kind=finishと、そのjobにpinした期待値を必ず経由する。実session・Permit・runtime台帳・実workerは接続しない。

### 13.1 送信前の固定集合

analyzeの全guard後に、同input receipt・受理state／reasonだけを最大100件保持する。元T_i／期待contextは再採取せず、findings／payloadを複製しない。finishは未解析receiptやpending jobがあれば停止する。最初のfinishだけをWJ-Aのclaimで発行し、同時pendingは1のまま。

fake issuerが渡す送信前集約projectionから、schema_version（0.2／0.3）・元S・target ids／target_version・instance binding・release context・要求rule集合・必要limitations・宣言deadline=60000と最大100件の集合をdescriptorでpinする。同targetの重複、受理済みinputの欠落、未受理reviewed、別instance／release contextを拒否する。受理済みreviewedは同T_i・元期待値を再照合する。親で既にresponse_limitによりomittedになったreviewedも、受理済みinputとUの記録は残す。

inputを作らないnot_applicable／skipped_deleted／retrieval_failed／not_processed等は、fake issuerの送信前集合からstate／reason／asset_typeを既存値schemaでpinする。この集合が実選択windowから発行された証拠は未接続で、任意の集約projection自体を本番の選択証拠へ昇格しない。固定集合のsource由来保証はWJ-D以降に残す。

### 13.2 応答・Eの検査

pendingを最初のguard前に取り外し、同finish jobを一度消費する。`S <= O <= U <= E <= S+L`を検査し、元S／全Lを更新・残時間から再計算しない。Eはworkerの同値を入力として受け取り、採取・clampしない。空200／0 inputでもOを下限にする。値上の等号を許しても、元guardの取消／期限は優先する。

同schema・元target／S・release／rule contextを照合し、宣言deadline=60000と設定証拠の`expires_at > S+60000`も独立に維持する。実効Lが短くても宣言値でLを延長せず、設定期限の検査も実効Lだけへ短縮しない。設定値の有効性・必要limitationsは既存`checkReleaseEvidence`を再利用する。

返却集合は送信前の集合と同一id集合とし、追加・欠落・重複を拒否する。順序は集合照合では固定しない。reviewedを保持する場合は同receiptのreviewed_at／retrieved_atとT_iの完全一致、同target／release／rule context、T_i<=Eを検査する。既存finalizeが行う`reviewed -> result_omitted(reason=response_limit)`だけを許し、response_truncatedを要求する。非reviewedの昇格・state／reason変更は拒否する。不正なreviewed時刻をomitで救済するために、未検証reviewedを送信前集合へ入れない。

これは親の追加context照合であり、count／findings／selection等を含む既存full schemaの再実装ではない。full schema・262144-byte wire検査は既存workerの責務のまま。局所copy・行数・rule数は§12の有限枠を再利用する。exact layout・work・運用capはUnknownで、全体受付は有効化しない。

### 13.3 終了候補と固定終端

応答の全guard後だけ空の凍結handleを返し、同owner内にE／集合件数の候補を保持する。handleやinspect値を結果／終了証拠として採用しない。取消・不正応答・送信失敗は候補／pendingを同期失効し、受理済みS／L／O／Uのデータと最初の固定code／phaseを保持する。

`consumeTerminal`は候補をguard前に一度消費し、同ownerの正常source close・generation close開始とconfirmClosedが成立した場合だけ進む。固定pre/post guard後、WJ-Aのroot close（そのpre/post guardを含む）を完了させ、時刻・identity・集合を破棄してからauthority:noneの限定summary（同E・集合件数だけ）を返す。解放未確認・取消・再入・別owner／copy・二重消費では返さない。通常の`close`で未消費候補を捨てることもできる。

このsource／worker／root closeは**合成lifecycle状態の確認**であり、実OS終了・実session cleanupの証明ではない。上位へ正式結果を公開する口は作らず、実cleanupと外側の最終checkpointを連結する保証はWJ-D／CT-Cに残す。SR-Aは別の独立合成issuerで内部観測／回復slotと診断だけを限定実装し、WJ-C ownerへ回復route・世代交換を接続していない。hard失敗後のfinish再開は追加せず、既存productionの2種類のsoft移行・停止後部分集約は変更しない。

[82件の合成試験](../tests/review/synthetic-worker-finish.test.ts)は独立E／field／集合oracle、100件境界、長さを保った重複による欠落の隠蔽、送信前集合とanalyze記録（期待context・rejected理由・親側のresponse_limit omission）の照合、`checkReleaseEvidence`による観測時刻／必要limitationの拒否、issue全4guard・応答全6guard・終端全4guard、混入・再入・取消・解放不足・設定期限を確認する。既存WJ-A 157件／WJ-B 66件を維持する。初回RED・型検査の未使用fixture定数・最終検証は[WJ-C検証記録](E2E_BEST_PRACTICE_WORKER_FINISH_WJC_2026-11-02.md)へ記録する。

draft-0.7のレビュー修正：WJ-Cの次の判定は、各判定を外す変異でも76件が通っていた。返却集合の`seen`照合（同じ長さで重複idが欠落idを隠す応答）、送信前集合のheaderと受理済みinputの期待contextの照合、analyze済みrejected／result_omittedの理由保持、親側で既にresponse_limitによりomitされたreviewedの受理、`checkReleaseEvidence`の再利用（観測時刻がEより後、0 inputで必要limitationなし）。6件の試験を追加し、§13の件数・保証範囲と上位設計・検証記録からの版数リンクを更新した。
