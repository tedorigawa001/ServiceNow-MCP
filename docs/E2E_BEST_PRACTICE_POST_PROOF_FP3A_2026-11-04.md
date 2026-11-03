# FP3-A post-only issuerとprivate proof pairの合成検証

Date: 2026-11-04。実装開始時HEAD: `ccd372a`。[内部契約](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FP3_POST_ACCEPT_BUNDLE_DESIGN.md)のFP3-Aだけを合成依存限定で接続した。

## 1 発行状態とprivate結合

新しいpackage-excludedのfresh入口`createSyntheticPostProofRoot`は、private constructor継続で既存の同take／full受領／parts準備を選び、引数なし`issuePostProofs`を返す。callerによるmode選択・既存owner／receipt／証拠の登録・payload getterはない。FP-1／FP-2・旧header／D2入口は維持する。

root側にunused／issuing／failedの発行状態とpost通過gateを持つ。issuerはclaimを先行消費し、同parts／受領物の検査・確保より先にissuingへ進む。transfer_post前のissuer実行は、partsが既に構築済みでも拒否する。guard停止ではissuerへ進まず発行0。失敗やclearでunusedに戻さず、既存transfer／full受領claimも再armしない。

発行前のcheckBundlePartsは証拠0条件を維持する。値・参照照合を固定private `checkBundleComposition`へ抽出し、発行前wrapperと発行後pair検査の両方から使う。caller指定flagによる検査緩和はしない。

同partsのContent候補からContentChecked、prefix候補からOrderedPrefixRelationを生成し、同owner／pending／元accepted receipt・同budget identity／binding serial／失効serialを持つPostAcceptedProofPairへ結合する。rootが実際のparts・両proof・pairのorigin参照と、三つの元marker参照をprivateに保持する。後段検査は同形copy・別rootの実pair、marker付替え、元候補からの差替えを拒否し、全構成とsource／ready／cleanupの有効性も再確認する。

pair受理後も発行状態はissuingのまま固定abortし、failedへ進む。ready／完成bundle／成功dest／seal／consumerは作らない。pair受理数1は合成内の局所診断であり、正式発行や全体受付の根拠ではない。

## 2 途中失敗と破棄

marker確保後・Content生成後・prefix生成後・pair生成後でも、例外や検査失敗は同じ固定失敗経路へ進む。片方だけのproofやpairの未受理状態を完成と扱わない。既発行数・first hard・cleanup診断は保持するが、pair受理数は検査完了前なら0である。

pair／marker台帳／origin台帳・両proof／relation markerと、元parts／expectation／full受領物を全clearし、isClearedへ含める。busy scopeと一時参照が終了した後だけ本文破棄確認を許し、既存のcleanup-only capsuleと固定診断を上位custodyへ移す。未確認責務はUnknownのまま。inspectは件数・状態・有無だけで、本文・ID・元proofを返さない。

元C/G/P・retry・210試行・全60秒、開始UTC／全deadline、既存局所bounded枠は不変。post発行／検査・marker／origin保持・部分生成ピーク／clearは追加費目であり、全work／heap・3round配賦・予約額はUnknownのままである。

## 3 合成試験とcompiled保証

- 新旧4 files／38 tests成功。FP3-Aの9 testsはreviewedゼロ／mixed、post前発行0、guard取消／期限／throw／未知理由、二重開始・swallowed再入、source／cleanup失効、foreign summary、秘密非出力、固定abort後custody、FP-2証拠0の維持を確認する。
- strict TypeScriptの実graphを一時ESM treeへemitし、旧D2・FP-1・FP-2の55故障／lane／再投影対照を維持する。
- FP3-Aは28種類のbinding／field故障、準備済みpartsからのpost前直接issuer、二重private issuer、別rootの実proof pair、4つの確保途中例外、発行後の受領物失効を確認する。複数aliasを整合させた変更でもmarker／元候補の同一性を照合し、発行後のexpectation値改変は共通の全構成検査へ到達させる。
- proof pair／marker台帳／origin台帳／ContentChecked／prefix関係値／relation markerの6slotを一つずつ意図的に保持すると、本文破棄確認・custody移譲が停止する。
- 故障・別root pairの一時保持はemitしたテスト用コピーにだけ注入する。runtime friend・公開fault hook・fixture登録口は追加しない。fixtureのfetch拒否stubと配布除外／固定依存監査を維持する。

