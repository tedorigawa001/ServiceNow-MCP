# WF-B：固定source対応表・内容hash照合・未実装行の詳細契約

Version: draft-0.3 / Date: 2026-11-07 / 読み取り照合基準HEAD: `8f27eac` / レビュー修正の基準HEAD: `82ac0cb` / 純粋値検査実装基準HEAD: `c3b3b03`。

draft-0.3: §9のstrict内部型・純粋検査を合成依存限定で実装した。実sourceの辞書pin／hash照合・実施点対応の確認は未実施。[検証記録](E2E_BEST_PRACTICE_WFB_SOURCE_MAP_VALUES_2026-11-07.md)。§4〜§8の将来手順は、この値検査の成功だけでは実施済みにならない。

draft-0.1のレビュー修正: 内容hashの置き場所を固定ファイル辞書だけとし、親設計の「行ごとのhash」を改めた（§1）。照合結果を全体の成否1つから、hash／mapping／implementationの3軸へ分けた。未実装行が残っていても、hashの一致を報告できるようにするためである（§5）。作業中変更での停止をGitの状態ではなくhashの一致で判定するようにし、対応記録自身の完全性はレビューに任せると明記した。SC01に`SyntaxMeter`を加え、改行の変換を止める設定を実装時の要件とした。設計のみで、実装状態は変わらない。

Status: **合成DATAのstrict内部型・純粋検査のみ実装。実source対応台帳の供給・hash検証器・coverage証拠は未実装。** 親は[固定schedule／carrier設計](BEST_PRACTICE_WFB_SCHEDULE_CARRIER_SEED_HANDOFF_DESIGN.md)と[seed bootstrap設計](BEST_PRACTICE_WFB_SEED_BOOTSTRAP_DESIGN.md)。現行のcarrier／coverage値検査を変更せず、その値から分からない対象sourceと実施点を別の対応記録で固定する。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実装済みは§9の純粋値検査だけで、本書は実sourceのhash照合・S発行・core接続・実接続・実通信・設定変更・Pushを承認しない。既存K0／E fakeの5 unit、旧102／57／239と398、既存19項目planを変更しない。

## 1 何を照合し、何を証明しないか

内容hashは「レビュー対象と同じファイルbytesか」を判定するだけである。symbolの存在・処理順序・費目所有・全経路coverage・実行時identity・native費をhash一致だけで証明しない。Git HEADは読取り基準の説明に使うが、行の内容hashには使わない。台帳自身を含むコミットhashを埋め込む循環は作らない。

現行`inspectCoverageLedger`はsourceRevisionという64桁値の形式だけを検査し、対象ファイルを特定しない。全行のgapsはruntime_coverage／native_cost／source_mapping／ownership／cost_boundの5項目を必須とする。この契約を無断で緩めず、本書の対応表や将来のhash成功を既存strict値へcompleteとして書き戻さない。

内容hashの置き場所は§4の固定ファイル辞書だけとする。親設計の`sourceRevision`は形式を検査するだけの値で、辞書のhashとの照合に使わない。両者が食い違っても検出の対象にせず、どちらも検証済みとは扱わない。

対応記録と検証器自身は辞書に入れない。入れると、記録が自分のhashを含む循環が起きるためである。したがって、sourceと期待hashを同じ変更で書き換えた場合は、この照合では検出できない。記録の完全性はコミットのレビューに任せる。

`mapped_unverified`の先に、確認済みへ進む状態はまだない。実施点対応の検証方式と、親設計の`gaps`を緩める条件は、後続の設計で一緒に定める。それまで親設計のready条件は満たされない。

## 2 固定ファイル辞書：現時点で存在する参照先

pathはすべてrepository rootからの相対path。以下は読み取った参照先であり、まだhashをpinしたmanifestではない。

