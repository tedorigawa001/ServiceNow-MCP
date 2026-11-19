# AP05：PK01〜04の固定slot・変異manifest案

Version: release-ap05-fixed-slot-mutation-manifest-draft-0.3 / Date: 2026-11-19。
Status: **設計案のみ。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準は `3df3cd5`。以下のID・順序はレビュー案で、対象をpin済み・承認済み・実行済みとはしない。

draft-0.3のレビュー修正：レビュー修正の基準HEADは`28f574c`（修正時のHEADは`d4b0941`）。§4末尾に操作site・失敗prefix設計への参照段落を追加し、§5の参照数をdraft-0.3時点の11に更新した。各SL／MT／SP／SR行・判定は変更していない。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`9d9033a`（修正時のHEADは`9d9033a`）。MT15／16が `statusProbe`／`nativeStatusProbe` を「class static slot」としていたが、実体はmoduleの `let` 変数で、クラスの `static {}` から代入される（bounded-read.ts:85・89・339〜341）。対象を「module上の旧登録slot」、理由ラベルを `sa_probe_slot_present`／`nd_probe_slot_present` とし、登録代入はMT19／20と分けた。§2の参照先不明の「②」を費目・上界設計の次工程へのリンクに改め、§5に静的確認を追加した。他のSL／MT／SP／SR行・判定は変更していない。

[共通受入設計](BEST_PRACTICE_RELEASE_AP05_PK01_PK04_CANDIDATE_ACCEPTANCE_DESIGN.md)と[PK01／FX05](BEST_PRACTICE_RELEASE_AP05_PK01_FX05_VERIFICATION_SPLIT_DESIGN.md)・[PK02／FX03・04](BEST_PRACTICE_RELEASE_AP05_PK02_FX03_FX04_VERIFICATION_SPLIT_DESIGN.md)・[PK03／FX06](BEST_PRACTICE_RELEASE_AP05_PK03_FX06_VERIFICATION_SPLIT_DESIGN.md)、[PK04現行検査](../tests/review/package-worker.mjs)を参照する。候補Pのみを対象とし、H／Dの元試験・成果物・期待値を変更しない。[AP02撤去範囲](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)と先行AP03の採用記録は候補仕様へ後日結合する。未コミット差分を現HEADへ合成して候補とみなさない。

先行AP03の差分、通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回はMDのみ。旧試験変更・実装・試験実行・build／梱包／展開・変異操作・process／保全操作・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 依存と入場条件

`SL01 → SL02 → SL03 → SL04 → 全P+（SL05〜15）→ 全P0（SL16〜21）→ PΔ（MTの表順）→ SL22`

- 各番号の接頭辞は `AP5-`。表の実行順は案で、slotの分割・並行化・再試行は含めない。開始はAP5-G01〜04、同候補pin、固定entry、前slotの所定判定と独立終了、予算の承認に従う。前slotの欠落・予期しない理由・post-pin不一致・終端未確認で、残りは未開始。系列停止時は新しい通常slotへ進まず、[外側時間枠設計](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_OUTER_BUDGET_CUSTODY_DESIGN.md)の予約済みcleanupだけを行う将来条件とする。
- **P+とP0は同じ未変更の候補展開物**を使う。通常import／正対照成立前の名前不在や依存解決エラーはP0に数えない。PΔは基準P+／P0を完了した同候補から、行ごとに新しい隔離コピーを作り**一変異だけ**適用する。他の変異を重ねず、完了後に次行へコピーを持ち越さない。
- PΔでは、元候補pinと変異コピーpinを別に記録する。差分一致を検査してから指定の判定点へ進み、**対象・判定ID・期待理由・独立終端**が一致した場合だけ「意図した失敗を検出」とする。許可差分以外のdrift、別判定の先行失敗、非0終了、起動不能、依存解決不能だけでは代用不可。構造対照は静的な検査に限り、禁止経路・開発loader・旧friendを実行しない。
- 次の欄は未確定：候補の完全commit／tree ID、承認記録、入力／toolchain／依存、build／tarball／展開物／検査器のdigest、各変異の正確な相対path・構文または生成位置・before／after digest、固定fixture／entry、操作site実体、各上限。論理対象から複数候補が見つかっても「最初の一致」では選ばない。固定対象を一意にできない行は開始不可であり、探索や別変異へfallbackしない。

