# AU-BR-006：固定sourceのstatus private受理・実session binding・close前消費の接続差分

Version: br006-status-source-acceptance-delta-draft-0.5 / Date: 2026-10-31。
Status: **§10のSA-01に加え、§11のSA-02を実session／source class＋固定fake I/Oで実装。承認後のSA-03・実transport採用は未実装。fallback有効化・実接続・実通信は行わない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。**

基準：[session binding差分draft-0.5](BEST_PRACTICE_ABORT_SCOPE_STATUS_SESSION_BINDING_DELTA_DESIGN.md)、[private composition](BEST_PRACTICE_ABORT_SCOPE_PRIVATE_COMPOSITION_DESIGN.md)、[実session／typed取得差分](BEST_PRACTICE_ABORT_SCOPE_REAL_TYPED_BINDING_DELTA_DESIGN.md)、[承認判断用の比較資料](BEST_PRACTICE_ABORT_SCOPE_NON200_APPROVAL_COMPARISON.md)。以下の型名・stage・操作名は内部契約案であり、既存exportや承認済みAPIではない。

## 1 現状と非対象

[開発専用fake構成](../src/review/abort-scope-evidence-status-bound-workflow.ts)は自分でsnapshot・source identity・canonical core・binding・注入ownerを生成し、模擬dispatch→cleanup→private消費を終え、closeしてから限定履歴を返す。実`BoundedUpdateSetSource`・認証snapshot・固定URLに由来する証拠ではない。返却した`consumed`は生存中の権限ではなく、7権限はすべてfalseである。

[実source](../src/review/bounded-source.ts)の固定200経路は従来どおり親／releaseのbody ackをprivate受理する。[session](../src/servicenow/bounded-read.ts)の既存compositionはparent／release hookの200限定guardを維持する。§11のSA-02は別の新規fake-only probeでstatusの非実行受理を検証するもので、実transport由来のstatus終端の正式bindingではない。

本書は、固定source用受理契約と生存中の消費・終了契約を対で設計する。runtime gateの解除、公開MCP入力／JSON変更、legacyの非200挙動変更、retry、運用者設定fallbackの実行、metadata／payload／worker、final予約移譲は非対象。承認資料の推奨案を採用済みと扱わない。

## 2 既存設計からの差分と生成元

| 根・所有部 | 再利用する現状 | 必要な差分／禁止事項 |
|---|---|---|
| 新規session constructor | 同`#snapshot`・`#runOwner`・`#runLease`・`#budget` | 認証／I/O前に固定した同runの生成継続だけを使う。既存sessionのlookup／登録／lane切替なし |
| `#openComposition` | transport claim・initial source claim・`claimStatusBinding`・同accounting | status終端issuerと固定source consumerを同scopeで捕捉。第二core／clock／lease・別fixture台帳を持ち込まない |
| `CompositionSourceConstruction` | private key／check／take／capture、親→releaseの一度限り状態 | body ackとは区別したstatus用のprivate受理契約を追加設計。公開source methodや任意consumer getterにしない |
| 注入ownerのprivate記録 | 同Response／reader・attempt／元window・cleanup・発行／消費claim | 不変条件だけを再利用。現在の開発用token・diagnostic・fake申告を実発行元として採用しない |
| 固定sourceのrelease判定 | 同sourceの親状態・`releaseRead`・`#decision`・matched後のpermit／private verifier | 非実行status受理段階と、承認後のC方式判定段階を分離。raw例外や空JSONを経由して接続しない |

生成順はsession根→同source初期identity→status binding／生成claim→固定issuer・consumerの対→認証ready・親受理→release attemptとする。更新portはcomposition scopeだけが保持する。source・認証・targetをI/O後に差し替えず、公開callbackから固定consumerを選択できないようにする。

実sessionのprivate参照を使う将来の構成と、独自identityを作る開発専用構成を明確に分ける。合成issuerをruntimeへimportする、fixture tokenを変換する、同値JSONからprivate参照を再構成する方法は採らない。

