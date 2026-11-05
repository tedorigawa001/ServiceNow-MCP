# WF-B DT-C：停止からFIFO保存・閉鎖・終端までの連続合成検証

Date: 2026-11-05 / 基準HEAD: `e4b87d7` / Status: **合成依存限定、コミット`9e12d9a`**。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実接続・実通信・実worker／ProcessOwner操作・設定変更・Push・再採取・証拠保管は行っていない。時間枠・保存先・保持期間・運用capは未承認のまま。設計は[固定期限表／recorder終端](BEST_PRACTICE_WFB_SLOT_DEADLINES_RECORDER_TERMINAL_DESIGN.md)§8.3。

## 1 変更と連続経路

新規`tests/review/recorder-continuous.test.ts`はメモリdriver・注入単調clockだけを使う。旧DT-A／DT-Bと、基準HEADのterminal追加対照を保持する。主経路は同じownerのreserve→conditions保存→startから進み、別owner／新budgetへ切り替えない。

- `D_stop=279000`でのpoll自動停止と明示observeStopから、元queueのFIFO保存を継続する。全6checkpointを保存する経路と、残5件の0／1／3件だけを保存して`D_save=288000`で閉鎖する経路を確認した。
- 元の要素参照と順序、ack件数、試行別結果、四軸・first reasonをterminalまで保持する。閉鎖／terminalで新規Store IOは増えず、unsaved／unacknowledgedを0へ補正しない。
- 試験がpassed／measurement completeで終わった後のpartial write→close false／throw／lateでも、その二軸を保存失敗で変更しない。preservation unverified／termination unconfirmedは進めない。
- stop_requested自身の保存失敗後は再帰保存しない。create失敗はhandle未取得／cleanup not_started、write途中失敗はpartial_unverifiedとし、同じ1 close枠だけを使う。
- 固定通知のthrowは通知境界だけをspyで故障注入するbranch対照。Store通知、recorder通知の副作用前／後、両方のthrow、観測停止通知throw、部分生成との組合せを確認する。正常transcriptをmockした比較結果へ置き換えない。

明示cancelは現行recorderの最終既知時刻をcheckpointへ使う。通知時刻を新規採取したとは扱わない。pollによるD_stop検出では279000、明示通知のfull列では最終既知122000であることをそれぞれ確認した。両通知throwと取得済みhandleのclose正常／throwも組み合わせ、Pendingが回収／診断固定より先に進まないことを確認した（通知中のPending確認は当初無効で、§5で修正した）。

runtimeソース／設定は変更しない。試験専用kernelだけに、発見した以下の差分を実装した。

1. Store受付は通知前のprivate継続で閉じる。取消通知がthrowしても受付を戻さない。通知はpre-spendして固定結果を保持し、後続recorder通知を省略しない。
2. Store／recorder致命的通知／観測停止通知を先行3 slotで一度ずつ扱う。状態はnot_requested／not_present／attempted／returned／threw。returnedは通知が戻っただけで、cleanup confirmedではない。通知中の終端要求はPendingで、診断固定後のunwindまで進めない。
3. 観測停止通知throwは固定notification理由で致命的停止へ合流し、raw例外を反射しない。
4. 部分生成後のrecorder通知がthrowしてGatedのままなら、その実状態とobservation_not_startedを記録する。already_closedを捏造せず、失敗ownerのfacadeも返さない。

## 2 REDと切り分け

TDDで各故障を先に再現し、systematic-debuggingに沿って境界と原因を確認してから修正した。