| ID | 固定path | 役割と確認したsymbol／境界 |
|---|---|---|
| F01 | `tests/review/fixtures/raw-json-boundary.ts` | 既存raw fixture。readLimits、Meter、SyntaxMeter（T02の経路で生成）、runBoundary。planの検査後にmeter生成・plan64・配賦和検査を行う |
| F02 | `tests/review/fixtures/seed-bootstrap-fake.ts` | 独立数値fake。Assembly.acquireEntry／buildEntry／checkProfile／finish、carriers。実schedule・実allocation・S供給ではない |
| F03 | `tests/review/fixtures/carrier-coverage-core.ts` | 独立値検査。inspectCarrier／inspectCoverageLedgerとrecord／list／subset。pool・issuer・meterは持たない |
| F04 | `tests/review/fixtures/bridge-work-core.ts` | 旧有限recipe計算。calculateBridgeWorkBounds／inspectBridgeReservation。新bootstrap費の実測ではない |
| T01 | `tests/review/raw-json-boundary.test.ts` | F01のbyte境界の既存試験 |
| T02 | `tests/review/raw-json-syntax.test.ts` | F01のsyntax・退役の既存試験 |
| T03 | `tests/review/seed-bootstrap.test.ts` | F02の取得・順序・失敗・終了後拒否の合成試験 |
| T04 | `tests/review/carrier-coverage.test.ts` | F03の20 variant・閉鎖field・Unknown／synthetic行・5 gapsの値検査 |
| T05 | `tests/review/bridge-work.test.ts` | F04の旧recipe・容量・非接続の試験 |
| O01 | `tests/review/fixtures/bridge-work-oracle.ts` | 旧recipe用の独立意味イベントoracle。新SC全行を検証するoracleではない |

実bootstrapのanchor／body／pool／entry owner／S pending／handoffには、採用済みの固定sourceがまだない。F02／F03のsymbolが似ていても、その代わりに採用しない。T01〜T05の存在と過去の成功件数だけで新経路のcoverageを埋めない。

## 3 SC01〜12との初期対応表

「既存参照」は比較材料であり、新しい固定供給経路の実装先ではない。全行の実coverage・費用上界はUnknownを維持する。

| 行 | 既存参照・試験 | 確認できる範囲 | 固定供給経路で欠ける実施点 |
|---|---|---|---|
| SC01 | F01.readLimits／runBoundary／Meter／SyntaxMeter、T01／T02 | 既存plan検査・meter生成・配賦和の実施位置 | 新bootstrapでの同plan／meter継続、取得前native費の境界 |
| SC02 | F02.Assembly.acquireEntry、T03 | fakeの一度取得・容量判定・非refund | 固定anchor供給、実K0の受付primitiveと拒否返却 |
| SC03 | F02.Assembly.buildEntry／finish、T03 | ownerBuilt flagと固定故障の論理状態 | 実owner／診断slot／終端予約の全生成点とpartial alias |
| SC04 | F02.Assembly.checkProfile、F03.inspectCoverageLedger、T03／T04 | fakeの順序、coverage DATAの形式 | 同anchorのbody読取、固定model／coverageのprivate照合 |
| SC05 | F02.carriers、F03.inspectCarrier、T03／T04 | 旧fake carrierと新20値契約を別々に検査 | 新poolの構築・freeze・供給・選択、供給不能と取得前費用 |
| SC06 | なし | 未実装 | S容量検査・未取得draft準備・debit制御、E所有の準備費 |
| SC07 | なし | 未実装 | 同meter／recordのS debitとEntryPending登録のcommit |
| SC08 | F04の旧slot一覧、T05／O01は参考のみ | 旧19 slotのrecipe対応 | 新recipient／固定slotの部分生成、旧slotとの差分 |
| SC09 | なし | 未実装 | 同一性照合・PreparedTransfer準備・単一current切替 |
| SC10 | F02.Assembly.finish、T03 | fakeのcleanupAttempts／creditRetiresと診断 | 実E alias退役、S partial cleanup、同RunCreditSlotの未確認保持 |
| SC11 | F02.result／usage／diagnostics／finish、F03.inspectCarrier、T03／T04 | first reason・二次診断のfake、固定返却値 | 実snapshot／返却準備・pool供給不能・全拒否prefixの費目 |
| SC12 | F02.close／stopped、T03は参考のみ | fakeの終了後拒否 | 実handoff後のentry退役、呼出し終了までの責務保持、C5／C6確定 |

