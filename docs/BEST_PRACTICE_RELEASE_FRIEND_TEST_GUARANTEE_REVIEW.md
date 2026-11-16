# リリース準備：friend撤去前の試験保証・配布境界の再照合

Version: release-friend-test-guarantee-review-draft-0.1 / Date: 2026-11-16。
Status: **静的整理のみ。旧試験・期待値を維持し、試験移行・friend撤去・build設定変更・再実行・梱包は未実施。** 通常経路未切替・正式発行口閉鎖・C実行入口／body起動閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。LOAD6／LOAD7等の方式選択は未承認のまま。実接続・実通信・実機操作・設定変更・公開・Pushは行わない。

## 1 目的・基準・判定の限界

配布境界の整理に先立ち、何を本番classの試験として残し、何を別assemblyへ移せるかを分ける。[旧330case対応表](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md)を置換せず、後続試験と梱包検査の依存を補う。[EF-03設計](BEST_PRACTICE_ABORT_SCOPE_KERNEL_ROOT_SEPARATION_EF03_DESIGN.md)§6〜8の保証低下・撤去・負の対照を具体的な着手gateへ結ぶ。

静的照合基準は`34b32470c6986dd45fa527da58a919378f528ea5`。旧表の基準`7b29542`からこのHEADまで、旧表対象の12試験ファイルは内容差分0だった。このため旧表の行参照を今回も使うが、330件の発見・実行・成功を再確認したことにはしない。旧表の「維持148／部分対応109／未対応73」は過去の静的分類であり、現在の成功数・置換率・削除可能件数ではない。

同じclassを使っていてもfake I/Oであり、実通信・実認証・正式証拠のprovenanceは証明しない。ファイル内には純粋owner試験も混在するため、ファイル全体を一括して実class保証に数えない。旧fullNameと入力条件は旧表を正規参照とし、本書で別名のcase IDへ置き換えない。

## 2 旧試験の処遇と未代替保証

| ID | 旧表の群／正規参照 | 残す保証と現時点の扱い | 別assemblyの限界／撤去前条件 |
|---|---|---|---|
| GT01 | [ET-01〜25](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-et-01)、[construction transaction](../tests/review/construction-transaction.test.ts) | 本番factoryの最初のshell、生成失敗、部分rollback、admission返却、run／construction診断分離を維持 | 開発rootの類似faultで置換しない。本番artifactでのcompiled保証も残す |
| GT02 | [KEEP-01〜35](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-keep-01)、[private composition](../tests/review/private-composition.test.ts) | `synthetic_io`省略時の固定summary、C=0、停止・解放、既存sessionの採用拒否を維持。純粋owner assertionは別集計 | synthetic laneと一括削除しない。通常の既存fetch境界を無断撤去しない |
| GT03 | [EK-01〜28](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-ek-01)、[US-01〜60](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-us-01) | 純粋kernel／status値modelの旧試験を維持 | kernel履歴ラベル・合成consumer成功は実class参照bindingの証明ではない |
| GT04 | [SA-01〜26](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-sa-01)、[SAB-01〜11](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-sab-01) | 実session／source／登録ready世代、close前の一度消費、失効・公開境界を維持 | PC-01／02／04は未代替。特にSAB-08〜11の偽ready、draft後失効、private return後取消、元floorを同条件で回復するか、失う保証として個別承認が必要 |
| GT05 | [ND-01〜30](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-nd-01)、[NDB-01〜08](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-ndb-01) | 実classと注入Responseの連続性、同core／source、元cleanup境界、HTTP／cleanup／上位理由の保持 | 開発native試験の別brand・別cleanup実装で代替完了としない。NDBの公開直前／外側close境界も残差にする |
| GT06 | [ACK-01〜37](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-ack-01)、[ACKB-01〜02](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-ackb-01) | 同bytes課金・private ack・legacy release判断と失敗時の解放 | PC-03は未代替。RC-02純粋比較やRC3開発summaryが成功しても、実Permit／通常sourceの互換保証へ昇格させない |
| GT07 | [UN-01〜62](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-un-01)、[native workflow](../tests/review/native-diagnostic-workflow.test.ts) | 注入reader所有・cancel／closed／releaseLockと一度消費の独立assertionを維持 | 旧NDと開発STのcleanupは同一実装ではない。共有関数・故障位置・assertionの単位で対応を追記する |
| GT08 | [FR-01〜06](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-fr-01)、SA-26、ND-30 | 現在は旧friendの一度取得を検査するため維持 | 撤去時は「最初も取得不可」へ意図的に仕様変更。2回目take拒否だけの検査を新仕様の保証として残さない。FR全件を同一変更として自動削除しない |

