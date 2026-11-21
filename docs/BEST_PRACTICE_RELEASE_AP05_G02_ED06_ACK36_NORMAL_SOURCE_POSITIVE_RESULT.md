# AP05 G02：ED06／ACK-36 開発用通常経路の正対照結果

Version: release-ap05-g02-ed06-ack36-normal-source-positive-result-draft-0.1 / Date: 2026-11-20。

Status: **現行source上で開発用の正対照1件成功。通常候補での単独欠失・最初の拒否の非介在観測、旧Promise保証の回復は未確認。ED06の処遇は未選択・未承認。外部利用はUnknown、閲覧0。候補revision・digest・観測手段は未確定。G02未充足、SL01起動0。**

[外部資料に依存しない証拠取得案](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_INTERNAL_EVIDENCE_ACQUISITION_DESIGN.md)の§2に限り、ユーザー承認のもとで[開発用正対照1本](../tests/review/ed06-normal-source-positive.test.ts)を追加して実行した。HEAD `32a24ae` は現行sourceの読取り基準で、配布候補ではない。[先行owner対照の結果](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_OWNER_REGISTRATION_CONTRAST_RESULT.md)とは別run・別記録。

## 1 確認した正対照

| 区間 | 実際に確認したこと |
|---|---|
| 通常取得と最初のmetadata | 実 `BoundedReadSession`・通常2引数の実 `BoundedUpdateSetSource` を使用。固定の合成fetchで親 → release → metadataの順に各1回。releaseが返した同じsourceのPermitを直ちに `listMetadata` に渡し、指定行1件・非切詰めを確認。guard前に追加の状態照会、時計／lease読取り、prototype・method置換はなし |
| 会計 | metadata返却後の同sessionでrequests=3、received_bytesは3合成応答のUTF-8 byte数の合計、payload_bytes=0。通常close後も会計が増えない |
| 終了と再利用拒否 | `session.run` の通常close後に、構築診断のsealed・teardown confirmedと、registered owner・core・admission各1回解放を確認。ownerのclosed・ready無効を事後確認し、同Permitでの再利用はclosedとなり、追加の合成fetch・会計は0 |

合成fetchに実通信への委譲・fallbackはない。正常結果は、[現行sourceのguard](../src/review/bounded-source.ts#L224)と[sessionの登録照合](../src/servicenow/bounded-read.ts#L638)を通る正対照であり、登録なしの場合の最初の失敗位置を観測した証拠ではない。終了はこのsource/sessionのもの。adapterやworker起動、候補系列のrunner／worker／stdio／cleanupの終了四軸は対象外。

## 2 実行結果と残差

- 実行：`bdo proxy npm test -- --project unit tests/review/ed06-normal-source-positive.test.ts`。Vitest v5.0.3、1ファイル・1件成功、終了コード0。このターンで既存試験・先行owner対照・全体回帰は再実行しない。
- 現行sourceへの通常正対照と、開発用ownerの登録なし／期限先行の対照は取得済みだが、同じ配布候補の正負対照ではない。将来は[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)に沿って、固定した候補での実解決・構造／通常正対照を別途確認する。現行要件では単独欠失と非介在観測が未充足のまま。複数根拠を使う場合でも採否は別審査で、旧保証回復・非提供の受容や公開に換算しない。
- 結果を残す以外に資料指定・外部照会・閲覧、候補検証・build／梱包、コミット・公開・Pushは行わない。本番コード・旧試験・期限・閉鎖条件・調査保留・閲覧0・候補起動0は維持する。
