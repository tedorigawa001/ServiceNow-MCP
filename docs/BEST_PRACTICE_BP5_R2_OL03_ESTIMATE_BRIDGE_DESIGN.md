# BP-5 R-2 OL-03：estimate消費型bridge・利用guard7の詳細設計

Version: draft-0.2 / Date: 2026-10-21 / Status: 設計のみ。ScanInputs側の利用状態・bridge・guard7・collector入口guardは未実装。

## 1. 範囲と停止状態

[sealed profile/計算器設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_SEALED_SCAN_PROFILE_DESIGN.md)の次工程として、ScanWorkEstimateを値で消費し、同Inputs/round/budgetで既存の合成collectorを一度だけ呼ぶ内部bridgeを設計する。基準は `1c04193`。`profile.rs`、`profile/calculator.rs`、`scan_inputs.rs`、`phases.rs`、`scan_ops.rs`、`scan_ops/collector.rs`、`strict.rs` を読み取り、実装済み部分と接続案を区別した。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。実装・OS接続・実機操作・トークン発行・設定変更・本番policy投入・permit発行は本工程に含めない。bridgeは予約、受付、実行permitではない。上界が小さいことやguard成功を根拠に運用経路を開けない。

本書はrepository内の契約設計であり、外部仕様・OS API調査や実機検証ではない。workは課金ブロック数で、CPU時間・RSS・hard期限の証明ではない。

## 2. 現在の境界と変更しない処理

| 現在の処理 | 既存契約 | bridge追加時の扱い |
|---|---|---|
| profile→calculate | profileを値で消費し、estimateが所有。require5＋算術15＝20 work | 変更しない。収集/計算をbridge内で再実行しない |
| `collector::collect` | 同Inputs/current、ScanOps source、Option<Quotas>、元budgetを受け、Outcomeを返す合成経路 | 本体のS費用・操作/cleanup検査を維持して呼ぶ |
| `Inputs.complete` | S.sealとして追加index再認証/全集合照合後にClosureObservationを生成 | 省略しない。bridge側で同じ観測を作り直さない |
| `phases.after_scan` | Ready→Compared。観測binding検査とindex再認証/集合照合 | bridge外のI費。必ず後で行う |
| `phases.finish` | Compared→Finished。record再読/厳密検証を挟みFinalIndex/Node照合 | bridge外のI/R費。省略しない |
| 通常 `strict_round` | 現在は従来のClosureSourceを呼び、estimate/完全collectorと未接続 | 本書では切り替えない。後の通常strict統合は別承認/検証 |

既存の直接collect合成テストはestimateを要求していない。draft-0.2では、外側のcollect入口も同Inputsの利用状態を消費する構造へ変更する案とする。未claimのInputs、guard途中で失敗したInputs、既にcollectorへ渡したInputsでは、新しいsource操作前に拒否する。旧本体を呼ぶ口はprivateなkernelに閉じ、直接kernelを必要とする合成試験はcfg(test)専用入口に限る。他はbridge経由へ移行する。現ソースはまだ変更しておらず、この強制は未実装である。

## 3. 所有権・内部API案

以下は擬似契約で、公開Rust API/JSON schemaやコンパイル済みsignatureではない。

```text
consume_and_collect(
    estimate: ScanWorkEstimate,       // 値で移動。返却しない
    inputs: &同ScanInputs,
    current: &同RoundScope,
    source: 合成ScanOps source,       // 値で移動。事前にhandleを取得していないもの
    quotas: Option<合成Quotas>,      // estimateから生成しない
    budget: &mut 元SharedBudget
) -> BridgeOutcome
```

bridgeはcalculator配下のprivate module/methodを第一候補とし、estimateのprivate fieldへ内部からアクセスする。collector側には共通のstrict祖先までに限定した型付き呼出口を置く案とする。必要なsource/Outcome等の可視性は最小限に調整するが、raw constructor・primitive操作・policy/任意callbackを公開APIへ広げない。正確なlifetime/可視性は実装時にコンパイラで確認する。

呼出し先は固定の既存collector本体に限定する。任意のFnOnce/trait実装を「collector」として渡す口や、呼出し元がkernel IDを自己申告して別実装へdispatchする口を設けない。ScanOpsの合成source注入と、collector本体の差替えは別物である。

