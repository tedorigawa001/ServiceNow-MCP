# WF-B DT-B：private recorder終端・安全なPendingの合成検証

Date: 2026-11-05 / 実装前HEAD: `aa575f3` / Status: **合成依存限定**、コミット`52136f4`。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushは行っていない。再採取・証拠保管・manifest発行・実ProcessOwnerの起動／終了操作も行っていない。保存先・保持期間・運用時間枠・停止方式・費目上界の承認状態は変更しない。

設計は[固定期限表・recorder終端](BEST_PRACTICE_WFB_SLOT_DEADLINES_RECORDER_TERMINAL_DESIGN.md)§8.2。今回の実装はDT-Bのみで、DT-Cの連続検証・最終費目は未実施。

## 1 実装

試験専用`tests/review/fixtures/store-recorder-kernel.ts`へ以下を追加した。runtimeソース／設定は変更していない。

- 子生成前のprivate terminal slotと、子生成後の同owner／run／budget／recorder identity。保存epochの進行とは独立に、要求／完了epochを記録する。
- 合成限定`finishRecorder(run, recorder, store)`。foreign参照・copy・診断DATAは拒否。健全な保存受付では`not_ready`でclaim 0。Closed／Stoppedで一度だけclaimを取り、Pending→Entered→Committedへ進む。内部identity不整合だけはFailedで再実行不可。呼出し側から時刻・四軸・queue・理由・callbackを供給しない。
- owner操作・入口拒否／fatal区間のdepthと、共有clock読取中／Store busyの検査。既存保存・消費・cleanupが終わり、試行結果が固定された後にだけ固定unwindから進む。Store busy照会／unwind取付けとrecorder終端はmodule-private継続で、公開friendは作らない。
- 固定terminal sectionはprivate recorder stateをClosedへ変更するだけ。queue・要素・順序・issued・first reason・testFailure・四軸を変更せず、abandon／verify／publish・clock・IO・callbackを呼ばない。
- 元の共有clockをpre最大1回、pre有効時だけpost最大1回読む。未知clockでも可能なメモリ閉鎖はCommitted。時刻不明／lateは別診断で、D_all等値はlate、post失敗でもcommitを戻さない。保存／process終了の成功へ昇格しない。
- Closed後のclock異常はphaseをClosedのまま維持し、空ならbridge理由clockを残し、Storeを一度だけ取消す。正常時刻へ戻っても受付は回復しない。cleanup向けclock読取は残し、Store first reasonと試行別cleanupを上書きしない。
- 生成失敗ではownerを返さず、terminal slotはclaim 0。recorder未生成をnot_constructed、Store生成失敗で既にClosedのrecorderをalready_closedと記録し、未生成を閉鎖成功にしない。

## 2 独立対照

手書きのstate→固定理由表、元checkpoint要素の参照・順序、元四軸・先行診断・ack件数・保存slot、明示D_all境界をoracleにした。terminal helperをoracleから呼ばず、各故障点への到達回数をassertする。

| 対照 | 確認 |
|---|---|
| Gated／Reserved／Observing／Draining／Verifying／Published／Closed | 同queue要素参照・順序／issued・四軸・異常・first reasonを保持。unsavedとunacknowledgedは元queue件数。ObservingはstopNotObservedを残し、stop_requestedを追加しない |
| 早期・foreign／copy／summary・二重／再入 | 早期／混入はclaim 0、受理は1回だけ。pre／post-clock中の再入も再実行0 |
| reserve／checkpoint／prepare／discard／observeStop／入口拒否・fatalの途中 | Pendingのまま。最外側unwind前にEnteredへ進まない。終端clockを読取途中へ再入させない |
| save／handle cleanup途中 | closeと試行結果固定を先に終える。close返答confirmed／unconfirmedを保持し、二重closeしない |
| ack済み／保存済み未ack／未試行の混在 | 元残queue、ack件数、各dispositionを保持。私的証拠は残さず、再保存／再ackは不可 |
| D_all−1／D_all／D_all＋1 | 2回以下のclock読取。等値／超過late、期限再計算・受付再開0 |
| pre throw／逆行／NaN／負値、post throw | pre不明時のpost読取0、メモリ閉鎖保持、時計不明を枠内完了と扱わない。clock回復後もStoreは取消済み |
| 先行write・close失敗とterminal clock異常 | bridge／Store first reason、試行の主理由／cleanupをそのまま保持。raw例外の秘密を反射しない |
| 元slot tableのmanifest区分 | spy-only子Storeの操作中もPending。元rowの保存／receipt消費は継続可能で、終端そのものはStore保存成功やrun保全ではない |

Verifying／Publishedは、生recorderを使ったbranch準備である。bound facadeのpublish成功・実終了の証明とは区別する。未確認handle・OS leaseの具体回収はUnknownのままで、terminal helperはファイルや未解決責務を消去しない。

## 3 初回失敗と切り分け

