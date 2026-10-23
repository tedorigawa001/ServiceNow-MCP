# BP-5 R-2 OL-03：保護入力bridge・上位診断保持の詳細設計

Version: draft-0.11 / Date: 2026-10-23 / Source baseline: `52acb6c` / Status: §16まで内部実装。Context/Records/HeldSourcesと独立ScanSlots片を実装、PolicyCaps未確認・bridge未接続。保護producer全体・通常strict差替えは未実装。

## 1. 範囲と停止状態

[外側orchestrator設計§14](BEST_PRACTICE_BP5_R2_OL03_OUTER_STRICT_ORCHESTRATOR_DESIGN.md)のprivate release入口を、将来の通常strict呼出し側へ接続するための入力/出力の対を設計する。draft-0.1はMDのみ。draft-0.2は§11の内部型/claim subsetを追加し、通常strictのsignature・可視性・calleeや本番producer constructorは変更しない。§3〜10の全体接続案と実装済みsubsetを区別する。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。本番policy投入・OS接続・実機操作・token発行・設定変更・permit発行を含めない。入力bridgeの成立も診断保持も、全体受付・署名検証・実行許可の成立を意味しない。

## 2. 現状と接続対象

| 境界 | 現在 | 今後必要な契約 |
|---|---|---|
| `strict::review_strict_record_target` | 旧ClosureInspection/ClosureSourceを受け、裸のFailureを返す | 既存signatureへ機械的に新結果を押し込まず、保護入力とstructured結果を扱う狭い固定呼出し境界を別途作る |
| `connection_owner::release::run` | 元source/held/receiptsを所有し、固定body・固定解放・identity消費・最終checkpointを通す | これだけを呼ぶprivate bridge。raw ScanOps/Quotasを上位へ公開しない |
| `body::Inputs` | context借用、inert 3scan、Option<ResourceInput>、3個のOption<Quotas> | 本番の保護供給元は未実装。欠落時Unavailableを維持 |
| `OuterStrictFailure` | primary/phase/round/実CompletionFailure/解放・checkpoint観測をinlineで保持 | 上位が値で所有し、reason-only変換で捨てない |
| resource会計 | session累積・round/live・cleanup予約を内部接続済み | 承認済みcapのproducer、全体work/resource受付との結合は別途必要 |

既存の合成成功から実sourceの保護を推論しない。供給元が未承認なら本番bundleを生成できず停止する。テスト用constructorをnon-testへ移す、既存ClosureSourceを自動変換する、未知費を0としてpolicyを作るfallbackは禁止する。

## 3. 供給元・所有権

以下のproducerは**将来の責務案**であり、今回実装済みと扱わない。

| 入力 | 信頼する供給元案 | bridge内の所有/寿命と禁止事項 |
|---|---|---|
| registry | ビルドに固定・承認されたbytesのprotected context producer | immutable借用。env/argv/呼出しごとのpath/任意bytesで置換しない。現在Noneのgateを維持 |
| groups・実行context | 同起動の検証済みeffective groups/context producer | producerが所有するimmutable保持領域を借用。caller申告の配列や別起動の同値コピーで代替しない。recordモデルのgroups上限との整合も確認 |
| RecordReceipt/TargetDeclaration | 同一の安全なrecord取得・厳密binding検証producer | receiptはbundleが所有しmove。targetは固定所有元から借用し、generation/hash/role/path/sizeの結合を維持 |
| BoundTarget（bind結果）と参照先RecordBinding | 同じrecord取得producerがbind時に作る外部保持領域 | bundleの外に置き、bundleより長く生存させて借用する（§3.1）。chain_names/bytesを含めbundle内へ移さない。参照先bindingはreceiptと値が等しい別allocationで、受理条件は§4 |
| held leaf/祖先・TopologyReceipt | 同open receiptを発行したsecure opener/attach producer | 取得済みresourceを値移譲。別FD・数値FD・path文字列から再生成せず、open snapshot/originを保持 |
| RecordSource/TopologySource | 上記receipt/open系列に結合した固定内部producer | 元の同source instanceを所有移譲。factoryを再呼出しして補充しない。固定bridgeにcaller指定callback/backend選択を渡さない |
| inert 3scan | 固定backendの同供給系列。slotをInitial/BeforeM4/AfterM4へ封印 | bundleへ値で格納。slot作成時にopen/read/列挙を開始しない。generic合成adapterはcfg(test)限定、本番backendは未接続 |
| ResourceInput/Quotas | モデル・独立resource上界・承認capを照合する保護producer | policyと3slot分を非Cloneで移譲。数量summaryや任意scalarだけから生成しない。元session累積と各roundの関係も照合 |
| SharedBudget | 同inspectionを開始した唯一のbudget owner | bridge呼出し中は排他的に借用。元origin/claim/started/retry/spentを保持し、新予算やroundごとのcap再作成を禁止 |

root deviceやcontextの由来は、同じ数値・hashだけでは証明しない。保護producerが元resourceとcontextを同時に所有/借用した構造と、private sealで結合する。seal自体もOS identity証明ではなく、producerのOS上の保証は別工程である。

### 3.1 型と配置の案

入力は仮称`ProtectedStrictInputs`、入口は仮称`run_protected_strict`とする。scan_ops配下のprivate moduleが内部型を所有し、上位にはbundle全体の値消費口と結果契約だけを見せる。ScanOps・Quotas・ResourcePolicyの可視範囲を広げて上位に組み立てさせない。上位から具体型を命名できない場合は、最小のopaque facadeを別途設計し、raw型の公開で解消しない。

