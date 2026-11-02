# SC2-Aの終了証拠移譲とstrict準備入力の合成検証

Date: 2026-11-02 / 基準HEAD: `95121c2`。
Status: **配布対象外の合成issuer限定。verify・世代移行使用・新世代起動は未接続。**

[接続契約draft-0.3](BEST_PRACTICE_ABORT_SCOPE_WORKER_RECOVERY_CONTINUATION_DESIGN.md)§10を参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 1 実装と所有権

[同issuer](../tests/support/review/synthetic-soft-recovery.ts)のprepareWorkerRecoveryは、既存の発行済み・未消費closureEvidenceと同owner bindingを要求する。最初のguard前に準備claimを占有し旧slotを取り外す。成功時は元の証拠参照・旧origin・検査済み入力をprivate HeldClosureへ移し、post-guard後だけ別brandの準備handleを返す。公開consumerのdataやinspect・copy・別issuerからは作れない。

[純粋入力helper](../tests/support/review/synthetic-worker-recovery-input.ts)はstrictな12列、最大100件、完了集合・処理中receipt・T_i／U・C/G/P prefixを検査してimmutable snapshotを返す。処理中receiptは同facts.inputが一度だけ存在し、未完了であることを要求する。未処理をnot_processed／deadline_exceededへ確定し、完了済みreason・受理済み時刻を保持する。0 inputはO=Uでも拒否する。

失敗・取消・期限ではHeldClosureと準備handleを同期失効する。先行soft／hard・旧cleanup診断、集合件数と会計のscalarだけを保持し、prepare失敗から再準備しない。準備をnormal closeで隠さず、専用の一度限りdiscardで参照を破棄できる。discardは世代移行での証拠使用ではない。元ownerのUTCはnormal close／terminal discardまで従来どおり保持する。

window／verify／receiptはfakeの参照であり、実session・選択payload・WJ-Bの供給証拠ではない。helperの値結果から証拠を発行しない。C/G/Pはprefixのcopyのみで課金0、verify試行・世代移行使用・起動は0。操作を持つ任意のfactory／transport・新世代生成APIは追加していない。

## 2 合成試験と独立oracle

[新規117件](../tests/review/synthetic-worker-recovery-preparation.test.ts)。

| 観点 | 確認内容 |
|---|---|
| 7発生点 | 未起動、既存ready、ready timer／reply、割当済み未送信、analyze timer／replyで同じ準備規則を確認 |
| one-shot | 移譲1、旧consumerとの排他、公開data／copy／spent証拠の拒否、固定discardの一度限り、失敗後の再準備拒否 |
| guard oracle | 7発生点×prepare／discardの4点すべてで取消。claimと移譲0／1、参照失効、世代使用／verify／起動0を位置式と比較。成功は4 guard |
| binding | root参照・別owner binding／proof／準備handleの混入を拒否。他ownerの未消費証拠は不変 |
| 集合と時刻 | completedのstate／reason保持、active receiptの一意性、集合外／重複／欠落、未完了の完了昇格、O/T_i/U不整合とU欠落を拒否 |
| strict bounded | 12列・各rowのexact列、不正追加field／raw初回workerの拒否、1／100／101 target、100 input、C/G/P等号・超過・不正数値・時刻形式 |
| 停止と診断 | 取消／全体期限／receive失効、再入、先行hardと後続cleanup失敗を保持。元UTCの固定と正しい終端破棄 |
| 純粋性 | Proxy／getterの拒否、verify／budget／workerのoperation getter実行0、snapshot後のcaller書換えで変わらない |

pure helperから得た集合の比較は値契約の保証であり、正式なinput供給元や実cleanup保証ではない。追加のwork／allocation上界・本番capはUnknown。

## 3 REDと訂正の履歴

| 段階 | 観測と対応 |
|---|---|
| 移譲tracer | prepare stubで1件RED。同証拠slotの先行占有・HeldClosure保持でGREEN |
| U保持 | Uを欠落させても準備が通り1件RED。strict入力・集合／時刻のhelperを接続しGREEN |
| normal close | HeldClosureを保持したままcloseが成功し1件RED。未処理の準備を拒否してGREEN |
| 固定discard | stubで1件RED。handleとHeldClosureのguard前取外し・終端化でGREEN |
| 追加試験の期待修正 | 105件の段階で1件が、準備discard直後に元rootのUTCも消えると誤って期待し失敗。既存契約と照合し、追加診断slotにUTCがないことと、root UTCはcloseまで保持する期待へ修正。issuerのUTC保持規則は変えていない |

