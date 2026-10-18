# BP-5 R-2：内部終端契約・終了コード選択器の合成検証

Date: 2026-10-19 / 内部実装のみ。telemetry調査は保留。
実PDI操作・実token発行・登録/ACL/設定変更・Pushなし。

## 1. 範囲

[entry接続/終了コード設計draft-0.3](BEST_PRACTICE_BP5_R2_ENTRY_EXIT_DESIGN.md)の実装順1だけ。
`src/review/r2-entry-terminal.ts`と`tests/review/r2-entry-terminal.test.ts`を追加した。
既存の作業中の表示/launcher/host差分は保持し、今回の選択器へ接続する変更はしていない。
新entry/bootstrap、check-planの端末表示、signal引継ぎ、100ms最終化監督は未実装。

実行した合成試験は内部オブジェクトに対するschema/純粋関数の試験であり、
専用entryプロセスが実際に該当codeで終了することのE2Eではない。
全体回帰の既存OS子/待受試験は合成値のみ。実認可・PDIへの接続には進んでいない。

## 2. 契約と優先順位

内部versionは`bp5-r2-entry-terminal-0.1`。check-plan/run/entryのstrict unionとする。
display/finalization/fatalは全て必須で、成功の既定値を補完しない。
check/approvalはそれぞれ既存の固定失敗codeだけ。未知stage/field/codeは拒否する。
executionは既存report/summaryのstrict検証と、reportからの再投影との構造一致を必須にする。
displayの任意reportも同じ検証が必要で、display stageなのにdisplay=confirmedなら拒否する。

全snapshotが有効な場合の優先順：

| 順 | code | 意味 |
|---:|---:|---|
| 1 | 73 | host/checker終了未確認 |
| 2 | 71 | host cleanup不成立、またはentry自身の最終化不成立 |
| 3 | 70 | fatal |
| 4 | 72 | forced_stop |
| 5 | 80 | report_unavailable |
| 6 | 81 | display_failed |
| 7 | 124 | 段階ごとのtimeout/deadline |
| 8 | 130 | 制御されたcancelled |
| 9 | 82 | approval_denied |
| 10 | 64 | usage |
| 11 | 10 | その他の固定失敗 |
| 12 | 0 | offline_validまたはcompleted、かつ表示/最終化成立 |

新設80/81/82は、作業中の設計draft-0.2の再選定方針に従い、旧案74/75/77から変更した。
sysexitsの64〜78との新しい意味の衝突を避ける目的で、既存host/監督の番号は変更しない。
番号だけで自動再試行を抑止できるとは主張しない。表示失敗後の再実行は禁止のまま。

不正snapshotは一律80。raw fieldに73/71/fatalが見えても、一部だけを信頼して採用しない。
拒否時にZod issues、入力、例外message/stackを返さない。throwするgetterも固定拒否とする。
selectorはcodeの整数だけを返し、入力変更・表示・通信・process.exit・signal・再試行を行わない。
報告の真正性、表示完了/資源終了の実観測は、後続の信頼済みentry接続が担う。

## 3. 合成ケース

追加51件。既存fixtureの合成aggregateと合成監督reportを利用し、実コード本文・資格情報は使用しない。

| 区分 | 確認 |
|---|---|
| 監督理由 | completed/review_failedおよび既存固定失敗理由。host_exitをentry codeへ単純コピーしない |
| checker | 全16固定失敗codeをcheck-plan/run両方で確認。表示失敗時は終了未確認だけ73を優先 |
| approval | 全4固定失敗code。否認82、timeout124、cancelled130、不適合10。表示失敗なら81 |
| 複合失敗 | 終了未確認＋finalization不成立＋fatal＋表示失敗は73、cleanup不成立＋fatal＋表示失敗は71 |
| その他の競合 | fatalはforced_stopより優先、forced_stopはreport_unavailableより優先、report不明は表示失敗より優先 |
| 表示 | completed/partial＋表示失敗81、取消し＋表示失敗81、checker成功＋表示失敗81、usage＋表示失敗81 |
| hostとの分離 | cleanup completeのhost_exit=130でも、監督deadlineは124、監督cancelledは130。元report不変 |
| 0の意味 | 0.2 partial、0.3 partial/analysis_complete=falseでもlifecycle完了は0。inner isErrorは10 |
| strict性 | root/report/summaryのextra field、未知code/最終化値、stage違いのcode、必須field欠落、summary不一致を拒否 |
| 再投影 | summaryのJSON key順序だけの違いは受理し、意味の改変は拒否 |
| 秘密/例外 | getterの合成例外を外へ投げず80。raw出力のAPIを設けない。完全な任意副作用getterの封じ込めを保証するものではない |

## 4. 途中の失敗と訂正