## 4 実行結果と初回失敗

- 初回の新旧38 testsは成功したが、compiled fixtureはFP-1用の一意な呼出し位置を探す文字列が新issuer内の同名呼出しにも一致し、位置確認で停止した。生成コードを確認し、FP-1呼出し元の後続文まで含めて位置を限定した。拒否条件・製品／テスト期限・旧故障検査は緩めていない。
- 修正後のcompiled保証は旧D2・FP-1・FP-2と、上記FP3-Aの28故障・途中失敗・6保持slot対照を含め成功。
- `npm run build`成功。対象4ファイルのESLintは問題なし。
- `npm test -- --reporter=json --outputFile=/private/tmp/servicenow-fp3a-vitest.json`：ローカル合成待受が可能な条件で283 files／13,728 tests成功、失敗・保留0。製品／テスト期限は変更していない。
- `env npm_config_offline=true npm run test:pack`：外部取得禁止・既存キャッシュのみでproduction-only install／analysis／aggregation成功（441 files）。
- `node tests/review/package-http-classification.mjs`：旧compiled保証・FP3-Aの各故障／保持slot対照と配布除外／固定依存監査が成功（441 files）。
- `git diff --check`問題なし。関連設計書／検証記録のローカルリンクも存在確認した。

コミット前再検証：対象9ファイルだけをstageし、未stage差分・未追跡ファイルがない状態でビルドと全体合成テストを再実行。283 files／13,728 tests成功、失敗・保留0。対象4ファイルのESLint、リンク27件、外部取得禁止の梱包試験とcompiled保証を含む配布除外監査（各441 files）も成功。初回のfixture位置特定エラーは上記のまま保持する。

## 5 レビュー修正（2026-11-04）

本記録の試験件数・故障件数は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査（441ファイル、Compiled FP3-Aを含む）、全体合成283ファイル／13,728件成功・失敗0を確認した。

kernelの44変異を確認し、次の照合は外しても既存試験が全て通過した。実装は正しく、試験だけの不足である。

- origin台帳のparts／content／prefix照合。既存故障はpairと台帳を常に揃えて書き換えており、台帳だけのずれを試していなかった。
- issuer内の発行前`checkBundleParts()`。外しても発行後のpair照合が同じ理由で拒否するが、設計§4の「証拠はまだ0」が崩れて発行後の拒否へ変わる差を確認していなかった。
- 証拠0条件。発行前に証拠やカウンタが混入する故障がなかった。
- 発行後のカウンタ（contentChecks／prefixRelations／proofPairAccepts）とD2 slot（unpublishedDestination／destinationPreparations）の条件。

[compiled fixture](../tests/review/fixtures/compiled-destination-preparation.mjs)に16故障を追加した（台帳3、発行後5、発行前8）。発行前の故障は、binding拒否に加えて証拠数がそれぞれ注入分のままであることを確認する。上記の各条件を一つずつ外す15変異は、それぞれ対応する故障で初めて失敗した。

別に[合成試験](../tests/review/synthetic-post-proof.test.ts)へ、work失敗の暫定保持とpost停止優先の3件を追加した。FP3-A入口にこの経路の試験がなかったためで、停止なしならbinding（issuer開始1）、停止ありならその理由（issuer開始0）で、いずれも証拠0のままpayload clearへ進むことを固定する。

pairのowner／pending／received／budget／budgetSerial／invalidationSerialの二重照合の片方（残る片方と全構成照合から導出でき、両方を外す6変異は検出される）、`workMismatch`判定（partsなしは`!bundleParts`、ありは再照合が同理由で拒否）、issuer冒頭のslot空判定（先行する`used`で到達不能）、issuer内の`checkProjection`（直後の全構成照合に包含）は等価変異として扱う。kernelは変更せず、設計書をdraft-0.3とした。新規試験は3件増。既存試験2箇所のstrict型エラー（`post_proofs`のoptional参照）も、判定を弱めずに解消した。修正後の全体合成は283ファイル／13,731件成功・失敗0。

## 6 維持する閉鎖状態と次工程

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。完成bundle・seal成功・実session／worker／runtime接続・実通信・実機操作・設定変更・Pushは行っていない。

次はFP3-Bの同parts／proof pairと未公開完成bundleの結合・生成途中失敗clear。その後のFP3-Cの固定consumer、atomic commit・成功dest、正常終端連結は別工程とする。
