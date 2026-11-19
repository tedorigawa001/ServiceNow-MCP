# AP05：候補検証の観測手段比較・取得証拠と費目の対応

Version: release-ap05-candidate-observation-method-comparison-draft-0.2 / Date: 2026-11-19。
Status: **比較設計のみ。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準は `90a2019`。候補revision、実測、候補Pの終了証拠は未取得。表の「取得できる証拠」は前提を満たした場合の受入契約であり、現行で取得済みという意味ではない。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`a83dc77`（修正時のHEADは`a83dc77`）。§4に静的確認を追加し、費目台帳と保全方式の選定条件から本書への参照段落を追加した。各VM行・判定は変更していない。

[固定終了観測点・費目台帳](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_OBSERVATION_COST_LEDGER_DESIGN.md)のV01〜04／L01〜11を比較単位とし、[外側時間枠・cleanup予約](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_OUTER_BUDGET_CUSTODY_DESIGN.md)の `W_i`・`R1〜R7`、[保全方式の選定条件](BEST_PRACTICE_RELEASE_AP05_CUSTODY_SELECTION_CONDITIONS_DESIGN.md)のKS01〜09に接続する。対象は[共通受入設計](BEST_PRACTICE_RELEASE_AP05_PK01_PK04_CANDIDATE_ACCEPTANCE_DESIGN.md)のPK01〜04候補P。H／D・UN62／LM03・AP06とは観測の由来・責務・時間枠を分ける。

先行AP03の未コミット差分、通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回はMDのみ。旧試験変更・実装・試験実行・build／梱包／展開・観測／process／保全操作・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 現行の事実と比較上の区分

[PK01](../tests/review/package-canonical-budget.mjs)・[PK02／03](../tests/review/package-http-classification.mjs)のcompiled childは `execFileSync`／`stdio: 'inherit'` で、起動箇所に明示timeoutはない。dry-run側のpipe／`maxBuffer` はcompiled childへ適用されない。[PK04](../tests/review/package-worker.mjs)は外部コマンド・smoke childに個別timeoutを持ち、stdoutをassertし、一時領域を `finally` で処理する。これらを外側の退出・stream終端・受理／削除の全証拠とは数えない。

[既存worker supervisor](../src/review/worker-supervisor.ts)は内部Workerのexitを扱い、`terminate()` の正常解決後にlistener／streamを処理する。[WF-A](E2E_BEST_PRACTICE_WORKER_PARENT_OBSERVATION_WFA_2026-11-04.md)にはテスト側のfactory／terminate／exit相関の先例があるが、対象fixture・生成元を通った範囲に限られる。WF-Aの内部時刻・既存上限・試験用factoryを候補配布物へ移植したり、出力を外側の合格票にしたりしない。

以下の「直接候補」はその観測点の証拠を得られる可能性のある案、「補助」は独立照合に使えるが単独で昇格しない案、「現行のみ」は既存のassertion・経過の根拠であり、候補Pの必須証拠には不足する案。いずれの案も採用・実装・権限付与はしていない。

## 2 観測点ごとの候補比較

