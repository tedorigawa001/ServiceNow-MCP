# BP-5 R-2：最小bootstrap・check-plan接続の合成検証

Date: 2026-10-19 / リポジトリ内部のみ。telemetry調査は保留。
実PDI操作・実token発行・アカウント/登録/ACL/設定変更・Pushなし。

## 1. 実装範囲

[entry設計draft-0.4 §9](BEST_PRACTICE_BP5_R2_ENTRY_EXIT_DESIGN.md#9-第2段階最小bootstrapcheck-plan接続)のオフライン部分だけ。
追加した実装はr2-launcher-bootstrap/entry/check-planとr2-entry-display。
既存の終端契約/exit選択器、固定checker、trusted manifest loaderを再利用した。
既定はcheck-plan。runはusageとして拒否し、承認/host/session/SDK/browserへのdispatchを持たない。
公開CLI/bin/npm scripts/MCP登録・実manifest配置・運用実行許可は追加しない。
作業中のterminal-display/approved-launch等の差分は変更せず、前工程の続きとしてコミットしたわけではない。

## 2. 起動・入力・出力の境界

- fatal guardを固定bodyの動的importより前に登録する。guard自身はruntime importなし、理由を受け取らずformat/保持しない。
  既知の73＞71を固定整数として保持し、未捕捉例外/rejectionの既定は70。通常の終了選択でも既知の上位状態を維持する。
  checker終了未確認は、表示を始める前に内部の固定通知で73を記録する。任意code/JS関数をargv/manifestから渡す口はない。
- compiled `.js`・POSIX・追加Node引数なし・継承envなし・IPCなしを入口で確認する。不適合は64・無出力で停止する。
  macOSが空envにも生成する`__CF_USER_TEXT_ENCODING`のみ、3要素hex形式で許可する。ほかのenvキーを許可リストに加えない。
  Node起動前のloader/preload/inspectorは事後検査では無害化できず、信頼済み外側起動手順は引き続き必要。
- 受理するargvは絶対manifest path1個、またはcheck-plan＋同pathだけ。
  引数不足/過剰、run/未知option/--yes/token/digest指定、相対path、dot segment、NUL、4096文字超を拒否する。
  固定usageに入力を反射しない。path探索・dotenv・既存login/tokenストアへのfallbackはない。
- 出力TTYが使用不能/終了済み、または表示予算が不正ならcheckerより前に81で拒否する。stdout/ファイルへのfallbackなし。
  有効時に起動する子は固定checkerだけ。env={}・shell=false・ignored stdio＋固定IPCを既存仕様のまま利用する。
- checker票を再検証し、限定JSONをstderr TTYへ1回だけ表示する。接続先/対象ID/client ID/approval参照/コード本文/資格情報は返さない。
  usage以外の拒否も固定理由入りの限定票だけ。offline_validは承認/実機成立/安全の証拠ではない。
- 表示は各最大1秒・16KiB。上限拡張不可。throw/callback error/error event/close/未決着/期限超過は81。
  callback成功後の通知turnも観測し、そこで失敗すれば成功にしない。
  遅いnative errorは非formatting guardで受け、callbackと通知turnが終われば解除する。未決着ならguardだけを保持する。
  部分的な出力の巻戻し、端末が人に読まれたこと、完全メモリ消去は保証しない。
- checker中のSIGINT/SIGTERM/外部Abortは同じ取消しへ伝え、所有handlerをfinallyで解除する。
  既に観測した取消しの固定最終票は一度だけ最大1秒で表示を試みる。表示成立130、不成立81、終了未確認は73を優先。
  成功はwrite確認/通知turn後の自然終了、非0は専用entryのみを終了し、未決着sinkによる居残りを防ぐ。

最終化completeはentry自身の観測資源の後始末を意味する。終了未確認のcheckerを終了済みと解釈しない。
汎用の100ms最終化監督、runのsignal引継ぎ/強制停止、外側プロセスの絶対終了保証は今回未実装。

## 3. 合成試験

新規2ファイル・42件（body 27件、compiled process 15件）。

| 層 | 確認 |
|---|---|
| body | 既定/明示check-plan、引数拒否14件、非TTYの早期拒否、予算拡張拒否、入力非反射 |
| 表示 | 未決着timeout、同期throw/callback error/event/close/遅延callback、callback後通知turnのerror。失敗は非0、再試行なし |
| 取消し | pre-cancelではchecker 0回、固定票のみ。signal所有者の復旧、checker終了未確認を表示失敗で隠さない |
| compiled入口 | 専用entry/checkerをテスト用一時ディレクトリへ実ビルドし、空envの所有Node子で起動。実stdoutは空 |
| OS境界 | parentとcheckerの両プロセスでsocket connect/listen、HTTP(S)/DNS/fetch、host/任意子/worker起動をtrap。固定checker1個だけ許可 |
| OS拒否 | runはchecker/host 0回、非TTYはchecker 0回。表示throw/未決着は81、fatal70、既知73/71は保持 |
| bootstrap | Errorの未捕捉例外、poison getterを持つ未処理rejection、未知code拒否、固定bodyのimport不能を秘密非出力で確認 |
| 起動条件 | 追加Node flag、継承した合成秘密envを64・無出力で拒否。外側の自動env/flag除去を実装したという意味ではない |

OS trapの97/98はfixture自身の検証失敗用で、製品の終了コードではない。
manifest所有者/ACLの読み取りに必要な固定`/bin/ls`または`/usr/bin/getfacl`だけは許可する。
「オフライン」は子プロセス完全0ではなく、実認可/HTTP/待受/host/解析を開始しないことを指す。
trapは実checker実装を置き換えず、固定checkerの周囲にも同じOS境界を設けて確認する。
TTYはWritable/プロセスstderrのisTTYを合成した境界であり、実PTY/人の入力・表示配送の検証ではない。
一時0600 manifestは合成値だけ。試験後に一時ファイル/ビルドを削除し、実設定を探索/変更しない。

## 4. RED・途中の問題と留保

TDDで未実装module/entry、明示check-plan、引数拒否、非TTY、未決着write、pre-cancel表示のREDを確認した。
引数表の初版はVitestのit.eachで配列が列展開される点を誤り、空引数でTypeErrorになった。
systematic-debuggingでテスト入力をオブジェクト行へ訂正した。製品schema/期限/期待値は緩めていない。

compiled入口の初回は、env={}でもmacOSのネイティブencodingキーが付与されるため64で拒否された。
キー名だけを調べてOS生成キーを特定し、形式限定の例外を追加した。資格情報の値は表示していない。
OS trapの固定checker照合も、一時ディレクトリの/varと/private/varの別名で拒否された。
実行ファイル/引数個数/envの真偽だけを診断し、fixtureの一時パスをrealpathへ統一した。
この照合の不一致を、製品による外部通信やhost起動と誤認しない。

非Errorオブジェクトをthrowする試験では、Node自身がtoString getterに触れる場合を観測した。
理由を読まないhandlerだけで任意getterの副作用を抑止することはできない。この点は未解決のランタイム境界として明記する。
poison getterの非参照試験はunhandledRejection、未捕捉例外は通常のErrorに分け、
任意の非Error throwの副作用まで解消したとは主張しない。bootstrap以前のloader/native/OS診断も保証外。

## 5. 検証結果

| 検証 | 結果 |
|---|---|
| 最終対象（新規2ファイル＋entry-terminal） | 3ファイル・93件成功、13.73秒（新規42件） |
| 最終全体 `npm test -- --maxWorkers=1` | 120ファイル・3,088件成功、110.51秒 |
| 最終build/梱包 `npm run test:pack` | 成功。361ファイル、production-only導入・解析/集約worker・MCP smoke成功、R-2非同梱維持 |
| `npm run type-check` | 成功 |
| 追加2テストの明示strict TypeScript検査 | 成功 |
| 追加4実装/2テスト/fixtureのESLint | エラー・警告なし |
| `git diff --check` / 文書リンク | 成功 / ローカル4参照の存在確認 |

途中では全体120ファイル・3,087件成功（124.11秒）、境界1件追加後の対象3ファイル・93件成功（13.73秒）を確認した。
途中の全体件数と最終件数は混同しない。全体回帰は前工程の未コミット表示/launcher差分もある作業ツリーでの検証である。
TDDの小さいRED/GREENとsystematic-debuggingの原因照合を経て、verification-before-completionで最終出力を確認した。
検証範囲にコミット・Push・npm公開は含めない。上表を独立したコミット単位の検証や実PDIの成功とは数えない。

## 6. 次工程

今回の入口は内部check-plan専用。公開コマンド/実運用の起動例はまだ提供しない。
runの承認付き接続、100ms最終化監督、実TTY/Node下限22.12/他OS、G2/G4・実PDI/本人ACL/C方式は未対応/未承認。
Node v24.18.0/macOSでの合成検証を、それらの成立やtelemetry調査の再開とみなさない。

## 7. コミット対象のみの隔離検証

今回の4実装・2テスト・OS trap fixture・設計書・本記録の9ファイルだけをステージし、
`git write-tree`の候補`9386af67b2a19c993be3be72190f9332c1099f01`を`git archive`で一時ディレクトリへ展開した。
node_modulesだけを既存の導入から参照し、作業ツリーの未ステージsource/test/設定はコピーしていない。
terminal-display、approved-launch/runnerの前工程差分、その検証記録、.vscode、CLAUDE.mdは含めない。

| 隔離した候補だけで実行した検証 | 結果 |
|---|---|
| `npm run build` | 成功 |
| `npm test -- --maxWorkers=1` | 119ファイル・3,075件成功、87.20秒 |
| 追加7実装/テスト/fixtureのESLint | エラー・警告なし |
| 追加2テストの明示strict TypeScript検査 | 成功 |
| 未ステージファイル非混入 | terminal-display実装/テストが存在しないことを確認 |

§5の作業ツリー全体（120ファイル・3,088件）とは母集団が異なる。差分をスキップや退行として数えない。
今回の切出しに伴う実装/テスト修正や期限の変更は行っていない。
本節の追記後も最終ステージ内容を隔離してbuild/全体テストを確認し、検証対象とコミットのtree一致を確認する。

## 8. 取消し競合時の表示と終端の食い違いの修正（2026-10-19）

checkerが`offline_valid`を返した直後、entryが確認票を表示する前に取消しが届くと、
表示は`offline_valid`の確認票のまま、返す終端は`checker_cancelled`（130）になる食い違いがあった。
既存の取消し試験は開始前の取消しだけを扱っており、この順序を検出していなかった。

合成childで確認票・exit・closeを送った直後に外部Abortする回帰試験を追加し、
修正前に「返却はchecker_cancelled、表示はoffline_valid」で失敗することを確認した（RED）。
`runR2CheckPlanEntry`は終端結果を表示より先に確定し、同じ結果を表示するよう修正した。
修正後は表示・返却とも`checker_cancelled`で130。確認票の内容・取消しの1秒表示枠・他の優先順位は変更していない。
試験は1件追加し、対象3ファイル94件が成功した。コミット対象の隔離検証は本節の追記後に再実施する。