| 型/状態 | 方針 |
|---|---|
| ScanWorkEstimate | profileを所有したままbridgeへ移動。Clone/Copy/serde、profile取り出し、失敗時の再返却を禁止 |
| 利用claim（追加案） | ScanInputs内のprivate `scan_started` 相当のCell状態。estimateには置かない。状態遷移は§3.1 |
| 一時的な検証状態 | 同stack frameだけに置く。保管/再発行可能なtokenやscan permitを返さない |
| BridgeOutcome（追加案） | guard前/collector開始前のNotStartedと、collectorを呼んだCollectedを区別。estimateや再試行権を含めない |
| cleanup summary | Collectedなら既存Outcome.summaryをmoveして保持。NotStartedなら「未開始」と記録し、架空のcleanup完了票を作らない |

estimateとsourceは成功/失敗ともbridge内で消費する。sourceは合成段階では事前handleなし・constructor/Dropに外部効果なしを契約とし、guard失敗時の破棄が新しいI/Oを起こさないよう試験する。将来OS sourceが事前resourceを持つ場合、その所有・解放費/不明時の扱いは別設計を必須とし、7 workに吸収しない。

### 3.1 ScanInputsの単調な利用状態

estimateはmove/非Cloneによって再利用不能なので、estimate内のboolを追加しても直接collect経路は制限できない。Inputs側に状態を置き、bridgeとcollectorの双方が同じ状態を使う。単なる「消費済み=true」をcollectorが読むだけでは2回目も通るため、次の単調な状態遷移を採用する。

| 状態 | 遷移させる場所 | 拒否条件/意味 |
|---|---|---|
| Fresh | Inputs構築時のみ | profile_startedとは別のscan利用状態 |
| Attempted | bridge入口、最初のfallible処理前にFreshから移す | 元がFresh以外なら拒否。失敗でもFreshへ戻さない |
| BridgeReady | guard第7点で全検査成功後、Attemptedから移す | 正当なestimate/同bindingの確認を完了。guard途中の失敗では作らない |
| Entered | collector入口でBridgeReadyを一度だけ消費 | Fresh/Attempted/Enteredは拒否。quota不足/中断/途中失敗でも戻さない |

BridgeReadyには元startedと入口rの固定snapshotを持たせる案とする。receipt/scope/token/originは同Inputsのdeclarationへのborrowから照合し、呼出し元にsetter・公開constructor・状態resetを与えない。collector入口は同RoundScope object・同origin/started/rを再確認する。後続の既存layout/Ready検査は省略しない。

collector入口では状態を先に不可逆に消費してから、fallibleな課金/検査を行う。正しいBridgeReadyでも、そこで取消/期限/上限に達したら再利用不可。状態の消費は新budgetへ移す権利やpermitを作らない。bridgeからcollectorへの間にawait/任意callbackを挟まない。

Fresh→Attemptedは失敗時にも試行を使い切るための記録、第7点のAttempted→BridgeReadyがscan利用claimの確定である。profile_startedをscan用へ転用・resetせず、同roundのInputs再構築も引き続き拒否する。

入口でclaimする対象はestimateが所有するprofileの**元Inputs**に固定する。呼出し元が別Inputs引数を渡しても、その別Inputsの状態を書き換えない。第1〜5点で引数との同一性を検査し、別InputsへのBridgeReadyの持込みを拒否する。状態の変更口はbridge/collector用の内部関数に限定する。

## 4. 同receipt／round／budgetへの結合

利用guardは既存Profile.requireを再利用し、同じobjectと元の予算を要求する。

- estimateが所有するprofile→同ScanInputs object→同declaration/phase/receipt/target/contextをborrowする。同bytes/hash/generationでも別allocationは不可。
- 同RoundScope object、同round enum、同tokenが必要。Initial/BeforeM4/AfterM4の間で持ち越さない。同round名の新tokenも拒否する。
- 同budget originのRc同一性と元startedを要求する。別budget、同originを装った別start、期限リセットは拒否。
- estimate生成時のretry残rと利用直前の現retry残を一致させる。増減ともChanged。新budgetやr更新で救済しない。
- 元phaseがReadyであることを確認する。profile/estimate/Inputsのborrowがphaseの可変遷移を阻止する部分はlifetimeで表し、runtime guardも残す。
- index path/raw長/hash、root device等は同receipt/Inputsから既に由来が固定されている。bridgeで再取得・再parse・統計収集をせず、不変borrowを保つ。

