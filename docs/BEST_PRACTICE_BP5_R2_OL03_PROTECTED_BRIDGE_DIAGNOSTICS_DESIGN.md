# BP-5 R-2 OL-03：保護入力bridge・上位診断保持の詳細設計

Version: draft-0.1 / Date: 2026-10-22 / Source baseline: `8107496` / Status: 設計案のみ。型名・費目候補・受入試験は未実装・未検証・未承認。

## 1. 範囲と停止状態

[外側orchestrator設計§14](BEST_PRACTICE_BP5_R2_OL03_OUTER_STRICT_ORCHESTRATOR_DESIGN.md)のprivate release入口を、将来の通常strict呼出し側へ接続するための入力/出力の対を設計する。今回はMDのみであり、既存関数のsignature・可視性・callee・constructorを変更しない。

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
| held leaf/祖先・TopologyReceipt | 同open receiptを発行したsecure opener/attach producer | 取得済みresourceを値移譲。別FD・数値FD・path文字列から再生成せず、open snapshot/originを保持 |
| RecordSource/TopologySource | 上記receipt/open系列に結合した固定内部producer | 元の同source instanceを所有移譲。factoryを再呼出しして補充しない。固定bridgeにcaller指定callback/backend選択を渡さない |
| inert 3scan | 固定backendの同供給系列。slotをInitial/BeforeM4/AfterM4へ封印 | bundleへ値で格納。slot作成時にopen/read/列挙を開始しない。generic合成adapterはcfg(test)限定、本番backendは未接続 |
| ResourceInput/Quotas | モデル・独立resource上界・承認capを照合する保護producer | policyと3slot分を非Cloneで移譲。数量summaryや任意scalarだけから生成しない。元session累積と各roundの関係も照合 |
| SharedBudget | 同inspectionを開始した唯一のbudget owner | bridge呼出し中は排他的に借用。元origin/claim/started/retry/spentを保持し、新予算やroundごとのcap再作成を禁止 |

root deviceやcontextの由来は、同じ数値・hashだけでは証明しない。保護producerが元resourceとcontextを同時に所有/借用した構造と、private sealで結合する。seal自体もOS identity証明ではなく、producerのOS上の保証は別工程である。

### 3.1 型と配置の案

入力は仮称`ProtectedStrictInputs`、入口は仮称`run_protected_strict`とする。scan_ops配下のprivate moduleが内部型を所有し、上位にはbundle全体の値消費口と結果契約だけを見せる。ScanOps・Quotas・ResourcePolicyの可視範囲を広げて上位に組み立てさせない。上位から具体型を命名できない場合は、最小のopaque facadeを別途設計し、raw型の公開で解消しない。

bundleはsource/held/receipts/inert slot/policyの所有値と、安定した外部context/targetへの借用を持つ。自身のfieldを参照する自己参照structを作らない。context producerの保持領域は呼出しから結果格納まで生存させ、その後に解放できる。unsafeの参照延命、pinで未検証のlifetime問題を隠す方法、source全体のRefCell化は採らない。

registry/groupsのimmutable保持、入力のpackaging、承認済みmodelの選定はproducerの責務。bridgeが再parseしてtrustを作ることはしない。producerの作業・allocationはbridge固定guard費の外に計上する。

## 4. identity結合と一度限りの移譲

bundleのprivateな供給sealは、同供給系列・同context保持領域・同target・元lineage・budget origin/claim/startedと固定3slot/modelへ結合する。文字列IDが一致するだけでは受理しない。異なるbundle同士で同値receipt/context/source/slotを混ぜられないproducer APIを前提とする。

利用claimはbundleの移動だけでなく、**budget側に唯一のbridge試行claim**を持たせる案とする。同budgetから二つのbundleを作る抜け道を塞ぐためである。既存session claimはowner生成前にstarted=falseである必要があり、bridgeはそのclaimを先に消費しない。新claimの設置・管理allocation・モデルは未実装である。

| 結合対象 | 比較/維持するidentity | 拒否する例 |
|---|---|---|
| bridge利用 | budget-owned bridge claimとbundleの元claim、fresh→Startedの一方向遷移 | 二重生成・再入・別bundleでの再試行 |
| inspection | origin Rc、session claim Rc、started、元budget owner | 同じ数値残量/時計を持つ別budget、新budgetでの再開 |
| context | producer sealと同じcontext保持領域への参照 | 同値bytes/groupsを別allocationへコピーして差替え |
| receipt/target | 元lineage Rc、厳密binding、同target供給系列 | 別世代・別target・同値だが別lineage |
| held/topology/source | 元open/attach系列のseal、held origin、同source所有値 | 別resource/sourceの混入、未検証pathからの再open |
| policy/3slot | 同供給seal、固定model群、0/1/2のslot位置 | model混在、順序違い、slot補充、別供給系列のQuotas |

receiptは値moveでアドレスが変わるため、packaging前のreceipt fieldポインタを後まで保存しない。既存release入口のlineage/value照合→所有receiptへのcanonical参照正規化をそのまま用い、body/owner以降のポインタ同一性検査を維持する。receipt・registry・contextの厳密検証を「seal確認済み」で省略しない。

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

- `InputRejected`：bridge guard段階の元primary、固定の拒否stage、元lineage/budgetへの診断上の関連、解放観測、checkpoint観測。未開始なのでround/CompletionFailureは持たない。source/path/record bytesは持たない。
- `Outer`：**実際に返ったOuterStrictFailure全体**を値で保持。primary/phase/round/inner/summary/cleanup/観測を再構築しない。

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

新規ID候補を`bp5-r2-protected-bridge-0.1`とし、固定入口guardを**10 work候補**に分ける。これは未実装の候補で、計数・拒否prefix・独立oracle検証まで確定値ではない。

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
4. receiptのmove前後とcanonical参照結合を確認する。self-reference/unsafeや別resource再取得なしでコンパイルし、body側のpointer guardを弱めない。
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

承認待ち：producerの実trust根拠/配置、bridge claimの保持/初期化方式、opaque facadeのlifetime/visibility、wrapperのinline size上限、上位診断の最終所有先、supply/claim/result費、全体work/resource上界・運用cap、generic Dropのbounded性/実OS解放確認。案の型名や係数を承認済み仕様として実装へ持ち込まない。
