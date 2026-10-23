# BP-5 R-2 OL-03：PC-03 one-shot parts配賦・証拠消費の詳細設計

Version: draft-0.3 / Date: 2026-10-23 / Source baseline: `e230a7e` / Status: allocation view・非実行Draft・budget側claim・論理slotキー/非実行cap写像を合成実装。Unknown finalize拒否を維持。完成parts/実source結合/移譲/本番承認は未実装

## 1. 範囲と到達点

[PolicyCaps設計draft-0.6](BEST_PRACTICE_BP5_R2_OL03_POLICY_CAPS_EVIDENCE_DESIGN.md)のPC-03を具体化する。§11〜12で各段階の実装を区別し、それ以外の型名・入口・状態・費目は引き続き設計案である。PC-02のscan35項目の部分比較を、全体必要量の確認や実行権へ昇格しない。

本番cap投入・全体受付・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行を含めない。telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。本書の配賦は将来の内部資源上限の設定であり、MCP操作/OS実行のpermitではない。

### 1.1 照合した現行ソース

| 実装 | 現状とPC-03で解消すべき境界 |
|---|---|
| [PC-02 projection](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection.rs) | 同estimateへの借用、Initial/同budget/retry/Freshと一度限りprojection。scan必要量だけ |
| [PC-02 cap比較](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/caps.rs) | cfg(test)の合成capだけ。ScanCapsComparedは35項目の部分結果で、require_completeは必ずUnavailable。実cap値/比較元を取り出す口はない |
| [PC-01 PolicyCaps](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/policy.rs) | 合成40項目/模擬Witness。issued/used・同held系列を確認するが、partsや実profile由来はまだ証明しない |
| [Slots](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/slots.rs) | 消費済みPolicyCapsCheckedと同PolicyInputsを要求。固定3sourceの存在/順序/非alias/未開始を確認。partsは保持しない |
| [session](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session.rs) | ResourceInputはopaqueなResourcePolicy移譲値。receipt等はsession側にあるが、ResourceInput自身には配賦issuer/receipt/slot結合がない |
| [資源会計](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources.rs) | session/roundのattempts5・total・live・names、cleanup予約・接続/終端管理。ResourcePolicyの本番constructorなし |
| [保護入力](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs.rs) | Taggedのsupply/slot結合はあるが、承認cap由来・必要量・配賦partsの発行証拠ではない。固定releaseへ値を一度moveする |

## 2. 未導出5項目と発行禁止境界

[未導出5項目の詳細設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_PC03_MISSING_REQUIREMENTS_DESIGN.md)で、単位・費目所有・B0〜B4/BXの寿命・保護された導出元・独立oracleの条件を具体化した。設計のみであり、管理allocationの内訳契約・係数/承認cap・PC-04の継続は未確定。以下の5項目は引き続きUnknownで、完成partsは発行しない。

| 項目 | 現在の状態 | PC-03の扱い |
|---|---|---|
| 外側owner | scan peak5だけでは全FD/外側held量を表さない | 不明を維持。scan live capから自動生成しない |
| 管理allocation | profile/tree/配列/一時所有・重なる寿命の全体上界なし | allocationなしの比較器だけで0と判定しない |
| bootstrap bytes | 既存Initial decode等の限定準備に必要な総量未導出 | scan payload残量から転用しない |
| bootstrap work | 事前認証・record・統計・guard等の全費目統合未完 | 既存18/45/89を足すだけで完了としない |
| bootstrap live | 準備中の同時所有と解放余裕未導出 | scan peakやround枠で代替しない |

scan35項目にも、外側A/B/recordと重複しない全体payloadの残必要量、実capの承認/実clock・保持量/全体work上界はまだない。5項目のscalarを埋めるだけでは全体受付にならない。

次の2段階を明確に分ける。

