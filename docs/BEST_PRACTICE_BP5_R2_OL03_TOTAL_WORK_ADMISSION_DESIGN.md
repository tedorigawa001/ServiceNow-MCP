# BP-5 R-2 OL-03：record・scanを含む全体work上界と事前受付

Version: draft-0.30 / Date: 2026-10-23 / Status: Context/Records/HeldSourcesと独立ScanSlots片まで合成実装。PolicyCapsのcap/profile/Initial bootstrapを後続MDで具体化（未実装/未承認）。供給証拠全体費・全体受付・統合other上界・通常strict差替えは未対応。以下の各段階の記録と現行状態を区別する。

## 1. 範囲と停止状態

[PolicyCapsEvidence詳細設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_POLICY_CAPS_EVIDENCE_DESIGN.md)で、承認cap/ModelBundle、限定bootstrap、同profile由来の必要量、ResourceInput/Quotas配賦、失敗停止を分離した。必要量のresource計算9行をcap承認と扱わず、payload/retry/外側held・管理量など未対応dimensionがあれば停止する。新規認証/保護projection/比較/移譲/保持費は未導出で、既存13/17/23候補へ固定余裕を足して全体上界にしない。

Initial既存scope/decode/profileを同継続内でpolicy検査からInitial kernelへ引き継ぐ案には、安定した外側receipt所有者とtyped prechecked引継ぎの内部API移行が必要。現行値移譲型をそのまま使えるとはしない。3decode/6record検証・shared budgetを維持する費目所有表と全体残予定量が確定するまで、capの承認だけで全体受付を有効化しない。大規模shapeのwork不足をresource capで救済せず、上限を緩めない。

