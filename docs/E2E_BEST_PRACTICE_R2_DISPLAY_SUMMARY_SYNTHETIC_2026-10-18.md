# BP-5 R-2：ready固定URL・strict終了報告・限定summaryの合成検証

Date: 2026-10-18 / 内部PoC。telemetry調査は保留。実PDI操作・実token発行・実設定変更なし。

## 1. 対象

[専用入口設計§11](BEST_PRACTICE_BP5_R2_LAUNCHER_CONNECTION_DESIGN.md)の第3段階。
r2-report-summary.ts、r2-terminal-display.tsを追加し、r2-approved-launch.tsへ接続した。
内側の固定失敗code enumはr2-host-protocol.tsから共通参照する。公開MCP 0.2/0.3や監督の終了code/期限は変更しない。
公開CLI/entry登録・npm同梱・結果ファイル保存・ブラウザー起動は追加していない。

## 2. 表示の境界

- 検証済みreadyに対して固定start URLを一度だけ表示する。hostの任意文字列をURLとして使わず、GET/HEADしない。
- `bp5-r2-host-exit-0.1`のstrict runtime schemaでroot/host_exit/receiptを検査する。
  終了確認・cleanup・token/別人token・kill状態・期待exit・内側isError/0.2/0.3の整合性を確認する。
- `bp5-r2-exit-summary-0.1`へ投影し、固定metadata・schema/status/isError・analysis_complete・counts・
  aggregateの制限/拒否/error理由別件数だけを再シリアライズする。完全report/資産/自由文/コード本文/資格情報は表示しない。
- 未知の制限文はunclassifiedへ集計する。個別資産の全制限・確認項目を表示したわけではない。
  lifecycle_only_not_safetyを固定し、partialや未確定を完全・安全と解釈しない。
- 表示先は承認時と同じ専用TTY。各write最大1秒、16KiB以内。ready失敗はroot Abortで監督を止める。
  summaryは終了確認後に表示し、失敗ならstage=display/ok=false。元の検証済みreportは別に保持し、成功へ変換しない。
- 不正報告はreport_unavailableの固定文字だけ。出力失敗時にraw JSON・例外・別出力先へfallbackしない。
  自動再認可/再起動/再試行なし。表示の観測待ちで385秒・cleanup3秒・製品60秒を延長しない。
- 観測期限を超えたnative writeには、遅延error非出力用の固定guardを出力先ごとに1個だけ残す。
  callback後のerror通知turnが終われば解除する。native callbackが来ない場合はguardを保持するが、raw error/本文/秘密は保存しない。

## 3. 合成試験

| 層 | 確認 |
|---|---|
| 報告検証 | root/receipt/内側JSONのextra field、未知reason/signal、exit/close/cleanup/token/kill/別人tokenの矛盾を拒否。code71のcleanup incompleteも必須 |
| summary | 0.2/0.3 partial、isErrorだけのMCPエラー、拒否/errorの固定件数、終了/token unknownを維持。自由文の合成秘密はunclassifiedだけにし、ID/コード/完全contentなし |
| ready表示 | 固定URL一度だけ、GET/fetchなし。重複通知・非TTY・上限拡張を拒否 |
| 表示失敗 | 同期throw、write callback error、error event、未解決write、遅延callback、close後を固定失敗へ。timer/所有購読を解放 |
| 接続 | 実checker＋合成TTY＋OS peerでready表示失敗→stopを1回、終了summary失敗→元の失敗report維持。raw例外非出力・再起動なし |
| 実host | 既存の単一固定port suiteで承認→prepared_v2/grant_v2→runner ready→固定URL→認可前取消し→summary。token not_attempted/cleanup complete/終了確認 |

一時0600 manifestは合成値だけで、テスト後に削除した。認可ページへアクセスせず、callback/code/tokenを生成して交換していない。
既存の全体合成回帰で使うOAuth/SDK/解析も従来のfake fetchだけ。実機でのS256/ACL/C方式確認ではない。
TTYはPassThrough/WritableのisTTY境界を合成し、実人間・実PTY・端末記録の挙動を検証したものではない。

