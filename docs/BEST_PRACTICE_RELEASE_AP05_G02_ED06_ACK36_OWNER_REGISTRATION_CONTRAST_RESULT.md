# AP05 G02：ED06／ACK-36 開発用owner登録対照の結果

Version: release-ap05-g02-ed06-ack36-owner-registration-contrast-result-draft-0.1 / Date: 2026-11-20。

Status: **合成の開発側対照のみ。新規の対象テスト2件成功。未変更候補・通常adapterの登録単独欠失、実行時の非介在観測、保証回復は未確認。ED06の処遇は未選択・未承認。実資料は未指定、外部利用はUnknown、閲覧は未承認・閲覧0。G02未充足、候補SL01起動0。**

ユーザーの承認範囲は、[承認引継ぎメモ](BEST_PRACTICE_RELEASE_AP05_G02_RELEASE_ADVANCE_AND_APPROVAL_HANDOFF.md)で切り出したED06の開発用合成対照とそのローカル対象テストのみ。基準HEAD `32a24ae` は読取り基準で、製品候補ではない。[通常境界の再審査](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_RECOVERY_BOUNDARY_REVIEW.md)の停止条件を変更しない。

## 1 対照と観測

[追加テスト](../tests/review/ed06-owner-registration-contrast.test.ts)は[既存ownerの `inspectSource`](../src/servicenow/review-evidence-lifecycle.ts#L94)を直接使い、実在するguardの判定を複製しない。freshな合成identityを各runへ割り当て、同runのsnapshot・lease・source・Permit相当値・portを保って初期source結合とreadyを成立させる。正常側だけ後段登録を確定し、陰性側は最初から登録を行わない。未登録と登録後の取消・解放を混ぜない。

| 対照 | guardの結果・通常の依存呼出し | 合成の後続と終端 |
|---|---|---|
| 登録済み | 同じsource・Permit相当値に結び付いたreleaseのコピーを `prepared_only` で返す。lease・portが本来呼ばれた順を記録。一次理由なし | テスト内の後続マーカー各1。明示close後はclosed・ready無効 |
| 登録なし、期限内 | null、一次理由 `binding / evidence_binding_mismatch`。同leaseを1回確認し、portには進まない。登録状態はunclaimed | マーカー各0、開始時と同じ合成会計。close後も一次理由を保持 |
| 登録なし、期限の等号 | nullだが一次理由は `owner / deadline_exceeded`。同じnullを登録欠失による拒否と分類しない | マーカー各0。close後も先行の期限理由を保持 |

記録はownerが通常呼ぶ合成lease・port内だけで、最初のguard前に追加の `inspect`・時刻取得・待ち・実I/Oを入れない。一次理由と状態の明示取得はguardの返却後、終了状態は `finally` のclose後に確認する。親／releaseのカウンタは固定入力、metadata／dispatchのマーカーはテスト内の到達印であり、実取得・実worker・候補の会計実績ではない。

## 2 検証と残差

- 実行：`bdo proxy npm test -- --project unit tests/review/ed06-owner-registration-contrast.test.ts`。Node v24.18.0／Vitest v5.0.3。対象1ファイル、2件成功、終了コード0。旧試験や全体回帰、build／pack／展開、実接続は実施しない。
- 得られた根拠は、実owner関数についての独立合成対照。合成Permit相当値は本番sourceが発行したPermitではない。同じ通常候補で登録だけを欠かせる入口や、外側の `listMetadata`／`#requirePermit`、通常adapterの最初の拒否を非介在で観測できることはなお未確認。ownerのclosedは、実runner／worker／stdio／cleanup四軸の終了確認ではない。
- 個別処遇、AP04の結果差、AP02本番撤去、AP05候補起動・検証・旧試験切替、AP06公開はいずれも別判断。候補revision・digest・観測手段は未確定。旧試験・本番コード・期限・設定・閉鎖条件・調査保留は変更しない。外部照会・閲覧・コミット・Pushは行わない。