## 2 固定slot案：準備・通常経路・不在・終端

| slot／段階 | 固定する対象・判定点 | 操作site参照 | 失敗時に残す責務参照 |
|---|---|---|---|
| AP5-SL01／先行保持 | plan／revision、独立保全枠の同系列登録、入力／toolchain／依存pin | SP01 | SR01、SR06 |
| AP5-SL02／空build | 同revisionの専用空出力・出力manifest、次段に渡すbuild pin | SP02、SP07 | SR02、SR04〜05 |
| AP5-SL03／pack | 同buildからのtarball、artifact一覧とdigestの固定 | SP03、SP07 | SR02、SR04〜05 |
| AP5-SL04／隔離展開 | 同tarballの展開manifest、ローカル本番依存の実解決先、検査fixture添付を本体から分離 | SP04、SP07 | SR02〜05 |
| AP5-SL05／P+ PK01会計 | canonical／bootstrap kernel・必要な配布層、単一C/G/P・final4予約／返却 | SP05〜07 | SR02、SR04〜05 |
| AP5-SL06／P+ PK01通常GET | 合成依存の通常GET、課金・公開結果・close | SP06〜07 | SR04〜05 |
| AP5-SL07／P+ PK01 typed対照 | shape拒否、dispatch後同期throw、Promise拒否、G計上を別fixture入力で独立判定。実transportではない | SP06〜07 | SR04〜05 |
| AP5-SL08／P+ PK01〜03通常準備 | 省略同期summaryと初期source／`claimStatusBinding`・同core会計、C/G/P=0、予約返却・固定close | SP06〜07 | SR04〜05 |
| AP5-SL09／P+ PK01・02通常結合 | source値kernelの解決、通常2引数source → 親→release判定→matched時の同source／Permit／port、停止・fixed close | SP05〜07 | SR02、SR04〜05 |
| AP5-SL10／P+ AP03横断 | 非Proxy通常options・継承getter未読・許可own値、C07-BのJS明示undefinedと宣言上の2引数を別判定 | SP05〜07 | SR02、SR04〜05 |
| AP5-SL11／P+ PK03値kernel | release系6値moduleのJS・宣言・両map、sessionをloadしない純粋entryのhandoff／discard | SP05〜07 | SR02、SR04〜05 |
| AP5-SL12／P+ PK03通常時刻・停止 | 通常S／全deadline／pin済みpolicy／既存時刻出力、通常stop／owner失効・signal・予約・close | SP06〜07 | SR04〜05 |
| AP5-SL13／P+ PK04 worker | 必須workerとlifecycle・本番依存、固定worker JS・合成XML／AST分析と集約 | SP05〜07 | SR02、SR04〜05 |
| AP5-SL14／P+ PK04 MCP handler | 既存tool登録・合成request・worker応答／非露出。公開MCP起動なし | SP06〜07 | SR04〜05 |
| AP5-SL15／P+ PK04 fixture境界 | 通常sessionの会計と同sourceのprivate release bindingを別対照で維持 | SP06〜07 | SR04〜05 |
| AP5-SL16／P0 PK01 | 旧fake I/OのJS・宣言・両mapと到達辺なし。ファイル不在と実行／型辺不在を別判定 | SP05 | SR02 |
| AP5-SL17／P0 AP03横断入口 | 禁止own `synthetic_io`（非列挙・値undefined含む）、複合不正、外側Proxy、他のJS第3値・4引数以上を別入力。採用記録どおりの同期拒否順、getter／trap未実行等を区別 | SP05〜07 | SR02、SR04〜05 |
| AP5-SL18／P0 PK02 SA | 残るmoduleを正常loadした上でSAのnamed／namespace／class口、登録・runner・関連辺を確認。廃止wrapperのdeep解決失敗を別判定 | SP05〜07 | SR02、SR04〜05 |
| AP5-SL19／P0 PK02 ND | SL18と別入力・別判定でNDの取得口、native driverの専用辺・宣言／map・廃止wrapperを確認 | SP05〜07 | SR02、SR04〜05 |
| AP5-SL20／P0 PK03 | sessionから旧時刻観測／移譲・私有projectionへの辺およびstale出力なし。純粋値moduleと通常stopは撤去対象外 | SP05 | SR02 |
| AP5-SL21／P0 PK04 | 本番の隔離解決、開発loader／依存／src・tests・既存除外物・fixture authority不在。検査時添付物は基準payloadと別 | SP05〜07 | SR02〜05 |
| AP5-SL22／系列末尾（全MT後） | 最終pinと系列共有物の保全・固定回収・確定記録。R4〜R7を使用し、新しい検査slotを起動しない | SP12〜15 | SR02、SR06〜08 |

