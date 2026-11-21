# AP05 G02：ED06／ACK-36 回復先行審査 — 通常登録の単独欠失と非介在観測

Version: release-ap05-g02-ed06-ack36-recovery-boundary-review-draft-0.1 / Date: 2026-11-20。

Status: **静的審査のみ。照合した現行経路からは、登録の単独欠失を作る適格な既存入口も、必要な証拠を最初の拒否に介在せず取得する既存手段も確認できない。候補での可否はUnknown。ED06の処遇は未選択・未承認。実資料は未指定、外部利用はUnknown、閲覧は未承認・閲覧0。候補revision・digest・観測手段は未確定。G02未充足、SL01は起動0。**

[既存境界の静的照合](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_BIND_BOUNDARY_STATIC_REVIEW_DESIGN.md)と[未変更候補の観測契約](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_UNCHANGED_CANDIDATE_BIND_OBSERVATION_DESIGN.md)を、現行HEAD `781c9b6` の通常経路と既存試験本文で再確認した。前回照合の基準 `42d803c` から、client、session、source、owner lifecycle、予算、adapter及びpackage定義の7ファイルに差分なし。両revisionは読取り基準であり、製品候補ではない。以下は現行source上の判断で、配布物や実行結果についての判定ではない。

## 1 登録だけがない通常の継続に届くか

| 境界 | 現行sourceの分岐 | 審査上の判断 |
|---|---|---|
| [sourceの通常release完了](../src/review/bounded-source.ts#L193) | 非matchedではPermitを作らない。matched時はsource内にPermit・固定snapshot・portを作り、sessionのbindが正常復帰してから同Permitを返す | 取得結果でreleaseを非matchedにすることは、正規Permitが成立した後の登録だけの欠失ではない |
| [sessionの通常bind](../src/servicenow/bounded-read.ts#L632)・[ownerの登録確定](../src/servicenow/review-evidence-lifecycle.ts#L242) | sessionは同sourceのportを取得し、ownerの `bindSource` がfalseならthrow。ownerの初回trueは `sourceBinding` と `sourceClaim='claimed'` の確定後。重複等でfalseの経路も正常復帰しない | 確認した通常経路では「bindが正常復帰・登録は一度も確定していない」の組を作れない。false・throw・同参照不一致でrelease段階に止まるケースを、後段metadataでの欠失対照にしない |
| [通常adapterの依存受渡し](../src/review/update-set-adapter.ts#L79)と[owner生成](../src/servicenow/review-evidence-lifecycle.ts#L32) | sessionへの依存はfetch・signal・limits。workerFactoryはworker側。通常sessionのownerは生成元のprivate fieldに保持され、同sessionへの再登録は拒否 | 確認した通常入口・依存の範囲に、登録だけを変える既存境界は見つからない。別owner・登録後の取消／close・旧prototype no-opは対象から除外 |

## 2 最初の拒否と観測の独立性

- [通常metadata](../src/review/update-set-adapter.ts#L120)はsourceの `listMetadata` を呼ぶ。[sourceのguard](../src/review/bounded-source.ts#L102)はactiveと同Permitを、[session](../src/servicenow/bounded-read.ts#L638)はportを照合してから owner の `inspectSource` に進む。[inspectSource](../src/servicenow/review-evidence-lifecycle.ts#L94)は登録の有無を判定する**前**に `check` を呼び、期限・予算等で先に拒否し得る。登録なしと、他の束縛不一致は同じ内部reasonに落ちる場合もある。外向きの `metadata / internal_review_error`、取得未到達、事後の空slotだけでは、どの条件が最初に拒否したかを区別できない。
- `reviewReleaseStatus`／`reviewReleaseSourceStatus` は通常guardと同じ検査を呼ぶ。guard前に追加すれば自ら不一致を判定・停止させ得るので不適格。`reviewRunStatus` も[ownerの予算確認](../src/servicenow/review-evidence-lifecycle.ts#L72)と失効の伝播を伴い得る。返り値のreadonly性を非介在とみなさない。
- [予算の `stats`](../src/servicenow/review-canonical-budget.ts#L48)は件数・bytesのコピーで、lease読取りとは別。通常出力・合成fetchの到達記録と合わせても、補助証拠に限る。経路ごとの記録に欠落があれば非通知を0とせず、同参照や登録履歴、最初の拒否を推定しない。事後の空slotは[失効によるclear](../src/servicenow/review-evidence-lifecycle.ts#L58)と区別できない。

## 3 既存試験から転用しない判定

| 既存試験の記述 | 確認の対象 | ED06で不足するもの |
|---|---|---|
| [旧ACK-36](../tests/review/private-composition-ack.test.ts#L92) | 旧synthetic runのbind全体をno-opにした後のPromise拒否 | 同じ候補bytesでも実行経路の差替えは未変更候補の通常対照ではない。通常guard到達・最初の拒否・終了を直接assertしていない |
| [source-release-binding：通常成功](../tests/review/source-release-binding.test.ts#L12) | 正規Permitと独立したrelease snapshot、通常metadataへの到達 | metadata前に状態確認を呼んでいる。通常結合の開発側の正対照の読み取りには使えるが、guard前の非介在や未変更候補の実績にはならない |
| [source-release-binding：負の対照](../tests/review/source-release-binding.test.ts#L26)・[run-owner-lifecycle](../tests/review/run-owner-lifecycle.test.ts#L54) | 取消・close、別session／偽造Permit、二重登録等の拒否 | 登録後の失効、同参照の不成立、代替ownerの拒否はそれぞれ別。登録だけが一度も確定せず最初の通常guardまで届くという根拠ではない |

## 4 再審査に必要な二つの証拠と今回の判定

1. **欠失の成立**：同一の未変更候補・通常実装を別fresh runで使い、各run内で同source／session／snapshot／lease／readyと正規Permit／portが成立し、先行停止がないなかで、後段登録の確定だけが異なると説明できる既存入口の根拠。これがなければ後段欠失として受理しない。
2. **拒否の非介在観測**：追加の状態確認・callback・時計／予算再読取り・待ちや先行停止を増やさず、同runの通常guard到達、登録の未確定、最初の拒否、metadata取得／後続dispatchの未到達を分けられる根拠。独立した終了四軸・保全は別記録。二つの証拠の片側だけでは実施審査へ渡さない。

**両方の根拠は未充足。** 対照を候補slotやPΔに割り当てず、起動0。通常成功・旧試験維持・Pでの入口不在を保証回復に換算せず、非提供・AP04の結果差の受容にも自動移行しない。候補での可否はUnknownに残す。必要根拠が具体化しても、[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)のpin・権限・隔離・費目・終了／保全を別途審査する。

旧試験・期待値・注入位置、通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、元期限、Unknown・調査保留・閲覧0・起動0を維持する。変更は本MDのみ。外部照会・外部資料閲覧、故障注入・実装・実測・試験実行・梱包、設定変更・公開・コミット・Pushは行わない。
