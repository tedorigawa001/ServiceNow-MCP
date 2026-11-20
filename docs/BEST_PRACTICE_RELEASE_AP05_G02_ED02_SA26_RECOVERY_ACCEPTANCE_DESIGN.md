# AP05 G02：ED02／SA-26の回復先行案・受入条件

Version: release-ap05-g02-ed02-sa26-recovery-acceptance-draft-0.1 / Date: 2026-11-20。

Status: **設計のみ。ED02の処遇は未選択・未承認。回復は未確認、G02は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準 `a869830` は文書・現行source／旧testの読取り用で、製品候補ではない。

[ED01〜07個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED02だけを対象とする。[G02旧assertion・回復条件](BEST_PRACTICE_RELEASE_AP05_G02_OLD_ASSERTION_RECOVERY_DESIGN.md)と[AP01残差台帳 A1-X02](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)の元保証を保持し、[G01のED02](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)、[AP02範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)のS01／06・通常K01／04と[PK02／FX04の試験分離](BEST_PRACTICE_RELEASE_AP05_PK02_FX03_FX04_VERIFICATION_SPLIT_DESIGN.md)に結ぶ。`53eff59` の[C06採用記録](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md)は型・import面の仕様根拠で、撤去・個別処遇・実行の許可ではない。正規旧case分類は未対応のまま。

通常経路・旧試験／fixture・期待値・import順を維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・変異操作・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 H：旧SA-26とFX04が直接確かめる二点

| 観測 | [元SA-26](../tests/review/source-status-binding.test.ts) | [旧compiled FX04](../tests/review/fixtures/compiled-source-status-binding.mjs) |
|---|---|---|
| 旧classの指定own名不在 | SA wrapperを静的import済みの状態で `Object.hasOwn(BoundedReadSession,'probeNewStatusAcceptance')` が `false` | 旧 `dist` の実classとSA wrapperで同じown判定を保持。prototype・継承・別名やmodule exportの不在まではいずれも直接assertしない |
| friend再取得の同期拒否 | `await import` で同じ `bounded-read` のexportを得た後、`takeStatusAcceptanceProbe()` 自体が同期に `internal_review_error` を含むerrorをthrow（`.toThrow('internal_review_error')`） | 旧 `dist` の同module／slotで `assert.throws` による `code: 'internal_review_error'` 検査を保持。元caseのメッセージ検査と同じassertionに書き換えず、両方ともimportやprobe呼出しのPromise拒否とは区別 |

**先行消費はソース上の根拠。** [旧session module](../src/servicenow/bounded-read.ts)のclass static blockがmodule上の `statusProbe` に固定継続を格納する。[旧SA wrapper](../src/review/abort-scope-evidence-source-status-probe.ts)はmodule評価時に `const probe=takeStatusAcceptanceProbe()` で同moduleのslotを取得する。取得関数はslotを `undefined` にしてから返す／空ならthrowする。SA-26の本体はこの初回取得の戻り値・回数・再登録防止の全経路を直接検査しない。将来それらが必要なら別対照・別assertionとし、元の二点を改変しない。FX04に別にある404／`unconfirmed` のPromise拒否も再取得の証拠にしない。

Hは旧revisionの元source testと、同旧revision由来のbuild／wrapper／FX04をそれぞれ固定し、同module instance・先行評価順を保つ。候補Pの展開物や別解決先、取得を模倣するstubは使わない。[現行PK02](../tests/review/package-http-classification.mjs)はpack一覧でwrapperの除外を検査し、別途repo `dist` のFX04を起動する構成。wrapper除外が旧 `bounded-read` の取得口・登録・runnerの不在を検査したことにはならない。ED03／ND-30・FX03は別slot／別wrapperの証拠であり、ED02に転用しない。

## 2 P+：通常moduleと通常経路が残ることを先に示す（未実施）

P+とP0は、同じ候補の空buildから得た単一tarball由来の未変更・隔離展開物で確認する案。repo `dist`、src／tsx、隣の成果物、開発loaderへのfallbackなし。検査時の添付物は配布payloadと別記する。通常import成功と以下の振る舞いを別欄にし、旧SA wrapperのimportやfriend取得を正対照の前提にしない。

| 通常側の正対照 | 受入条件 |
|---|---|
| K01：通常module／実class | 展開rootの `bounded-read` が正常に解決・loadし、通常の `BoundedReadSession`・固定factory・依存を残す。合成入力で通常生成／会計・停止・固定closeを確認し、通常側の期限・取消・予約と先行診断を保つ。別distからのloadやmodule不全を成功にしない |
| K04／SL08：初期結合と同core会計 | options省略の `prepareNewReviewComposition` で同ownerの通常2引数sourceを内部生成する設計。transport claim → `bindInitialSource` → [通常lifecycleの `claimStatusBinding`](../src/servicenow/review-evidence-lifecycle.ts) → 同coreの会計接続を残す。通常同期 `constructor_bound`、auth=false／ready世代0、C/G/P=0、予約返却・固定close、dispatch／発行の閉鎖を維持。[現行compiled通常準備](../tests/review/fixtures/compiled-canonical-session.mjs)は参照のみであり、summary単独やDの結果で実参照の結合を代用しない |
| 共通PK02の通常K02／SL09 | 通常2引数sourceから合成依存のみで親→通常release判断→matched時の同source／Permit／port結合・固定closeを独立に確認する。旧status-only probeや通常K04のpre-I/O正対照とは別で、正式発行口は開かない |

`claimStatusBinding` は残す初期結合・会計の継続で、撤去候補のSA登録slotではない。`#probeStatusAcceptance` は現行ではSAとND両方から利用される旧専用継続。SAからの到達辺を追う一方、その本体・ND側の利用条件は共有の旧専用境界として台帳に残す。ED02だけでND処遇を決めたり、通常lifecycle・通常closeを巻き添えにしたりしない。

## 3 P0／SL18：取得口・登録・到達辺を別々に判定する（未実施）

| 判定対象 | 受入条件 | 不足・不一致とするもの |
|---|---|---|
| 残る `bounded-read` の取得口とclass | 通常loadを先に確認。同moduleの旧 `takeStatusAcceptanceProbe` について、静的named importは**旧名欠落によるlink失敗**、namespace／動的importは**moduleのload成功と旧own名不在**を個別記録。class constructorのstatic口とprototypeの禁止口を別々に確認する | module自体がない・依存不全・評価時throw、旧関数が存在して空slotでthrow、namespaceの値が `undefined` なだけでown名は残る、のいずれも合格にしない |
| 未公開の登録・runner | `statusProbe` のmodule slot、class static blockのSA登録代入、`#runStatusAcceptanceProbe`／`pinStatusProbeFake` とSA専用型・継続を個別に照合する。公開名を消しても登録・runner・再登録経路を候補本番に休眠させない | 取得exportを隠すだけ、wrapperを除くのみ、静的初期化を一括削除して通常側の責務まで失うことは不可。元の共有先が未分類ならUnknown |
| wrapper・別名・到達辺と配布層 | S06対象の `abort-scope-evidence-source-status-probe` はdeep importの**対象不在による解決失敗**を、残るmoduleのnamed link失敗と分ける。配布manifest・export表・構文と解決先を対応させ、wrapper評価時取得、別名／再export／直接参照・解決済み動的辺を追う。JS、宣言、JS map、宣言mapと埋込みsourceをそれぞれ確認 | ファイル名／文字列検索だけ、type-onlyの失敗を実行辺に流用、shim、stale出力、他rootへのfallbackは不可。動的参照が解決できなければ「不在」でなくUnknown。禁止経路・probe本体は実行しない |

**PΔは検査器の感度だけ。** [固定slot／変異manifest](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)のSA行、MT13（`sa_named_export_present`）、MT15（`sa_probe_slot_present`）、MT17（`sa_private_runner_retained`）、MT19（`sa_probe_registration_retained`）、MT21〜24（wrapperのJS・宣言・両map）、MT29（`sa_friend_reexport_edge`）を参照する。P+／P0成立後、同候補由来の隔離copyごとに一変異だけ、指定した一次判定・理由で検出し、元候補不変と所定の終了を確認する案。変異artifactは実行せず、未解決・一般起動不能・別理由は代用しない。MT13をclass／namespace固有の独立変異とは数えず、ND専用の動的辺／型参照MT30／31をSAの検査感度へ加えない。SA固有の追加対照が必要なら対象・理由・費目を別審査し、本MDでslotや上限を確定しない。

## 4 再審査に渡す記録と起動0の条件

- **H・P+・P0・PΔを別判定にする。** Hは旧class own名不在と同slot再取得の同期拒否、P+は通常moduleと通常owner／会計の存続、P0はSAの取得口・登録・到達辺の不在、PΔは検査器の感度。Pで旧取得名が解決しないことは、同旧slotに対する二度目の同期throwの回復ではない。Hを保持したまま残差と責務を個別票へ記し、同位置の回復が必要なら回復先が示されるまで保留する。Dの別brandでの一度限り消費・失効でも代用しない。
- **同一性・終了・責務を固定する。** HとPの由来を分離し、Pのcommit／tree・digest・検査器／入力・実解決先は[G03](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)に、slot／attempt別の終了四軸・未確認時の保全責務は[G04](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)に結ぶ。SA slot／wrapper ownerがHと旧境界、session／lifecycle ownerが通常K、配布審査側がS01／06の到達辺とC06を担う。人の担当・期限は未割当。記録は判定ID・相対位置・理由・残存責務に限り、friend参照や認証情報を出さない。観測のための新friend・shimは作らない。
- **不明を合格にしない。** 通常経路とSA専用辺の分離、同候補のpin、必要なH／Pの証拠、前slotの終了、cleanup予約または各承認が不足すれば、Unknownを保持して起動0。試行後の未確認は新規slotを止め、最初の理由と未確認責務を承認済みの保持枠へ渡す設計に限る。ED02の処遇・保証低下、AP02実装／friend撤去、候補検証、旧試験切替、公開は別承認。**現時点はED02未選択・未承認、G02未充足、SL01から起動0。**
