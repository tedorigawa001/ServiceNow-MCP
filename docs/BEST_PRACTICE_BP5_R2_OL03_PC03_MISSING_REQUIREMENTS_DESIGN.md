# BP-5 R-2 OL-03 PC-03：未導出5項目の必要量・所有・寿命の詳細設計

Version: draft-0.1 / Date: 2026-10-24 / Source baseline: `6a451f3` / Status: 設計案のみ。5項目はUnknown、完成parts発行不能、全体受付無効

## 1. 範囲と現状

[PC-03 parts設計](BEST_PRACTICE_BP5_R2_OL03_PC03_PARTS_ALLOCATION_DESIGN.md) §2・§12の残課題を具体化する。費目ID・型名・式・phaseは本書の案であり、実装済みの契約や承認値ではない。必要量の導出、承認capとの比較、実強制、parts発行を別の責務とする。

現在の[ScanPartsDraft](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/draft.rs)は、外側owner・管理allocation・bootstrap bytes/work/liveをUnknownだけで保持する。finalizeの成功型はInfallibleで、必ず停止する。非実行mapの53値と論理キーは全体必要量の証明ではない。今回もこの実装を変更しない。

本番cap投入・完成parts発行・全体受付・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行を行わない。telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable/gate92、DER/absence停止を維持する。本書に数値cap・新しい実行入口は設けない。

## 2. 単位・集約方法と必要な内訳

| 未導出dimension | 必要量の意味（案） | 集約方法／禁止する代用 |
|---|---|---|
| 外側owner | inspection全体でscan会計外が所有するresourceの同時最大数。held・record・topology・一時取得を種類別に保持 | 成功／拒否／解放経路のpeak。scan peak5、Rc参照数、OS FD総数と同一視しない |
| 管理allocation | 固定制御・宣言・profile・観測等の管理領域。確保試行数・累積要求bytes・同時保持bytes・最大単発要求を別々に保持 | allocator/対象ABI・container capacityをモデル化。allocation件数やsize_ofだけで全メモリ上界にしない |
| bootstrap bytes | 限定準備区間内の実readに必要な累積成功bytesと未使用I/O予約の必要枠 | 同じreadの再読は別費用、同bufferの再hash/decodeはread費用でない。scan payloadから枠を転用しない |
| bootstrap work | 限定準備の既存work課金と追加収集・検査・発行等の上界 | 課金点ごとに一度。既存18/45/89/132の単純和、実測delta控除で代替しない |
| bootstrap live | 限定準備中の全resource ownerと取得前live予約の同時最大数 | 外側ownerとscan準備を含む集合のpeak。外側owner peakとの加算で全体peakを捏造しない |

管理allocationの旧40項目比較にある1 scalarは単位・coverageの実証ではない。上記内訳を1 scalarへ詰める変換は定義しない。次版の完全性契約では独立dimensionへ分離するか、全内訳の比較証拠を内部に保持するかを別途承認する。決まるまではUnknown。外側ownerにも種類別内訳を保持し、実backendが1 ownerを複数FDへ展開する場合は別のFD対応モデルを要求する。

[管理allocation複合契約・bootstrap境界draft-0.1](BEST_PRACTICE_BP5_R2_OL03_PC03_MANAGEMENT_BOOTSTRAP_CONTRACT.md)で、4軸を独立比較する次版契約案、carry-in/out・growの旧新重複、B4/S0・BX境界と初回MA-01合成計算器の範囲を具体化した。旧scalar契約は変更せず、実layout/保護projection/完全性/運用承認は未対応のままとする。

`bytes`（I/O成功量）、`requested allocation bytes`（確保要求）、`live allocation bytes`（同時保持）、`work unit`、`resource owner`、`OS FD`は別単位である。枠の振替を禁止する。RSS・allocatorの実消費・カーネル内部量・OS呼出しのhard停止は本モデルだけでは保証しない。

## 3. phase・寿命・受付境界

