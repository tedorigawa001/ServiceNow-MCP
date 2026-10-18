# BP-5 R-2：オフラインchecker・限定確認票の合成検証

Date: 2026-10-18 / 内部PoC。実PDI・実token発行・実設定変更なし。telemetry調査は保留。

## 1. 対象と境界

[専用入口設計](BEST_PRACTICE_BP5_R2_LAUNCHER_CONNECTION_DESIGN.md)の第1段階。
r2-plan-check.ts、固定r2-plan-check-entry.ts、r2-plan-check-process.tsを追加した。
既存manifestのconsumeに、信頼済みconsumerへ正規化digestを渡す第2引数だけを追加した。
既存consumerは第2引数を使わず従来どおり動く。公開MCP契約・製品の取得/解析/cleanup期限は変更していない。

一時fixtureはテストが作成/削除する架空の0600 manifestだけ。実manifest配置・権限修復・実機通信はしない。
既存読込器で所有者/ACL/祖先/symlink/JSON/期限/bindingを検査し、consumeで再検査する。
checker独自に450秒（実行385秒＋承認待ち60秒＋preflight5秒）超の余裕も要求する。
snapshotはfinallyで閉じ、成功でもPDIはnot_verifiedのまま。人の承認証明・release matched・実行許可にはならない。

## 2. 限定確認票

bp5-r2-plan-check-0.1、mode=check-plan、pdi=not_verified固定。

| status | 許す追加field |
|---|---|
| offline_valid | checks（structure/file_trust/binding/validityすべてtrue）、selection_mode、max_records、実装済みrequested_rule_ids、has_release_assertion、正規化SHA-256 digest |
| rejected | 既存manifest固定理由、validity_insufficient_for_approval、checker_failed/timeout/cancelled/termination_unconfirmedの固定codeだけ |

origin、利用者/対象ID、client ID、scope、承認参照、path、設定本文、コード本文、token、raw例外/stackをコピーしない。
成功digestは正規化した文書に対応する。空白/key順変更は同一、意味変更は別digest。署名・実行capabilityではない。
未知field、誤ったPDI検証状態、偽の検査bool、未知codeはstrict schemaで拒否する。

## 3. 子プロセス監督

固定entry以外の任意path/moduleは公開入力にできない。argvは非秘密manifest pathだけ。
空env・shellなし・detached・raw標準出力/エラーignore・固定JSON IPCを使う。
上限5秒をspawn前から固定し、取消/期限/無効応答は所有checkerだけを停止する。
受信は1件/8KiB以内、sendHandleなし、strict schema。exit/close両方・対応code・期限内を満たした結果だけ採用する。
成功receipt受信だけでは採用しない。最大1秒の観測で終了不明なら結果を捨て、終了未確認を返す。
固定エラーsinkは遅いOS errorもformatせず処理する。自動再試行・host起動・認可・ブラウザー起動はしない。
ファイルACL照合には既存の固定ローカル/bin/lsまたは/usr/bin/getfaclを使う。
これを含めて「プロセス0個」とは主張しない。host・SDK・解析workerは起動しない。

## 4. 合成試験と初回失敗

- 正常確認票、本文/識別値非返却、snapshotのdigest、release assertionなしの未検証扱い。
- 承認期限切れ/385秒境界/450秒境界、C設定期限切れ、binding、所有者、mode、symlink、不正JSON、secret field、
  重複キー、64KiB超過で固定拒否。権限を修復せず、元ファイルを変更しない。
- 読込後/consume前の意味変更、clock例外でも部分結果を返さない。
- OS境界のlisten/connect/http(s)/DNS/fetch/spawn/fork/Workerをtrapし、実checker/読込器で成功/拒否する。
  別の実Node子でも禁止境界とACL utilityのみのallowlistを置き、正常/拒否・stdout/stderr空を確認。
  fixtureによる計測であり、OSネットワーク全経路の形式的証明ではない。
- 実固定entryの正常/拒否、短縮1ms期限での実子停止/終了確認。通常5秒は延長しない。
- OS peer合成で重複/過大/未知field/handle付き応答、票なし/矛盾exit、OS error、取消後の遅い成功、kill失敗、
  終了不明、予算不正を検証。新しい取得・hostへのfallbackなし。

TDDでchecker未実装→正常確認、固定process境界未実装→実子確認のREDを確認してから実装した。
追加試験の初回は34件中33成功・1失敗。ACL検査失敗のspyをdefault exportだけに入れたため、
実装の名前付きESM importへ反映されず、期待した拒否にならなかった。
systematic-debuggingで差し替え境界を確認し、syncBuiltinESMExportsで名前付きexportへ同期、afterEachで復元/再同期した。
製品のACL検査は緩めていない。修正後34件成功。
後から確認した設計draft-0.2の450秒条件も、2件のREDを確認して追加した。既存のsignal/TTY方針は変更しない。

## 5. 最終検証結果

| 検証 | 結果 |
|---|---|
| checker + 既存manifest（2 workers） | 97件成功（新規36＋既存61）、最終の境界/key順確認追加後8.74秒 |
| 全体回帰 `npm test -- --maxWorkers=2`（ローカル待受許可環境、独立に2回） | 両方112ファイル・2,930件成功、42.46秒 / 最終境界・key順確認後69.38秒 |
| `npm run type-check` | 成功 |
| 新規テストの明示的strict TypeScript検査 | 成功 |
| 変更した4実装・テスト/fixtureのESLint | エラー/警告なし |
| `npm run test:pack` | build・361ファイルのproduction-only導入・解析/集約worker・MCP smoke成功。R-2非同梱を維持 |
| compiled checker固定entryのsmoke | 存在しない合成pathでmanifest_untrusted、IPC結果・exit/close確認。外部通信なし |
| `git diff --check` / ローカル文書リンク | 成功 / 18件の参照先存在を確認 |

初回全体回帰（450秒境界2件の追加前）は、sandbox内で112ファイル中3失敗・109成功、
2,810件成功・118件失敗・未捕捉36件、228.17秒。失敗は既存r2-loopback 81件、oauth-g0 36件、server-stdio 1件。
G0の未捕捉ログはlisten EPERM。loopback単独もcallback_unavailable、最小のローカルbind診断もEPERMだった。
製品/テストの期限・設定を緩めず、ローカル待受を許可するsandbox制約外で再実行して上記全件成功を確認した。
この初回結果を成功扱いにせず保持する。合成loopback試験の許可とPDI接続の許可は別で、実PDIへは接続していない。

TDD・systematic-debuggingで未実装/テスト境界/環境制約の失敗を分離し、verification-before-completionに沿って
型・lint・全体回帰・梱包の実出力を確認した。既存のsignal/TTY/450秒条件への別コミットは保持して反映した。

## 6. 留保と次工程

TTY明示承認、承認digestとhost/runner snapshotの結合、ready案内、終了summaryは未実装。
check結果を保存して実行許可に転用する口はない。G2/G4、実PDI、Public Client/S256/loopback、本人ACLは未確認/未承認。
公開CLI/npm同梱・既存auth CLI接続、token発行・失効操作は追加していない。
macOS/Node 24.18.0での合成検証。Node下限22.12/実Linux/Windows/TTYは別工程。
OS全体の停止・完全メモリ消去・サーバーtoken失効・checker強制停止時のACL utilityまでの完全回収は保証しない。
合成秘密の非出力確認と、侵害プロセスからの任意秘密漏えいの完全防止は別である。
