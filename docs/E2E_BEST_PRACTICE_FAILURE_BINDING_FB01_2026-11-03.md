# FB-01 先行FailureOwner・OB-01失敗通知の合成検証

Date: 2026-11-03 / Base HEAD: `77adc66`。作業中に確定した参照ラベル訂正`e3afd2c`は保持した。
Status: **合成依存限定。先行owner／上位slot・一度限り通知・payload失効まで確認。4roleの不足証拠はUnknown。正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持する。**

[接続差分§10](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)、[実装](../tests/support/review/synthetic-recovery-kernel.ts)、[新試験](../tests/review/synthetic-failure-bound-supply.test.ts)を参照。kernel生成や実resourceのcleanup検証ではない。

## 1 実装と確認範囲

- 新fresh DATA entryはcallerのDATA／依存検査前にFailureOwner・4role台帳・custody・上位slot・通知claimを確保する。既存FailureCustody coreをOB-01と同moduleへ移し、旧moduleのfresh factory／error／typeを固定importで維持する。公開issuer同士の接着や既存ownerの登録はない。
- 同construction tokenをprivate供給coreと通知slotへ渡す。最初の供給reasonの確定後、通知claimを先に占有し、固定code／prepare stageを同FailureOwnerへ一度書く。cancelled／deadline_exceededを保持し、その他はinternal_review_errorへ写す。公開例外は既存OB-01と同じinternal_review_error＋限定reasonで、raw例外は格納しない。
- DATA検査・依存検査失敗、8箇所のprepare pre／row pre／row post／post停止、握り潰した6種の再入、二重prepare、foreign／copy／summary／余分引数を確認した。post guardの期限切れは保留binding／pins不一致より優先する。後続の異なるstopや操作拒否でも通知数1・先行診断を維持する。
- 通知区間のfinallyでDATA／held／preparedを外し、prepare途中moving・busy、discard busyもfinallyで解放する。不正依存も新entryでは失敗診断のあるfacadeを返す。旧standalone entryの依存拒否throwは変えない。入力・guardのProxy／getterは実行せず、guardの後差替えも採用しない。
- 正常prepareとsource／cleanup／discardによる失効、固定discardはresource解放証拠にならない。新entryはissuer／local／upper／seal／commit／finalDiscard／accepted／pins／bodyを公開しない。診断snapshotはimmutable・非実行で、sealed reportやcommit receiptではない。
- 上位slotは先行確保だけでupper_accepted=false。4roleはunknown、release=unconfirmed／unresolved=4のまま。C/G/P=0・未生成handleだけでabsenceやconfirmedを作らない。旧supply・独立FailureCustodyのAPIと別台帳を維持する。

先行確保の順序は固定constructorのコード照合と、不正DATA／依存でも診断slotが存在する試験を組み合わせて確認した。任意ownerや通知callbackの注入口はないため、内部固定通知writeの任意throw注入は今回の試験保証に含めない。OOM・JS heap物理消去も保証しない。

## 2 初回失敗・環境制約と再実行

1. 最初の不正DATA試験を先に追加し、未実装factoryのため1件が`createSyntheticFailureBoundSupply is not a function`で失敗した。private core接続後に成功し、旧supply／custodyと合わせて182件成功した。停止・混入ケース追加後203件、最終追加後は新26件となった。
2. 広めの回帰の初回はファイルパターンを引用したためshell展開されず、Vitestが`No test files found`で終了した。製品の失敗ではなく実行指定の問題。引用を外して実ファイルへ展開し、35ファイル・3,105件、その後の4件追加を含め3,109件成功した。期限・上限は変更していない。
3. 追加梱包smokeの初回は既定npm cacheへの書込みがEPERMで停止した。書込み可能な一時cacheを指定した再試行は、production依存`zod-to-json-schema`のtarballがなくENOTCACHEDで停止した。いずれも検証環境の制約で、所有権・設定・lockは変更していない。
4. 既存cacheへのアクセスを許可したオフライン実行で梱包smokeが成功した。`npm_config_offline=true`を維持し、archive／依存のネットワーク取得はしていない。
5. 通知回数は成功writeごとに加算し、単に1を代入する観測にはしなかった。一度限りclaimの検査だけを意図的に外すと、異なるstopを再入力する回帰試験がnotices=2で失敗した（対象1件失敗・他25件未実行）。検査を復元し、最終回帰を再実行した。変異は残していない。

## 3 最終検証

全て`bdo`経由。成功した検証は終了コード0を確認した。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --project unit tests/review/synthetic-*.test.ts`（shell展開） | 35 files・3,109 tests成功。新26件と既存supply／custody・kernel／accepted／seal等の合成回帰 |
| 対象helper2件・新旧試験3件のstrict `tsc --noEmit`（ES2022／ESNext／bundler／skipLibCheck） | 成功 |
| helper2件・新試験・梱包監査scriptのESLint | 成功 |
| `npm run build` | 成功 |
| `node tests/review/package-http-classification.mjs` | 441 files。新factory／scope marker非同梱、kernel固定importと旧custodyの固定import、seeded runtime／I/O／clock／worker／漏出負の対照、既存compiled合成試験成功 |
| `npm_config_offline=true node tests/review/package-worker.mjs`（既存cacheアクセス許可） | 441 files。production-only install・既存ローカル合成worker解析／集約・MCP fake dispatch・fixture境界成功 |

repository全体の試験・PDI E2Eは実行していない。梱包smoke内の既存worker／sourceはローカル合成fixtureで、新entryの実resource origin・実session接続の保証には数えない。

## 4 残課題と停止条件

FB-02のkernel初期topology／RoleBinding、生成claim・clear前のcleanup-only保護とsink連結、FB-03の未解決責務の上位移譲・固定最終discardは未実装。新entryはkernelを作らず、accepted採用・移譲先seal・候補を発行しない。単一canonical予算／全deadline、全attempt inventory・実cleanup、総work／heap・中断粒度もUnknown／未接続である。

通知は最大1回・roleは固定4個だが、この固定数を全work上界へ昇格しない。実会計・C/G/P／retry・210試行・全60秒は変更していない。実接続・実通信・実機操作・token／Permit発行・設定変更・Pushは行っていない。

## 5 コミット対象だけの再検証

FB-01関連9ファイルだけをindexへ選び、HEAD＋indexの全ファイルを一時フォルダへ取り出して再検証した。依存は既存node_modulesを参照し、作業ツリーの未選択ファイルは供給していない。

同コピーでbuild、合成35ファイル／3,109件、対象strict型検査とESLint、梱包監査441 files、既存cacheを使うオフライン梱包smoke441 filesが全て成功した。梱包smokeにはcacheアクセス許可を用い、実通信・設定変更・Pushは行っていない。実行後の追記は本節の検証記録だけで、検証済みのコード・試験・梱包scriptは変更していない。