1. **ScanPartsDraft**：実projectionと比較元cap snapshotの同一性を保つ非実行の配賦案。現状を前提に将来合成実装できる最大範囲。ResourcePolicy/ResourceInput/Quotasを含めず、通常strictへ渡す口もない。
2. **PolicyAllocationParts**：実承認capと全必要dimensionの型付き検証が揃った後だけ、resources専用moduleが発行する完成parts。現状は発行不能。本番constructorを追加して欠落証拠を補わない。

PC-02 ScanCapsComparedやPC-01の合成PolicyCapsCheckedをそのまま完成partsへ変換しない。UnknownをVerifiedへ変えるbool/enum setter、テスト専用の「5項目確認済み」fixtureから実完成partsを作る口も禁止する。将来の合成テストで数値の配賦処理を観測する場合も、別の非実行型を使い、実証拠と共通の昇格constructorを持たせない。

## 3. 型と発行元・所有権の案

| 型案 | 唯一の発行元・入力 | 保持/消費責務 |
|---|---|---|
| ScanCapAllocationView | PC-02のcap/projection専用module。比較成功値を値で消費し、実projection/比較したcapそのものを借用 | 同estimate/Initial scope/receiptとcapのborrow。診断配列から再構築不可 |
| ScanPartsDraft | resources専用module。上記viewと同budgetの生成claim | 承認対象capのscan部分の配賦案、非実行の論理slotキー3個。未導出5項目をUnknownのまま保持 |
| CompleteRequirementEvidence | 未実装の全体必要量/承認cap検査器 | 残5項目と外側payload/work等の由来・費目所有・同receipt/budget。発行元未確定のため現状Unavailable |
| PolicyAllocationParts | resources専用module。実cap、Draft、上記完全性証拠を値で消費 | ResourceInput1個、slot別Quotas3個、同配賦seal。raw取り出し/再発行口なし |
| AllocationSeal / LogicalSlotKey | 上記固定発行module | 配賦issuer・cap revision/digest/model bundle・receipt/lineage・元budget/started・slot順序。proofだけの独立clone不可 |
| PolicyCapsEvidence-vNext / Checked-vNext | policy専用module。完成partsの借用・完全性証拠と同owner | 証拠発行/消費。Checkedはpartsを取り出す権限ではなく次の固定Slots段階へ一度渡す値 |
| BoundResourceInput / BoundSlotQuota | resources専用module。完成partsの固定分解口 | 各実値とseal/slot結合を保ってmove。session configure/固定boundaryが一度消費するまでbindingを外さない |

全field private、非Clone/非Copy/非serde、固定opaque Debug。内部にRc identityを共有しても、外へclaimの複製/新規生成/状態resetを出さない。AllocationSealのdigest一致だけではownerの代替にならず、同じcap数値・同じreceipt内容でも別owner/世代/slotを拒否する。

## 4. 同receipt／budget／slotへの結合

### 4.1 固定結合項目

- 同一の安定したRecordReceipt保持ownerへのborrowとlineage、bindingのrelease/generation/root/index path/hash、同target/context。
- 同held leaf origin、record/topology source系列、同供給issuer。path文字列・FD番号・同じhashだけで代替しない。
- 元inspection_origin、ProtectedBridgeClaim、ScanSessionClaim、started、元期限/共有retry。別budget/新startedで枠を補充しない。
- 同profile/estimate/Initial scope/tokenと比較元cap owner・revision/digest/bundle・有効期限。PC-02の部分結果は上記の実borrowを保持するviewを経由し、rawな35配列を証拠として持ち運ばない。
- 一つのallocation issuerと、固定順Initial/BeforeM4/AfterM4に対応する論理slotキー。sessionとlocal Quotasは同cap snapshotから写した値の完全一致を要求する。

### 4.2 論理slotと実source・round tokenの分離

配賦時に必要なのは**論理slot**であり、まだ生成していないbackendのsource originや後続roundのtokenを捏造しない。固定発行moduleが同allocation groupに属する3個の非aliasなキーを発行し、ordinalとRoundを固定する。callerにslot番号/キー生成を任せない。

