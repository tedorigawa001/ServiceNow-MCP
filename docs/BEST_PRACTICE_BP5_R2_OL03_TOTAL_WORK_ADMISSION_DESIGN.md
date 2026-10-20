# BP-5 R-2 OL-03：record・scanを含む全体work上界と事前受付

Version: draft-0.5 / Date: 2026-10-20 / Status: record opt-in・index子phase・scan純粋計算器を合成検証。全体受付・collector・other上界・運用承認は未対応。

## 1. 範囲と停止状態

[同round宣言・indexモデル設計](BEST_PRACTICE_BP5_R2_OL03_ROUND_DECLARATION_WORK_DESIGN.md)を引き継ぐ。indexの固定ID `bp5-r2-index-work-0.1`、上界式、3 decode・6 record検証・3 closure scan、scan前後の厳密再検証を維持する。本書は新しい外部仕様の調査ではなく、リポジトリ内の課金点に基づく設計案である。

telemetry調査は保留。初稿は設計のみで、後続§10でrecord側の内部モデルだけを実装した。実機操作、API実接続、token発行、設定変更、permit発行、Pushは本工程に含めない。APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。受付成功を実行permitや署名検証の成功に読み替えない。

全体上界は**共有Budget::workへの課金量**を対象とする。CPU命令数・wall time・RSS・OS処理時間の上界ではない。現在の `json_work` というフィールド名を理由にJSON以外の費目を除外しない。一方、checkpointや別台帳だけの処理を、既にwork課金済みと扱わない。

## 2. 照合した実装と費目の所有者

| 部品 | 現在の課金／検査 | 全体モデルの費目 |
|---|---|---|
| [json/shared.rs](../native/r2-outer/src/json/shared.rs) | node・key・text・container挿入・input chunk・typed guard | record JSONはR、index JSONはI |
| [record_validation.rs](../native/r2-outer/src/record_validation.rs)、[ledger_v2.rs](../native/r2-outer/src/ledger_v2.rs)、[signature_policy.rs](../native/r2-outer/src/signature_policy.rs) | hash-first、activation/groups、registry policy、ledger binding/timeのstep | R |
| [strict.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict.rs) | record projectionの2 work、Node検索、固定3round | projectionはR、Node検索は既存I |
| [records.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records.rs) | exact再読・path再解決・clockはtopology/I/Oとcheckpoint。pin hashはcheckpointのみ | work増設なしなら課金分0、独立resource台帳は必須。将来増設分はO |
| [ClosureSource](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict.rs) | 実collector未接続。各操作を同budgetへ課金する内部契約のみ | S。未確定を0にしない |
| [capture.rs](../native/r2-outer/src/signature_boundary/positioned_read/capture.rs)、metadata・topology | target A/B、物理parser、M0〜M4、祖先再照合。workと別台帳の境界を今後全列挙 | O。現状を全CPU課金済みとしない |

indexの意味検査内にあるobserved挿入／比較はIが所有する。collectorで観測値を作る処理はSが所有する。異なる実処理なので双方を計上するが、同じwork呼出しを双方へ二重計上しない。

## 3. model契約と信頼するshape

全体用の候補IDは `bp5-r2-total-work-0.1` とする（未実装・未承認）。固定内部registryにindex/record/scan/otherのサブモデルID・費目所有表・係数・上限・phase順序を結合する。ID文字列だけ一致すればよい設計にはしない。未知／旧版混在／係数・課金点の改変はUnavailableで停止し、fallbackしない。indexモデル自体のIDをこの設計だけで変更しない。

record profileは初回のhash-first strict検証が受け付けた**同じimmutable bytes**と、同registry・全groups/context・receipt/target/sessionへ結合する。raw長・digestだけの一致や、利用者提供の統計は不十分。registryとgroupsの保護されたproducerは未接続であり、合成contextを運用上の証拠へ昇格しない。

profileはprivate・非Clone・非serde。record treeの再利用権を持たず、以降も6回のdecode/意味検査を行う。後続roundでは元pins/contextへの結合を検査する。費目profileだけをsession内で保持し、round専用index treeを別roundへ持ち越さない。copy summaryは表示・比較用で、受付の入力にはしない。

