# WF-B AbsenceJournal：内部型・writer記録点の合成検証

Date: 2026-11-09 / 実装前HEAD: `5b2264d` / 未コミット変更の検証。

親設計: [Journal／packet詳細設計§11](BEST_PRACTICE_WFB_JOURNAL_PACKET_DESIGN.md)。合成依存限定。正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

## 1 実装対象と境界

- 開発専用composition内に非exportのAbsenceJournal、source／bindingのgeneration scope、4種のstrict fact、固定25個（11+14）のhistory、private GenerationEpochBindingを追加した。合成factoryの返答には参照・token・本文を含めず、固定値診断だけを返す。
- 実writerの前後で旧fact無効化・完了を記録する。building3枠の解放候補を最終validate／prepared後だけcommitする。旧clearは11枠の実代入と空booleanを確認し、反復noopでfact／stampを増やさない。extra aliasはwriter未開始かつproducer入口閉鎖時のみnever-assigned。未捕捉mintをnot_mintedへ補完しない。
- generation epochを後付けでcapture epochへ書き換えず、合成先行owner／pin／source identity／各正規scopeとcapture epochを一度結合する。root未生成と未捕捉を区別し、local-onlyではroot sealを呼ばない。既存admission slot／epochへの供給は未接続である。
- metadataの故障を元producerのfirstと分離する。source処理を再試行したり、Journal故障を埋めるために旧clearを追加実行したりしない。正常sealの元slotは不変。故障後も元slot・first・未確認履歴を保持し、次回要求は固定結果を返す。
- 旧互換factoryのexport集合／関数同一性を維持した。共通開発moduleのexport集合には新しい`createAbsenceJournalFake`だけを明示追加し、純粋内部型やwriterへの任意登録口を公開していない。

## 2 実行結果

全てローカル合成依存で実行。製品・試験の期限を変更していない。

| 確認 | 結果 |
|---|---|
| 新規`absence-journal.test.ts` | 105件成功（下記14ファイル内） |
| 関連14ファイル回帰 | **591件成功、失敗0**。最終実行18:04:35、566ms |
| fixtureと新規試験のstrict TypeScript検査 | exit 0 |
| `bdo npm run build` | exit 0。runtime source変更なし |
| `compiled-absence-journal.mjs` | exit 0。binding変異6、missing／early commit各1、旧clear欠落11、stamp overflow、stale fact無効化を確認 |
| `compiled-capture-admission.mjs` | exit 0。既存binding対照22、root gate5。capture未接続 |
| `compiled-pending-binding.mjs` | exit 0。binding対照9、lifecycle対照5。claim消費0 |
| `compiled-declared-actual.mjs` | exit 0。source grid75、declared/actual変異8、既存supply／transfer／boundary対照、互換factory10を維持 |
| npm pack dry-run | 一時cache使用でexit 0。441ファイル、tests／composition／AbsenceJournal fixture混入0 |
| 差分空白 | `bdo git -c core.fsmonitor=false diff --check` exit 0 |

関連14ファイルはabsence-journal、canonical-supply-transfer、capture-admission、canonical-supply-view、pending-binding、pending-construction、read-hash-capacity、read-hash-declared-actual、read-hash-kernel-extraction、read-hash-fake、retirement-start、snapshot-read-start、snapshot-read-composition、supply-boundaryの各`.test.ts`。全repository試験の成功を意味しない。

strict検査コマンド:

```sh
bdo npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/absence-journal.test.ts
```

compiled対照はそれぞれ`bdo node tests/review/fixtures/compiled-absence-journal.mjs`等で実行。scratchへ試験対象だけを変異して隔離compileし、元sourceを書き換えず、finallyでscratchを削除した。梱包dry-runは`npm pack --dry-run --json --ignore-scripts --cache <一時directory>`の一覧を検査し、archive作成・依存導入・ネットワーク取得を行っていない。

## 3 独立対照と失敗prefix