F03の値適合はSC04／SC05／SC11の全処理を実施した意味ではない。F04の有限計算もSC08の生成イベントには数えない。同じ参照先が複数行に現れることを、各行で同じworkを課金する根拠にしない。

## 4 別の対応記録：複数ファイルと未実装を表す

開発専用`SourceMapDraft`を、現行coverage値とは別の版付きDATAとして設計する。draft-0.2までは設計のみで、draft-0.3で§9のschema／純粋検査だけを実装した。実辞書の生成器は未実装。既存行のsourceRevisionへ複数hashを連結して押し込まず、既存APIにfieldを追加しない。

- 固定ファイル辞書はID・path・role（source／test／oracle）・expected SHA-256・期待byte長を持つ。実装する時点でレビュー済み値をpinする。動的探索・glob・caller指定path・ネットワーク取得は使わない。
- 各SC行は必須で一度だけ現れ、実施点ごとのbindingを持つ。bindingは固定file ID、symbol／固定step ID、役割（reference_only／implementation）、phase・費用所有・対象prefix、対応test／oracleのIDを指す。symbolは非export／module初期化も含めて列挙し、行番号だけに依存しない。
- 行の状態は`unimplemented`／`partial_reference`／`mapped_unverified`を区別する。実施点がない場合はimplementation bindingが空でもよいが、missing point一覧を必須とし、unimplementedまたはpartial_referenceのままにする。空集合を全件照合成功と扱わない。
- 1行が複数ファイルにまたがる場合は、全ファイルへのbindingを持つ。producer本体・呼出し元・共有helper・module初期化と、対応する試験／oracleを区別する。主ファイル1個のhashだけで代表させない。
- 辞書はID昇順、行はSC順、各bindingは固定step順。重複ID／同一binding／未知参照を拒否する。共有helperはファイル辞書に1回、各行から参照できるが、費目の所有stepは1つに限定する。排他的経路の再利用は経路付きで明示する。
- 初期の表現上限案は辞書32ファイル、行12件、各行32 binding、各binding8 test参照、path256 ASCII byte・symbol128文字。上限を超えたら切詰めず拒否する。これは将来の検証器を有限化する設計上限で、本番cap・実費上界の承認ではない。導入前に棚卸し結果で足りるか確認する。

未実装ファイルを架空path／空ファイルのhash／0／空symbolで埋めない。hash一致済みの既存参照があってもmissing pointを消さない。固定供給処理ができた際に新binding・費目・試験をレビューする。missing pointを閉じる操作はhash検査器の自動処理にしない。

## 5 内容hashの照合手順と停止条件

