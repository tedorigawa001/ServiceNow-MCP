# BP-5 R-2 OL-03 PC-03：管理allocation複合契約・bootstrap境界・初回実装subset

Version: draft-0.1 / Date: 2026-10-24 / Source baseline: `b25dba2` / Status: 設計案のみ。必要量モデル未実装・5項目Unknown

## 1. 範囲と契約の位置付け

[未導出5項目設計](BEST_PRACTICE_BP5_R2_OL03_PC03_MISSING_REQUIREMENTS_DESIGN.md) §2〜§6を具体化する。ここで選ぶ単位・phase・型・モデルIDはレビュー対象の案で、運用承認/既存API変更ではない。旧40項目比較の管理allocation scalarを拡張済みと扱わない。

Unknown、全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable/gate92、DER/absence停止を維持する。実装・本番cap投入・完成parts発行・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行を行わない。

## 2. 管理allocationは4軸の積型とする案

`ManagementDemand`と対応する`ManagementCaps`は次の**4軸を独立に比較**する次版契約を推奨する。1 scalarへのpack、重み付け和、最大値への圧縮、軸間の枠移転は設けない。全軸の導出・比較・coverageが揃わなければ管理allocation全体はUnknown。

| field案 | 単位と意味 | 比較 |
|---|---|---|
| allocation_attempts | 非0要求の確保/grow試行数。失敗試行も消費済み | demand <= 同軸cap |
| cumulative_requested_bytes | 各確保/grow試行が新たに要求する全block量の累積。growは差分でなく新block全量 | 同上 |
| peak_live_requested_bytes | 所有中block＋未決定確保予約の要求bytesの最大値。growの旧新重複を含む | 同上 |
| maximum_single_request | 1試行で要求する最大block量。試行なしなら0 | 同上 |

各値はchecked u64、負数/overflow/モデル上限超過はLimit。上限の数値は本書で決めず、構造的な試験上限と運用capも混同しない。全cap有限、未知の軸・欠落・重複・余剰軸・旧scalarとの混在はUnavailable。既知の数値0は「該当する確保試行がない証拠」がある場合だけで、Unknownの既定値ではない。

意味上の整合：`maximum_single_request <= cumulative_requested_bytes`、`peak_live_requested_bytes <= cumulative_requested_bytes`。後者は起点から全blockの確保試行を覆う場合のみ成立する。開始前から保持するblockは明示したcarry-inに分け、累積確保へ再計上せずpeakへ含める。carry-inを含む一般式では`peak <= carry_in_bytes + cumulative_requested_bytes`。起点・対象rangeが違うsummaryをこの式で結合しない。

### 2.1 確保イベントの意味

各blockには非再利用の論理identity、所有者class、発行元、要求量、alignment、phaseとscopeを持たせる。ポインタ値やVec長だけをidentityにしない。次のイベント名は合成内部契約の案で、OS allocator hookではない。

| 操作 | 数量/寿命への反映 |
|---|---|
| ReserveNew(id,n) | n>0・fresh id・型/容量検査後、attempts+1/cumulative+n/max更新、nをlive予約。実確保より先に検査する |
| Commit(id) | 同じ予約をownedへ移すだけ。bytes/attemptsを再加算しない |
| FailNoBlock(id) | 未所有が確定した予約だけ返す。attempts/cumulative/maxは返さない |
| Grow(old,new,n) | ReserveNewと同じ新要求を先に計上し、oldを保持したままnewを予約/確保。成功後にoldを解放。in-placeを仮定してpeakを下げない |
| Move/Borrow/CloneRef | allocation identityは不変。所有責務/参照を移し、確保試行・要求bytesは増やさない |
| ReleaseConfirmed(id) | 最終所有が終了した同idだけを一度減算。存在しないid・二重解放はBinding |
| ReleaseUnconfirmed(id) | liveから減算せず停止。診断を保持し、後続確保/再利用へ進まない |

0 byteの型/空containerはallocation試行なしとして扱う案。ただしzero-size用capacity sentinelを要求量へ掛けず、containerの制御領域は所有する外側block/固定領域へ別帰属する。実adapterが0 byteでも確保するなら別モデルが必要。未決定予約をDropだけで返す設計にはしない。確保の前後に中断した場合、実blockが返っていれば即座にowner化して固定discardへ渡す。

### 2.2 byte量の適用範囲

要求量はallocation APIへ渡すlayoutの要求bytesを基準にする。ABI/layout/alignment・要素capacityの対応を固定する。stack/static/inline領域はheap4軸へ偽って加えず、別の固定領域coverageへ残す。heap以外の未導出量も管理領域全体のUnknownを解除する際の必須条件とする。

`size_of<T> × capacity`だけではnested String/Vec/Rcやparser内部一時量を覆わない。別blockとして列挙する。Rcはpayloadだけでなく制御領域/alignmentを含む要求layoutが必要で、今回のgroup/key4確保にも係数を捏造しない。allocatorのmetadata/丸め・RSS・thread stack上限は保証外で、必要なら別backendモデル/監督の契約を設計する。

