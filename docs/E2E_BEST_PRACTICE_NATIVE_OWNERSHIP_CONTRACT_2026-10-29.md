# NA-01：ResponseDelivery・owner・pre-release／終端証拠の純粋合成検証

Date: 2026-10-29 / Scope: 新規の孤立synthetic domain・opaque identity・fake budget観測。native操作なし。

設計：[native adapter draft-0.2 §13](BEST_PRACTICE_ABORT_SCOPE_NATIVE_ADAPTER_DESIGN.md#13-na-01合成identity限定の内部契約)。
実装：[runtime契約module](../src/servicenow/review-native-contract.ts)。
試験：[合成49件](../tests/review/native-ownership-contract.test.ts)、[static pack／compiled確認](../tests/review/package-native-contract.mjs)、[compiled fixture](../tests/review/fixtures/compiled-native-ownership-contract.mjs)。

## 1. 実装境界

createSyntheticNativeContractDomainは新規domainごとに専用WeakMap／WeakSetと合成run／signal／response／stream／reader identityを作る。同domainの不透明tokenだけを受け付け、raw session／Response／stream／reader・旧fixture tokenを登録しない。実sessionのlookup・mode切替・native採用factoryは追加していない。

同ownerの固定budget参照・観測関数、attempt／window、resourceからpre-releaseと終端proofまでを一つのprivate namespaceへ結ぶ。delivery／pre／endの消費は一度だけ、失敗claimは復元しない。別ownerのresource再利用はdomain内の新しい台帳で拒否し、外国owner／proofを変更しない。別domain間ではidentity自体が無効である。

pre-release観測はstrict schemaでcopyして固定する。pending readやcancel／closedの不足を、後からのrelease=succeededや元objectの書換えで補完しない。no_bodyはEOFと区別する。cleanup事実とfirst primaryを分け、stop後にcleanupを記録できても、終端を成功消費して権限を復活させない。

このproofは**合成イベントの整合性証拠だけ**。実resourceの操作・物理解放・nativeの来歴を証明しない。成功viewもbody_eligible=false／native_operations=unavailable／evidence_issuance=disabledで、RT-B03のfinish／candidate発行へまだ接続していない。

## 2. RED→GREENで確認した点

- 最初のtracerはmodule未実装のimport失敗から開始。delivery→claim→reader identity→pre-release→end→consumeの純粋な経路を実装した。
- 元I/O cutoffの等号でもclaimが成功するREDを再現し、元windowの検査と失敗後の再利用拒否を追加した。
- budget callbackからattempt生成へ再入すると内外とも成功するREDを確認。busy guardで二重生成を止め、通常callback中の明示stopは同期で受理するように分けた。
- 不正なwindow幅・cleanup reserve超過・phase reserveより前のfloorが受理されるREDを確認。最大60秒・attempt幅10秒・reserve min(250ms, span/4)の範囲と順序を検査した。新時計を作って救済していない。
- 終端消費時に元cleanup cutoffが切れていても成功するRED、pre-release未確認でもownerがactiveに残るRED、一attemptからdeliveryを二度発行するREDを修正した。
- no_bodyの専用終端が無いREDから追加し、reader証拠・EOFに読み替えず一度だけ消費するようにした。RT-B03／公開schemaのkindは変更していない。
- raw run／signalを新規ownerへ登録できる前提を除き、domain発行tokenを必須にした。raw session相当のobjectをownerとして登録しない。
- 不正pre／end入力ではprimaryだけが残りcleanupがnullになるREDを確認。typed observation_invalidをunconfirmedとして保持した。
- claimのpost-callbackで同floorへ達した場合にhandleが返るRED、未知stop文字列が診断へ出るREDを修正した。最後のguardも元floorへ結び、外部stopの不明値はinvalid_inputへ固定した。
- release終端の期限超過がinternal_review_errorへ潰れるREDを確認。元windowのattempt_deadline_exceededをfirst primaryとして残すようにした。
- owner生成時のbudget getter例外が生で外へ漏れるREDを確認。未知run／signalはgetter前に拒否し、既知runは先に生成claimを消費してから観測関数を一度captureする。例外は固定internal_review_error、再生成は禁止とした。
- reader identityの結合だけがI/O floor後にも成功するREDを確認し、同windowのpre/post検査をそこにも接続した。

途中REDの失敗は成功件数に含めず、期限・上限・既存契約を緩めて解消していない。

## 3. 合成観測の結果

| 観点 | 結果 |
|---|---|
| owner生成・結合 | 同run一度、run／signalは同domain token必須。同budgetの観測関数をpinし、別budgetを渡す再生成で置換しない |
| identity台帳 | response／stream／readerの別owner再利用をclose後も拒否。旧ownerのstatus・外国proofの使用済みflagは不変 |
| 配送・証拠 | delivery一発行／一消費、pre-release一発行、end一生成／一消費。copied／foreign window・resource・pre／endを拒否 |
| 元window | claim／reader結合はI/O floor、消費はcleanup floor。等号で拒否。残時間増加・非有限値・観測例外は固定停止 |
| pre-release | 未確認状態をprivate copyで保持。release成功後に入力objectを変えてもconfirmedへ修復しない |
| cleanup | read／cancel／closed未確認・拒否・release失敗・期限切れを有限reasonで保持。no_bodyとEOFを分離 |
| stop／close | 先行cancelled／closedを保持。停止後のcleanup記録は可能だが成功消費・新規生成・再開は不可 |
| 再入・失敗 | generation callback再入を拒否。最後のguard失敗でも成功handleなし。失敗後のclaimを復元しない |
| 会計 | 最大210は追加制御枠でありCではない。native dispatch・C/G/P／R更新・timer／listener生成は0 |
| 非露出 | viewはend_verified_only／body_eligible=false。raw identity・signal・budget・body・reader操作・tokenを返さない |
| native禁止 | 新規単体試験のfetch／Response／ReadableStream constructor spy呼出し0。compiled fixtureはそれらとDefaultReaderを呼ぶと失敗する代替関数にして確認 |
| fixture分離 | 旧fixture tokenの横断採用を拒否。runtime moduleはfixtureをimportせず、梱包から旧fixture moduleを除外 |

## 4. 最終検証

| 確認 | 結果 |
|---|---|
| 新規NA-01 `native-ownership-contract.test.ts` | 49 tests成功 |
| `npm run build` | 成功 |
| 実装・新規試験・compiled fixture・pack scriptのESLint | 成功 |
| `node tests/review/package-native-contract.mjs` | 成功。static pack 389 files、契約moduleの4artifact同梱・旧fixture非同梱、compiled純粋contractでnative calls=0 |
| 関連MD相対参照・空白 | 4 files／71 links存在確認・行末空白なし・git diff --check成功（見出しanchorの自動検証ではない） |
| 既存native Streams試験を含む全体合成テスト | **今回未実施**。native操作を行わない指定のため、既存のnative API実行を含むpackage-worker smokeも実行しない |

static packはoffline／ignore-scriptsで一覧を検査し、純粋compiled fixtureのみ実行した。tarballのproduction-only install・worker解析・既存実session smokeを実行したという記録ではない。対象Node版におけるnative API適合やNA-A01〜18全体の合格も主張しない。

### コミット対象のみの再検証

2026-10-29、HEAD（8fb30a1）へ今回の9ファイルだけを重ねた一時snapshotで確認した。無関係な`.vscode/`・`CLAUDE.md`は含めていない。build・新規49 tests・変更実装／試験／pack script／compiled fixtureのESLint・static pack（389 files）とcompiled contract（native calls=0）が成功した。関連4文書の相対参照71件・行末空白とgit diff --checkも成功。全体native試験・package-worker smoke・実通信は実行していない。検証後はこの結果の文書追記だけで、検証した実装・試験・依存設定は変更していない。

## 5. 未接続・維持する停止

native Response／streamのbrand・prototype・intrinsic capture、getReader／read／cancel／closed／releaseLock、pre-releaseの実観測生成部は未実装。synthetic issuerの観測値をnativeの事実へ昇格させない。

RT-B03のfinish前にnative end evidenceを照合するNA-03、実sessionのcanonical更新点・同期abort接続、固定source／ReleasePermit・選択payload／worker jobの正式bindingも未接続。全体work／heap・物理秘密消去・非協力的I/OのOS実時間終了は未証明。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。新規コードからnative操作・実session接続・実通信・実機操作・トークン発行・設定変更・Pushは行っていない。無関係な`.vscode/`・`CLAUDE.md`は変更していない。
