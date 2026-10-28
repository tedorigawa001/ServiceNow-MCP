# AU-BR-006 単一予算・停止・typed cleanupと共通run ownerの接続

後続：[閉鎖gate draft-0.2 §14](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#14-draft-02閉鎖gateの最初の合成実装)。TC-04のtransportとは別のfake identity-only modelであり、会計・cleanup・bodyの採用入口を追加しない。

追加：[draft-0.3 §15の同fake ReadState会計・用途／予約](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#15-draft-03同fake-readstateの会計用途予約)。単一C/G/S/P/Eと予約の合成eventを閉鎖gateへ接続した。TC-04 transportの登録／採用・実stream cleanup・正式body発行は行わない。

追加：[draft-0.4 §16の同attempt bytes候補・typed cleanup・consume](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#16-draft-04同attemptのprivate-bytes候補とtyped-cleanup)。同bytesからの課金・固定解析をfakeで検証。cleanup primitiveの実API観測、TC-04 transport採用、正式body発行は未接続。

追加：[draft-0.5 §17のfake試行監督](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#17-draft-05fake試行期限中断終了確認)。fake Promise／schedulerで試行10秒・cleanup予約・empty-read総数と終了確認を検証。実Web Streams adapterへの接続と正式発行は未実施。

Version: br006-run-transport-cleanup-draft-0.5 / Date: 2026-10-28。
Status: **TC-01〜TC-03に加え、TC-04の固定source bootstrap・release・用途descriptorを同fake transportへ接続。実sessionの会計更新／実transportは未接続、正式証拠発行・本番cap承認は未実施／閉鎖**。

親：[共通run owner §14・§15](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)、[用途別transport／cleanup](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)、[bounded予算](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md)。
後続：[選択／payload受領物](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)、[worker接続契約](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md)。

## 1. 目的と非対象

同sessionの既存C/G/P・単調時計・停止を唯一の所有物として維持し、用途／attempt／cleanupの型付き結果を共通run ownerへ接続する。**JSONが返ったこと、abortしたこと、slotを解放したことを、取得証拠や終了確認へ昇格させない**。

§1〜§8は後続接続を含む設計案であり、全体の実装済みを意味しない。§10のTC-01はprimitive観測とclockだけの純粋fakeで、fetch／Response／Web Streams自体も操作しない。後続検証はfake fetch／注入Response・Web Streams／fake clockに限定する。global fetch、PDI、実OAuth発行、実worker job、公開MCP引数のmode追加、production cap投入は対象外。提案型と§10の開発専用exportを区別する。

正式なSourceRunEvidence／選択payload receipt／seal／findingの発行口は閉じたまま。将来の内部transport受領物と正式なscope証拠を区別し、次期試験で得た合成受領物を本番へ登録しない。Unknown・全体受付無効、VM／監視／telemetry保留を維持する。

## 2. 現行との差分

| 箇所 | 確認できる現行実装 | 未接続の部分 |
|---|---|---|
| [bounded-read](../src/servicenow/bounded-read.ts) | 同sessionのC/G/P・hard／phase期限・認証・abort・close。finallyはcancelをbest-effortで要求 | pending処理の終了観測、releaseLock、typed cleanup、用途別受領物、E/Rの本番所有 |
| [run lifecycle](../src/servicenow/review-evidence-lifecycle.ts) | private owner、auth snapshot／ready世代、readonly lease、先行診断、prepared source binding | 会計更新port、transport claim、固定HTTP／child停止の接続、HTTP／worker cleanup二軸の終端合流 |
| [bounded-source](../src/review/bounded-source.ts) | 同sourceのReleasePermitと不変release snapshot、既存のmetadata／payload／final取得 | 用途permit、確認済みbody受領物からの選択／payload証拠 |
| [fixture transport](../src/review/abort-scope-evidence-transport-state.ts)／[Web Streams adapter](../src/review/abort-scope-evidence-web-stream.ts) | 独立したfixture台帳で用途・会計・cleanupを実験済み | 実sessionへのauthorityを持たない。既存fixture portのcast・再登録は禁止 |
| [通常adapter](../src/review/update-set-adapter.ts) | 通常workerへ残時間・外部signalを渡しfinallyでclose | AU-BR-006のprivate job由来、HTTP内部停止を含む共通ownerとの双方向合流 |

readonly `ReviewRunBudgetLease.read()`は観測専用のままにする。statsのcopyや既存`PreparedTransportBudget`を「正式lease」として採用せず、新しいmutable portは同sessionのprivate生成継続からしか取得できない設計にする。

## 3. private所有権と一度限りの接続

| 提案型／所有者 | 発行元・結合 | 権限の上限 |
|---|---|---|
| SessionBudgetAuthority | session constructor内。元counter／t0／有効上限／phase identityを所有 | 固定内部操作だけ。任意counter setter・時刻再設定・stats再登録なし |
| RunTransportClaim | 同session／run ownerで一度だけ未使用→consuming→claimed／failed | 失敗後の再準備不可。run claim／source claimとは別の用途claim |
| TransportAccountingLease | 上記claimの固定継続で唯一のHTTP所有部へ貸与 | dispatch／chunk／slot終端などの原子的操作。秘密・URL・raw snapshotを返さない |
| BootstrapPurposePermit | 認証前の固定session／初期source／Update Set／phase | OAuth・初回親・release_rowsだけ。matchedや選択成立を偽定しない |
| BoundPurposePermit | 同run／認証世代／source／ReleasePermit／不変release snapshot | 固定用途・logical read・対象・slot・phaseへ限定。payload／tableは将来の選択／plan証拠も必須 |
| AttemptClaim | 固定dispatch部でawait前に一度だけ消費 | 同用途内のordinal 1／2。別用途／resourceへの付替え不可 |
| AttemptCleanupReport | 同attemptの単一cleanup section | private参照＋固定観測事実。callerのconfirmed申告を受けない |
| RunCleanupSlot | 共通owner内の有限slot | HTTP／workerを別軸で保持。取消・closeで先行診断を消さない |

型brandやhashだけでは認識せず、privateな参照一致と状態で照合する。clone／別session／source／ready／permit／phase／attempt、fixture handleを拒否する。外から任意objectを本物の台帳へ登録するfactory、owner getter、任意observerのsubscribe口は作らない。

### 3.1 modeとbootstrap

将来のtransport laneは認証前・session生成時に固定する。既存legacy laneは変更しない。新laneの実行可能な生成入口は承認まで閉じ、開発試験はfake I/Oだけを渡す固定内部factoryへ限定する。公開ツール引数や既存sessionへのfixture登録で切り替えない。

OAuth／親／releaseをlegacy GETで先に取り、その後別の台帳へ移す設計にはしない。bootstrapも同じC/G／時計を使い、matched成立後は同transportをsourceへ結合するだけで、claim・counter・起点を再生成しない。

- OAuthはservice-account認証継続だけが利用。秘密bodyは同認証部のみで消費し、一般body受領物へ出さない。
- 初回親は固定Update Setと認証ready、release_rowsは同親取得済みをdispatch条件にする。まだ存在しないmatched permitを要求して循環させない。
- matched後のmetadata以降は既存prepared source bindingを再検査する。payload開始とtable取得は、後続工程の選択／worker planがない限り許可しない。
- 生成中停止・二重claim・最終検査失敗でもclaimを戻さない。正常な既存ownerを別のtransportで置換しない。

## 4. 単一会計と費目所有

実装案は、元C/G/P・t0・有効上限をsession内の単一private stateへ集約し、既存操作と新portが同じstateを使う方式とする。旧field値をcopyして並行更新する方式は不採用。移行中に両laneを使えないことを試験する。既存readonly leaseはそのstateの保護された観測viewであり、更新権限にはしない。

| 費目 | 唯一の変更点 | 失敗・cleanupでの扱い |
|---|---|---|
| C：HTTP試行 | request構築・preflight完了後、fetch直前の同期commit | OAuth／cache以外の交換／retry／同期throwも各1。未dispatchは0、返金なし |
| G：全受信 | activeなread完了を採用する線形化点 | 超過chunkも1回加算。未読量・late破棄分を読取済みにしない |
| S：応答受信 | 同じchunkのattempt-local内数 | retry時にSだけreset。Gは保持 |
| P：payload | 固定sourceがpayload文字列を実受領した境界 | 後続schema／版拒否でも1回課金。hash／IPC／受領物のcopyで再課金しない |
| E：table証拠受信 | table用途の同じchunkを下位内数として記録 | Gへ二重加算しない。失敗／retry／finalも累積。候補capは未承認 |
| R/T：予約／table受付 | sessionのprivate予約所有部 | Cへの事前課金ではない。slot流用・二重解放・返却後の通常phase再開を禁止 |
| clock／phase | 同sessionの元t0・絶対期限・phase世代 | cleanup／retry／workerへ残時間だけ貸す。新たな60秒を作らない |
| cancel／closed／lock解放 | attemptのcleanup section | HTTP試行／byteへ数えない。操作回数と終了確認を別に計数 |
| worker／IPC／出力／制御work | 固定supervisor／上位owner | C/G/Pから借用しない。上界・cap・本番接続は別工程 |

上限は全体60秒・HTTP最大210試行・G最大16MiB・通常S最大4MiB・P単体2MiB／累計8MiBを維持し、低減設定も尊重する。旧laneの固定final4予約と、新laneの用途別Rを二重に積まない。

新laneの予約式は[bounded設計§5](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md#5-最終再読の動的予約モデル)を維持する。

- 初期R=4（親2＋metadata2）。通常dispatchは`C+1+R<=Q`。
- 新tableは`C+R+4<=Q`で初回最大2＋最終2の余裕を確認し、Tとfinal slotを一体更新。初回分はCへ前払いしない。
- finalは自身のslotだけを使い、`C+=1`と`r_i-=1`を一体commit。未使用予約解放は一度だけ、C/G/Eは返金しない。
- table最大8、S下位16KiB、E累計256KiBは既存の**未承認候補**。次期fake試験でのみ境界を検査し、production capを投入しない。plan未接続なら実table受付は0。

dispatchのcommitとfetch呼出しの間にawait・任意callbackを置かない。chunkも停止確認→checked課金→上限判定→保持を同期化する。停止が先なら採用せず、採用が先なら失敗後も費用を保持する。

## 5. 絶対期限とtyped cleanup

元のD_hardと通常／整合cutoff（60秒時50／55秒）を維持する。設計上は`D_attempt=min(t+requestTimeout,D_phase,D_hard)`。TC-03のfake subset（§12）はphase cutoff未接続のため`min(t+requestTimeout,D_hard)`とし、既存候補の`K=min(250ms,floor((D_attempt-t)/4))`を内側予約し、I/OをD_io=D_attempt-Kで止める。K<=0ならdispatch前拒否。**250ms・empty read16回はfake検証専用の未承認候補で、本番policyの採用ではない**。

cleanup開始から新しい待機時間を加算しない。既にabortしたI/O signalにcleanup待機を単純raceさせず、元の期限内だけ使う観測viewへ分離する。全await後と受領物commit前に時計・identityを再検査し、等号以降は正常受領物を作らない。

| 終端disposition | 必要なAPI観測 | 成功body候補 |
|---|---|---|
| not_started | fetch前拒否、resource未開始 | なし |
| confirmed／eof | EOF、pending readなし、release前に取得したreader.closed fulfilled、lock解放成功、期限内 | 他の条件も揃う場合のみ内部候補 |
| confirmed／cancelled | 必要なcancel fulfilled、pending fetch/read settled、readerがあればclosed fulfilledとlock解放成功、期限内 | なし |
| confirmed／no_response | fetch rejectedでsettled、Response／readerなし | なし |
| confirmed／no_body | fetch settled、body=null、reader／pending readなし | body必須用途はinvalid_response |
| unconfirmed | 未決着／cancel拒否／closed未確認／lock解放失敗／期限切れ等 | なし、run停止 |

confirmedはWeb APIで観測した終了範囲だけ。socket／OS buffer消失、物理ゼロ化、厳密なOS終了時刻の証明ではない。

reportは同run／session／source（bootstrapは初期source）／phase／用途permit／attempt ordinalのprivate参照、disposition・kind、終了時刻、pending／cancel／closed／lockの固定観測だけを持つ。理由は内部enum案`fetch_pending`／`read_pending`／`cancel_rejected`／`closed_unconfirmed`／`closed_rejected`／`reader_owner_unknown`／`lock_release_failed`／`abort_failed`／`cleanup_deadline`／`cleanup_observation_invalid`／`cleanup_binding_mismatch`に限定する。kind／観測と矛盾するconfirmed、別attemptのreport、clone、二重終端を拒否し、raw Errorや本文をreportへ入れない。公開codeを増やす契約ではない。

### 5.1 単一cleanup section

1. fetch Promiseをattemptへ登録し、reader取得時にclosed Promiseと拒否handlerを保持。pending readは最大1つ。
2. 正常EOFは不要なcancelを重ねず、closed確認後にlockを一度だけ解放する。
3. 中断時は所有readerならreader.cancel、readerなしのunlocked bodyだけbody.cancelを一度要求する。unknown lockを別readerで救済しない。
4. pending read／fetchの決着を観測する。releaseLockをpending readの強制完了の代替にしない。local終端は確認後にcontrollerを終端化し、hard停止では即abort後に確認する。
5. 終了事実・期限・同attemptを再確認しprivate reportを終端化。finally／取消／timeout／late応答の競合でもcancel／release／settleを重複させない。

late Responseへのcancel要求は一度だけ。late完了でunconfirmedをconfirmedへ書き換えたり、新receipt／retryを再開したりしない。JSON受理とcleanupは別条件であり、正常JSON／HTTP200だけでは受領物を認定しない。

## 6. 共通停止・診断の合流

共通ownerの停止線形化点は、(1)最初のprimary固定、(2)source／用途／attempt／pending delivery／将来のjob受付の同期失効、(3)HTTP abort・固定child停止要求、の順。子の固定失敗も同ownerへ返し、兄弟処理を止める。任意callbackをこの同期sectionへ差し込まない。

| 事象 | 判定・停止 |
|---|---|
| session／source／ready／permit／phase／用途混入、二重consume | 固定binding／state拒否。claimを戻さず要求先run停止、外国runは不変 |
| 取消、hard期限、401、通常403、G／P累計超過 | 元のprimaryで全体停止。scope不足・局所不足へ格下げしない |
| release_rows限定403 | cleanup確認後だけ既存C方式判定へ渡す。任意403への例外拡大なし |
| payload404／版不一致／単体P超過、table下位不足 | 既存の局所分類を維持し、確認済みcleanupが条件。正常受領物は作らない |
| cleanup未確認、primaryなし | 固定internal_review_error＋HTTP unconfirmedで停止 |
| primary後のcleanup未確認 | primaryを維持し、HTTP軸だけunconfirmedをstickyに保持 |
| soft cutoff | 新通常用途を拒否しfinalへ一方向遷移。run全体停止や新runへの交換ではない |

runのHTTP軸は全開始attemptの終端から合流する。進行中をconfirmedにせず、全開始attemptがconfirmedになった時だけ終端confirmed。1件でもunconfirmedならsticky、開始0件はnot_started。worker軸は別所有部からの型付き終了結果だけを採用し、HTTP終了やworker未起動からconfirmedを推定しない。worker未接続の次期試験ではnot_startedのままにする。

raw例外・message／stack・HTTP body・token／principal・内部identityを診断へ保持しない。固定stage／code／有限なcleanup理由（pending fetch/read、cancel拒否、closed未確認、lock解放失敗、期限等）を扱い、局所診断件数も既存有限枠を超えない。解放後checkpointでもprimaryと両cleanup軸を保持する。

session.closeの同時実行枠返却は論理的解放であり、未確認I/Oの終了証拠ではない。未確認resourceを抱えたprocessの次run受付・quarantine／外側終了policyは承認待ち。この問題をactive枠だけで解消したとせず、本番有効化の停止条件とする。

## 7. fake I/Oの独立検証条件

| 試験群 | 必須条件 |
|---|---|
| 生成・binding | 同run／snapshot／ready／lease／source／permit／phase、二重claim、失敗後再生成、fixture／clone混入拒否 |
| bootstrap | per-user／OAuth cache／交換／retryの累計継続。認証前table／metadata禁止、OAuth秘密の一般受領物化禁止 |
| dispatch | commit直前停止はC=0、同期throwはC=1、retry最大2、予約不足は無dispatch、旧getとの混用拒否 |
| chunk | 1byte分割／同object再受領／超過chunk／空chunk／停止との順序競合。G/S/Eの等号・1超過、二重課金なし |
| cleanup | EOF、cancel fulfilled/rejected/pending、fetch/read pending、closed拒否、lock失敗、late Response、二重close。要求だけでconfirmedにしない |
| clock | D_io／attempt／phase／hard境界・逆行・非有限値・低減上限・post-await超過。cleanupにも新期限を作らない |
| 診断 | 先行取消／認証／予算理由と後続cleanup失敗を両方保持。HTTP／worker軸を混ぜず、未知例外は固定化 |
| 互換・秘密 | 0.2／0.3、selection mode省略、14明示／3既定規則、既存GET／P課金維持。コード本文／資格情報非出力、fixture非同梱 |

oracleは製品計数器を再利用せず、fake dispatch開始／採用read／slot操作／cleanup Promise決着／clockイベントから独立集計する。C、G、P、候補E、R、cancel／release回数を分け、各イベントで`C+R<=Q`、slot専用消費、一度だけの終端化を検査する。読取結果を返すfakeと、状態を直接申告するfakeを同一の実取得証明として扱わない。

逐次transportのactive attemptは最大1、pending readも最大1、未消費body候補も最大1。新しいlogical GET前にconsume／discardを要求する。cleanup未確認で停止したattemptを残したまま次attemptを作らない。終端reportは1試行1件・全runでQ以下を上界とし、固定集約後は不要なresource参照を外す。報告配列の実容量・late Promise保持・JSON decode後の実allocationは未検証のままで、全体work受付を有効化しない。

内部body候補が必要な試験は、private fake sourceが一度だけconsume／discardして参照を外す範囲に限定し、外へは件数・固定結果だけを返す。公開JSONや正式evidenceへの発行は0件を検査する。fake clockを進めた成功は実OSで60秒以内に物理終了できる証明ではない。

## 8. 次期実装の分割と承認待ち

1. **TC-01**：更新権限を持たない内部契約・typed cleanup終端・二軸診断slotを純粋fakeで検証。source／workerへの発行なし。
2. **TC-02**：固定lane初期化・一度限りのtransport claimと同sessionの単一stateへの結合をfake I/Oで検証。readonly leaseをcastせず、legacy混用／二重会計／失敗後再準備を拒否。
3. **TC-03**：同attemptのread／cleanupを注入Web Streamsで接続。未確認の停止・期限・独立oracleを確認し、実fetchを使わない。
4. **TC-04**：固定sourceのbootstrap／release／用途descriptorまで結合。payload／tableは選択receipt／worker plan工程の成立前に実行しない。正式発行口は閉じたまま。

承認待ち：内部配置・生成入口、cleanup内側予約・空readの候補値、E/R運用cap、制御work・保持量／同期parseの期限保証、未確認resourceの次run受付／外側終了、最終診断の公開写像。未承認をfake成功で代替しない。

本書はローカルソース・既存設計の照合とMD作成を対象とし、実装・実transport・実機操作・トークン発行・設定変更・本番cap／permit投入を承認するものではない。

## 9. 文書確認（2026-10-27）

新規本書と親2文書の計3MDについて相対リンク39件の参照先を確認し、欠落なし。`git diff --check`の空白エラーなし。旧transport設計の「prepared ownerが無い」等の記述を現行private lifecycle／release bindingと区別し、fixture分離時の説明は履歴として残した。ソース・test・設定を変更していないためbuild／合成テストは実行せず、接続や終了保証の動作証明とは扱わない。

上記はdraft-0.1文書作成時の記録。次のTC-01実装・合成検証と区別する。

## 10. TC-01：独立した純粋fake契約（2026-10-28）

### 10.1 内部型と発行境界

`src/review/abort-scope-evidence-cleanup-contract.ts`の`createFakeCleanupContract(clock, config?)`はfactoryごとのprivate WeakMapでpurpose／attempt／HTTP report／worker slot／worker reportを認識する。handleは凍結opaque object。実session・共通run owner・既存fixture会計の登録口を呼ばず、互換castやauthorityの昇格口を持たない。既存`!dist/review/abort-scope-evidence*`により非同梱。

purposeの受理値は固定用途名とordinal 1／2だけ。通常／finalの用途名とprivate phase identityを照合し、phase交換・clone・別realmを拒否する。one-shotはhandle単位であり、同じ用途名の論理GETの重複排除までは実装していない。ordinalは**fakeのラベル**で、実retryの受付・C/G/P/E/Rの会計・認証ready・ReleasePermit・選択payload／worker jobの由来を証明しない。TC-02以降の用途発行前提を実装したとは扱わない。

### 10.2 HTTP終端・一度限りの合流

`beginHttp`でモデル上のattemptを作り、`startHttp`でfake開始を記録する。`finishHttp`はsettlingを先に消費し、strict schemaのprimitive観測から終端を導出する。disposition／confirmedの直接指定や余分なpropertyを拒否する。

EOF／closed fulfilled／pendingなし／lock releasedが揃う場合のconfirmed/eof、cancel fulfilled等が揃うconfirmed/cancelled、fetch rejectedのconfirmed/no_response、bodyなしのconfirmed/no_bodyを区別する。pending fetch/read/cancel、cancel拒否、closed未確認／拒否、unknown reader、lock／abort失敗、不整合はunconfirmed。内部理由に`cancel_pending`を具体化した。HTTP200／JSON／body本文を受ける機能はなく、成功body receiptは発行しない。

`consumeHttp(attempt, report)`は同attemptの未消費票だけを一度合流する。clone／別attempt／別realm／worker票を拒否し、既知票の二重consumeはinvalid_state。票のreadonly検査は再利用可能だが、新しい開始権限ではない。未開始attemptの整合したnot_startedは、期限切れでも存在しないresourceをunconfirmedへ変えない。runの期限理由自体は別に保持する。

### 10.3 worker軸とrun診断slot

workerもfake slotだけを最大1つ作り、primitiveなtermination／listener／stdout／stderr状態から終端票を導出する。termination fulfilled・listeners detached・両stream closedが揃う場合だけconfirmed/terminated。未開始はnot_started、pending／拒否／未解放はunconfirmed。実Worker・terminate Promise・OS終了確認は扱わない。

HTTPとworkerの票は異なる内部型／台帳で、cross-axis consumeを拒否する。runのprimaryは最初の固定stage／codeだけを保持し、後続cleanup・closeで上書きしない。未知reason／Errorは固定internal_review_errorへ正規化し、本文・資格情報・raw exception・内部identityを診断へ出さない。

run確定前に開始済みresourceがある場合、軸は内部状態`in_progress`とし、将来の作業が可能なrunを終端confirmedとは表示しない。unconfirmedは直ちにsticky。`finishRun`で全開始票のconsumeを確認してからconfirmedへ確定する。pending／未消費の開始済みresourceはunconfirmedとし、未開始はnot_startedのままclaim不成立を診断に残す。worker未開始から終了確認を推定しない。in_progressは開発専用の内部語彙で、公開schemaへ追加していない。

### 10.4 停止・clock・再入

stop後は新しいpurpose／attempt開始を拒否し、元のclockでcleanup終端・票の合流だけを扱う。hard期限の等号以降に新しいconfirmed終端を作らない。既に期限内に確定した票を後でconsumeしても、その過去のcleanup事実は保持できるが、finalizeでは期限理由を記録し、新しい活動や正式発行を再開しない。

clock例外・逆行・非有限値は固定理由で停止。primitive入力cloneやclock callback中の再入、phase交換、最終closeの競合後に票を新規commitしない。closed後の未知票・取消・late成功は確定済み診断を変えない。timerはなく、期限はモデル操作時だけ検査する。自動中断・実OSの終了保証ではない。

### 10.5 有限枠と未対応

fake purpose／attemptはそれぞれ最大210、worker slotは最大1、active HTTP attempt／未消費HTTP票は最大1。reportはHTTP各attemptに最大1、workerにも最大1。設定で枠と60秒のモデル期限を下げられるが上げられない。`model_counts`は合成handleの数だけで、実HTTPのCや実会計を更新・コピーしたものではない。

受理される観測の形状は有限だが、不正raw入力のclone前byte制限・実allocation／control work上界は未実装。認証／session／source／lease個別の正式binding、retry順序、typed body、実Promise／cancel／lock操作、mutable会計port、予約枠、実worker job、上位公開結果は未接続。正式発行口閉鎖・Unknown・全体受付無効・telemetry／VM／監視保留を維持する。

TC-02のfake session内での単一state接続は§11を参照。このfake台帳を本物へ登録・昇格させない。

検証：[TC-01合成テスト・検証記録](E2E_BEST_PRACTICE_TC01_CLEANUP_CONTRACT_2026-10-28.md)。

## 11. TC-02：共通lifecycle・単一fake会計・停止の接続（2026-10-28）

実装：[run-transport](../src/review/abort-scope-evidence-run-transport.ts)、試験：[run-transport-cleanup](../tests/review/run-transport-cleanup.test.ts)。`createFakeRunTransportSession`は新しいfake sessionとsnapshotを自分のclosure内だけで生成する。既存の`registerReviewEvidenceSession`の実装をこのfake sessionで利用し、TC-01のcleanup分類器を合成する。**実際のBoundedReadSessionを生成・登録・採用したり、そのcounterを変更する接続ではない**。production lifecycle・bounded-read・既存fixture registry／portは変更しない。

### 11.1 所有権・claim・lane

- laneはstrict設定の`typed`（既定）／`legacy`から生成時に固定。session／snapshot／lease／counterを引数で受けず、外へも返さない。任意のsessionを後付け登録するexportはない。
- `claimTransport`はclock等の依存を呼ぶ**前**にclaimを消費し、1回だけ固定transport facadeを返す。二重生成・失敗後の再準備・legacyとの混用は受信側ownerを停止する。
- `legacyDispatch`はfakeの混用拒否・開始観測用probeだけ。実legacy GETの再実装ではない。legacy probeを開始してもtyped終端を示す入口はないので、終了時はHTTP unconfirmedで止まり、confirmedへ推定しない。
- handleの所属は同cleanup realmとprivate WeakMap、active slotで確認する。外国attemptは受信側だけ停止し、外国owner・会計は不変。

### 11.2 費目所有と原子的操作

| 費目 | TC-02の唯一の所有・更新点 | 拒否時の扱い |
|---|---|---|
| C | closureのrequests。active／用途形状／同slot／上限確認後、fake dispatch直前に1増加 | 同期throw・callback内取消・post-dispatch期限でも保持。未dispatchは0 |
| G／S | 同attempt・連番のfake chunk採用。native typed-array内部長を一度取得して、GとSを同期加算 | 超過chunkも1回加算後に停止。重複連番・外国attempt・停止後は加算しない |
| P | 同payload attemptのconfirmed EOFを消費した後、モデル上のpayload受理／discardを一度だけ選択 | UTF-8 byte数を1回加算。単体上限はlocal payload_limit、累計超過は全体停止。返金なし |
| clock | 初期origin・last・hardを同closureで保持 | cleanup初期化は同originを使う。逆行・非有限・例外はstickyで、復旧した値から確認済みへ戻さない |
| readonly lease | 同じC/G/P・lastから保護viewを返し、既存run lifecycleが読む | stats再登録・copyからの別会計・leaseのcastはない |
| E／R／T・retry受付 | **未接続** | TC-02で新しい台帳や予約を作らず、既存fixture側の値を正式値へ採用しない |

設定でC<=210、G<=16MiB、S<=4MiB、P単体<=2MiB／累計<=8MiB、hard<=60秒を下げられるが上げられない。GとSが同時超過ならGの全体停止を優先する。S超過も本番`bounded-read`と同じく`receive_budget_exceeded`で全体停止する（G超過と同じコード）。

`chargePayload`は**fakeの受理イベント**のモデルであり、文字列が実際のchunk由来であること、UTF-8 decode／JSON検証／版照合／source受領を証明しない。本文は保持・出力せず、正式なpayload receiptは作らない。未消費のpayload受理枠があれば次dispatch・final移行・正常finishを拒否する。discardはPを受理したことにはしない。

### 11.3 停止・cleanup・診断

1. 最初の固定primaryを共通ownerへ保持し、ownerを同期revokeする。
2. cleanupモデルのactive入口も同期停止。戻したtransport facadeは同ownerの失敗を毎回確認し、再開しない。
3. 保持中のHTTP／workerに対するfake abort／stopを最大1回要求する。callback例外のmessage・stackは採用しない。
4. 停止後も同current slotの`finishHttp`／`finishActiveHttp`、workerの型付き終端観測・消費だけを許す。開始失敗がhandleを返さなくても、private current slotを経由してcleanupできる。cleanup要求を完了証拠へ昇格させない。

内部状態違反は共通ownerでinternal_review_error、TC-01のhandle上限はrequest_budget_exceededへ固定化する。primaryとHTTP／workerのcleanup disposition・固定reasonは別slotで保持する。明示票がないまま終了したstarted resourceはunconfirmed／terminal_not_consumedであり、先行取消・認証・G/P理由を上書きしない。終了後の遅着・再claim・再cleanupでも診断は変わらない。

`finish`成功はfake契約が完了したことだけ。共通lifecycleが持つprimaryを消して成功へ戻さず、cleanなfake facade終了にはclosedという失敗を新造しない。HTTP成功・実worker終了・実sessionの解放・正式evidence発行の意味ではない。`status`は最後に観測したclockによるreadonly表示で、単独で新しいclock取得やタイマー停止を行わない。

### 11.4 確認範囲と残課題

51件の合成テストで、独立したイベント列（C=4／G=10／P=4）、上限等号／1超過、chunk replay、単体P局所拒否、claim再入、外国handle、停止callback、固定理由、時計不正・期限・二軸分離を確認。real fetch／Response／Web Streams／Worker／タイマーを操作せず、用途名・ordinalは引き続き合成ラベルである。

TC-03の限定接続は§12を参照。実session constructorでのlane選択とmutable port供給、認証／同sourceのReleasePermit・選択payload・worker jobへの正式binding、用途発行前提・retry／動的予約・E会計・50/55秒のphase cutoffは未接続。このモデルのfinal移行はTC-01の一方向phaseラベルだけで、元のhard期限・会計を再生成しない。

raw clone前のbyte枠、control work／allocation、empty-read policy、物理終了保証、未確認I/Oを抱える次runの許可は未証明。全体受付無効、Unknown、VM／監視／telemetry保留、正式発行口閉鎖を維持する。

検証：[TC-02合成テスト・検証記録](E2E_BEST_PRACTICE_TC02_RUN_TRANSPORT_2026-10-28.md)。

## 12. TC-03：注入Web Streamsと同attemptの終端結合（2026-10-28）

実装：[run-stream](../src/review/abort-scope-evidence-run-stream.ts)、試験：[run-stream-cleanup](../tests/review/run-stream-cleanup.test.ts)。固定factoryがTC-02のfake sessionを自分で生成し、transport claimを1回だけ消費する。任意session／adapterの採用口は作らず、旧fixture transport registryも利用しない。sourceは`(AbortSignal) => Response | Promise<Response>`の信頼された注入依存で、URL・秘密・コードを渡さない。global fetch、実OAuth、実workerは呼ばない。

### 12.1 読取と終了観測

1. fake dispatchのC commit直後、同じcurrent resourceでsourceを1回呼ぶ。同期throw／Promise rejectはsettled no_responseとして区別する。
2. Response／bodyの再利用をprivate WeakSetで拒否。既にlockedなら所有readerを奪わず、unknown_lockのまま停止。getReaderは1回だけ。
3. 所有readerの`closed`をread／cancel／releaseより前に取り、fulfill／rejectの両handlerを即時登録。closed拒否はread拒否と競合してもinvalid_responseを先に保持する。
4. pending readは最大1。完了後に同ownerのclock・停止を再検査し、採用できたUint8Arrayだけを同attempt・連番でG/Sへ課金する。超過chunkは1回課金、取消／期限後のchunkは不採用。本文のcopy／decode／JSON解析は行わない。
5. EOF時は不要なcancelをせず、captured closedの決着とpending readなしを確認してreleaseLockを1回試行。中断時は所有reader.cancel、reader未取得かつunlockedのbodyだけbody.cancelを1回要求し、Promiseの決着を別に観測する。
6. releaseLock成功はlock解放の事実だけ。cancel fulfilled／closed fulfilledの代用にしない。失敗・未知所有・未決着はTC-01のstrict primitive票へ渡し、同attemptで終端化・消費する。

runは逐次1件だけ。例外・begin後の取消・終了競合もfinallyの一度限りの固定sectionで終端化する。遅着Responseへのcancel／所有readerの解放はbest-effortで行うが、確定済みのunconfirmedや診断を修復せず、counter・receiptも更新しない。worker軸は未接続のnot_startedを維持する。

### 12.2 同じ期限と注入wait

- TC-02に観測専用の`observeTransportClock`を追加。同じorigin／last／hardを読み、停止後のcleanupにも新しい起点を作らない。再入時は外側busy guardを解除せず固定拒否する。
- `begin`の省略可能なtimeout（最大10,000ms）から同ownerが絶対attempt deadlineを計算し、TC-01のattemptに固定する。省略時は従来どおりrun hard deadline。typed確認はattempt deadlineの等号以降では成立しない。
- adapterは最大10秒のrequest timeout、最大250msかつ残量の1/4のcleanup内側予約を**fake候補値**として検証する。予約不足はC=0のまま拒否。I/O cutoffでupstream_unavailableを保持して中断し、元のattempt deadlineまでだけ終了を観測する。新retryやsoft cutoffの本番分類は未接続。
- waitは注入した`clock.schedule(absoluteDeadline, wake) => dispose`だけ。進捗・取消・期限のたびに解除し、終端後の待受timer数は0。scheduler／dispose失敗は固定internal_review_errorと未確認を保持して停止する。時計不正を古い時刻で代替しない。
- 空readは連続数ではなく1 attemptの累計で最大16回という未承認fake候補。下げられるが上げられず、超過で停止する。native APIを呼べたことは制御work・allocation上界の証明ではない。

### 12.3 結果・秘密・未対応

外へ返すのは固定成功／失敗、readonly会計・診断、read/cancel/release/waitの有限な操作数だけ。reader、Response、body、text、chunk、資格情報、raw例外は返さない。payload用途のEOFもモデル枠を明示discardするだけでP=0、sourceの取得証拠・payload receiptにはしない。

33件の注入Streams試験とTC-02追加2件で、独立操作oracle、cancel拒否／pending、閉鎖未確認、release失敗、stream再利用、locked reader、期限後read、予算超過、scheduler失敗、予約不足を確認した。counter／clock bindingはfake session内だけであり、実session・ReleasePermit・選択payload・worker jobへの正式bindingではない。

TC-04のfake固定source接続は§13を参照。実認証ready／権限／retry／E/R予約・soft cutoff・本番mutable portは未接続。遅着Promiseが保持するresourceの物理解放、悪意ある注入依存／動かないschedulerへの隔離保証、実OSの強制終了、全体work受付は未証明。正式発行口閉鎖、Unknown・全体受付無効、VM／監視／telemetry保留を維持する。

検証：[TC-03合成Streams検証記録](E2E_BEST_PRACTICE_TC03_WEB_STREAMS_2026-10-28.md)。

## 13. TC-04：固定sourceのbootstrap・release・用途descriptor（2026-10-28）

実装は[run-stream](../src/review/abort-scope-evidence-run-stream.ts)の同module private coreと`createFakeRunFixedSource`、試験は[run-fixed-source](../tests/review/run-fixed-source.test.ts)。旧fixture adapter／registryを登録・昇格させず、新しいfake sessionのtransport claimを1回だけ消費する。同じcoreをsource-ownedのまま使い続け、bootstrap後にcounter・起点・cleanup ownerを交換しない。

### 13.1 固定入口・発行順

| 入口 | private前提と一度限りの遷移 | 外部へ返すもの |
|---|---|---|
| bootstrap | created→authenticating→authenticated。per-user／service-account-cachedは生成時のfake premise、exchangeは同transportでPOSTを1回 | fake auth_readyとdisabledのみ |
| readParent | authenticated→parent_ready。同じUpdate Set IDの単一recordを要求 | parent_readyだけ。recordはprivate |
| resolveRelease | parent_ready→matched／unmatched。同じinstance bindingと設定snapshotで判定 | 固定family・source分類・制限と、matched時だけopaqueなfake permit |
| listMetadata | 同sourceのpermit参照とmatchedを要求。1回だけmetadata_readyへ | 件数・selected・truncatedだけ。行やpayloadなし |
| recheck | 同permit／metadata_readyからfinalへ一方向移行。親→metadataを同transportで再読 | normalized観測のstable_observation／changed。sealやscope比較結果ではない |
| cancel／finish | 同ownerを停止しprivate permit／保持recordを失効・破棄 | 先行primaryとHTTP／worker診断を維持 |

全await後、source結果をcommitする直前に同clock・停止・予定stageを再検査する。read側の成功とsource側commitの間のmicrotaskで取消が届いても、matched permitやready状態を発行しない。二重bootstrap／親／release、順序違反、foreign／clone permitは受信側だけ停止し、失敗後にclaimを復元しない。

TC-02のfake認証ready遷移は同private snapshot／readonly leaseから1回だけ行い、ready_generationは1のまま。これは**実tokenの本人性・認証済み主体を証明する入口ではない**。production lifecycleの呼出元・実session constructor・公開MCP入力は変更しない。

### 13.2 用途descriptorと受信

source callbackへ渡すdescriptorは同module内だけで構築しfreezeする。callerからmethod・path・fields・query・ordinalを受ける汎用read口はない。

- exchange：`POST /oauth_token.do`、grant_type=client_credentials、ordinal=1という**合成ラベル**のみ。資格情報は渡さず、実token発行をしない。
- parent initial/final：固定sys_idの`sys_update_set/<id>`、fieldsはsys_id/state/application/sys_updated_on/sys_mod_countだけ。
- release_rows：`sys_cluster_state`、`fields=build_name`だけ、limit=21。20超はunknown。内部address／certificate等の余分な列は保持・出力しない。
- metadata initial/final：`sys_update_xml`、queryは固定Update Set ID＋ORDERBYsys_id、fieldsはsys_id/update_set/name/type/actionと版だけ。max_records+1（最大101）のsentinelを守り、別Update Set・重複／順序不正を拒否する。選択modeはこのsubsetではbounded_allだけ。

OAuth／親／releaseはprivate captureを16KiB、metadataは1MiBに限定する。C/G/S上限は既存の単一stateを使い、cap超過chunkも1回課金して停止する。正常採用分は**同じprivate byte snapshotを課金と後続解析に使う**。注入clockが元chunkを書き換えても、会計後に別内容を解析しない。scratchは1つ、終端で参照を破棄し、保持byte数は0へ戻す。物理zero化の証明ではない。

capture／strict UTF-8 decode／JSON projectionは同module private継続だけ。TC-03の公開fake Streams facadeは引き続き本文非capture／非返却で、任意projectorやrunProjectedを公開しない。typed cleanup確認と期限検査の後でしかprojectionせず、解析後も期限を再検査する。OAuth token/type/lifetimeの検証結果はbooleanだけで、tokenは継続・一般body receiptへ渡さない。

### 13.3 C方式のfake判定と停止

既存`pinReviewReleaseConfig`を再利用し、constructor時の設定snapshot・canonical origin／instance_id binding・hard期限全体の有効性を照合する。実設定ファイル読み込みやtrust承認を今回実行したことにはしない。

- release-onlyの3xx（本番`redirect:'error'`の転送失敗相当）／403／404／429／5xx、settled no_response、request timeout、空観測は、**cleanup confirmed後だけ**有効な設定assertionへfallbackできる。401と他用途の403は従来どおり全体停止。
- releaseのrequest timeoutは本番`bounded-source`と同じくrelease観測だけを終える。I/O cutoffで同attemptのcontrollerだけをabortしてbodyをcancelし、run全体は停止しない（中断後の本文は課金のみで解析しない）。fetch未決着・closed拒否などcleanup未確認なら従来どおりfallbackせず全体停止。
- releaseのその他4xx（400／405等）と本文なし2xxは、本番と同じく全体停止せずobservation_incompleteのunknownとする。
- release以外の非2xxは本番`bounded-read`と同じコードで全体停止する：401→authentication_failed、403→access_denied、404→not_found_or_not_visible、3xx／429／5xx→upstream_unavailable、その他4xx→invalid_response。read拒否のinvalid_response（§12）は本番（upstream_unavailable）と異なる意図的なfake分類として維持する。
- config binding不一致はrelease GET前にunknown。期限切れ／残有効時間不足はfallback不可。実測と設定・複数nodeのfamily衝突、未知family、欠落・不正・20node超はunknown、既知の非対象familyはmismatched。
- bounded bodyがcleanup済みだがJSON／行の形が不完全ならobservation_incompleteのunknownとし、assertionで補わない。受信cap超過・時計・取消・cleanup未確認等の全体停止をfallbackへ格下げしない。
- matchedの判定はcatalogを参照。observedはrelease_visible_nodes_only、assertedはrelease_operator_asserted／release_not_observed／release_config_may_be_stale／release_observation_unavailableを保持する。

`FakeFixedReleasePermit`は同factoryのprivate参照とstageにだけ結合した合成handleで、本物のReleasePermit／SourceRunEvidence／選択receiptにはならない。出力summaryにはsynthetic=true・evidence_issuance=disabledを付ける。metadataはcount-onlyであり、コード／payload／tableの取得入口やworker job発行口は作らない。

### 13.4 未対応・次工程

実session／AuthSnapshotIdentity・実source ReleasePermit・選択payload／worker jobへの正式binding、retry（今回はordinal=1だけ）、E/R/T予約、50/55秒のphase cutoff、本人性確認・実OAuth・production cap投入は未接続。fixed workflowのCはper-user／cachedで通常3＋final2、exchangeで1増えるだけであり、210試行／G16MiB／hard60秒等を増やさない。

TC-04後の①実session／ReleasePermitと②単一transport・正式body受領境界は[後続の詳細設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md)へ整理した。選択window・payload receipt・worker planの正式bindingはさらに後工程。今回のfake permitやprojectionを本番へ登録・採用せず、必要な証拠の正式発行前提を別工程で検証する。allocation／同期JSON parse・全体work上界、未決着resourceの物理解放、実OS期限保証は引き続き未証明。正式発行口閉鎖、Unknown・全体受付無効、VM／監視／telemetry保留を維持する。

検証：[TC-04固定source合成検証記録](E2E_BEST_PRACTICE_TC04_FIXED_SOURCE_2026-10-28.md)。
