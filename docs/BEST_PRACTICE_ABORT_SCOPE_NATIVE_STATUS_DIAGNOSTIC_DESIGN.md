# AU-BR-006：native status証拠の発行元・上位診断ownerの対設計

Version: br006-native-status-diagnostic-draft-0.9 / Date: 2026-11-01。
Status: **ND-01／02と、ND-03の実session／source class＋注入resourceの新規fake-run試験を実装。既存runtime経路への採用・実認証／URL由来の証明は未接続。fallback有効化・実接続・実通信は行わない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。**

基準：[SA-02と後続差分](BEST_PRACTICE_ABORT_SCOPE_STATUS_SOURCE_ACCEPTANCE_DELTA_DESIGN.md)、[ST-03の注入owner](BEST_PRACTICE_ABORT_SCOPE_STATUS_TERMINAL_CONNECTION_DESIGN.md)、[単一予算・停止owner](BEST_PRACTICE_ABORT_SCOPE_STATUS_SESSION_BINDING_DELTA_DESIGN.md)、[非200の承認比較](BEST_PRACTICE_ABORT_SCOPE_NON200_APPROVAL_COMPARISON.md)。型名・stage・操作名は内部契約案で、実装済みAPIや公開JSON enumではない。

## 1 現状・目的・非対象

[SA-02](../src/servicenow/bounded-read.ts)は、同constructorの実source／session private継続を使うが、status／cleanupは`synthetic_status`の合成記録である。[ST-03C](../src/review/abort-scope-evidence-status-cleanup.ts)は注入Responseから同readerのcleanup・private消費を確認する開発専用ownerであり、その返却diagnostic／consumptionは正式証拠ではない。

次に必要なのは、native操作から生まれるprivate終端とsource consumerを同生成元に結ぶこと、および失敗時にHTTP／cleanupの事実を失わない上位ownerを観測前から確保することである。**証拠の有効性と、診断を保存できることは別の条件**とする。

最初の接続対象はreleaseの1attempt・ordinal1、注入Response／Streams＋fake dispatcherまで。retry・drain・実fetch・実OAuth交換・本人性確認・C方式判定・permit／metadata／payload／worker・final予約移譲・公開MCP登録は対象外。既存200限定guardとlegacy挙動は維持する。

## 2 既存契約との差分

| 箇所 | 再利用 | 追加する契約・禁止事項 |
|---|---|---|
| session／canonical／lifecycle | 同snapshot・登録lease・core・transport／source claim、first primary・一度限り停止通知 | 同private生成継続でnative issuerと診断writerを結合。既存sessionの後付け登録・第二budgetなし |
| native reader owner | pinned getter／操作・Promise、同reader、元window、cleanup join point、pre-release事実の固定 | cleanup終端は同記録から直接発行。任意のenum／diagnostic／caller申告から生成しない |
| source private consumer | release-use claim、takeStatus、非実行draft、pre／post guard、close前受理 | native issuer由来だけを照合するtakeへ接続。ST-03Cの消費済みtokenを再消費しない |
| 上位結果 | 固定codeと限定summary、先行理由保持 | 観測前owner・用途別の固定slot・seal後のsanitized copyを定義。診断から権限を復元しない |

既存開発用issuerをruntimeへimportする方法ではなく、同一性・操作固定・終端規則をruntime契約として別途実装する。fixtureのidentity台帳は共有しない。外部指定consumer・可変writer・raw sessionのlookup／登録APIは追加しない。

## 3 診断ownerを確保する時点と所有

1. 新規constructorの同core／登録lease／run identityが成立した時点で、固定容量の診断ownerを生成する。生成時にclock・I/O・caller callbackを呼ばない。
2. timer／外部abort listenerや認証・Response観測より前に、run停止理由を書ける固定writerを捕捉する。診断owner生成失敗は固定`internal_review_error`で停止し、ownerを作り直して続行しない。owner自体が存在しない場合は、その固定codeだけを上位へ返す。
3. source／constructor key／transportがまだ未生成なら、ownerのbindingは`pending`とする。`#openComposition`の同private継続から一度だけ結合し、結合完了前に証拠を発行しない。
4. 結合claimはcallbackより先に消費する。診断ownerを別source／leaseへ付け替えず、失敗・close後に再生成しない。readonly observerやsource公開methodへwriterを返さない。