PC-04で安定した外側receipt ownerとInitial継続を設計する前提で、次の境界を採る案とする。現在の値移動producerへそのまま挿入できるとはしない。

| phase | 開始／終了 | 保持・解放の要点 |
|---|---|---|
| B0 | 元inspection開始→準備に必要な固定cap/model/clock確認 | 元origin/startedを固定。前提情報の取得も費目に含め、事前に無償取得しない |
| B1 | receipt/context・held系列の確保→Initial BeforeScan相当のrecord厳密検証 | hash-first・元bytesを保持。既存6回のうち1回を移す設計で、7回目にしない |
| B2 | Initialの予定index decode→同scope内の意味検査・count-only統計・estimate | 4回目decode/再profile禁止。統計一時配列は解放しても宣言・estimateの借用先は保持 |
| B3 | 保護projection→5項目／全体必要量比較・非実行Draft／将来のparts証拠検査 | Rc group/key4個、map/claim、検査用一時量・失敗prefixも含める |
| B4 | Policy→Slots・公開前checkpoint→session開始直前 | 将来の完全性検査・移譲準備費まで含む。現時点は到達不能でUnknown |
| S0以降 | session開始・configure→Initial kernel→後続2round→固定release | bootstrap対象外だが、持ち越す領域は全体管理量から消さない。後続fresh scope・3decodeを維持 |
| BX | B0〜B4の任意拒否→固定discard・最終checkpoint | 通常準備を停止し解放は実施。先行理由とcleanup未確認を別々に保持 |

bootstrap区間はB0〜B4と、その任意失敗で生じるBX。成功後のconfigure等を無償にするのではなく全体other/管理量が所有する。B4の正確なcallee境界と費目移管はPC-04/PC-05で承認するまで仮定である。

寿命の関係：

```text
固定cap・receipt/context owner  B0/B1 ───────────────────── 固定release
record raw bytes               B1 ───再検証に必要な保持/再読責務─── release
Initial宣言・scope              B2 ───────── Initial ack/末尾checkpoint
統計用一時配列                 B2 [確保・使用・解放]
profile→estimate→view/Draft     B2 ── B3/B4 ── 借用を閉じInitialへ一度消費
group/key identity              B3 ── Draft破棄／将来のparts所有者へ移動
実scan source                   将来Slotsで生成 ───── 固定順で一度解放
```

この図は存在期間の案であり、新しい実sourceを生成しない。borrow先より先にownerをdrop/moveしない。自己参照、unsafeでの寿命延長、clone/reparseでの回避を禁止する。異なるprofile/roundの一時配列が重ならない主張は、固定calleeのdrop位置とcompile-fail/イベント列で確認して初めて採用する。

## 4. 費目所有表

各イベントには「論理owner・phase・単位・発行元・取得/予約/移動/解放」のタグを一つ付ける。表の重なりは同一イベントを二度課金する意味ではなく、独立dimensionへの射影である。

