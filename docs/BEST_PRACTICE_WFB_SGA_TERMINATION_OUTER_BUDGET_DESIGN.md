# WF-B SG-A後：終了確認・外側時間枠・cleanup予約

Version: draft-0.1 / Date: 2026-11-14 / 読取り基準HEAD: `668a276`。

Status: **詳細設計のみ。数値profileは未承認候補で、実装・試験再実行・実process対照は未実施。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushは行わない。

親は[通常並列3件timeoutの対照計画§7・9](BEST_PRACTICE_WFB_SGA_PARALLEL_TIMEOUT_CONTROL_PLAN.md)と[依存pin・実効設定設計§6・10](BEST_PRACTICE_WFB_SGA_DEPENDENCY_PIN_CONFIG_DESIGN.md)。本書の対象はP9／P8のtrialを観測する外側ownerであり、compiled旧／新のABBA childや、SG-Aの60秒／3秒cleanupの実装をそのまま転用する設計ではない。

## 1 不変条件・目的

対象3件の5秒は各test一件全体の元Vitest期限である。外側ownerはこれを再設定・置換せず、同期処理を5秒で必ず中断できるとも主張しない。worker数・pool・isolate・file並列度を変更して終了を早めない。PT1／PT2の反復分割、準備のtest外移動、case skip、再起動による期限追加もしない。

必要なのは、test結果と、runner／worker／stdioの終端を別々に観測し、観測枠を超えた場合も未確認責務を失わないことである。timeoutの通知が遅れても、時刻比較によって期限超過を残し、遅いcode 0やsummaryで成功へ復帰しない。

## 2 先行ownerと所有範囲

| owner／slot | 起動前に保持するもの | 終了までの責務 |
|---|---|---|
| 上位BatchCustody | 計画版・H0／H1・P9／P8、固定4trialのslot、外側owner喪失時の保持先 | 各trialの未確認を受領。前trialの責務が未確認なら次slotを起動しない |
| TrialOwner | 同trialのpin／起動chain、clock domain、固定deadline、出力・診断・部分生成用slot | runnerと独立して観測・停止要求・後始末・固定終端を進める。生成失敗も保持 |
| SpawnAttempt | spawn試行予約、所有handle受領前の未確定slot、受領後のprocess identity | throw／reject／遅いhandleを未生成と推測しない。PIDだけで別processへ接続しない |
| WorkerRegistry | 同runner／poolへの結合、既知worker identity・作成／退出、未採取／overflow slot | forkとthreadを区別し、未登録tail・pool終了未確認をUnknownとして保持 |
| StreamOwner | stdout／stderr別の採取・drain・終端、stdinの所有mode | runner開始直後からdrainし、保持上限到達後も後始末を妨げない |
| Receipt／FailureSlot | 最初の理由、四軸診断、copy／一時領域・副作用の責務、上位移譲状態 | 報告不能や上位ack欠落でも、元の責務を空にしない |

いずれも将来の内部契約案であり、今は生成しない。上位ownerはrunner内部のfinallyだけに依存せず、trialの観測process／runner喪失と独立に受領状態を保持できる必要がある。具体的な供給元・耐障害性・保管先・受領機構は未選定。実行前gateが未充足であることを明示する。

所有範囲は今回の起動chainから確認できたrunner・worker・一時領域だけ。未知の子孫・別groupへ離脱したprocess・同じPIDの再利用を自動発見／所有済みとはしない。global process一覧・他アプリのcommand lineを採らず、無関係なprocessへsignalを送らない。

既存のbdo／npm／npx等を含む起動chain・TTY／pipe／継承modeはpinした元条件を保つ。監視の都合でwrapperを迂回したり、新しいgroup分離・detached起動・pool設定を追加したりしない。group全体への操作は独占所有が確認された場合の別承認に限り、共有groupを対象にしない。

## 3 終了の四軸と受理条件

