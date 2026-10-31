# AU-BR-006 非200 HTTP対応：legacy差分・状態遷移・合成受入条件

Version: br006-non200-http-draft-0.3 / Date: 2026-10-31。
Status: §9の純粋分類契約・独立oracleと§10のST-01合成内部契約／ST-02注入cleanupを開発専用moduleで実装。非200のruntime挙動変更・正式終端接続・A01〜A07の承認は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

親：[private composition設計](BEST_PRACTICE_ABORT_SCOPE_PRIVATE_COMPOSITION_DESIGN.md) §6／12。
基準commit：`6a1fcd1`（CM-04-03のsession hook code保持・非200受理拒否を含む）。本書の現行欄はソースの読み取り照合であり、実機で確認した挙動ではない。

## 1 範囲と不変条件

対象は新規固定入口のauthentication／parent／releaseだけ。通常client／adapter／R-2のlegacy経路は差し替えない。非200に対応する設計の承認は、実transport・実通信・本番設定・正式receiptの有効化を意味しない。

- 同session／認証snapshot／ready世代／source／lease・同canonical C/G予算を継続する。
- C上限210、通常処理からfinalへ残す4枠、G累計16MiB・1応答4MiB、全体60秒・元t0を維持する。Pはbootstrapでは0のまま。
- 同じpurposeは最大2試行。取消・失効・期限・予算停止をretryで解除しない。費用の返金・別budget生成・coreの再openは禁止する。
- 200のbody ackと、非200のstatus／cleanup証拠を別にする。`no_body`・取消完了をEOFやJSON受理に変換しない。
- raw status／body／構造一致のJSON／例外codeだけを正式証拠やC方式fallbackの権限にしない。
- 現CM-04-03のparent／release hookの200限定guardは、別の型付き経路の承認・合成検証まで外さない。
- 以下の「提案」は未実装・未承認。既存契約との差分は§8で承認を要する。

## 2 照合した所有点

| 根拠 | 確認した箇所 |
|---|---|
| [legacy session](../src/servicenow/bounded-read.ts) | attemptのstatus分岐・body reader・finally、requestのcode／retry、authenticate／get |
| [bootstrap](../src/servicenow/review-bootstrap-contract.ts) | nativeBody後のstatus分類、最大2試行、停止とphase／quotaの局所終端、hook code保持 |
| [native reader](../src/servicenow/review-native-adapter.ts) | beforeDispatch、Response／streamのbrand・所有権、no_body、cancel／closed／releaseと終端証拠 |
| [native body](../src/servicenow/review-native-body.ts) | EOF必須のbody ack、失敗時のsticky stopとhooks.stop |
| [source](../src/review/bounded-source.ts) | private consumer、releaseのreadRows失敗分類、fallback／conflict、private permit生成 |
| [C方式設定](../src/servicenow/review-release-config.ts) | 接続先binding・期限・run全体を覆う有効期間のpin |
| [canonical core](../src/servicenow/review-canonical-budget.ts) | C直前計上、Gの拒否分保持、4枠、releaseでcore全体がclosedになる点 |
| [現fake adapter](../src/servicenow/review-composition-fake-io.ts) | 200固定・2／3行のdata-only transcript。status注入やretry用行は現在受け付けない |

## 3 legacyとの差分表

「native現行」は低位adapter／body／bootstrapを指す。CM-04-03の実session hookはそれより狭く200だけを受理する。低位に403等の分岐があることを、固定入口で利用可能と読み替えない。