## 4. record側の上界導出案

### 4.1 JSON decode

accepted raw x（activation A、ledger L、registry G）について、初回strict decodeと同じvisitorで次を収集する案とする。統計取得のための未課金の再parseはしない。

| 記号 | 意味 |
|---|---|
| Bx / Cx | raw byte長／ceil(Bx/65536)。各recordは1〜65536 bytes |
| Vx | 値node数。root・containerも含み、object keyは含めない |
| Kx / Qx | 全object key数／全arrayの要素挿入数 |
| Tx | 全keyと文字列値のtext課金和。各文字列についてmax(1, ceil(decoded UTF-8長/65536))を加算 |
| g / p | 固定contextのgroups要素数／accepted registryのpolicy数（2〜32） |

```text
Jx = Cx + Vx + 2Kx + Tx + Qx + 1
Hx = 2 + 2Cx
R_kernel = JA + JL + JG + HA + HL + HG + g + p + 19
```

Jの2KはKeySeedとobject挿入で、key textはTへ含める。array挿入はQ、typed変換前guardは最後の1。raw空白・escapeはB/Cとdecoded textへ反映する。Hはhash_recordの開始・終了2とchunk前後2Cxで、I/Oではない。

固定19のソース上の候補内訳は、activationのvalidate前後2＋time前後2＋終端1、registryのvalidate前後2、ledgerのvalidate前後2＋time前後2＋2 role bindingの前後4＋終端1、三者validate終端1、strict projection前後2である。groupsループgとpolicyループpは別。registryのentitlement辞書検査やrole探索等の内部CPUをこのstep数で保証しない。

これは現行のaccepted成功経路の課金点から導出した**未計数検証の式**。新profile収集・guard・上界算術の費用は含まれていない。全6回分は `6×R_kernel + U_record_profile + U_record_reuse_guards` とし、収集を各decodeで行うならその回数分を加える。現時点で固定余裕値を捏造しない。実装時に各費用を導出して有限値を固定するまで受付不可とする。

不正JSONや途中拒否の解析にaccepted shape式を適用しない。初回は元予算のbyte/depth/container上限で停止する。以降のrawはexact再読一致が前提だが、意味検査の期限・取消・失敗prefixも計数する。gの運用上限が未確定なら受付不可。groupsの重複も実際にループする回数に含める。

## 5. scan側とother側の上界契約

### 5.1 scan profile（実collectorの前提）

Sは平均件数・実行済みscanのdelta・宣言にあるfile数だけから推定しない。固定backendモデルが、次の**試行回数を含む最大値**とwork係数を供給する。

- directory列挙entry／name bytes、open・stat・ACL・xattr・filesystem照会・close等の各操作数。
- 全fileのhash/read chunk数、成功bytes、EOF probe、短読取・EINTR・再試行の回数。ceil(size/chunk)は短読取を許すread試行数の上界ではない。
- 祖先/path再照合・前後metadataの回数、変換／観測entry生成、拒否する余剰entryを1件検出するまでのprefix。
- root/index自身を含む対象範囲、FDピーク・allocation・解放処理、および観測を返す前の制限。

```text
U_scan_round = Kscan + Σ(coefficient[k] × maximum_attempts[k])
U_scan_all   = Uscan_initial + Uscan_before_M4 + Uscan_after_M4
```

係数表・最大値の全項が証明済みの場合だけ数値化する。collectorがworkを呼ばずに巨大Vecを返してから比較する経路は受け付けない。宣言外fileが巨大／多数でも、読む前・割り当て前・挿入前にbounded拒否できることを要求する。backend固有のretry上限がない場合や未解決のsymlink/namespace挙動はUnavailableで停止する。

現行index modelはobserved上限100,001を使う。N+1拒否を将来実装する場合、collector側とindex actual-map挿入前の双方で強制し、indexモデルIDと計数試験も更新する。本書のSだけをN+1へ縮めて既存Iと矛盾させない。3scanは毎回新しい観測を作り、前round成功を再利用しない。