PolicyCaps消費後のSlots準備で、論理キーと実際に生成された固定3sourceのcanonical originを1対1に結ぶ。各sourceは未開始・承認対象backend/model・同root系列でなければならない。これにより「partsが実sourceを待つ→PolicyCapsがpartsを待つ→SlotsがPolicyCapsを待つ」という循環を避ける。完成parts発行時点では実sourceの検証済みとは扱わず、その検査はSlots段階が所有する。

将来の各session round開始では、その論理slotへ**freshな実RoundScope/token**を追加結合する。Initial tokenをBeforeM4/AfterM4へ再使用しない。別source、slot入替え、重複キー/alias、同番号の別allocation groupを拒否する。

## 5. one-shot状態とclaimの所在

estimateやparts値だけのprivate boolでは、別issuerからの再生成を防げない。配賦生成/移譲の正本claimは元SharedBudgetのProtectedBridgeClaim側に一つだけ置く案とする。既存policy issued/used・session started・bridge generated/usedは別責務のまま残す。

| 状態案 | 遷移を行う固定入口 | 出口条件 |
|---|---|---|
| Fresh | Draft作成の試行開始 | 最初のfallible処理より先にDraftClaimedへ。重複/再準備は拒否 |
| DraftClaimed | 同view/receipt/budgetとscan cap部分の配賦案を作成 | 成功しても実policy/実quotaなし |
| DraftReady | 完成parts発行の試行 | 最初にFinalizeClaimedへ。一度しか試せない |
| FinalizeClaimed | 実承認/完全性/モデル/期限/値を確認 | 現在は残5項目等がUnknownなのでUnavailable→Stopped |
| PartsReady（将来） | 完成partsと同ownerのpolicy証拠発行/消費 | 既存policy issued/usedを不可逆消費。未消費partsの同一性を再確認 |
| SlotsBound（将来） | Policy→Slotsと公開前checkpoint | 同論理キー/実source/partsを固定ownerに保持 |
| TransferClaimed（将来） | 完成partsの固定値移譲 | 最初に不可逆消費。Option::takeは一度だけ、差戻し/再生成なし |
| Transferred（将来） | 同sessionと3固定slotに各値を引渡し | 枠の再付与・unused分の別inspection転用なし |
| Stopped(first_reason) | 任意の拒否/中断/未完了abandon | 復旧しない。所有中の値は固定discardへ。別budgetも停止 |

これは設計用状態表であり、新しいstate setterを公開しない。各入口は期待prior stateを一度取り出して先に停止/試行済み側へ倒し、その後にwork/guardを行う。成功時だけ次の状態に進む。失敗・drop・生成途中のallocation失敗でもFreshへ戻さない。完成/移譲のclaimを最終checkpoint後に初めて取る設計にはしない。

停止の伝播：`SharedBudget::stop`は、bridge claimの発行済み/開始済みフラグ（context/records/held/policy/slotsの各evidence issued、preparation_started、generated）が立っている場合だけclaimへ失敗を記録する。配賦状態を同claimへ置く以上、**状態がFresh以外（DraftClaimed以降、Stoppedを除く全状態）なら`stop`がclaimへ第一理由を記録する**ことを記録条件へ追加する。これを欠くと、配賦試行開始後の取消/期限/work不足が同budgetのstickyな`failed`には残っても、claimを保持するDraft/parts/view側からは見えない。準備（`55cdf64`）と証拠段階（`6dae716`）で同じ漏れを修正した経緯があり、実装時は各状態について「状態遷移後の停止がclaimへ記録され、先行理由を上書きしない」回帰試験を併せて追加する。

未移譲のDraft/partsをabandonしたDropは元claimにUnavailable（先行理由があればそれ）を保持するだけであり、source解放やcleanup完了を証明しない。正常に次ownerへmoveした空shellはabandon扱いにしない。意図的に値をforgetしてもclaimが残り、次の発行は拒否される。

## 6. 配賦値の規則と証拠の消費順

### 6.1 計算値ではなく承認capを写す