| 応答／失敗 | legacy現行 | native／CM-04-03現行の差 | 次版の提案（承認前） |
|---|---|---|---|
| 200＋body | bounded read→JSON→対象schema | cleanup／EOF・同bytes ack後に対象schema。固定入口の接続済み範囲 | 維持。parent／releaseのprivate consumerへ一度だけ渡す |
| 200＋bodyなし | invalid_response | no_bodyを記録するがbody ackは作れずinvalid_response | 維持。空bodyをJSONのnull／空観測へ代用しない |
| 201／202／206等の200以外の2xx | response.okとしてJSONを読み、後段schemaで判定 | bootstrap／session hookは200限定 | 初版はinvalid_responseを維持。成功status拡張は別承認（A06） |
| 204／205など空2xx | bodyなし／JSON解析失敗ならinvalid_response | no_bodyはEOFではなく拒否 | 観測成功・空配列・fallbackの根拠にしない（A06） |
| 401：全用途 | bodyを読まずfinallyで取消要求。authentication_failedで停止 | bodyがあればEOF／cleanupまでstatus分類が遅れ得る。no_bodyはinvalid_responseとなる | authentic headerでauthentication_failedを先に固定し、body readせず所有resourceのcleanup。未確認cleanupも別診断として保持（A01） |
| 403：authentication／parent | bodyを読まずaccess_deniedで停止 | 同上。固定入口は非200拒否 | authentic headerでaccess_denied固定。release fallbackへ流さない（A01） |
| 403：release | cluster GETに限り局所access_denied。sourceがC方式fallbackを試す。bodyは読まない | 低位bootstrapにはrelease 403分岐があるが、no_bodyはその前に拒否。固定入口hookも非200拒否 | cleanup確認済みの型付きstatus証拠をprivate sourceへ一度渡し、既存C方式を使う。未確認ならfallback禁止（A01／A02） |
| 404：authentication／parent | requestは局所not_found_or_not_visible。authentication失敗はready ownerを失効 | bodyありは低位bootstrapでinvalid_response、bodyなしもinvalid_response | not_found_or_not_visibleへ揃え、当該bootstrapを終了。retryなし（A01） |
| 404：release | 局所not_found_or_not_visibleをsourceがfallback候補にする | 現行固定入口では未対応 | 403同様、cleanup確認後だけ既存C方式へ渡す（A02） |
| 429／5xx＋body | boundedに読み捨て、Gを課金。JSON解析せずupstream_unavailable。最大2試行・固定待機 | nativeはbody ackまで進み得る。bootstrapのHTTP retry候補には固定backoffがない。非200を固定入口で採用しない | bounded drain-only・G保持・確認済みcleanupの後に最大1回retry、既定250ms待機。非200 body ack／JSON／hashを要求しない（A03） |
| 429／5xx＋bodyなし | invalid_responseでretryしない | confirmed no_bodyだがinvalid_response | status-only証拠でretry可能にする案。legacyとの差分として承認必須。承認までは拒否を維持（A03） |
| 同期throw／確定reject | upstream_unavailableとして最大2試行、待機あり | native acquire／bodyのsticky stopで次の試行に進めない場合がある | no_response・quiescence確認済み、run primary未設定の場合だけattempt-local retry候補（A03／A04） |
| timeout／pending／late response | upstream_unavailableならretryし得る。finallyは取消の完了を待たない | pendingやcleanup失敗でsticky stop。現在のnative失敗を外側loopだけでretryできない | fetch pending／late所有権不明はretry不可。読取開始後のtimeoutは、元window内で取消・pending解消・closed・lock解放を証明できた場合だけ候補（A04） |
| 3xx／その他非成功status | 実fetchはredirect:error。注入3xx等はbodyを読まずinvalid_response | statusよりbody条件が先に作用し得る | Locationへ追従せず、terminal cleanup後にinvalid_response。未知statusをfallback根拠にしない（A06） |

### 3.1 誤解してはいけない差

legacyのfinallyはcancelを要求するが、その完了・reader lock解放を成功条件にしていない。提案はこれを「legacyも確認済み」と扱わず、typed経路で確認を強める。terminal bodyを読まないことと、cleanupを待たないことは別である。

同じcodeでも停止範囲は同じではない。releaseの403／404は既存sourceへ回復可能な局所結果を渡す候補であり、先に共通ownerを停止してから再開してはならない。authenticationの失敗はreadyを作れず、parent失敗は当該bootstrapを終了する。既存legacy API全体の停止範囲変更は対象外。

Retry-Afterの新規採用は提案しない。既定250ms（既存低減limitsは維持）を同じ時計内で使い、headerの任意値による待機延長・新しいdeadlineを認めない。

redirect:errorによるrejectでstatusを取得できなかった場合は、3xxが届いたと推測して分類しない。NoResponseの確定／未確認として扱い、実transportがtypedな拒否根拠を供給する設計は別途必要になる。Locationへ追従しない条件はどちらでも維持する。

## 4 型付き終端と診断の内部契約案

