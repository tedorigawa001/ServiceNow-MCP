# RP-01：同sessionの元deadline／startedAt／policy projection合成検証

Date: 2026-11-01 / Baseline: `9de9c6a`。

## 1 限定範囲

[再利用契約draft-0.2 §8](BEST_PRACTICE_ABORT_SCOPE_RELEASE_DEADLINE_REUSE_DESIGN.md)の最初の実装。既存BoundedReadSessionの固定fake-200継続に、constructorの設定pin時の値と結合したprivate projection生成・一度限りの消費検査を追加した。実sourceの`#observeRelease`・通常GET・既存release判断・比較器は差し替えていない。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持。実接続・実通信・実機操作・トークン発行・設定変更・Pushは行わない。既存fake継続のprepared結果や実Permitの内部動作を新たな正式発行口と扱わない。新しい公開getter・projection supplier・friend・registryはない。

## 2 所有権・順序・会計

[実装](../src/servicenow/bounded-read.ts)のconstructorで、pin済みpolicyとその時点のthis／startedAt／limits.deadlineMsを凍結originに保持する。getterは既存実装を再利用し、新しい値設定口やremainingの再計算を作らない。通常sessionにもoriginを確保するが、projectionの生成／消費を呼ぶのは既存固定fake-200継続だけ。

親ack受理後にfresh→capturingを先に立て、同getterを1回だけ読み、元origin・同source／composition key・guard後の現状態に一致する場合だけpendingにする。release-200受理前にslotから値を除去し、consumingとして同origin／source／keyと元S／L／policy・現状態を再確認する。成功ならconsumedにし、今回の値は破棄する。比較器へ渡す接続は後続工程。

失敗ではclosedへ進め、同停止ownerで先行理由を保持する。finally／同期失効でprojectionを消し、rollback／closeでoriginも解放する。freshへ戻す復活処理はない。新しい試験用入口でprivate状態を直接二重実行できるようにはしていないため、二重呼出しの動的試験を実施したとは主張しない。

C/G/P・予約／返却・cleanupのownerは変更しない。追加の確保はorigin、projection、timing各1個と固定参照比較／guard。policy／raw設定・bytesの追加deep copyはない。正確なlayout／work・同期処理上界はUnknownのまま。

## 3 新規25件と独立した期待値

[合成試験](../tests/review/release-session-projection.test.ts)は実classと既存fixed fake transcriptを使う。getterの置換は破損・取消を再現する故障注入であり、新しい供給口として認めない。比較器・sourceの内部判定を置換して成功を作る試験ではない。

| 検証 | 確認した範囲 |
|---|---|
| 既定／低減L | 60000／10000を既存getterから各1回。元optionsを変更してもL不変 |
| 残時間の拒否 | 親待機1000ms後のremainingをgetter値へ故障注入すると不一致で停止。通常生成ではremainingMsを呼ばない |
| 停止・秘密 | getter throw、取消、元deadline到達を固定理由で保持。取消後のthrowも先行取消を維持。例外本文を返さない |
| 同session結合 | startedAt／deadlineの破損、同値policy clone、別sessionのpolicy混入を拒否。値の一致をidentity証拠へ昇格しない |
| 採取後の変化 | pending中のstartedAt／policy交換を消費前に拒否 |
| 設定pinの境界 | L=10000、E=S+L−1／E=S+L／E=S+L+1のissueを固定期待値で照合。providerはconstructorで1回だけ |
| 不正getter | 0／NaN／Infinity／60001を内部停止。新deadlineへ救済しない |
| pending失効 | 取消／session.close後は採用せず、timerを残さず後続fresh runが可能 |
| 非公開・通常source不変 | summaryにprojection／session／policy等なし。prototypeへ新公開methodなし。通常の実source＋fake fetchでは新projection getterを呼ばず既存判定とC=2を維持 |

取得前の不一致ではC=1（親だけ）、pending中の変更ではC=2（release dispatch済み）を確認する。成功時の既存合成回帰は同bytes由来GとP=0・予約返却を保持する。期限値を緩めていない。

## 4 初回失敗と補強

1. tracerはgetterのLを10000へ置換し、constructorでpinした60000と違うことを拒否する期待でRED。旧コードではprepared_onlyとして成功していた。private生成／消費を接続してGREEN。
2. 故障注入中のstartedAt変更では、読取済みの古い値だけを検査していたため、拒否はできてもrelease dispatch後のC=2になり、「取得前にC=1で止める」期待が1件失敗。getter前後のデータ経路を照合し、guard後の同session現状態も再確認してGREEN。
3. standalone TypeScriptで模擬snapshotのoauth.clientSecret必須項目が欠ける1エラーを検出。空の模擬値を追加し、型抑制で逃げずにエラー0を確認。

## 5 検証結果

| 確認 | 結果 |
|---|---|
| 新規＋旧private composition／source binding／D01〜03 | 6ファイル／187件成功、新規25件 |
| `npm run build` | 成功 |
| standalone TypeScript | 新規試験でエラー0 |
| オフライン梱包 | `node tests/review/package-http-classification.mjs`成功、425ファイル。既存compiled fixtureと宣言へのprivate型／生成消費method名の非露出を確認 |
| 全体合成テスト | maxWorkers=1で228ファイル／10,000件成功、失敗0・pending 0、約120.4秒 |
| 文書・差分 | 更新5文書の参照66件・版数参照8件が整合。`git diff --check`成功 |

全体実行：`npm test -- --maxWorkers=1 --reporter=json --outputFile=/tmp/servicenow-rp01-tests-20261101.json`。別build／testと重ねず、製品／試験の期限を維持した。JSONはローカル一時成果物で、恒久結果は本書に記録する。B-03の開発assembly専用compiled保証・通常並列の再発解消を主張しない。補助package-workerの依存取得試験は再実行していない。

コミット前確認：候補9ファイルを含むindex全体を一時ディレクトリへ書き出し、既存node_modulesだけを参照した。候補のbytes一致と無関係な`.vscode/`・`CLAUDE.md`の不在を確認し、そのコピーでbuild・関連6ファイル187件・standalone TypeScript・425ファイルのオフライン梱包が成功した。全体10,000件はこの再確認では再実行せず、上表の実装時結果と区別する。検証後の追加はこの記録だけで、実装・試験内容は変更していない。

## 6 残課題

投影値を比較器へ入力する接続、同値比較の動的保証、観測UTC採取／壁時計と上位時刻、長い待機後の設定issue整合、§5のDL受入条件全項目は未完了。通常実sourceへの差替え・非200/nativeの移行・Permit経路の変更は未実施／未承認。既存limits Recordをruntime deep-freezeしたわけでもなく、任意のローカルコード改変への完全防御は主張しない。

旧case対応表の分類・実class保証と別assembly保証・B-03・friend撤去・日時長cap・全体work上界を今回の成功で完了にしない。