| 行先 | 配賦元 | 照合条件 |
|---|---|---|
| ResourcePolicy.session | 承認capのsession attempts5/total/live/names | 必要session量以内、finite上限、共有tail/retryの定義に一致 |
| ResourcePolicy.rounds[i] | 同原票のround[i]各8項目 | 固定slot iの必要量以内。roundごとの別capを保持 |
| Quotas[i] | **同じround[i] cap**のattempts5/live/name_bytes | session policy側の対応値と完全一致。totalを捨てて成功にせず、session側で必ず強制 |
| payload / retry / enum / 残5項目 | 対応する元budget/全体検査器 | ResourceInputへ混ぜて再付与しない。receipt/phase/費目ごとの独立責務を保持 |

必要量をそのままpolicyにする、必要量へ任意余裕を足す、session枠を3等分する、3×roundをsession値にする、分類別attemptsの和をtotalにする方式は採らない。cap原票に従いsession/round/localの整合を検査し、overflow/finite上限違反はLimitで停止する。PC-02のmodel計算を再実行してcapの承認を得ることもしない。

cleanup/live予約は完成partsの静的数値ではなく、既存会計が実acquire前に両台帳へ一度だけ計上する。配賦時に実使用量/予約済みカウンタをpreseedしない。取得がhandleを返さなかった場合だけ既存の未使用予約返却を使い、操作試行・retry消費を戻さない。slot localの上限とsession totalの二重強制を維持する。

### 6.2 固定順序

1. 元budgetでDraft claimを消費し、PC-02の比較成功値を専用viewへ値で移す。同じ借用を保って非実行Draftを生成する。
2. 残5項目を含む完全性と実cap承認を確認できない限り、finalizeで停止。現在のPC-01模擬Witness/Checkedを完全性証拠に使わない。
3. 将来、全前提が揃った場合だけresources moduleが完成partsを発行し、同固定owner内でpolicy moduleが証拠を発行する。消費した完全性証拠と実cap保持ownerも同ownerへmoveし、確認済みbool/裸digestだけを残して捨てない。無関係なparts/proofをtupleの組替えで差し込むとBinding。
4. PolicyCapsEvidence消費時に、同cap/完全性証拠/parts issuer・receipt/budget・論理slot3個・未移譲状態・値の整合・model/期限を再確認する。値はimmutableなのでresource計算や全配列を再decodeしない。消費claimは先に使う。
5. CheckedをSlotsへ一度渡し、実3sourceと論理キーを照合する。公開前checkpointまでは新しいProtectedSupplyを発行しない。
6. 同固定ownerの最終移譲口でpartsを一度分解し、binding付きのResourceInput1個/Quotas3個を渡す。全体work/resource受付が未成立なら移譲/scanを開始しない。

本書の後半は将来経路の契約で、今のPC-02に存在する操作とは区別する。

## 7. 借用・session configure・slot接続

現在のPC-02 ScanCapsComparedは実capを取り出せず、元projection/estimateのborrowを持つ。PC-03ではcap module内部に狭いallocation view発行口を設計し、比較した同capの値だけをresources moduleへ見せる。外へ汎用getterやraw配列の再入力を出さない。必要量の比較をやり直す代わりに、同sealed viewとimmutable cap保持ownerを継続借用する。

同receiptを値でmoveする現行EvidenceInputs/PolicyInputsへ、borrow中のreceipt/estimateをそのまま入れることはできない。Draftやparts sealの中に自分の所有物への参照を格納する自己参照構造、unsafe/ポインタでの寿命延長、4回目decode/profile再buildは採らない。[親設計§7](BEST_PRACTICE_BP5_R2_OL03_POLICY_CAPS_EVIDENCE_DESIGN.md)の安定した外側receipt所有者とInitial継続（PC-04）が接続の前提。合成試験は同with_round内のborrowだけで完結させ、通常strictの差替えは行わない。

将来のconfigureでは、session create後にpre-session用guardを再実行しない（session.started=trueが正常になるため）。代わりに固定`configure_bound`相当が、同ledgerのreceipt/lineage/target/context/origin/session claim/started、未configure・ExpectInitialと、Transferred段階の同allocation sealを検査してBoundResourceInputを一度消費する。現在のResourceInputのraw tupleだけではこの検査を満たさないため、binding wrapperまたは等価の固定ownerの保持が必要である。