次は概念上のvariantであり、公開API名・JSON schema・実装型を確定したものではない。

| variant | 受理に必要な証拠 | 禁止する昇格 |
|---|---|---|
| BodyAccepted | authentic Response、同attempt／windowの所有reader、EOF・cleanup確認、同bytes body ack、post-guard | 非200やno_bodyを200 ackへ変える |
| HttpTerminalConfirmed | authentic status、固定用途／source descriptorとの結合、同resourceの取消・closed・lock解放、または真正なno_body、post-guard | statusの数値だけ／raw例外codeから生成する |
| NoResponseConfirmed | dispatch到達・確定throw／reject、応答resource未所有・late deliveryなしを確認した同attemptの終端 | pending fetchをno_responseと申告する |
| CleanupUnconfirmed | 取得済みstatus候補と、未確認の理由を別々に保持 | retry／fallback／prepared／body ackへの昇格 |

発行元は固定native ownerと同runのprivate継続だけ。session／snapshot／lease／source・purpose・ordinal・元window・停止世代に結合し、消費前に再照合する。status証拠もopaqueで一度限りとし、copy／JSON／別attempt／別source／失効後の消費を拒否する。診断copyは権限ではない。fixture台帳や既存sessionの登録口を追加しない。

authentic headerはpin済みnative getterとbrand検査で得る。使用済みResponse、所有済み／locked stream、proxy、foreign handleをraw statusだけで正当化しない。既に他ownerが持つreaderを奪ってcancelしない。

### 4.1 bodyを読まないterminal cleanup

bodyがあるterminal応答では同ownerが一度だけreaderを取得し、closedを取消前にcaptureする。readは0回、cancel・settle・closed確認・releaseLockを同attempt内で行う。bodyがない場合はreader／EOFを作らず、native no_bodyの事実を保持する。cancel後に解決したpending readをEOFへ変換しない。

cleanupは発行済みの元cleanup floor／hard deadline内だけでraceする。新しい10秒や追加250msを末尾に足さない。現在の最大250msはIO floorとcleanup floorの予約幅であり、header早着時もcleanup全体が必ず250ms以内に返るという意味ではない。legacyの即時取消要求に対し、typed側は確認待ちで返却が遅くなり得る。この差もA01の承認対象とする。さらに短いterminal専用sub-deadlineの採否は未確定で、元windowを書き換えて代用しない。

### 4.2 first primaryとcleanupの二軸

- 401／用途限定の403などのhard failureはstatus確定時にfirst primaryへ記録し、失効を先に行ってからabort／cleanupへ進む。後続cleanupの失敗でauthentication_failed／access_deniedをinternal_review_errorやupstream_unavailableへ上書きしない。
- release 403／404・retry候補のstatusは、まだ回復可能なHTTP候補であって共通primaryではない。cleanup未確認ならsource／retryへ渡さず停止する。提案する公開codeは既存internal_review_error、内部診断には元status・局所候補code・cleanup理由を残す（A01）。
- 先にcancelled／deadline_exceeded／予算停止が記録されていればそれを保持する。statusで取消を覆したり、release fallbackで失効を取り消したりしない。
- phase／request quotaの局所拒否をinternal_review_errorへ潰さない。`6a1fcd1`のhook code保持を回帰条件にする。
- status、cleanup種別、有限の理由、ordinal、C/G差分だけを診断copyにする。body、token、認証header、node情報、例外message／stackは出さない。

## 5 状態遷移案

各論理purposeにordinal 1／2を持ち、runのowner／snapshot／leaseは共通のまま使う。

```text
Bound → PreDispatchGuard → CCommit → Dispatched
  未dispatch拒否: C=0                 入った後のthrow/reject: C=1を保持
Dispatched → AuthenticHeaders → Classified
  200       → BodyRead → CleanupConfirmed → BodyAck → Schema／private consumer
  hard終端  → FixPrimary／Revoke → CancelOnlyCleanup → Stop（cleanup診断を併記）
  release拒否候補 → CancelOnlyCleanup → TerminalProofConsume → CModeDecision
  429/5xx   → BoundedDrain（または承認後のno_body）→ TerminalProofConsume
  応答なし  → SettledNoResponseProof／またはUnconfirmed

確認済みretry候補 → RetryGuard → Backoff → NextAttempt（ordinal 2）
試行枯渇       → parent/authはStop、releaseは条件付きCModeDecision
Unconfirmed／失効／予算停止 → Stop（retry／fallback／ackなし）
CModeDecision → matchedだけPreparedOnly、他はNotAdmitted → 固定close
```