guardが通ってもrecordのwall-clock期限、FSの不変性、sourceの真実性は新たに証明されない。既存のrecord再読・clock_check・M0〜M4・S.seal・AfterScan/FinalIndexは残す。

## 5. 利用guard7の固定スケジュール

**入口でestimateを移動し、同InputsのFreshを最初のfallible処理より前にAttemptedへ消費する。** 既存失敗・取消・未知modelで止まっても戻さない。Attemptedはcollector開始条件ではなく、第7点が成功した場合だけBridgeReadyへ進める。

| 課金点 | O.useの処理 | work |
|---|---|---:|
| 1〜3 | Profile.require内のInputs.guard：scope/budget/receipt等の一致、Ready、同declaration | 3 |
| 4 | Profile.require内のprofile固定model、同Inputs/scope/origin/startedの確認 | 1 |
| 5 | Profile.require内の保存rと現retry残一致、終端checkpoint | 1 |
| 6 | estimateのcalculator/kernel固定modelと、固定呼出し先collector係数modelの一致 | 1 |
| 7 | 同Inputsが今回のAttemptedで元はFreshだったこと、binding/start/r不変を確認。終端guard成功と結びBridgeReadyへ一方向に移す | 1 |
| 合計 | 元SharedBudgetへ課金。新budget・返金・予約なし | **7** |

第6/7点も既存workの前後guardに加えて検査後checkpointを置く。unknown/旧modelであれば第6点まで、work不足なら該当prefixまでで停止する。既存sticky failureがあれば課金前に元理由を返すが、利用claimは消費済みのままとする。各点は固定scalar/identity検査だけで、fieldの可変長走査・合計再計算・payload hash・quota全走査を含めない。

現calculatorのKERNEL_IDはcalculator IDのaliasで、collector側にはまだこの係数model宣言がない。実装時には固定collector入口と係数表を版で明示的に結び、**文字列一致だけで任意実装を認証しない**。入口が未対応/未知ならUnavailableにする。旧scan-work-0.1へのfallbackや任意の係数入力は不可。

7 workはcollectorに入る前の固定費だけである。独立resource/quotaの事前受付、全体残workとの比較、運用producerの承認は含まない。quota未提供は既存with_boundaryでUnavailable、範囲不適合はLimitとし、guardがquotaを発行・補充しない。

### 5.1 collector入口の追加guard（O.dispatch、1 work案）

外側collect入口でBridgeReady→Enteredの一度限り消費と、同scope/origin/started/rを固定scalarで照合する。新しいsource操作・with_boundary本体より前に行い、元budgetへ追加1 workを課金し前後/終端checkpointを置く。先行sticky failureは優先し、失敗時に状態を戻さない。

この追加費は**O.use7にも既存S.controlにも吸収しない**。外側collect入口と旧kernel本体を区別し、O.dispatch=1という別費にする。既存kernelの実費/係数model0.1はその範囲で維持できるが、bridge接続経路全体はdispatchを別途加算しなければならない。入口用の固定submodelをkernel係数と区別する案とし、具体ID/固定ブロック上限・実費は実装時に検証する。追加1は未実装の候補である。

## 6. one-shot・lifetime・成功経路

```text
Ready → bind_inputs → profile収集 → calculate（profile消費）
      → bridge（estimate消費・同InputsをAttempted→guard7→BridgeReady）
      → 外側collect入口（BridgeReady→Entered、追加guard1）
      → 固定kernel本体（既存S全費用、S.seal、cleanup終端検査）
      → bridgeの終端checkpoint → Collected(既存Outcome)
      → estimate/profile/Inputsのborrowを解消
      → AfterScan → record再読/clock/strict → FinalIndex
```

これは将来の合成接続順序で、通常strictへ実装済みではない。bridgeはReady→Compared/Finishedを実行しない。成功しても既存IndexPhases.stateはReadyのままで、呼出し元がInputsをdropしてからphases.after_scanへ進む。estimate/profileはbridge内で消費済みなので外へ逃がさない。