BoundSlotQuotaは論理slot/parts issuerと実source originの結合を保持して固定collector入口までmoveし、対応RoundResourceScopeのfresh token・同会計bookへのConnectionを確認した狭い入口だけがlocal Quotasへ一度外す。配賦sealを早期に捨て、同値のraw Quotasだけを自由に渡せるAPIは作らない。既存のsession/round strict ack、connected/terminalized、local/session保存則・cleanup終端証拠を弱めない。

slot attach側もpre-sessionのcheck_identityを再利用せず、Transferred後の同配賦・同session/slotを確認する専用guardを使う。状態が違うことを避けるために既存の未開始guardを緩めたり、session started/generatedフラグをresetしたりしない。

## 8. 失敗時停止・診断・解放責務

| 条件 | 第一理由の案 | 動作 |
|---|---|---|
| 残5項目/全体必要量/承認cap/発行元が不明 | Unavailable | completed/配賦済みにしない。fallback/既定値なし |
| 別receipt/lineage/owner/budget/started/parts・slot交換、二重消費、順序違い | Binding | 元claimと提示budgetを停止。全slot/partsの再発行なし |
| cap期限切れ | Expired | 元deadlineを延ばさず停止。再承認/新startedで同試行を続けない |
| cap不足、上限超過、checked算術overflow、allocation失敗 | Limit | 値の切詰め・飽和・cap増額をしない |
| 元record/hash/metadata/世代の変化 | 元のChanged/HashMismatch等 | 既存検証器の理由を保持 |
| Deadline/Cancelled/先行sticky failure | 元理由 | 追加配賦/証拠発行/source操作を開始しない |
| cleanup未確認 | 元理由と別cleanup診断 | 先行InputRejected/Outer診断を上書きせず、完了解放を捏造しない |

生成・policy側の拒否は既存InputLocation::Supply(PolicyCaps)、実slot結合の拒否はSupply(Slots)、configure後の失敗は既存Outer側に保持する案。内部に有限の配賦substageが必要なら型で定義し、rawエラー文字列・cap値・承認者情報・path/pointer/秘密を表示しない。

所有権は固定ownerが持ち続ける。証拠とsealはidentity/borrowだけで新しいsource所有権を作らない。失敗時は先行理由をlatchし、borrowを内側から閉じた後、3scan source→未移譲parts/quotas→record source→topology source→held→receiptという既存固定discardに整合する順序で処分する。viewがcap/receiptを借用中なら、その借用先を先にdropしない。未生成slot/値はNotReachedのまま扱う。

部分移譲は外へ公開しない。Option::take済みの値を固定calleeがRAII所有するまではfallible処理を挟まず、失敗ならremaining ownerと渡し先ownerがそれぞれ一度だけ解放する。session configure後にslot2だけ失敗してもsession枠を再configure/再満額化しない。既存cleanup予約による実解放は取消/期限/work不足でも実施し、最終checkpointと上位診断合流は固定releaseが所有する。partsのDropがClosedScanResources等を発行してはいけない。

## 9. 費目所有と合成受入条件

| 費目案 | 所有module | 境界 |
|---|---|---|
| Draft claim・view同一性 | budget/cap専用view | 原票再取得・profile再収集はしない |
| cap値の固定写像・論理キー3個 | resources | session/roundの固定32項目と3local projection。可変N走査をしない |
| 未導出5項目/全体の検査 | 将来の完全性issuer | 未知費目を0にせず独立計数 |
| finalize claim・証拠発行/消費 | resources/policy | claim/owner guardとimmutable parts照合の所有を重複させない |
| Slotsへの実source結合 | Slots | 既存3slot guardと新parts結合を区別 |
| parts移譲・configure・local外し | 固定caller/session/boundary | claim、Option::take、固定写像の課金を一度だけ |
| 管理保持量・drop/cleanup | 固定owner/既存resource台帳 | Rc/配列/一時所有・途中失敗・終端診断を除外しない |