`PreparedOnly`は従来同様、fake_io付き限定summaryまで。source／permit／reader／lease／更新portは返さず、metadata／payload／workerへ進まない。終端後の再利用は拒否する。currentのstatus 200 guardを単に削除してこの遷移を代用しない。

### 5.1 retryの条件と費目所有

全条件を満たした場合だけ、固定継続が次のattempt claimを一度発行する。

1. 認証・source・ready世代が同じで、runのnonrecoverable primaryなし。ordinalは1で、次は2だけ。
2. 前attemptのstatus／no-response証拠を一度消費済み。cleanup確認済み、pending read／fetch・late所有権・未解放lockなし。
3. C/G・phase／hard deadlineを同じleaseで再確認。通常処理の4枠は保持する。250ms待機と次dispatchが元期限内で可能であることを検査する。待機完了時・dispatch直前にも検査し、等号では開始しない（A05）。
4. backoff自体にCを加えない。dispatch直前に一度だけCを計上し、Gは実際に受け取った各chunkを一度課金。drainした拒否bodyも返金しない。
5. 次のattemptは新しいresourceを所有する。同じResponse／stream／終端証拠を再利用しない。元のrun／budget／認証を作り直さない。

現native bodyは失敗時にsticky stopし、acquireの失敗もnative primaryへ記録する。従って外側for-loopだけの変更では不足する。提案は「確認済みの回復可能なattempt終端」と「run全体のhard stop」を内部型で分離し、判断前にhooks.stopを呼ばない方式（A04）。既に記録したrun primaryを消去したり、新ownerを作って失敗を隠したりしてはならない。

429／5xxのbodyはbounded drain-onlyとし、非200本文の保持・JSON解析・hash／body ackを要求しない（A03）。壊れたJSONや秘密を含むerror bodyでも、Gとcleanupだけで判断する。G／単体応答上限超過は予算停止でありretry不可。待機／retry中の取消はtimerとlistenerを解放し、新たなCを計上しない。

## 6 release fallbackの限定条件

403だけでなく、legacyではreleaseの404・最大試行後のupstream_unavailableも既存C方式の候補となる。次版でも次を全て確認してから、privateな局所unavailableとして既存`#observeRelease`相当へ渡す（A02／A04）。

- 同runでparentの固定5列を受理済み、認証ready済み。固定sourceのbuild_name専用GETの結果であること。purposeという自己申告だけでは足りない。実URLの証明は実transport設計の残課題。
- status／retry枯渇が上記の確認済み終端に由来すること。raw access_denied例外を投げればfallbackできる口にはしない。
- 元の認証・ready・source・keyが有効で、hard／soft期限・受信／試行budget停止なし。認証失敗・401・parent拒否・cleanup未確認は対象外。
- 有効な運用者設定だけを使う。binding不一致・期限切れ・run全体を覆わない有効期間・設定なしをmatchedへ昇格しない。既存family照合、conflict／unknownとlimitationsを維持する。
- fallback時はsource=operator_config／resolution_status=assertedを保持し、sys_cluster_stateで実測できたとは記録しない。200の不完全観測・21件sentinel・不正JSONを403と同じ理由に変換しない。

生のterminal bodyを既存parent／releaseの200 ack consumerへ送らず、確認済みstatus用のprivate受理を別にする。source内のprivate permit生成と同ownerへの既存binding／再検証は引き続き必要。fake fixtureからpermit／family／matchedを直接渡さない。

## 7 合成テストの受入条件（§9の分類照合以外の操作・終端試験は未実装）

oracleは製品statsのcopyではなく、fake dispatcherの到達数、独立byte長、reader操作履歴、fake clock／schedulerの実イベントから作る。status用途、body有無、EOF／拒否／pending、cleanup各操作、低減capと境界を交差させる。通常成功だけでなく、拒否・中断でも下記を満たす。