成功時はcollector既存のClosureObservationをmoveする。lineage/records/round/token/entriesをbridgeでclone・再構成・再sealしない。AfterScanでは既存どおり再検証する。S.seal成功をAfterScan完了票に変換しない。

失敗後のestimate/profile再返却、claim reset、同Inputsからの再profile/同roundでの別Inputs再構築は禁止。新規estimateを失敗後に作り直す運用retryも設けない。borrowed estimate/summaryを複数callbackへ渡してscanを繰り返す口を作らない。

### 6.1 scan中のretry消費

保存rは**利用入口のr**であり、scan中の既存EINTR処理は同共有残を消費できる。scan後にProfile.requireを再適用してr不変を求めると、正当なretryまでChangedになるため行わない。終端では既存budget.checkpointとcollectorのpending retry/cleanup検査を維持する。

上界 `U_S=U_base+3(r+1)` は入口のrで固定し、scan後に新rへ書き換えたestimateを再発行しない。次roundは同budgetの減った残からfresh profile/estimateを生成する。残scan予測は将来roundの実行権ではない。

## 7. 失敗・cleanup・終端

| 発生点/条件 | 分類・停止 | resource/返却 |
|---|---|---|
| 先行sticky failure、取消、元期限 | 元の理由を優先 | estimate/sourceをdrop。collector未呼出しならNotStarted |
| 別Inputs/receipt/target/context/scope/token/round/origin/start、Ready外、利用状態不適合、直接/二重collect | Binding | 新たなScanOps呼出しなし。再試行値を返さない |
| calculator/kernel/profile旧/未知model、固定collector未対応 | Unavailable | fallbackなし、collector未呼出し |
| 入口rの増減 | Changed | rを更新/復元しない |
| work上限、算術/quota上限 | Limit（既存理由があればそれを優先） | 既存spentは保持。予約や枠を増やさない |
| collectorの読取/hash/metadata/path/集合エラー | 既存理由を元budgetへ保持 | 既存RAII/cleanupを実行、部分Observationを返さない |
| cleanup未確認/pending retry/未完了宣言 | 既存with_boundary終端判定を維持 | summaryを保持して後続phaseを停止 |
| collectorが遅い成功を返した後、bridge終端で取消/期限 | 成功を破棄、checkpointの理由 | Observationをdrop。取得済みcleanup summaryは捨てない |

CollectedのOutcomeはresultとsummaryを一緒に保持する。最初のエラーが既にある場合、cleanup不明でその理由を上書きしないが、不明状態も消さない。呼出し元は失敗/cleanup不成立ならAfterScanへ進まない。成功resultだけを取り出してsummaryを落とすadapterは認めない。

bridgeのcollector前後に追加するcheckpointはworkを課金しない既存helperに限る。新たにsummary走査・work差分の比較・数値再集計を必要とするなら、それは7に含めずOの別費目と係数/試験を追加する。現在の案はcollectorの終端検査を再実装しない。

## 8. 費目所有と計算例

| 所有 | 内容 | 省略/重複の禁止 |
|---|---|---|
| O.bind | 既存Inputs構築 | guard7で済ませたことにしない |
| O.profile | count-only収集の実費/将来上界 | S.groupsの控除に使わない |
| O.calculate | require5＋算術15＝20 | O.useのrequire5とは別の呼出し。再利用して除外しない |
| O.use | 本書の利用guard7、estimate一度限り移譲 | S.controlや既存I.phaseへ吸収しない |
| O.dispatch（追加案） | collect入口の同Inputs状態消費/結合guard1 | O.use7・既存Sの実費/固定余裕へ吸収しない |
| S.control/groups/route/walk/enumeration/file/seal＋失敗用tail上界 | 既存collector全体 | layout/guard・groups・seal・終端費を減らさない。tailを新たな実測ownerとして増設した扱いにしない |
| I | AfterScan/FinalIndex/Node等の既存index子phase | S.sealを移管/完了扱いしない |
| R/その他O | record再読/strict/time、target、phase制御、将来quota受付/bridge追加費 | 未確定分を0にしない |