総費の形は`A_draft + A_complete + A_finalize + A_issue + A_consume + A_slots_binding + A_transfer + A_configure + ΣA_slot_attach + A_discard`。これは費目名であり数値上界ではない。各固定行/拒否prefix・checked演算・allocation/解放量の独立計数後にID/係数を固定する。PC-02の18/45と旧PC-01の89、既存17/23、session configure費を単純加算して全体受付を承認しない。既存resource計算9行の重複実行も禁止する。

実装時の合成受入条件案：

1. 同with_round・同estimate/比較元capのviewからのみ非実行Draftを発行。raw summary/同値cap/別receipt/別claim/期限切れは拒否。
2. 残5項目をUnknownのまま保持し、完成parts発行の試行は必ずUnavailable。未知項の0埋め、模擬PolicyCapsCheckedでの昇格、実ResourceInput/Quotas/session configure到達がないことを確認。
3. Draft/finalize/transferの全入口で二重試行・drop/forget後・別issuer再生成を拒否。各work境界のLimit/Cancelled/Deadlineと先行理由を保持。配賦状態がFresh以外になった後の`stop`がbridge claimへ記録され、claim保持側からも停止が見えることを状態ごとに確認する（§5）。
4. 論理3slotの重複/交換/別group、実source alias/開始済み/別root/modelを拒否。PolicyCaps→Slots順と後続roundのfresh tokenを維持。
5. 将来の完成経路ではsession/round/local capの対応値完全一致・total独立・retry/tail共有・cleanup予約の一度計上を別oracleで確認。完全性issuerがない間は非実行模型での配賦検査に限定する。
6. proofだけ/partsだけの交換、発行後の別owner持込み、移譲途中の失敗を拒否。解放回数/first diagnostic/NotReachedとUnconfirmedを区別。
7. lifetime/compile-failでborrow中のreceipt/estimate移動、別roundへview持出し、完成証拠へのcast、Clone/serde再構築を拒否。テストがprivate名へアクセスできないだけで失敗したものを寿命の証明に数えない。
8. PC-01/PC-02・旧offline契約・固定評価セットを維持し、通常strictや停止gateを変更しない。

## 10. 実装順序案と未承認事項

最初は**allocation view・非実行Draft・budget側one-shot claim・Unknownでfinalize拒否**だけを合成実装する案とする。続いて論理slot・parts照合の非実行模型と独立oracleを整備する。残5項目/全体必要量・cap/clock/費目所有・PC-04の安定借用が成立するまで、実ResourcePolicy/ResourceInput/Quotas constructorとconfigure接続は作らない。

後の完成parts追加では、parts由来を要求しない旧PolicyCapsEvidenceモデルと同一IDにせず、`bp5-r2-policy-caps-evidence-0.2`、parts/BoundResourceInput/slot結合用の専用model等の次版契約を設計・承認する。具体的ID/係数は案で、現在のソースの定数を変更しない。古い合成証拠を新しい完成証拠として読み替えない。

承認待ち：実capの全原票/信頼元・失効手順、完全性issuerと残5項目の導出/実強制、外側payload/work/保持量の全体coverage、借用継続と固定caller移行、型付きslot/配賦sealの接続先、全費目上界/モデル版、本番backend。これらが未解決ならUnknown/Unavailableのままとし、全体受付・実行経路は停止を維持する。

## 11. 第1subsetの実装・合成確認

[allocation_view.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/caps/allocation_view.rs)はScanCapsComparedを値で消費してScanCapAllocationViewを発行する。比較済みの実cap snapshot・Initial scopeへの参照と、同estimate/projectionのclaim fieldへのborrow、元bridge/session claim・started/retry/payloadを保持する。PhantomDataや診断配列だけで済ませず、同receipt/target/context/tokenへ実scopeの借用で結合する。生cap配列のgetter/再入力や任意view constructorはない。capは依然cfg(test)の固定syntheticだけである。

