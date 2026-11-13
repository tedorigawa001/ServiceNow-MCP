# WF-B：R-b private供給・最小安定検査・実field入力化の検証記録

Date: 2026-11-13 / 基準HEAD: `3ab8caf` / 対象：[R-b設計§15](BEST_PRACTICE_WFB_BODY_PIN_RETURNED_BINDING_TERMINAL_DESIGN.md)。合成依存・package除外fixtureだけ。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。

## 1 実装範囲と閉鎖境界

private3methodのreadonlyな準備境界。既存provenanceと元R/S/Tを照合し、未使用base・空storage・空payloadを旧callingと同順に確認、同実fieldから68項目を値入力化する。既存400method本文不変、既存1methodの末尾だけを3検査の同順wrapperへ置換した。

新factory／export／mode／登録口なし。新入力化の元fixture内call site 0、returned4scalarのoperational writer 0。開始claim・実受理・G_R／G_A・C-03・body・R-b終端routingは未接続。実session／transport／worker・実通信・実機操作・設定変更・Pushは行っていない。

## 2 初回失敗と修正の切り分け

| 段階 | 観測と原因 | 対応 |
|---|---|---|
| 最初のcompiled RED | private供給methodが未実装で、元callerのcatchを経由しcaptured undefined。正規実復帰prefixを読むassertが失敗 | private readonly境界を実装し同対照GREEN |
| 初回Vitest | 3file／93件中1件失敗。新規回帰が未許可ec_close_before_callを指定し、source生成前のinput_rejectedでclaim not_createdだった | 既存C-c allowlistにあるec_fault_before_callへ訂正。期待claim unusedや実装の許可集合は緩めていない |
| 初回strict型検査 | 新規TS試験のts.isAssignmentOperatorは実行時にはあるが公開型定義にない | 公開SyntaxKind.FirstAssignment〜LastAssignmentの範囲検査へ変更。fixture実装変更なし |
| compiled群の初回停止 | 先行15script成功後、pin-start対照が旧bodyPinStartContextMatches内のbase検査anchorを発見できず停止。検査を新helperへ抽出したためで、製品timeoutではない | base／storage／payloadの3対照だけ注入先をbodyPinStableStorageMatchesへ移動。provenanceは旧位置、故障・拒否期待・感度assert・60,000msは維持 |
| semantic拒否の厳密化 | 拒否行数3だけでなく全診断TS2341を要求すると、新対照のstorage呼出しにsourceを渡す引数型不一致も混在していることが判明 | 正しいBodyPreparationShellを宣言して渡し、private拒否だけで落ちる対照へ訂正。単なる型不一致を保証に数えない |
| 初回pack dry-run | 標準npm cacheへの書込みがEPERMで失敗。npmは所有権の修正を案内したが、実際の所有者を調査／変更していない | 一時cacheを明示しoffline／ignore-scriptsで再実行、終了後に当該一時cacheだけを削除。設定・権限変更なし |

## 3 新しいcompiled対照

`compiled-probe-body-pin-returned-supply.mjs`はscratchだけへ観測を挿入する。元C-cの実primitive復帰・completion分類後／失敗writer前にprivate境界を呼び、試験後は既存pin_return_not_connectedへ停止する。試験用slot変更は読取り直後に元値へ戻し、旧callerの返答と比較する。これは運用callerの接続ではない。

| 対照 | 結果 |
|---|---|
| 独立literal期待値 | state4／source13／receiver14／root31／callee6、合計68項目が一致。実state not_started／post false、root call after／S.call・inner busy false／outer frame true |
| root単項変更 | 40件。実入力が変わるか資格で拒否。生成履歴／停止／準備・診断・cache・returned値を含む |
| source単項変更 | 13件。停止／firstは資格拒否、他は実値を保持。各試行の旧caller返答は正常対照と一致 |
| receiver単項変更 | 20件。実I/C/J・stage／first／診断・各post・busy・payloadを変更して入力差又は資格拒否 |
| 混入・Proxy | foreign R/S/T・source同値copy・hostile currentの5件を拒否、未知hook 0 |
| forged値view | actual current不一致を正常currentSameで隠しても元I/C参照検査が拒否 |
| readonly／閉鎖AST | 新3method内の代入・await・new・throw statementなし。元入力化call site 0、returned状態writer 0 |
| semantic compile-fail | private3methodへの直接呼出し3行を拒否。fixture自体の意味診断は0 |

