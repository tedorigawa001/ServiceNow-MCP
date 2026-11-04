# WF-B 自然失敗時の再採取・証拠保全手順

Version: draft-0.1 / Date: 2026-11-04 / 設計基準HEAD: `e238f1c`。

Status: **手順案のみ。再採取・保管先作成・既存artifact移動／権限変更・観測器改修は未実施。** 正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実装・seal成功・実接続・実サービス通信・設定変更・Pushを行わない。本書の保存は後続操作の承認ではない。

## 1 目的と境界

[WF-B検証記録](E2E_BEST_PRACTICE_WORKER_CORRELATION_WFB_2026-11-04.md)では通常並列・比較群各3回が成功し、自然timeoutは未再現だった。同設定内の変動も大きく、H5a／H5bの寄与は未確定。次回は「失敗するまで繰り返す」のではなく、普段の合成全体実行で自然に遅くなる回を、元の失敗・成功・観測欠落を含めて保存する。

過去の通常並列で全体2分超の時間帯に失敗が見られた一方、同様に遅い並列数2／3で成功した履歴もある。**2分超は詳しく読む対象の目安で、失敗予測・合否条件・打切り期限ではない。** 成功でも保存し、2分以内の自然失敗も除外しない。実行時並列数3の成功で通常並列の失敗を相殺しない。

## 2 現行一時観測器をそのまま再利用しない理由

2026-11-04の静的確認では、`/private/tmp/sn-wfb-observer.mjs`はmodeごとの固定名`sn-wfb-<mode>.json`へ、通常のwriteFileSyncで最終出力している。同modeの再使用は旧JSONを上書きし得る。途中経過は主にメモリ保持で、processの異常停止時にfinallyの最終保存が必ず動く保証もない。root・観測setupのpathも固定である。

そのため、既存scriptに対して単に`normal-1`等をもう一度実行しない。hash一致は元のbytesの識別にすぎず、安全性の承認・再実行許可・正式証拠発行権限ではない。出力先だけ変更したcopyも新しい版としてレビュー・hash固定する。

再採取の前に、旧artifactの保全と、runごとの新規出力・排他作成・途中保存・終了確認を備えた**再採取用固定版**が必要である。現行一時runnerにはこれらの全保証があるとは扱わない。本書では必要契約だけを定め、実装しない。

## 3 開始gate

以下は全てAND条件。未記入・不明・不適合なら採取を開始しない。

| gate | 開始前に固定・確認すること | 現時点 |
| --- | --- | --- |
| R01 操作範囲 | 利用者が対象checkout、合成試験範囲、採取1session、比較群の可否を明示承認 | 未承認 |
| R02 保存先 | 非公開localの具体path、本人のみの閲覧、所有者・祖先path・symlink・権限／ACL、空き容量の確認方式 | 未指定／未確認 |
| R03 保持 | 保持期間または次回見直し日、容量／file数／byte上限、削除の承認者・手順 | 未指定 |
| R04 固定版 | runner・load setup・集計器のbytes／版／hash、排他作成・途中保存・中断と終了確認の合成検証 | 未実装／未確認 |
| R05 実行条件 | 開始HEAD・dirty状態、Node／依存版、設定・lock・scope／journal／factory／worker等のhash、実行順 | 次回採取前に固定 |
| R06 旧証拠 | WF-B旧JSON8件と旧観測器／setup／集計器の在庫・hash・欠落、保全先との対応を記録 | 旧記録あり。今回保全は未実施 |
| R07 終了枠 | 外側採取の時間上限・終了待ち枠・所有processの確認／停止方法。各枠は有限で全体枠内 | 具体値・方式は未承認 |
| R08 非接続・並行実行 | 実サービス通信なし、既存localhost合成fixtureのみ、他の試験／build／lint／梱包実行を重ねない | 次回ごとに確認 |

従来の[I05回答](BEST_PRACTICE_BP5_R2_OL03_MA02_USER_INFORMATION_APPROVAL_CHECKLIST.md)には、操作承認は本人、証拠は非公開local・本人閲覧・保持未定という方針がある。ただし別調査の回答であり、本再採取の具体path・操作・権限変更の承認へ自動転用しない。pathや所有者の実値は公開MDへ書かず、非公開の条件票に保持する。