表内の複数入力は別照合欄を持つ。実entry・入力variantの固定リストと最大通過回数は[費目・上界設計](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_COST_UPPER_BOUND_DESIGN.md)の次工程で詰め、slot名だけから一律に費用や件数を確定しない。どの通常slotにもSP12〜15／SR06〜08の該当する出口・保全判定を適用する。記載がないSP11／SR04〜05も、実runner・worker・streamを生成したprefixには必要。SL22が未開始でも、停止prefixからの予約済み保全責務は消えない。

## 3 PΔ変異manifest案：表順に一行一変異

各行は独立のPΔ slot。固定述語IDは上のSL番号に下記の **理由ラベル**を結んだもの。理由ラベルは審査用で、製品APIや既存エラー文言を追加・変更しない。層の略記：`FAKE`＝`dist/servicenow/review-composition-fake-io`、`SESSION`＝`dist/servicenow/bounded-read`、`SAWRAP`＝`dist/review/abort-scope-evidence-source-status-probe`。拡張子を含む行は指定された一層だけが変異対象。変異で確認するのは指定された検査の感度であり、正常候補のP+で求める実行・同一性・終了の証拠に置き換えない。

全MTでSP08（コピー）、SP09（一変異／差分照合）、SP10（対象判定）を使用する。下表のMTはSP05で構造・解決・対象存在の判定を行う案で、変異したartifactの実行は固定列に含めない。SP07は将来の検査器を起動する場合にその検査器自体に適用し、変異側の旧入口やloaderは起動しない。失敗時はSR02〜03（元配布物と変異側を明確に分ける）を登録し、実処理があればSR04〜05、出口共通はSR06〜08。表のsite／責務欄はこの共通部分に対する追加参照または注意点。