bundleはsource/held/receipts/inert slot/policyの所有値と、安定した外部context/targetへの借用を持つ。自身のfieldを参照する自己参照structを作らない。

HeldTargetScopeは現行実装で外部の`BoundTarget<'s>`（records/lineage/targetへの参照、chain_names、bytes）を借用する（`transfer.rs`）。bundleがRecordReceiptを所有してmoveする以上、BoundTargetのrecords参照をbundle内のreceiptへ向けると自己参照になりmoveできない。このためBoundTargetと、その参照先であるreceiptと値が等しいRecordBindingは、producerが所有する外部保持領域に置き、bundleはその借用lifetimeを型に持つ。保持領域はbridge呼出しから結果格納まで生存させる。release内部の参照正規化（§4）は解放sectionまでの局所的なcanonical BoundTargetを作るだけで、この外部領域を置換・解放しない。context producerの保持領域は呼出しから結果格納まで生存させ、その後に解放できる。unsafeの参照延命、pinで未検証のlifetime問題を隠す方法、source全体のRefCell化は採らない。

registry/groupsのimmutable保持、入力のpackaging、承認済みmodelの選定はproducerの責務。bridgeが再parseしてtrustを作ることはしない。producerの作業・allocationはbridge固定guard費の外に計上する。

## 4. identity結合と一度限りの移譲

bundleのprivateな供給sealは、同供給系列・同context保持領域・同target・元lineage・budget origin/claim/startedと固定3slot/modelへ結合する。文字列IDが一致するだけでは受理しない。異なるbundle同士で同値receipt/context/source/slotを混ぜられないproducer APIを前提とする。

利用claimはbundleの移動だけでなく、**budget側に唯一のbridge試行claim**を持たせる案とする。同budgetから二つのbundleを作る抜け道を塞ぐためである。既存session claimはowner生成前にstarted=falseである必要があり、bridgeはそのclaimを先に消費しない。draft-0.1で未実装だったclaimは§11で内部接続した。管理allocationの全体上界への統合・運用承認は未対応である。

| 結合対象 | 比較/維持するidentity | 拒否する例 |
|---|---|---|
| bridge利用 | budget-owned bridge claimとbundleの元claim、fresh→Startedの一方向遷移 | 二重生成・再入・別bundleでの再試行 |
| inspection | origin Rc、session claim Rc、started、元budget owner | 同じ数値残量/時計を持つ別budget、新budgetでの再開 |
| context | producer sealと同じcontext保持領域への参照 | 同値bytes/groupsを別allocationへコピーして差替え |
| receipt/target | 元lineage Rc、厳密binding、同target供給系列 | 別世代・別target・同値だが別lineage |
| held/topology/source | 元open/attach系列のseal、held origin、同source所有値 | 別resource/sourceの混入、未検証pathからの再open |
| policy/3slot | 同供給seal、固定model群、0/1/2のslot位置 | model混在、順序違い、slot補充、別供給系列のQuotas |

receiptは値moveでアドレスが変わるため、packaging前のreceipt fieldポインタを後まで保存しない。既存release入口のlineage/value照合→所有receiptへのcanonical参照正規化をそのまま用い、body/owner以降のポインタ同一性検査を維持する。receipt・registry・contextの厳密検証を「seal確認済み」で省略しない。

外部BoundTargetが参照するRecordBindingは、所有receiptと値が等しい別allocationである。これは本書で唯一許す同値コピーで、受理条件は「lineage Rcがreceiptと同一（ptr_eq）かつbindingが完全一致」の両方とする。lineageが別なら値が一致しても拒否する。context・registry・groupsの同値コピー拒否（上表）には、この例外を広げない。bindingのコピーを作れるのは同じrecord取得producerだけとし、caller申告のbindingを受け付けない。

利用開始時、最初のfallible workより前にbridge claimを不可逆に消費する。失敗後の再pack・再試行・claim初期化は禁止。bundle/位置/移譲結果は非Clone・非Copy・非serdeとし、slotはOption::take相当で一度だけ移す。Rustのmoveは同じ値の再利用を防ぐが、duplicate producerの抑止はbudget claimが担当する。

## 5. 固定実行順と失敗時停止

1. 上位は結果を格納するinline領域とprotected contextの寿命を確保してからbundleを受け取る。出力先への登録callbackや失敗後のheap確保を要求しない。
2. budget側のbridge claimを開始済みにし、§8の入口guardを固定順に検査する。原budgetのcheckpointを維持する。
3. 成功時だけbundleの所有値を既存`release::run`へmoveする。body::runやcollectorを直接呼ばない。caller指定のroundや成功callbackは受け取らない。
4. release内部でreceipt検査・clock・固定3位置・body完了・固定解放・PendingBody消費・最終checkpointを実施する。bridgeが時計/比較結果を代入しない。
5. 返されたstructured resultを上位のinline結果へ一度moveする。成功・失敗とも、この後に新しいfallible処理を挟んで診断を捨てない。bridgeが追加の最終clock/checkpointを設けることもしない。

### 5.1 releaseへ渡す前の拒否

所有入力は既にbridgeが引き受けているため、guard失敗でも解放をcallerへ投げ戻さない。元理由をbudgetへstickyに通知し、未開始のinert scan/Quotas/policy→元RecordSource→TopologySource→HeldTargetScope→TopologyReceipt→RecordReceiptの順に固定解放する。借用context/targetの元保持領域は所有していないのでdropしない。未開始scanのClosed/summaryを捏造しない。