### 5.2 other profile

Oを「その他の余裕1000」のような任意marginにしない。初期pins/contextの検査、record再読とclock、target preflight/A/B・parser、M0〜M4と祖先/path、profile収集・受付計算・phase台帳・guard、drop/cleanupを列挙し、各work呼出しに所有者を1つだけ付ける。現在checkpointのみの処理は課金分0と明記し、独立上限の未解決を0で隠さない。

read/metadata/topology/解放を新しくwork課金する場合は、実装と同時にtotal/submodelと上界試験を更新する。事前に課金済みと仮定しない。cleanupはsticky failureの後でも必須の解放を行う必要があるため、通常のworkが失敗すればdropを省略できる設計は禁止。解放回数・予約済みresource・外側hostの強制終了設計を別途結合する。work予約だけでは解放完了を証明しない。

## 6. 全体式と受付のタイミング

```text
U_total = 3×U_index_round
        + 6×R_kernel + U_record_profile + U_record_reuse_guards
        + U_scan_all + U_other
```

すべてu64相当のchecked加算・乗算で計算する。固定費・最大拒否prefix・受付自身の費用を含め、未知項を0に置かない。モデル不明はUnavailable、overflow/上限不適合はLimit。index枠だけで100万を超える既存の架空例はここでも拒否する。N+1等の未実装最適化・未承認cap増額を受付条件へ先取りしない。

### 6.1 二段階とphase台帳

1. **bootstrap**：元budgetのままreceipt/hash/context、初回record strict、初回index decode/意味検査・profile作成を行う。work収集も課金し、枯渇ならscanへ進まない。
2. **初回scan直前**：index round途中を表す固定phase境界で全体残工程を計算する。後続§11でReady境界とindex残予定量を実装したが、全体受付hookは未接続。受付のために初回decodeを増やさない。
3. **残予約確定**：最後の算術・guardまで課金した後、元checkpointと残量を再確認して単一budgetへ予約する。profile/計算途中の取消や遅延成功は捨てる。

indexの初回roundは途中まで実施済みなので、`3×U_index_round - W_used` を残量にしない。indexをhash/decode/shape/declare、scan後集合照合、最終再認証等の固定子phaseへ分解し、既存全体上界以上にならない所有表を導出する。このindex分解は後続§11で実装・合成検証したが、record/scan/otherを合算する全体受付は未対応である。

台帳はsession/budget origin、同receipt/context、全submodel、Initial/BeforeM4/AfterM4＋子phase、完了済み固定phase集合を封じ込める。単調な一方向遷移だけを許し、skip/retry/二重完了/別round planの流用は拒否する。完了phaseの**上界**を残予定から除外し、その実消費はspentに残す。途中phaseの実測deltaを上界から恣意的に引かず、境界外なら停止する。

### 6.2 単一work台帳の予約案

`spent + reserved_other + remaining_plan <= 1,000,000` を要求し、等号は許す。受付計算自身もOのphaseとする。既存のSharedBudget.reservedは**I/O bytes用**でありwork予約に流用しない。将来追加するwork予約は別の型・単位で保持する。

予約の二重計上を避け、phase実行では自身の残予約からnを減らしspentへnを加える。費目外work、予定量超過、別planの予約消費はLimitで即停止。完了時の未使用枠だけを解除し、spentを返却しない。未開始phaseの予約解除を理由に新しいscan/retryを開始しない。

現行Budget::workはspentだけを増やし、work予約を扱わない。将来の接続では同じorigin/start/first failureを維持した唯一の課金入口でphase消費を検査する必要がある。別budget、隠れた直書き、round毎のcap再作成は禁止。予約量やsummaryだけから実行authorityは得られない。

## 7. 独立resource受付と失敗時停止

workだけでは受付しない。元10秒の共有期限、全成功read bytesの2GiB、topology 16,384、metadata/name/EINTR・FD・管理allocation・解放予定量について、別々の残上界と所有者が必要。short read/EOF/再読6cycle/scan3回/A・Bを重複なく全て含め、単位間の振替を禁止する。OS呼出しのhard停止やRSSは依然未証明で、外側host/監督の停止保証を代替しない。

