# RA-02③ 同handoff・route結合の接続差分設計

Version: br006-finish-assembly-binding-draft-0.1 / Date: 2026-11-02。
Status: **設計のみ・未実装。合成依存限定・証拠発行なし・正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `d263282`。[RD-A](BEST_PRACTICE_ABORT_SCOPE_FINISH_CONTEXT_RDA_DESIGN.md)§2〜5・10と[RA-02①②検証記録](E2E_BEST_PRACTICE_FINISH_ASSEMBLY_RA02_2026-11-02.md)に対する接続差分。実装・実接続・実通信・設定変更・実Permit投入の承認ではない。

## 1 現行コードから確定した不足

| 現行 | 接続時に不足する保証 |
|---|---|
| 新finish assemblyは独立したownerとreceiptをbind時に生成する | 既存SC2-D側のowner／seed／receiptとは別物。同じID・日時でも同一性を証明できない |
| SC2-DのtransferredPlanは旧issuerのclosure内、外にはopaque handoffだけ | finish側がsummaryやinspectからplanを復元してはならない。外部handoffを二つのownerへ登録する方式も不可 |
| acceptWorkerGenerationReadyはevent／leaseを一度消費する | ready受理の元identityを後続のprivate route用に保持していない。ready_events=1だけでは代替不可 |
| generationCleanupContext.startedはstartWorkerGenerationでtrueになる | これは**worker起動済み**の意味で、cleanup開始済みを表す値ではない。cleanup未開始の証拠へ読み替えない |
| recordWorkerGenerationCleanupは診断sinkの終端を記録する | cleanup要求の前に単調な開始claimを立てる独立境界とserialはない |
| finish側のRA-01検査用route／plan placeholderは破棄済み | 再生成してlive routeとして登録・復活させない |
| SourceLifecycleSlotがない | sourceが今openであるか、close開始後かをpinや公開counterから推定できない |

したがって、`attach(existingIssuer, binding, handoff)`、任意のgetter callbackでplanを読むfriend、raw receiptの後付け登録は採らない。先に同ownerの生成元を一つにする必要がある。

## 2 生成元と共通kernelの境界

採用する設計は、**tests配下のprivate共通recovery kernelを抽出し、legacy入口と新finish-capable入口がそれぞれ新しいrootを生成する方式**。実装配置・関数名は次工程で確定する。既存rootを新モードへ切り替えるAPIやglobal registryは作らない。

- 旧`createSyntheticSoftRecoveryIssuer(seed, facts, check)`の引数・戻りAPI・claim順序・summary／discard・診断を維持する。legacyのrootではfinish補助slotを生成せず、新しい発行口も見せない。
- 新しい合成finish-recovery入口は、新規rootの構築継続でのみpin・receipt ledgerとrecovery状態を一緒に作る。owner identity／busy／hard／check／timeを各一つにし、旧issuerを外からwrapして二重のguardを作らない。
- 現行RA-02①②のdata-only factory／bind／prepareと試験は維持する。既にbind済みのdata-only assemblyを新rootへ移行させない。共通化できるbounded pin処理はprivate kernelとして抽出するが、callerへpinやissuer setterを返さない。
- 新入口の構築データは合成descriptorのみ。元receipt、run／source／window／release参照、active input、元worker refsを内部で一度生成し、recovery seed／factsとfinish ledgerの両方が同じ参照を使う。既存の外部owner／receipt／frameを受け取らない。
- active inputは同ledgerの一件に結び、not_processedとして保持する。最新receiptとは限らない既存SC2-Aの許容を維持する。Uは全retained inputから確認し、activeのT_iで置き換えない。
- immutable reviewed fixture pinは合成構築の前提であり、実WJ-Bのanalyze受理証拠ではない。元analyzeのcapture hookや実結果の由来は引き続きUnknown。新入口の合成保証を実sessionへ昇格しない。

private kernelをruntime／srcへ移さず、実classや実sessionの登録台帳を共有しない。new rootの構築失敗は返却前に参照を破棄し、固定診断だけを残す。private kernelのexportが必要な場合も、既存ownerを引数で受ける再登録口にはしない。

## 3 同handoffとの一度限りの結合

新root内の固定継続で、SC2-Dの同transferredPlan・handoff slotとfinish補助slotを読む。raw header／結果／plan、caller callback、summaryを受け取らない。引数にbinding／handoffを使う場合も、同closureが発行して未消費のidentityに完全一致することを必須にする。

`unused → checking → bound`の結合claimは最初の外部guardより前に消費する。失敗はfailedで終端化し、slot・claimを戻さない。成功してもhandoffの受取slot自体は保持し、RA-03の原子的受理まで二重消費しない。RA-02④のissue開始claimとRA-03のaccept／route利用claimは別に残す。

検査順は次の固定順序とする。

1. 同ownerのbusy／hard・元guardを確認し、binding／handoff identity・未消費状態を確認。
2. 同planのowner／seed／time、source／budget／release／origin／window identityを、同構築のpinと比較。
3. selectedの順序・全outcome state／reason・receipt別ID／T_i／state・期待context・reviewed／omitted起源を照合。欠損をheaderやsummaryで補完しない。
4. 同verify後のcollection／consistencyと必要limitations／errorsを固定継続で合流。pin済みheader基礎値を応答で置換せず、必要制限を消さない。limitations上限超過は拒否。errors打切りは既存規則を維持し、元の型付き事実はprivateに保持。
5. §4の同source open・同新frame ready・cleanup未開始を検査。
6. 同guardと同live状態をpost側で再検査し、その後だけprivateな結合済み状態を確定。inspectへは固定状態と件数だけを出す。