| ID（案） | 対象と一次所有者 | 必要な統計／寿命 | 帰属 |
|---|---|---|---|
| O-H | 保持leaf・root/anchor・record/topology resource：固定外側owner | canonical origin別のacquire/reserve/release、alias/借用区別、失敗時残存 | 外側owner全体、B中はbootstrap live |
| O-T | 再解決・record再読・clock/metadataの一時resource：各固定source | 操作ごとの最大同時所有、途中取得と解放未確認 | 外側owner。借用を新規所有として加えない |
| A-F | budget/bridge/session/結果owner・claim・Draft/map：各発行module | 固定領域のlayout・Rcのallocation identity/参照・移動/解放 | 管理allocation。Rc cloneは新規allocationでない |
| A-K | 論理group1＋nonce3：Draft固定発行module | 4回の確保要求・同時保持、途中取消/失敗prefix、最終参照drop | 管理allocation。4という件数をbyte上界にしない |
| A-J | record/index raw・JSON木・文字列/container：読取/厳密parser | raw長、decoded長、node/容量・一時grow、parse拒否prefix | 管理allocation。raw readは別途B-Rへ一度帰属 |
| A-P | profile統計用配列・child一覧等：固定収集module | 要素数・実capacity上限・旧新buffer重なり・解放位置 | 管理allocation、B2分と将来round分を区別 |
| A-S | collector/path/snapshot/Observation：固定collector | shape由来配列・buffer・保持期間、AfterScan前後の破棄 | 全体管理allocation。B外ならbootstrapに混ぜない |
| B-R | B0〜B4のrecord/index/target等read：元I/O台帳と固定source | 成功n bytes・EOF・短読取/EINTR・予約/返却・再読回数 | bootstrap bytes。A/Bと重複しない実操作IDを付ける |
| B-WI | Initial indexのhash/decode/意味検査：index子phase | 同一roundのimmutable宣言、完了phaseと未実施phase | bootstrap workのI射影。全体Iへ一度だけ帰属 |
| B-WR | 初回record厳密検証：record検証器 | 同raw/pins/context、groups、JSON shape/収集・guard | bootstrap workのR射影。6検証のうち対応分 |
| B-WO | 認証/clock/統計/算術/guard/証拠/Draft/境界：固定callee | 実work呼出し、固定費・可変費・拒否prefix | bootstrap workのO射影。Sの未開始処理を実施済みにしない |
| X-D | 準備失敗/全体終了のdiscard：固定release/各RAII owner | 最大解放試行数・予約・最終参照drop・未確認診断の保持 | 該当管理量/live/work。work失敗で解放を省かない |

O-H/O-Tは実backend未接続のため数値化未完。A-J/A-P/A-Sはaccepted成功shapeだけで不正入力prefixを覆わず、byte/depth/container制限とallocation前検査を別に要求する。B0の認証を済んだboolとして入力し、その費目を消してはいけない。

## 5. 上界の導出方式（未計数・未承認）

合法な成功/拒否/中断のイベント列をtraceとする。資源の取得と予約は、実処理より前に枠を確認する。move/borrow/Rc cloneはallocation identityを増やさず、新しい確保・resource取得だけを加える。

```text
outer_peak = max_trace,t |外側が所有中 ∪ 取得前予約中のresource identity|
bootstrap_live = max_trace,t∈B |全体が所有中 ∪ 取得前予約中のresource identity|
management = (allocation_attempts, cumulative_requested_bytes,
              peak_live_requested_bytes, maximum_single_request)
bootstrap_read_need = max_trace,t∈B (successful_bytes_B(t) + outstanding_IO_reservations_B(t))
bootstrap_work_need = max_trace (work_B0..B4_or_BX)
```

peakの集合は種類別内訳付き。cleanup未確認のresourceを「closeを試した」だけで減らさない。取得失敗でhandleなしと確定した未使用予約だけを返し、試行/retry/spentは返さない。未確認resourceのまま後続取得を続けず停止する。外側peak＋scan peakは同時性未証明の保守的上界にしかならず、正確なpeakとは呼ばない。

managementの累積量はroundの回数分を含み、同時量は寿命の重なりで求める。Vec/Stringのcapacity、grow中の旧新buffer、Rc制御領域・alignment、parser内部一時量を除外しない。対象toolchain/ABI/library/allocatorモデルを固定し、実装を変更したらモデルを再検証する。Rc::newのOOMを現実装が型付きLimitで捕捉できるとはしない。モデル化不能ならUnknown。

bootstrap bytesは元payload台帳に属する同じreadの部分集合で、追加の満額予算ではない。全体ではA/B・全record再読・3scan・EOF等を実操作別に一度だけ覆う。spent_Bを返却せず、残予定量は完了phaseの証拠で除外する。bootstrap workも全体I/R/Oの射影であり、全体式へさらに足さない。実済みdeltaを安全上界から引かない。

不正入力の初回受付はaccepted shapeの値がまだないため、事前の有限BootstrapCaps/構造上限・allocation前検査・元budgetで制限する。検査後に得るprofileを、検査前の無制限なread/確保の許可に使う循環を禁止する。capが未承認なら開始しない。今回そのcapは投入しない。