1. 対応記録の版を固定する。作業中変更の有無はGitの状態では判定しない。対象ファイルは、bytesが期待hash・byte長と一致するかで判定する。一致すれば作業中でも同じbytesなので、照合を続けてよい。不一致は`content_mismatch`とする。作業中版の調査結果を既承認版の成功として保存しない。無関係な変更は保持し、検証器が自動修復しない。
2. 固定辞書のpathだけをrepository root配下で読む。絶対path・空要素・`.`／`..`・backslash・重複／大小文字aliasを拒否する。symlinkや特殊fileは拒否し、追従しない。将来の検証器の安全な読取実装は別途確認が必要で、今回保証していない。
3. source／test／oracleの実file bytes全体をSHA-256へ入れる。UTF-8 decode・改行変換・BOM除去・整形・コメント除去・transpileをしない。Git blob headerやpathもfile内容hashに混ぜない。byte長も照合する。checkout時の改行変換でbytesが変わらないよう、実装時に辞書の対象ファイルへ`.gitattributes`で変換の停止を設定する。現在はこの設定がなく、`core.autocrlf`も未設定で、CIはUbuntuだけである。予定上限は1ファイル1MiB・総bytes8MiBで、読取前と読取中に制限し超過は拒否する。
4. 各固定file IDの期待hash・byte長と照合する。複数ファイル行は、`reference_only`を含む全bindingの照合が成功して初めて`hash_match`とする。bindingが空の行のhash軸は`not_applicable`とし、`hash_match`と数えない。全体集合digestだけに省略しない。hash集合の文字列連結は行わない。
5. symbol／step対応を別に確認する。コメント中の同名文字列や単なるsubstring検索を実施点の存在と扱わない。非export関数・呼出し点・module初期化・helper境界は独立のsourceレビューと試験へ対応付ける。静的検査の方式自体が未実装ならその確認はunverifiedとする。
6. 結果は全体の成否1つにせず、次の3軸で別々に返す。各軸は、その軸のどこか1か所でも失敗があれば非成功とし、失敗をskipして成功にはしない。成功済みfileの部分結果と、軸ごとの最初の固定失敗分類は保持できる。自動の期待hash更新・fallback・追加source読取はしない。
   - `hash`：辞書の全ファイルのbytes照合。未実装行の有無に左右されない。
   - `mapping`：対応記録の形式と、symbol／step対応の確認。
   - `implementation`：未実装行とmissing pointの有無。SC06／07／09などが残る間は常に非成功で、これは正常な現状である。

将来の固定失敗分類案は軸ごとに分ける。`hash`軸は`source_unavailable`／`source_changed`／`source_limit`／`content_mismatch`。`source_changed`は読取りの途中で内容や種別が変わった場合だけを指し、期待値との差は`content_mismatch`とする。`mapping`軸は`mapping_invalid`／`point_unverified`。`implementation`軸は`row_unimplemented`。raw例外や任意source本文を診断へ出さない。3軸がすべて成功しても、coverage completeやreadyへ写像しない。試験結果は、さらに別の軸として扱う。

内容が変われば期待hashの更新だけで済ませない。該当行・依存する共有helperの全行・費目・成功／拒否／部分prefix・試験を再レビューする。hash pinと実sourceを同じ生成処理から無条件で作り直す試験は独立検証にならない。

## 6 独立検証の受入条件（未実施）

| ID | 必須対照・独立性 | 期待する判定 |
|---|---|---|
| FS01 | レビュー済みexpected bytes/hashと、別途読んだsource bytesを照合。期待値を実行時のactualから作らない | 1 byte・改行・BOM・末尾変更、長さ差を検出 |
| FS02 | SC全12行を独立に列挙したoracle。主検査器から辞書／expected行一覧をimportして期待値を作らない | 欠落・重複・未知行・順序違いを検出 |
| FS03 | 複数fileの行でhelper側だけ変更／欠落／hash交換、同内容でも別file IDへの差替え | 主file一致だけでは成功しない。path・ID bindingも検査 |
| FS04 | 同じhashだが誤symbol／誤phase／誤費目所有／欠けた呼出し点 | 内容一致と実施点対応を分け、unverifiedを残す |
| FS05 | SC06／07／09等の未実装行、空binding、架空source、reference_onlyをimplementationへ付替え | 未実装をpassや0費用へ昇格させない |
| FS06 | 別の意味イベントoracleで正常・拒否・全部分prefixの生成／copy／freeze／診断／clearを計数 | 欠落・二重課金・E/Sへの誤所属・反復上限違いを検出。旧oracleを新SCへ流用しない |
| FS07 | path逸脱・symlink・特殊file・size境界・短読取・読取中差替え・読取失敗。期待hashと一致する作業中bytesと、一致しない作業中bytes | 固定失敗、外部sourceへ追従しない。読取中差替えは`source_changed`、期待値との差は`content_mismatch`。一致する作業中bytesは照合を続ける。注入依存で行い実接続しない |
| FS08 | 一部file成功後の失敗、未知版、未確認native費、古いtest参照。全hash一致で未実装行だけが残る場合 | 部分診断を残し、失敗した軸だけを非成功にする。後者は`hash`成功・`implementation`非成功を区別して返す。5 gaps、Unknown、ready=falseを維持 |
| FS09 | 対応記録・検証器・fixture・oracleの梱包負対照とimport検査 | runtimeへの登録口・fromSummary昇格・K0/E fake台帳共有・S/core呼出しがない |