ownerはrun全体で1個。用途slotはauthentication／parent／releaseの固定3個を上限とし、各slotはこの段階ではordinal1だけ。未使用のslotを観測済みとして埋めない。最初のnative接続はrelease slotだけとし、auth／parentのnative接続を暗黙に完了扱いにしない。

既存contractは同用途でordinal2まで進み得る（確認済み429／5xxの1回retry、[review-bootstrap-contract.ts](../src/servicenow/review-bootstrap-contract.ts)）。ownerはrun全体を対象とするため、ordinal2以降の観測で失敗・上書きしてはならない。各用途slotはordinal1の事実だけを保持し、後続attemptでは書き換えない。後続attemptは用途別の固定件数`later_attempts`と、その最初の理由だけを記録する。既存3Aのretry挙動はこの設計で変更しない。

draft-0.2のレビュー修正：既存contractのordinal2観測に対するslotの扱い（ordinal1固定・後続は件数と最初の理由だけ）を明記し、ND-T12を追加した。

writerは固定生成元ごとに権限を分ける。run ownerは停止理由、取得元はheader事実、同reader ownerはcleanup事実、固定consumerは受理stage／拒否だけを確定する。別用途・別attemptのwriterやreadonly copyによる書込みは拒否し、外国ownerを変更しない。

## 4 native証拠の型・発行元・同一性

| 内部契約案 | 生成元／保持内容 | 用途・寿命 |
|---|---|---|
| NativeStatusAnchor | 固定取得のcreator。session・key・snapshot・ready世代・lease／core・source／target・transport・purpose・method／URL・attempt／元window | 当該取得だけ。注入試験では実URL／認証由来の証明とはしない |
| NativeCleanupRecord | 同anchorのreader owner。Response／body／reader identity、captured closed、cancel決着、release結果、操作数、pre-release事実 | reader所有部が保持し、外部からrecordを提出できない |
| NativeStatusTerminal | 同issuerがprivate cleanup終端とheaderを結ぶopaque参照 | 最大1個。一度消費または失効。単独でfallback／body ack／permitを許可しない |
| UpperDiagnosticOwner | 観測前の同constructor。固定用途slot・first reasons・受理stage・seal claim | 証拠失効後も固定copyを保持できるが、writer／権限は返さない |

発行条件は、同native取得元のheader、同anchor／attempt、同readerの所有・操作・元floor内のcleanup確認、runの生存である。bodyありならgetReader／closed捕捉／cancel／releaseLockを同readerで各一度、read=0・pending readなしとする。closedの成否はreleaseLock前に固定し、releaseによる後発変化で偽装しない。

no_bodyはnative body getterから確認した不在であり、callerの`cleanup='no_body'`申告を使わない。操作は全0、factsはnot_applicable、kindはno_bodyとし、EOFや空のrelease観測へ変換しない。reader取得／closed捕捉に失敗して所有を確認できなければunconfirmedとする。

unknown headerはstatus=nullのまま。cleanup confirmedだけからstatus403等を推定しない。pinned API・Promise／同readerの不変条件を維持し、二重所有・proxy／不適合resource・取得途中の失敗は同attemptの診断と解放へ合流させる。

native terminalの型付き終端と、公開用cleanup診断copyを別物にする。JSON一致・`instanceof`だけ・型cast・同origin／token文字列・`fake_io=true`・前工程の`consumed`は発行元証明にならない。

## 5 同一scopeでの唯一の消費・close前受理

```text
診断owner確保・同run binding
  → 同creatorのissuer／固定source consumerを対で生成
  → 同attemptのResponse／headerを観測（診断はここで保持）
  → 同readerのtyped cleanup終端を確定（診断はここで保持）
  → 適格かつ生存中だけprivate terminalを1個発行
  → source側release-use claimを先に消費開始
  → lookup／pre-guard → 非実行draft → post-guard
  → close前の受理履歴を確定（fallback／permitなし）
  → authority同期失効 → cleanup合流・固定解放 → 診断seal／限定copy返却
```