現行[profile収集](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/collect.rs)は`try_reserve_exact(n)`を使うが、要求nが実capacity上限を証明するとは扱わない。対象library/allocatorでの要求layout・容量戦略を固定できなければ、そのadapterはUnavailable。Rc::newのOOMを現実装が型付きLimitで捕捉するとは主張しない。

## 3. coverage・binding・比較結果

将来の完全な必要量は4軸に加え、対象費目集合（A-F/A-K/A-J/A-P/A-S/X-D）、成功/拒否prefix、carry-in/carry-out・固定領域coverageを保持する。係数・ABI/library/backend・寿命/phase版を含む単一ModelBundleへ結ぶ。4数値だけの入力を完全性証拠にしない。

保護された発行元は同receipt/lineage/target/context、budget origin/started/claim、Initial scope/declaration/profile/estimateに結合する。capは同承認owner/revision/期限・modelを保持する。発行/消費は元budget側one-shotとし、別owner/別budget・同値の再構築を拒否する。公開getterや任意trace→証拠constructorは作らない。

旧PC-01 scalar/40比較と次版複合契約は異なるmodelとする。旧証拠に追加bitを立てて移行せず、scalarへのfallbackもしない。新cap registry/schema/model ID・完全性issuer・claim費用は別レビューまで未確定。最初の実装subsetはこの保護証拠もcap比較済み値も発行しない。

## 4. bootstrapの固定境界案

「bootstrap」は独立の満額予算ではなく元inspectionの限定準備phase。元origin/started/期限/retryを保ち、単位別制限はI/O・work・live・管理4軸で別々に検査する。

| 境界 | 入る処理 | 出口条件／次phase |
|---|---|---|
| Entry→B0 | 元budget/診断ownerの確保から、固定cap/model/clock前提の確認まで | 事前のprofile不要の有限準備枠が承認済みでなければ進まない。認証・読取・owner確保も無償にしない |
| B0→B1 | 同receipt/context/held系列・record入力確保、Initial BeforeScan担当のhash-first厳密検証 | 既存6回中の担当1回と由来を型付き保持。未検証ならB2へ進まない |
| B1→B2 | Initial予定decode/意味検査・ScanInputs・count-only profile・estimate | 同scopeに保持。統計一時領域解放、同profile一度のみ。4回目decodeなし |
| B2→B3 | 保護projection・管理/外側/全体必要量導出・比較、Draft/将来のparts検査 | 完全性が不明なら停止。必要量算術自体の費目を含める |
| B3→B4 | PolicyCaps消費→固定Slots準備/結合→公開前checkpoint | 全体の残予定量/予約と必要な将来guardまで覆う固定計画を検証。未承認ならsession開始不可 |
| B4→S0 | 公開前checkpoint成功後の一度限りhandoff | **session開始の直前**がbootstrap成功終端。session create/configureはS0の責務 |
| Bn→BX | B0〜B4の任意失敗（B4成功handoff前の中断を含む） | 元Bnを再開せず、固定discard・解放後checkpoint/診断合流まで |
| S0以降→終了 | session開始/configure/slot attach、Initial残工程・後続round・解放 | ここで失敗してもBXへ戻さない。全体other/通常Outerの診断・解放責務 |

B4で検証するのは固定計画の上界であり、後のworkを実施済みにする処理ではない。最終guardを含む予定量を元budgetに検査/予約する接続が必要で、未接続のまま「受付済み」を発行しない。受付計算や予約確定自身の費用も覆う。bootstrapの枯渇を新session/budgetで回復しない。

### 4.1 phaseをまたぐ所有と控除

B4 handoffは所有を消さない。同receipt/宣言/estimate・parts/slot予定・carry-outを固定ownerが保持し、借用を守ってS0へ移す。B2の一時配列は解放証拠がある場合だけcarry-outから外す。S0に到達しない現段階で、carry-outを0とする実装はしない。

全体累積量はB/Sを実操作IDで分割し、再読だけ再課金する。管理peakはBのpeakとSのpeakを足さず、carry-in/outの区間重なりを含む全体traceで求める。bootstrap liveはresource identity集合、管理bytesはallocation block集合で、相互に換算しない。

BXの上界は、各拒否prefixで残り得る所有集合・解放試行・診断保持を含む。成功経路費＋全phaseの失敗費の単純和でなく合法traceの最大を採る。work失敗後の必須解放を省略しないため、実解放責務/予約とworkの失敗判定を分ける。未確認解放はliveを減らさず、主理由とcleanup診断を両方保持する。

B0の前提検査の循環対策は、信頼済み固定entryが限定BootstrapCapsを供給し、自己認証に必要な有限操作だけを既存構造上限内で許す設計案。capの真正性/clockが未確認の間はscan/parts/全体受付へ進めない。具体的信頼の起点・有限値・失効・実強制は未承認であり、今回導入しない。Entryより前の配備検査を同inspectionで計上するか別roleで制限するかも所有表で確定するまで全体coverageはUnknown。

