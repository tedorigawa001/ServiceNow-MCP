# CT-B後半：worker job binding・T_i／E整合の詳細設計

Version: br006-worker-time-binding-draft-0.2 / Date: 2026-11-01。
Status: **設計案のみ。以下の内部型・job claim・時刻照合・合成受入試験は未実装／未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実source差替え・実接続・実通信・設定変更・Permit発行・Pushの承認ではない。**

基準HEAD: `099dedf`。[上位接続契約](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)§4〜7と[CT-B前半](BEST_PRACTICE_ABORT_SCOPE_RELEASE_TIME_OWNER_CTB_DESIGN.md)の差分設計。TB-Bの固定fake準備処理内のdiscardを、既にworkerまで継続できる移譲と取り違えない。通常adapterへの切替・B-03・friend撤去は別工程。

## 1 現状と追加する境界

| 現行根拠 | 既にあるもの | 今回設計する差分 |
|---|---|---|
| [TB-B bridge](../src/servicenow/review-kernel/release-time-handoff.ts)／[session](../src/servicenow/bounded-read.ts) | accepted Oを同runの固定fake継続へ移し、正常source解放後に固定discard。run停止で同期失効 | 同じ生成元の一度限りの時刻leaseを、sessionが生存する固定worker継続へ接続する配置・寿命 |
| [worker監督](../src/review/worker-supervisor.ts) | 同worker listener、連番id、busy、元remaining／signal、262144 byte応答上限、失敗時terminate待ち | 親側のrun／source／origin・worker実体／世代・kind・対象／時刻に結合したprivate claim |
| [adapter](../src/review/update-set-adapter.ts) | 解析入力作成時にT_iを一度採る。soft移行は2種類（analysis中のworker期限では旧workerを閉じて新世代、phase期限では同workerのまま）でfinishへ進み、停止後に途中結果をfinishする部分集約分岐もある | T_i採取済みinputの受領物、U保持、各応答の期待context照合 |
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

正常資源解放とrun取消／異常closeは別イベント。後者はsource用hookの有無にかかわらず全lease／pending job／候補を同期失効させる。source／session close後にraw参照から再発行しない。終端でS／L／O／U・identity・job参照を消し、固定理由／phaseの診断copyだけ残す。

## 4 T_i受理とworker準備完了の分離

記号はS=構築時UTC、L=同deadlineMs getterの全deadline、O=同complete_200の観測UTC、U=最後に受理したUTC、T_i=解析入力のretrieved_at、E=worker集約のended_at。

1. S／全Lとpin済みrelease contextは元runからのみ取得し、remainingからLを再計算しない。初期時刻の受理後はU=O。空200でもOを保持する。
2. T_iは現adapterでpayloadとrecord_updated_atの検査後、analyze入力を作る位置にある同採取値を使う。別時計を追加せず、同input receiptで一度だけ受理する。
3. claimを先に消費し、pre-guard→同受領元／bounded値検査→`S <= O <= U <= T_i <= S+L`→post-guardの順とする。成功後U=T_i。等号は許可する。失敗時はrunを停止し、再採取・clamp・古いOの削除で救済しない。
4. 現監督は最初のanalyze呼出しでworkerを生成しreadyを待つ。T_i受理時にはまだ実worker／実idが存在し得ないため、**input receiptとjob claimを同時発行しない**。T_i／Uを保持し、その後ready済みgenerationへjobを結合する。
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

- **worker期限型**：analysis段階の`ReviewWorkerError(deadline_exceeded)`。旧jobをterminalにし、旧workerのterminate完了を確認し、元runが健全で元残時間がある場合だけ新generationのfinishを許す。
- **phase期限型**：`BoundedReadError(phase_deadline_exceeded)`。metadata／payload／consistency等の段階を問わず、workerを閉じず**同generationのまま**finishする。consistency前ならsoft後に既存の`verify()`のGETを1回行う。旧generationの終了確認は存在しないため要求せず、代わりに同generationにpending jobがないこと・元runが健全で元残時間があることを確認する。soft後のverify GETは既存HTTP owner・費目のままで、新GETや再採取として数えない。Uと元S／Lは引き継ぐ。hardな時計／binding不整合、取消、全体期限、終了未確認をsoft timeoutへ格下げして再開しない。終端検査専用ownerや正常source解放後のownerは、新generation／finishを発行しない。

soft移行を公開のdeadline_exceededという文字列だけで認めない。移行元の種類（worker期限型は固定監督の解析phase・旧generation終了確認、phase期限型は同generationのpendingなし・元phase期限の観測）と同runの健全な元予算観測を結合したprivateな回復claimを一度消費する案とし、終端済みのrunや任意callerの「soft」申告から生成しない。このclaimの正確な型と失敗分類はWJ-Cの実装レビュー事項。

soft以外にも、停止後に途中結果をfinishする既存分岐がある。metadata段階の失敗と、payload／consistency段階のaccess_denied・upstream_unavailable・予算超過等では、未処理行を記録した部分集約／失敗集約をfinishで返す。receive_budget_exceededではsession自体が先に停止しており、その後も部分集約を返すことを既存試験（[adapter試験](../tests/review/update-set-adapter.test.ts)の累積予算試験）が保証する。この経路で§6の元run guardを要求すると既存の部分集約を失敗へ変えるため、初期範囲（WJ-A〜D）では新時刻契約の対象外とし、従来の部分finish・失敗集約を変更しない。停止済みrunでもO／U・T_iとEを照合する場合は、先行停止理由を固定保持し新job／generation・新GETを作らない停止後finish専用claimを別設計／別承認とする。対象外経路の集約を時刻検証済み・正常完了とは数えない。