Deadline/Cancelled/Expired/既存sticky failureを維持する。work不足でBindingへ畳まない。profile結合不一致は既存のBinding/Changed、未知model/未対応sourceはUnavailableへ有限分類する。未知項があればscan開始前に停止し、scanの途中で別モデルへ切り替えない。全resourceと未使用予約を解放し、guardで成功へ戻さない。cleanupで新しい失敗が起きても最初の理由を上書きせず、解放未完了は外側の終了報告へ別に伝える設計を要求する。

## 8. 合成検証の受入条件（未実施）

| 試験群 | 必須の確認 |
|---|---|
| record式 | visitor node/key/text/array/chunk、gとp、entitlement辞書・escape・空白の境界、固定19の各step、収集/guard分の別計上。6検証を維持 |
| scan式 | 最小〜上限shape、余剰・巨大file・symlink拒否、短読取1 byte/EINTR上限、全operationと解放。各成功／拒否prefixが上界以下 |
| 全体式 | index/record/scan/otherの所有表が各work呼出しを1回だけ覆う。1roundでなく3round全経路・全失敗phaseを計測 |
| 受付境界 | 等号成功・1不足・overflow・モデル不一致・未知費目・初回bootstrap枯渇。実施済み上界控除とspentを区別し、初回decodeを増やさない |
| 予約 | 予約外消費・二重予約・別session/context/round・phase逆行拒否。未使用解放でspentが戻らず、I/O予約と混ざらない |
| 中断 | 統計／算術／予約確定／各source前後の取消・期限、遅延成功、cleanup失敗。次scan/phase/roleへ進まない |
| 感度 | 係数を1下げる、課金点を1つ外す、phaseを二重控除する変異で対応試験が失敗。平均時間ベンチマークで代用しない |

## 9. 未確認事項・対応順・承認待ち

1. record shape/profileの取得費、groups上限、固定19と全prefixの独立計数検証。registry/contextの保護されたproducer。
2. indexの固定128を子phaseへ分解する証明と、初回scan直前の受付hook。§11でindex分解・互換性とReady境界は先行検証した。全体受付hookへの接続は残る。
3. 実collectorの方式、全operation・retry・余剰拒否の上界、workと別resourceの対応表。未接続のままSを数値化しない。
4. O全項、target/parserの共有予算範囲、解放の有限性、work予約を既存入口へ一元接続する方法。
5. 全体modelの係数・100万capの妥当性と独立resource受付の承認。必要なら別提案で最適化／cap再承認を行い、今回黙って緩和しない。

本書の式・候補ID・試験計画は全体実装完了や実閉包の受付可能性を意味しない。上記が揃うまで全体事前受付は無効、停止状態を維持する。

## 10. recordモデルの先行実装（内部opt-in）

[record workモデル](../native/r2-outer/src/record_validation/work_model.rs)と[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_RECORD_WORK_MODEL_SYNTHETIC_2026-10-20.md)を追加した。§4の未計数だった式を先行検証する段階であり、§6の全体受付・予約・strict pipelineへの自動接続は変更していない。