全解放が戻った後、元budgetのcheckpointを一度評価し、先行理由を保持したまま限定観測を追記する。これはbridge拒否用の終端であり、release成功時に二重で実行しない。work/期限/取消で止まった後も、停止・diagnostic move・既存予約cleanupを新workに依存させない。

### 5.2 releaseへ渡した後の拒否

解放責務はreleaseへ移っている。bridgeは再close/再drop/再scanせず、元OuterStrictFailureをそのままmoveして返す。Confirmed/Incomplete/NotStartedを外側の解放観測へ統合しない。SequenceReturnedは通常dropが戻っただけで、実OS close成功やbounded Dropの証明ではない。

Drop/放棄時も元claimへ停止を記録する案とする。mem::forget/abort/killではdropや診断保存を保証しない。利用claimが既に消費済みなら同budgetで再開できない設計を維持し、型だけでresource leakを防いだとは主張しない。

## 6. 上位結果・診断保持契約

仮称`StrictBridgeResult = Result<RecordComparison, StrictBridgeFailure>`をprivate上位境界の結果とする。型名は案で、既存の裸Failure戻り値は今回変更しない。

StrictBridgeFailureはinlineな排他的variantを持つ案とする。

- `InputRejected`：bridge guard段階の元primary、固定の拒否stage、解放観測、checkpoint観測だけをCopyなscalar/enumとして持つ。lineage/budgetのRc複製・参照・ポインタ値は持たない（元allocationを生存させず、identityの再利用口にもしない）。同じinspectionとの対応は§6末尾の線形移譲で担保する。未開始なのでround/CompletionFailureは持たない。source/path/record bytesは持たない。
- `Outer`：**実際に返ったOuterStrictFailure全体**を値で保持。primary/phase/round/inner/summary/cleanup/観測を再構築しない。

InputRejectedを既存OuterStrictFailure（OuterPhase::Entryと解放/checkpoint観測）で表す案も比較した。OuterPhase::Entryはrelease内部の入口（準備/制御work不足）を指し、bridge guardの7分類を区別できない。OuterPhaseへbridge用の値を足すと、release後の段階とbridge前の段階が同じ型に混在し、「releaseへ渡した後か」（§5.1/§5.2の解放責務の境界）を型で区別できなくなる。このため別variantとする。ただし保持する観測enum（DropObservation/PostReleaseCheckpoint）は既存型を再利用し、新しい観測型は作らない。

拒否stage案はModel/InputUnavailable、InspectionBinding、ContextBinding、ReceiptBinding、SourceBinding、PolicyBinding、SlotBinding。対外enumやMCP schemaへ追加する設計ではなく、bridge内の固定分類とする。binding不一致はBinding、供給元/承認/model欠落はUnavailable、work/上界不適合はLimit、期限/取消は元Failureを維持する。先行Failureがあれば新分類で主理由を上書きしない。

上位仮称`StrictResultOwner`は結果をinlineのOptionへ一度だけ受け取り、非Clone/非Copy/非serdeで保持する。成功用RecordComparisonも再生成せずmoveする。初期状態Empty→Awaiting→Retained→Consumedの一方向遷移とする。利用guardとAwaitingへの不可逆遷移はcalleeを呼ぶ前に行い、返却後の格納はfallibleな再検査を伴わないmoveとする。二重開始はcalleeを再実行する前に拒否し、保持済み診断を置換しない。二つ目の実結果を生成してから捨てる二重格納口は作らない。guard費は§8へ別計上する。

read-only accessorはprimary・bridge stage/outer phase・round・cleanup分類・有限summary・解放/checkpoint観測に限定する。内側のCompletionFailureはprivate所有を維持し、必要なprojectionだけを狭く提供する。path・コード本文・registry/groups・token・raw record・resource/FDは出力しない。Debugは固定opaque文字列とする。

`map_err(reason)`、reason-onlyの`From`/`Into`、表示用summaryだけを残して元frameをdropする変換は設けない。既存通常strictの呼出し側がFailureしか持てない間は接続を停止する。MCP JSONやhost終了コードへの将来変換も、元診断の所有先を先に確定してから別設計にする。失敗後のJSON/log生成成功を診断保持の条件にしない。

入力と出力は同じinspectionのprivate線形移譲として対応付け、利用者指定のrequest IDをtrust根拠にしない。結果ownerはlive sourceやborrowを保持せず、context/receipt解放後も元診断を所有できる。診断を意図的にdrop/forgetする上位コードまで保存を保証するものではない。

## 7. 信頼・可視性・互換性

- productionの保護producerが不在ならbundle作成はUnavailable停止。空のpolicy/既定quota/承認済みフラグで補わない。
- fixtureはcfg(test)だけで同じbridgeの検査calleeへ入力する。fixtureをビルド設定やenvで本番producerへ変える口は作らない。
- 上位が受け取るのはopaque入力とtyped結果のみ。任意OuterStrictFailure/RecordComparison/成功position/Closedのconstructorを公開しない。
- 旧strictと新bridgeの二重実行、失敗時の旧ClosureSource fallbackを禁止。旧オフライン互換経路は独立に維持する。
- production接続・全体受付の有効化は、保護producer・費目/独立resource上界・上位結果所有が揃った後の別承認とする。今回の設計で停止gateを変更しない。

## 8. 費目案と全体上界への接続

### 8.1 新規bridge guardの候補