| 軸 | 個別に残す確認 | 代用にしないもの |
|---|---|---|
| test／実行 | fullName・manifestの結果／欠落、元5秒設定、unit失敗／未到達／外側中断、最初の理由 | code 0だけ、summaryだけ、内部反復の一部成功 |
| process／worker | runnerのexitとclose、code／signal／親観測時刻、同poolの終了、各既知workerの退出・未確認tail | runner exitから全worker終了を推測、PIDだけの照合、registry件数0だけ |
| stdio／採取 | stream別listener状態・byte数／保持／truncated、EOF／error／close、report受理、stdin所有mode | 未採取0byte＝空、exit＝EOF、error＝正常EOF、保持終了＝drain終了 |
| custody／解放 | 残存handle・一時領域・副作用、上位受領receipt、削除可否・削除結果 | message送信だけ、ローカル参照clearだけ、親processの自然終了だけ |

runnerの終了eventとworker registryの証拠は同trial／起動generationへ結合し、重複・矛盾・別trialのeventを拒否する。threadの退出は同じprocessのPID不在では確認できない。pool解放の正規供給点と、そのcomplete性の確認方法は実装前に特定する。未確認workerがいる状態でpool終了を補完しない。

stdioの接続・drainはworker joinより先に開始し、cleanup中も並行して継続する。pipeを読まずにexit／joinだけ待つ順序は採らない。stdout／stderrは別々の終端を要求する。stdinがignore／非所有／継承の場合はその根拠を記録し、非所有stdinを閉じたり入力内容を採取したりしない。実際のtransportが異なるtrialを同条件としない。

出力保持量・byte計数上限・診断schema・通知の固定上限は別途有限値の確定が必要で、今回無制限bufferを許可しない。truncatedでもdrain完了とprocess終了は別に確認できるが、失われたreportを受理済みにせず、採取不完全として扱う。raw例外・source本文・秘密値を診断へ流さない。

## 4 時間枠の起点・候補profile・根拠

### 4.1 起点を固定する

pin／copyの前準備には別の有限上限・費用予約が必要で、現在は未導出。この準備費を後述の観測時間へ含めたふりをせず、開始／終了を別記録する。準備が完了し、TrialOwner・上位custody・出力slotが保持された後だけ、次の観測cycleをarmできる案とする。

- `t_arm`：起動前負荷の最初のsampleを始める直前の、外側ownerの単調時刻。
- `t_spawn`：既存起動chainへのspawn試行を呼ぶ**直前**。processのready・最初のtest開始・設定解決後を起点にしない。
- `t_clean`：停止要求の確定、またはrunner exitの受理のうち、先に起きた時刻。summary／test完了だけでは正常終了確認済みにせず、必要な待ちは観測枠に残る。
- workerのmonotonic時刻は別domainとして保持し、親の値と直接減算しない。UTCは相関用で、deadlineの代用にしない。

### 4.2 未承認の候補値

| 記号 | 候補値 | 配賦・根拠と限界 |
|---|---|---|
| B_sample | 5,000ms | 対照計画の起動前5秒・1秒間隔を保持。sampling欠落を成功へしない |
| B_handoff | 1,000ms | sample完了からspawn試行までの有限受渡し候補。実測上界ではなく、遅い場合は起動せず不適合にするための予約 |
| B_observe | 120,000ms | unit9fileの過去の総時間59.74秒に対して約2倍の観測候補。`ceil(2×59.74s)=120s`という運用案であり、924件全部が必ず終わる上界ではない |
| B_cleanup | 30,000ms | §5の固定段階へ先取り配賦する候補。OS終端・post-pin費・報告必着が30秒内で完了する証拠は未取得 |
| B_cycle | 最大156,000ms | arm後の5秒＋受渡し1秒＋観測120秒＋cleanup30秒。pin等のarm前準備費は別で、全作業の所要時間上界ではない |

これらは今回設定した値でも、実行・強制終了の承認でもない。B_observeは**対照採取を打ち切る外側条件**であって、testを120秒まで合格させる期限ではない。過去の59.74秒は途中版・不適合な負荷条件の観測であり、約2倍の余裕を性能保証・work cap・正式capへ昇格させない。