- 固定IDは `bp5-r2-record-work-0.1`。groupsは**内部モデル固有の最大1,024要素**とし、重複も全て課金する。OSの上限・運用承認済み値という意味ではない。1,025以上は初回guardの1 workだけを消費して、hash/decode前にLimitで停止する。空groupsは既存の所属不一致Binding。既存の通常validate/activation経路のgroups契約は変更しない。
- JSON visitorのopt-inでB/V/K/T/Qとtextイベント数を同じdecode中に収集する。統計用reparseはない。typed変換まで成功したshapeだけを渡し、三者の意味検査が完了して初めてsealed profileを返す。通常decodeとindex経路はopt-inしないため課金式を変えない。
- `E = Σ(Vx + Kx + text_events_x + Qx)` が収集可変費。textの課金量Tとイベント回数は分離する（text長が大きい場合でも、統計counter更新は1イベント1 work）。初期化・公開は各JSONで2 work。groups guard1＋三つのJSON固定6＋モデル計算5の固定費は**12 work**。
- `R_kernel = Σ(Jx+Hx)+g+p+19` を計数した。通常のpure validate内の固定は17、既存strict callerのprojection2を含めて19。`R_profiled = R_kernel + E + 12`、全6回を毎回profile付きで実施する保守的モデルは `6×R_profiled`。profile関数自身はprojectionを実施しないので、実消費はR_profiledより2少ない。scalar上界を読んでもprojection検査が済んだことにはしない。
- 元raw三者・同じPins object・同じContext objectをborrowしたprivate非Clone/非serde profileに結合する。追加のmodel/input guardは**1 work/呼出し**で、上の通常費用の外へ別計上する。別allocationの同bytes、別Pins/Context、未知modelを拒否する。これは純粋なborrow結合で、budget origin/session/roundへの運用結合・信頼済みcontext producerは未接続。将来受付時にそれらを追加し、別budgetでも使える汎用guardをauthorityと誤認しない。
- 共有予算へのopt-in bridgeは元start/originとspentを保ち、I/O予約・metadata/topology台帳を変更しない。Budget失敗は元理由、groups/算術上限はLimitへラッチする。通常strict pipelineは従来のbridgeを使い、profile付き経路へまだ切り替えていない。

今回のモデルはprofileを毎回作る。初回だけ収集して後続は再利用する最適化ではないため、§4の一般式を適用する場合は `U_record_profile=6×(E+12)` として数える。追加require guardを使うならその回数も別に加える。§9のgroups数値候補・固定費計数の一部は解消したが、子phase/collector/other/予約・独立resource・運用承認は引き続き未完了。全体gateを解除しない。

## 11. index子phaseの先行接続

[同round設計draft-0.8 §14](BEST_PRACTICE_BP5_R2_OL03_ROUND_DECLARATION_WORK_DESIGN.md#14-index上界の子phase分解とscan直前境界)で§6.1のindex部分を先行実装した。PreScan/AfterScan/FinalIndexの和を既存index上界と一致させ、初回scan直前は2将来round＋後続2phaseだけを残す。既存synthetic strict pipelineのNode照合・scan後照合・最終再検証をこの一方向planで接続し、別budget/別scope・二重完了を拒否する。

record projection4/roundはRが所有する。旧index互換テストの固定45を実際の純index41と区別し、固定128との差87は最終子phaseの上界枠へ残す。追加のphase制御8/round（全24）と任意snapshot4/回はU_otherの別費目とする。旧index ID・全体式・capは維持し、未実施費目をspentから引く口・予約は追加しない。

§9のindex子phase分解の一部は解消したが、全体受付・各resource残上界・予約台帳・実source接続は未対応。record profileは引き続き通常pipelineへ未接続で、scan/otherの未知項は0にしない。運用gate・telemetry保留を維持する。

## 12. scan上界・bounded collectorの詳細設計

[scan詳細設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md)へ、全entry/rootの2回全path解決、逐次名前照合と余剰entryのopen前拒否、短読取停止・元共有EINTR残8、snapshot/解放を含む操作数・work式候補を整理した。cleanupはacquire前prechargeと一度限りのownerへ結合する案とし、元spentを返さない。

既存target用metadata100回/640KiBやtopology16,384をscanへ黙って流用・増額しない。単発native列挙・係数計数・scan専用quota/配賦・管理allocation/FD/cleanup方式が未確定なら開始前にUnavailableとする。設計のみで、実装・全体受付・native接続・permitは有効化しない。

後続の[scan詳細設計draft-0.2 §11](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#11-純粋な計算器の先行実装collector未接続)で数量計算器のみを先行実装した。計算自体12 work・追加guard1・数量cap helper2はU_otherの別費目である。係数16/18はcollector未計数の候補値、shapeは運用証拠ではない。全体受付・予約・実sourceへ接続せず、未知quotaと大規模shapeの100万超過を解消済みと扱わない。