初回は47件中45件成功・2件失敗。新テストのfixture前提に誤りがあった。
systematic-debuggingで既存fixture/selection schemaと照合したところ、
aggregateはpartialでもanalysis_complete=trueであり、選択モードの固定値はall_updatesではなくbounded_allだった。
テスト入力/期待値を訂正し、実装schemaや既存契約は緩めていない。
0.3の解析未完了ケース、host_exit=130の期限/取消し、summaryのkey順序の境界も追加した。
初回失敗を製品の不具合検出や未実装REDとしては数えない。

梱包テストの初回はbuild成功後、sandbox外のnpmキャッシュ書込がEPERMとなり停止した。
npmの診断には所有者修正の提案もあったが、所有者異常とは断定せず、chownや設定変更は行っていない。
キャッシュアクセスを許可した同一コマンドの再実行で成功した。npm公開はしていない。

## 5. コミット分離前の作業ツリー検証

| 検証 | 結果 |
|---|---|
| entry-terminal/report-summary/terminal-display/approved-launch | 4ファイル・86件成功（今回追加51件を含む） |
| 最終全体回帰 `npm test` | 118ファイル・3,046件成功、24.86秒 |
| `npm run type-check` | 成功 |
| 追加テストの明示strict TypeScript検査 | 成功 |
| 追加実装/テストのESLint | エラー・警告なし |
| 全体 `npm run lint` | exit 0、エラー0・警告374。既存/作業中の他ファイルは変更しない |
| `npm run test:pack`再実行 | build・361ファイルのproduction-only導入・解析/集約worker・MCP smoke成功、R-2非同梱維持 |

境界追加前にも全体118ファイル・3,043件成功を確認したが、最終件数とは区別する。
verification-before-completionに従い、上表は実行結果を確認して記載した。

## 6. 残課題

専用entry・launcherへの接続、check-plan表示、実際のOS終了、signal所有者の統合、
fatal時に既知の上位codeを保持するbootstrap、最終化監督とその所有資源表は次工程。
今回のschemaは状態の整合性だけを検査し、観測履歴/真正性や全体385秒の強制停止を新たに証明しない。
130/124だけでcleanup完了とは判定せず、検証済み終端状態と併せて扱う。
実TTY/Node下限/他OS、G2/G4・本人ACL・C方式等の実PDI検証は未実施。
telemetry調査は保留のままで、token発行・設定変更・Pushは行わない。

## 7. コミット分離と隔離検証

前工程の表示/launcher実装が作業ツリーに残っていたため、次の2段階へ分離する。

1. 報告検証・summary投影と共有失敗enum・対応テストの3ファイル。
2. 終端契約・純粋exit選択器・合成テスト・本設計/検証記録の4ファイル。

各候補は`git write-tree`で固定し、`git archive`で別の一時ディレクトリへ展開した。
既存node_modulesだけを参照し、未ステージのsource/test/設定はコピーしない。
依存の新規導入やPDI接続は行わず、各候補でbuild・全体テストを実施する。
表示/launcher/runnerの作業中の差分、表示の前工程検証記録、.vscode、CLAUDE.mdは含めない。

第1候補のtreeは`6739b7b5d3f5ef203f2ee65c9fd3aa9bb3cce9e3`。
隔離build成功、全体116ファイル・2,982件成功（51.49秒）、対象lintはエラー/警告なし。
コミット`fb0c73e`のtreeも一致を確認した。

第2候補の初回全体実行（既定並列数）は117ファイル・3,033件中20件失敗（82.14秒）。
既存のCLI試験/承認試験の5秒timeout、soft-deadlineでのworker未到達と後続review_busy、
runner時間境界の超過等だった。追加した終端契約51件の失敗ではない。
同一候補・同一期限のまま`--maxWorkers=2`だけを指定すると、117ファイル・3,033件中1件失敗（105.79秒）。
残ったのは既存host slow-close/SIGINT試験のready未到達で、固定4秒予算内にreadyまで進まなかった。
並列負荷・起動遅延と整合するが、この観測だけで環境要因と断定しない。
製品の期限・テストのtimeout・期待値は変更せず、単一workerでの全体実行も確認する。

同じ第2候補で`npm test -- --maxWorkers=1`を実行し、117ファイル・3,033件成功（113.03秒）。
追加51件を含め、前工程の未コミット表示/launcher差分なしで全体テストが成立した。
第2候補のbuild、対象lint、追加2テストの明示strict TypeScript検査も成功した。
今回の切出しではテスト/製品コードの修正は行っていない。高並列時の既存試験の不安定さは解消済みとは主張しない。
分離前の§5（118ファイル・3,046件）とは母集団が異なるため、件数差をスキップや退行として数えない。