## 6. 保護された導出元と証拠発行

必要量の型案は`OuterOwnerRequirement`、`ManagementRequirement`、`BootstrapRequirement`。全field private・非Clone/Copy/serde・固定opaque Debugとし、raw配列/summary/passed boolから発行しない。これらは設計上の名前で、今回型を追加しない。

| 導出元 | 発行に必要な前提 | 未接続のためUnknownとなる点 |
|---|---|---|
| 固定owner/sourceの所有権topology | 同held/record/topology系列・取得/予約/終端契約・backend model | 外側実resource種類/FD対応、全拒否prefixと一時所有 |
| hash-firstで受理した同record bytesのprofile | 同pins/context/groups/registry、同origin/started、既存recordモデル | trusted producer・B1への責務移管、初回受付上界 |
| Initialの同declaration/ScanInputs/profile/estimate | 同receipt/lineage/index bytes/scope/token、未開始claim、元retry残 | PC-04の安定owner/継続、全管理領域モデル |
| 固定phase/費目registryとchecked計算器 | 同build/model bundle・課金点/許可名/上限版、実施済みphase証拠 | B0〜B4/BXの完全coverage、その他費目の独立計数 |

証拠は同receipt owner/世代/target/context、budget origin/started/期限・元claim、Initial scope/profile/estimate、cap owner/revision/model bundleへ実borrow/型付きidentityで結ぶ。同値hash/summaryや同じslot番号だけでは代替しない。後続roundはfresh tokenを要求し、Initial tokenを使い回さない。

発行は元budget側one-shot claimを最初のfallible処理より前に消費する案。claimを増やす場所・費用・状態表は実装前に別レビューする。その状態表では、必要量証拠の発行/消費が始まった後の状態（未開始以外）を`SharedBudget::stop`がbridge claimへ失敗を記録する条件へ必ず含める。含めないと、発行開始後の取消/期限/work不足が同budgetのsticky `failed`には残っても、claimを保持する証拠・Draft側からは見えない。準備（`55cdf64`）・証拠段階（`6dae716`）・配賦（`096e06a`）で同じ漏れを修正しており、各状態について「遷移後の停止がclaimへ記録され、先行理由を上書きしない」回帰試験を併せて追加する。各証拠は一度だけ完全性検査器に渡し、別budget/別owner提示では双方を停止する。失敗/Drop/forgetで再発行しない。部分導出成功をUnknown→Verified setterでDraftへ注入しない。

全5項目の内訳・全体payload/work/列挙bytes等・実承認cap/clock/モデルのcoverageが揃い、比較・元残枠・実強制可能性を確認して初めて`CompleteRequirementEvidence`を設計できる。5 scalarの値があるだけでは発行しない。PC-01模擬Witness/旧40比較を完成証拠へ読み替えない。

## 7. 失敗分類・解放・診断

| 条件 | 理由案と扱い |
|---|---|
| 費目/単位/係数/issuer/backend/承認が不明、coverage不足 | Unavailable。未導出はUnknownのまま。代替値/余裕値で進めない |
| 別receipt/budget/scope/owner、二重発行/消費、phase逆行 | Binding。元claimと提示budgetを停止し、先行理由を保持 |
| checked算術overflow、構造/確保前/累積/peakの上限不足 | Limit。飽和/切詰め/別dimensionの枠で救済しない |
| cap失効、元record/metadata等の変更 | Expiredまたは元のChanged/HashMismatch等を保持 |
| Deadline/Cancelled/既存sticky failure | 元理由で後続発行/取得を止め、固定discardと最終checkpointへ |

生成前/供給拒否は既存InputRejectedの位置と第一理由を保持し、開始後はOuter診断を保持する。新substageの具体enum/費用は未確定。cleanup未確認は主理由を上書きせず別に伝える。borrowを内側から閉じ、固定所有者がscan source→未移譲値→record→topology→held→receiptの責務に整合して一度だけ処分する。NotReachedは解放確認済みではない。公開summaryにraw bytes/コード/path/pointer/資格情報/承認者情報を出さない。

