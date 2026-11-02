# RA-02④-A 合成finish証拠の一度限り発行・失効・discard検証

Date: 2026-11-02。Baseline: `561b8e2`。開発専用合成kernelのみを対象とする。

## 1 変更範囲

同kernelのprivate issue slot、別brandの空opaque handle、外部guard前に消費する発行claimを追加した。元handoff／bound identityとconstructor pinを再照合し、同source open／新frame ready／cleanup未開始をpre/postで確認する。post後だけ発行履歴1とpending slotを公開する。公開診断は固定状態と件数のみで、snapshot／ID／UTC／結果／identityは返さない。

source close開始・cleanup開始で同slotを同期失効し、元receiverとcleanup sinkは固定終端へ残す。両解放確認後の既存`discardBoundRecoveryPlan`がhandoffとissue slotを終端化する。hard後の診断confirmedは発行権を復元しない。legacy／lifecycle専用factoryのAPI・診断型・phase型には追加しない。

合成`evidence_issues`は明示的issue成功でのみ0→1となる履歴。正式発行口とpermissionsは全て無効のまま。RA-03 consumer、accept／route利用claim、accepted期待値ownerは未実装。

## 2 RED／切り分け／GREEN

1. 新しい正常系1件は当初`issueFinishContext is not a function`で失敗した。同kernelの発行処理・固定discardを追加して成功した。
2. 関連回帰で、旧RB-B／C／Dの「発行methodが存在しない」という3件が失敗した。新段階の合成API追加との差分と特定し、そのmethod不在期待だけを更新した。秘密非露出・結合だけなら発行0の検査は維持し、legacy／lifecycle専用rootのmethod・診断field・phaseが増えない型／実行試験を追加した。
3. 不正handoffのissue失敗が過去の`finish_binding` phaseに分類される1件を再現した。共有private比較helperの固定phaseを呼出元から限定的に選べるようにし、issueは`finish_issue`、既存RB-Dは従来phaseを保持するよう修正した。

## 3 合成試験の範囲

- 空・凍結・null-prototypeの合成handle、pre/post中の未公開、claim占有順とcommit後だけ発行1。
- 二重発行・別root／コピー／summary／plan／ready混入、不足binding・失敗後再利用拒否。他rootの診断は不変。
- pre/post取消・期限切れ・未知例外、吞み込まれたissue／bind／check／discard／source／cleanup／close／summary再入でcommitしない。
- 発行前／後のsource／cleanup開始による失効、片側解放しか確認できないdiscard拒否、両解放確認後の固定discardとnormal close。
- hard後のcleanup診断回収と最初の停止理由保持、権限復活なし。
- 元descriptorの後変更を不採用、100行の有限枠、既存会計prefix・旧closure診断の不変。
- 固定7種類の旧worker起源を保ち、旧世代終了と新frame ready／cleanupを混同しない。
- 非公開値の診断非露出、任意追加引数／callback注入拒否、RA-03未公開、legacy API／型の維持。

## 4 最終検証

| 検査 | 結果 |
| --- | --- |
| 新規`synthetic-finish-issue.test.ts` | 51件成功 |
| 全体Vitest（maxWorkers=3） | 252ファイル・11,925件成功、失敗0・skip0、約36.8秒 |
| `npm run build` | 成功 |
| 変更4試験を入口にしたstrict TypeScript検査 | 成功 |
| 変更7ファイルのESLint | 指摘0 |
| `node tests/review/package-http-classification.mjs` | 成功、441ファイル |

全体合成回帰はローカル待受が可能な条件で実施。製品・試験期限の変更なし。PDI／外部サービスへの接続・OAuth token発行・OS worker実運用を確認する試験ではない。梱包では新試験／issuer名／brand型／scopeの非同梱、既存共通kernelの限定依存とruntime／I/O／clock／worker混入の負の対照を確認した。

## 5 残課題・制限

RA-03-Aのhandoff／証拠／route原子的消費、RA-03-Bのaccepted固定discardは未実装。現在の合成source経路はverify=nullであり、実verify接続、元analyze受理capture、実結果の由来、E／finish／正常終了候補は確認しない。RA-01のplaceholder型・値projectionを発行証拠へ昇格しない。

追加guard・再projection・handle保持・失効／破棄のwork／allocation・exact layout・全体上界はUnknown。prefix不変を費用0の証明にしない。正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持。実接続・実通信・設定変更・Pushは行っていない。

設計: [発行・RA-03受理接続差分draft-0.2](BEST_PRACTICE_ABORT_SCOPE_FINISH_ISSUE_ACCEPT_DESIGN.md)§9。
