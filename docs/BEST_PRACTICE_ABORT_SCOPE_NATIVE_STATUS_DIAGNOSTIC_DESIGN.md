# AU-BR-006：native status証拠の発行元・上位診断ownerの対設計

Version: br006-native-status-diagnostic-draft-0.2 / Date: 2026-10-31。
Status: **詳細設計案のみ。実装・fallback有効化・実sessionへのnative採用・実接続・実通信は行わない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。**

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

本書は①native発行元と②上位診断ownerを対にした設計のみ。200限定guard・正式発行口閉鎖・Unknown・全体受付無効・調査保留を維持し、fallback有効化・実接続・実通信・実機操作・設定変更・Pushを承認しない。