| ID | ケース | 必須結果 |
|---|---|---|
| NH-01 | 200・既存CM-04-03省略時／合成成功 | constructor_bound互換、private同bytes ack、fake_io付きprepared、閉鎖を維持 |
| NH-02 | 200＋no_body、204／205、他2xx | no_body≠EOF。A06承認前は成功／空観測／fallbackにせずinvalid_response |
| NH-03 | 401全用途、403auth／parent：bodyあり／なし／永遠にreadが止まるbody | body read=0。適切なfirst primary、retry／fallbackなし。元window内でcleanupのみ試行 |
| NH-04 | NH-03でcancel／closed／release失敗・cleanup期限 | HTTP primary保持、cleanup未確認を別記。成功や確認済みへ格上げしない |
| NH-05 | release403／404、native no_body／bodyあり | A02承認後のみ、cleanup確認→一度限りstatus消費→有効C方式。body ack=0、no_bodyにreader／EOFなし |
| NH-06 | release403／404でcleanup未確認、auth／source／URL用途混入、失効 | fallback／permit／preparedなし。元status候補とcleanup診断を保持 |
| NH-07 | assertionのbinding・期限・有効期間・family・欠落 | matched条件、asserted／limitations、unknown／mismatched／conflictを既存C方式どおり保持 |
| NH-08 | 429／500／503等→200、または2回とも失敗 | 最大2試行。既定250msの前後とC/G oracle一致。error JSONは解析・保持しない。3回目dispatchなし |
| NH-09 | 429／5xx＋no_body | A03未承認時は旧拒否、承認後の別試験ではstatus-only retry。EOF／body ackなし、差分を明示 |
| NH-10 | 同期throw／確定reject、headers前pending、late response、所有read timeout | C=1保持。確認済み・run未停止だけretry候補。pending／late不明はretryせず、遅い応答で診断を格上げしない |
| NH-11 | retryable応答後のquota／G／phase拒否、待機中取消 | R=4維持、backoffでC追加なし。次dispatch前拒否はC増加なし。副作用／timer／listenerが残らない |
| NH-12 | releaseの確認済みupstream枯渇、同形の親／auth枯渇 | releaseのみ条件付きC方式。親／authは終了。共通primaryを停止後に再開しない |
| NH-13 | status proof／reader／Response／source／leaseのcopy・再利用・二重消費・再入 | 全て拒否。外国runを変更せず、first primaryを保持。raw code／JSONは権限なし |
| NH-14 | C直前の取消／IO floor等号、dispatch内throw／reject／取消 | 未dispatchはC=0、入った後はC=1。commitとdispatchの間の追加観測なし |
| NH-15 | G・1応答cap等号／超過、複数拒否bodyの累積 | 到達chunkを一度課金、超過分保持。1応答の等号自体は超過にしない。G累計が上限に達した後の次dispatchは拒否し、retry／fallbackで返金・再初期化しない |
| NH-16 | soft／hard／IO／cleanup／backoff境界の直前・等号・直後、時計逆行 | 元期限維持、等号拒否、既存固定code／内部理由保持。失効後の消費なし |
| NH-17 | malformed UTF8／JSONのterminal・retry body、秘密marker | 非200本文を解析／出力しない。200の解析拒否は維持。token／header／body／stackをsummary・logへ出さない |
| NH-18 | 3xx／redirect／未知status、foreign／使用済み／locked native resource | 別origin／Locationへ追従せず権限なし。所有権不明を確認済みcleanupにしない |
| NH-19 | success／hard stop／局所拒否／backoff中断の全終端 | 同readerのcancel／closed capture／releaseを正しく計数し、session解放は一度。admission枠・credential参照・fake bytesを残さない |
| NH-20 | compiled／pack・既存全体合成・固定規則評価セット | fixture非共有／非同梱、通常経路legacy、実fetch未到達、正式発行disabledを維持。既存固定ケースは書き換えない |

fake入力を拡張する場合も現行固定200 transcriptの暗黙拡張にしない。別のstrictな試験profile／版を定め、各purpose最大2、全体最大6応答、byte／chunk／遅延・pending操作数を有限にする。任意callback／URL／credential／permit／既存session登録を許すruntime fixture口は作らない（A07）。許可外の大きさ・getter／proxy等はdispatch前に拒否する。

