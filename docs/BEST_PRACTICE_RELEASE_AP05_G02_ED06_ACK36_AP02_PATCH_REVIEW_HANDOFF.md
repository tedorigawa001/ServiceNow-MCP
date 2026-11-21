# AP02／AP05 G02：ED06／ACK-36 差分審査への受渡し

Version: release-ap05-g02-ed06-ack36-ap02-patch-review-handoff-draft-0.1 / Date: 2026-11-20。

Status: **差分準備の承認を受け、製品側の差分と開発用fixtureを分離。影響を受ける旧保証・旧compiled検査を下記に留保し、候補は未指定・SL01起動0。** 本体適用・旧試験の切替・配布内容の受入は未承認。

[差分と証拠の段階設計](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_CANDIDATE_DELTA_AND_EVIDENCE_STAGING_DESIGN.md)に対するユーザーの「承認します」は、ED06の審査用差分の準備と、旧試験・元assertionを保持する条件に適用。[代替条件／起動の承認](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_ALTERNATIVE_ACCEPTANCE_PROPOSAL.md)は引き継ぐが、入場要件は変えない。基準commit `32a24ae1947383d89577a18dac77c49ff55b24b8`／tree `60cfcda9554cd6efcfab5560060cb6619ae87ad5` はパッチの当て先を照合する根拠であり、製品候補ではない。

## 1 審査用の差分（既存の隔離試作から正確に分離）

| 資料 | 対象・SHA-256 |
|---|---|
| `ED06-AP02-product-review.patch` | [session](../src/servicenow/bounded-read.ts)と旧fake I/O専用moduleのみ。 `068632231d52de4a2cccead2a1c60ec91f49d4f9792fd7f2988ff3274d95278c` |
| `ED06-AP02-development-fixture.patch` | `tests/review/ed06-ap02-isolated.test.ts`の開発用正対照／拒否4件のみ。配布・候補build・既存の通常試験収集への採用は未承認。 `a9d5f34250129d724d510f9ccb4b97e84dff756876b12d0eee6028b3d5ad1551` |

両資料はローカルの隔離領域に保持。本体のファイルに適用せず、既存の旧試験はどちらにも含めない。検査器・設定・lock・bin・既存の試験基準を変更しない。

| 差分 | 切る辺と通常側で維持する境界 |
|---|---|
| S03：旧入口／専用実行 | 旧overload・`PreparedSummary`・`#prepareCompositionIO`を切る。禁止own `synthetic_io` は外側受付で同期 `invalid_input`、通常の同期summaryと非Proxyのown optionsは維持。通常準備側だけ実2引数にし、既存の専用creation側とsourceの宣言／JS第3引数規則は変更しない |
| S05：旧fake I/Oの参照 | sessionの実行／型importと専用sourceファイルを除く。通常fetch・共有bootstrap・canonical予算は変更しない。将来の空build由来のJS・宣言・両mapと到達辺の不在が検査対象。配布前なので現時点では不在未確認 |
| S07／S04への影響：旧時刻継続と停止 | 旧専用のprojection、観測／比較・時刻引渡しと `#clearReleaseComparison` への専用接続を除く案。共有の `#compositionRevoke`・source transport解放・owner/core/予約/通常close、通常時刻とrelease値moduleは残す。一方、共通 `stop` 内の直接呼出しを落とすため、下記の旧compiled保証に影響する。この影響をED06の承認で処遇済みにしない |

## 2 旧保証と試験を残す条件

| 旧経路・assertion | 保持する範囲／候補側で主張しないこと |
|---|---|
| [ACK-36](../tests/review/private-composition-ack.test.ts#L92) | 基準版の旧syntheticで元のbind no-opと後段Promiseの `internal_review_error` を維持。候補入口の同期拒否、同owner合成対照や旧専用辺の不在で置き換えない |
| [旧receipt](../tests/review/release-comparison-receipt-session.test.ts)・[時刻引渡し](../tests/review/release-time-handoff-session.test.ts)・[観測UTC](../tests/review/release-observation-session.test.ts)・[pin済み投影](../tests/review/release-session-projection.test.ts) | 元の同bytes・時刻・取消・診断・解放を、元ファイル／注入位置／期待値のまま保持。隔離試作の実績は旧ACK／receiptの基準版42件と試作側で確認した旧receipt 4件の非同等まで。他の旧群を今回実行済み、または42件で代替済みとは扱わない |
| [旧PK01／FX05](../tests/review/package-canonical-budget.mjs#L10) | 旧fake I/Oの同梱期待と旧compiled ACKの起動をそのまま残す。候補の不在検査と旧の同梱期待は同一成果物に混ぜない。既存梱包検査の期待値を反転しない |
| [旧PK03／FX06](../tests/review/package-http-classification.mjs#L298) | 共通stopから `#clearReleaseComparison` を直接呼ぶassertionと、[旧compiled time handoff](../tests/review/fixtures/compiled-release-time-handoff.mjs#L14)を維持。製品差分はこの呼出しと旧専用入口を取り除くため、現行の旧検査と同じ成果物では両立しない。時刻／取消の旧保証の保持先と候補側の未代替範囲を別決裁する |

開発側の旧試験は、固定した旧版と当時の依存を使う独立経路に置く方針。個々の実行結果、元case、固定入力を候補側の結果と混ぜない。旧compiledに必要なbuild・梱包や恒久の試験分離、旧保証を候補で提供しない判断は今回の承認に含めない。

## 3 確認と次の停止点

分離した2資料が既存試作patchの連続する区間とそれぞれbyte単位で一致すること、基準HEADへの適用可否・追加行の空白、差分パス（製品2件、開発fixture1件）を読み取りだけで確認。旧compiled検査と旧試験の呼出し箇所は静的照合。今回の試験再実行・build／梱包はゼロであり、既存の合成結果だけで出荷可とはしない。

**本体に適用する前に決めるのは、旧PK01／03・FX05／06と旧時刻／取消の保持先および候補側の未代替保証。** 旧compile試験の承認された別経路がなく、候補に同じ旧assertionを要求するなら、この差分のまま本体へ進めない。G02の通常経路証拠①〜③は未取得で、[入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)の候補版・終了・保全・時間条件も未充足。正式発行口閉鎖・全体受付無効・外部利用Unknown・閲覧0・調査保留を維持。適用・候補指定／起動・試験・設定変更・実通信・コミット・Push・公開は行わない。