新規ID候補を`bp5-r2-protected-bridge-0.1`とし、固定入口guardを**10 work候補**に分ける。以下はdraft-0.1の全体bridge候補である。§11ではdispatchを含まない内部identity検査の10点を計数したが、保護producer/運用policyの承認・全体上界を確定したとは扱わない。

| 点 | O.bridge_useの所有処理 | work候補 |
|---|---|---:|
| 1 | 不可逆claim後のfresh判定・固定bridge/model検査 | 1 |
| 2 | 元budget origin/session claim/started・既存session未開始 | 1 |
| 3 | protected context保持領域・供給seal結合 | 1 |
| 4 | 元receipt lineage/binding・target供給系列 | 1 |
| 5 | held/topology/sourceの同供給系列 | 1 |
| 6 | ResourceInput/Quotasの供給seal・固定model | 1 |
| 7〜9 | 3slotの供給系列と固定位置を各1回 | 3 |
| 10 | 固定releaseへの移譲直前guard/checkpoint | 1 |

claim消費それ自体と失敗通知はwork確保前に行う。sealチェックはboundedな参照/固定field比較とし、動的entry/groupsループや再parseを10へ隠さない。guard後にコピー/統計/比較を増やす場合は費目/モデルを改版する。

### 8.2 所有表

| 費目 | 所有者・扱い |
|---|---|
| registry/groups保持領域・source/receipt/open包装・policy承認検査 | `O.protected_supply`。未確定。OS/保護producerの設計・allocation計数が必要 |
| bridge claim storage/初期化 | `O.bridge_claim`。未確定。既存session生成費へ吸収せず、同budgetで一度だけ計上 |
| bundleの利用guard | `O.bridge_use`。上記10候補、1 inspectionに一度 |
| 所有receiptへの参照正規化・既存body/kernel/owner接続 | 既存coupling **35＋K work**を維持。guard10と同じwork呼出しではない。既存receipt再検査を省略しない |
| resource configure | 既存1 work。35＋Kへ含めず、session/policy側へ一度計上 |
| record/index/scan/typed tail/profile/算術/3round会計 | 既存R/I/S/Oの所有表を維持。producerの同じ課金を二重に足さない |
| 上位結果ownerの初期化/格納guard | `O.result_owner`。固定回数と必要allocationを実装時に計数。失敗後の元frameのmove自体には課金しない |
| 固定解放・先行診断保持・最終checkpoint | 新work不要。実解放回数/予約・保持量は独立resource費であり0とは扱わない |

全体候補は既存`U_R + U_I + U_S + U_other`に、上表の未包含分を所有表で一度だけ加える。35＋Kも10候補も全体上界ではない。未確定のsupply/claim/result費を0として受付しない。body・外側clock・resource configureの費目も漏らさない。

初回scan直前の受付では、既に完了した固定phaseの上界だけを残予定から除外し、spentは返さない。別budgetや`total - 実測spent`で未知費を埋めない。100万work、元10秒、payload2GiB、metadata/topology/name/FD/cleanup/管理allocationは別々に確認する。work予約に既存I/O bytes用reservedを流用しない。全体受付は今回も無効である。

## 9. 合成受入条件（未実施）

1. 同じ保護fixtureのpack→guard→固定release→結果owner保持を通し、実record再読6cycle・3round・固定解放・最終checkpoint・既存gateを維持する。
2. registry/context/groups/root/target/source/policy/slotの供給系列を一つずつ混ぜる。同値コピー・別lineage・別budget・別startedも拒否し、open/scan前停止を確認する。
3. bundle二重生成・利用再入・二重格納・失敗後再pack/再試行を拒否する。bridge claimの開始はsession claimを消費せず、session生成は従来のcalleeだけが行う。
4. receiptのmove前後とcanonical参照結合を確認する。外部BoundTargetの同値binding受理はlineage同一かつ完全一致の場合だけで、別lineageの同値bindingは拒否されることを確認する。self-reference/unsafeや別resource再取得なしでコンパイルし、body側のpointer guardを弱めない。
5. guard全点のwork不足・課金後取消・期限切れ・遅延成功で停止し、未開始scan/全所有source/held/receiptsの固定解放と元理由保持を確認する。
6. releaseの全3roundの実CompletionFailure、M4/body末尾/解放後失敗を、上位結果ownerまでmoveして保持する。元summaryの前後完全一致、cleanup分類、round/phase、sticky理由を照合する。
7. receipt/context/sourceを破棄しても保持済み診断を参照できる。表示/JSON生成を実行しなくても保持でき、秘密のDebug/ログ非露出を確認する。
8. bridge/入力/結果ownerの非Clone/非Copy/非serde・inline sizeを確認する。OuterStrictFailureの既存384 bytes以下とは別にwrapper上限を計測し、合成値を運用承認に使わない。
9. guard・結果owner・供給包装の実費を独立計数し、10候補と未確定費を確定する。失敗後の保持/cleanupに新workやallocationが不要であることを確認する。
10. seal照合省略、claim消費省略、slot交換、reason-only縮退、release迂回、最終checkpoint省略の変異を検出する。
11. 通常strict差替え・APPROVED_REGISTRY・受付・DER/absence・permitのgateに差分がないことを確認する。OS/PDI品質の証拠へ転用しない。

## 10. 対応順・承認待ち