oracleと本体で固定事実を別記述する際は、その対応表を人が照合する。同じ実装のhelperを両側から呼ぶだけでは独立性を満たさない。hashの独立性は固定期待値との比較、意味・費目の独立性は別イベント表との比較で、別の問題である。

## 7 E要求量・S所有境界への接続順序

最初は固定辞書・各SCの既存参照／missing pointを確定し、複数fileの照合形式と受入条件を承認する。その後、許可された範囲でsource照合を実装・試験する。未実装の固定schedule／carrier供給を完成済みと仮定しない。

実Eの候補式は`E_prepare_upper + max(E_terminal_paths)`のまま。source対応・全反復／slot・全失敗prefixが実装と独立oracleでそろうまで総額はUnknownとする。S pending／handoffが未実装なら、そのE側制御・失敗診断の費用も未導出として残す。Sのprivate結合・debit登録・handoffは後続の合成設計／実装で別確認し、今回発行しない。

K0基底処理、取得前のmodule初期化／carrier供給、native反射／OOM、実heap／CPU／GC／物理解放は別のUnknownである。source hashや合成成功でこれらを0にしない。

## 8 今回の検証範囲

`8f27eac`の固定ファイル・symbol・既存試験を読み取り照合し、このMDと親2文書の参照だけを追加した。内容hashの採取／pin／照合、検証器実装、合成試験・build・梱包試験は行っていない。文書のローカル参照と空白のみを確認する。source対応の成立・実coverage・所有・実E／S上界は未確認のままである。

上記はdraft-0.1時点の実施記録である。draft-0.3の実施範囲は§9と検証記録に分離する。

## 9 strict内部型・純粋検査の実装境界

`tests/review/fixtures/source-map-values-core.ts`を新設。importはnode:utilのproxy判定だけで、既存carrier／K0/E fake・予算・core・fs・crypto・runtimeを使わない。`inspectSourceDictionary`と`inspectSourceMapDraft`は未信頼の合成DATAを切離し／freezeして検査する。任意pathを読む供給口・登録台帳・issuerではなく、§2の実ファイル辞書も生成／pinしない。

共通返値は`authority=none, ready=false, hash=not_checked, mapping=shape_only, implementation=unknown, runtimeCoverage=unknown, nativeCost=unknown, entryRequirement=unknown, seedRequirement=unknown, coreInvocation=not_called`に固定。`ok=true`は形式／参照の適合だけ。`mapping=shape_only`は検査範囲の表示で、実施点対応の成功ではない。不正入力は固定`mapping_invalid`で、入力・例外・path・symbol本文を診断へ出さない。

### 9.1 辞書契約

固定field順は`id, path, role, expectedSha256, expectedBytes`。最大32件、IDはF01〜F99／O01〜O99／T01〜T99の文字列昇順で重複なし。prefixとrole=source／oracle／testを一致させる。pathは1〜256 ASCII文字（英数字・underscore・dot・slash・hyphen）、空segment・`.`／`..`・backslash・絶対pathを拒否し、大文字小文字を無視した同一pathも拒否する。symlink／実file種別は値から判定できず、未検査である。

expectedSha256は64桁小文字hex、expectedBytesは1〜1,048,576のsafe整数、総和は8,388,608以下。hashとbyte長は未信頼の期待値で、空ファイルの代用品・実照合結果ではない。dictionaryは空でもよいが、空からhash成功は返さない。