compiled旧対照の60秒、SG-A kernelの60秒／cleanup3秒、real-hostの30秒は、この候補の導出元にも代替値にもしない。今回の値はP9／P8専用に事前レビューする案であり、既定並列度やtest期限を変える設定fileには反映しない。H0／H1・P9／P8へ同じ承認profileを使い、結果を見て伸ばさない。

### 4.3 絶対deadlineと予約保護

sampleは`t_arm`から5秒を覆う同じscheduleとし、`t_spawn`は`t_arm + 5,000ms`以降かつ`t_arm + 6,000ms`未満に入ることを候補条件とする。欠測・受渡し遅延時は新しく5秒を採り直さず、当該trialを起動前不適合として残す。

`D_observe = t_spawn + 120,000ms`、`D_cycle = t_arm + 156,000ms`。cleanupの最終上限は`D_final = min(D_observe + 30,000ms, D_cycle)`とする。早期停止／exit後は`D_cleanup = min(t_clean + 30,000ms, D_final)`を一度だけ固定し、後続event・retry・closeで更新しない。

`now >= deadline`はその枠の到達として扱う。timerが遅れて未発火でも、観測時刻が枠外なら期限内確認へ戻さない。観測枠が終わったら残るcleanupだけへ移り、余ったcleanup予約でtest再開・新worker要求・次trialを開始しない。正常終了が早ければ余りを別trialや再採取へ足さない。

clock throw／NaN／逆行・外側ownerのevent loop停止では、時間内監視を保証できない。最初の理由と最後の正常時刻を保持し、上位の未確認責務とする。値としてのdeadlineがあることを、外側process自体が必ずその時刻に動ける証明にしない。

## 5 cleanup予約の固定配賦案

`t_clean`から下表の累積deadlineを一度だけ計算し、全て`D_cleanup`でclipする。表は責務・待受期限の配賦で、stdioを読む順番を遅らせるblocking scheduleではない。drain・exit／worker通知は全区間で並行受理する。

| 段階 | 予約／累積 | 許す処理 | 不足時の扱い |
|---|---|---|---|
| CR1 | 2秒／＋2秒 | 停止理由の固定、承認済みの通常取消／終了要求の一度限り通知・ack | 通知未達と元理由を保持。新しい起動なし |
| CR2 | 8秒／＋10秒 | 通常のrunner／pool終了待ち・既知workerのjoin通知 | runner内部のfinallyだけを完了証拠にしない |
| CR3 | 4秒／＋14秒 | **別途承認された場合だけ**所有対象への追加停止要求とその確認 | 承認／所有証拠がなければ操作せず未確認。signal再送で枠を増やさない |
| CR4 | 8秒／＋22秒 | 残るexit／close・worker／pool・stream終端の独立確認 | runnerだけ先に終わっても他の証拠を省略しない |
| CR5 | 8秒／＋30秒 | 許可されたpost-pin確認・一時領域処理、固定report／上位custodyの受領 | 費用未導出・確認未完了・ack欠落は責務保持。成功へ丸めない |

30秒は2＋8＋4＋8＋8秒という有限の配賦候補で、各操作の最悪時間を導出した値ではない。特にpost-pin scanの費用・worker join・OS照会は未実証であり、予約に収まる根拠を実施前に確認する。収まらない場合は本profileを承認せず、結果取得前の設計見直しとする。CR5を省いて「実行だけ成功」と完了にしない。

自然終了で既に確認済みの段階は再操作しない。未使用分を後段の期限延長へ回す方式にはせず、遅いackは別のlate観測として記録する。cleanup中の出力超過や時計故障も、先行するtest timeout／取消を上書きせず別診断に残す。

CR3はSG-Bや実process操作の権限を本書で与えるものではない。TERM／KILL等の具体機構・回数・対象identity・許可条件はまだ未承認であり、都合のよいfallbackにしない。利用できないOS機構を模擬成功へ置き換えない。

## 6 状態遷移・失敗位置

先行custody保持→prepared→sampling→spawn_attempted→observing→settling→terminal候補→上位受理／未確認保持、という有限状態を提案する。runner開始前のC1やsetupにも副作用があり得るため、owner・部分生成slotの確保をそれらより先に置く。