| 変異slot／対象判定 | 一変異の対象・例示でない論理位置 | 期待する失敗理由 | 操作site／失敗時の残存責務 |
|---|---|---|---|
| AP5-MT01／SL16 | FAKE.js を単独追加 | `fake_js_present`：旧専用JSが同梱一覧に残る | SP05／SR03 |
| AP5-MT02／SL16 | FAKE.d.ts を単独追加 | `fake_declaration_present`：旧専用宣言が残る | SP05／SR03 |
| AP5-MT03／SL16 | FAKE.js.map を単独追加 | `fake_js_map_present`：旧JS mapが残る | SP05／SR03 |
| AP5-MT04／SL16 | FAKE.d.ts.map を単独追加 | `fake_declaration_map_present`：旧宣言mapが残る | SP05／SR03 |
| AP5-MT05／SL16 | SESSION.js の1静的参照を旧fake I/O向けに変更 | `fake_static_edge`：禁止辺を指定の参照先として検出 | SP05／SR03 |
| AP5-MT06／SL16 | SESSION.js の1参照に旧fake I/Oを指す別名を置く | `fake_aliased_edge`：文字列名だけでなく別名の解決先で検出 | SP05／SR03 |
| AP5-MT07／SL16 | SESSION.js の1再exportを旧fake I/O向けに変更 | `fake_reexport_edge`：禁止再exportの解決先を検出 | SP05／SR03 |
| AP5-MT08／SL16 | SESSION.js の1動的参照を旧fake I/O向けに変更 | `fake_dynamic_edge`：解決対象を特定できた禁止動的辺。未解決だけでは合格不可 | SP05／SR03 |
| AP5-MT09／SL16 | SESSION.d.ts の1型参照を旧fake I/O向けに変更 | `fake_type_edge`：型層の禁止依存 | SP05／SR03 |
| AP5-MT10／SL16 | SESSION.js.map の1埋込みsource記録に旧fake参照を置く | `fake_map_source_edge`：既存map内部の禁止参照 | SP05／SR03 |
| AP5-MT11／SL17 | 通常準備の禁止own `synthetic_io` 同期拒否分岐を一箇所だけ欠落させる構造対照 | `synthetic_early_guard_missing`：期待する副作用前の拒否境界が欠ける。旧処理は実行しない | SP05／SR03（構造のみ） |
| AP5-MT12／SL05 | `dist/servicenow/review-canonical-budget.js` のみ欠落 | `required_canonical_kernel_missing`：P+の必須kernel未取得。P0成功ではない | SP05／SR03（P+の構造判定） |
| AP5-MT13／SL18 | SESSION.js のSA旧named取得口 `takeStatusAcceptanceProbe` 一つ | `sa_named_export_present`：残る通常moduleの旧SA named境界を検出 | SP05／SR03 |
| AP5-MT14／SL19 | SESSION.js のND旧named取得口 `takeNativeStatusCompositionProbe` 一つ | `nd_named_export_present`：残る通常moduleの旧ND named境界を検出 | SP05／SR03 |
| AP5-MT15／SL18 | SESSION.js のmodule上のSA旧登録slot（`let statusProbe`）一つ。`static {}` 内の登録代入はMT19 | `sa_probe_slot_present`：module上の旧SA登録slotを検出 | SP05／SR03 |
| AP5-MT16／SL19 | SESSION.js のmodule上のND旧登録slot（`let nativeStatusProbe`）一つ。`static {}` 内の登録代入はMT20 | `nd_probe_slot_present`：module上の旧ND登録slotを検出 | SP05／SR03 |
| AP5-MT17／SL18 | SESSION.js のSA専用runner `#runStatusAcceptanceProbe` だけを未exportの構造片で表す | `sa_private_runner_retained`：named不在でも旧SA runnerが残る | SP05／SR03 |
| AP5-MT18／SL19 | SESSION.js のND専用runner `#runNativeStatusProbe` だけを未exportの構造片で表す | `nd_private_runner_retained`：named不在でも旧ND runnerが残る | SP05／SR03 |
| AP5-MT19／SL18 | SESSION.js のSA登録用代入の一箇所（取得口とrunnerは別） | `sa_probe_registration_retained`：旧SA登録本体が残る | SP05／SR03 |
| AP5-MT20／SL19 | SESSION.js のND登録用代入の一箇所（取得口とrunnerは別） | `nd_probe_registration_retained`：旧ND登録本体が残る | SP05／SR03 |
| AP5-MT21／SL18 | SAWRAP.js を単独追加 | `sa_wrapper_js_present`：廃止wrapperのJS残留 | SP05／SR03 |
| AP5-MT22／SL18 | SAWRAP.d.ts を単独追加 | `sa_wrapper_declaration_present`：廃止wrapper宣言残留 | SP05／SR03 |
| AP5-MT23／SL18 | SAWRAP.js.map を単独追加 | `sa_wrapper_js_map_present`：廃止wrapper JS map残留 | SP05／SR03 |
| AP5-MT24／SL18 | SAWRAP.d.ts.map を単独追加 | `sa_wrapper_declaration_map_present`：廃止wrapper宣言map残留 | SP05／SR03 |
| AP5-MT25／SL19 | `dist/review/abort-scope-evidence-native-diagnostic.js` を単独追加 | `nd_wrapper_js_present`：NDの廃止wrapperが残る | SP05／SR03 |
| AP5-MT26／SL19 | `dist/review/abort-scope-evidence-native-diagnostic.d.ts` を単独追加 | `nd_wrapper_declaration_present`：ND wrapper専用宣言が残る | SP05／SR03 |
| AP5-MT27／SL19 | `dist/review/abort-scope-evidence-native-diagnostic.js.map` を単独追加 | `nd_wrapper_js_map_present`：ND wrapper JS mapが残る | SP05／SR03 |
| AP5-MT28／SL19 | `dist/review/abort-scope-evidence-native-diagnostic.d.ts.map` を単独追加 | `nd_wrapper_declaration_map_present`：ND wrapper宣言mapが残る | SP05／SR03 |
| AP5-MT29／SL18 | SESSION.js のSA旧取得口への1再export辺（元moduleの版・形を変更しない） | `sa_friend_reexport_edge`：SAの再export経路 | SP05／SR03 |
| AP5-MT30／SL19 | SESSION.js のND旧runnerへの1解決済み動的辺 | `nd_friend_dynamic_edge`：ND専用への動的到達辺 | SP05／SR03 |
| AP5-MT31／SL19 | SESSION.d.ts のND旧専用型への1型参照 | `nd_friend_type_edge`：ND専用型の参照が残る | SP05／SR03 |
| AP5-MT32／SL09 | `dist/servicenow/review-kernel/source-values.js` のみ欠落 | `required_source_kernel_missing`：P+のsource値依存が欠落 | SP05／SR03（P+の構造判定） |
| AP5-MT33／SL20 | SESSION.js のconstructorから旧観測への辺を一箇所 | `legacy_observation_constructor_edge`：正規startedAt・policyでなく旧観測枝への辺を検出 | SP05／SR03 |
| AP5-MT34／SL20 | SESSION.js のstopから旧時刻clearへの辺を一箇所 | `legacy_time_stop_edge`：通常stopは保持し、旧私有時刻辺だけを検出 | SP05／SR03 |
| AP5-MT35／SL20 | SESSION.js のrollbackから旧時刻cleanupへの辺を一箇所 | `legacy_time_rollback_edge`：旧rollback辺を検出 | SP05／SR03 |
| AP5-MT36／SL20 | SESSION.js のprepareから旧handoffへの辺を一箇所 | `legacy_time_prepare_edge`：旧準備辺を検出 | SP05／SR03 |
| AP5-MT37／SL20 | SESSION.js の旧観測への別名参照を一箇所 | `legacy_time_aliased_edge`：許可された純粋kernel内参照とは区別 | SP05／SR03 |
| AP5-MT38／SL20 | SESSION.js の旧handoffへの再exportを一箇所 | `legacy_time_reexport_edge`：session境界からの旧再exportを検出 | SP05／SR03 |
| AP5-MT39／SL20 | SESSION.js の旧handoffへの解決済み動的参照を一箇所 | `legacy_time_dynamic_edge`：解決済みの旧session辺を検出 | SP05／SR03 |
| AP5-MT40／SL20 | SESSION.js の旧時刻runnerの未export本体を一箇所 | `legacy_time_runner_retained`：呼出しやexportがなくても旧本体を検出 | SP05／SR03 |
| AP5-MT41／SL20 | SESSION.d.ts の旧 `ReleaseInputProjection` 専用宣言を一箇所 | `legacy_time_declaration_present`：専用型の残留 | SP05／SR03 |
| AP5-MT42／SL20 | SESSION.js.map の旧handoffを指す埋込みsourceを一箇所 | `legacy_time_js_map_present`：旧JS map側の残留 | SP05／SR03 |
| AP5-MT43／SL20 | SESSION.d.ts.map の旧projectionを指す埋込みsourceを一箇所 | `legacy_time_declaration_map_present`：旧宣言map側の残留 | SP05／SR03 |
| AP5-MT44／SL11 | `dist/servicenow/review-kernel/release-time-handoff.js` のみ欠落 | `required_time_kernel_missing`：P+の純粋値実行入口がない | SP05／SR03（P+の構造判定） |
| AP5-MT45／SL11 | `dist/servicenow/review-kernel/release-time-owner.d.ts.map` のみ欠落 | `required_time_map_missing`：P+の保持すべき値module mapがない | SP05／SR03（P+の構造判定） |
| AP5-MT46／SL12 | SESSION.js の通常stopからowner失効への連結を一箇所欠落 | `normal_stop_revoke_missing`：P+の通常失効が証明できない | SP05／SR03（P+の構造判定） |
| AP5-MT47／SL12 | SESSION.js の通常closeの予約返却を一箇所欠落 | `normal_close_release_missing`：P+の通常資源解放が欠ける | SP05／SR03（P+の構造判定） |
| AP5-MT48／SL12 | 通常の時刻供給位置を一箇所だけ旧upper由来扱いに差替え | `normal_time_origin_changed`：P+の通常時刻の由来が不一致 | SP05／SR03（P+の構造判定） |
| AP5-MT49／SL13 | `dist/review/review-worker.js` のみ欠落 | `required_worker_entry_missing`：P+の固定worker入口欠落 | SP05／SR03（P+の構造判定） |
| AP5-MT50／SL13 | `dist/servicenow/review-evidence-lifecycle.js` のみ欠落 | `required_lifecycle_missing`：P+の必須session依存欠落 | SP05／SR03（P+の構造判定） |
| AP5-MT51／SL13 | 固定される本番依存 `saxes` の正規解決対象を一つ欠落 | `required_prod_dependency_missing`：P+の本番依存検査失敗。一般起動不能の代用不可 | SP05／SR03（P+の構造判定） |
| AP5-MT52／SL21 | `dist/review/review-worker.js` 解決に開発loaderを指す禁止解決候補を一つ置く | `dev_loader_boundary_violation`：解決先の隔離違反。開発loaderは起動しない | SP05／SR03（構造のみ） |
| AP5-MT53／SL21 | 同workerの解決に別distを指す禁止解決候補を一つ置く | `foreign_dist_boundary_violation`：同候補外の解決先を拒否。別distはloadしない | SP05／SR03（構造のみ） |
| AP5-MT54／SL21 | 配布payloadの `tests/` に未添付の開発出力を一ファイルだけ追加 | `dev_output_in_payload`：検査時添付と区別して不許可payloadを検出 | SP05／SR03 |
| AP5-MT55／SL21 | 配布payloadに `dist/review/dev-worker-bootstrap.mjs` を一ファイル追加 | `dev_bootstrap_in_payload`：dev bootstrap不許可 | SP05／SR03 |
| AP5-MT56／SL21 | `dist/servicenow/review-evidence-lifecycle.js` に旧fixture authority `registerPreparedFixtureSource` 一口 | `fixture_authority_retained`：既存不在対象が復活。取得・登録は実行しない | SP05／SR03（構造のみ） |