view modelは`bp5-r2-scan-cap-allocation-view-0.1`。発行は入口1＋固定guard3の4 work。guard3は元owner/inspection・未開始、実scope/claimの同一性、immutable cap/model/期限・retry/残payloadを再確認する。PC-02の35項目比較やresource計算9行、profile収集/decodeは再実行しない。

[resources/draft.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/draft.rs)にScanPartsDraftを実装した。modelは`bp5-r2-scan-parts-draft-0.1`。同viewを所有して保持するだけの非実行型であり、承認capの静的session/round/local配列写像や論理slotキー3個はまだ発行しない。実ResourcePolicy/ResourceInput/Quotas、完成parts、完全性証拠、供給/permitへの変換口はない。

未導出5項目は固定順（外側owner・管理allocation・bootstrap bytes/work/live）のUnknownとして保持する。型にVerified variant、値の入力口、status setterはない。finalizeは値を消費し、戻り型を`Result<Infallible, Failure>`にして成功値を構築できない。5項目を検査後にUnavailableで停止する。scalarを0や上限値で埋めたり、PC-01の模擬Witnessへ昇格したりしない。

[allocation_claim.rs](../native/r2-outer/src/signature_boundary/positioned_read/allocation_claim.rs)の正本stateは元ProtectedBridgeClaimのCellに置く。実装した状態はFresh/DraftClaimed/DraftReady/FinalizeClaimed/Stoppedだけ。完成parts/transfer用の未実装状態を先に追加しない。Draft作成はwork前にFreshをDraftClaimedへ置き換え、成功時だけDraftReadyとなる。finalizeもwork前にFinalizeClaimedを消費する。失敗・drop・forget・別issuerで再生成できない。

SharedBudget::stopは配賦状態が非Freshなら元claimの第一理由とStoppedを記録する。別budgetを渡された場合はviewが保持する元claimにも停止を伝播する。§5で要求した、他のevidence/preparation flagがなくても配賦開始後の停止がclaim側に見える条件を追加した。実装済みの各active状態で外部stop→第一理由保持を直接テストした。

費目はview4、Draft作成5（入口1＋view guard3＋publication1）、finalize拒否9（入口1＋view guard3＋Unknown5）。合計18 workは本subsetの正常Draft生成→拒否の実計数で、全体上界ではない。新しいheap allocationはなく、viewのborrowとRcの保持量、Draftの元claim参照を固定サイズで保持する。claim本体は64 bytes以下を確認。PC-02の比較結果も実scope/cap/claim借用とsession Rcを保持するようにしたが、旧比較45 workは不変である。

Draft Dropは元claimの先行理由を保ち、なければUnavailableを記録するだけ。source/FDやquota予約を所有せず、解放/Closed証拠を発行しない。完成経路がないため正常transfer用の空shellや部分移譲は今回実装していない。borrowは同with_round内で閉じ、PC-04の外側owner/Initial継続を先取りしない。

[第1subset合成検証記録](E2E_BEST_PRACTICE_R2_OL03_PC03_DRAFT_SYNTHETIC_2026-10-23.md)を参照。上段model-0.1と作成5/finalize9・heapなしは当時の到達点であり、論理キー/写像追加後の現行費用は§12を使う。`e230a7e`のbegin_allocation（Stoppedを一時状態へも戻さない修正）を維持する。完成parts・通常strict・全体受付は引き続き停止する。

## 12. 論理slotキー・非実行cap配賦写像

Draft modelを`bp5-r2-scan-parts-draft-0.2`へ更新し、viewに加えて非実行の[DraftCapMap](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/caps/allocation_view/cap_map.rs)と[論理キー3個](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/draft/slots.rs)を保持する。map modelは`bp5-r2-inert-cap-map-0.1`、key modelは`bp5-r2-logical-slot-key-0.1`。旧calculator/resource/viewの算術・modelは変更しない。

### 12.1 固定写像