| 位置 | 失敗時に残すもの | 禁止する処理 |
|---|---|---|
| owner／slot生成途中 | 生成prefix、未確認生成物、上位slotへの保持状態 | 部分生成をなかったことにする、runner起動 |
| sampling／spawn前 | 負荷欠落・pin不一致・受渡し遅延、spawn未試行の証拠 | 勝手な再採取・copy作り直し・起点更新 |
| spawn呼出し中・handle未受領 | 試行予約と生成不明。後から来るhandle／errorも同slotへ | throw＝child未生成と推測する、別runへhandleを渡す |
| observing | 最初のtest失敗／取消／外側期限、既知resource・未確認tail | 既定並列度を下げる、targetだけ再試行する |
| settling中 | CR段階、個別終端と不足証拠、未確認の一時領域・副作用 | reportだけで元slotをclear、未知process探索へ権限を広げる |
| report送信／上位ack前 | 同じterminal候補・同じ未解放責務 | 送信＝受領とする、再送ごとに別receiptを生成する |
| D_cleanup到達 | 固定の期限内未確認終端と未解決slot | parent自然exit＝cleanup確認、次trial起動、未知resourceの削除 |

終了要求後にworker／handleが遅れて観測された場合、新規正常workとして採用せず、同trialの未確認責務に加える。観測だけのregistryが実workerの生成を防止できるとは主張しない。registry上限を超えた場合は保持済みprefixと未記録tailのUnknownを残し、worker数を少なく見積もらない。

主対照起動に元々含まれるC1のplugin／API token供給等の副作用は、[依存pin設計§6](BEST_PRACTICE_WFB_SGA_DEPENDENCY_PIN_CONFIG_DESIGN.md)のとおり将来の主対照実行承認の範囲で扱う。別起動の設定評価・追加hook／dumpは別承認。本書はその区分を変更しない。home等の共有領域にあるtoken／cacheを、外側ownerが自動で所有・読取り・削除できるという意味でもない。

## 7 未確認責務の保持・固定受理

terminal候補は同trialのtest結果、監視結果、四軸診断、残存resource、clockの有効性、期限内の確認／未確認を含む非実行値とする。上位BatchCustodyの同slotへの一度限り受理ackが来るまでは、TrialOwnerは元slotを解放しない。summaryの同値copyや別trialのreceiptを受理ackにしない。

ackが欠けてもdeadlineを延ばさず、上位の先行slotに「移譲未確認」を残す。これを安全に実現する具体的な保管／耐障害機構は未実装・未選定。双方のprocessが失われれば、heap内slotだけで責務が残ると主張できない。したがって保管先・保持条件・外側owner喪失時の受領経路が未確定なら、起動gateは閉じたままとする。

一時領域の削除は、所有範囲・必要な終端・post-pinの確認、証拠の上位受理が揃ってから行う。runner／worker／stdioのどれかが未確認なら、削除しない対象と不足理由を保持する。共有領域・原本依存・元worktreeは削除対象にしない。削除throw／部分削除は独立した責務として残し、「削除を試みた」で空確認にしない。

CR5では、終端証拠と残る削除責務を上位へ先に受理→その同slotの唯一の削除ownerが一度だけ処理→結果を同slotへ記録→最終判定を封印、という順にする。custody受理ackは削除完了ackではない。移譲後のTrialOwnerが独立して再削除したり、削除に失敗して新receiptを作り直したりしない。上位受理後も削除が未確認なら上位が責務を保持し、次trial gateを閉じる。最終封印前の候補を確定済み成功として公開しない。

期限内の失敗終端を一度封印した後のexit／EOF等は、上位ownerの**late解放記録**として別に扱う。元のtimeout／未確認判定を書き換えず、遅い確認だけで元trialを適合・成功へ戻さない。late確認を使った追加操作にも、その時点の所有確認と承認が必要である。

## 8 test結果・監視結果・次trial gate