1. 入力/結果のprivate型・bridge claimの内部契約と合成fixtureを先行実装する。OS/本番policy constructorは追加しない。
2. InputRejected/Outerを保持する上位結果ownerと固定移譲を実装し、reason-onlyへの縮退がないことを確認する。
3. 保護producerの境界を合成のまま固定releaseへ接続し、全拒否/中断prefix・費目を計数する。
4. [全体work設計](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md)の歴史的な未実装表記と現行session/collectorを棚卸しし、最新R/I/S/O・3round・独立resource/管理allocationの上界へ統合する。全体受付の実装/有効化は別工程。
5. productionのcontext/registry/source/policy/Quotas producerと通常strict呼出し側の戻り値移行を別途承認する。それまでは通常strict差替え・OS接続を停止する。

承認待ち：producerの実trust根拠/配置、外部BoundTarget/binding保持領域の所有者と寿命、bridge claimの保持/初期化方式、opaque facadeのlifetime/visibility、wrapperのinline size上限、上位診断の最終所有先、supply/claim/result費、全体work/resource上界・運用cap、generic Dropのbounded性/実OS解放確認。案の型名や係数を承認済み仕様として実装へ持ち込まない。

## 11. 内部型・生成/利用claim subset（draft-0.2）

以下の未接続表記はdraft-0.2時点の記録である。現行の固定値移譲・callerは§13、上位ownerは§12を参照する。

### 11.1 実装範囲と由来

[protected_inputs.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs.rs)へprivate fieldのProtectedSupply/ProtectedStrictInputsを追加した。payloadはscan/policy/Quotas→RecordSource→TopologySource→held→topology receipt→record receiptの順で所有し、外部BoundTarget/contextを借用する。receiptは値所有し、そのfieldのアドレスを保存しない。外部bindの同値bindingコピーは元lineage一致と完全一致の両方を要求する。自己参照・unsafe・元resourceの複製/再openは追加しない。

唯一の供給constructorはcfg(test)のfixtureであり、non-testのProtectedSupply producerはない。source/scan/policy/Quotasはprivate Tagged値へ一括で封入し、同供給Rcとslot番号を結合する。これは封入後の混入防止であり、OS source identity・registry承認・policyの実内容/modelの承認を証明しない。payload/contextのgetterや移譲口はない。generic型にI/O trait boundも要求せず、生成/利用検査からI/Oを呼ぶ経路を作らない。

### 11.2 budget側claimと停止

SharedBudget::newで独立のRc<ProtectedBridgeClaim>を1個確保し、generated/used=false、failure=Noneで初期化する。既存session claimとは別で、生成/利用検査はsessionを開始しない。createは元claimのgeneratedを、require_useはusedを、それぞれ最初のfallible work前に不可逆に消費する。bundleごとのboolだけではなくbudget側に状態を持つため、同budgetの二つ目の供給から生成しても拒否する。

createは元origin/bridge claim/session claim/started、既存session未開始と固定bridge IDを照合する。require_useは同inspection、同context参照、同BoundTarget、receipt/topologyのlineage・binding・target、held origin、source/policy/3slotの供給stampを固定順で検査する。欠落policy/QuotasはUnavailable、混入/重複はBinding、元work/期限/取消はその理由を保持する。

SharedBudgetのstop/checkpointは既存の先行failed/session失敗に続きbridge失敗を検査し、生成済みclaimへ停止を伝える。別budgetへ渡した誤用では、元claimと提示budgetの両方を停止する。先行理由を上書きして再試行しない。検査済みbundleにも移譲口はないため、通常dropは常に放棄Unavailableを元claimへラッチする（既存理由が優先）。次の元budget checkpointも拒否する。

bundleはDropを実装するため、Rustではfieldを分解してmoveできない。将来の固定releaseへの移譲に備え、payloadは`Option`で保持する。移譲口は一度だけ`take`し、再充填しない。Dropは`Some`のとき（未移譲）だけ放棄Unavailableをラッチし、`None`（移譲済み）では解放責務をcalleeへ委ね、ここでは停止を記録しない。現subsetには`take`する口がないため、常に`Some`であり上記の放棄ラッチが働く。ManuallyDrop/unsafeによる取り出しは採らない。移譲後の停止・診断保持は§5.2のrelease側契約に従う。

require_useは内部の一度限りのidentity検査であって値の取り出し/dispatch/permitではない。Err後も所有bundleを呼出し側が保持している間はpayloadを保持し、drop時に固定field順で破棄する。createのErrでは供給payloadをその場で破棄する。§5の値消費bridge、解放後checkpointとInputRejectedへの観測記録は未接続であり、本subsetがそれらまで完了したとは扱わない。

forgetでは解放/失敗ラッチを保証せず、生成claimだけがbudget側に残る。合成試験は意図的なleakを含み、cleanup成功と主張しない。全体受付/上位結果owner/運用producerを追加してこの抜けを自動解除することもない。

### 11.3 費目と検証

- 新`O.bridge_create=2 work`：不可逆生成/model1＋元inspection/公開前照合1。§8の利用guard10とは別。
- `O.bridge_use=10 work`：§8の固定10点を内部identity subsetとして計数。最後はcheckpointのみでreleaseへ移譲しない。policy内の実model/数量の承認検査は含まない。
- 正常な生成＋利用検査は計12 work。既存coupling35＋K、resource configure1、R/I/S/typed tail費を含めない。将来つなぐ場合も同じ課金を二重計上しない。
- claim storageはbudgetごとに追加Rc allocation1個。SharedBudget::newには新work課金を設けていないが、管理allocation/CPU/RSSを無料とみなさず全体resourceモデルに残す。fixture供給のstamp allocation等も本番producer費の確定値ではない。
- 失敗通知/dropラッチ/元理由保持に追加workを要求しない。I/O bytes用reserved、retry、metadata/topology枠は生成/利用検査で変更しない。

