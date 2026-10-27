# AU-BR-006 共通停止／予算owner・実session／ReleasePermit binding 詳細設計

Version: br006-run-owner-binding-draft-0.4 / Date: 2026-10-27。
Status: **実session private lifecycleに同sourceのReleasePermit／不変release snapshotをprepared-onlyで限定接続し、fake I/Oで検証。正式証拠receipt／worker・会計操作／実transportは未接続、正式証拠発行は閉鎖。Unknown・全体受付無効、VM／監視／telemetry保留を維持**。

親：[実session／private受領物](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)、[用途別transport受領物](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)、[worker接続契約](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md)、[OAuth起点の合成接続](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md#14-oauth起点のworker上位結果までの連続合成e2e)。

接続設計：[単一予算・停止・typed cleanup接続詳細設計draft-0.3](BEST_PRACTICE_ABORT_SCOPE_RUN_TRANSPORT_CLEANUP_DESIGN.md)。TC-01の純粋契約に加え、TC-02は既存run lifecycleをfake sessionの単一C/G/P・時計・停止・typed cleanupへ限定接続した。実sessionの会計更新／transport／workerへは未接続で、正式発行は閉鎖したまま。

## 1. 目的・境界

次の二つを対で定める。

1. 同じ実sessionの時計・phase・C/G/Pと、将来のE/R・HTTP／worker停止・終了診断を所有する共通run owner。
2. 同session／認証snapshot／ready世代／source／同sourceのReleasePermitと、不変な発行時release根拠へ結合するprepared source owner。

§1〜§11は全体の内部契約案であり、全APIの接続済みを意味しない。§13の合成モデル、§14のprivate lifecycle、§15のprepared release限定接続と区別する。preparedはidentity確保だけを意味し、body receipt／payload receipt／FinalSourceSeal／正式findingを発行できない。証拠専用取得・cleanup証拠・選択payload・worker jobの正式bindingが揃うまで、発行gateは常に拒否する。

公開MCP入力、公開0.2／0.3、明示14／既定3規則、既存release gate・selection_mode省略互換を変更しない。AU-BR-006の公開登録・証拠取得modeのツール引数追加・実sessionのfixture登録・実資格情報の取得は今回の範囲外。同processの侵害コードや侵害workerを隔離する仕組みではない。

## 2. 最新ソースとの差分

| 箇所 | 現在あるもの | 本設計で必要なもの／まだ無いもの |
|---|---|---|
| [bounded-read](../src/servicenow/bounded-read.ts) | private snapshot／run owner／readonly lease、単調開始時計、認証readyPromise、C/G/P、hard／phase停止、closeによる一度限りの枠解放 | 唯一の会計更新port、typed transport／cleanup、正式受領物／workerへの停止伝播 |
| [実lifecycle](../src/servicenow/review-evidence-lifecycle.ts) | private owner／snapshot identity／一世代ready／同期revoke／readonly予算lease、同session再登録拒否、prepared source claim（§14・§15） | 正式receipt／worker結合。private lifecycle・prepared release成立だけでは証拠発行権限にならない |
| [実source](../src/review/bounded-source.ts) | private session／#permit／独立不変release snapshotとreadonly port、matched時のprepared結合、既存選択行・payload版照合、最終親／一覧再読 | 正式証拠発行入口、型付き選択／body／payload受領物、worker job結合 |
| [実adapter](../src/review/update-set-adapter.ts) | sessionと通常workerの残時間・外部signalを接続し、finallyで終了処理 | BR-006用の正式bindingと、HTTP内部停止も含む共通診断／失効／終了owner |
| [fixture worker](../src/review/abort-scope-evidence-worker-review.ts) | native IPC、厳密な相関検査、取消／terminate確認、fixture専用上位result | 本番source由来のjob・payload receiptとの結合。remainingMs／signalの引数自体は由来の証明ではない |
| [連続E2Eの外側owner](../tests/review/fixtures/oauth-source-worker-run.ts) | 試験用の時計・取消合流、合成Responseからfixture上位結果までの動作確認 | 本番ownerではない。試験のpayload／instance_bindingを正式receiptへ昇格しない |

既存ReleasePermitを作り直すことが目的ではない。同じpermitの参照検査を維持し、その発行元・release根拠・session／source寿命を新ownerへ結合する。既存decisionの外側がfreezeされているだけで、入れ子も独立・不変であるとは認定しない。

## 3. 内部ownerと権限の分離

すべてECMAScript private領域または非公開台帳の参照で認識する。brand／instanceof／同値token・origin／JSON／hash／statsだけを発行根拠にしない。fixture台帳・claim・handleと本番台帳は分離し、互換cast・raw値登録factoryを設けない。

| 提案型／主体 | 唯一の生成元 | できること・できないこと |
|---|---|---|
| PendingRunDiagnostic | 固定adapterの最外側、session生成より前 | 生成失敗も固定stage／codeで保持。秘密・raw例外・本文を保持しない |
| ReviewRunOwner | 固定adapterが生成した同sessionのprivate初期化部 | 共通開始時計・予算identity・停止順・診断合流を所有。証拠発行や任意URL登録は不可 |
| AuthSnapshotIdentity | 同sessionの孤立snapshot確定部 | snapshotとの参照結合だけ。token／snapshotを返すgetterは不可 |
| AuthReadyGeneration | 同readyPromiseの最初の正常完了部 | 同認証世代をpin。失敗後の再認証・世代交換による救済は不可 |
| RunBudgetLease | 同sessionの内部会計から一度貸し出す保護view | 同じcounter／絶対期限を参照。新counter／時刻起点・caller申告capは不可 |
| PreparedSourceBinding | 固定sourceのprivate入口＋session/source claim | 同source／permit／release snapshotへpreparedで結合。receipt／seal発行は不可 |
| HTTP所有部 | 同session内の唯一の受信経路 | 試行・chunk・reader／cleanupを実観測。source意味検査を認定しない |
| worker supervisor | 同run ownerが生成する固定child所有部 | port／世代／jobと終了確認を所有。親のsource由来をnonceだけで認定しない |

現行`registerReviewEvidenceSession`はライフサイクル通知用hookであり、新しい証拠ownerの汎用登録口にしない。新runの発行は、固定adapter→実session初期化→非公開生成継続の範囲に限定する。任意objectを既存台帳へ登録しても新claimを取得できないようにし、fixtureを登録して実session modeへ切り替える旧経路を復活させない。

## 4. 生成順序・二種類のclaim

run確保とmatched後のsource bindingは別の一度限りの操作とする。認証・親／release取得の前から共通停止先が必要なため、matchedを偽の前提にして先にprepared sourceを作らない。

| 順序 | 固定処理 | 失敗時 |
|---|---|---|
| 0 | 最外側で診断slotを確保し入力を検査 | session生成前の拒否として記録。実I/Oなし |
| 1 | 既存client factoryでsessionを生成。同時実行枠・snapshot・開始時計を固定 | 生成済み部分資源だけ既存責務で解放。別sessionで自動再試行しない |
| 2 | 同sessionのrun claimを未使用→consumingへ同期移行し、共通owner／予算leaseを結合 | 後続検査失敗でもclaimを戻さない。未知sessionの別ownerを探索・消費しない |
| 3 | 固定sourceと取得modeを最初のsource要求前にpin | legacy/evidenceの途中切替・後付け採用・二重受信を禁止 |
| 4 | 同sessionの既存認証→親→release判定を実行 | OAuth／親／releaseも同C/G／開始時計に含める。未知・不一致は既存release未評価契約へ |
| 5 | 同sourceのmatched #permitが成立した後、sessionとsourceの証拠生成claimを同期取得 | consuming後の失敗は不可逆。二つ目のsource／permitで修正しない |
| 6 | 認証identity／ready世代／親snapshot／permit／release根拠／予算leaseを検査 | 最初の生成拒否を上位slotへ保持。prepared bindingなし |
| 7 | 同期revoke先を内部所有関係へ結合し、最後にlive／世代を再検査 | 最後の検査とprepared commitの間にawait・任意callbackを置かない |
| 8 | prepared_onlyへ同期commit | 正式発行gateは閉鎖のまま。将来のbody／selection証拠なしにactiveへ進めない |

run claimとsource生成claimはsession lifetimeで単一。重複生成要求は新要求を拒否し、既存ownerを置換・再初期化しない。生成途中の停止・失敗後の再要求は元理由を返す。既存owner内のbinding混入・二重payload開始等は、将来の用途別契約に従ってそのownerを停止する。

本書でmode切替を有効化しない。既存legacyのget／listMetadata／readPayload／verifyは互換性を維持し、新modeを入れる段階でだけ排他を検証する。旧getの許可tableを広げるだけでsys_db_objectの証拠取得を実現したことにしない。

## 5. session／ReleasePermitの正式binding

### 5.1 必須結合

prepared bindingは次の参照を固定する。

- 同じrun owner、実session、source、予算lease、source取得mode／世代。
- 孤立snapshotに対応するAuthSnapshotIdentity、同readyPromise由来のAuthReadyGeneration。
- 同source内部の#permitそのものと、#permit発行時に確定したprivate ReleaseDecisionSnapshot。
- 親snapshot、Update Set、sourceにpinしたselection policy identity。選択行やpayload証拠は後工程で追加し、現時点であると見なさない。

通常phaseの発行境界・payload移譲・final開始／completion消費でlive／同世代を再確認する。read-onlyな検査は再使用できるが、新GET／新job／再発行を許可するclaimと混同しない。

### 5.2 release snapshotの発行元と不変性

snapshotは同sourceのrelease完了部が、外部へdecisionを返す前に独立して作成・深く固定する。callerから返却decisionを再提出させたり、owner側でその可変objectを後付け登録したりしない。配列・limitations・operator_config／conflictの入れ子を含む。公開decisionとprivate snapshotはmutable参照を共有しない。

matched以外、別sourceのpermit、clone、失効済み、異なるsource世代は拒否する。C方式operator_configのmatchedは既存policyに従い得るが、asserted／未実測／陳腐化リスクのlimitationsを落とさない。開始時固定・`expires_at > started_at + deadline_ms`等の既存契約を維持し、設定期限や時計を更新して救済しない。ReleasePermitはtable ACL／scope一致／本番capの承認ではない。

### 5.3 認証に関する禁止事項

token／client secret／password／principalKey／snapshot内部識別子をlease・worker・結果・診断へ複製しない。同値token／originでも別sessionは別identity。per-user→service-account fallback、設定再読・別clientからのtoken注入・再認証世代への交換・別sessionへの引継ぎを禁止する。principalKeyはcredential-keyによる同時実行制御であって本人性の証明ではない。

## 6. 費目所有と単一予算

| 費目／資源 | 唯一の所有者・課金点 | 維持する上限／禁止事項 |
|---|---|---|
| C：HTTP試行 | sessionの唯一のdispatch部、実試行直前 | 全体210以下・低減値も尊重。OAuth／親／release／metadata／payload／table／final／retryをすべて共有 |
| G／S：受信 | 同transportで返った各chunk | 全体16MiB／通常1応答4MiB以下。失敗・超過分も返金しない。Content-Lengthやstatsコピーで代用しない |
| P：payload文字列 | 同sourceでpayload文字列を実受領した境界 | 単体2MiB／累計8MiB以下。後続版／schema検査で拒否しても課金し、hash／IPC／receipt発行では再課金しない |
| E：scope証拠の下位byte枠 | 同transportの用途別chunk | table16KiB／累計256KiBはfixture候補policy。本番投入は未承認。Gと別budgetで総受信を増やさない |
| R：最終再読予約 | 同sessionの用途別slot台帳 | 初期親／metadata分とtable受付分を一つの台帳で扱う。既存固定4予約と新予約を二重に積まない |
| retry／phase | sessionの同用途票・同phase世代 | 最大2試行。cleanup確認・残phase・C/Rで再検査。失敗後に新claim／新起点へ交換しない |
| HTTP reader／body／scratch | 同attempt所有部 | 単一受信経路で管理。cleanup要求と完了確認を別に記録し、未確認bodyからreceiptを発行しない |
| worker／IPC／計画 | 同runの固定supervisor | 既存の送受信・job／site／計画枠を維持。本文の複製／保持は別費目で、C/Gの再課金にはしない |
| timer／外部listener／同時実行枠 | session closeと各childの所有部 | sessionのactive/principalsをowner側から重複返却しない。child終了を会計解放だけで確認済みにしない |
| 結合／claim／診断 | run／sourceの固定制御部 | 検査・one-shot・失効の追加workを独立計数。HTTP課金へ混ぜず、全体work受付を有効化しない |

Rは費用の返金ではなく未使用試行の予約。将来の同一台帳では常に`C + R <= requests_limit`を満たす受付を行い、final実試行の消費または型付きskip／retry不要終端でだけ未使用Rを減らす。C/G/P/Eは減らさない。通常cutoff後にRを使って新しい通常GETやpayload／prepareを開始しない。

実経路の試行数はOAuth cache／per-user、親・release実測／fallback、選択payload件数等で変わる。合成E2EのC=7／8は本番の総試行上界ではない。現行C/G/PへE/Rを接続する際は同じ会計状態の拡張とし、第二のport／stats baselineや新しいOAuth sessionを作らない。`PreparedTransportBudget`やfixture会計をcastして実sessionへ持ち込まない。

## 7. 状態・失効・終了順

### 7.1 状態の区別

| 状態 | 許可すること | 許可しないこと |
|---|---|---|
| created／auth_pending | 同runの固定認証・親／release取得 | prepared source／receiptの先行発行 |
| release_pending | 同sourceの一度のrelease判定 | callerのmatched申告・unknownの救済 |
| prepared_only | 同identityのread-only検査、将来接続条件の検査 | 正式receipt／job配送／seal発行 |
| normal／finalizing（将来） | 型付き取得／選択／jobの全依存が成立した場合に限る | 本設計だけで有効化・phase再初期化 |
| stopping／closed | 失効、元の残時間内のcleanup、固定診断の読取り | 新GET／新job／新generation／再claim |

### 7.2 soft cutoff

既存の通常50秒／整合55秒／全体60秒と、低減時の比例reserveを維持する。通常cutoffは通常用途permitを失効させ、新payload／prepareを止めるが、それだけでsession全体を閉じない。発行済みidentityを保持してfinal再照合へ進める範囲と、新規I/O権限を分ける。phase controllerを交換しても絶対期限は延長せず、旧phaseのlate body／worker応答を新phaseへ採用しない。

### 7.3 hard stop・取消・全体失敗

固定された内部経路で、次を順に行う。

1. 上位診断slotとsessionの先行primaryを固定し、同じ停止理由をpinする。
2. source binding・発行permit・pending claim／delivery・worker job acceptanceを同期的に失効させる。awaitや任意user callbackは置かない。
3. session／HTTPをabortし、固定supervisorへ停止を伝える。workerの失敗も同ownerへ報告して同runの兄弟処理を止める。
4. HTTP cleanupとworker terminationを**別々に**観測し、元の残時間内だけ待つ。増分deadlineや再起動で救済しない。
5. 不要な本文・cache・binding参照を外し、child listener／timerとsession資源を各所有部で一度だけ解放する。
6. 解放後にも取消・残時間・primaryを確認し、診断を失わない結果合流へ渡す。

同期失効はthrowせず再入に対して一度だけ行う。悪意あるobserverを呼ぶsubscribe APIは作らず、session→owner→固定childの内部関係で伝播する。HTTP／workerの終了要求は各所有部が一度だけ発行する。stop後のlate認証／body／IPC応答や、後から得たcleanup confirmedで正常bindingを再生成しない。

停止後のcleanupには、同じ単調時計を読むだけのobservation用viewを分ける。このviewはHTTP／job／receipt発行のactive検査を通す能力を持たず、deadlineを更新しない。停止後の通常lease再利用でcleanupを実現しない。

論理失効と物理終了は別。hard期限を過ぎた処理を成功結果として待たず、終了未確認をそのまま保持する。JS文字列の物理ゼロ化、OS buffer／socketの消失、非協力的処理の最悪終了時間は本設計で証明しない。

## 8. 診断保持・固定caller

### 8.1 生成前から保持する結果

最外側診断ownerは、生成前拒否、source binding拒否、実行停止、局所asset不足を区別する。これはBR-006内部の提案であり、R-2のInputRejected／Outer型をそのまま再利用したとは扱わない。

- primary：固定stage／codeを最初の確定順に一つ保持。raw Error／message／stack／HTTP body／token／hash／内部identityを保存しない。
- HTTP cleanup：not_started／confirmed／unconfirmed。
- worker cleanup：not_started／confirmed／unconfirmed。
- 局所診断：asset／stage／固定codeだけを既存最大100件等の有限枠内で保持。重複通知で無制限に増やさない。
- 終端：未接続・停止・結果差戻し等の固定区分。cleanup不明をconfirmedへ上書きしない。

現在のfixture上位resultのcleanupはworker側の値であり、HTTP cleanupの確認済みまで意味しない。正式な合流契約はこの二軸を保つ。cleanup失敗より前にprimaryがあればその理由を維持し、なければ固定internal_review_error等とする。closed／重複要求／遅延応答は先行診断を消さない。

### 8.2 主要な拒否・継続条件

| 条件 | 固定分類・処理 |
|---|---|
| session生成前の設定／入力／admission不成立 | 生成前拒否。存在しないownerのcleanupをconfirmedにしない |
| unknown／mismatched release | 既存release未評価のまま。source証拠claim／receiptは発行しない |
| sys_cluster_state限定403等の観測不能 | 既存C方式のfallback判定だけに渡す。任意403をfallbackへ流さない |
| 別session／source／ready／permit、clone | binding拒否。未知handleで外国runを停止・消費しない |
| 既知owner内のidentity矛盾 | 同ownerを停止しevidence_binding_mismatch等を保持。修正値で再開しない |
| 二重生成 | 新要求だけ拒否し、既存ownerを置き換えない。失敗後の再生成も不可 |
| table等の401／通常403、総受信／総payload超過 | 全体停止。scope不足やrelease fallbackへ格下げしない |
| payload404／版変更／単体payload上限等 | 既存asset-local契約に従い開始claimを消費したまま保持。正式payload receiptなし |
| body／cleanup証拠が未接続または不明 | prepared_onlyから進めない。有効化前の閉鎖と実行中のcleanup不明を区別する |
| 不正IPC／worker終了／取消 | 同runを停止し、暫定比較を撤回。別workerへ自動再送しない |

固定callerはtyped失敗理由を上位slotへ必ず合流し、catchして空成功・clear・別session再実行へ変換しない。readonly inspectionが成功しても発行gateは閉じたまま。公開resultへの語彙追加とcompletion判定は後工程で承認する。

## 9. 有限構造・追加費用の設計枠

| 対象 | 構造の枠／計数責務 |
|---|---|
| run側 | run owner／予算lease／認証identity／ready世代／source生成claimは各1。未準備時は未発行のまま |
| source側 | prepared binding／release snapshot／policy identity／選択windowは各最大1。既存source snapshotと重複保持しない設計を後工程で検証 |
| 将来の行／job | 選択最大100・lookahead含め101、job最大100、site累計100、plan応答累計256KiB等の既存候補枠を維持。実allocator上界の承認ではない |
| 将来のscope table | fixture候補は最大8table。総C/G/E/Rとの受付と本番capは未承認 |
| pending／listener | unresolved IPCは1、受信attemptも同sessionで1。listener／timerの登録先・一度限りの解除を各ownerで列挙 |
| 失効／診断 | 保持件数に比例する有限走査。本文／rawログの収集費を含めない。反復通知は一次理由保持・重複排除で抑える |

結合検査、claim消費、snapshotのclone／freeze、phase検査、通知・失効・終了合流のworkを、生成／通常／final／cleanup別に独立計数する。定数値・保持bytes・IPC複製ピークは未導出で、合成会計C/G/P/E/Rに隠して確認済みとしない。導出と独立oracleの確認、必要なcap承認まで全体受付を有効化しない。

## 10. 次工程の順序・合成試験条件

1. **閉鎖された内部型と診断slot**：共通owner／run claim／source claim／readonly binding検査を合成依存で実装する段階。正式発行gateは常に拒否する。
2. **実session classへのprivate lifecycle接続をfake I/Oで検証**：認証snapshot／ready世代／同期失効、元予算leaseを結合。実通信しない。
3. **同sourceのpermit／不変release snapshot**：発行時のprivate結合を検査。unknown／clone／別source／返却decision改変・C方式limitationsを試験する。
4. **唯一の受信経路とtyped cleanup／E/R**：legacy二重課金・二重予約を防ぐ設計と独立oracleが成立してから接続する。JSON returnをreceiptへ登録する近道は禁止。
5. **選択payload／worker job／final／上位結果**：すべての由来とone-shotを結合し、最後に公開契約・cap・有効化の判断へ進む。部分成立で発行しない。

最低限の検証条件：

- 同値token／originでも別session拒否、fixture登録済みobject・instanceofだけ・scalar copyから発行不可。
- 認証前／ready直後／permit発行中／prepared commit直前の取消、claim失敗後の再使用、二重生成で既存owner不変。
- matched permitのclone／別source、nested release decision改変、asserted／未実測limitationsの保持、run期限を覆わない設定の拒否。
- HTTP内部停止・外部取消・worker失敗の両方向伝播、soft cutoffとhard stopの区別、旧phase／late応答拒否。
- C/G/Pの既存値を引継ぎ、OAuth cache／per-user／retry／失敗chunk／payload版拒否を含む独立集計。E/Rは本番未承認のまま検証。
- reader pending／cancel reject／worker終了未確認を分離し、primaryと二つのcleanup軸を保持。close・枠返却・listener解除は一度だけ。
- legacy0.2／0.3・全selection mode・既存14規則の退行なし、秘密／コード本文／内部identity非出力、梱包後もfixture→実sessionの入口なし。

## 11. 承認待ち・今回行っていないこと

未承認：private配置・mode固定の実装方式、内部診断の次版契約、実transport cleanupの確認方式、E/R運用cap、work／保持上界、worker終了policy、公開AU-BR-006語彙・coverage、実ACL／field応答。

draft-0.1の作成時はローカルソースと既存設計の照合・MD更新だけを行った。後続の合成限定実装は§13を参照する。本番cap投入・正式receipt／証拠permit発行・実session／実transport接続・実機操作・トークン発行・設定変更・Pushは行わない。既存ReleasePermitの存在と、閉鎖中の正式なBR-006証拠発行権限を混同しない。

## 12. 文書確認（2026-10-27）

新規本書と関連6文書の計7MDを確認し、相対参照75件の参照先に欠落なし。`git diff --check`の空白エラーなし。旧実session設計§11／§12の撤去前説明を現行境界と履歴へ分離し、旧版draftへの関連参照も更新した。過去の検証記録そのものは書き換えていない。

このdraft-0.1文書確認時点ではソース・テスト・package・設定を変更せず、build／合成テストを実行していない。後続§13の限定実装・検証と混同しない。

## 13. 合成依存に限定した内部モデル

`src/review/abort-scope-evidence-run-owner.ts`の`createSyntheticRunOwnerIssuer(clock)`は、factoryごとに分離したprivate WeakMapでsession／診断slot／run／source／permit／readonly bindingを管理する。すべて凍結opaque handleで、実lifecycle・既存fixture台帳にも登録しない。実sessionや既存ReleasePermitを受け取る口はなく、scalar copy／clone／別realmは認識しない。moduleは既存`!dist/review/abort-scope-evidence*`の非同梱対象。

### 13.1 生成とbinding

- allocateDiagnosticでowner生成前のslotを作る。rejectBeforeRunは固定input診断だけを一度記録し、後のrunへ付け替えない。実session生成を呼ぶ機能はなく、合成session生成失敗をslotへ合流させる責務は合成callerが持つ。
- issueSessionはauth modeと1..60000msの期限だけを受ける。token／origin／credentialsを入力せず、auth／snapshot／budgetをmodel内の新opaque identityにする。これは実認証・RunBudgetLeaseではない。
- createRunは既知sessionのrun claimをconfig検査より先に消費し、同sessionのsourceをpinする。失敗後も再生成不可。別slotでの重複要求は新要求の診断だけへ記録し、健全な既存ownerを置換しない。
- completeAuthentication／completeReleaseの入力は**合成前提**。auth readyは一世代だけ、releaseはsource内部recordへ独立copy／freezeする。release前提はobserved／operator_config／none、familyはAustralia／Zurich／nullの限定subsetで、実ReleaseEvidence・設定期限・C方式全体の検証器ではない。
- bindSourceはmatchedの場合だけsession／source claimを先にconsumingへ進め、parent-ready・同permit・auth／snapshot／ready／budget・最終clockを再検査してprepared_onlyへcommitする。unknown／mismatchedにはpermitを発行せず、source claim前に拒否する。foreign source／permitを混ぜても外国runのclaimや状態を変更しない。
- checkBindingは同run／source／permit／generation／private release snapshot／ready／budgetを再確認する。成功を繰返せてもclaimを作り直さず、refuseEvidenceは成功bindingにも必ずinvalid_stateを返す。正式発行への昇格口はない。

operator_configの合成前提はasserted／未実測／陳腐化のlimitationsを必須にして保持し、入力objectの後の書換えを切り離す。ただし、設定ファイル・署名・接続先binding・expires_atを読む実装ではない。実ReleasePermitや返却decisionの真正性は証明しない。

### 13.2 停止・診断・clock

cancel／close／revokeSessionはmodelのliveとreadyを失効させ、進行中claimをfailedにする。primaryは固定stage／codeの最初の一件を保持し、未知のreasonやErrorはinternal_review_errorへ正規化する。closed後の取消でもclosedを維持する。同期的なmodel失効であり、実controller／worker／readerへの停止通知や解放処理は存在しない。

HTTP／workerのcleanupは別軸で、observeCleanupへ渡す合成通知だけを記録する。unconfirmedはsticky、先行primaryをclose／後続cleanupで上書きしない。最初のconfirmed通知は同じ単調clockで残時間を検査し、hard期限の等号以降・clock例外／逆行ではunconfirmedにする。既に期限内に確定した同一confirmedの再通知は冪等であり、新しいactive権限を与えない。取消後も期限内の観測専用clockで合成cleanupを記録できるが、bindingは復活しない。これはresource／OSの終了確認ではない。

通常cutoff後もreadonly identity検査は可能とするが、GET／prepare／finalを開始するAPIを持たない。hard期限は検査時に拒否するだけで、自動timerやリアルタイム中断は未実装。clock callbackの再入による取消・参照差替えを、最後の検査後に再確認する。

replaceSyntheticIdentityは敵対的fixtureの前提を変更する専用操作で、auth／snapshot／budget／ready／source世代／permit／release snapshotのmodel参照だけを置き換える。実sessionや本番identityの読取・書換え機能ではなく、停止後は拒否する。

### 13.3 費目と未対応範囲

一つのmodel sessionにつきrun／source／permit／bindingは各最大1。runの診断slotは1で、初回primaryとHTTP／workerの固定cleanupだけを保持する。未知入力・重複要求の新slotは合成caller側のものとして区別する。factory全体のsession／slot数に本番admission上限を実装したわけではない。

readonly検査は固定2回のclock検査と有限個の参照比較を行う。HTTP試行・chunk・payload・worker・timer操作は0で、C/G/P/E/Rは実装せず、budgetは参照identityだけ。実allocator容量、制御work上界、既存C/G/Pの引継ぎ、E/R配賦、child停止と診断合流は未確認のまま。合成通知／premiseから正式receiptや本番capを発行しない。

この合成モデルからの次工程として、§14で実session lifecycle・readonly予算leaseへの接続をfake I/Oで検証した。既存fixture台帳は実sessionへ再接続しない。選択payload／worker job・typed transport／cleanup・公開結果は後工程。Unknown・全体受付無効・正式発行口閉鎖・VM／監視／telemetry保留を維持する。

検証：[合成run owner・claim・readonly bindingの記録](E2E_BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_SYNTHETIC_2026-10-27.md)。

## 14. 実session private lifecycle接続（fake I/O検証）

### 14.1 生成元と所有権

`BoundedReadSession`のconstructorは孤立した`#snapshot`、固定`#runLease`、`#runOwner`をECMAScript private fieldへ保持する。`registerReviewEvidenceSession`が返すclosureをconstructorが一度だけ取得し、readonly診断以外は外へ返さない。同session keyの再登録はWeakSetで拒否し、終了後も再登録できない。旧mark／revoke-by-session exportは削除し、sessionのprivate portだけが通知を行う。

任意objectで同moduleの関数を呼んでも、別の孤立ownerができるだけで、実sessionのprivate owner取得・置換・ready操作はできない。この関数はsource／証拠発行の登録口ではない。§13の合成issuer・fixture台帳・claim・permitを採用する経路はない。

### 14.2 認証と同期失効

同constructorのsnapshot参照にAuthSnapshotIdentityを結合し、既存readyPromiseの認証成功継続だけがreadyを通知する。ready遷移claimはlease検査より前に消費し、再入／二重通知／失敗後の再認証で作り直さない。ready世代は0→1だけであり、per-user・OAuth cache・OAuth交換／retryとも同じrunを使う。

stopは最初の理由を固定し、ownerのreadyとsnapshot参照を同期失効させてからAbortControllerをabortする。closeはownerを閉鎖してから既存timer／listener／同時実行枠を解放する。遅いOAuth応答、取消・認証失敗・close後の通知でreadyは復活しない。owner側の固定失敗も既存checkへ合流し、binding／観測不整合はtransport側ではinternal_review_errorとして停止する。先行owner診断は上書きしない。

### 14.3 readonly leaseと診断

leaseは同sessionの既存requests／receivedBytes／payloadBytesと元の単調開始時計・deadlineを読むだけ。公開stats／remainingMsの再提出やコピーをauthorityにせず、第二の会計・timer・dispatch・予約・課金・返金・上限更新APIを作らない。元の60秒・210試行・低減設定と4 final試行予約を変更しない。正常phase cutoffはhard停止と区別し、残るfinalization時間を新runに置き換えない。

`reviewRunStatus()`は凍結したstate／ready boolean・世代番号／固定stage・code／有限数値の会計観測／`evidence_issuance=disabled`だけを返す内部診断。snapshot／token／principal／ready object／lease／source／permitを返さず、MCPの公開入力・結果schemaへ追加しない。観測の逆行・非有限値・counter減少・例外を固定理由で停止し、未知reason・Error本文は出力しない。診断取得には失敗時の停止副作用があり、稼働権限を返すpure queryではない。

生成時のrun／診断slot／readonly leaseは各1、ready世代は最大1。markReadyのlease観測は最大1回、通常の診断は最大3回、停止後は最大1回で、C/G/Pを追加消費しない。これは制御work・実allocatorの上界や全体受付の承認ではない。E/R・typed cleanup・worker停止は未接続で、cleanup終了を確認済みにしない。

### 14.4 残課題

§14の段階では既存の`ReleasePermit`・不変release根拠は未結合だった。後続§15でprepared-onlyの結合を追加したが、§13の合成source bindingを実sessionへ昇格させたものではない。選択payload／worker jobとformal receipt／seal／findingを発行する口は閉じたままにする。予算leaseはreadonly観測subsetで、transportの用途別会計や停止ownerの全仕様が完了したわけではない。

検証：[private lifecycle・ready・readonly leaseのfake I/O記録](E2E_BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_LIFECYCLE_2026-10-27.md)。実transport・実機操作・設定変更・本番cap／全体受付・Pushは実施しない。

## 15. 同sourceのReleasePermit／不変release snapshot結合

### 15.1 発行元・private境界

`BoundedUpdateSetSource.#completeRelease`のmatched分岐だけが、既存の同source `#permit`と独立copy／freezeした`#releaseSnapshot`を作る。snapshotはmatchedであり得るobserved／operator_configの既知のflat構造とlimitations配列だけ。public ReleaseDecisionのinstance_releaseやlimitationsとはcanonical参照を共有せず、返却decisionの後書換えを採用しない。

sourceのsession参照をECMAScript private fieldへ統一し、既存の取得・会計も同じsessionを使う。`releasePortFor(source, session, permit)`はprivate-field所有・同session・同permitを検査する固定verifierで、raw object登録口ではない。clone／Proxy／別source／別sessionは通らない。返す凍結portはcanonical snapshotを公開せず、構造的な同一性検査と独立した凍結release値のcopyだけを持つ。portを読めてもrun owner・予算lease・正式発行権限を取得できない。port.matchesは構造検査であり、live認定ではない。

### 15.2 run ownerへの一度限りの採用

source内部の発行継続がsessionの固定採用入口を呼ぶ。入口はcaller提出のmatched／release値を受けず、上記verifierで取得したportだけをprivate ownerへ渡す。ownerはsource claimをconsumingへ進め、同snapshot／lease／ready世代・portを検査し、独立した不変copyを保持して最後のclock／identity検査後にclaimedへcommitする。失敗はclaimをfailedにして同期停止し、作り直さない。

同じsource／permitの二重採用要求は新しいbindingを作らず拒否し、健全な既存ownerは保持する。二つ目のsourceや別permitによる置換はbinding不整合として停止する。unknown／mismatched／conflictにはpermit／portを作らずsource claimは未消費。C方式は元の設定pin・binding／期限検証を維持し、asserted／未実測／陳腐化等のlimitationsを落とさない。

### 15.3 readonly検査・失効・互換性

`reviewReleaseStatus(permit)`はprepared_only・独立した凍結release値・limitations・`evidence_issuance=disabled`だけを返す。sessionの固定checkerは同run／source／permit／port／ready世代／leaseを照合する。mixed bindingなら要求先runの初回binding診断を保持して同期停止し、外国runのclaimや状態を変更しない。close／取消／元hard期限でcanonical bindingを失効させ、新GETや再発行には使えない。既に返した非秘密のrelease値copyを回収する機能ではない。

通常cutoff後もreadonly確認は可能だが、GET権限を与えない。既存listMetadata／readPayload／verifyは従来のpermit／phase制御を通し、正しいpermitの場合だけ追加のowner照合を行う。従来のforeign permitの早期release_not_admittedは健全runを壊さない互換動作として維持する。一方、追加のprepared binding checkerへの混入は停止対象とする。

### 15.4 費目・未対応

同sessionのprepared bindingは最大1、sourceのpermit／canonical snapshot／portも各最大1。ownerは独立copyを1件保持する。採用時のlease観測は最大2回、readonly検査も最大2回。追加HTTP試行／受信／payload課金・timer・retry・E/R操作は0。copyは既存のboundedなreleaseフィールド・limitationsだけで、制御work／allocation全体の承認済み上界を意味しない。

正式なsource evidence receipt／payload／worker job・typed transport／cleanup・上位結果へは未接続。既存ReleasePermitをscope証拠のpermitに読み替えず、formal receipt／seal／findingの発行口は存在しない。全体受付無効・Unknown・telemetry／VM／監視保留を維持する。

検証：[同source release bindingのfake I/O記録](E2E_BEST_PRACTICE_ABORT_SCOPE_SOURCE_RELEASE_BINDING_2026-10-27.md)。