## 8 費目・有限上限・不明事項

費目所有は、T_i受理／U更新とjob claimを親時刻owner、id／worker／listener／timer／terminateを既存監督、E採取・full schema・集約omissionを既存workerに置く。GETのC、受信G／P、final予約／retry・native cleanupは元ownerのまま。新GET・時計採取・新budget／期限延長を追加しない。

現行のselected／max_recordsは最大100、同時pendingは1。保存target／T_iは最大100、時計値は固定S／L／O／U。応答ごとに全履歴を走査せずanalyzeは同job、finishだけ最大100件の照合とする。要求rule集合も現行の有限契約を再利用し、private copyは必要な期待fieldだけ。payload／rowsを時刻確認のためだけに複製しない。

現adapter制御フローからはanalyze最大100、finish最大1、worker期限型soft移行によるworker世代最大2（phase期限型は世代を増やさない）が候補上界となる（readyはjobとは別）。これは費目設計の仮説であり、独立イベントoracleで全成功／拒否／中断経路を数えるまで運用cap・全体受付の根拠にしない。既存のcatch分岐へ新たなfinish再試行を足さない。

claim／期待値copy・guard・失効・終了合流のexact layout／work上界はUnknown。日時長cap、低減LとJSON宣言deadlineの互換、選択payload／releaseの正式供給境界、終端ownerの正確な配置も承認／レビュー待ち。

## 9 合成受入条件（未実施）

| ID | 独立に確認する条件 |
|---|---|
| WJ-01 | 同run／source／origin／budgetのleaseだけを一度移譲。copy／inspect・別runを拒否し、他runは不変 |
| WJ-02 | startup前に受理したT_iを、ready／送信失敗後もUに保持。O／S／Lの再採取・再pinなし |
| WJ-03 | 同idでも別worker／監督／世代／kind／assetを拒否。readyで解析claimを消費しない |
| WJ-04 | 発行／consume／返却pre/post guardの再入・取消・期限・closeで停止。重複／遅延応答で復活しない |
| WJ-05 | reviewed_at／target.retrieved_atとT_iの完全一致。1ms逆行・超過、同ms等号、T_i=S+Lと元guard期限切れを区別 |
| WJ-06 | rejected／omitted／集約omissionでもUを保持。解析0件・空200でもE<O／E<Uを拒否 |
| WJ-07 | E=S+LとS+L+1、別target／S／release、worker schema成功でも親時刻不整合を拒否。補正／再採取なし |
| WJ-08 | worker期限型は旧世代の終了確認後だけ新世代finish、phase期限型は同世代・pendingなしでだけfinish（soft後verifyは既存HTTP費目で計数）。hard失敗・全体期限・取消では再開不可。元S／L／U不変 |
| WJ-09 | source解放後の新job禁止、run失効で既存pending／候補も破棄。終了確認・最終cleanup前に結果を公開しない |
| WJ-10 | C/G/P・予約返却／retry／時計採取・worker終了を独立oracleで確認。上位診断の非上書き・秘密非出力 |
| WJ-11 | 固定cleanup sectionを途中失敗後も通る保証を、最後のrollback救済と区別する。観測不能なら未確認のまま残す |
| WJ-12 | job／generation／失敗時終了の費目を全経路で計数。専用開発compiledと実class／値試験を別集計し、B-03完了へ流用しない |
| WJ-13 | 停止後の部分finish（metadata失敗・payload／consistencyの停止理由・受信／payload予算超過）は既存の部分集約・失敗集約を変えず、時刻検証済みと数えない。停止済みrunから新job／generation・新GETを作らない |

TB-Bレビューで判明したfinally継続の未保証は[TB-B記録§6](E2E_BEST_PRACTICE_RELEASE_TIME_HANDOFF_TBB_2026-11-01.md#6-レビュー修正2026-11-01)に残す。既存rollbackで最終資源数が0になることを、途中の全解放sectionを通った証明へ読み替えない。試験用の新public friend／runtime登録口は作らない。

## 10 推奨実装分割と非目標

1. **WJ-A**：合成issuerだけの内部binding・generation／input／job claim・one-shot／失効を純粋fakeで実装。時計値比較は元S／L／Oへの固定値入力とし、実worker／runtimeには接続しない。
2. **WJ-B**：同input receiptのT_i受理、U保持とanalyze応答の期待値比較器を独立oracleで確認。startup・送信失敗、omitted、pre/post guardを含める。
3. **WJ-C**：finishのE／対象集合・soft partial世代交換・終了候補の一度限り消費を合成応答で確認。取得済みUを消さない。
4. **WJ-D／CT-C**：私有の固定生成元・監督／注入channel・上位終端への連続fake接続を別承認で行う。現在のpublic prepared-onlyと通常adapterを維持する。
5. **B-03**：旧case対応表の未代替実class保証を残し、専用開発build／compiled・配布負の対照を別設計／別集計で確定する。今回の441ファイルの梱包成功で代替しない。

実Permit採用・正式発行・全体受付・本番cap・production adapter差替え、非200 fallback・friend撤去・実通信は非目標。本文は実装／試験実施記録ではなく、MDと参照／差分検査だけを更新する。

draft-0.2のレビュー修正：現adapterのsoft移行のうちphase期限型（同generationのままfinish、soft後verifyのGETあり）と、run停止後に部分集約をfinishする既存分岐（受信予算超過ではsession停止後も部分集約を返す）が抜けており、finish前後の元run guardをそのまま適用すると既存の部分集約を失敗へ変える設計になっていた。§1・§7・§8・WJ-08を2種類のsoft移行に分け、停止後の部分finishを初期範囲の対象外とするWJ-13を追加し、上位設計からの版数リンクも更新した。