現時点で旧試験削除・skip・期待値の弱化を認める行はない。PC-05（選択window／payload／worker job）は旧330件でも完了しておらず、今回の分離準備にも含めない。実classの閉鎖native経路を失う場合、未確認範囲と非提供機能を明示し、保証低下の個別承認を得るまで分離完了・製品公開可能と判定しない。保証回復のために新しいfriend／installerを追加しない。

## 3 旧表以外の後続依存を落とさない

次の4ファイルには旧12ファイル外の`synthetic_io`呼出しがある。新たな全case対応済み表ではなく、移行前にcase単位の再照合が必要な依存一覧である。一部の通常source試験までまとめて開発rootへ移さない。

| ID | 現行試験 | 維持すべきassertionと未代替部分 |
|---|---|---|
| AD01 | [release-session-projection](../tests/review/release-session-projection.test.ts) | 実sessionのdeadline getter・startedAt・pin済みpolicy・同値別session拒否、残時間からの再計算拒否、停止時release未dispatch。末尾の通常source判断不変のcaseは本番側で維持 |
| AD02 | [release-observation-session](../tests/review/release-observation-session.test.ts) | guard位置の一度UTC、空200時の内部採取と旧公開shape、時計throw／逆行／取消・元S／L不変。開発側の任意observed_at入力だけでは採取位置の代替にならない |
| AD03 | [release-comparison-receipt-session](../tests/review/release-comparison-receipt-session.test.ts) | 同body bytes課金、caller改変・外部candidate拒否、close後再利用拒否。推測constructor keyの拒否は現行private閉包に依存するため、撤去後の境界負対照へ対応付けが必要 |
| AD04 | [release-time-handoff-session](../tests/review/release-time-handoff-session.test.ts) | late clock境界・handoff／source close／discardの同期停止、admission／timer解放、旧公開summary不変。新ownerだけの単体試験で終端間の連続性を代替しない |

加えて[静的診断試験](../tests/review/native-status-diagnostic.test.ts)は旧12ファイル外で[ND module](../src/review/abort-scope-evidence-native-diagnostic.ts)をimportする。同moduleは純粋runner以外にmodule評価時の`takeNativeStatusCompositionProbe()`取得を持つため、「case本文が実classを呼ばない」だけでは撤去後に動くとは判定しない。GT07と合わせ、純粋診断・注入workflow・実class friend orchestrationのimport依存を分ける設計が必要。SA側も[probe module](../src/review/abort-scope-evidence-source-status-probe.ts)がmodule評価時にfriendを取得する。

依存棚卸しは直接の名前検索に加えて、将来の実装時にはimport／再export／dynamic import／compiled fixture／scriptからの推移閉包で再確認する。今回の検索結果を閉包の完全証明や新しいcase総数として使わない。

## 4 compiled／梱包検査の移行先

