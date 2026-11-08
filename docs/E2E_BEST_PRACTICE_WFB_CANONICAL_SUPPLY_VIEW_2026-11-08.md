# WF-B：同canonical fileのregistry・供給表・非実行view準備の合成検証

Date: 2026-11-08 / 実装基準HEAD: `98702a9` / [差分設計draft-0.4](BEST_PRACTICE_WFB_CANONICAL_SUPPLY_VIEW_DESIGN.md)。

## 実装範囲

設計§9手順2だけを合成依存限定で実装した。共通module内のCanonicalSupplyAssemblyが、同C constructionのprepared／borrowから正規registry・原順序の全file供給表・非実行declaration viewを構築する。追加の薄い入口は`tests/review/fixtures/canonical-supply-view-fake.ts`で、固定selectorの診断factoryだけを返す。

既存CStartAssemblyにはmodule-private継続を設定するstatic blockだけを追加した。private prepared／Snapshot／Borrowを直接参照するが、exportやfacadeへ参照を返さない。旧公開診断・別root・再decodeした値から正規ownerを作り直さない。B本体、旧Cのinstance field・既存method本体、strict SourceMapDraftは変更していない。

composition moduleの診断factoryは新しいcreateCanonicalSupplyViewFakeを含む3つになった。旧B／C-startの3入口のexport集合・関数参照・facadeは維持する。新facadeもcheck／begin／prepare／prepareSupply／close／finish／inspectのみで、表・viewそのもの、移譲claim／take／execute操作は返さない。src・配布manifest・設定・実transportは変更していない。

## 同一性・一度限り準備・停止

- 同Snapshotのstrict検査済みmap／files／rows、同owner／setId／prepared／borrow／session origin／budget originを非公開envelopeに保持する。新rootのstrict検査・Snapshot・session／budget origin生成は各1回で、実budgetではない。
- 正規registryを候補表とは別に生成・固定する。全4fileのcanonical参照・ordinal・source origin・SourceRecordを原順序で対応させ、候補表から期待する対応を作り直さない。
- table／viewの発行済み同参照と、各bindingのcanonical参照／ordinal／origin／record、declarationとbindingの参照をpostで検査する。同じabc内容を持つfile間の交換も拒否する。scalarの期待値cacheはなく、宣言は同canonical fileを参照する。
- 準備claimはunused→preparingの同期置換で1回消費する。二重／再入準備は新しいduplicate_preparation診断を保持し、元C lifecycleも停止する。失敗後にunused・新origin・第2budgetへ戻らない。
- registry／binding／declarationの部分生成物はprivate building slotへ直ちに保持する。失敗時に通常参照・発行済み参照と共に固定clearし、同rootの非実行終端／borrow退役後、失敗Snapshotを退役する。正常discardではreadonly用Snapshotを保持できるが再準備は不可。
- 正規closeはsupply_closedとして混入と区別する。source／owner生成失敗は親supplyFirstと読取unusedを保持し、開始claim前のcloseでreadStopを新設しない。resource cleanupは全caseでnot_startedであり、参照clearを解放確認にしない。

## 独立対照と初回失敗

新試験は正常な4file準備から始め、入口未作成のmodule-not-foundを確認した後に実装した。record交換・途中生成故障・envelope／表混入・source形状・退役条件も、対応前の失敗を確認しながら追加した。これらは未登録selectorを含むREDであり、条件の感度は別のcompiled変異対照でも確認している。

供給追加後のcomposition export集合検査で、Vitestの変換後は宣言順、native ESMでは名前順に列挙されることによる1件の失敗を観測した。検査対象はexportの集合なので、unit側だけsortして完全な3名のallowlistと比較するよう訂正した。native compiled側も同じ3名を明示検査し、旧入口の単独export検査は維持した。旧APIを変更して合わせたものではない。

| 対照 | 確認内容 |
|---|---|
| 正常4file／12row | 原順序F01／F02／O01／T01、未参照fileも保持、全rowのunimplemented／missingCount1を維持 |
| 混入28種 | record交換に加え、owner／Snapshot／setId／map copy・再decode・raw map／files・rows・file copy／ordinal／session／budget／borrow／prepared差、missing・duplicate・extra・順序差・legacy File、origin／record組交換、table／view copy・別rootを拒否 |
| source6形状 | 宣言3にactual0／2／4、同長abd、before後の縮小／伸長scriptを構築可能。identity準備だけが成功し、hash未確認を維持 |
| 生成17prefix | envelope・origin・各registry／binding／declaration・table・view・postの固定故障。独立event oracleで生成計数を照合 |
| 失敗後停止／寿命 | 参照clear済み・borrow保持中をfinish前に確認。反復操作で計数を増やさず、borrow→失敗Snapshotの退役順を保持 |
| 625操作列 | begin／prepare／prepareSupply／close／finishの長さ4の全列。準備claim≤1、records≤4、table／view≤1、退役event≤3、終端不変 |
| caller拒否 | Proxy／callbackを実行しない。別root・有効そうな公開summary・旧B結果から再採用しない |