[新規9テストの記録](E2E_BEST_PRACTICE_R2_OL03_PROTECTED_INPUTS_SYNTHETIC_2026-10-22.md)を参照。identity/混入、重複生成/利用、失敗後再利用、放棄、全work不足/課金後取消、期限、型/opaque Debug、field解放順を合成検証した。§9の上位結果保持・固定release/通常strictへの接続受入条件は未実施である。

draft-0.2の次工程だったInputRejected/Outerと上位結果ownerは§12で内部実装した。固定releaseへの一度限りの値移譲、claim/guardの本番運用承認、protected supply費・全体work/resource上界は未対応/未確定のまま、全体受付無効・telemetry保留を維持する。

## 12. InputRejected/Outer・上位結果owner subset（draft-0.3）

以下の固定caller未接続表記はdraft-0.3時点の記録であり、§13で内部接続した。owner単体がbudget由来を証明しない制約は変えない。

### 12.1 型と一方向遷移

[result_owner.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/result_owner.rs)にInputRejected、StrictBridgeFailure、StrictBridgeResult、StrictResultOwner、ResultSlotを追加した。private内部型であり、通常strictの裸Failure戻り値は変更しない。source/bridgeを起動するcallbackや任意成功のconstructorはない。

ownerはinlineのOption<StrictBridgeResult>を持ち、Empty→Awaiting→Retained→Consumedを一方向に進む。beginは最初のfallible work前にAwaitingを確定し、成功時だけownerを排他的に借用する値消費slotを返す。slot.retainは値でslotと結果を消費し、追加work/checkpoint/heap確保/失敗する再検査なしに結果を格納する。takeはRetainedの結果を一度だけmoveし、Consumedから再開しない。任意のreplace/reset/二つ目の格納口はない。

非Emptyのbeginは新workを要求せず元budget.stopで拒否し、保持済み結果・phase・summaryを変更しない。begin自身のmodel/予算/取消/期限失敗はInputRejectedとしてownerへ保存してから軽量Failureを返す。これはcallee結果のreason-only縮退ではなく、保持済み診断の存在を伴う開始拒否である。

未格納slotの通常dropはUnavailable（claimに先行理由があればその理由）・stage `SlotAbandoned`のInputRejectedを残し、元bridge claimへ停止を記録する。slotが保持するbridge/session Rcは待機中だけで、格納後に解放する。未提出のOuterをdropから回収することはできないため、固定callerは必ず実結果をretainしなければならない。放棄診断のrelease/checkpointはNotReachedで、cleanup成功や実body失敗の再構築ではない。forget/abort/killの格納・解放は保証せず、Awaitingに残ったownerからの再開始だけは拒否する。

SlotAbandonedは、beginのmodel/予算失敗（ModelInputUnavailable）と主理由が同じUnavailableでも放棄を区別するための、owner専用のstageである。bridge guardの7分類（§6）には含めず、bridge側がこのstageを生成することはない。

owner自体はbudgetに結合せず、retainは格納する結果がslotを開いたbudgetの結果かを検査しない（slotが保持するbridge/session Rcは放棄時の停止通知専用）。同じinspectionの入力と結果の対応（§6末尾の線形移譲）は、同一budgetでbegin→保護入力の固定移譲→retainを一続きに行う固定callerの責務とし、caller接続時に別budget由来の結果を格納できないことを受入条件とする。

### 12.2 診断の所有と限定projection

InputRejectedはprimary、InputStage（bridge guardの7種＋owner専用のSlotAbandoned）、既存DropObservation/PostReleaseCheckpointだけを保持する。origin/lineage Rc、ポインタ値、source/resource/FD、path、registry/groups、raw bytes、tokenを持たない。stageは拒否を検知した位置であり、先行Failureの原因を新しいmodel違反等へ読み替えない。newは元budgetの先行理由を採用し、after_releaseはcheckpoint観測を追記する診断用合流口である。後者は実解放証拠を作らず、完全な固定bridgeからの呼出しは未接続。

Outer variantは実OuterStrictFailure全体をmove保持し、reason/round/CompletionFailureを再構築しない。read-only projectionはprimary、input stage/outer phase、round、解放/checkpoint観測、cleanup分類とsummaryの有限scalarだけとする。CompletionFailureにコピー専用のCompletionDiagnostic/SummaryCountsを追加し、attempts全5区分・live・pending_cleanup・unconfirmed・retry_pending・names・peak・declared_pendingを保持する。projectionはClosed/ack/permitの入力にはならない。

InputRejected/StrictBridgeFailure/owner/slotは非Clone・非Copy・非serdeで、Debugは固定opaque文字列。copy可能なprojectionも型付きcounts/enumだけでraw値や秘密文字列は含まない。非serde性はJSON/logの将来設計が不要という意味ではなく、その外部化は別工程である。

InputRejectedは48 bytes以下、StrictBridgeFailure/ownerは各512 bytes以下、slotは64 bytes以下を合成のsize試験で要求する。大きなOuterをBoxへ逃がすと失敗後allocationを要するため、large_enum_variant例外はStrictBridgeFailureだけへ理由付きで限定した。既存Outerの384 bytes上限は変更しない。

### 12.3 費目・identity・未接続範囲

`O.result_owner=2 work`：beginの不可逆開始/model1＋slot公開前guard/checkpoint1。newのinline初期化、retain/take、診断move/projection、先行失敗通知に追加workはない。slotは既存claimのRc cloneだけを保持し、新規heap allocationはしない。ownerへの格納は外側最終checkpoint後の結果を再検証する工程ではない。