比較した実capオブジェクトからsession8項目・各round8項目（32 scalar）を写し、同roundのattempts5/live/namesをlocal案へ写す（21 scalar）。必要量からcapを生成したり、sessionを3等分したり、totalを分類別sumで置き換えたりしない。local案の型にtotalを入れず、元のsession/round totalを独立保持する。payload/retry/enumの残3項目はviewの共有枠照合のまま、未導出5項目もUnknownのままとする。

mapのconstructorはallocation view専用module内だけ。生配列/診断snapshotからのruntime constructor、Quotas/ResourcePolicyへの変換、mutable getterはない。cap配列のcopyは配賦案の内部保持であって証拠の再入力ではない。mapは同capへのborrowも保持し、再照合ではviewの実scope/budget guard3・capオブジェクトのptr一致・model・53値の完全一致を要求する。同値の別capを拒否する。readonly snapshotと改変口はcfg(test)だけである。

### 12.2 キーの発行・借用・照合

既存budget側Draft claimを消費した固定create内だけで、一つのgroup identityと3つの固有nonce identityを発行する。順序はInitial/BeforeM4/AfterM4、ordinalは0/1/2。canonical nonceを保持し、キーのgroup/ordinal/Round/model/nonceと他キーとの非aliasを固定3回で照合する。Stoppedを上書きする経路や別issuerの再発行口は追加しない。

logical_slotはDraftReadyと実view/map/全3キーを確認後、選択キーへのLogicalSlotRefを返す。require_slotは同じ確認と、該当slotの**canonicalキーオブジェクト参照・group field参照の一致**を要求する。キー値やnonceだけのcopyは代替にならない。borrowはDraftの移動/dropを制約し、borrow前のDraft移動は可能。異なる配賦groupのキーを渡すと提示先と元キーownerを停止する。

これらは実scan source originでも実RoundScope/tokenでもなく、BeforeM4用の論理キーを取得してもそのroundを開始しない。現段階のview guardはInitialに固定する。実sourceの結合、後続fresh tokenへのattach、session configure/実boundaryへlocal quotaを渡す操作は未実装。キーやmapは非Clone/Copy/serde、Debugは固定opaqueである。

### 12.3 費目・保持量・検証

| 経路 | 現行work |
|---|---:|
| view生成 | 4（変更なし） |
| Draft作成 | 62＝claim1＋view guard3＋cap写像53＋group/key発行4＋publication1 |
| map再照合 | 57＝view guard3＋source/model1＋53値比較 |
| DraftReady/全キー照合 | 61＝state/model1＋map再照合57＋キー3 |
| キー借用/キー照合 | 各62＝上記61＋選択/参照照合1 |
| finalize拒否 | 66＝claim/model1＋map再照合57＋キー3＋Unknown5 |

view→Draft→Unknown拒否は132 work。53 scalarの写像/比較は固定長で、receipt/indexの再parse・profile再収集・resource計算・scanを行わない。この実計数を全体受付上界へ単純加算しない。

map自体にheap allocationはないが、group1＋nonce3の**4個のRc identity allocation**をDraftごとに追加する。canonical anchorやキーは同じidentityのRc参照を保持する。全体allocation/FD/live保証ではなく、未導出の管理量を確認済みにしない。RustのRc::newを用いており、allocator OOMを型付きLimitで回収できると主張しない。途中のwork/取消失敗はローカル所有をdropし、OS cleanup証拠を発行しない。

非対称なcap原票と、production mappingのindex計算やhelperを使わないliteral oracleでsession/round/localの全53 scalarを照合した。写像各値の改変、キー交換/nonce/group/ordinal/Round/model・canonical anchorと同時に偽造したalias、同値別cap、別配賦groupを拒否する。作成62/finalize66およびキー操作各62の全work境界でLimit/Cancelled/Deadlineを確認した。

[論理slot/写像合成検証記録](E2E_BEST_PRACTICE_R2_OL03_PC03_SLOT_MAPPING_SYNTHETIC_2026-10-23.md)を参照。独立oracleは写像と参照結合の試験であり、capの人手承認/全体必要量・実backendの正当性を検証したものではない。未導出5項目はUnknown、finalizeは依然Infallibleを成功値とする発行不能の契約である。