issuerと唯一のconsumerは同constructorの固定継続だけが捕捉する。ST-03Cの既存自動consumerを通してからsourceで再消費する構成、任意callbackへterminalを渡す構成、close済み履歴の再採用は不可。

lookupの前に自分のclaimをstartedへ移しlive slotからtokenを除去する。誤ったtokenでも自分のclaimを復元せず、外国issuerのmapを消費しない。body ackとstatusは同release-use claimを共有し、両分岐の成功を合計1回以下にする。

pre／postでは同session／snapshot／lease／core／source／target／ready／transport／attempt／purpose／元windowとcleanupを照合する。元attempt floorをdraft構築後にも確認し、awaitから戻る境界と外側close前にも停止／期限を検査する。受理前のclose・取消・再入・期限切れはdraftを破棄する。

受理済み履歴はclose後も不変の非実行copyとして残せるが、terminal／draftのlive slotは残さない。gateを後から開いて履歴から継続せず、将来の承認後も新規run内の同消費処理だけを対象とする。

## 6 上位診断の固定slotと更新規則

| 項目 | 保持する事実 | 更新・公開上の制約 |
|---|---|---|
| first primary | 最初のrun停止の内部code・既存公開code・stage | 後発close／cleanup／写像で上書きしない |
| first local failure | parent404等の用途局所の失敗とstage | hard HTTPと区別。既存停止方針をここで変更しない |
| first refusal | 混入／二重消費等の内部code・拒否stage | primaryとは別。拒否だけでも受理継続不可 |
| HTTP slot | planned purpose、観測済みか、固定status／body有無、hard／local／回復候補の分類 | 未観測はnull。headerだけでcleanup成功や回復許可を作らない |
| cleanup slot | not_started／pending／confirmed／unconfirmed、kind、reason／wait_issue、固定facts／操作数 | pending→終端は1回。unconfirmedを後からconfirmedへ昇格しない |
| acceptance slot | 未開始／消費中／受理済み／拒否／失効、最初の終端、消費回数0／1 | first terminalと最新phaseを別保持。再入で成功回数を増やさない |
| teardown slot | 未開始／解放中／解放確認済み／未確認 | cleanup・session解放を混同せず、主理由を置換しない |

上記は内部語彙案で、公開review JSONへ新enumを追加する承認ではない。HTTP／cleanupの更新は同attemptの固定writerだけが行い、余剰項目・別slot・二重終端・accessor／proxy・順序違反は拒否する。診断書込みの失敗でも先行primaryは保持し、受理をfail closedにする。raw例外本文を診断に取り込まない。

headerは観測時点で確定して保存し、cleanupは開始をpendingとして記録してから、元window内の結果を一度確定する。getReader等を開始して所有が不明な場合をnot_startedへ戻さない。resource取得前の拒否が検証できた場合だけnot_startedとする。

cleanupがpendingのまま上位終了境界に達したら、元理由に従うunconfirmed終端を固定する。late settleは同readerの後始末に合流し得るが、確定診断・発行可否・受理履歴を昇格させない。seal後の遅延書込みは権限を持たない`late_ignored`相当の固定結果とし、診断を変更しない。

## 7 失敗の優先順位と停止・解放

| 観測順／組合せ | 保持・停止方針 |
|---|---|
| 先に取消／期限／quotaが停止済み、その後にstatus到着 | 先行run理由を保持。statusは診断事実だけ、terminal発行なし |
| 先に401／auth・parent403を観測、その後cleanup失敗 | 既存hard primaryを先に記録して停止。HTTPとunconfirmed cleanupを両方保持 |
| release403／404、run未停止 | statusは回復候補の事実だけ。即座にaccess_deniedをrun primaryへ変換しない。cleanup確認後も非実行受理まで |
| release403／404＋cleanup未確認 | HTTPを保持したまま、先行primaryがなければ既存internal_review_errorで停止。fallback／terminalなし |
| parent404 | local分類を保持し、release404へ付替えない。親未受理のままsource消費しない |
| 未知status・不正resource／ownership | 固定失敗codeと観測できた事実を保持。回復候補に推定変換しない |
| 受理確定後の通常close | 受理履歴と閉鎖の事実を分離し、先行失敗／拒否を消さない。権限は残さない |

