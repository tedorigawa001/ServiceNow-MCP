# AU-BR-006 単一予算・停止・typed cleanupと共通run ownerの接続

Version: br006-run-transport-cleanup-draft-0.1 / Date: 2026-10-27。
Status: **詳細設計のみ。fake I/Oでの次期検証範囲を定義。実装・transport有効化・正式証拠発行・cap承認は未実施／閉鎖**。

親：[共通run owner §14・§15](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)、[用途別transport／cleanup](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)、[bounded予算](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md)。
後続：[選択／payload受領物](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)、[worker接続契約](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md)。

## 1. 目的と非対象

同sessionの既存C/G/P・単調時計・停止を唯一の所有物として維持し、用途／attempt／cleanupの型付き結果を共通run ownerへ接続する。**JSONが返ったこと、abortしたこと、slotを解放したことを、取得証拠や終了確認へ昇格させない**。

次期実装の検証はfake fetch／注入Response・Web Streams／fake clockに限定する。global fetch、PDI、実OAuth発行、実worker job、公開MCP引数のmode追加、production cap投入は対象外。本書の型・method名は提案であり、現在利用できるexportではない。

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

元のD_hardと通常／整合cutoff（60秒時50／55秒）を維持する。1試行は`D_attempt=min(t+requestTimeout,D_phase,D_hard)`、既存候補の`K=min(250ms,floor((D_attempt-t)/4))`をcleanupへ内側予約し、I/OをD_io=D_attempt-Kで止める案をfake試験する。K<=0ならdispatch前拒否。**250ms・empty read16回等は未承認のpolicy候補で、今回の採用・実装ではない**。

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