dirty checkoutは勝手にreset／stashしない。未整理の変更が試験へ混ざる場合は停止し、基準checkoutの選択を別途確認する。承認のためにVM作成・鍵承認・token発行・本番cap／設定変更を要求しない。

## 4 回数・開始条件・停止条件

標準の1sessionは**通常並列1回＋条件を満たす場合の比較群1回、全体実行計2回まで**。これは運用案であり、R01の承認前に実行しない。自動retry、失敗caseの自動再実行、成功結果による上書き・追加sessionの自動開始は禁止。単独再実行や追加比較は本session外で別判断する。

1. 準備gate通過後、通常の合成全体実行1回を採取する。遅くするための負荷注入や他process／電源・冷却設定の操作はしない。開始前と終了後の固定時間の数値負荷も同じ版で採る。
2. 進行中に2分を超えても、それだけで中断・期限延長をしない。既存test／hook／製品deadlineと、承認済み外側採取枠をそのまま守る。
3. 失敗または遅い成功を得たら、まず元runを確定保存する。2分以内の成功も成功資料として保存する。比較群を始める前に保存・終了確認を完了する。
4. 比較は、通常runが自然失敗または同一定義の全体時間2分超、比較許可あり、同じHEAD／版／設定等の基準が保持され、元runの終了・保全が確認済みの場合だけ1回許す。相関がない失敗のphaseはUnknownのまま比較する。保存失敗・観測器異常・cleanup未確認なら比較せず終了する。
5. 比較は実行時maxWorkers=3以外を揃える。時刻・間隔・loadの差と、条件を揃えられない項目も保存し、同じ時間帯で同じマシン状態だったとは仮定しない。比較で成功しても元失敗は保持する。
6. 通常runが2分以内で成功、または最大2回到達ならsession終了。原因未確定でも自動追加しない。外側時間枠到達・測定上限・所有不明・環境不適合・秘密混入・利用者取消でも新規dispatchを停止し、保存／終了確認だけへ移る。

全体時間の基点・終点は条件票に固定する。WF-Bのrunner spanには前後採取・初期化・closeも含まれるため、test run区間も別に記録する。基点の違う過去reportとは同一尺度とせず、閾値を都合よく換算しない。外側採取枠の値が未承認なら「無制限」とせず開始不可。sample数600等の記録上限を、壁時計の終了保証と混同しない。

## 5 非上書きの保全単位

保存先は利用者指定の`EVIDENCE_ROOT`（記号のみ、実path未定）。repo・配布物・一般tmpを正本保管先にしない。1session／runごとに新規IDを作り、旧ID・旧file名へ再登録しない。秘密ではない採取IDは認証session／MCP identityやpermitの代わりにはならない。

### 5.1 旧artifactの保全

旧WF-B記録のfile名・SHA-256を期待値として、JSON8件とrunner／setup／集計器を実行せずに在庫確認する。存在するものは元bytesのまま別の旧証拠bundleへcopyし、サイズ・hashをcopy前後／保存先再読で照合する。元を削除・上書きせず、入力元と保存先の対応をmanifestへ残す。旧一時領域の保護状態・存在は保証しない。

欠落は`missing`、hash不一致は`mismatch`、確認不能は`unknown`。最新sourceから作り直して元artifactとして登録しない。過去recordの期待hashも変更しない。欠落を記録した状態での次回採取は、履歴比較の制約を示して別承認を受けるまで開始しない。

### 5.2 新runの固定file構成

| 固定名の例 | 内容 |
| --- | --- |
| conditions.json | 採取ID／run順・目的、対象HEAD・dirty有無、Node／依存版、固定hash、比較指定、期限、採取枠・容量枠、時計の基点 |
| runner.mjs／load-setup.ts／summary.mjs | レビュー済み固定版のcopy。起動される実体とcopyのhash対応を保証し、保存先のcopyを自動実行しない |
| report.partial.json | 最後に確認できたbounded観測のcheckpoint。未終端・部分採取を明示 |
| report.final.json | run終端後の結果。test成否・測定complete・終了確認を別fieldで保持 |
| termination.json | 元run／context close／所有process終了の確認、確認できない範囲、取消・外側打切りの固定理由 |
| analysis.json | 元report digestに結合した派生集計。元reportを書き換えない |
| manifest.json | 許可file名・サイズ・SHA-256・版・親manifest参照と保全結果。自己hashは含めず、manifest digestを別のsession票へ記録 |