| ID／観測点 | 候補手段・付与しない権限 | 取得できる証拠・成立条件 | 欠落時の扱い | 主な対応費目 |
|---|---|---|---|---|
| AP5-VM01／V01 runner・command | **直接候補：** 検査器側の外側ownerが、自ら起動する固定commandのhandleを所有し、独立した期限監視から観測。別processへのattach・停止権限は付与しない | 同slot／attemptの起動前記録、同handleの受領、停止要求とは別のexit、対象を回収した事実。観測登録が起動の早い失敗にも届き、時刻は外側で受理することが条件 | spawn throw・handle未着だけでは生成有無不明。exitだけなら回収未確認。次のcommandを起動せず、部分生成責務を上位へ | L01 先行枠、L02〜04 command起動と通常確認、L05 停止、L06 exit／回収 |
| AP5-VM02／V01 runner・command | **現行のみ：** 同期呼出しの復帰／throwと固定結果を読む | その呼出しの結果や既存assertionの範囲。tool内部の終了処理は静的読取りの範囲で参照できるが、独立した受理記録はない | code 0・timeout・killの要求だけでは期限内回収を認定しない。既存結果は残し、V01の不足をUnknownにする | L02〜04 実行／結果。L06の外側確認は代替しない |
| AP5-VM03／V02 子・孫process | **直接候補：** 起動元での先行登録と、所属・世代を照合できる所有境界内の退出観測を組み合わせる。commandを作る箇所ごとに捕捉範囲を確認 | 同系統の作成試行→handle／generation→個別退出・回収。生成受付の閉鎖と把握した集合の完全性、または正規生成点での未生成証拠が条件 | 把握できない孫・付け替わった親子関係・未登録tailは未確認。既知対象が全て退出しても全体完了にしない | L01 識別枠、L02〜04 関連command、L05 承認済み停止、L06 登録／join／集合確定 |
| AP5-VM04／V02 worker thread | **直接候補：** 同じWorker生成元の生成・close完了を、配布外の固定検査器で相関する案。既存のテスト側観測は境界検討に限って参照 | 同review／worker生成試行・同generationに結んだexitや正規の終了待ちの完了。正規経路を迂回せず、候補artifactの別物化・権限追加なしで捕捉できることが条件 | 通常経路を変えないと捕捉できない、生成集合が不完全、通知欠落なら未確認。ready／finish返答、`terminate()` 試行、processのPID不在だけで代替しない | L04 観測付き検査／結果、L05 停止、L06 thread登録／終端、L07 worker側streamは別計上 |
| AP5-VM05／V02 追加照会 | **補助：** 承認された範囲の読取専用process情報で既知の所属・退出を照合。一般の列挙や別process操作へ広げない | 事前の同handle／世代と対応づけられる範囲の不一致・残存の手掛かり。照会外や短命な対象の不存在、threadの完全性は証明しない | PIDだけの一致、一覧に出ない、照会不可を終了・未生成にしない。正規生成証拠の欠落を補わない | L06 追加照会の回数・結果保持・待受。L08 残存資源台帳との照合を行う場合は別計上 |
| AP5-VM06／V03 command stdio | **直接候補：** 外側ownerが最初から所有する固定pipeで stdout／stderr を別々にdrain・観測し、stdinの所有modeを固定する案 | stream identityごとのEOFとcloseの状態、error・未採取／切詰め、所有stdinのcloseまたは非所有の根拠。drainは子のjoin待ちと並走し、保持量と通過量を独立計数 | 片側だけのEOF、保持打切り、出力未着・上限超過をもう一方の証拠にしない。エラーcloseを正常EOFにせず、未確認は上位へ | L02〜04 正常時のstdio、L07 終端・保持・有限drain。観測により待ち方が変わる費用を明示 |
| AP5-VM07／V03 内部worker stream | **直接候補：** 同Worker ownerが持つstreamで終端観測し、外側へ固定の状態だけを渡す案。raw出力の中継・保存、公開診断口は追加しない | 同worker generation／stream役割に結んだ終端・error・破棄要求の区別。外側commandのpipeとは別の証拠。元のdrain・終了待ちを損なわずに捕捉できることが条件 | worker側の通知がない、観測開始前に失った、または `destroy()` 要求しか分からなければ未確認。親pipeのcloseや成功文字列では埋めない | L04 観測済み結果の受理、L06 workerとのidentity連結、L07 streamごとの処理・状態保持 |
| AP5-VM08／V03 既存出力 | **現行のみ／補助：** inherit・同期コマンド出力・smokeの固定summary、buffer上限やエラーを比較する | 合成smokeのassertionの成否、取得できた要約、元の設定。どのstreamがいつ閉じたか、通過総量、隠れた未終了は示さない | 出力なしを0bytes／終端済みとせず、`maxBuffer` 到達やtimeoutをEOFの証拠にしない | L02〜04 結果照合。L07の個別close・通過量・保持量を代替しない |
| AP5-VM09／V04 保全枠・受理票 | **直接候補：** 監視側から独立した上位の正規記録に、同枠を読み取りで照会する案。読取にcommit・削除権を伴わせない | 先行枠、同commitの受理票とepoch／snapshot、権限の所在、未解決責務を同候補／slot／attemptに照合。応答が失われても再作成せず同じ枠を参照できることが条件 | 不達・古い記録・異なる票は移譲未確認。別枠生成・再commit・削除は0。非受理は遅延要求も受理できない確定記録があるときだけ | L01 先行登録、L08 棚卸し、L09 commitの費用とread-only照会費を分離、L11 状態の封印 |
| AP5-VM10／V04 処理・独立空確認 | **直接候補：** 唯一の処理ownerの削除claimと操作結果の固定記録、同資源を確認する独立の読み取り観測を分ける案 | 同受理票・同owner世代の試行権、実操作の結果、許可範囲の空確認を独立記録する。対象の置換や別対象への照会がないことを確認し、正規に確認できた未処理と結果不明も区別 | claimや削除要求だけで完了にしない。結果欠落・範囲不明では再削除せず、保全側へ。後日の空確認は元操作の成功に遡及しない | L08 対象とpin、L09 受理票照会、L10 claim／処理／確認、L11 結果記録を別計上 |
| AP5-VM11／V04 現行の後始末 | **現行のみ：** PK04の `finally` による一時領域処理・同期の復帰／例外を参照 | 現行スクリプトの削除呼出しとその経過の範囲。上位受理、排他、独立した空確認は示さない | 現行期待は維持し、候補Pの受理／解放の証拠にはしない。候補Pで同対象を処理する経路が排他的と確認できない案は採用不可 | L03 一時領域準備に対応。L09〜11の受理／排他／確認には独立した費用が必要 |