既存入力生成2＋利用10、coupling35＋K、resource configure1、R/I/S/typed tail費とは別に一度計上する。単なる費目の足し算で全体受付を認証せず、protected supply/管理allocation・独立resource/全体上界は未確定のまま維持する。

このownerは結果の保持容器であり、結果を元inspectionへ結合する入力bridgeでもリリース証拠resolverでもない。任意callbackを受け取らず、保持する実結果の同inspection由来は今後の固定callerによる線形移譲で結合する。成功も既存RecordComparisonを受け取るだけで新しく生成せず、格納時の時刻再検査やpermit発行をしない。

[新規9テストの検証記録](E2E_BEST_PRACTICE_R2_OL03_RESULT_OWNER_SYNTHETIC_2026-10-23.md)を参照。全3roundの実kernel診断13条件、late checkpoint失敗、全7stage、二重開始/一度だけtake、失敗/放棄、秘密非出力、型/sizeを合成検証した。次は保護入力の固定値移譲とInputRejected/Outerをこのownerへ渡す固定callerの接続であり、通常strict差替えはまだ行わない。全体受付無効・telemetry保留を維持する。

## 13. 固定値移譲・同budget callerの内部接続（draft-0.4）

### 13.1 唯一の値移譲

`ProtectedStrictInputs::into_release(self, b)`は既存の利用guard10を同じ順序・課金で実行し、元inspectionの照合/最終checkpointを1 workで追加する。成功時だけprivateなpayloadを一度`take`し、空のshellを破棄してから元のheld/topology/records/source/topology source/3scan/ResourceInput/Quotasを既存`release::run`へ値で渡す。再充填、raw getter、callee選択callback、unsafeの取り出しはない。sealの解放で元payloadの放棄停止を誤通知せず、移譲後の解放責務は既存固定releaseが所有する。

利用guardの失敗には、7分類の検知stageを添える。従来の`require_use`は理由だけを返す内部検査APIとして互換性を維持する。移譲前の失敗では、元/提示budgetを停止させ、未移譲payloadを固定field順（scan3個→resource/quotas→source→topology source→held→topology→records）で破棄した後、元primary/stageを保ったInputRejectedへSequenceReturnedとcheckpoint観測を記録する。失敗後に追加workやretry、scan開始を要求しない。移譲後の失敗は実OuterStrictFailureをそのままmoveし、round/cleanup/summaryを理由だけで再構築しない。

### 13.2 上位ownerへの固定caller

`StrictResultOwner::run_protected(inputs, b)`は、同じ`&mut SharedBudget`でbegin→利用guard/移譲→固定release→retainを一続きに行う。任意の結果、別budget由来のOuter、callbackを引数に受け取らない。成功/失敗の実結果をslotへ必ずmove保持し、返す軽量Resultは制御用の通知に限る。retain前後へ新しいfallible検証を挟まず、成功を再生成しない。

初回beginの予算/取消/期限失敗でもcallerが所有入力を破棄し、ownerに保存済みの同じ第一診断へ実際の破棄/checkpoint観測を補う。保持済み/消費済みownerへの二重開始は、新入力を破棄して停止するが、先行結果・stage・観測を置換しない。利用済みbundleの再利用、別inspection、各供給系列/slot不一致はrelease開始前に拒否する。低水準begin/retain自体に由来検査を追加したわけではなく、運用側はこの固定callerを使う契約である。

本callerは既に生成されたbundleを受け取る。供給producerと`create`の失敗をここで捕捉する入口は未接続であり、全供給失敗がこのownerに保存されるとは主張しない。cfg(test)以外のProtectedSupply constructorは引き続き存在しない。

### 13.2a 低水準口の可視性とstageの読み方

固定callerの接続後、本番で同budgetの線形経路を迂回できる低水準口を閉じた。`StrictResultOwner::begin`と`ResultSlot::retain`はprivateの`begin_slot`/`retain_result`へ移し、本番では`run_protected`の中からだけ呼ぶ。同名の`begin`/`retain`と`ProtectedStrictInputs::require_use`はcfg(test)の委譲口として残し、単体の回帰テストだけが使う。本番の利用検査は`into_release`内の`require_use_at`だけである。可視性の縮小であり、検査内容・work・停止順は変えていない。

InputStageは拒否を検知した位置を表し、原因の種別ではない。例えば利用guard10点目（終端checkpoint）で期限・取消が到来するとstageは`InspectionBinding`になる。診断を読む側はstageだけで「binding不一致」と解釈せず、必ずprimary（Binding/Unavailable/Limit/Deadline/Cancelled等）と組み合わせて判断する。

### 13.3 費目・検証と限界

| 費目 | work | 所有範囲 |
|---|---:|---|
| O.bridge_create | 2 | caller外の生成、既存費を維持 |
| O.result_owner | 2 | begin、既存費を維持 |
| O.bridge_use | 10 | 既存固定guard、一度だけ課金 |
| O.bridge_transfer | 1 | take直前のinspection/checkpoint |
| callerのrelease前合計 | 13 | 生成費を含めない |
| 生成を含む固定release直呼びとの差 | 15 | 同じ成功fixtureの実差分で照合 |

既存coupling35＋K、configure1、R/I/S/typed tailと重複させない。停止通知・破棄観測・診断move/retainに新しいwork/heap確保は要求しない。ただし供給包装/claim等の管理allocation・独立resource上界・全体上界は未確定であり、今回の15だけを足して全体受付を認証しない。