同一変異から複数の観測が変わる場合（ESMのnamedとnamespaceなど）は、期待する一次判定を先に選び、他判定の先行失敗で代用しない。許可されたdelta以外をpinで止める早期判定と、許可した一変異を所定理由で検出する判定を分ける。追加・欠落・差替えは一つの論理位置に限り、付随ファイルやexport・mapをまとめて変えない。禁止辺では正規化された参照先と型を一意に照合する。未解決の文字列や一般のmodule解決エラーだけを禁止辺検出とせず、参照先の成立に別ファイルの追加が要る行は未確定のまま止める。欠落対照は対象ファイル／解決位置の検査で先に所定のP+失敗を確定し、不在検査を続けない。SAだけ／NDだけの失敗、各出力層、実行辺と型／map辺、archive内と試験添付を混同しない。

## 4 操作site参照欄と失敗時の残存責務欄

[費目台帳](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_OBSERVATION_COST_LEDGER_DESIGN.md)のL01〜11と[費目・上界設計](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_COST_UPPER_BOUND_DESIGN.md)へ渡す中継IDであり、実呼出しsiteや実行操作の確定ではない。

| site範囲 | 次工程で実siteを結ぶ境界 | 対応費目 |
|---|---|---|
| AP5-SP01 | 上位枠登録・応答照合、入場、入力／依存pre-pin | L01 |
| AP5-SP02／SP03／SP04 | 空buildと出力pin／packとtarball pin／隔離展開・依存解決・添付分離 | L02／L02／L03 |
| AP5-SP05／SP06／SP07 | manifest・構文・解決または拒否の観測点／固定合成入力と個別assert／runner・子worker・streamの生成／通常退出観測 | L04中心、L01〜03／L04／L06〜07 |
| AP5-SP08／SP09／SP10 | 一変異コピー生成と原本確認／単独差分の適用・照合／指定の一次判定と理由照合 | L04、必要なpost-pinはL08 |
| AP5-SP11／SP12 | 閉鎖・承認された停止と残りの退出／stdio観測／post-pinと残存棚卸し | L05〜07／L08 |
| AP5-SP13／SP14／SP15 | 同枠の一度限り受理と同票照会／固定discardと独立空確認／最初の理由と四軸・残存責務の期限内封印 | L09／L10／L11 |