停止順は、診断にfirst reasonを固定→run／issuer／source consumer／未受理terminalを同期失効→abort／cancel→同cleanupへjoin→元期限内の解放→診断sealである。canonical coreとownerの相互通知は一度限りとし、新budget／clockを生成しない。

cleanup用readonly観測は停止後も認めるが、authorityの生存を復活させない。join pointをnative／scheduler callbackより先に確保し、reader ownerは同readerの解放、sessionはtimer／listener／admission／credential参照の破棄を一度だけ担当する。sourceがそれらを二重返却しない。

## 8 費目・bounded性・秘密非出力

- 全体60秒・最大210試行、元phase／attempt／cleanup floor、C/G/PとR4枠は同canonical ownerのまま。証拠発行・消費・診断更新による追加dispatch／返金／予約補充は0。
- status-onlyはread=0、readerから取得するchunk由来G=0。socket受信量0の主張ではない。親の200 body等は既存同bytes課金を継続する。
- 診断ownerは固定3用途slot・各1attempt、release terminal／draftは各最大1個、first reasonsとseal claimは各1個。可変長の生ログ／body／error stack／全履歴配列を持たない。
- 新しい固定slot／参照照合／診断copyの費用は別途検証する。Rust work modelや全体受付の承認済み費用として扱わない。
- seal後の返却は固定code・stage・status・cleanupの型付き事実・件数・限定summaryだけ。token／terminal／anchor／key／lease／writer／mutable consumer／credential／コード本文・秘密を含むURL／例外本文を出さない。
- 読取用projectionはauthorityではなく、source／issuerへ再提出できない。既存公開JSONの互換性を維持し、新しい返却契約のruntime採用は別承認とする。

## 9 合成受入条件

| ID | 検証 | 必須結果 |
|---|---|---|
| ND-T01 | owner確保より前の観測、生成／binding失敗 | 観測0・発行0で停止。失敗後のowner再生成なし |
| ND-T02 | getter／getReader／closed捕捉／cancel／releaseの失敗 | 取得できたHTTP事実とcleanup理由を上位へ保持。各操作一度、read0 |
| ND-T03 | 同Response／reader・bodyあり／native no_body | 確認済み記録だけから同issuerが発行。enum／diagnostic copyから昇格0 |
| ND-T04 | 別session／snapshot／source／lease／attempt／用途／window・copy token | 受理0・外国owner不変。自分のclaimは復元しない |
| ND-T05 | hard HTTP＋cleanup失敗、先行取消＋後着HTTP | 観測順にfirst primary保持、HTTP／cleanupの両軸が残る |
| ND-T06 | pre／post・draft構築・await後／close前の失効／等号 | 受理結果を新規公開しない。元floorを延長しない |
| ND-T07 | 二重終端・二重消費・body/status競合・再入 | 固定slotとrelease-use claimを一度だけ消費、成功最大1 |
| ND-T08 | pending timeout・late settle・seal後書込み | unconfirmed／先行診断は不変。terminalの再発行なし |
| ND-T09 | 欠落header・ownership不明・診断writer不正 | 推定status／cleanup成功なし、先行理由保持・fail closed |
| ND-T10 | 二重close・予約release・時計／counter比較 | 解放各一度、C/G/P一重計上、R補充なし |
| ND-T11 | compiled／梱包・秘密marker・固定200回帰 | fixture非共有／非同梱、本文／秘密非出力、旧guard維持 |
| ND-T12 | 同用途の確認済み503→200等、既存contractのordinal2観測 | ordinal1のslot事実は不変。`later_attempts`と最初の理由だけを保持し、既存retry回数・C/G計上は変えない |

期待値は独立した操作イベント・固定status表・参照比較・元clock境界から作る。製品counterや公開diagnosticを証拠の代用にしない。注入試験の成功を実HTTP・実認証・実PDI確認済みとしない。

## 10 次の段階・承認待ち