private供給成功は受理ではない。資格が不足すればundefined、検査・view確保throwは呼出し側へ伝播するだけで診断を捏造しない。新R-bの失敗記録・seal／cache合流はまだ確認できず、将来条件として残す。

## 4 実行結果

| 確認 | 今回の結果 |
|---|---|
| focused Vitest再実行 | 3file／93件成功 |
| 関連合成回帰 | pin各段階・source issuer・storage／seed／live／bundle・composition、19file／1,276件成功 |
| build | npm run build、exit 0 |
| fixture／新規TS試験strict | ES2022／NodeNext／strict／noEmit、exit 0 |
| lint | fixture・新compiled・新TS試験の3fileと移行したpin-start compiled、各exit 0 |
| 関連compiled群 | compiled-probe各段階＋compiled-declared-actual、26script成功。初回15成功後のanchor停止を修正し、残り11を再実行。新supply対照はsemantic診断厳密化後にも再実行成功 |
| 梱包dry-run再実行 | 441file、workerあり、src／tests／新fixture流出0。offline・ignore-scripts・一時cache使用 |

全体回帰は未実施であり、関連回帰の成功を全製品保証へ拡大しない。既存試験の期限とcompiled各processの60,000ms上限は変更していない。新private境界の正例もPC08受理を意味しない。

差分監査：実装／試験／CHANGELOG／設計／本記録の8fileだけを変更。src・runtime／設定／manifest／lockfileは不変、旧calling active guard・provenance・C-c失敗／seal callerは本文一致。文書3件のローカル参照16件・表23個・節順を確認した。HEADは基準のまま、index登録・コミット・Pushは行っていない。

## 5 所有権・費目と残課題

Sは元R、I/C/Jは元Tの既存責務に残る。readonly viewは元参照を含まず、診断／cache／claimの能力へ昇格しない。private検査・view生成・descriptor走査・既存captureInspect等の確保を追加費目として扱い、物理allocation 0とはしない。実E／S・work上界・停止後解消予約・cleanup／借用退役・診断必着はUnknown。

次はconstructor固定の新R-b継続と開始／全照合・失敗診断／単一cacheの接続範囲を別承認で扱う。G_R／G_AやC-03を部分有効化せず、R-a等価5節・C-c等価31節を接続時に再評価する。今回のcompiled単項対照は、全節の変異監査や将来RBV全体の完了を意味しない。

## 6 コミット対象だけの再検証（2026-11-13）

基準HEAD `3ab8caf53d5e56a20ae1aba11a78172e930061d1`の内容へ、今回の8fileだけを反映した一時検証copyを作った。既存node_modulesはリンクで再利用し、別の作業中差分・元作業場所のdistは取り込まない。対象8fileのSHA-256と元作業場所のbyte一致を確認してから検証した。最初のcopy準備はarchiveを受けるchild_processの既定出力bufferでENOBUFSとなり中断したが、archiveを一時fileへ出す方式へ変更して完了した。製品・試験の期限／設定／実装を変更した失敗ではない。

同copyでbuild、19file／1,276件の関連合成テスト、fixture／新TS試験のstrict型検査、変更したTS／MJS計4fileのlintがすべてexit 0。関連compiled26scriptも最初から最後まで成功し、各processの上限60,000msを維持した。packは一時cache・offline・ignore-scriptsのdry-runで441file、dist/review/review-worker.jsあり、src／tests／fixture混入0だった。全体回帰は実施していない。

この結果を本記録へ追記後、文書だけを同copyへ同期して最終byte／リンク／差分範囲を再確認する。実装・試験の内容は検証開始時から不変。先行失敗履歴は§2に保持し、正式発行口閉鎖・全体受付無効・Unknown・調査保留、実受理／G_R／G_A・C-03・body未接続を維持する。実接続・実通信・設定変更・Pushは行わない。