## 3 private受領物と同一性

提案する受領物はJSONではなく、同constructorのprivate記録を指すopaque参照である。外部入力schemaに追加しない。

| 内部契約案 | 発行元／保持内容 | 有効期限・用途 |
|---|---|---|
| StatusAttemptAnchor | 固定dispatch生成側。session・auth snapshot・ready世代・source・target・purpose・固定URL・transport／attempt・元windowのprivate参照 | 当該attemptだけ。release専用受理へauth／parent用途を流用不可 |
| StatusCleanupTerminal | 同reader owner。上記anchorとnative header、typed cleanup終端への参照 | cleanup確認済みでも単独ではfallback／body ack／permit権限なし |
| StatusAcceptanceClaim | 固定source受理側。release分岐・当該attempt・terminalを一度消費する状態 | callback／clockより前に消費開始。失敗・closeで復元不可 |
| StatusAcceptanceDraft | 同scopeの固定非実行consumer。受理が成立したという限定事実 | 後から実行へ昇格不可。設定変更後の再開・permit発行の入力にしない |

必須照合は同session／constructor key／snapshot／登録lease／core／initial source／target／transport／attempt／purpose／元windowである。認証readyと親snapshot受理の世代も同runで照合する。snapshot一致は本人sys_idの証明ではない。

headerは当該取得元で固定した値だけを使い、cleanupは同reader・同attemptの所有記録から得る。bodyありならread=0・cancel／closed／releaseLock確認、no_bodyなら明示的not_applicableを要求する。no_bodyをEOF、status-onlyを空のbody ackに変換しない。

将来の実取得では固定method／URL／認証snapshotからResponseへの発行元bindingも必須。現在の模擬dispatch C=1やResponse注入だけではこの条件を満たさない。ReleasePermitはこのbootstrap段階には存在せず、事前条件にしない。

## 4 close前の一度限り消費

```text
新規constructor・同source／issuer／consumerを生成
  → 認証ready／親private snapshot受理
  → 同release attemptのstatus／cleanupを確定
  → 受理claimをconsumingへ（再入より先）
  → identity・生存・元floor・cleanup・用途のpre-guard
  → 同terminalを一度だけlookup／消費
  → 非実行draft構築・post-guard
  → private受理確定（gateは閉鎖、fallback／permitなし）
  → authority失効 → 固定close／cleanup合流／予約release
  → 権限を持たない診断copyだけ返却
```

ST-03Cが既に消費して返した履歴に、もう一度「source消費」を追加する方法は採らない。将来は同固定生成継続内の**唯一のterminal consumer**としてsource受理を組み込み、1回の消費にする。既存の診断用自動consumerを通したtokenを受け渡すのではなく、runtime実装表現を別途レビューする。caller指定consumer／公開callbackは作らない。

lookup開始時に当該要求のclaimを先に消費し、tokenはlive slotから取り除く。誤った／外国tokenでも自分の開始済みclaimをavailableへ戻さず、外国ownerの台帳は変更しない。pre／postの間で取消・期限・close・再入が起きたらdraftを破棄し、受理成功を新設しない。

受理stageは`WaitingRelease→ConsumingStatus→AcceptedClosedGate`または`Rejected／Revoked`の一方向とする。既存body release分岐とは同じrelease-use claimを共有し、body ackの後にstatus受理、status受理の後にbody ackを認めない。別runでしか新しいrelease利用を生成できない。

非実行draftから後日にgateを開いて続行しない。承認・実装後のC方式判定は**新規runの同消費処理内**でのみ検討できる別段階とする。lookup→消費→判定でterminalを二度消費しない。

## 5 固定source private受理とfallbackの境界

現段階の受入候補は、同runの認証ready・親受理後のrelease403／404かつcleanup確認済みだけである。候補の照合・非実行受理を設計するもので、fallbackを有効化しない。