[供給証拠設計draft-0.4 §13](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)の独立ScanSlots片はprepare1、取得検証4、発行4、消費4＝13 work。各4は入口1＋固定3slot guard各1で、未知のcap/動的取得費を代表しない。§8の固定候補23へこの13を単純加算せず、将来の費目所有・統合順序を再設計する。PolicyCaps→Slotsの全体順序、既存17差分・3round/3decode・6record検証、全体受付無効を維持する。[検証記録](E2E_BEST_PRACTICE_R2_OL03_SCAN_SLOTS_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

[供給証拠設計draft-0.3 §12](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)のHeldSources subsetは発行1＋消費1 workを先行計数した。合成取得dispatch1、二度の祖先/path再照合、同resourceのmetadata/ACL/xattr/FS取得とcleanupは別の取得費で、2/3を全体上界としない。K祖先の成功topology操作数は2×(3K+2)、payload読取0、共有予約/操作上限を維持する。動的work費・全体resource/cap統合は未対応で、既存17差分や通常strictの走査数は変えず全体受付を無効に保つ。[検証記録](E2E_BEST_PRACTICE_R2_OL03_HELD_SOURCES_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

[供給証拠設計draft-0.2 §11](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)の独立合成subsetで、Context/Recordsの発行各1・消費各1、計4 workを確認した。取得/初回検証のrecord/index/hash/I/O費は別であり、4を全体上界にしない。既存run_creationと17差分は未変更、合成取得内のInitial decodeを通常の3decodeへ追加していない。準備入口への接続・本番issuer・動的費/管理resourceの統合とcap承認は未対応で、全体受付は無効を維持する。[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_CONTEXT_RECORDS_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

現行接続との対応は[外側設計§14](BEST_PRACTICE_BP5_R2_OL03_OUTER_STRICT_ORCHESTRATOR_DESIGN.md)、次の保護入力・上位結果境界は[対設計draft-0.1 §8](BEST_PRACTICE_BP5_R2_OL03_PROTECTED_BRIDGE_DIAGNOSTICS_DESIGN.md)を参照する。既存coupling35＋K、新guard10候補、未確定のprotected supply/bridge claim/result owner費を分離し、旧段階の「台帳未実装」等を現行の全体受付状況と混同しない。全文の歴史的費目/状態の棚卸しと最新R/I/S/Oへの統合は未実施であり、今回上界を認証したとは扱わない。

同対設計draft-0.2 §11で内部bundle生成2 work・利用identity guard10 workを合成計数した。後者は固定releaseへdispatchしない検査subsetで、policy実内容/運用model承認・供給包装・上位結果owner費を含まない。budget初期化ごとのbridge claim用Rc allocation1個も独立管理allocationに残す。既存35＋Kと今回12だけを合計して全体受付成功とは扱わない。

同対設計draft-0.3 §12でO.result_owner=2 workを追加計数した。格納前の開始guardだけへ課金し、返却後retain/take・有限診断projection・先行理由の保持に新work/heap確保を要求しない。待機slotのRc cloneは既存claimの共有で、新規allocationではない。入力側12、coupling35＋K、既存configure1、R/I/S等との費目所有を分け、未確定のsupply/全体resource上界を0にせず、全体受付を有効化しない。

同[対設計draft-0.4 §13](BEST_PRACTICE_BP5_R2_OL03_PROTECTED_BRIDGE_DIAGNOSTICS_DESIGN.md)でO.bridge_transfer=1 workを追加し、固定releaseへの値移譲と上位ownerの同budget callerを接続した。生成2＋owner2＋利用10＋移譲1＝15は、同じ合成成功fixtureの固定release直呼びとの差分で確認した。caller内release前は13で、生成は外側に残る。供給包装・独立resource・全体R/I/S/O上界は未確定で、既存coupling35＋K/configure1へ二重計上せず、全体受付を有効化しない。

[producer生成入口詳細設計draft-0.1 §7](BEST_PRACTICE_BP5_R2_OL03_PRODUCER_CREATION_DIAGNOSTICS_DESIGN.md)では、生成前owner確保へ既存2 workを移す案と、準備の固定制御8 work候補/未確定のU_supply_dynamic・管理allocationを分離した。候補差分15＋8＋U_supply_dynamicは未計数であり、23を運用上界にしない。生成拒否prefixと部分所有状態の保持/解放費を追加検証するまで、全体受付は無効のままとする。

同設計draft-0.2 §10では部分所有値の固定数存在検査だけをO.preparation_complete=1 workとして実装した。slot2を生成前へ移し、create2・利用10・移譲1は維持し、実成功差分16を確認した。これは8段階producerの実装/上界ではなく、未知のsupply費を埋めない。将来の8候補と本1の所有関係は再導出し、無条件の二重加算を避ける。全体受付は無効を維持する。

同設計draft-0.3 §11でO.supply_entry=1 workの同budget/準備claim検査を追加し、新生成経路の差分17を合成照合した。準備flagの不可逆消費はowner確認/workより前で、停止通知/伝播は失敗後の新workを要求しない。既存Rc内のclaim状態とinline attempt（既存Rc参照5本）の保持費は独立管理resourceへ残す。8候補のentryだけを実装したもので、残るproducer費/全体R/I/S/Oを認証せず、全体受付は無効のまま維持する。

[供給証拠検査draft-0.1 §8](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)で、残りの固定7候補・証拠発行費・動的検査費・保持量を分けた。現行complete1を置換する場合の固定差分候補は17−1＋7＝23で、spent払い戻しや現行課金の変更ではない。発行/動的費が未知のまま23で受付せず、既存R/I/S/Oとの所有表を一度だけ合算する。cap承認とprofile供給/初回decodeの順序も未確定であり、全体受付は無効を維持する。

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

**現行への適用範囲**：[collector費目・work上界再設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_COLLECTOR_WORK_REDESIGN.md)に、現在の核の費目・shape・保守的上界候補と独立検証条件を分離した。以下のscan-work-0.1等は各時点の部分計算器の記録であり、現行collectorの受付上界ではない。S.sealの追加recheckを既存index子phaseへ吸収せず、Oの収集/計算/bridge費と3round resource配賦は未確定のまま維持する。

後続draft-0.3と[費目別合成検証](E2E_BEST_PRACTICE_R2_OL03_COLLECTOR_WORK_ACCOUNTING_SYNTHETIC_2026-10-20.md)で、各workの所有者と実費総和を確認した。control候補のroot最終照合漏れを訂正したが、これはtest-onlyの検証でありsealed shape/運用計算器・予約・全体受付の実装ではない。3roundの累積work/EINTR照合と、各scanで再生成されるoperation台帳の累積quota保証は区別する。

[sealed profile/計算器詳細設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_SEALED_SCAN_PROFILE_DESIGN.md)でOの収集/算術/利用guardを分離した。O.profile=`11+2N+5E+K+B+M+D` とrequire5・O.calculate=20を内部実装/合成検証済み。将来O.use=7は未実装の案である。初回bootstrapでこれらを実消費してもspentを返却せず、将来roundの分を未計上にしない。count-onlyの一時配列を解放してからscalar profileを返し、S.groupsの全費用は維持する。独立resource受付と全体work予約は有効化しない。[収集合成記録](E2E_BEST_PRACTICE_R2_OL03_SEALED_SCAN_PROFILE_SYNTHETIC_2026-10-21.md)・[計算器記録](E2E_BEST_PRACTICE_R2_OL03_SCAN_CALCULATOR_SYNTHETIC_2026-10-21.md)を参照。

[estimate bridge詳細設計draft-0.5](BEST_PRACTICE_BP5_R2_OL03_ESTIMATE_BRIDGE_DESIGN.md)で、guard7の固定collector model結合・BridgeReady→Enteredを消費する入口O.dispatch1・estimate消費型単一bridgeと前後checkpointを合成検証した。直接/二重collectを拒否し、元S1902を維持した外側collect1903・単一bridge1910・準備込み1991を確認。checkpointでwork費は増えない。3roundの同start/共有retryとAfterScan/FinalIndexも通したが、独立resource配賦・全体work予約は未対応。use21＋dispatch3＝24だけで全体受付成功とはしない。guard/入口成功はscan permitではなく、未知quota/運用producer不足を救済しない。cleanup summary保持・S.seal/Iの別費を維持し、通常strict・運用受付は接続しない。[入口記録](E2E_BEST_PRACTICE_R2_OL03_COLLECTOR_ENTRY_SYNTHETIC_2026-10-21.md)・[単一bridge記録](E2E_BEST_PRACTICE_R2_OL03_ESTIMATE_BRIDGE_SYNTHETIC_2026-10-21.md)を参照。

後続の[3round resource台帳詳細設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_THREE_ROUND_RESOURCE_LEDGER_DESIGN.md)で、操作/xattr名bytesの累積枠とlive同時枠、cleanup予約、共有retry、同receipt/budgetとround順序、strict後続照合までの停止条件を具体化した。設計のみであり、台帳実装・運用cap承認・通常strict接続は未対応。新台帳の費用をO/Sへ計数し、I/R/Oと独立resource・管理allocationを合算するまで全体受付を有効化しない。上界が既存work上限を超える規模試算の制約も維持する。

同設計draft-0.3 §14ではresource必要数量の純粋計算subsetのみを追加した。算術は固定9 work、元budget/retry残を使い新しい予約や予算を作らない。raw scalar入力は受理済み宣言の証拠ではなく、数量と運用capは別である。session台帳・統計の保護されたproducer/binding・通常strictへの接続・全体受付は未対応。[合成記録](E2E_BEST_PRACTICE_R2_OL03_RESOURCE_MODEL_SYNTHETIC_2026-10-21.md)を参照。

後続draft-0.5 §16でsession状態内部型・budget-owned唯一claim・receipt/budget/round bindingを追加した。O.session_create=2、O.session_begin=2、O.session_require=1を元budgetへ課金し、S/既存bridge/算術9へ二重計上しない。claim storageの管理allocation、実resource会計・完了通知・通常strict/全体予約は未完了である。単一budget内の再生成拒否を運用producerや全体受付の承認と読み替えない。[session状態合成記録](E2E_BEST_PRACTICE_R2_OL03_SESSION_STATE_SYNTHETIC_2026-10-21.md)を参照。

[scan詳細設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md)へ、全entry/rootの2回全path解決、逐次名前照合と余剰entryのopen前拒否、短読取停止・元共有EINTR残8、snapshot/解放を含む操作数・work式候補を整理した。cleanupはacquire前prechargeと一度限りのownerへ結合する案とし、元spentを返さない。

既存target用metadata100回/640KiBやtopology16,384をscanへ黙って流用・増額しない。単発native列挙・係数計数・scan専用quota/配賦・管理allocation/FD/cleanup方式が未確定なら開始前にUnavailableとする。設計のみで、実装・全体受付・native接続・permitは有効化しない。

後続の[scan詳細設計draft-0.2 §11](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#11-純粋な計算器の先行実装collector未接続)で数量計算器のみを先行実装した。計算自体12 work・追加guard1・数量cap helper2はU_otherの別費目である。係数16/18はcollector未計数の候補値、shapeは運用証拠ではない。全体受付・予約・実sourceへ接続せず、未知quotaと大規模shapeの100万超過を解消済みと扱わない。

さらに[scan詳細設計draft-0.3 §12](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#12-単発操作の内部契約合成source運用未接続)でenum/open/read/metadata/cleanupの単発内部境界を合成検証した。同SharedBudgetと元EINTR残を使い、取得前cleanup precharge・取得成功の即時owner化・一度限り解放・不明件数を保持する。scope固定費2は現段階で別に計数し、collector固定16への対応は未確定。完全collector/expected集合/size結合・承認quota/3round配賦・OS backend/host終了票接続はなく、全体受付は無効のまま維持する。

[scan詳細設計draft-0.4 §13](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#13-expected-child--seen照合subset運用未接続)でdirect-childのexpected/seen・余剰/重複/missing拒否を内部接続した。保護された宣言producer/全closure collectorではない。探索の比較ごとにworkを課金するため、既存候補式の定数lookup費 `3H` はこの実装をそのまま覆わない。計算器ID/式を変更せず受付へ流用することを禁止し、モデル改訂/費目所有表・独立resource配賦が揃うまで全体受付は無効とする。

[scan詳細設計draft-0.5 §14](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#14-宣言sizeへのread--eof位置結合部分実装)でimmutable File entryのsizeを同resourceの連続read/終端位置へ結合し、stat前後差・未完了を拒否するsubsetを追加した。bind3、data/retry各3、EOF0＋post-stat5を実計数したが、完全snapshotとの重複・hash/producer/費目配賦は未整理。既存計算器をこの実装の受付上界とせず、完全collector/OS接続/全体受付/permitは引き続き無効とする。

同設計draft-0.6ではbind済みresourceの低水準read/EOFを拒否し、宣言経路内だけで生成する1呼出し用内部アクセス値を要求する。indexのper-file2GiBとscanの512MiBは安全側の制約差として維持し、3scanのLと他read/予約を元payload2GiB内で共有することも明記した。上限・work課金・全体受付の停止状態は変更しない。

[scan詳細設計draft-0.7 §15](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#15-同resourceのbytesによるsha-256宣言digest照合)で同resourceのfresh dataへstreaming SHA-256を追加した。bind5・完全data5・EOF0/post-stat/finalize/比較7（Interrupted各3）を元共有workへ計上する。standalone `18+5C`、1-childの1 chunk38を実計数した。以前の17/32はsize-only段階の費用で、現行では使わない。lookup/stat/hash/producersの費目所有表と全体workモデル/独立resource受付は依然未接続であり、全体受付・実行permitを有効化しない。

[scan詳細設計draft-0.8 §16](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#16-同resourceのacl--xattr--fs正規化前後照合)で同resourceのACL/xattr/FSを含むsnapshotを前後へ接続した。内部subsetの1 snapshot18 workを計数し、stat照会を置換した現行bind22/EOF24・standalone `52+5C`（1 chunk57、child接続72）へ更新した。§15の18/23/38は過去の費用である。expected deviceのtrusted producer/全祖先policyと全体モデル・3round配賦は未接続で、18Mを全運用経路で認証済みとは扱わない。元quotaを緩めず全体受付・実行permitは無効とする。

[scan詳細設計draft-0.9 §17](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#17-receipt--round限定の宣言入力結合内部契約のみ)で、Readyのimmutable宣言からreceipt/round・root device・親子viewへ由来を結合する内部契約を追加した。元budget/checkpointで利用ごとに検査し、追加decodeや予約は行わない。既存scan_opsへの実接続・trusted OS producerではなく、線形探索の追加費は旧index/scan上界へ含まれない。費目の上界更新・完全collector・全体受付は未対応であり、未知費を0として進めない。

[scan詳細設計draft-0.10 §18](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#18-root--絶対祖先path再照合の内部契約)で保持rootと固定anchorからの絶対祖先全edgeをreceiptへ照合する内部契約を合成検証した。h=2のprogram work42（一般形8h+26）を計数したが、集約Observationはnative metadata primitiveではない。既存18M/scan operation quota・3round配賦へ接続済みとはせず、全体受付・運用gateは停止を維持する。

[scan詳細設計draft-0.11 §19](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#19-runtime-root以下の相対directory--file再照合の内部契約)で、相対祖先/leafとcanonical宣言・親子view・保持resourceを結合し、固定anchorから全絶対/相対edgeを再探索するsubsetを追加した。初回snapshot生成とscan_opsへの実接続はなく、一般費 `V+9(h+k)+39`、fixture file112/directory96は合成比較のprogram workである。元quota/100万上限を緩めず、全scan/3roundの操作配賦・上界・受付へは接続しない。

[scan詳細設計draft-0.12 §20](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#20-canonical-entry所属判定の固定回数化)でcanonical参照確認の線形検索を除去した。上段112/96は先行版の記録とし、現行の入口費はΣp_iのない `V=6+Q+3k`（Q=6/7）、再照合はfile106/directory94となる。名前によるdirectory/child lookup、完全metadata、3round配賦の費用は解消しておらず、全体受付は無効のまま維持する。

[scan詳細設計draft-0.13 §21](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#21-scan_ops接続全件回収collectorprivate合成経路)でprivateな全件回収collectorをscan_opsへ接続した。実read/hash/完全metadata・名前全集合・全path前後照合・終端cleanupを通過したslotだけで観測を構築し、AfterScanへ渡す合成試験を行った。fixture1886 work/876 source操作/peak5は計数結果であり、旧候補式や本番上界の認証ではない。expected構築/重複snapshot・追加walk等の費目と3round resource配賦を再整理するまで、全体受付・通常strict経路への切替・OS producerは未接続とする。

[scan詳細設計draft-0.14 §22](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#22-scan単位の期待子一覧前処理)で期待子一覧のdirectoryごとの全entry走査を廃止した。scan単位のO(E log E)前処理と、子数に比例する射影へ変更した。E=5,501/T=1,001の準備部分は85,393 work、小fixture全collectorは1,902 work/876操作/peak5。前処理費は `8+4E+4T+B+V+M`、取得/射影は `E+2T` だが、全collector/3roundの上界・受付適合の証明ではない。既存work上限・全体受付無効を維持する。