RA-01の返却projectionは通常containerをcopyしており、元frame identityを持つhandle graphの代替ではない。比較用graphは同kernelの元private参照から組み立て、projection値やsummaryから再構成しない。ローカルのshape・文字量・node枠は維持し、比較で二入力を扱う場合もRA-01の共通枠をリセットしない。

## 4 live routeのprivate状態

| slot | 発行・更新元 | 無効化 |
|---|---|---|
| SourceLifecycleSlot | 同root構築のfake open。元source identityに固定 | close開始を依存呼出しより前にclosingへ更新。closed／failedからopenへ戻さない |
| ReadyOriginSlot | 同lease／eventのaccept後、post-guard受理継続で保持するprivate identityと新frame | cleanup開始・hard・closeで利用不可。公開ready handleやcounterのcopyから作らない |
| NewCleanupLifecycle | 同新frame／診断sinkに固定。cleanup_started=false、serial=0 | cleanup要求開始claimでtrue／1へ単調更新。worker起動のstartedとは別変数。診断confirmedでも0へ戻さない |
| BoundFinishRouteSlot | 同plan／handoff、上記source／ready／cleanup originsへのprivate参照 | いずれか失効で結合を無効化。古いsnapshotで再受理しない |

cleanup要求の開始境界は、終了recordだけでなく要求処理そのものの前に必要。診断sinkは発行済みならhard後も結果回収に使えるが、live routeや正常cleanup能力へ昇格しない。旧世代のcleanup confirmedで新frameの責務を免除しない。

RA-02③はroute利用claimを消費せず、証拠handleも返さない。結合後にcleanup／source closeが始まれば結合状態を失効させる。RA-02④でissueする時とRA-03でacceptする時にも同live条件を再検査し、今回の結合成功を将来までの生存証明にしない。

## 5 停止・解放・互換性

最初のhard code／stageを保持し、pin／handoff／bound route等の実行に転用できるprivate参照を失効させる。元soft・verify・旧cleanup・新cleanup・source終端は診断軸を分ける。取得済み診断sinkは固定回収責務へ残し、参照破棄だけを正常cleanupと呼ばない。

legacyのsummary／固定discardは維持する。summaryを選んだplan、消費済みhandoff、cleanup済みframeを新routeへ戻さない。新rootの結合後にsummary／discardとの競合を検出した場合も、片方だけが消費できる同台帳で停止する。通常closeは未消費handoff／cleanup責務を隠さない。

新analyze／input／HTTP／finish／E採取は0。S／全L／O／T_i／UとC/G/P・retry prefixを変更・再課金しない。生成・pin・照合・guard・失効・破棄の局所workは別費目で計数し、既存の会計値が不変という理由で追加workを0としない。exact layout／allocation・全体work上界・本番capはUnknownのまま。

## 6 実装順と受入条件

| 分割案 | 次に確認する範囲 |
|---|---|
| RB-A | 共通kernelの生成境界抽出。旧API／全旧試験とRA-02①②を維持し、新入口はまだrouteを受理しない。各rootのowner／guard／claim独立、後付け登録なし |
| RB-B | 新入口構築での同receipt／source／window／releaseとpinの供給。元active receipt・selected／T_i／U・元state、異なる構築の混入拒否 |
| RB-C | ready受理origin、source lifecycle、cleanup開始serialを同rootへ追加。開始前／中／後、guard再入・取消・失効を区別 |
| RB-D | 同handoffの一度限り結合。pre/post照合と競合・失敗後再利用拒否。証拠発行は引き続き0 |

必須の負の対照：別root／copy binding／copy handoff／summary／RA-01 value／RA-02①②の準備binding、同値だが別receipt・source・frame、selected追加／欠落／順序変更、T_i／U書換え、reviewed起源欠損、verify由来の制限削除を拒否する。他rootは不変であることを確認する。

ready_events=1でもcleanup開始済み、source closing／closed／failed、発行済み診断sink消費後なら拒否する。worker起動済み・cleanup未開始の正常例を対照に置き、二種類のstartedを混同する変異を検出する。依存が再入例外をcatchしてもpost-guardでhardが勝ち、失敗後にslotを復元できないことを確認する。

配布物では新kernel／入口／brand／scope／宣言／mapの非同梱と、runtime root・I/O／clock／worker依存の負の対照を継続する。共通kernel試験と既存class／実session保証を混同しない。全体合成回帰・build・strict型検査・lint・梱包確認を各分割で行う。

## 7 承認・未確認事項

この文書は接続方針だけで、RB-A〜Dは未実装。具体的なkernelファイル配置・旧wrapperの戻り型互換性、共通pin型の最小抽出、固定合流規則の費目別上界は実装前に確認する。既存APIsを緩める可変modeや任意hookを追加しない。

RA-02④の一度限りの証拠発行、RA-03の証拠とhandoffの原子的受理、RD-B以降のE／finish／候補・正常cleanup能力は別工程。正式発行口閉鎖・全体受付無効・調査保留を維持する。
