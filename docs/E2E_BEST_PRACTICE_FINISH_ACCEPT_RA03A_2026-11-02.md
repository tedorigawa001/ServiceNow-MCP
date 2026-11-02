# RA-03-A 同handoff／発行証拠／routeの原子的受理 合成検証

Date: 2026-11-02。Baseline: `b2304be`。対象は配布対象外の合成kernelと固定facadeのみ。

## 1 実装範囲

`acceptRecoveryFinishContext(binding, handoff, evidence)`を同kernelへ追加した。owner／busy／hardの検査後、外部guardより前に受理claimとroute利用claimを占有し、元receiverのplan／handoff・bound・発行slotをまとめて局所pendingへ移す。同一性不一致・失敗でも元slotへ返さない。他rootの状態は変更しない。

元private pin／source／frame／ready origin／cleanup identityを再検査し、bounded projectionと発行時snapshotを共有予算の二入力比較器で照合する。post guardとlive再確認後だけ、別brandの空・凍結・null-prototype accepted handleを返す。原子的取り外し中に外部callbackは呼ばず、不一致はpost guardの取消／期限切れより先にhard化しない。前工程`b2304be`の発行時優先順位修正を維持する。

元planのstateは既存consumed、受理stateはaccepted。発行は履歴1を保ったままpending=false／consumedになる。期待値の実行利用と終端専用slotは別に保持する。source／cleanup開始で期待値だけを同期失効し、終端責務を残す。hard時は利用可能なprivate参照を破棄し、発行済みcleanup sinkの診断回収は維持する。

RA-03-Bは未実装のため、accepted後の終端専用slotを正常消費するAPIはまだない。source close・新cleanupを合成確認してもnormal closeは拒否する。今回のacceptedは非実行期待値であり、finish／E／候補／正常cleanup能力を発行しない。

## 2 REDからGREEN

最初の正常系1件は`acceptRecoveryFinishContext is not a function`で失敗した。同kernelのslot移譲・再比較・post後commitを実装して成功した。以後、以下の合成ケースを順に追加して検査した。既存RA-02④-A試験のmethod不在期待は今回の承認済みAPIとの差分として「issueだけではaccepts=0」に更新し、秘密非露出と会計prefix不変の検査を維持した。既存guard・試験期限は変更していない。

## 3 受入条件

- 元handoff・発行証拠・routeを一括で取り外し、pre／post guard中は受理handleを公開しない。
- 二重受理・別root・コピー・summary・raw descriptor・plan／ready・getter／Proxyの混入を拒否。他rootは不変で、caller accessorを実行しない。
- 発行前受理・失効後受理・失敗後再利用を拒否し、claimを復元しない。
- 両guardの取消／期限切れ・未知例外、guardに吞み込まれたaccept／issue／bind／check／discard／source／cleanup／close／summary再入で部分commitしない。
- 不正evidenceとpost取消／期限切れが重なった場合、post guard理由を保持する。
- 受理後のsource／cleanup開始で期待値を破棄し、終端専用slotは保持。未解放や未実装discardをnormal closeで隠さない。
- 受理後の旧handoff discard・summary・transfer・再issueを拒否し、同planを二度消費しない。
- issued／accepted／handoffの静的brandは別。acceptedを他rootの証拠として利用できない。
- 元会計prefix・旧closure事実を維持。固定7種類のworker起源、100行上限とconstructor pinの後変更不採用を確認。
- 診断へID／UTC／snapshot／結果／identityを出さない。legacy／lifecycle専用rootは新API・診断field・phase型を公開しない。

## 4 最終検証

| 検査 | 結果 |
| --- | --- |
| 新規`synthetic-finish-accept.test.ts` | 59件成功 |
| 関連7ファイル | 557件成功、失敗0 |
| 全体Vitest（maxWorkers=3） | 253ファイル・11,986件成功、失敗0・skip0、約37.2秒 |
| `npm run build` | 成功 |
| 新受理試験・既存発行試験を入口にしたstrict TypeScript検査 | 成功 |
| 変更5コード／試験ファイルのESLint | 指摘0 |
| `node tests/review/package-http-classification.mjs` | 成功、441ファイル |

全体試験はローカル待受可能な条件で実行した。外部サービス／PDIへの通信・実worker運用の試験ではない。梱包検査は新accepted型／scope／API名／試験の非同梱と、共通kernelの固定pure-value依存・I/O／clock／worker混入の負の対照を確認した。

## 5 残課題・維持条件

RA-03-Bのaccepted固定discard、source／新cleanupの正常終端能力、finish jobへの期待値封印、E／finish応答／候補、元analyze受理capture・実結果の由来は未実装。現在の公開合成sourceはverify=nullであり、実verify・実session／ReleasePermit／workerの真正性を証明しない。

取り外し・再projection・二入力比較・期待値／終端slot保持・guard／失効／解放の追加work／allocation・exact layout・全体上界はUnknown。会計prefix不変を追加費用0とはしない。正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持し、実接続・実通信・設定変更・Pushは行っていない。

設計: [発行・RA-03受理接続差分draft-0.3 §10](BEST_PRACTICE_ABORT_SCOPE_FINISH_ISSUE_ACCEPT_DESIGN.md)。