1. **ND-01**：観測前診断owner・固定slot・writerの所有・one-shot binding／sealを純粋fakeで実装し、先行理由・二軸・late更新拒否を検証する。native採用／source受理はまだ接続しない。
2. **ND-02**：native issuerのanchor／typed終端と唯一のconsumerを注入Response／Streamsで接続する。診断ownerを先に結合し、SA-02のenumからの生成は証拠経路として使わない。非実行受理・fallback0のままとする。
3. **ND-03**：実class＋注入resourceの連続fake試験で同core／source・終了／診断projectionを確認する。実dispatcher由来URL／認証bindingとruntime採用は別工程。

型の配置、同reader操作のruntime実装表現、writerのbinding／seal順、最終公開projectionの項目・秘密検査は実装前レビュー事項。開発専用ST-03C moduleのimportや、公開getter／registryによるwriter取得を代替手段にしない。

SA-03へ進む前には[比較資料](BEST_PRACTICE_ABORT_SCOPE_NON200_APPROVAL_COMPARISON.md)のD1（未確認cleanupなら停止）、D2（確認済みrelease403／404だけ同sourceへ）と関連A／ST-A／STC-Aの条件を明示承認する必要がある。D3 retryは独立した別判断とし、retry枯渇fallback・bodyなし429／5xxは最小SA-03に含めない。承認だけでgateを自動解除しない。

本書は①native発行元と②上位診断ownerを対にした設計と、次節のND-01限定実装記録である。200限定guard・正式発行口閉鎖・Unknown・全体受付無効・調査保留を維持し、fallback有効化・実接続・実通信・実機操作・設定変更・Pushを承認しない。

## 11 ND-01：純粋fakeの診断owner

[内部model](../src/review/abort-scope-evidence-native-diagnostic.ts)はpackage除外済みの`abort-scope-evidence*`配下に配置した。ND-01のexportは固定case名のdata-only fixtureであり、owner／writer／binding／attemptを取得・登録・供給する口はない。実sessionのclaim台帳は共有しない。ND-02で追加した注入専用factory／固定fault fixtureは次節を参照。

- constructorで固定3slotを確保し、clock／callback／I/Oは一切呼ばない。bindingは同creatorのimmutable binding objectへの参照一致で一度だけ行い、失敗後の再bindingを拒否する。既存実sessionやReleasePermitの証明ではない。
- purpose別header／cleanup／acceptance writerとrun停止／teardown writerはprivate closure。ordinal1のHTTP／cleanup／受理履歴を保持し、後続attemptは件数と最初の失敗理由だけを更新する。固定3個のcurrent参照・観測bit・body有無・cleanup進行状態で重複を拒否し、可変長履歴を持たない。現在attemptのcleanup確認前に次attemptへ進めず、後続cleanupの失敗／pending終端も停止・最初の理由へ反映する。順序付きordinalは最大210の防御上限であり、retry承認・C計上ではない。
- first primary（内部／公開code）・local・refusalを分け、診断拒否は同期で停止／受理状態を失効する。停止後に既存attemptのHTTPやcleanupが到着しても先行primaryは置換しない。新規attempt／受理継続は拒否する。
- cleanupはnot_started→pending→confirmed／unconfirmed。body有無とkind／reasonの矛盾・二重終端を拒否する。seal時のpendingはwindow_ended／unconfirmed、解放中はunconfirmedに固定する。終端済みを昇格しない。seal後は全writerと二重sealがlate_ignoredで同じcopyを維持する。
- sealは新しい権限を生成せず、受理のfirst terminalと消費数0／1を残したまま最新phaseをrevokedへ移す。返却は再帰的freezeした限定copyのみ、全7permissionはfalse。

本段階のcleanupは内部で組み立てた合成事実であり、reader操作・操作数・pre-release facts・typed native terminalの証明ではない。受理stageも診断model内の非実行遷移で、source消費やfallbackには接続しない。停止・期限は固定codeの合成イベントとして検証し、clockやcanonical budgetを新設／更新しない。ND-T02／03／06／10の実操作・元window・会計確認はND-02以降に残る。

draft-0.4のレビュー修正：後続attemptの最初の理由を既存contractと同じ分類にした（429／5xxは`upstream_unavailable`、その他の200以外は`invalid_response`）。また、dispatch／fetch失敗でheaderなしに終わったattemptを`not_applicable`のcleanupとして終了でき、次のordinalを開始できるようにした。ordinal1ではHTTP slotをnullのまま残し、後続では件数と`upstream_unavailable`を記録する。同attemptへの後着headerは拒否する。