低位の過去fixtureにある非200 body ack等の仕様と、新HTTP laneのstatus-only仕様を同じ成績に混ぜない。変更が必要な期待値は承認IDと根拠を付け、新規受入試験を追加する。回帰対象の固定規則評価セットや過去記録の結果は変更しない。

## 8 承認待ち事項と次の実装順

| ID | 承認が必要な点 | 推奨案（まだ未採用） |
|---|---|---|
| A01 | terminal cleanupを待つ差、HTTP／cleanup二軸、未確認時の公開code／待機上限 | 元window内の確認を必須化。hard HTTP primary保持、回復候補のcleanup失敗はinternal_review_error。専用短縮sub-deadlineは別途確定 |
| A02 | release403／404を既存C方式へ渡す型付き根拠・停止範囲 | 同用途・同source・確認済みstatusだけをprivate受理。raw error catchだけに頼らない |
| A03 | 429／5xxのdrain-only、bodyなしretry、固定backoff | bodyありはbounded drain、250ms・最大2試行。no_bodyのretry許可は明示的なlegacy差分として承認するまで無効 |
| A04 | attempt-local retryとrun sticky stop、timeout／upstream枯渇fallback | 確認済みquiescenceと未停止runだけで次attemptを作る。run primary／budget／認証を再生成しない |
| A05 | 待機受付と各境界のcode／順序 | 同leaseの元期限内で再検査、等号拒否、first primary優先。phase／quotaのcodeを保持 |
| A06 | 200以外の成功statusとredirectの扱い | 初版は200のみ。3xx追従なし、他2xxの成功許可は別承認 |
| A07 | 合成fixtureの拡張・公開summaryの互換性 | bounded・版別のclosed試験profile。正式発行口や通常設定を広げない |

実装を開始する場合の順序案：

1. 純粋なpurpose×status×body有無の分類契約と独立oracle。§9で実装。I/O・証拠発行・runtime接続なし。
2. 同attemptのstatus-only終端／cancel-only cleanup。注入Response／Streamsで所有権と消費を確認する。
3. retry候補の局所終端・固定backoffを同予算／停止へ結合する。G drain、no-response／timeoutの負の対照を先に確認する。
4. private sourceの限定status受理と既存C方式へ接続し、固定入口の合成E2E・compiled／梱包・全体回帰を行う。

各段階でも正式発行口閉鎖・全体受付無効・調査保留を維持する。final予約枠移譲、P更新port、実transport、実機E2E、設定変更は別設計・別の明示依頼が必要。本書だけを根拠にソース・試験・runtime gateを変更しない。

## 9 純粋分類契約と独立oracle（第1段階のみ）

実装：[開発専用classifier](../src/review/abort-scope-evidence-http-classification.ts)。試験：[分類試験](../tests/review/http-classification.test.ts)、[独立表oracle](../tests/review/fixtures/http-classification-oracle.ts)。model_idは`br006-http-classification-v1`。HTTP policyのIDや承認票ではない。意味を変更する場合は契約版とoracleを別々にレビューする。

### 9.1 入力と非権限の結果

入力はplain／null-prototype objectのdata property3項目だけとする。

| 項目 | 列挙・範囲 | 注意 |
|---|---|---|
| purpose | authentication／parent／release | metadata等や任意文字列は拒否 |
| status | 整数100〜599 | 文字列・NaN・Infinity・範囲外・boxed numberは拒否 |
| body_present | booleanのみ | 0／1・文字列・boxed booleanからの変換なし |

欠落・未知key（approval／enabled／body等も含む）・symbol key・getter・proxy・独自prototypeを固定`invalid_input`で拒否する。getter／valueOfを実行せず、値をcoerceしない。失敗結果にraw inputや例外messageを写さない。

成功・失敗とも`kind=classification_only`、`observation_source=unverified_input`を持つ。入力3項目は呼出し側の申告にすぎず、authentic Response・bodyの所有権・schema・時点・cleanup確認を意味しない。100〜599とbody有無の全組合せをモデル化するが、実在するnative Responseで得られる組合せとは限らない。statusだけでbody有無を推測・補正しない。

