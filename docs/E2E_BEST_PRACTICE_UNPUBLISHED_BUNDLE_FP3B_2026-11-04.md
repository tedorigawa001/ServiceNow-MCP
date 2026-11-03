# FP3-B 同partsとproof pairからの未公開完成bundle

Date: 2026-11-04。実装開始時HEAD: `cfe8019`。[FP-3内部契約](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FP3_POST_ACCEPT_BUNDLE_DESIGN.md)のFP3-Bだけを合成依存限定で接続した。

## 1 一度限りの生成とprivate ready

新しいpackage-excludedのfresh入口`createSyntheticUnpublishedBundleRoot`は、同take／受領snapshot／parts準備／post-only proof pairのprivate継続から、引数なし`prepareUnpublishedBundle`へ固定接続する。FP3-Aを含む旧入口は維持し、外部parts／proof pairの登録・mode指定・getter・fault hookは追加しない。

root側build claimを検査・確保前に消費する。同parts・同proof pairの受理数1と元origin／marker、同budget identity／serial・失効serialを先に検査し、生成中slotへUnpublishedCompleteBundleを確保する。bundleは元parts／proof pair、元expectation／D1本文draft／rows／model／prefix計算結果、同pending／受領物を参照する。copyを新しいoriginal originへ昇格しない。

生成中のbundle objectそのものとparts／proof pairをrootのprivate origin台帳に保持する。生成中、唯一のready slotへの移動後、初回ready受理の3段階で全構成を照合する。marker・object同一性に加え、元snapshotとexpectation／receipt、全本文・manifest／trace、prefix各lane、source／ready／cleanup・budgetの有効性を維持する。

生成中slotから同objectを唯一の未公開slotへ移し、元parts／proof pair／expectation／候補等の利用slotを外す。kernelの元受領物登録とproof／bundle origin台帳は、照合だけに使うprivate借用であり再発行の権限ではない。元slotを再登録・一時復元せず、bundle内の同partsを受ける固定検査へ接続するため、caller指定の検査緩和flagは不要である。

detachと照合後にroot状態をprivate readyへ進め、初回ready照合が成功したときだけ局所readies数を1にする。直後は固定abortでfailedとし全破棄する。readies／completed_bundlesは合成内準備の診断数であり、公開数・seal数・consumer実行数は0。成功handleやconsumerは作らない。

## 2 失敗時の破棄と費目

marker確保後、bundle object確保後、origin台帳確保中、ready slotへの移動前後で失敗しても、元proof pairを再発行せず同じ固定失敗経路へ進む。生成中／ready slot・marker・origin台帳と元proof／parts／payloadをclearし、isClearedへ含める。保護scope終了前の一時参照も本文破棄確認の対象である。

detach失敗はreadyへの遷移を止める。最終clearの失敗は本文破棄確認と上位custody移譲を止める。この2種類の責務を区別し、上位へ退避できるのは既存cleanup-only capsuleと固定診断だけとする。first hard・未知の解放責務を保持し、公開されていないbundleや本文をcapsuleへ隠して移さない。

追加費目はmarker／bundle／origin確保、生成中と移動中の参照保持、繰返しの全構成照合、detach・失敗clearと初回ready照合。元C/G/P・retry・210試行・全60秒・開始UTC／全deadline・局所bounded枠は不変。全work／heap・copyピーク・3round配賦・予約額はUnknownのままであり、局所usageや診断件数で全体受付を有効化しない。

## 3 合成試験とcompiled対照

- 新旧5 files／50 tests成功。新FP3-Bは9 testsで、reviewedゼロ／mixed、post前bundle生成0、guard停止・work不適合の暫定保持、post停止優先、再入・混入・source／cleanup失効、秘密非出力、固定abort後custodyとFP3-A pair-only継続を確認する。
- strict TypeScriptの実graphを一時ESM treeへemitし、旧D2・FP-1・FP-2の55故障とFP3-Aのレビュー補強済み44故障を維持する。
- FP3-Bは32種類のbundle／構成要素／ready状態故障、別rootの実bundle、二重／逆順のprivate builder、5つの生成途中例外（detach後を含む）、発行後の受領物失効を確認する。aliasとoriginを整合させてもexpectation／全本文改変を値検査へ到達させる。
- 12の生きた元利用slotのdetachをそれぞれ除くとready受理を拒否する。6slot（生成中bundle／ready bundle／marker／bundle origin／proof origin／proof markers）の最終clearをそれぞれ除くと本文破棄確認・custody移譲を拒否する。
- 新しいexpectation／content／rowsのbundle結合照合、expectationのdetach確認、ready件数の確認をそれぞれ無効化した5変異では、対応する既存故障oracleがAssertionErrorとなることを確認する。値結合の変異位置はTypeScript構文木の比較式として特定し、生成コードの改行に依存しない。
- 故障・別root bundleの一時保持はemitしたテスト用コピーだけに注入する。runtime friendや公開hookを追加せず、fetch拒否stub・配布除外・固定依存監査を維持する。