file名は固定allowlist。外部文字列やURL／sys_idからpathを作らない。祖先を含めsymlink／所有・書込権限の不適合、既存file衝突、サイズ超過、途中書込・再読不一致を拒否し、他のpathへ自動fallbackしない。コピー・hashの事後一致だけで検査中の差替えが防げたとはしない。安全なopen／排他作成・部分書込・rename・再読の境界は固定版の実装／合成試験で確認する。

途中保存は追加採取を増やさない有限のcheckpointとし、最初の異常・phase境界・通常終端等の固定機会を契約化する。caseごとの同期disk I/Oや無制限flushは導入しない。partial→finalは新規終端fileの排他作成で表し、旧partialや既存finalを書換えない。byte／file数上限・checkpoint回数の具体値はR03／R04で固定する。上限未導出を0費用として扱わない。

manifestと保存先の再読hashが一致した場合のみ`preserved_verified`。途中・不一致・未終了は`partial/unverified`として保持し、成功票にしない。hashは同bytesの識別であり、出所・所有者・第三者に対する真正性や改竄不能の証明ではない。本人が書き換え可能なlocal保存をimmutable storageと呼ばない。

## 6 秘密・観測欠落・終了確認

- 保存するのは固定stage／code、数値・boolean、repo相対の試験識別、相関ordinalと許可された環境情報だけ。process.env全体、実URL、認証値、payload／結果本文、例外本文・stack、他processの名前／引数は収集しない。公開MDには集計・固定理由・digest・非公開資料の参照名だけを記す。
- 想定外の秘密混入が見つかったら新規採取・共有を停止する。元bytesを公開せず隔離状態として保持し、削除・移動・権限変更は勝手に行わない。承認後にマスクする場合も別の派生file／digestとし、元のhashを上書きしない。
- WF-A 4096event、reporterの20,000case／20,000相関event／600標本／1,000module等の既存上限を維持する。欠落・clock異常・上限・JSON不完備は測定不成立で、遅延0・成功・未発生にしない。記録容量と外側終了枠は別に必要。
- `review_end/fulfilled`・matched／ready観測・test passedはstrict受理やOS終了の証拠ではない。test成否、測定の完全性、保存の完全性、終了確認を独立に記録する。成功で速いrunも失敗で部分的なrunも残す。
- 次runの前に元reviewの終了待ち、確認対象scopeのpending 0／worker exit、Vitest context.close、runner自身の終了を対応付ける。WF-A範囲外や別のchildの状態はそれだけでは確認できず、所有processの固定確認方式が必要。未確認のまま次の試験を起動しない。
- 強制停止が必要でも、方式を事前承認した同採取の所有processだけを対象とする。マシン全体のNode processや既存listenerを止めず、admission強制resetやmock先行復元で救済しない。終了未確認はUnknown／停止として残し、run成功やcleanup成立に昇格しない。

## 7 再開前の未決事項・次の作業

1. 非公開保存先の具体path・保護確認・保持／見直し日・byte／file数枠を利用者が選択・承認する。今回フォルダ作成・権限変更・copy／移動／削除はしない。
2. 旧在庫を壊さず、runごとの非上書き出力・有限checkpoint・外側枠・終了確認を備える固定採取器の詳細契約と合成受入条件を設計する。既存固定名runnerをそのまま常用起動へ接続しない。
3. 混入／衝突・symlink・容量境界・部分書込・clock／hash不一致・取消／終了未確認の独立対照を、別の明示実装指示後に確認する。製品runtimeへ登録口を増やさない。
4. R01〜R08の充足後にのみ、承認された1sessionを別指示で実施する。未充足なら設計・文書化だけで止める。

loader内部観測、stdioのbeforeAllビルド分離、AC-Cの成功経路は本手順の後続・別範囲。本書でH5a／H5b・総work上界・実行permit・正式発行のUnknownを解消しない。