期限・試験のskip・型検査条件を緩めていない。上記は合成開発履歴で、製品不具合や実通信の観測ではない。

## 4 最終検証

| 検証 | 結果 |
|---|---|
| SC2-A＋SR-A／B／C① | 4 file／478件成功（117＋124＋121＋116） |
| 関連WJ-A／B／C＋SR-A／B／C①＋SC2-A | 7 file／783件成功 |
| build | `npm run build` exit 0 |
| standalone TypeScript | 新試験・参照helperをstrict／noUnusedLocals／noUnusedParametersで検査、エラー0 |
| 変更箇所ESLint | 新試験・helper・issuer・梱包script、問題0 |
| 全体合成 | ローカル待受可能な条件で単独実行。242 file／10,962件成功、failed 0／pending 0、exit 0、約38.15秒 |
| offline梱包 | `node tests/review/package-http-classification.mjs` exit 0、441 file。SC2-A関数／scope／path漏れとruntime／I/O／clock依存を負の対照で拒否。既存compiled回帰も成功 |
| 文書と差分 | 更新したMD6文書のローカルリンク82件・末尾空白・git diffの空白検査は成功 |

全体はmaxWorkers=3、verbose＋JSON reporter、silent、外側150000msで実行し、outer_stop=false。製品60秒・R2全体385秒／cleanup3秒・各test timeoutと実機E2E／transport除外は変更していない。既存回帰のローカルworker／HTTPはfake依存であり、SC2-Aのverify／起動を実装した検証ではない。梱包内の既存compiled回帰をSC2-A専用compiled保証／B-03へ流用しない。

最終JSON：`/private/tmp/servicenow-sc2a-full-20261102.json`。SHA-256：`7ad7f3409a4767991b39057bb88e7e09e3d0adf03c6199cc7173a7b826528fc4`。件数・時間はJSONの集計とstartTime〜最終testResults.endTimeを使用し、raw JSONはリポジトリへ追加しない。

## 5 レビュー修正（2026-11-02）

§2・§4の117件／10,962件は修正前の記録として残す。

**一般化した準備入力の扱い**：レビューで、処理中以外の未完了inputや、T_iがUより小さい処理中receiptも準備入力として受理されることを確認した（`[処理中=O, 別の未完了=U]`も通る。既存の100 input試験も処理中以外の99件を未完了とする）。実adapter（`update-set-adapter.ts`の解析ループ）は行ごとにT_iを採取して直ちに`await cpu().analyze`するため、worker期限の時点で未完了inputは処理中の1件だけで、そのT_iはUに等しい。WJ-Bの合成ownerがanalyze前に複数のinput receiptを受理できることに合わせた一般化として現行のhelperを維持し、その逐次順序は未保証と接続契約§3に明記した。一般化した組合せを受理することを示す試験を1件追加した。同じ一般化はSR-Bのphase型（実adapterでは未完了input 0件）にもあり、soft回復claim設計§13.1に同様に明記した。helper・issuerの実装は変更していない。

**未保護の判定**：`collection_status`と`consistency`のenum検査は、外す変異でも117件が通っていた。不正値を拒否する試験を各1件追加し、各変異で対応する1件だけが失敗し、復元後に`cmp`一致を確認した。

修正後の結果：

| 検証 | 結果 |
|---|---|
| SC2-A合成 | 1ファイル／120件成功 |
| ESLint | `npm run lint`（repo全体）exit 0 |
| 全体合成 | maxWorkers=3、242ファイル／10,965件成功、失敗0・pending 0、exit 0。JSON内の開始〜最終試験終了は約35.5秒 |

接続契約はdraft-0.3、soft回復claim設計はdraft-0.11へ更新し、親設計・本書からの版数リンクを直した。

## 6 未実施と次の境界

SC2-Bの必要verify・単一fake会計、SC2-Cの世代移行使用／新frame／ready／cleanup、SC2-Dのplan封印、SR-DのWJ-C finish／Eは未実装。元rootのHeldClosureはそのための保持状態に留まり、今回の公開handleから任意の実行へ進めない。

正式なsession／source／ReleasePermit／選択payload／worker job binding、実transport・実worker／runtimeへの接続、実cleanup・外側checkpoint、全費目上界、本番cap・全体受付・人の承認は未完了。実PDI接続・実通信・実機操作・トークン発行・設定変更・permit発行・Pushは行っていない。