## 8. 独立検証条件（今後実施、今回は未実施）

oracleはproduction計算器の係数表・offset・集約helperを再利用しない。少数の非対称fixtureについて人が追える明示イベント列/寿命区間とliteral期待値から、別の計数器で比較する。テスト専用observerで実課金点を計測する場合も、oracleへproductionの推定値を入力しない。

| 群 | 必須条件 |
|---|---|
| 所有/寿命 | 同時に重なる場合と重ならない場合、move/borrow/Rc clone、途中取得、二重解放・解放未確認、3slot非alias。最大値の単純和が誤るfixtureを含める |
| allocation | group/key4確保・途中失敗、Vec growの旧新重複・capacity余剰、空/上限/1超過・巨大文字列/escape・不正JSON、最終Rc参照drop。件数とbytesを別採点 |
| bytes | 同buffer再hashは0 read、実再読は再計上、EOF/短読取/EINTR・予約返却、A/Bとrecord/scanの重複排除、停止後の遅延結果も元台帳の規則を保持 |
| work | 各B phaseと拒否/取消prefix、収集/算術/guard/表示されないdiscard、実課金総和と費目別和の一致。bootstrap分を全体式へ二重加算しない |
| binding | 同値別owner/bytes/cap、別budget/started/profile/receipt/slot/model、期限/世代変更、重複生成/消費・失敗後再開・Drop/forgetを拒否。必要量証拠の発行/消費開始後の停止がbridge claimへ記録され、claim保持側から見えることを状態ごとに確認 |
| 受付 | 等号・1不足・overflow・未導出項・未知単位/モデル、B0以前の無制限取得拒否、全体payload/work残必要量不足。scan/cap発行に到達しない |
| 感度 | owner寿命を1区間短縮、allocation grow旧buffer/キー確保を1つ除外、read/guardを1つ落とす、bootstrapを二重加算する変異で対応テストが失敗する |
| 静的境界 | 同scope外持出し/borrow先move、Clone/serde/summaryから再構築を拒否。private名が見えないだけの失敗を寿命証明に数えない |

成功traceだけでなく全fallible入口前後と各上限境界へLimit/Deadline/Cancelled/取得失敗を注入する。primary failure・cleanup診断・live/予約・一度限り解放を照合する。実elapsed/RSSの測定値は補助情報で、上界証明やcap承認の代わりにしない。OS未接続の合成試験から実FD数/実allocator量を保証しない。

## 9. 実装に進む前の決定順・承認待ち

1. **費目所有/単位/phase境界をレビュー**：本表とPC-04のP0〜P6を整合させ、同じ処理を複数phaseへ置かない。管理allocationの複合dimension契約・backend/allocator対象を決める。
2. **非実行の必要量モデルから実装**：保護されたshape/所有イベントへの結合、純粋checked計算器、独立oracle。部分結果は非実行型に留め、Unknownやfinalizeを変更しない。
3. **PC-04の安定owner/Initial継続を設計・検証**：3decode/6record検証・同estimateを維持し、費目の責務移管・借用・途中失敗の解放を確認する。
4. **完全性証拠/実強制/完成partsの次版契約を設計**：承認cap・clock/失効、全体payload/work/管理量とモデルcoverage、Policy→Slots・configure/attachの結合を別レビューする。

未承認：全数値cap/責任者・承認原票、cap失効/配備手順、外側backendとFD対応、allocator/ABI/parse容量モデル、BootstrapCaps強制、完全性issuer、全体work予約/独立resource受付。これらが揃うまで完成parts発行・実移譲・通常strict接続・全体受付を有効にしない。

今回の文書確認はリンク/整合/差分の検査だけであり、上記oracle・数値上界・実OSの検証を実施した記録ではない。
