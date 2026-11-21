# AP05 G02：ED06／ACK-36 複数証拠の個別審査

Version: release-ap05-g02-ed06-ack36-composite-evidence-individual-review-draft-0.1 / Date: 2026-11-20。

Status: **ED06／N2-R11の証拠を審査。通常経路については開発側の補助証拠、未変更候補の直接対照としては不採用。処遇・受入条件の変更は未承認。G02未充足、SL01起動0。** 読取り基準 `32a24ae` や隔離試作は製品候補ではない。

[ED06の個別票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)への添付案。本書の承認範囲は、構造・通常実bind・ownerの欠失対照を、直接対照と区別して個別審査するところまで。原票や[未変更候補の観測契約](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_UNCHANGED_CANDIDATE_BIND_OBSERVATION_DESIGN.md)は変更しない。

## 1 証拠を組み合わせて言えること

| 証拠 | 採る範囲 | 残差 |
|---|---|---|
| 構造照合（現行source） | 通常sourceはPermit／portを作ってから[sessionのbind](../src/servicenow/bounded-read.ts#L632)を呼び、[ownerの登録がtrueに先行](../src/servicenow/review-evidence-lifecycle.ts#L242)し、bindの正常復帰後に[同Permitでmatchedを返す](../src/review/bounded-source.ts#L193)。port不成立、登録のfalse／throwはここで短絡し、通常adapterではrelease段階に留まる。[最初のmetadata](../src/review/update-set-adapter.ts#L120)も要求を出す前に[同Permitとownerのguard](../src/review/bounded-source.ts#L102)を通る | 通常の公開入力と合成fetchに、登録だけを欠かせて後段へ進む境界は、照合範囲では見つからない。現行sourceの順序であり、候補の出力・実解決先・別経路の不在を証明しない |
| 通常の実bind正対照（開発試作） | 実client factory・session・通常2引数sourceで、同Permitによる最初のmetadata 1件、正常な合成GET 3・同bytes会計、session解放と閉鎖後の追加取得0。最初のmetadata guardより前に診断を入れなかった。隔離試作の通常検証4件にこの1件を含む | 正常入力の観測。adapter／workerは未起動。閉鎖後の拒否は、初めから登録なしの拒否ではない。候補・同tarballの実行結果ではない |
| 登録だけを省いた対照（実owner・合成identity） | [実ownerのguard](../src/servicenow/review-evidence-lifecycle.ts#L94)と[既存の開発対照](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_OWNER_REGISTRATION_CONTRAST_RESULT.md)。登録済みなら内容を返し、期限内で登録なしならnull・一次理由 `binding / evidence_binding_mismatch`。期限の等号では `owner / deadline_exceeded` が先で、同じnullを欠失と数えない。guard前の追加診断なし、欠失側の合成後続マーカー0、close後も先行理由を保持 | Permit相当値・port・leaseは合成。実source発行のPermit、sessionからの伝播、外向きエラー・実取得／dispatch・候補の終了四軸は観測していない。後続マーカーを実I/O=0と読み替えない |
| 旧ACK・時刻・取消（H、隔離した基準版） | 元ファイル2件／42テストの既存記録。旧ACK-36は[元の注入位置](../tests/review/private-composition-ack.test.ts#L92)でbindをno-opにし、返却Promiseの `internal_review_error` を確認。旧時刻・取消を元assertionのまま別領域に維持 | Hの成功は候補の旧挙動ではない。元ACK-36は厳密な最初の内部停止位置・要求数・cleanup完了を直接assertしない。案Pの早期同期 `invalid_input`、不在検査、変異検出の成功は旧Promiseの代替にしない |

構造は**通常期待する二つの停止境界**を示す。bindの失敗があればmatchedを返さない。通常の最初のmetadataに到達しても、予算・同一性・登録guardを通らなければ取得を開始しない。正対照はその通常経路が前進することを、合成owner対照は後者のうち**登録の有無に対するguard自体**を補う。三者が同一の候補runを観測したわけではない。特に通常の合成fetchから「正規の同Permit／同owner／readyは保ったまま、登録だけ一度も成立せず、最初のmetadata guardまで到達し、そこで止まった」という一連の因果は未確認。調べた範囲で適格な入口がないことを、候補でも不可能と証明したとは扱わない。

## 2 個別票の判定と停止

| 欄 | 審査結果 |
|---|---|
| A1-P01〜04：証拠・残差 | 上の3証拠を通常側の補助として採用可。Hは独立の旧保証記録。未変更候補での直接観測、配布物の保証回復・旧Promise互換・利用者影響なしの証拠としてはいずれも不可。今回の提示資料なし、外部利用はUnknown、閲覧0 |
| A1-P05〜06：責務・再審査 | 旧試験保持は開発側、通常の結合・一次理由・解放はsession／source・登録owner、実解決・閉包は配布審査、四軸の証拠と保全は外側owner。担当者・観測手段・数値・保全方式／先は未確定または未承認。同じ固定候補での実解決と通常の正対照、適格な欠失条件と非介在の直接観測、独立した終了確認は継続して要求 |
| A1-P07〜10：処遇と承認 | ED06の処遇は未選択・未承認。受入条件を変更しない。AP02本体適用・AP04結果差の受容・AP05候補検証／旧試験切替・AP06公開は別判断。他のED／NSにも波及させない |

## 3 次の最小作業案（別承認）

候補の入場を前倒しせず、開発専用の固定照合を先に試作する。現在の通常source／session／owner／adapterを静的に読み、(1) 実bind確定前にmatchedを返せない、(2) 最初の通常取得の前に同Permitと登録guardを通る、(3) 未解決・別名や先行停止がある場合は確定しない、を別判定として出す。検査感度は候補や製品を改変せず、合成の小さな構造例で「bind前にmatched」「guardを通らずに取得」「解決先不明」を区別して確認する。正規コード上の照合・合成構造例・既存の実行記録は別欄。成立してもG02の直接証拠の不足は埋めない。これらを将来別方式として審査するなら、候補固有の実解決・正対照、残る未観測部分、責務と採否を別の決裁にする。

正式発行口・C実行入口／body起動閉鎖、全体受付無効・通常経路未切替・旧試験・期限・調査保留・候補起動0を維持。今回は文書と既存記録の照合のみ。試験の再実行、候補指定・実装・梱包・実通信・外部照会／閲覧・コミット・Push・公開は行わない。
