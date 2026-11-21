# AP05 G02：ED06／ACK-36 個別処遇の着手レビュー

Version: release-ap05-g02-ed06-ack36-disposition-readiness-review-draft-0.1 / Date: 2026-11-20。

Status: **静的照合・推奨案のみ。ED06の処遇は未選択・未承認。候補の同等性・回復は未確認。実資料は未指定、外部利用はUnknown、閲覧は未承認・閲覧0。候補revision・digest・観測手段は未確定。G02未充足、SL01は起動0。** 読取り基準 `781c9b6` は旧試験と既存設計の参照であり、製品候補ではない。

[G02の個別処遇票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)の7票のうち、最優先のED06だけを[AP01残差台帳](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)の記入項目に照らした。両原票、他のED／NSの処遇および旧case分類は変えない。

## 1 個別票に渡せる記述と不足

| 票の欄 | 今、参照として渡せること | 未充足・未確定のこと |
|---|---|---|
| A1-P01／03：旧case・直接assertion | [旧ACK-36](../tests/review/private-composition-ack.test.ts)は旧合成runで `bindReviewReleaseSource` を非throwのno-opにし、返されたPromiseが `code: internal_review_error` でrejectすることを直接assertする | 元試験は具体的な最初の拒否位置、I/O回数、cleanup完了を直接assertしない。これらを失われる元assertionに加えない。候補で同じ保証が残るとは判定しない |
| A1-P02／04：通常Kと非同等 | 通常K02〜04の実結合・会計・停止／rollback／解放は維持必須。案Pの入口での同期 `invalid_input`、Dの `unknown`／`withheld`、配布物での入口不在は、元の後段Promise拒否とは別 | 対象候補で通常Kが保たれる独立証拠、旧専用経路との切断範囲、AP04の結果差の受容。旧試験を残すことは候補での代替を示さない |
| A1-P05／06：引受と回復条件 | 旧試験・通常結合／停止／解放・配布審査・外部説明の引受を分ける。[既存境界の静的照合](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_BIND_BOUNDARY_STATIC_REVIEW_DESIGN.md)では、調べた範囲で登録だけを欠かせる適格な入口を確認できなかった | 引受担当・期限は未確定。通常の実結合と単独欠失を分ける適格な境界、最初の拒否に介入しない観測、同一性・終了確認の根拠が必要。未確定の候補で不可能と証明したものではない |
| A1-P07〜10：処遇・受容・承認 | [三案の審査条件](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_NO_CONTROL_DISPOSITION_REVIEW_DESIGN.md)に照らし、今回は下記の進め方を推奨するだけ | 選択・受容・承認は未記入。ED06の個別処遇、AP04の結果差、AP02の実装、AP05の検証／旧試験切替、AP06の公開は別判断 |

## 2 次の判断と停止条件

- **推奨する進め方：旧試験と旧保証の要求を維持し、回復先行の審査を続ける。** まず、どの既存位置なら通常の実結合から登録だけを欠かせるか、観測が最初の拒否を変えずに判別できるかを、試行前に審査する。成立点・担当が示せなければ保留を続ける。新friendの追加、旧入口の再露出、別位置の失敗で代用する案は採らない。この推奨は処遇の選択・実施許可ではない。
- **外部影響の確認に進むには別の判断が要る。** [段階1〜4の証拠受渡し案](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_EXTERNAL_USAGE_PREAPPROVAL_HANDOFF_DESIGN.md)は実資料未指定で段階1停止。対象と利用時点の対応、操作別権限、版固定、秘匿化を揃えても進めるのは個別承認の審査まで。同じ版・範囲への別の閲覧承認と記録／保持・停止時の引受条件なしに閲覧しない。旧保証維持や回復先行の審査を進めることは、外部影響の確認を済ませたことにはならない。
- **非提供の受容には進めない。** 適格な欠失対照が見つからないことだけでは受容根拠にならない。通常Kを維持する独立根拠、旧Promise利用者への結果差・影響と引受先、未代替保証・回復条件が揃ってから個別審査する。不足のまま別案へ自動移行せず、ED06を保留する。

旧試験／fixture・期待値・注入位置、通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・調査保留・閲覧0・起動0を維持する。今回は本MDの追加のみ。外部照会・閲覧、実装・試験実行・梱包、設定変更・公開・コミット・Pushは行わない。