- 試験側にsourceの11field、buildingの4／5／6、extraの17／20、実writer集合、正常fact／stampを別記述し、本体layout／builderから期待値をimportしない。
- begin／completeの23field、candidate／commitの3field、sealの25fieldへ固定faultを注入。元producer成功とmetadata失敗を分け、最初のfield／boundary、元slot不変、反復固定結果を確認した。
- source準備失敗後は成功commit数0、旧clear後のfactはlegacy_discard_executedとする。metadata故障とsource post故障の複合時もproducerFirst=source_rejectedとmetadataの先行理由を別保持する。
- scope copy、owner／construction／retention／source slot、capture epoch、source identity、producer scope／epoch、source欠落を拒否する。純粋scope／各fact scopeの冗長検査を含むcompiled対照で、チェック群を外すと混入が通ることを確認した。単一条件ごとの全変異網羅を主張しない。
- source／issued／building各clearを1つずつ削る11対照で、未回収fieldをlegacy_discard_executedにしない。building欠落は対応するregistry／bindings／declarations生成途中故障で観測した。
- 有限stampの65回目writerをunconfirmedとし、64をwrap／再利用しない。確定factの次writerが未完了なら旧factを復活させない。

## 4 初回失敗と修正・環境制約

1. fixture strict検査でTS2532が6件。Journalの同期callback内へ代入を移したため、TypeScriptの制御フローが後続の初期化を追跡できなくなった。固定・同期・hookなしの代入直後の参照へ非null表明を限定し、再検査exit 0。runtimeの期限・拒否条件は緩和していない。
2. 関連3ファイルの初回試験は105件成功・1件失敗。共通moduleのexport集合に新合成factoryを加えたことが期待値へ未反映だった。互換入口のexportは変えず、開発moduleの明示集合とcompiled集合だけを更新した。
3. 新規compiled対照の初回はbinding_scope_copy変異が通らず失敗。scope入口の検査だけでなく、各factのscope検査も混入を拒否していた。製品側の防御は変更せず、冗長検査群を意図的に外す複合変異へ対照を訂正した。その範囲を§3に明記した。
4. 通常cacheでのnpm pack dry-runは`.npm/_cacache/tmp`へのEPERMで停止した。npmの表示文は所有権問題を案内したが、実所有権は未調査であり断定しない。既存cache・権限・設定を変更せず、一時cacheで再試行して441件の一覧を確認した。一時cacheは終了時削除した。完全なproduction-only install／packaged worker実行は今回未実施。

## 5 未実施・Unknownと次段階

admissionの消費、packet／25cell生成、既存admission epochの供給、SealedJournalView／PacketAllocationReceipt、値capture、新field clear、証拠発行、root終端は未実装。JP06〜JP09の新consumer経路やJP10のpacket経路を旧試験で代替しない。実source・session・worker・transportへの接続、実通信・設定変更・Pushは行っていない。

Journal追加費用の実CPU／heap／layout、実E／S、全writer網羅・実OOM前後の診断必着はUnknown。旧計数／期限の不変は新費用を承認済みにする根拠ではない。全体受付は無効のまま。次は既存issuer継続へのprivate供給と、同admissionの一度限り消費・空packet生成を別工程で検討する。

今回の変更は未コミット。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持。

## 6 コミット対象だけの隔離再検証（2026-11-09）

HEAD `5b2264d`と今回の8ファイルだけをindexから一時directoryへ展開し、作業treeの他変更や既存distを使用せず再検証した。依存libraryは既存node_modulesを参照し、依存導入・実通信は行っていない。

- 同snapshotでビルド、fixture／新規試験のstrict型検査がexit 0。
- 関連14ファイル591件成功・失敗0（18:32:01、752ms）。全repository試験ではない。
- §2記載の4つのcompiled scriptを同snapshotで再実行し、全てexit 0。新Journalの混入6・旧clear欠落11・早期／欠落commit・有限stamp・stale fact対照を維持。
- 一時cacheと一時出力先で`npm pack --json --ignore-scripts`を実行し、実archiveを生成した。manifestと`tar -tzf`の441件が一致し、tests／composition／Journal fixture混入0、必要なserver／worker entryあり。archiveを削除し、依存導入・packaged worker実行・外部接続は未実施。
- 初回失敗・cacheの環境制約は§4を削除せず保持した。今回の再検証では一時cacheを明示し、既存cache・権限・設定を変更していない。

この再検証はコミット前の記録であり、admission消費・packet生成・正式発行口を有効化しない。全体受付無効・Unknown・調査保留、Pushなしを維持する。