| 場合 | 保存する判定 | 次trial |
|---|---|---|
| testが全件成功、物理終端・採取・pin・custodyも期限内確認 | test成功／監視確認済み | 固定順の次slotへ進める候補。BL-C採用成功とは別 |
| 元の5秒test timeout／assert失敗、全case reportと終端等は確認 | test失敗／監視確認済み | 比較計画の固定4trialを偏らせないため、他のgateが揃えば次slotへ進める候補 |
| B_observe到達、runner／caseが途中 | 外側観測timeout／testは取得済みprefix＋未到達・欠落 | cleanupだけ。次trialなし。3件のtest timeoutへ加算しない |
| 取消、clock故障、pin不一致、出力・worker・上位受領の未確認 | 最初の理由＋個別未確認責務、比較不適合 | 次trialなし。残りslotは未開始のまま記録 |
| compiled旧対照の60秒timeout | 別計画のcontrol_deadline／比較不能 | このtrial系列の判定に流用しない |

ここでの「次へ進める」は判定契約案であり、現在の起動承認ではない。test失敗と監視失敗を混同しないため、SG-AのABBA kernelの「passedだけ次run可」というgateをそのまま写さない。予定4trialの途中で止まった場合も、成功だけを再収集せず、未開始slotを含む系列全体を残す。

## 9 後続の純粋fake受入条件案（全て未実施）

| ID | 対照 | 必須条件 |
|---|---|---|
| TO01 | runner exit先行・worker／stdio遅延 | 軸別に待ち、summary・code 0で不足を埋めない |
| TO02 | workerはthread／fork・handle未受領・PID再利用 | 同trial／generation／poolで照合し、PIDだけの解放を拒否 |
| TO03 | spawn前失敗・spawn throw・遅いhandle | 未試行と生成不明を分離し、同じ部分生成slotを保持 |
| TO04 | sample完了直後／handoff期限、欠測 | 元scheduleを再開せず、条件不適合ではspawn 0 |
| TO05 | D_observe直前／一致／直後、timer遅延 | clock比較で固定、late成功・deadline更新なし |
| TO06 | 早期停止・正常exit・取消再入 | 最初のt_cleanと同cleanup予約を維持し、重複停止操作0 |
| TO07 | CR段階の未確認・通知throw・未承認追加停止 | 不足を保持、権限を広げず、枠の流用・延長なし |
| TO08 | 出力超過・EOF欠落・report／custody ack欠落 | drainと採取を分け、元slot／未受理を保持 |
| TO09 | D_cleanup後のexit／EOF／ack | 元terminalは不変、late記録は別、次slot起動0 |
| TO10 | 外側clock異常・owner喪失 | 時間保証をUnknownとし、独立上位の受領不足を可視化 |
| TO11 | test失敗だけ／監視失敗の併発 | 次slot gateを区別し、成功だけを選ばない |
| TO12 | 別trial receipt・copy・registry overflow・削除失敗 | 混入拒否、prefix／未確認tailと削除責務を失わない |

fakeは値・clock・event・受理結果だけで検証する将来案とし、実signal・専用child・OS故障注入を実施しない。感度対照はexit＝全終了、予約の後付け、report＝受理、late成功復帰等の個別誤実装を検出する設計とする。現在、fixtureや試験scriptは追加していない。

## 10 実施前に残る承認・Unknown

数値profileの採用、各cleanup操作の供給元と費用上界、pin／post-pinの費用、上位custodyと永続性、worker／poolの正規終端供給点、stdioの固定schemaと上限、通常取消・追加停止の所有／権限、保存先・保持期間、開始時負荷採取は未確定・未承認部分を含む。実装・fake検証・実比較器接続・SG-B・再実行はそれぞれ別の判断であり、本書だけで一括承認しない。

今回の変更は本MDと親2文書の参照だけ。元の5秒期限・既定並列度・H0／H1・P9／P8・通常入口は変更しない。実装・設定評価・token読取り／発行・copy作成・採取・build・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わず、各閉鎖条件・Unknown・調査保留を維持する。

文書整合として3文書のローカルリンク12件・表21個の列数、TO01〜12の計画ID連番、候補配賦30秒・cycle156秒の算式、末尾改行・差分空白と変更対象MD3件を確認した。算式の検算は時間上界の実証・候補値の承認・合成試験の実行ではない。作成時点でコミット・Pushは未実施。