| 責務ID | 初期ownerと失敗位置 | 保持・次の扱い |
|---|---|---|
| AP5-SR01 | 系列側：枠登録・入力pinの不達、起動前の失敗 | 登録の未知状態・同枠参照・未確定pinを保持。作り直さず起動0 |
| AP5-SR02 | 系列側：build／pack／展開の途中・候補pin不一致 | 既知の生成prefixと共有候補base・manifestを保持。未確認物には触れず、共有物を借用slotから削除しない |
| AP5-SR03 | slot側：コピー／変異途中、想定外の判定 | 元候補とは別の部分コピー・適用済み差分・理由を保持。変異を次行へ持ち越さず、半端なコピーを再利用しない |
| AP5-SR04 | slot側：runner・子workerの生成／退出／回収不明 | 同attempt・generationの既知prefix、未受領handle・未登録tail・未joinを保持。exitだけで終了を補わない |
| AP5-SR05 | slot側：stdio未終端・欠落・切詰め | stdout／stderr、所有stdin、通過／保持の確認を分ける。未終端の領域を勝手に回収しない |
| AP5-SR06 | slot側／上位：受理応答不明・同票不一致 | 同枠で読取照会のみ。再移譲せず、旧ownerへ処理権を戻さず、未確認なら削除なし |
| AP5-SR07 | 唯一の処理owner／上位：discardが未着手・途中・結果不明 | 未解決対象を同slotで保持。許可されない削除や二度目を行わず、空確認と削除結果を分ける |
| AP5-SR08 | 系列／上位：期限・時計・記録不達 | 先行理由・既知prefixと四軸／未確認を保持。遅い確認は別記録、元判定と次slot閉鎖を戻さない |

