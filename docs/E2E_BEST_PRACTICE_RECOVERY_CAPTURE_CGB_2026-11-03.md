# CG-B 保護capture owner・post-guard受理・一度限り移譲 検証記録

Date: 2026-11-03 / 基準HEAD: `886d037`（CG-A実装`00bd3ca`と追加互換試験を含む）。

## 1 実装範囲と保証の境界

[内容gate設計draft-0.4](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_CONTENT_GATE_DESIGN.md)§12に従い、配布対象外の[合成capture層](../tests/support/review/synthetic-recovery-capture.ts)を追加した。fresh closureごとに別台帳を生成し、実class・既存assembly・fixtureの登録台帳を共有しない。runtimeのソースは変更していない。

- own-dataの固定期待contextを正規化copyし、同instance／release／Update Setと固定順のinput slotを作る。guard依存も一度pinする。
- 同inputの一度限りのdeliver claimを先に消費し、厳密なenvelope相関と元JSON長を検査する。空の別brand wire handleを返す。
- acceptでは同wireを先に取り外し、pre guard→CG-A同文字列のfull schema検証→元context照合→post guardの順で進む。局所失敗でもpost guardを通し、停止・先行hardを優先する。成功後だけprivate captureを公開する。
- 同正規化immutable本文を保持し、外へ本文やreadonly viewを返さない。移譲もpre/post guardを通し、同じ参照の索引だけを一度private manifestへ移す。外側handleやsummaryには本文が入らない。
- 同rootの固定discard、cancel／deadline／未知例外・再入でprivate参照を取り外す。最初の固定失敗理由と累積受理件数だけを残し、失敗後は再利用できない。物理heap消去・実worker cleanup完了は保証しない。

captureはreviewed専用。元analyzeでomitted等だった値に本文を捏造せず拒否する。AcceptedNonReviewed、親finding省略証拠、既存accepted／plan seal・finish jobとのbindingは後続であり、今回の空manifestをそれらの証拠へ昇格しない。実origin／全体予算・content gateはUnknown、authorityはnone。

## 2 RED／GREENと初回失敗

最初に未存在helperのimportでREDを確認し、正常capture→固定discardまでGREENにした。その後、次の境界を1件ずつRED→GREENで追加した：mutable guardの後書換え、固定順序違反、受理後から移譲までの取消、異なるinstance／release／Update Setの混入、Proxy guard関数。二重claim・post-guard停止・再入・失敗後の再利用は同じ公開合成操作から検査する。

拡張試験の初回は46件成功・100件境界1件失敗。期待contextの収集枠を配列全体へ適用していたことを切り分けた。1件のJSON文字長は1,322、100件では132,301で、keyを含むUTF-16文字費×3は局所262144枠を超える。件数は100のまま、own-dataの外側配列を先に制限し、1件ごとに同じ有限収集枠を適用した。全体受付を有効化したり、製品の期限を緩めたりしていない。

strict型検査の初回は14件のエラー。localなnever-returning fail関数の型が制御フローへ認識されず、Map取得値等がundefinedのままだった。fail変数へ明示的なnever関数型を付け、最終capture格納時にもreviewed variantを確認して解消した。

診断用tsx CLIは内部pipe待受が制限環境でEPERMとなった。環境変更や許可拡大はせず、待受を使わない`node --import tsx`で文字長だけを確認した。本文・資格情報は出力していない。

## 3 最終検証

| 検証 | 結果 |
| --- | --- |
| CG-B新規合成試験 | 56件成功 |
| CG-B／CG-A／finish比較／seal／aggregate関連 | 5ファイル・413件成功 |
| 全体回帰1回目 | 260ファイル・12,587件成功（Proxy guard関数試験追加前） |
| 最終全体回帰 | 260ファイル・12,588件成功、失敗0、pending 0 |
| build | 成功 |
| helper／試験のstrict TypeScript単独検査 | 成功 |
| 変更TS・梱包試験のESLint | 問題なし |
| 梱包 | 441ファイル。CG-B helper／brand／scope／発行関数は非同梱。固定import監査とruntime／I/O／clock／worker／漏出のseeded負の対照成功 |

100件の固定順受理とmanifestの一度限り移譲／固定discard、copy／別root／異なるslotの拒否、post guard前のcapture数0、移譲post guard前のmanifest数0、取消・期限切れ・再入・未知例外・最初の診断保持を検査した。schema不適合でもpost guardの停止が局所理由より優先する。caller期待値の後書換えやfreeze副作用、getter／Proxyの実行、本文のsummary露出も拒否した。

全体回帰には既存のlocalhost合成待受試験だけを許可し、外部サービスへ接続していない。CG-B自体は注入同期guardだけを使い、native worker／transport／時計／timerを呼ばない。旧試験は削除していない。

## 4 費用・寿命・残課題

1件の期待context収集・schema copy、wireごとのCG-A decode／schema copy／freeze、最大100件のcapture索引、移譲時のMap索引複製とguard／clearを別費目にする。本文graphの追加cloneはしないが、元wire・decoded tree・Zod正規化値・期待contextの同時保持を無料とは扱わない。wire長の理論和だけでも100×262144 byteになり得る。全体CPU／heap／work上界と元60秒の中断粒度は未証明、既存C/G/P会計にも加算していない。

次は既存accepted／planへの一度限り移譲bindingと、非reviewed受領物・合法omissionの保持／照合、同finish jobのfull比較と終端証拠が必要。元descriptor pin・RD-B04 handleのUnknownを今回書換えない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。実接続・実通信・実機操作・設定変更・本番cap／Permit／候補発行・Pushは行っていない。本作業のコミットもまだ行っていない。
