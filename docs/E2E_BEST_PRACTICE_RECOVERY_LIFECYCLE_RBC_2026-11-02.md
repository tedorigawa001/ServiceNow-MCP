# RB-C 同root lifecycle・ready origin・cleanup serialの合成検証

Date: 2026-11-02 / Baseline: `c7d5961` / Status: 合成依存限定・FinishContextEvidence発行なし。

[RA-02③接続差分設計draft-0.5](BEST_PRACTICE_ABORT_SCOPE_FINISH_ASSEMBLY_RA02_BINDING_DESIGN.md)§10の合成状態だけを実装した。共通kernel／pinned facade・専用試験・梱包監査・CHANGELOG・設計書を更新。runtime source・MCP・設定・既存試験は変更していない。

## 実装・所有権

- 共通kernelのprivate構築関数でlegacy／RB-Aとtracked pinned rootを固定分岐する。新factoryは新しいrootを作るだけで、既存kernel／ownerや可変modeを受け取らない。legacyには新操作・lifecycle欄・新phaseを出さず、従来の型と実行面を維持する。
- SourceLifecycleSlotは同seed.source・private identity・open／closing／closed／failedを保持。close開始claimをguard前に固定し、ready originを失効。source_completionはfakeな終端観測の別診断で、後のhard／cleanup失敗に消されず、正常終端能力にも昇格しない。
- worker起動は既存のworker-startedだけを更新する。cleanupには同新frame／sinkと別identityを使い、開始claimのserialを0→1へ一度だけ進める。worker起動済みでもcleanup開始前はserial=0。
- readyは同lease／eventの受理post-guard後だけに、同owner／frame／source lifecycle／cleanup identityと結んだprivate originを保持。ready_events履歴やcallerのcopyから復元しない。
- cleanup開始・source close開始・hard・closeでreadyを同期失効させる。checkRecoveryReadyは同handleとprivate条件を再検査してvoidを返し、証拠・handoff・route利用claimは発行しない。
- cleanup sinkは合成worker起動より先に渡す。hard後も同sinkのbegin／recordだけを診断回収に使え、健康なrun guardは実行しない。先行hard理由や旧／新cleanupの区別を保持する。
- source／readyの参照は失効時に破棄。未回収cleanupの固定sink／frameだけを診断責務へ保持し、終端時にはそれらも参照を外す。inspectにはscalar診断だけを返す。

generation claimは同preparationのverify=null継続を既存kernelで確定してから行う。実Worker／HTTPは起動せず、C/G/P／retry prefixとS／全L／O／T_i／Uを変更しない。ready handleやcleanup sinkは既存合成状態機械のopaque handleであり、FinishContextEvidenceではない。

## 検証結果

| 確認 | 結果 |
|---|---|
| 新規RB-C合成試験 | 53件成功 |
| 関連回帰（RB-B・RB-A・legacy・旧SC2-C/D含む） | 6ファイル、549件成功、失敗・保留0 |
| 最終全体合成回帰 | 250ファイル、11,772件成功、失敗・保留0、約31.7秒 |
| build | `npm run build`成功 |
| strict型検査 | kernel／pinned facade／新試験をstrict／noUnusedで検査し成功 |
| ESLint | 上記3ファイルと梱包監査で成功 |
| 梱包確認 | `node tests/review/package-http-classification.mjs`成功、441配布ファイル。tracked factory・新generation brand・新試験pathの非同梱とruntime／I/O／clock／worker混入の負の対照を確認 |

全体回帰は既存ローカル待受試験を実行できる条件、maxWorkers=3で実施。既存製品／試験期限は変更せず、150秒の外側観測停止も発動していない。実ServiceNow通信は行っていない。

## 主な対照

- worker start前後ともcleanup serial=0、同ready受理後だけoriginが存在。issue／acceptの全4guard中はorigin=false・ready_events=0で、post後に初めて利用可能になる。
- source closeの全guard中はclosing／開始済み・ready失効。closed／failedからopenへ戻さず、固定discard／cleanup／closeだけを残す。
- ready_events=1でもcleanup開始済み／confirmedならreadyとして使えない。record先行confirmedもunconfirmed・hard停止とし、後付けbeginで救済しない。
- 先行hardがない正常rootでcleanup開始だけを行い、その後のworker起動／ready受理を拒否する。hard停止や不正な順序だけでも失敗するfixtureを対照にしない。
- 同一handleの正常対照を用意し、各操作が成功可能な状態で別root／copyのbinding・start・lease・ready・cleanup sinkを拒否。相手rootは不変。
- claim4・start2・ready4・ready再検査2・source開始2・source終端2の各guard位置で取消／期限切れを検証。準備／起動後の失敗でも、事前発行sinkでcleanupを診断回収できる。
- busy中のswallowされたcleanup／source close再入はhardが勝ち、後からoriginをcommitしない。cleanup開始claimは消費済みのままでserialを戻さない。
- 旧sourceのfake closed結果を、新cleanup failedと最初のhard理由とは別に保持する。hard後のcleanup回収でsourceやreadyを復活させない。
- legacyの方法面・inspect欄とdiagnostic phase型が拡張されないことを、runtimeとstrict型検査の両方で確認。新ready／cleanup brandは別で、FinishContextEvidenceへ代入できない。
- UTC／ID／frame／source identity／ready origin参照をinspectから返さず、handoffやfinish発行口が存在しないことを確認。