| 終端 | 現段階の固定扱い | 昇格禁止 |
|---|---|---|
| release403／404＋確認済みcleanup | 生存中の同sourceで非実行受理条件を検査できる候補 | operator_config判定・matched・permit・preparedをこのdraftから生成しない |
| release403／404＋未確認cleanup | 診断保持・停止、token／draftなし | late settleによる再受理、fallback |
| 401／auth・parent403 | 既存hard primary保持、cleanupだけ継続 | release回復候補への付替え |
| parent404 | 親のlocal失敗として診断、source受理候補なし | release404への変換 |
| release upstream_unavailable（retry枯渇を含む） | 候補外。診断保持・停止 | C方式fallback（legacyは進むが、本経路では[比較資料§6](BEST_PRACTICE_ABORT_SCOPE_NON200_APPROVAL_COMPARISON.md#6-d2とd3の連動)どおり別承認） |
| 200 body ack | 既存固定200経路を維持 | status-only分岐への二重受理 |
| その他status・不正body・quota／phase停止 | 既存固定分類・診断を維持 | 403相当への変換、retry／fallbackの自動追加 |

draft-0.2のレビュー修正：retry枯渇のrelease失敗を受入候補外として表へ明示し、比較資料§8を本書の段階（SA-01／02は承認前の非実行、SA-03は承認後）に合わせた。

既存`#observeRelease`は特定の`BoundedReadError`をcatchするとfallbackへ進む。status受理をその例外codeへ変換して接続してはならない。また、`{result:[]}`を偽造して既存の空観測fallbackへ入れない。

D1／D2等が別途承認された後の設計では、確認済みstatus由来を保ったまま既存C方式のbinding・設定期限・競合・limitationsを再利用する。`operator_config／asserted`を実測resolvedへ変更しない。設定不足・期限切れ・競合はunknown、family不一致はmismatchedとして停止する。

matched後だけ同sourceの`#permit`・不変release snapshot・既存private verifierへ結合する。判定中のawait／clock／設定参照の前後、およびpermit確定直前にも生存を検査し、失敗時は部分状態をrevokeする。現在のlegacy fallback挙動をこの設計の名目で書き換えない。

## 6 同期失効・終了の所有

canonical coreとrun ownerのfirst primary／internal-public写像、一度限りstop通知を再利用する。順序は、先行理由保持→受理claim／issuer／source consumer／未受理terminalの同期失効→abort／cancel要求→元window内のcleanup合流→resource解放である。

受理確定前のcloseは受理を中止する。確定後のcloseでもdraftは非実行履歴となり、source methodや別jobから利用できない。正常closeの`closed`、利用違反の`invalid_state`、先行するquota／phase／HTTP失敗を混同せず、後片付けで先行診断を上書きしない。

| resource／状態 | 唯一の所有部 | 終了時の責務 |
|---|---|---|
| terminal・受理claim・draft | 同issuer／固定consumer | 一度消費／破棄、lookup削除、復元不可 |
| source親／release一時状態・permit参照 | 同source private consumer | 失効時に部分状態を撤去。診断copyには権限を含めない |
| reader／cancel／closed／releaseLock | 同attempt native owner | stop／finish／closeで同cleanupへ合流。一度だけ確認・解放 |
| accounting・予約 | 同canonical owner | 元portを一度release。返金・再取得・4枠補充なし |
| timer／listener／admission／token参照 | session固定close | authority失効後に一度解放。source側で二重返却しない |

停止後のcleanup用readonly観測は許可するが、生存guardを迂回した受理は許可しない。元deadline／phase／cleanup floorを延長せず、close用の新しいbudget／clockを作らない。終了待ちのjoin pointはcallback・native操作に先行して確保する。

## 7 診断と追加費目

上位ownerはfirst primary（内部／公開code）、first refusal、受理stage、HTTP用途／status、typed cleanupとreason／wait_issue、最初の終端、既存消費履歴を別々に保持する。HTTP成功／失敗でcleanup確認事実を変更せず、cleanup成功でhard HTTPを消さない。run拒否の後も先に確定した履歴を残すが、新しい権限とはしない。

返却は固定code・件数・限定summaryだけ。token／terminal／anchor／key／lease／mutable consumer／credential／コード本文／秘密を含むURL・例外本文は出さない。上位結果のcopyを受理口へ戻すAPIは作らず、公開JSON enumを無断追加しない。

| 費目 | この差分での所有・追加 | 非対象／禁止 |
|---|---|---|
| C／G／P | 同accountingの既存計上のみ。status受理・消費自体の追加C/G/Pは0 | statusをbody readに変換、二重課金、失敗時返金 |
| R・期限 | 元4枠・全体60秒・210試行を維持。受理は元phase／attempt内 | reserveの再補充、final移譲完了扱い |
| claim／lookup | 当該release分岐・terminal・draft各最大1個。固定参照照合、lookup一度 | 全履歴探索、任意個数のterminal保持 |
| 診断・cleanup待ち | 固定stage／固定理由・元window内で一度 | 生body保持、新しい無期限待ち、秘密ログ |

この固定小数の追加管理費を、Rust側workモデルの承認済み費用や全体受付有効化と混同しない。200 bodyの受信cap／総受信16MiB／payload上限等、既存上限は維持する。status read=0のG=0はsocket受信0の主張ではない。

## 8 合成受入条件

| ID | 検証 | 必須結果 |
|---|---|---|
| SA-T01 | 新規固定constructor／実class＋fake依存 | 同snapshot・lease・source・issuer・consumer。公開legacy入口は変更なし |
| SA-T02 | 別session／snapshot／lease／source／target／ready世代／attempt／用途／URL | 受理なし。外国owner不変、元診断保持 |
| SA-T03 | cleanup確認済みrelease403／404、bodyあり／no_body | 生存中の非実行受理だけ。fallback・permit・metadata取得0 |
| SA-T04 | 外部診断・raw例外・空JSON・消費済み履歴の再提出 | 証拠へ昇格不可。body ack／EOFとして受理しない |
| SA-T05 | body/statusの競合・二重消費・lookup中再入 | callback前にclaim消費。両分岐の成功は最大1、再発行なし |
| SA-T06 | 消費pre／post・draft構築中の取消／期限／close | 同期失効、成功を新設せず破棄。cleanup事実とfirst primary保持 |
| SA-T07 | close後のterminal／draft、再認証・別permitで再利用 | 拒否。counter／ready／claimを復元しない |
| SA-T08 | 未確認cleanup／late settle／hard HTTP／parent404 | 候補消費・fallback0。二軸診断とlocal/hardの区別を保持 |
| SA-T09 | 受理後のclose・二重close・通常quota／phase打切り | 解放各一度、予約返金・補充なし、先行理由の上書きなし |
| SA-T10 | gate閉鎖・fresh fake/runtime境界・梱包・秘密marker | 非実行draftから昇格0、開発module非同梱、秘密非出力 |

oracleは固定sourceの受理イベント順、独立したfake dispatch件数／chunk長合計、identityの参照比較、cleanup操作数から作る。単なる正常returnや製品counterのcopy、現在の独立fake構成での成功を正式bindingの証拠にしない。過去の固定評価セットや試験履歴は書き換えない。

## 9 次の実装単位・承認待ち

1. **SA-01（§10に実装記録）**：固定生成元・source用受理claim・非実行draft・close前消費の内部契約を合成issuerだけで実装。fallbackやpermitは発行しない。
2. **SA-02（§11に実装記録）**：同constructorの実source class／session private継続へのbindingをfake I/Oで検証。200 guardは維持し、status用非実行分岐の検証を実通信と分ける。既存sessionへのfixture採用口を作らない。
3. **SA-03（承認後の別段階）**：D1／D2と関連A／ST-A／STC-Aの条件確定後に、同消費処理からのC方式判定を検討。承認だけで自動有効化せず、新規run限定で設計・実装・回帰確認する。

唯一のconsumerのmodule配置・opaque終端の表現・body/status競合claimの既存stateへの組込みは実装前レビュー事項。現在のST-03C自動consumerをruntimeへimportしないこと、停止時の部分source状態撤去と上位診断寿命を先に確認する。

fallback有効化・retry枯渇fallback・実transport採用・実通信・metadata／payload／worker・final移譲は本書で承認しない。正式発行口閉鎖・Unknown・全体受付無効・調査保留を維持する。

## 10 SA-01：合成issuer限定の内部契約

[実装](../src/review/abort-scope-evidence-source-status-acceptance.ts)のprivate constructorが、合成frame・issuer・source受理claim・terminal記録・唯一のconsumerを一緒に生成する。外部exportは**固定case名だけ**を受けるfixture関数で、raw terminal／identity／consumer／callback／sessionは受け取らず、private portやtokenを返さない。module全体は既存の開発専用除外patternで非同梱となる。

frameの15参照はsession／constructor key／snapshot／lease／core／source／target／ready／generation／parent／transport／attempt／method／URL／windowの合成identityである。これは実認証・URL・予算・source classの証拠ではない。ready・親受理の前提はprivate fixture内の有限状態でのみ操作する。

terminalは最大1個で、private WeakMapとlive slotに保持する。consumerはcallback前にrelease-use claimをstartedにし、自分のlive slotを外してlookupを一度行う。誤ったtokenでも自分のclaimはspentとなり、外国issuerのmapを変更しない。pre-guard→非実行draft→post-guardの後だけ`AcceptedClosedGate`を確定する。body分岐の合成markerも同claimを消費するため、statusとの二重成功はない。

ここでのcleanupはsynthetic記録で、同readerのOS／native操作の実証ではない。release403／404・確認済み・read0だけが候補で、no_bodyは別kindとして保持する。hard401／parent403、parent404、未確認cleanup、read開始、retry枯渇は候補を発行しない。raw例外・診断copy・空JSONを受理する公開操作はない。

取消／close／期限切れ／clock例外／再入／identity混入時はprivate slotとdraftを破棄する。claimを復元せず、復旧したclockやreadyから再試行できない。close前の受理成功は限定履歴として保持し、その後の失敗やcloseで書き換えない。返却時には必ずclose済み、live terminal／draftなし、権限7項目falseである。C/G/Pは0で、会計処理やI/Oを新設しない。

費用は固定15参照照合、最大1個のterminal／draft、有限case内の固定回数のclock検査・lookup・closeに限る。無制限retry・履歴探索・外部callback登録はない。body側は200解析ではなくclaim競合を試す非実行markerであり、正式body ackではない。

draft-0.4のレビュー修正：ready・親受理の前提消失はpre／post guardのどちらでも`invalid_state`とし、`evidence_binding_mismatch`は参照の不一致だけに使う。pre-guard側の負の対照を追加した。

[60件の合成テスト](../tests/review/source-status-acceptance.test.ts)、[compiled fixture](../tests/review/fixtures/compiled-source-status-acceptance.mjs)、[検証記録](E2E_BEST_PRACTICE_SOURCE_STATUS_ACCEPTANCE_SA01_2026-10-31.md)を参照。SA-01時点では§8の実class接続・実認証／URL binding・実source受理・実session resource解放は未確認であった。後続SA-02の確認範囲は§11に分け、全runtime受入条件達成とはしない。SA-03、fallback／permit／正式発行・全体受付は未実装／無効のままとする。

## 11 SA-02：実classの同constructor binding・非実行private受理（fake I/O）

`BoundedReadSession.probeNewStatusAcceptance`は**新規runだけ**を生成する別の固定fake-only入口である。既存session・source・fetch・consumerを引数に取らず、同snapshot／低減limits／AbortSignalとdata-onlyの`synthetic_status`だけをpinする。per-user snapshotに限定し、認証readyはfake前提で一度立てる。OAuth交換・本人性確認を実施した証拠ではない。公開MCP tool／optionsのlaneを変更せず、constructor内のfetchは固定throwとする。

fake profileの項目は親のUTF-8 JSON bytes、release403／404、cleanup enum（cancelled／no_body／unconfirmed）、0〜10,000msの任意delayだけ。bytesはawait前にcopyし、accessor／proxy／余剰項目を拒否する。これは合成I/Oの台本であり、callerがnative cleanup診断を正式証拠として提出する口ではない。従来の`synthetic_io` schemaと200限定hookは変更しない。

同`#openComposition`を再利用して、実sourceをcreator keyで一度結合し、同`#budget`のaccountingを取得する。ready世代1・親5列のprivate受理後、同scopeのstatus issuerがopaque受領物を1個だけ生成する。private記録は実source／snapshot／登録lease／core／attempt／元windowを保持し、take時にkeyの生存とstatus binding・ready世代を再照合する。live slotをlookup時に先に除去し、受領物を再発行しない。SA-01合成issuer／fixture台帳はruntimeへimportしない。

実sourceの`CompositionSourceConstruction`へoptionalな`takeStatus`／固定拒否継続を追加し、captured consumerの`status`だけが使う。親→release→consuming→accepted_statusの状態はbody releaseと共有する。二重呼出しは内部`invalid_state`、未知／copy／外国受領物は内部`evidence_binding_mismatch`としてownerへ同期伝播し、公開codeは既存`internal_review_error`へ写像する。first reasonはclose後も保持する。

source consumerは受領物を一度takeしてrelease用途・403／404・cleanup kindをstrict検査し、7権限falseのdraftを構築した後にpost-guardを行う。source post-guardとprivate summary構築後にも元attempt floorを再検査する。private処理から戻るawait境界の後、外側closeの前にもsession停止／期限を再検査し、受理中／直後の取消では結果を公開せず撤去する。`#observeRelease`／`#completeRelease`を呼ばず、`#permit`／release snapshotを発行しない。body ackやraw例外・空観測への変換も行わない。

返却はfake_io付きの`status_accepted_closed_gate`履歴、消費1件、close前受理、C/G/P、限定status／cleanup kindだけ。consumer revoke・accounting release・session closeを終えてから返し、fallback／formal issuanceはdisabled、permitはunavailable。秘密・親本文・credential・source／session／terminal参照を返さない。

親I/OはC=1と同bytesのG、status模擬観測はC=1／readなしG=0。全体60秒・最大210試行・4MiB／16MiBと予約4枠を維持し、phase／attempt floorの等号、hard deadline、取消で停止する。終了時は受領物とsource一時状態を同期失効し、fake delayのtimer／listenerとsession admissionを一度解放する。

[専用合成テスト](../tests/review/source-status-binding.test.ts)、[テスト専用境界](../tests/review/source-status-binding-boundary.test.ts)、[compiled fixture](../tests/review/fixtures/compiled-source-status-binding.mjs)、[検証記録](E2E_BEST_PRACTICE_SOURCE_STATUS_BINDING_SA02_2026-10-31.md)を参照。境界置換はtests内だけに置き、製品へsetter／registryを追加しない。

この段階はreal class＋fake I/Oであり、実URL／認証とResponseの由来、native readerのcleanup確認からこの受領物への接続、HTTP／cleanup上位診断の完全な配送を証明しない。SA-T01〜10の全runtime条件を達成したとはしない。SA-03のC方式判定・fallback、実transport、metadata／payload／worker、final移譲、正式発行・全体受付は未実装／無効のままである。