最初の6ファイル実行は**432件成功・1件失敗（計433件）**。既存`store-recorder-binding`の「keeps validating the clock after a stop…」が、Closed後の時計逆行でもbridge理由をundefinedと期待していた。単独再現も同じ1件失敗（76件skip）だった。

旧`#fatal`はClosedで早期returnして理由を残さなかった。一方、設計§3とDT-Bの`#clockFailure`はClosedを保持しつつ理由clock・Store取消を要求する。初回失敗はこの旧期待値との不一致であり、負荷・期限・環境制約の失敗ではない。設計の明示差分に合わせて既存試験を訂正し、正常時計へ戻ってもStoreを再開しないassertを追加した。期限を緩めず、試験を削除／skipしていない。

その後の433件、追加対照を含む436件、最終437件は成功した。初回失敗を隠して全実行成功とは記録しない。

## 4 最終検証

| 実行 | 結果 |
|---|---|
| `bdo npx vitest run tests/review/recorder-terminal.test.ts` | **31件成功** |
| 上記＋`slot-deadlines`／`fixed-recorder`／`fixed-evidence-store`／`store-recorder-binding`／`store-recorder-persistence`の6 test files | **437件成功**、失敗0 |
| `bdo npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck`＋共通kernel／3 wrapper／上記6 test files | 型エラー0 |
| `bdo npx eslint`＋変更したfixture／test計3ファイル | 問題0 |
| `bdo npm run build` | 成功 |
| 静的build／配布境界 | src限定build・tests除外、package filesにtestsなし。src 183ファイルに新private継続／kernel参照なし。terminal／Store unwindのprivate継続は非export。archive作成0 |
| `bdo git -c core.fsmonitor=false diff --check` | 成功 |

全体回帰・実npm pack／dry-run・展開／production install・実保存・OS／network／worker接続は未実施。静的境界確認を実梱包成功や実機保証へ昇格しない。

## 5 レビュー修正（2026-11-05）

`52136f4`のレビューで実装の誤りは見つからなかった。§4の数値は修正前の記録としてそのまま残す。変異61件のうち17件が残り、そのうち13件はテストの不足だったので、`recorder-terminal.test.ts`に対照を追加した。fixtureの挙動は変更していない。

| 追加した対照 | 検出するようになった変異 |
|---|---|
| pre不明時の`late`が未定義 | pre不明を`late=false`にする |
| preがD_all等値でpostが失敗 | preの等値判定を`>`にする、post失敗で`late`を消す |
| preが枠内でpostだけD_all等値 | postの等値判定を`>`にする |
| pre読取中はrecorderが元の状態 | pre-clockの前にcommitする |
| 閉鎖後のclock不正を2回 | Store取消の一度限りを外す |
| 閉鎖後の入れ子読取 | 入れ子読取を`#fatal`のみにする |
| 生Store consume中の要求 | 生consumeのunwindを外す |
| 致命的停止後の要求（epoch=1） | 要求時／完了時のepochを0にする |
| 7状態の`from`／`queued`、Store生成失敗の`from`／`queued` | `queued`を記録しない、生成失敗時の`from`／`queued`を記録しない |

DT10の「取得済みhandleのcleanupは継続」は、閉鎖後の一度限りのclock不正でmanifest handleを1回closeする対照を追加して確認した。clock不正が続く場合は、cleanup前の読取も失敗するのでcloseを試みず、`unconfirmed`／`clock`のままになる。§2.1の期限確認と整合する既存の挙動で、今回変更していない。

Store生成失敗時の`queued`は、既存の致命的停止が発行する停止checkpointを含むので1である。追加時に0と期待して1件失敗したのは試験側の誤りで、期待値を訂正した。

再実行の結果、対象ファイル単独で変異61件のうち57件を検出した。残る4件は等価変異である。

| 変異 | 等価である理由 |
|---|---|
| `#drainTerminal`の`#busy`確認を外す | `#busy`が真なら`#depth`も必ず正になる |
| `boundConsume`のunwindを外す | `persist`の中でのみ呼ばれ、`#leave`がdrainする |
| Entered時の`#retire`を外す | 終端phaseへの遷移時に毎回retire済み |
| `Failed`の分岐を外す | 現状は到達不能。したがって§1の`Failed`の記述はテストでは確認していない |

| 実行 | 結果 |
|---|---|
| `recorder-terminal.test.ts` | **38件成功**（修正前31件） |
| 全体テスト | **294ファイル、14,234件成功、失敗0** |
| repo全体のlint | エラー0 |
| build、`package-http-classification` | 成功 |

## 6 残課題

DT-CとしてD_stopからFIFO保存・D_save閉鎖・終端までの状態別連続対照、通知throw／部分生成／cleanup異常の組合せ、追加記録費・work／時間上界を確認する必要がある。同期操作が戻らなければPendingの完了は保証できない。ProcessOwner・実FD回収・manifest必須集合・正式writer・運用cap／保存先の承認は別課題のまま。§7の全受入条件や全体受付の完了とは呼ばない。