| 段階 | 観測 | 原因と修正後 |
|---|---|---|
| 正常連続対照 | 1件成功 | 既存DT-Bから同ownerで正常経路へ到達 |
| RED 1 | 2件中1件失敗・1件成功。discardからSECRET_NOTIFY例外が外へ漏れる | #cancelStoreが通知例外を捕捉せず、後続recorder通知も中断。受付のprivate閉鎖と通知別catch／固定診断で2件成功 |
| RED 2 | 3件中1件失敗・2件成功。observeStopからSECRET_STOPが外へ漏れる | 観測停止通知が無保護。一度限りclaimと固定notification停止で3件成功 |
| RED 3 | 4件中1件失敗・3件成功。生成失敗診断のreasonがalready_closed、実stateはGated | 生成済みというだけで閉鎖済みと分類していた。実stateによる分類で4件成功 |

REDの文字列は故障注入用の合成markerで、実秘密ではない。修正後の公開診断にraw例外markerが出ないことをassertした。期限は緩めず、失敗試験をskip／削除していない。負荷／環境制約のtimeoutではない。

## 3 費目所有と構造上界

表のWはwrite呼出し数、Hは非空の固定header byte数（最大95）、Aは明示write attempt cap、RはEINTR cap、Qは固有checkpoint数（最大6）。sourceのloop／private継続を照合し、合成driverの操作数と注入clock回数を、kernelの計算器を使わない独立oracleへ照合した。runtimeにwork受付器を追加したものではない。

| 費目 | 所有・検証した式 |
|---|---|
| write試行 | Store。`W≤min(A,H+R)`。拒否直前は進行write≤H−1なので、最後の超過EINTR／throwを数えてもH+R以内 |
| create／flush／close／再読 | Store。各保存で各≤1。正常closeとfinally closeは同一枠。throw／falseでも再試行しない |
| identity | Store保存・private receipt消費を合わせ成功`2W+11`、拒否はその以下 |
| clock | checkpoint／prepare／persist・Store・private consumeの成功`4W+30`、失敗finallyを含む保守的上界`4W+32` |
| terminal | final予約が所有。pre／postのclock≤2とcommit≤1。Store cleanup枠へ二重に加算しない |
| 通知／retire | 固定通知各≤1、Store受付のprivate閉鎖≤1。retireは通常閉鎖／fatalとterminalで各≤6 slot |
| 予約byte | Store。`ΣH_i≤Q×95`。失敗予約を返さない |
| hash入力byte | bridge期待hash、Store owned hash、再読hashの3所有箇所で`≤3ΣH_i`。private consumeでhashを再実行しない。ソース経路の照合で導出した式で、hash backendを計測したと装わない |
| private copy／encoding | bridge encode `ΣH_i`、Store owned copy `ΣH_i`、write残りslice `≤ΣW_iH_i`。driverの再読copy・保持と文字列生成は別所有 |

成功対照では、full write・1 byte short write・2回EINTR後のshort writeでidentityとclockの等式を確認した。80 byte headerを79回の1 byte進行→2回EINTR→最後の超過EINTR／throwとする拒否対照はW=82に到達し、最後の試行も式から落ちない。A=2のattempt上限停止も実際に到達している。

16桁の開始時点を持つ合成runでは実際にH=95、2回EINTR＋95回の1 byte writeでW=97、identity=205、clock=418（checkpoint／prepare含む）に到達した。開始時点・全deadlineは同じpinを保持する。

固定6checkpoint列の明示値A=128／R=2では、単発IO≤606、identity≤1230。追加clock-bearing recorder操作M≤8、guard-only checkpoint G≤2、terminal 2読取を含めた保守的clock上界は2532。Store予約内容量≤570 byte、write slice累積内容量≤55290 byte、bridge encode＋Store owned copy≤1140 byte、hash入力≤1710 byte。これらの明示値は運用capではない。

### 保証しないもの

この上界は固定transcript／通常の単発fake境界の構造式である。任意回数のsnapshot・空checkpoint・not_ready要求・敵対的な無限再入や、戻らない同期callbackを含む全呼出し列には適用しない。header以外の実観測本文・14 artifact全体・manifest writerの容量も含まない。

