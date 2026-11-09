# WF-B：最小値kernel・正規先行構築とSS03の合成検証

Date: 2026-11-09 / 実装前HEAD: `5d16867` / 未コミット検証。

親: [同start接続差分設計§9](BEST_PRACTICE_WFB_SAME_START_SUPPLY_STOP_DESIGN.md)。正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

## 1 対象と保証

値kernelの固定C→F配列と有限stage関係だけを抽出し、旧shellのブランド・台帳・exportを維持した。composition内に正規構築rootを追加し、全空保持slotの捕捉後に既存CaptureAdmissionAssemblyとその同実startを構築する。既存のscope／epoch／packet originをprivateに照合・一度結合し、先行生成故障でも元参照／未確認prefixを保持する。

構築点32の内部でissuer／startの部分確保が失敗した場合、attempting・未捕捉として保持し、捕捉数0から「未生成」と推論しない。scope copy検査と正規start側のfield検査を区別する。公開factoryは固定scriptと値診断だけで、任意artifact採用・実startの持出し口はない。

WriterGateは空保持slotの予約のみ。既存issuerのprepare／request／admit／closeは未呼出し。writer停止・Journal供給／封印・final anchor／view・供給claim消費・admission消費・packet生成・値capture・field clear・証拠・root終端は未接続である。実session／transportへの接続、実通信・設定変更・Pushは行わない。

## 2 検証結果

| 確認 | 結果 |
|---|---|
| 新規canonical-supply-construction試験 | 161件成功 |
| 関連16ファイル回帰 | **913件成功・失敗0**。全repository試験ではない |
| composition／旧shell／新試験のstrict型検査 | exit 0 |
| `bdo npm run build` | exit 0 |
| `compiled-canonical-supply-construction.mjs` | exit 0、対象binding条件9個を独立変異で確認 |
| `compiled-journal-supply-shell.mjs` | exit 0、旧brand／claimを含む11対照維持 |
| 旧compiled 6本 | absence-journal、capture-admission、retirement-start、pending-binding、pending-construction、declared-actualがexit 0 |
| 梱包dry-run | 441ファイル、tests／新kernel／fixture混入0。一時cacheを終了時削除 |

関連16ファイルはcanonical-supply-construction、journal-supply-shell、absence-journal、canonical-supply-transfer、capture-admission、canonical-supply-view、pending-binding、pending-construction、read-hash-capacity、read-hash-declared-actual、read-hash-kernel-extraction、read-hash-fake、retirement-start、snapshot-read-start、snapshot-read-composition、supply-boundaryの各`.test.ts`。

strict検査は`bdo npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/fixtures/journal-supply-shell-fake.ts tests/review/canonical-supply-construction.test.ts`。compiledは各fixtureを`bdo node tests/review/fixtures/compiled-canonical-supply-construction.mjs`等で実行し、scratchをfinallyで削除した。

共通kernel追加に伴い、既存compiled harnessにはscratch用のkernel emitを追加した。旧facadeのexport集合・関数同一性は不変、共通compositionの明示export集合だけを新factory分追加した。梱包は`npm pack --dry-run --json --ignore-scripts --cache <一時directory>`で、archive生成・依存導入・packaged worker実行は未実施。期限は変更していない。

## 3 独立対照と初回失敗

- 35生成点×4境界=140故障対照で、期待stage配列・捕捉prefixを本体counterからimportせず計算した。元slot保持・固定結果・再入／二重構築／close後の再利用拒否を確認した。
- 16種のdescriptor／claim／正規scope各field混入を拒否。copy以外は不正候補を正規発行slotにも置き、同参照検査だけで他条件がmaskされるのを避けた。新compiled9対照は狙う条件を外すとboundへ進むことを確認し、issuerはunused・admission未発行のまま。冗長scope／pin guardの全単一変異網羅までは主張しない。
- 値kernelの16通りのstage対を独立ordinal oracleで比較し、固定C→F値も別表で確認した。旧合成rootと正規rootの保持台帳は互いに不変である。
- 初回の新compiledは`target_copy`の文字列anchorが2箇所に一致し停止した。短い` t === issued `が`claim.target === issued`にも含まれたため、前後の演算子を含む一意のanchorへ絞った。製品側の検査は緩和せず再実行exit 0。
- 既存capture-admission compiledの初回は`scope_extra`のanchorが2箇所に一致し停止した。新しいconstruction検査にも同じkey件数式があるため、既存scopeMatchesのreturn前置きを含む一意のanchorへ限定した。既存22条件・root gate5が再度成功した。これらはcompiled故障注入の対象指定不備であり、最終拒否だけを成功扱いして回避していない。

## 4 未対応

既存issuer／同startとのconstructor結合保証であり、正規Journal供給や停止coverageの保証ではない。WriterGate本体／全writer gate・frame停止合流・metadata封印・借用寿命・固定discardは次工程。供給・admission利用は未消費、実packet／cellは生成0。実OOM必着・追加CPU／heap／layout・guard・bootstrap実E／SはUnknownで、構造35枠を全体work受付へ使用しない。

今回の変更は未コミット。正式発行口閉鎖・全体受付無効・Unknown・調査保留、Pushなしを維持する。

## 5 コミット対象だけの隔離再検証（2026-11-09）

HEAD `5d16867`と今回の16ファイルだけをindexから一時directoryへ展開した。既存node_modulesだけを参照し、作業treeの他変更や既存distを使用せず検証した。

- ビルドとcomposition／旧shell／新試験のstrict型検査がexit 0。
- 関連16ファイル913件成功・失敗0（21:25:32、802ms）。全repository試験ではない。
- 新規canonical-supply-constructionと旧journal-supply-shell、absence-journal、capture-admission、retirement-start、pending-binding、pending-construction、declared-actualのcompiled 8本が全てexit 0。初回anchor指定失敗の経緯は§3へ保持した。
- 一時cache／出力先で`npm pack --json --ignore-scripts`を実行して実archiveを生成した。manifestと`tar -tzf`の441件が一致し、tests／kernel／新fixture混入0、server／worker entryあり。archiveと一時cacheは削除。依存導入・packaged worker実行・外部接続は未実施。

本項はコミット前検証の記録であり、writer停止・Journal供給・admission消費・packet生成の成功を意味しない。各閉鎖条件・全体受付無効・Unknown・調査保留、Pushなしを維持する。
