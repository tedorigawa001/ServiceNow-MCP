# AP05 G02：ED06／ACK-36 欠失対照が見つからない場合の処遇審査条件

Version: release-ap05-g02-ed06-ack36-no-control-disposition-review-draft-0.1 / Date: 2026-11-20。

Status: **審査案のみ。ED06の処遇は未選択・未承認。旧保証の回復は未確認、候補での欠失対照の可否はUnknown、G02は未充足、SL01は起動0。候補revision・digest・観測手段・欠失を作る手段は未確定。数値・保全方式・保全先は未承認。** 静的照合基準 `a0982e6` は文書と現行source／旧試験の参照で、製品候補ではない。

[ED06の静的照合](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_BIND_BOUNDARY_STATIC_REVIEW_DESIGN.md)を受け、[未変更候補の観測契約](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_UNCHANGED_CANDIDATE_BIND_OBSERVATION_DESIGN.md)と[回復先行案](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_RECOVERY_ACCEPTANCE_DESIGN.md)の条件を前提に、[個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED06／N2-R11だけを審査する。票・正規旧case分類・[横断審査表](BEST_PRACTICE_RELEASE_AP05_G02_ED_RECOVERY_CROSS_REVIEW_DESIGN.md)は更新しない。通常経路・旧試験／fixture・期待値・注入位置を維持し、通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・故障注入・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 審査の前提：見つからないことと、失ってよいことを分ける

- **旧保証（H）。** [旧ACK-36](../tests/review/private-composition-ack.test.ts)は、旧synthetic runで既存prototypeの `bindReviewReleaseSource` を非throwのno-opにし、呼出しが返したPromiseの `code: internal_review_error` による拒否を確認する。[NS02 N2-R11](BEST_PRACTICE_RELEASE_AP01_NS02_ACK_RELEASE_GUARANTEE_REVIEW.md)では未対応のまま。元caseは細かな内部拒否位置、一次理由、I/O回数、cleanup完了を直接assertしない。旧試験とその元の実行条件を残すことは全案共通で、候補配布物でもこの保証を維持・回復したことにはならない。
- **候補側の不足。** 静的照合した現行の通常entry・注入面では、同sourceで正規のPermit／portが生成された後、登録ownerの後段結合だけを欠かして通常の最初のmetadata guardへ進める適格な既存境界が見つかっていない。未確定の候補配布物で不可能と証明したわけではない。欠失を作る手段と、通常guardの拒否を先取りしない観測手段は別の不足。候補の通常成功、不在、Hのno-op、D／PΔでこの不足を埋めない。
- **三つの判定を混ぜない。** 旧専用経路を「提供しない」は提供範囲の判断、同位置の保証が「未代替」は証拠の状態、候補の実施可否が「Unknown」は未確認の判定。いずれも他を自動で確定しない。[限定公開方針](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)の採用は個別の保証低下の承認ではない。

## 2 三案を審査できる条件（どれも未選択・未承認）

| 処遇案 | 審査に必要な条件 | 足りない場合の扱い |
|---|---|---|
| 旧保証維持 | 元の旧revision・実class／fixture・matchedに至る合成入力・no-op注入位置・Promise拒否をHで要求し続ける。候補にも同じ旧挙動を要求する場合は、保持すべき参照・元位置・直接assertionを候補に結び、証拠と閉鎖条件が両立することを示す | Hが残っていても候補の同等性は未確認。候補で旧入口・friendを再露出しなければ維持できない、または同じ保証を示せない場合は候補を止める。旧挙動を配布する例外を設けず、他案へ自動移行しない |
| 回復先行を継続 | 旧保証の残差を個別票に残し、欠失を作る適格な既存境界と、非介在の観測境界の両方に、何を示せば再審査できるかを定める。未変更の同候補上の別fresh runで通常実bindと単独欠失を分け、同Permit／同ownerの通常guard・最初の拒否・後続取得前停止・診断／終了を区別する | 適格な欠失／観測手段がない、または位置・同一性・順序が説明できなければ保留・起動0。設計上の探索を継続できても実施許可や回復認定ではない。別設計や変更を加えた候補が将来必要なら、新たに審査し、元の候補の証拠にはしない |
| 個別の非提供 | 旧synthetic後段のprepared／拒否Promiseと、元故障位置でその拒否を判別する旧専用保証に限って審査する。§3の切り分け、通常K維持の独立根拠、未代替保証の明示、利用者への結果差・影響と引受先、将来の回復条件を同じ個別票に揃え、保証低下を明示的に別決裁する | 適格な対照が見つからないことだけでは審査を通さない。通常の結合欠失拒否まで失う、通常側の影響・共有責務が不明、外部影響を評価できない、又は許容できない場合は受容不可として停止。Unknownを無影響や回復済みに変えない |

## 3 非提供を提案する場合でも除外できない事項

| 審査欄 | 必要な証拠・扱い |
|---|---|
| **非提供の対象と切る辺** | [G01のED06](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)と[AP02範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)のS03／05／07に沿い、旧 `synthetic_io` のoverload／専用型、fake I/O・ack／capture、後段の旧prepared／拒否Promiseと、そのfaultを元位置で検査する保証だけを対象候補にする。候補の出力層と解決した旧専用到達辺は別確認。共有 `bindReviewReleaseSource`・通常factory、通常停止／rollback／closeは対象外 |
| **通常K02〜04と証拠の限界** | 同候補で通常 `matched` 後に同source／Permit／portと登録owner・readyが実結合し、同Permitで通常metadataへ進むこと、通常の不正・失効時に取得へ進まないこと、同core会計・初期結合・予約返却、一次理由・通常停止／rollback／解放を、各受入条件に対応する根拠で保つ。通常P+や偽造／foreign・close後拒否だけでは正規Permitの登録だけが欠ける対照にならない。通常側にもその正確な欠失対照が必要なら、省略を承認対象に紛れ込ませず、不足のまま候補を止める |
| **結果差と外部説明（AP03／AP04）** | 旧後段はPromiseを返して `internal_review_error` でrejectする。一方、[C02〜04案P／C06の採用記録](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md)は、禁止own `synthetic_io` を受付で同期 `invalid_input` とする仕様で、旧後段は実行しない。戻り値につなぐ `.catch` は同期throwを扱わず、同じ `try` 内の `await` で捕捉できても返却契約は同じではない。専用宣言・deep importを含む旧利用者の範囲、影響と案内を別欄に残し、利用実態がUnknownなら「利用者なし」としない。[AP04の結果差](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)としてDのunknown／withheldも旧rejectへ換算しない |
| **残差・引受・将来回復** | Hの保持担当、通常結合／診断・停止／解放のowner、配布審査の境界、結果差と外部説明の担当を分ける。見つかっていない対照・受容してはならない通常側の影響・再審査を開く条件を記入する。回復判定は元位置・同一性・正負対照・source／compiledと同候補の結果・終了確認を要求し、日付や別rootの成功で自動解除しない。人・期限・実施方式は未確定 |

外部説明に書ける範囲も個別審査の案に限る。将来承認された場合でも、「閉鎖中の旧合成入口とその後段Promiseは提供しない」「通常経路の保証と旧試験は別に維持する」「旧位置の保証は未代替」を分ける。移行完了・保証同等・正式発行可能とは書かない。今回は説明の承認や公開を行わない。

## 4 個別票への受渡しと起動0

1. [AP01残差台帳](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)のA1-P01〜06に元case／入力・注入位置・元assertionと候補との差、通常Kの根拠と不足、引受役割・再審査条件を対応付ける。A1-P07の選択、P08の受容条件、P09の決裁欄は未承認のまま。将来は承認者・日付・対象revision／assertion・除外と根拠を個別に記録する。文書・コミット・限定公開方針は承認の代わりではない。
2. A1-P10のAP02実装／friend撤去、AP03の既採用仕様を超える変更、AP04結果差の受容、AP05候補検証と旧試験切替、AP06公開は別判断。文書上の審査と証拠取得の許可を分け、候補実績のないまま保証回復・候補受入を認定しない。
3. [候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)に従い、必要な処遇・通常K／共有責務・対象pin・手段と権限、前slot終端またはcleanup予約が欠ければ起動0。正対照の計画だけで欠失対照を既存slotへ割り当てない。現時点では三案とも未選択・未承認、旧試験と閉鎖を保持し、**Unknown・調査保留・G02未充足・SL01起動0**を維持する。