## 4 実行結果と初回失敗

- 最初の新旧50 testsは成功。`npm run build`と対象4ファイルのESLintも成功した。
- compiled初回は、故障注入でbundleBuildsを2へ増やしたcaseの期待診断を1としていて失敗した。カウンタの保持と拒否を確認し、そのcaseだけ期待値を2へ訂正した。実装や上限を変えていない。
- 次の実行では、既にprepareGenerationで消費済みのpreparationInputについてdetach省略を「生きた参照保持」と期待して失敗した。元の代入位置を追跡し、この等価変異を有効な保持対照に数えず、実際に値を持つ12slotへ検証対象を訂正した。実装のdetach／clearと空確認は維持する。
- 追加の照合除去対照では、rows比較の直後が生成コードで改行され、文字列の位置特定が停止した。対象コードを確認し、比較式の構文木を使って3つの値結合照合の位置を特定する方式に変更した。実装側の条件は変更していない。
- 修正後のcompiled保証は旧試験とFP3-Bの32故障・5途中例外・12 detach／6 clear・5照合除去対照を含め成功。
- `npm test -- --reporter=json --outputFile=/private/tmp/servicenow-fp3b-vitest.json`：ローカル合成待受が可能な条件で284 files／13,740 tests成功、失敗・保留0。製品／テスト期限は変更していない。
- `env npm_config_offline=true npm run test:pack`：外部取得禁止・既存キャッシュだけでproduction-only install／analysis／aggregation成功（441 files）。
- `node tests/review/package-http-classification.mjs`：固定依存・配布除外とcompiled監査が成功（441 files）。追加したdetach後例外・照合除去対照もstandalone compiled fixtureで成功。
- 対象4ファイルのESLintと`git diff --check`は問題なし。関連4文書のローカルリンク30件も存在確認した。

コミット前再検証：対象9ファイルだけをstageし、未stage差分・未追跡ファイルがない状態でビルドと全体合成テストを再実行。284 files／13,740 tests成功、失敗・保留0。対象4ファイルのESLint、リンク30件、外部取得禁止の梱包試験と最新compiled保証を含む配布除外監査（各441 files）も成功。初回の期待値・等価変異・位置指定の失敗記録は上記のまま保持する。

## 5 レビュー修正（2026-11-04）

本記録の故障件数は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査（441ファイル、Compiled FP3-Bを含む）、全体合成284ファイル／13,740件成功・失敗0を確認した。

kernelの約60変異を確認し、次の条件は外しても既存試験が全て通過した。実装は正しく、試験だけの不足である。

- builder入口のone-shot条件（`used`、状態、受理数、4 slotの空判定）。既存の逆順・二重呼出しは`!postAcceptedProofPair`が先に拒否しており、ガード全体を外したときだけ検出されていた。
- builderの確保前照合（`checkProofBindings`と`checkBundleComposition`）。§1の「先に検査して確保する」を区別する故障がなかった。
- 生成中／prepared段階の状態ガード。既存の状態故障はready段階に集中していた。
- FP3-Aから移動した`proofIssueStarts!==1`。

[compiled fixture](../tests/review/fixtures/compiled-destination-preparation.mjs)に18故障を追加した。builder呼出し直前に各条件を崩す11件（生成数0で停止することを確認）、生成中／prepared段階の状態を崩す各3件、FP3-A側の`proofIssueStarts`の1件である。各条件を一つずつ外す18変異は、それぞれ対応する故障で初めて失敗した。

bundleのowner／budget／budgetSerial／invalidationSerialの二重照合の片方（残る片方と全構成照合から導出でき、両方を外す4変異は検出される）、`value.pending`／`value.received`（`checkBoundBundleComposition`の引数として同じ照合を通る）、`buildingBundle.parts`／`proofs`のlive slot照合と`pair.pending`／`pair.received`のlive slot照合（`checkProofBindings`と全構成照合、origin台帳から導出）、`!bundleBuildStarted`（builder先頭で必ず設定）、detachの`pendingHeader`／`channel.birth`／`channel.take`／`lease`／`evidence`／`ready`（この時点で既に空）は等価変異として扱う。kernelは変更せず、設計書をdraft-0.5とした。vitest試験数は不変。修正後も全体合成284ファイル／13,740件成功・失敗0。

## 6 維持する閉鎖状態と残課題

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。seal成功・実session／worker／runtime接続・実通信・実機操作・設定変更・Pushは行っていない。

次はFP3-Cのroot側一度限りconsumerと消費中slot、同budgetでのpre／post停止・失効／全破棄。FP3-Bの初回ready検査をそのままconsumerと扱わず、実atomic commit・成功dest・正常終端は引き続き別工程とする。
