# B-01 独立した開発rootと実classの状態不変の検証

Date: 2026-11-01 / Baseline: `2c994b8` / Scope: 合成principal・注入clock／wait・ローカルtimer／signalのみ。

## 1 追加範囲と保証

[移行計画§7](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_ROOT_EF03B_DESIGN.md)に沿い、[tests配下の独立root](../tests/support/review/ef03/assembly.ts)と[専用試験](../tests/review/development-root.test.ts)を追加した。productionソース・認証・登録owner・sourceは変更せず、旧試験も置換／削除／skipしていない。

開発rootのprivate brand／realmとWeakSet登録は本番と別であり、admissionのcounter／principal Setもfactory単位で別所有する。共有するconstruction kernelとcanonical budget creatorは新規状態だけを作り、本番singletonを検索・変更しない。rootは新規run・固定件数inspectだけを公開し、終了時にはauthorityを含まないfrozen summaryを返す。B-01の成功は本番private継続の代替保証ではない。

## 2 REDとGREEN

最初のtracerはassembly module未実装でimport失敗（exit 1）。新規rootと固定cleanupの追加後に成功した。段階的に実class2枠との独立、開発2枠との独立、別realm、部分失敗を追加した。

追加した境界のREDは、事前abortがlistener段階と記録されたこと、foreign brandがinvalid_state／取得試行済み扱いだったこと、clock callbackから再入した生成が成功したこと、canonicalのinvalid_observation_timeが公開理由へ平坦化されたこと。各々、commit段階での事前abort記録、登録前brand拒否、callback前の同期生成claim、canonical内部理由の保持へ修正してGREENを確認した。

27件の専用試験は、本番状態と枠の不変、root間の分離、重複／外国登録の拒否、固定解放順、解除throw後の継続、listener部分登録、事前／実行中取消、元期限、未知入力・秘密非出力、遅延settleの不変を確認する。専用faultは有限の固定case名だけで、既存sessionや任意cleanup callbackの採用口ではない。

## 3 検証結果

最終確認：

- `bdo npm run build`：成功。本番ソース／本番build設定は変更なし。
- `bdo npx vitest run tests/review/development-root.test.ts`：専用27件成功。
- 専用rootと既存construction／native-session／source-statusの4ファイル：最終108件成功。旧実class試験は変更なし。
- `bdo npm test -- --reporter=json --outputFile=/tmp/ef03b-b01-isolated-test.json`：他の全体run終了後に単独実行し、217ファイル・9,659件成功、失敗／保留0（exit 0）。
- `bdo npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --strict --skipLibCheck tests/support/review/ef03/assembly.ts`：開発rootと依存の型検査成功。
- 新規TypeScript2ファイルのESLint：成功。
- `bdo node tests/review/package-http-classification.mjs`：413ファイル、compiled固定fixtureと新root混入拒否の限定梱包検査成功。
- 文書4ファイルのローカルリンク51件、空白検査・`bdo git diff --check`：成功。

全体回帰を実行中に後続RED caseを追加し、修正後の再実行も先行run終了前に開始した。先行レポート `/tmp/ef03b-b01-full-test.json` は217ファイル・9,659件中1件失敗で、追加したcanonical内部理由保持のREDである。他機能の失敗はなかった。実行が一部重複した結果は最終の単独確認と区別して保持し、期限や既存期待値を緩めない。

重複した後続レポート `/tmp/ef03b-b01-final-test.json` は9,659件中1件失敗。`new-followups-evaluation.test.ts`のCLIを3回起動する既存caseが5,000msでtimeoutした。該当ソース／試験／期限を変えず、単独全体runでは同caseが約3,576msで成功した。重複負荷の影響は候補であり、この比較だけで原因を断定しない。新rootの27件は後続・単独の両runで成功した。既存CLIのtimeoutを修正済みという主張や、無条件に再現しないという主張はしない。

tests配下は本番tsconfigの入力でないため、本番buildだけで開発rootの型安全性を確認したとはしない。別途 `tsc --noEmit` でrootと依存を検査する。今回専用tsconfig／本番build設定は作成・変更しない。開発assemblyの専用emit／compiled fixture移行はB-03へ残す。

pack検査には、配布JS／宣言／mapに新rootのpathやassembly markerが混入しない限定確認を追加した。旧friend／synthetic_ioの撤去やEF-03Dの全依存閉包／変異試験を完了した意味ではない。

## 4 レビュー修正（2026-11-01）

開発rootの生成順がcore→登録owner→admission（busy判定は登録後）で、本番`BoundedReadSession`のbusy事前判定→core→admission→登録ownerと異なっていた。busyの呼出しが一度登録して巻き戻す本番にない経路を通り、B-02以降で旧caseを移すと別のrollback／busy経路を検証することになるため、本番と同順へ揃えた。fault順は`after_admission`を`after_registration`より前へ移した。

追加試験1件：開発2枠保持中のbusy呼出しはstage `admission`の`review_busy`で、core／admission／登録ownerのslotがすべてabsent。`after_admission`故障ではadmissionが1回解放され、登録ownerは未取得のまま。専用試験は28件成功。変異確認として旧順序のassemblyへ戻すと追加試験が失敗（1件）し、他27件は成功した。退避copyから復元し`cmp`で一致を確認した。§3の件数は修正前の記録として残す。下記§5のlive登録の上界は修正後の値。

## 5 会計と残課題

root別のactive枠は2、同期生成claimは1、live登録はadmission取得後だけなので上界はactive枠の2（修正前はbusy呼出しの一時登録を含め3）。登録WeakSetはidentityを再利用させず、live登録・principal keyは固定finallyで返す。各runのconstruction診断は固定10slot、実際に取得するのはsnapshot・core・登録owner・admission・controller・timer・任意listener。未使用phase／source slotは未開始のままである。

clockと待機は同runの元起点・canonical coreに結合し、C/G/P=0、R予約は未実施。計上callbackを本番から移譲したとは主張しない。B-02のsource受理・ready世代・HTTP／native・final予約・ReleasePermitと、B-03の試験保証移行が残る。回復不能な確保失敗時にsealed copyが必ず生成できる保証、JS文字列の物理消去保証はない。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持。friend撤去・既存試験の保証低下を伴う置換・実接続・実通信・実機操作・設定変更・Pushは行わない。