基本fixtureでは既存S実費1902、O.profile実費61、O.calculate実費20が別々に確認済み。draft-0.1の1909/1990はdispatchを含まない値だった。draft-0.2の将来検証目標はS＋use＋dispatch=1910、profile＋calculate＋use＋dispatch＋S=1991。**bridge/dispatchは未実装のため実測ではない。** bind/I/R/その他Oは含まない。

同fixtureのr=8なら、収集上界62＋計算20＋use7＋dispatch1＋U_S2041＝2131。r=0なら2107。実費と上界、入口rとsession初期rを混ぜない。3round分のuse21＋dispatch3＝24を候補とするが、3round resource受付・全体other/予約は未完成で、24を足すだけで全体受付を有効化しない。初回に消費したworkは返金しない。

## 9. 合成受入試験案（未実施）

1. estimate→guard7→入口guard1→固定kernelのtracer。O.use7/O.dispatch1とS既存実費を別observerで数え、全体budget deltaと一致。basicの将来目標1910/1991を照合する。
2. 入口同一性：別Inputs/receipt/target/context/scope/token/round/budget/start、Ready外を拒否。guard不成立時はsourceのopen/enum/read/metadata/cleanupがすべて未呼出し。
3. model：固定callee/係数modelを結ぶ。旧/未知profile/calculator/kernelと未対応calleeを拒否し、任意callbackへのfallbackがないことを確認。
4. one-shot：未claimのInputs/Attemptedによる直接collectを拒否。BridgeReadyでも同Inputsの2回目collectは拒否し、初回の成功/中断/quota不足/途中失敗でEnteredを戻さない。別Inputsからのclaim持込みも拒否。estimate二重move・Clone/serde・phase可変遷移中の保持はcompile-fail/型guardとruntimeの両面で確認。直接kernel用のtest bypassはcfg(test)専用に閉じ、非test buildに存在しないことも確認。
5. work残0〜6で拒否、7でguardのみ通過（collector費が別に必要）。guard単体の観測はtest-only内部試験とし、再利用可能な許可値を返さない。各課金の前後/終端とcollector遅延成功後の取消・期限を注入。最初の失敗・返金なし・部分値なし。
6. r：入口増減は拒否。入口rと一致した後の合法なEINTRは成功可能で、scan後r減少を誤ってChangedにしない。全3roundで共有残を再発行しない。
7. collectorの成功/読取失敗/hash不一致/metadata変更/集合不一致/cleanup不明を通し、resultとsummaryを保持。late successは破棄し、cleanup不明を隠さずAfterScanを呼ばない。
8. phase：成功でもbridge単体はReadyのまま。borrow解放後のAfterScan/record再読/FinalIndexを実際に通し、S.sealと両phaseの実行回数・費用を別に数える。
9. 禁止効果：estimate値からquota生成・work予約・payload/retry増額・policy承認・permit発行・OS接続をしない。U_S>100万でもguardを受付判定へ変換しない。正常なsource操作の実消費だけは従来どおり元budgetに残る。

## 10. 未確定事項と実装順

1. 最初はScanInputsのprivate利用状態とguard7を合成検証。型のconsumeと元bindingを固定し、許可tokenを返さない。
2. 次に外側collect入口の状態消費/guard1・固定kernel呼出口/係数modelを結び、合成source・既存Outcomeのmove・終端失敗を接続する。直接collect試験はbridge経由またはcfg(test)専用kernel入口へ移す。lifetime/最小可視性、borrow解放後のphase接続をコンパイラで確認。
3. O.use observerの所有区分と、source事前resourceを持たないことの検証方法を確定。追加helper課金が必要なら7を無断維持せず、所有表/式を改版。
4. 3round resource配賦・全体work/other上界・承認quota producer・通常strictへの接続はさらに後工程。real sourceの信頼、OS cleanup、hard停止の承認は本設計で行わない。

guard7/dispatch1/1910/1991の合成計数、最大固定ブロックの独立監査、compile-fail試験は未実施。ドキュメントの確認でこれらを実装済み/検証済みへ更新しない。

## 11. 文書検証

draft-0.2更新は本設計書と親3文書のみ。4文書の相対リンク先ファイル46件、fence対応・末尾改行・diff check、ソース変更がないことを再確認した。リンクの節anchor内容まで自動検証したものではない。Rustビルド・テストは再実行せず、前回709成功は本書のbridgeの検証結果としては使用しない。