## 4. REDと途中の失敗

TDDでsummaryモジュール未実装・displayモジュール未実装のREDを確認し、最小の投影/固定表示から追加した。
code71なのにcleanup unknownを認める初期検証器に対してREDを作り、incomplete必須へ強化した。
途中lintは未使用のschema_version退避変数で1件失敗。単純削除の変更ではTypeScriptがspreadによるschema_version重複上書きを指摘した。
systematic-debuggingで表示用versionの投影順序を確認し、metadataの後ろで固定summary versionを設定する形に訂正した。
raw reportを表示する回避策やlint/type設定の緩和はしていない。

追加で、display timeout/close後のnative write errorに対するguard不在のREDを確認した。
固定の非formatting guardをnative callback決着まで保持する処理を追加し、遅いwrite errorでも未処理例外にならないことを確認する。
このguardの解除用setImmediateが1個残るため、従来のfake timer試験はその通知turnを進めてから残数0を検査する形へ訂正した。
初回のこの確認は35件中34成功・1失敗（即時のtimer残数期待）。表示の観測期限やhost期限を延ばしてはいない。

途中の全体回帰は117ファイル・2,991件成功（35.60秒）、追加境界を含む次の回帰も117ファイル・2,993件成功（68.70秒）。
全ての最終ケースを固定した後の結果は次節へ記録する。途中の件数は追加中のsnapshotであり、最終ケース数とは区別する。

## 5. 最終検証結果

| 検証 | 結果 |
|---|---|
| 最終summary/display/approved-launch（2 workers） | 3ファイル・35件成功、2.12秒 |
| 実合成hostを含むloopback/display/summary/launchの対象回帰 | 4ファイル・143件成功、26.87秒（遅延native errorケース追加前） |
| 最終全体回帰（ローカル待受許可環境、2 workers） | 117ファイル・2,995件成功、33.83秒 |
| `npm run type-check` | 成功 |
| 対象3テストの明示的strict TypeScript検査 | 成功 |
| 変更した4実装・4テストのESLint | エラー/警告なし |
| `npm run test:pack` | build・361ファイルのproduction-only導入・解析/集約worker・MCP smoke成功。R-2非同梱を維持 |
| compiled固定.js表示経路のsmoke | 合成manifest/TTYでready固定URL→認可前取消し→strict限定summary、token not_attempted。合成秘密なし、一時fixture削除 |
| `git diff --check` / ローカル文書リンク | 成功 / 27件の参照先存在を確認 |

追加30件（報告/summary 17、表示10、既存approved-launchへ2、既存固定port suiteへ1）。
遅延write guard追加前にも117ファイル・2,994件成功（60.17秒）を確認したが、最終件数とは分けて扱う。
TDD・systematic-debuggingで途中失敗/REDを確認し、verification-before-completionに従って型・lint・梱包・全体回帰の実出力を確認した。
今回の結果を実TTY/人の承認やG2/G4・実PDIの成立、npm公開の検証には数えない。

## 6. 留保と次工程

ack等の実IPC履歴は生成元の信頼済み監督が確認する前提。strict schema単体から履歴や報告の真正性は証明できない。
侵害hostからの任意秘密混入・任意符号化、OS/TTY自身の記録・部分的に送られた表示の巻き戻し、完全メモリ消去は保証しない。
内側の自由文は表示せず、先行するhost内秘密一致検査・本文非返却・strict契約を引き続き主防御とする。
監督/host終了や表示失敗はサーバーtoken失効ではない。unknown時の封じ込め・同意取消は別承認の担当者が行う。

公開CLI/専用entryへの人向け接続、表示失敗を含む公開exit code方針、実TTY/Node下限/他OS/HS残境界、
G2/G4・復旧担当・実機のPublic Client/S256/loopback/本人ACL/C方式は未対応/未承認のまま。
telemetry調査・maint担当者への連絡は再開せず、実機操作・発行・設定変更もしていない。