`canonical-supply-oracle.ts`は本体・LIMIT・registry生成関数をimportせず、17個の意味イベント列から成功した生成prefixの計数を独立に求める。これは局所的な生成計数で、全work／heap上界・実費会計ではない。負対照の再decode／別root等の補助object生成を正規counterに加算していないため、これを全確保量と呼ばない。

## compiled保証・互換性・梱包

従来のscratch ESM方式を保ち、旧8種の宣言／actual変異と75件gridを引き続き実行した。追加の6変異は、source record照合の省略、canonical参照をID一致へ弱化、未発行viewの受理、準備claim再利用、部分参照のclear省略、actual長をbinding条件に混入、である。全変異位置の一意性と条件不成立を確認した。

旧Bの本体（先頭コメントを除く）と旧C-startのfield／既存method本体は基準HEADと一致する。旧factoryを別compileして、B全66selectorの完走・0〜12step後finishの計924通り、C-start全25selector×625操作列の計15,625列をdeep比較し一致した。新しいmodule-private継続のstatic定義・新rootの局所計数を、旧moduleの全初期化費不変という保証にはしない。

| 検証 | 結果 |
|---|---|
| 新規canonical供給準備試験 | 13件成功、失敗0（上記のmatrix／全prefix／625列を含む） |
| 関連合成回帰 | 21file、1,379件成功、失敗0 |
| 旧B／C-start直接比較 | 924通り／15,625操作列が一致、C照合点78,125単位 |
| npm run build | 成功 |
| strict TypeScript | 変更本体・新入口・oracle・新試験・export試験、noUnusedLocals／noUnusedParameters込みで成功 |
| ESLint | 変更・追加7コードfileでエラー／警告0 |
| compiled-declared-actual.mjs | 旧8変異＋新供給6変異、75件grid、旧3＋新1入口のexport／factory参照を確認 |
| package-http-classification.mjs | 全体成功。全既存compiled対照を含めて実行し、新供給対照も成功 |
| 同scriptのoffline梱包dry-run | 441file、tests／composition／新入口／診断factoryの混入なし。7markerのseeded漏えい対照も成功 |

関連対象はcanonical-supply-view／composition／declared-actual／kernel-extraction／snapshot-read-start／capacity／B／A／source-map-supply／source-map-values／carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-store。全repository回帰は未実施。期限・cap・旧B／C-startの期待値は変更していない。

## 未実装・Unknown・停止線

SourceRecord／table／viewはprivateな合成値であり、SourceOps instance・handle・scratch・hash・実予算／clockをC側へ生成していない。open／read／hash／cleanupは0、transferClaim=not_issued、readKernel／actualBudget=not_connectedを維持する。sourceShapesのactualBytesは初期可視長の診断で、受信／hash結果ではない。

次工程の下位移譲claim・pending／非実行holderとその受理／失敗責務は未実装。C→kernel実行、同実budget／stop／非空custody接続、行hash集約・接続全体のguard／work／heap／native費・実E／Sは未確認。opaque budget originの一致を実会計の共有済み証拠にしない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。移譲claim・C実行・実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行っていない。今回の変更は未コミット。

## コミット前の対象限定再検証

上記「未コミット」は記録作成時点の状態。今回の12ファイルだけをindexへ登録し、そのindexを新しい一時作業ツリーへ展開した。依存node_modulesへの参照だけを加え、元の未登録変更・既存distを取り込まず、同候補で再検証した。

- npm run build: 成功。
- 関連21ファイル: 1,379件成功、失敗0。期限・cap・旧B／C-start期待値の緩和なし。
- strict TypeScript（noUnusedLocals／noUnusedParameters込み）、変更・追加7コードfileのESLint: 成功。
- package-http-classification.mjs: 全体成功。旧8変異＋新供給6変異、75件grid、旧3＋新1入口のexport／factory参照互換も成功。
- 同scriptのoffline梱包dry-run: 441file、tests／composition／新入口／診断factoryの混入なし。7markerのseeded漏えい対照も成功。
- 対象4文書のローカルリンク34件・末尾空白、indexの差分形式: 正常。

追記は検証結果だけで、検証済みの実装・試験は変更していない。移譲claim・C実行は追加せず、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。実接続・実通信・設定変更・Pushは行っていない。