| 結果 | 意味 |
|---|---|
| observation | 検証済みの列挙／数値／boolのcopy。実HTTPの証拠ではない |
| legacy | HTTP分岐を説明するcategory／候補code／body処理／release回復候補の記述。JSON／schema結果やownerの停止状態は未評価 |
| proposal | 承認前設計の候補category／候補code／body処理案と関連A番号。実行指示・承認済みという意味ではない |
| permissions | dispatch／read_body／retry／fallback／body_ack／release_permit／formal_issuanceの7項目が全入力でfalse |

legacyのbody=noneはbody不在時の説明であり、cancelしたと記録しない。429／5xx＋no_bodyはlegacy側invalid_response／回復候補なし、proposal側retry_status_candidateとA01／A03／A04／A05を並べ、差を隠さない。parent／authの404はlocal_http_candidateとし、分類だけでrun primaryを固定しない。200＋bodyもbody_candidateであり、受理・JSON解析・body ackの許可ではない。

結果・observation・legacy・proposal・承認参照配列・permissionsをfreezeする。入力は変更せず、同じ値の再分類は同じ記述を返すだけ。成功結果のcopy／JSONを入力へ再提出しても、unknown keyとして拒否する。counter／claim／clock／owner／leaseを持たず、consumer／証拠／permitを発行しない。

### 9.2 oracleと確認範囲

oracleは製品のenum・helper・分類結果をimportしない。製品が条件分岐を使うのに対し、oracleは100〜599のdense tableを先に埋め、2xxの範囲と401／403／404／429／5xxの手書き行で上書きする。3用途×500 status×2 body有無=3,000組を一度ずつ照合し、総数・重複・各層500件も検査する。表の欠落を無比較成功にしない。

これは実装ロジックを共有しないoracleであり、人手による独立作問・ブラインド評価ではない。有限分類の一致は、NH-01〜NH-20の全てが実行済み、またはcleanup／retry／fallbackが安全に実行可能という証明ではない。操作数・C/G・停止／期限・実transport等の試験は後続の第2〜4段階に残る。既存固定規則評価セットは変更しない。

### 9.3 閉鎖と梱包

classifierは既存の`abort-scope-evidence*`開発専用除外に置く。npm梱包にはJS／map／型宣言を含めず、fixture／oracleも非同梱。pack内のruntime JSがclassifierに依存していないことを[梱包試験](../tests/review/package-http-classification.mjs)で検査する。compiled単独試験ではfetch／Response／Streams／timerを禁止して全3,000組を照合する。

BoundedReadSession・bootstrap・native adapter・source・MCP／設定・既存fake transcriptのschemaは変更しない。非200を拒否するCM-04-03のguardも保持する。A01〜A07は全て承認待ちで、純粋な説明用分類が動くことからretry／fallback／受理を有効化しない。

検証記録：[純粋分類契約・oracle検証](E2E_BEST_PRACTICE_HTTP_CLASSIFICATION_2026-10-31.md)。

## 10 status-only終端・cancel-only cleanupの詳細化

第2段階の[同attempt終端詳細設計draft-0.8](BEST_PRACTICE_ABORT_SCOPE_STATUS_ONLY_TERMINAL_DESIGN.md)で、同readerの所有権・一度限りのfinish／consume・HTTPとcleanupの二軸診断を具体化した。停止後に残るcleanup所有権と、同期失効する業務継続権限を分離し、hard HTTP停止後はcleanupが成功しても診断専用とする案である。

ST-01で合成issuer限定の内部型・claim・診断保持、ST-02で注入Response／Streamsだけの同reader cleanupを実装した。正式terminal／単一会計／実sessionへの接続はまだなく、ST-T01〜ST-T20全体を確認済みにしない。ST-A01〜ST-A07／A01〜A07の承認、runtime採用、retry／fallback、正式発行を意味しない。現行200限定guard・全体受付無効・調査保留を維持する。

次の[ST-03接続詳細設計draft-0.5](BEST_PRACTICE_ABORT_SCOPE_STATUS_TERMINAL_CONNECTION_DESIGN.md)では、ST-02内部recordからのprivate発行・一度限り消費・発行後失効を注入試験内で結合する案を定めた。ST-03A／Bは閉鎖合成fixtureのprivate context／anchor／発行claim・診断保持・一度限り消費を実装し、native record連続接続とruntime承認は未実施。診断copyや合成申告を正式証拠へ昇格せず、sourceへのfallback採用も別工程とする。