## 3 比較時の共通判定と費目への受渡し

1. **同じ対象の証拠を揃える。** 候補pin／plan／slot／attemptを先行確保し、対象ごとにhandle・世代・stream役割・受理票を正規供給元で照合する。producer側の通知と外側ownerの期限内受理を別記し、時刻は外側の単調時計で締切と比較する。別世代、重複、遅い通知で元の未確認を成功にしない。必要な観測手段の組合せが組めず、登録集合や供給元の完全性を示せなければ起動しない。
2. **何が確認できなかったかを残す。** 試験結果、runner回収、worker集合、stdio、保全は別状態。`confirmed_not_created` は正規生成点の証拠、`not_applicable` は固定plan・所有modeの根拠が必要で、どちらも未観測からは作らない。運転中の欠落・不一致は次slotを閉じ、同枠の既知prefix・先行理由・残存責務を保全側へ渡す。`D_end` 後の確認は別途承認された解放記録だけで、元判定を変更しない。
3. **測る費目を手段ごとに分ける。** 対応L行に、追加する起動／登録／読取／受理の最大回数、対象の累積件数と同時件数、通過・保持bytes、通知配送と待受cutoffを分けて渡す。通常slotの確認は `W_i`、停止後の残りと系列共有物は一度だけのcleanup予約。直接候補と補助を併用するなら操作費は両方計上し、待受の重なりを差し引けるのは競合・同期点まで説明できる場合だけ。既存timeoutや待受終了を物理退出の上界にしない。
4. **採用前に観測による差を確認する。** 予定する配布外entry・対応環境・観測できる生成／閉鎖点、観測なしの通常対照との差、secret非保持、未確認時の引継ぎ先を比較票に残す。候補本体の差替え、friend／採用口、無制限の列挙・出力捕捉、引継ぎや停止権の暗黙付与を必要とする案で穴を埋めない。変更・実測・保全方式の比較と採用は別gateとし、この表で合格・実装・実行を承認しない。

将来の独立対照は、即時spawn失敗／handle遅着、親exit後に残る子・thread、片streamの終端先行／出力上限、保全commit後の応答消失／別世代の票、claim後に結果不明、期限後の通知を分ける。費目別上界および保全方式の比較へは不足理由も含めて渡し、未確認値を0に置き換えない。

## 4 静的確認

基準`a83dc77`で、PK01（package-canonical-budget）とPK02／03（package-http-classification）のcompiled childが`execFileSync`／`stdio: 'inherit'`で明示timeoutを持たず、`maxBuffer`／pipeがdry-runの`npm pack`だけに付くこと、PK04（package-worker）の外部コマンド120秒・smoke child3件各15秒・stdoutの`assert.equal`・一時領域の`finally`／`rmSync`、worker supervisorの`exit`処理と`terminate()`解決後のlistener解除・stream `destroy()`、WF-A文書の存在、費目台帳のV01〜04／L01〜11、保全方式の選定条件のKS01〜09、外側時間枠設計の`W_i`／`R1〜R7`と各VM行の対応費目を静的に照合した。本書のID11行（VM01〜11）が他文書のIDと衝突しないこと、表1・ローカル参照9・明示anchor0、参照先・表列数・末尾改行・差分空白を確認した。製品・試験・設定の差分はなく、実行・build／pack・観測／process／保全操作は行っていない。