[合成テスト](../tests/review/native-status-diagnostic.test.ts)、[compiled fixture](../tests/review/fixtures/compiled-native-status-diagnostic.mjs)、[検証記録](E2E_BEST_PRACTICE_NATIVE_DIAGNOSTIC_ND01_2026-10-31.md)を参照。ND-01単独の記録であり、後続の接続は次節に分離する。

## 12 ND-02：注入native issuer・唯一consumer・上位診断への連続接続

同じ開発専用moduleの`createInjectedNativeDiagnosticWorkflow`が、新規fake bindingとND-01 ownerを先に生成・結合する。その後にdata-property限定の入力をpinし、注入Responseを一度だけ取得する。用途はrelease／ordinal1に限定する。認証／親のslotは未観測であり、認証済み／親受理済みや実URL・実ReleasePermitの証明ではない。

- private anchorは同生成元のbinding／attempt／元window／Response／headerに結合する。同readerのgetReader・closed捕捉・cancel・releaseLockは各最大1回、readは0。native body getterのnullだけをno_bodyとし、EOFに変換しない。
- cleanup joinをclock／native callbackより先に確保し、固定Promise／native操作と同budgetの単調な残時間を使う。元floorの等号で停止する。release前のcancel／closed事実をfreezeし、release後の効果から成功を作らない。全体60秒を超える入力や元windowを広げるdescriptorは拒否する。
- 同private recordのconfirmed cleanup・headerだけからopaque typed terminalを最大1個発行する。固定consumerは自分のclaimとlive tokenをlookup前に消費し、同anchor／record／cleanup／reader identityを照合する。pre／post guardと元floorを通った場合だけ、診断modelの非実行acceptanceを確定する。source consumerやC方式判定は呼ばない。
- HTTP／cleanupの型付き事実・操作数・first primary／refusal・受理履歴は別々に残す。停止時は先行理由を記録して同期失効し、pending cleanupへ合流する。停止・closeはcleanupの待機を打ち切らず、元cleanup floorまでreadonly観測を続ける（ST-03Cと同じ）。未確認cleanupは同slotとprimaryにだけ残し、teardownは本laneのtoken／claim解放だけを表す（§6）。遅延settleによる昇格を禁止する。

draft-0.6のレビュー修正：停止・closeで待機を即時に打ち切り`observation_invalid`と記録していた点と、reader cleanupの未確認をteardownへ写していた点を上記のとおり修正した。
- 正常終了もterminal authorityを失効して診断をsealする。再executeは固定request_rejected=invalid_stateを返すが、既存のseal済み診断を変更しない。全7permissionはfalseであり、消費成功はsource採用／fallback許可ではない。
- 返却診断やST-03Cのconsumptionを入力として採用する口はない。注入factoryはfault／session／consumer等の余剰指定を拒否する。private provenanceの負の対照は、別exportの固定case名fixtureだけから実施し、token／writer／任意callbackを外へ返さない。外国tokenの台帳は共有・変更しない。

ND-01／02時点のexportに加え、次節のND-03 entryを追加した。module全体は引き続き非同梱。実dispatcher／認証／URL由来のbindingは未接続。ND-01のordinal2診断は維持するが、このnative laneはretryを行わない。

