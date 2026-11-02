# SC2-C HeldClosure使用・合成新世代ready／cleanupの検証

Date: 2026-11-02。基準HEAD: `1d74bff`。
Status: 合成依存限定。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 1 実装範囲

[接続契約draft-0.6](BEST_PRACTICE_ABORT_SCOPE_WORKER_RECOVERY_CONTINUATION_DESIGN.md)§12に従い、tests配下の同issuer内でSC2-Bのverified状態から次へ進む境界を追加した。src・runtime module・実worker factoryは変更していない。

- 同ownerのHeldClosureを最初のguard前に一度占有し、元handleを取り外す。generation_usesはclaim占有、startsは合成起動実施、ready_eventsはpost-guard後の受理成功として区別する。
- 同じprivate入力／時刻／C/G/Pを維持し、固定issuerが旧参照と異なる新supervisor／worker／generationを作る。任意frameや応答JSONから発行しない。
- 起動用startと新世代専用cleanup sinkを先に渡す。startを一度消費して起動後、同frameのready lease→private event→一度限りacceptへ進む。
- 失敗時は実行用handle・入力を同期失効し、先行soft・最初のhard・旧cleanupを保持する。公開済み新sinkだけは停止後も新cleanup診断を記録でき、回復権限を復活させない。
- 旧cleanupのconfirmedで新frameを解放済みにしない。未開始／要求済み／確認済み／失敗／未確認を別slotに保持する。実terminate／OS終了の証拠にはしない。
- 未確認cleanupや保持frameをnormal close／discardで隠せない。固定discardは同ready handle（起動前中止はstart）を一度消費し、cleanup確認後だけ入力／frameを破棄する。finish planは作らない。

## 2 RED／GREENと初回失敗

TDDで次の縦の接続を順に確認した。

| 試験 | RED | GREEN |
|---|---|---|
| HeldClosure一度使用・起動前sink | claimWorkerGeneration未実装 | 1件成功 |
| 新frame起動→private ready→cleanup→discard | startWorkerGeneration未実装で2件失敗 | 3件成功 |
| startup失敗後の新cleanup回収 | failWorkerGeneration未実装 | 4件成功 |

その後に混入・順序・guard・診断保持を追加した。内部handleを別brandへ強化した初回strict型検査では8件の型エラーを検出した。原因はstart／cleanup生成でopaqueの型引数を省略し、private可変slotから返却してundefinedの型も含まれたこと。明示したbrand付きlocal定数を作ってslotへ格納・返却する形にそろえ、同じ型検査でエラー0を確認した。製品・試験の期限は変更していない。

開始時点にはSC2-Bの追加回帰3件を含む`1d74bff`が既に存在したため、その89件を維持した。前回SC2-B初回86件と今回の母数差はこの既存3件であり、SC2-CがSC2-B試験を追加・削除したものではない。

## 3 合成試験と独立計数

[追加試験](../tests/review/synthetic-worker-recovery-generation.test.ts)は**125件**。

| 観点 | 確認内容 |
|---|---|
| 7発生点 | 未起動・既存ready・ready待ち・送信直前・送信後を維持し、旧終了後だけ新起動1／ready1 |
| verifyの順序 | 未開始・parent・pending・retry待ち・metadataで使用拒否。完了済み成功／changed／継続bounded失敗だけ次へ進む |
| 一度限り | claim・start・event発行・ready受理・cleanup snapshot・discardの重複を拒否。計数は増えない |
| identity | 別binding／準備／start／lease／event／cleanup、copy・旧証拠・任意ready JSON・旧数値id応答を拒否し、別ownerは不変 |
| guardの独立oracle | 7発生点×claim／start／event／acceptの8 guard。位置4以降だけstarts1、どの取消でもready受理0。未公開ticketはsinkなし、公開済みは同sinkを保持 |
| 新cleanup | 起動前not_required／起動後confirmedのみ確認済み。旧cleanupで代替不可。requested等は固定診断として保持して停止 |
| hard保持 | startup／ready失敗・取消・期限切れ後のcleanupは診断のみ。先行hardを上書きせず再起動しない |
| 解放と再入 | 未確認cleanupや保持frameのnormal close拒否、確認後の固定discard→close、guard再入・元7identityの変更で停止 |

guard oracleは実装helperを使わず、有限の位置式からclaim1・starts0／1・ready受理0・sink保持を求める。合成frameはrootが新規に作る参照で、実workerの起動／終了数ではない。SC2-BのC/G/P・S／全L／O／Uは前後一致を確認する。

関連9ファイル（SC2-A／B／C、SR-A／B／C①、WJ-A／B／C）の**1,000件成功**。SC2-A120・SC2-B89・SC2-C125・SR-A124・SR-B121・SR-C①116・WJ-A157・WJ-B66・WJ-C82。

## 4 全体回帰・型・梱包

すべてbdo経由で実行。既存ローカル待受試験が実行できる条件で全体合成試験を行い、実PDI／外部サービスへの接続試験は含めていない。

- `bdo npm run build`：成功。
- rootと追加試験の単独strict tsc（noUnusedLocals／noUnusedParameters、ES2022／NodeNext）：成功。
- 対象TS／梱包監査のeslint：成功。
- 関連9ファイル、maxWorkers=2：1,000件成功。
- 全体、maxWorkers=3・verbose／JSON reporter・silent：**244ファイル11,179件成功、失敗0・保留0、約55.33秒**。観測用の外側150秒打切りなし。製品60秒・既存test deadlineは変更していない。
- offline梱包監査：**441ファイルと既存compiled回帰が成功**。SC2-Cの関数・brand文字列とpathの非同梱、seeded漏出の負の対照、既存I/O／時計／runtime／worker参照の拒否を確認した。SC2-Cのcompiled保証やB-03完了には数えない。

一時JSON：`/private/tmp/servicenow-sc2c-full-20261102.json`。
SHA-256: `b1d4d181baaf6487f3043bedb25d2726c5225a0612d32919a338872b2c9eb452`。
関連試験JSON：`/private/tmp/servicenow-sc2c-related-20261102.json`。一時artifactの永続保持は保証しない。コード本文・資格情報・raw例外は出力せず、集計だけ確認した。

## 5 残課題・非対象

SC2-Dの非実行plan封印／一度限りの移譲、SR-Dの実finish／E・候補消費、実session／ReleasePermit／payload／worker jobへの正式bindingは未対応。実canonical writer・final予約・実worker／runtime・実cleanup・外側checkpointには接続していない。SC2-Aの一般化したinput契約も変更しない。

追加work／layout／allocation・実待機上限・全体上界はUnknownで、本番cap・全体受付は有効化しない。正式発行口閉鎖・調査保留を維持する。実通信・トークン発行・設定変更・Pushは行っていない。