| ID | 現行参照 | 互換性維持／意図的変更と必要な対照 |
|---|---|---|
| PK01 | [canonical梱包検査](../tests/review/package-canonical-budget.mjs) | 現在は`review-composition-fake-io`のJS／宣言／map同梱を要求する。撤去時は非同梱へ反転し、同scriptの[compiled ack](../tests/review/fixtures/compiled-private-composition-ack.mjs)を開発artifact側へ再構成する。canonical core／通常session／typed dispatch保証は本番側で残す |
| PK02 | [HTTP梱包検査](../tests/review/package-http-classification.mjs) | [compiled status binding](../tests/review/fixtures/compiled-source-status-binding.mjs)と[compiled native composition](../tests/review/fixtures/compiled-native-session-composition.mjs)はfriend依存。本番artifactの不在検査と開発artifactの連続試験を分ける。既存の他の負の対照を一括削除しない |
| PK03 | [compiled time handoff](../tests/review/fixtures/compiled-release-time-handoff.mjs) | synthetic lane依存の後続fixtureも移行台帳へ追加。実行元とassertionをcaseごとに固定し、未移行なのにcompiled保証済みと報告しない |
| PK04 | [標準worker梱包検査](../tests/review/package-worker.mjs)、[梱包設計](BEST_PRACTICE_BP5_PACKAGING.md) | 本番依存のみの隔離起動・通常worker／MCP機能の正対照を維持。friend不在が単なる必要依存欠落による失敗でないことを併記する |

新compiled保証は空の専用出力・本番／開発の別artifact・ソース／tsx fallbackなしで確認する計画とする。JS export／AST／宣言／map／依存閉包・実tarballの負の対照はEF3-N01〜N09へ対応付ける。旧fixtureを消して成功件数を保つ方式や、package除外だけで同梱class内のfriendを除去済みとする方式は採らない。今回はbuild・pack・依存install・process対照を実行しない。

## 5 対応順と承認gate

| ID | 優先度／次工程 | 完了条件（現時点は未完了） |
|---|---|---|
| RG01 | 最優先：GT04〜07とAD01〜04のcase／assertion対応 | source revision・fullName・入力・故障位置・同一性・診断層・実行artifactを固定。共有と未代替の実class保証を別欄で照合する |
| RG02 | 次：保証低下・互換変更のレビュー | 未代替PC-01〜04の回復方法または非提供範囲、friendの不在化、synthetic overload削除の影響を個別承認。公開範囲を勝手に広げない |
| RG03 | 次：B-03のcompiled移行と依存境界 | PK01〜03とimport時取得を同時に扱う。旧試験を残した準備段階で新artifactの正／負対照を揃え、撤去後も残す本番試験を確定する |
| RG04 | その後：EF-03C／Dとリリース候補検証 | 別承認の実装で閉包撤去・空build／tarball検査。対象commit固定後に型・lint・build・通常並列・compiled・隔離梱包を確認。文書整理だけでgateを開けない |

通常並列の[既存3件timeout対照](BEST_PRACTICE_WFB_SGA_PARALLEL_TIMEOUT_CONTROL_PLAN.md)は別軸の未完了項目とする。元の5秒期限・既定並列度を維持し、`maxWorkers=1/3`成功で代替しない。旧compiled対照の60秒timeoutとも合算しない。負荷採取profile・保管／process操作は未承認のままで、今回の表を再実行の承認にはしない。

- [ ] GT04〜07／AD01〜04の新case単位対応と未代替保証をレビューする。
- [ ] 実class保証の低下・非提供範囲とsynthetic lane削除の互換変更を個別承認する。
- [ ] 本番／開発compiled試験とPK01〜03の実行元・負の対照を確定する。
- [ ] friend撤去・build変更・検証再実行を別途承認する。
- [ ] リリース対象版・含める機能・公開審査を別途確定する。

## 6 今回の静的確認

旧12試験の基準差分0、現行sourceのfriend／synthetic分岐、旧表外の4つのsynthetic試験とND診断試験のimport時依存、PK01／02の既存同梱期待とfixture呼出しを読み取った。3文書のローカルリンク236件・表26個・本書の固定20行ID・未承認5項目を静的確認し、直接synthetic参照7試験（旧表内3／表外4）、module評価時取得2箇所、梱包検査の対象参照と差分空白を照合した。これは実行同等性・最新成功数・安全性全体・配布物の実体検証ではない。製品コード・試験・設定は変更せず、build・試験再実行・梱包・コミット・Pushは行っていない。