CPU work unitへの換算・統合会計・caller側呼出し数のcap、driver内部のcopy／allocation、文字列／hash backendの内部費用、実時間・heap／RSS・OS lease解放は未確認。個別費目をゼロとして統合capを承認せず、Unknownと全体受付無効を維持する。sourceのguard／copy／通知経路が変われば式とoracleを同時再確認する。

## 4 最終検証

| 実行 | 結果 |
|---|---|
| `bdo npx vitest run tests/review/recorder-continuous.test.ts` | **33件成功** |
| 上記＋`recorder-terminal`／`slot-deadlines`／`fixed-recorder`／`fixed-evidence-store`／`store-recorder-binding`／`store-recorder-persistence`の7 test files | **477件成功**、失敗0 |
| `bdo npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck`＋共通kernel／上記7 test files | 型エラー0 |
| `bdo npx eslint`＋変更したfixture／test計2ファイル | 問題0 |
| `bdo npm run build` | 成功 |
| 静的build／配布境界 | src限定build・tests除外・package filesのtests不含。src 183ファイルに新private受付閉鎖／kernel参照なし。private閉鎖継続をexportしない。archive作成0 |
| `bdo git -c core.fsmonitor=false diff --check` | 成功 |

本節の実行時点では全体回帰・実npm pack／dry-run・配布物展開／production install・実保存・実通信・OS操作は未実施。全体回帰の結果は§5を参照。静的境界確認を実梱包や実機検証の成功とは呼ばない。コミット／Pushも行っていない。

## 5 レビュー修正（2026-11-06）

`9e12d9a`のレビューで、kernelと費目の式に不具合は見つからなかった。テストと記録の次の点を修正した。§4の件数は修正前の値として残す。

- **無効なassert**: throwするmock内の`expect`は、失敗しても通知の`catch`に吸収される。期待値を意図的に誤った値へ変えても33件すべて成功することを確認した。mock内では値の取得だけを行い、unwind後にassertする形へ変更した。
- **通知中のPending**: Store通知とrecorder通知の各区間で、終端要求がPendingに留まることを確認した。Store通知中は受付が閉鎖済みであること、通知順がStore→recorderであることも確認する。
- **通知claim**: 戻った観測停止通知は再入と再呼出しでも1回であること、`attempted`／`returned`の遷移、owner／recorder生成失敗時の`not_present`、`snapshot().notifications`の凍結と別objectであることを追加した。
- **費目上界の根拠**: EINTR capが進行で戻らないこと（`1,EINTR`の3回繰返しでW=6、理由`retry`）と、EINTRがwrite attempt capへ計上されること（A=3でW=3、理由`limit`）を追加した。
- **試験名**: 観測停止通知throwの試験は、致命的通知が`stop_requested`を発行し、終端では追加されないことを示す名前とassertへ変更した。

ミューテーションは新しい通知経路と費目上界を対象に43件を実施した。修正前は対象ファイルで27件、関連7 test files全体で28件を検出し、15件が生存した。修正後は対象ファイルで41件を検出し、生存していた14件はそれぞれ新しいassertで失敗することを確認した。

| 修正後も対象ファイルで生存 | 理由 |
|---|---|
| `recorder-once-removed` | 等価。`#notifyRecorder`は`#fatal`からだけ呼ばれ、`#fatal`はphaseにより一度しか進まない |
| `construct-never-closed` | 本ファイルの範囲外。既存の`recorder-terminal.test.ts`のStore生成失敗対照が検出する |

| 修正後の実行 | 結果 |
|---|---|
| `tests/review/recorder-continuous.test.ts` | 39件成功 |
| 全テスト | 295ファイル、14,273件成功、失敗0 |
| repo全体の`npm run lint` | エラー0、警告374 |
| `npm run build`、`node tests/review/package-http-classification.mjs` | 成功 |
| 変更テストの型検査、`git diff --check` | 成功 |

実npm pack／配布物展開・実保存・実通信・OS操作は未実施のまま。上界の適用範囲と保証しないものは§3から変更しない。
