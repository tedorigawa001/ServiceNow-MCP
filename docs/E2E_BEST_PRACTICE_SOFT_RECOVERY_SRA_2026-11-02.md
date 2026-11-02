# SR-A：soft観測／回復slot・同owner binding・診断分離の合成検証

Date: 2026-11-02 / 基準HEAD: `cc5e221`。
Status: **配布対象外の独立合成issuerのみ。回復route・実worker／runtime・実cleanupに未接続。**

[soft回復claim設計draft-0.3](BEST_PRACTICE_ABORT_SCOPE_SOFT_RECOVERY_CLAIM_DESIGN.md)§12と[親設計draft-0.10](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 1 実装範囲と非権威性

[新issuer](../tests/support/review/synthetic-soft-recovery.ts)はnode:util／zodだけをimportし、既存WJ-A／B／C・runtime session／source／workerや登録／claim台帳を共有しない。rootは7つのopaque参照（run／session／source／key／origin／budget／release）とS／全L／O／Uをdescriptorでpinする。releaseはfixtureのidentityだけで、実ReleasePermitやrelease内容の検証ではない。実canonical remainingの代わりにfake checkを注入する。

phase型3phase×workerなし／ready、およびworker型7発生点（request冒頭の未起動／既存、ready timer／reply check、送信直前check、analyze timer／reply check）を型と値検査で区別する。未起動／ready待ちに存在しないanalyze idや送信済みjobを置かず、送信直前のallocationと送信済みjobを分ける。

owner／observation／recovery／cleanup診断handleは別の内部brandと同issuer内pointerで識別する。observe発行claim、観測の消費、回復slotの消費はguard前に一度占有／取り外し、最後のpost-guard後だけpublishする。copy・別owner・混入・再入・重複・root／期待topology変更・取消／期限はhard停止し、全回復能力を失効する。消費結果はauthority:noneの固定dataだけで、routeやfinishを許可しない。

soft slotは固定kind／phase／point／worker_state、hard slotは最初の固定code／phaseを別に保持する。cleanupは、元ownerが生存中に一度発行する診断専用sinkへ一つのimmutable snapshotをsealする。発行済みsinkだけはhard停止後も事実を記録でき、run guardを再実行せず、失効したrunを復活させない。

workerなしのnot_requiredと、workerありのnot_started／requested／confirmed／failed／unconfirmedを区別する。不足／失敗はhard停止を要求し、未知snapshotはunconfirmedへ固定する。先行cancelledと後続cleanup failedを両方保持し、遅れてconfirmedへ書き換えない。**statusはfixtureの合成イベントで、実終了証拠ではない。** GenerationClosedEvidenceを発行せず、新世代許可・OS操作も行わない。

hard停止後はidentity・観測／回復slotを消し、S／L／O／Uのdataと固定診断だけを残す。固定discardでUTCを破棄でき、正常closeでもclaim／UTCを破棄する。未sealのcleanup sinkがある場合はcloseを拒否して診断回収を残す。外部copyやheap物理消去は保証しない。

## 2 合成試験・独立oracle

[新規119件](../tests/review/synthetic-soft-recovery.test.ts)を追加した。

| 観点 | 確認内容 |
|---|---|
| origin variant | worker7発生点、phase3種×worker有無。矛盾worker状態・余剰／不足field・無効id・文字列だけの観測を拒否 |
| root／owner | root11項目の変更、同input／request／監督／worker／世代／job／allocationの混入、別owner／copy handleを拒否。他ownerのslotは消費しない |
| one-shot | bind／観測発行／回復生成／回復消費／cleanup診断sinkを一度だけ使用。失敗後の再prepare・再bind・復活を拒否 |
| guard | bind／observe／claim／consumeの全8点で期限停止。guard前のclaim占有・slot取外し、最後のpost-guardでのroot／期待世代差替えを確認 |
| 再入 | busyがなければ通るcleanup lease生成をobserve／claim／consume内から呼び、捕捉されても停止することを確認 |
| UTC | S=O=U、O=U、U=S+Lを許可。逆行・超過・不正形式・不正Lを拒否。新しい時計は採らない |
| 診断分離 | softとhardを別に保持。停止後のcleanup成功でもhardを消さず、cleanup失敗と先行取消を同時保持。未起動のworkerをconfirmedにしない |
| 秘密非出力 | root／facts／観測のgetter・Proxy、Error.code getterを実行せず、raw例外本文・source・tokenを出さない。fake workerのoperation getterも実行0 |
| 終端 | cleanup sink発行中のclose拒否、normal close後の不変・hard停止後だけのUTC破棄、遅延／二重cleanup報告の非上書き |

独立イベントoracleは9 topology（phase payloadのworker有無＋worker7点）で、bind／cleanup lease／observe／claim／consume／closeが各一度、fake guard計12回であることを別の固定計算と比較する。位相差のある経路を実OSイベントとして数えていない。phase3種の検査は別の表で行う。

SR-01／02、SR-05の値variant・identity、SR-07の同期guard、SR-11の診断分離の**一部**だけの確認で、SR-03／04の実世代移行、SR-06のterminate、SR-08のinput終端化、SR-09／10のverify会計、SR-12の実cleanup sectionは未接続。全work／allocation・本番capの独立導出とは数えない。

## 3 初回REDと訂正

| 段階 | 観測／対応 |
|---|---|
| 観測のtracer | stubが固定エラーを返し1件失敗。same-owner観測handleと独立soft slotを返す最小実装でGREEN |
| 二重観測 | 2回目の発行が通り1件失敗。発行claimとsticky hard停止・先行soft保持を追加してGREEN |
| 予算identity | 同bindingのbudget差替えが通り1件失敗。rootと期待topologyを構築時にpinし全guardで再照合してGREEN |
| 回復slot | claim／consumerのstubで1件失敗。guard前の観測／回復取外し、one-shot開始bit、非実行data返却を接続してGREEN |
| cleanup診断 | sinkのstubで1件失敗。停止前に発行する診断専用handleと停止後の一度限りsnapshot記録でGREEN |

基礎実装の編集時には、同一pathを一つのpatch内で削除／追加する形式が拒否された。変更は適用されず、Update形式へ直して適用した。テスト失敗や部分適用としては数えない。

上記は新規合成コードの開発履歴であり、従来製品の障害・脆弱性や実通信失敗の観測ではない。型・lint・build・全体テスト・梱包で追加の失敗は観測していない。旧試験の削除／skip・期限緩和はしていない。

## 4 最終検証

| 検証 | 結果 |
|---|---|
| SR-A＋関連 | 4ファイル／424件成功（新規119、WJ-A 157、WJ-B 66、通常WJ-C 82） |
| build | `npm run build`成功。issuerはtests配下でruntime distに出ない |
| standalone TypeScript | 新試験・参照helperをstrict／noUnusedLocals／noUnusedParametersで検査、エラー0 |
| ESLint | 新helper・新試験・変更梱包script、問題0 |
| 全体合成・初回 | 新規111件の段階で239ファイル／10,595件成功、失敗0・pending 0。約32.9秒 |
| 全体合成・最終 | 最終guard／hard分類／UTC等号境界を追加後、maxWorkers=3、239ファイル／10,603件成功、失敗0・pending 0。約32.2秒 |
| offline梱包 | `node tests/review/package-http-classification.mjs`成功、441ファイル。issuer関数／pathのdist JS・宣言・mapへの漏れ、fixture梱包、runtime import・I/O／timer／clock／worker参照の混入を負の対照付きで拒否 |

最終JSONはローカル一時領域`/private/tmp/servicenow-sra-tests-final-20261102.json`。ファイル数はtestResults.length、時間はJSON開始〜最終試験終了で集計した。中間の全体実行もexit 0であり、最終値とは分ける。梱包内の既存compiled回帰をSR-Aの専用compiled保証／B-03完了へ流用しない。

## 5 残課題・未実施

RunHealthWitnessの正式発行、実ReadState／監督のprivate継続、SR-Bのphase route／未処理集合／verify、SR-Cの旧終了証拠・新世代、SR-DのWJ-C finish連結、外側cleanup・最終checkpointは未実装。実session／source／ReleasePermit／worker jobの証拠にこのfake topologyを昇格しない。

Unknown・正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持する。実worker／runtime接続・実通信・実機操作・トークン発行・設定変更・Permit発行・本番cap投入・Pushは行っていない。無関係な`.vscode/`／`CLAUDE.md`は変更していない。