## 5. 必要量モデルの最初の実装範囲案：MA-01

最初は**管理4軸の純粋なbounded合成イベント計算器**に限定する。仮IDは`bp5-r2-management-trace-0.1`。実装時にID/構造上限/固定work式をレビューして固定する。実heap/OS/production sourceへ接続せず、既存DraftのUnknown・finalize・PolicyCapsの旧契約を変更しない。

| MA-01に含める | 含めない／依然Unknown |
|---|---|
| 有限合成class・block ID・明示layout要求bytesの型、固定phase順 | 実allocator layout・Rc/Vec内部量の認証、production cap |
| reserve/commit/fail/grow/release、carry-in/outの純粋計算、4軸出力 | 実profile/receiptからの完全性証拠、保護された必要量projection |
| overflow・上限・duplicate/unknown ID・phase逆行/停止後再開の拒否 | 全体管理量/外側owner/bootstrap bytes-work-liveの導出完了 |
| 成功/拒否/中断prefixの検査、独立literal oracle | ResourcePolicy/Input/Quotas・完成parts/permit・通常strict接続 |

合成traceの入力は「そのイベント列についての計算」に限る。`SyntheticManagementEstimate`相当の非実行型にし、ManagementRequirement/CompleteRequirementEvidence/ApprovedCapsへの変換口を持たせない。未完traceや未解放を完了として返さず、エラー時の有限診断/計数snapshotはテスト用に限る。carry-outありのtraceは明示した部分区間結果で、全体終了証拠とは別型/状態にする。

### 5.1 bounded性・課金・第一理由

- イベント数・同時block数・ID/domain・phase数・単発要求・集約値に、独立の有限構造上限を設け、処理/確保より前に検査する。数値は実装前に決め、運用capへ流用しない。
- parserや巨大Vecの受領は導入せず、小さな型付き合成入力だけを扱う。borrow済みsliceでも計算器が上限検査なしに走査してよいとはしない。scratchには固定上限/容量戦略を用い、その初期化/探索/解放費を別計上する。
- 固定長slot探索等、単純で監査可能な方式を優先し、worst-case比較回数を式に含める。任意IDのhashmapや未課金sortへ依存しない。
- 元SharedBudgetのwork/checkpoint/取消/期限を使う接続を設計し、計算の費用はモデル化されるallocation量とは別単位で課金する。初期化・各探索/イベント算術・結果公開の係数/式は未導出で、無償処理としない。
- 試行開始は最初のfallible処理前に消費し、先行理由を保持する。MA-01の合成attempt内の再開は拒否するが、元budgetへ新しいproduction claim/issuerを先取りして追加しない。算術エラーはLimit、順序/identity不一致はBinding、未知model/未対応形状はUnavailable。Deadline/Cancelledは元理由を保持する。

### 5.2 独立oracleと受入条件

1. 非対称なliteral traceで4軸を手計数する。例：8 byte確保を保持中に13 byte確保→旧8解放→13解放ならattempts2/cumulative21/peak21/max13。8→13のgrowでも旧新重複を含め同値。2つが重ならなければpeak13。これは合成要求量で実allocator量ではない。
2. carry-in8を保持して13を確保する部分区間は、attempts1/cumulative13/peak21/max13/carry-in8。初期8を累積へ再計上しない。grow失敗も試行/累積/maxを返さず、旧blockを保持する。
3. 予約失敗/中断・二重解放・未知block・別phase・cap等号/1不足・overflow、上限件数/1超過を検査する。Grow途中の所有を落とさず、BXとS0の境界を区別する。
4. production集約helper/係数/offsetを使わないoracleと照合し、peakを差分growに変える・failed試行を返す・carry-inを二重加算する変異で失敗する。
5. 全work境界のLimit/Cancelled/Deadline、borrow/非Clone/serde/opaque出力、実確保/外部通信/scan/parts発行へ接続しないことを確認する。テストfixtureのraw traceを実証拠として発行しない。

MA-01の成功は「合成イベント算術の契約確認」だけ。次段階MA-02で固定moduleの実確保モデル/保護projection/同receipt-budget-profile結合と収集費を設計し、その後に初めて完全性coverageを議論する。5項目を確認済みにする順序ではない。

## 6. 次の承認点と停止条件

実装前：4軸の単位、carry-in/out、growの保守的旧新重複、B4/S0とBX境界、MA-01の有限構造上限・scratch方式/work式・one-shotの所在をレビューする。未決事項を実装者の既定値で埋めない。

運用前：実layout/ABI/allocator・固定領域とnested coverage、信頼済みBootstrapCaps/clock、PC-04継続、全体payload/work/管理量・実強制、cap承認/失効、次版証拠/parts契約を別途満たす。旧scalar・PC-02 scan subset・合成MA-01を完全性へ昇格させない。

今回は設計文書のみ。数値モデル・oracle・強制/実OSの検証は未実施で、全停止条件を維持する。