### 9.2 SourceMapDraft契約

外形の固定順は`model, files, rows, ready, runtimeCoverage, nativeCost, entryRequirement, seedRequirement`。modelは`wfb-source-map-draft-values-1`、filesは上記辞書、rowsはSC01〜SC12を順に1回ずつ、残りはfalseと4個のunknown。

行の固定順は`id, status, bindings, missing`。bindingsは最大32件、missingは最大32個の固定識別子（英字／underscore開始、英数字／underscore、最大64文字）の昇順・重複なし。missingは自由文や0費用ではなく未対応pointのDATA。

| status | bindings／missingの制約 | 意味 |
|---|---|---|
| unimplemented | bindings空、missing 1件以上 | 対象処理がない状態を保持 |
| partial_reference | bindings 1件以上、missing 1件以上 | 参照または一部実装の申告があっても未対応を保持 |
| mapped_unverified | implementation binding 1件以上、missing空 | 対応を申告しただけ。実装確認・coverage・所有を証明しない |

空bindingを完成扱いにした行、reference_onlyだけのmapped_unverified、complete／verified等の未知statusは拒否する。実sourceを読まないため、callerが存在しない処理をimplementationと申告しても、その真偽は確認できない。値適合を発行証拠やSCの不足解消へ昇格しない。

### 9.3 bindingと費目所有

固定順は`step, fileId, symbol, site, role, phase, costOwner, costStep, prefixes, tests`。

- stepは最大64文字の上記識別子。行内はstepの文字列昇順で重複なし。fileIdは辞書に存在するsource roleのF IDのみ。symbolは最大128文字の英字／underscore開始、英数字／underscore／dot／colonの識別列。
- siteはproducer／callsite／helper／module_init。roleはreference_only／implementation。phaseはbefore_entry／entry_prepare／entry_terminal／seed／handoff。costOwnerはbase_unknown／k0_excluded／entry_prepare／entry_terminal／seed／split_unknown。
- prefixesはnormal／refused／partialの固定順で1〜3件、重複なし。testsは辞書に存在するtest／oracle roleのT／O IDを文字列昇順で最大8件、重複なし。implementationでは1件以上必須。試験参照は結果ではない。
- reference_onlyのcostStepはnull。implementationのcostStepは最大64文字の識別子で、全行を通じて唯一にする。行内の同fileId／symbol／site／roleの重複を拒否し、implementationの同fileId／symbol／siteの重複も全行で拒否する。step名だけ変えた二重所有を認めない。
- 共有helperは1か所のimplementation ownerと複数行のreference_onlyで表す。この初版では排他的prefixごとの複数implementation ownerも拒否する。§4の経路付き再利用を有効にするには、排他性・費目集約の別契約が必要。実施点の意味を自動判定して費用を数えるものではない。

複数ファイルの行は複数bindingを保持するが、必要なfileが本当に全部列挙されたかは未確認。未登録ID、role違い、test参照不足・不正順序、同じ主fileだけを別stepで重複させたbindingは拒否する。辞書とrowの照合をしてもhashは一切計算しない。

### 9.4 入力安全性・未対応

plain／null prototypeの固定順own enumerable DATA object、標準prototypeのdense arrayだけを許す。proxyはtrap前に拒否し、accessor・symbol・余分／欠落field・独自prototype・穴を拒否する。出力はnested array／objectを含め切離してfreezeする。反射・copy／freeze・module初期化・OOMの実費上界はUnknownで、今回work課金を追加しない。

FS02とFS05の形式部分、FS03／FS04の参照形式部分を合成確認する範囲に限る。FS01の実source hash、FS03の実helper差替え、FS04の実symbol／phaseの意味照合、FS06の全費目独立oracle、FS07の安全読取、実辞書の承認・改行設定は未対応。既存carrierの5 gapsは変更しない。