[新規5テストの検証記録](E2E_BEST_PRACTICE_R2_OL03_FIXED_CALLER_SYNTHETIC_2026-10-23.md)で、guard不一致/欠落、同budget・二重開始、全3roundの操作/hash/cleanup失敗、外側clock/M4、work各境界/課金後取消、期限切れ、解放後の遅延取消/期限切れを確認した。Drop内の合成watchは観測だけを記録し、検証は破棄後に行う。

SequenceReturnedはRustの固定drop列から戻った観測であり、OS FDのclose確認や停止可能なDropの証明ではない。panic/abort/forget/kill、戻らないDropの解放/診断保存は保証しない。既存UnverifiedXml・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。通常strict差替え、OS接続、全体受付、運用policy/permitは未接続/未承認である。

## 14. 次の境界：生成前owner確保・producer/create拒否（設計のみ）

[生成入口・診断保持詳細設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_PRODUCER_CREATION_DIAGNOSTICS_DESIGN.md)に、Envelope受領→owner/slot確保→部分入力準備→Supply/create→既存into_release→同slot保持の固定順序を整理した。任意callbackやraw型の公開は追加せず、既存run_protectedを内側から再度呼んでbeginを二重実行しない。

生成拒否位置をUse(InputStage)と別のSupply/Create位置で表し、部分所有入力を固定順で破棄して元primaryとcheckpoint観測を保持する案である。固定制御8 work候補と未確定の動的producer費・管理allocationを既存15から分離した。候補の計数/型・本番producer・全体受付は未実装/未承認であり、上流のEnvelope受領前失敗をこの入口が回収するとは扱わない。

## 15. 生成前slot・型付き拒否・部分入力discard subset

[生成入口設計draft-0.2 §10](BEST_PRACTICE_BP5_R2_OL03_PRODUCER_CREATION_DIAGNOSTICS_DESIGN.md)で、run_creation→同slot確保→部分入力complete→create_typed→既存into_release→retainを接続した。InputRejectedは新InputLocationを持ち、生成のSupply/Createと利用Use・TransferCommitを区別する。旧input_stage射影は既存利用値を保つが、Supply/CreateではNoneとなるため、これを拒否なしと解釈しない。

新complete1は部分所有値の存在検査だけであり、生成込み差分16 workを合成確認した。本番producer/準備claim/8段階の固定候補・動的費・独立resource/全体受付は未対応。既存生成済みbundle callerの検査/課金と通常strictの経路を維持する。[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_CREATION_DIAGNOSTICS_SYNTHETIC_2026-10-23.md)を参照。

## 16. 準備claim・生成前停止伝播subset

[生成入口設計draft-0.3 §11](BEST_PRACTICE_BP5_R2_OL03_PRODUCER_CREATION_DIAGNOSTICS_DESIGN.md)で、準備flagをowner確認/workより前に一度消費し、slot確保後に同budget/seal/claim/session/startedへ結合したattemptを値消費する入口を追加した。新O.supply_entry1により新生成経路の差分は17、既存生成済みbundle経路は15を維持する。

SharedBudget::stopは準備中もbridge claimへ第一理由を伝播する。新ownerでの再準備、放棄attempt、別budgetを拒否し、準備段階のslot放棄でも元理由を保持する。これは実producer全体・全体work/resource上界・運用承認ではない。[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_PREPARATION_CLAIM_SYNTHETIC_2026-10-23.md)を参照。

## 17. 次の境界：発行元に結合した供給証拠

[供給証拠設計draft-0.4 §13](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)で固定3slotの合成issuer・証拠消費を追加した。型付きheld bindingで同owner/receipt/root/source系列へ結び、backend自身の開始状態を確認する。発行/消費各4 workは3slot guardを含む独立費で、既存17差分/通常strictは変更しない。PolicyCaps確認済み段階・供給公開・実行permitは作らない。[検証記録](E2E_BEST_PRACTICE_R2_OL03_SCAN_SLOTS_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

[供給証拠設計draft-0.3 §12](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)でHeldSourcesEvidenceの合成issuerを追加した。取得時に既存attach系列・祖先/path再照合と同resourceのmetadata検証を通し、消費時は前段token・同owner/source/origin/lineage/BoundTargetを固定数照合する。source所有値は一式で移し、証拠だけでresourceを延命しない。合成取得費/管理量は全体上界未統合で、本番bridge/通常strict・停止gateは未変更。[検証記録](E2E_BEST_PRACTICE_R2_OL03_HELD_SOURCES_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

[供給証拠検査draft-0.2](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)で、Context/Records/HeldSources/PolicyCaps/ScanSlotsの証拠と、発行時の検証・専用module・所有値/保持領域・一度限り消費を設計した。既存利用guardは維持し、同じsealの存在だけで検証済み取得/承認capへ昇格しない。

同設計§11のContext/Recordsを合成issuer限定で実装した。既存budget claimへissued/usedを追加し、immutable所有source/receipt・外部context/BoundTargetへの結合、Context→Recordsの一度限り消費を確認する。本番issuer・準備入口/固定releaseへの接続はなく、通常strict・既存17 work・停止gateは変更しない。[検証記録](E2E_BEST_PRACTICE_R2_OL03_CONTEXT_RECORDS_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

供給段階の失敗は元InputRejectedへ位置/第一理由/破棄観測を保持し、移譲後は実Outerのままとする。証拠はresourceを二重所有せず、証拠参照を閉じた後に元固定payload discardを行う。MDのみで、通常strict/OS source/本番issuer・受付/permitの停止を変更しない。