[ND-02試験](../tests/review/native-diagnostic-workflow.test.ts)、[compiled fixture](../tests/review/fixtures/compiled-native-diagnostic-workflow.mjs)、[検証記録](E2E_BEST_PRACTICE_NATIVE_DIAGNOSTIC_ND02_2026-10-31.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・調査保留・既存200guardを維持する。

## 13 ND-03：実class＋注入resourceの連続fake試験

後続①・②の対設計は[constructor最初期の診断owner・fake friend分離draft-0.15](BEST_PRACTICE_ABORT_SCOPE_EARLY_DIAGNOSTIC_FRIEND_SEPARATION_DESIGN.md)を参照。EF-02のconstructor保護区間・失敗copy回収は実装済み。EF-03の[共通kernel・本番／開発root分離詳細設計draft-0.12](BEST_PRACTICE_ABORT_SCOPE_KERNEL_ROOT_SEPARATION_EF03_DESIGN.md)では、friend／synthetic_io撤去閉包、試験保証の移行と保留coverage、配布物の負の対照を具体化した。EF-03Aとしてconstruction状態・理由写像の純粋kernelだけを抽出し既存classへ接続した（参照照合・claim・停止／解放はroot所有）。開発root分離・撤去・build変更・gate解除は未実施。

開発専用`probeNativeStatusComposition`は、親bytesをbounded copyし、注入Responseと共に新規fake runだけを作る。`BoundedReadSession`は固定throwのfetchとper-user形式の合成snapshotで生成し、既存SA-02のprivate生成継続・`BoundedUpdateSetSource`の固定consumer・canonical会計を再利用する。既存sessionのlookup／登録／mode切替はない。

- 同constructor keyでsourceを一度だけ生成し、native開始前に上位ownerを結合する。親bytes／native操作より前にdriver.beginを行い、ready世代は実登録ownerの1を確認する。dummy readyを成功と偽装しても、親／releaseのdispatch前に拒否する。認証の実行・本人性の証明ではない。
- native側へ渡すのはopaqueなbinding alias・同leaseのreadonly残時間・固定check／accept／stopだけ。raw session／source／core／snapshot／登録ownerを渡さない。class側は同source／snapshot／lease／core／transport handle／attemptと元floorをprivate receiptで照合し、aliasコピー・別sourceのreceipt・再消費を拒否する。
- 親は同canonical会計でC=1／G=bytes長、releaseはC=1／read=0・G=0とする。R4予約・210試行・受信量・60秒の上限は変更しない。nativeのclockは同leaseから得る残時間だけで、新しい起点を作らない。
- sole native consumerのpre／post guard内でprivate source受理まで行い、その後に元floor／失効を再検査する。公開diagnosticからreceiptを作らない。nativeとsourceで同terminalを二重に消費せず、source境界のreceiptは同class生成元の一度限りhandoffとする。
- session停止はsource consumerとnative ownerを同期失効する。停止後もND-02と同じ元floorまでcleanupをjoinし、固定解放・session close後のsummaryだけを返す。native HTTP／cleanupとsession内部／公開理由を別々に残し、失敗時の未公開draftは破棄する。seal後の成功履歴を再び継続へ使わない。

draft-0.8のレビュー修正：native側のcleanup floor到達（`deadline_exceeded`／`cleanup_deadline`）を、そのままsessionの公開理由にしていた。floorは試行窓の下限で全体60秒期限ではないため、canonical残時間が0でない限りsessionへは`upstream_unavailable`として渡し、SA-02のfloor検査と同じ分類にした。native上位診断の`deadline_exceeded`は別層としてそのまま残す。canonical期限そのものに到達した場合は従来どおり`deadline_exceeded`。

**制約**：一度限りの内部friendはSA-02同様に配布物からdeep importされ得る。取得先は新規fake runと固定throw fetchだけだが、trustedなfake driver callbackを受ける試験境界である。任意のdriverをnative issuerの証明に使える本番境界ではない。公開entryはdriver／callback／cleanup指定を拒否し、正式発行口・既存MCP／legacy経路に接続しない。

ND-03でいう観測前owner結合は、親bytes／注入resourceの観測前を意味する。ND-03時点ではconstructor以前のowner予約を変更していなかった。後続EF-02で純粋construction shell・保護区間と失敗copy回収を追加し、生成前の失敗はnative診断nullのままconstructor_diagnosticへ保持する。commit後のrun停止をconstruction failureへ混ぜない。EF-03の開発assemblyへ移した後もND-03の実class保証をそのまま継承したとは報告しない。実認証・実URL・ReleasePermit・選択payload／workerへのruntime接続は引き続き別工程。

[連続試験](../tests/review/native-session-composition.test.ts)、[private境界試験](../tests/review/native-session-boundary.test.ts)、[compiled fixture](../tests/review/fixtures/compiled-native-session-composition.mjs)、[検証記録](E2E_BEST_PRACTICE_NATIVE_DIAGNOSTIC_ND03_2026-10-31.md)を参照。fallback・正式発行口・全体受付は有効化しない。