次工程の各行に、`slot_id／subcheck_id／predicate_id`、`site_ref／実行主体・相対位置・操作／L行`、`失敗prefix／最後に確定したsite／消費済み・未到達・未確認`、`residual_ref／対象ID・owner世代・受理票・次の権限` を設ける。原本／借用／コピー、生成試行／実体受領、受理／削除／空確認は別欄。候補pinと除外理由にも未確定値を明示し、上限・観測・保全の不足を零で補わない。通常slotの終了費は `W_i`、失敗後と共有物の後始末は一度だけの系列cleanup予約。方式や数値の決定・候補起動は別承認で、数値・観測手段・保全方式・保全先、候補revision・digestは確定しない。

[操作site・失敗prefix設計 draft-0.2](BEST_PRACTICE_RELEASE_AP05_OPERATION_SITE_FAILURE_PREFIX_DESIGN.md)で、SP01〜15を小操作の順序siteへ展開し、消費・到達・結果確認・保持責務の区別と、失敗prefix FP01〜12からSR01〜08・`W_i`／`R1〜R7` への引渡しを定義した。実site・係数・数値は未確定のまま。

## 5 静的確認

基準`9d9033a`で、bounded-read.tsの `takeStatusAcceptanceProbe`／`takeNativeStatusCompositionProbe`、module上の `statusProbe`／`nativeStatusProbe`（85・89行）と `static {}` 内の登録代入（339〜341行）、`#runStatusAcceptanceProbe`／`#runNativeStatusProbe`、`ReleaseInputProjection`、変異対象（FAKE／SESSION／SAWRAP、native-diagnostic、review-canonical-budget、source-values、release-time-handoff／owner、review-worker、review-evidence-lifecycle、dev-worker-bootstrap）の元srcの存在、PK04（package-worker）の本番依存3件（acorn／saxes／zod）・`registerPreparedFixtureSource`・dev-worker-bootstrap除外の検査、欠落対照がP+ slot、混入対照がP0 slotに結ぶこと、SP行と費目台帳L01〜11・SL22と `R4〜R7` の対応を静的に照合した。本書のID92行（SL22／MT56／SP6／SR8、SL・MTは欠番なし）が他文書のIDと衝突しないこと、表4・ローカル参照11（draft-0.3時点。`9d9033a`時点の9に費目・上界設計と操作site設計への各1件を加えたもの）・明示anchor0、参照先・表列数・末尾改行・差分空白を確認した。製品・試験・設定の差分はなく、実行・build／pack・変異・process／保全操作は行っていない。