## REDと初回修正

1. 新generation操作未実装のREDを確認してから最小経路を接続。既存試験込みの最初の3ファイル222件は成功した。
2. 追加した型対照で、共有kernelの推論型からlifecycle欄とsource_lifecycle phaseがlegacy診断型にも見えていた（TSエラー2件）。legacy factoryは実行時の操作除外に加え、固定false構築に対応した従来診断型だけを返すようにした。最終strict検査は成功。
3. source closed観測後のcleanup失敗を別軸で保持する試験が初回失敗。source_completionを追加し、live状態の失効とは独立に診断を残した。正常能力は発行していない。
4. 混入対照は、start／lease／cleanup recordが本来成功する段階へ揃えた。単に順序違反でも失敗するfixtureだけを根拠にせず、同一handleの成功対照も確認した。

51件版の全体11,770件成功後、cleanup開始単独の対照2件を追加し、最終53件を含む全体11,772件を再実行した。最終の根拠は上表の再実行結果とする。

## レビュー修正（2026-11-02）

上記の件数と、対象ファイルだけのESLint結果は修正前の記録として残す。

**未確定source closeの隠蔽（試験helperの実装修正）**：`beginSourceClose`でclosingにした後、settleせずに準備を破棄して通常`close`すると、closeが成功しlifecycleが`source:'closed'`／`source_completion:'none'`になった。actの制限がsource非open時も`close`を許し、`clear()`がfailed以外を一律`closed`にしていたためである。kernelの通常closeを、sourceがclosingの間は拒否するよう修正した。拒否後はhard停止としてsourceは`failed`になる。source closeを一度も開始しない通常closeは、合意どおり`closed`表示を維持し、`source_close_started=false`・`source_completion=none`で区別する。

| 追加試験 | 確認内容 |
|---|---|
| closing中の通常close | `internal_review_error`で拒否し、`source:'failed'`・`source_close_started:true`・`source_completion:'none'` |
| source close未開始の通常close | `closed`・`source_close_started:false`・`source_completion:'none'` |
| worker起動中のcleanup開始への捕捉再入 | startが`internal_review_error`で停止し、cleanup開始serialは1のまま |

closing拒否の判定を外す変異では1件目だけが失敗し、復元後に`cmp`一致を確認した。cleanup開始の`busy`判定は、外してもguard内の「cleanup開始後はclaim／start／ready／planを拒否」で同じく停止するため、3件目は動作の確認として残し、等価変異として扱う。check時の`readyUsable`、ready commit時の照合、`readyUsable`の各条件も、actの入口制限・readyの失効・busyで同じく拒否される等価変異として扱う。

修正後の結果：

| 検証 | 結果 |
|---|---|
| RB-C専用合成試験 | 56件成功 |
| ESLint | `npm run lint`（repo全体）exit 0 |
| build・梱包 | `npm run build`成功、offline梱包441ファイル成功 |
| 全体合成 | maxWorkers=3、250ファイル／11,775件成功、失敗0・pending 0、exit 0。約45.7秒 |

RA-02③接続差分設計はdraft-0.5へ更新した。SR-D設計（draft-0.8）を指す3文書と、RA-02③設計（draft-0.5）を指す3文書の版数リンクも現行版へ直した。

## 未対応・非実施

RB-Dの同plan／handoffへの結合、verify後のheader／limitations／errors合流、FinishContextIssueSlot・証拠発行、RA-03の原子的受理は未実装。正常source／cleanup能力、finish／E／候補終端は別工程。公開のready_usable診断はこれらを代替しない。

合成source_completion=closedは実sourceの閉鎖・OS workerの終了証明ではない。単なるroot.closeも正常source終端能力ではなく、completion=noneならそのまま保持する。実source／session／workerの正式bindingはUnknown。

lifecycle／origin生成・guard・診断・開始claim・失効・破棄には追加work／allocationが必要で、会計不変でも費用0とはしない。全体work／layout／allocation・本番capはUnknown。

正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持し、finish証拠発行・実接続・実通信・実機操作・設定変更は実施していない。
