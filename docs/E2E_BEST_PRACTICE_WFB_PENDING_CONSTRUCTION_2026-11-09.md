# WF-B：先行RetentionRoot・unbound pending／failure生成の合成検証

Date: 2026-11-09 / 基準HEAD: `dc41a70` / 対象：[回収基盤設計draft-0.2 §13](BEST_PRACTICE_WFB_PENDING_CUSTODY_RETIREMENT_DESIGN.md)。

Status: 第1段階の独立合成assemblyのみ。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実装した生成claimは下位移譲claimや回収claimではない。source／control結合・payload移動・下位claim消費・detach・holder公開・証拠発行・回収・root finish・C実行・実接続／実通信・設定変更・Pushは行っていない。

## 対象・配置・保証の区別

新しい`tests/review/fixtures/pending-construction-fake.ts`に、private RetentionRoot、construction／retentionの別origin、固定診断／結果slot、生成claim、4roleの空slotとcapture cellを実装した。新moduleはimportなしで、exportは`createPendingConstructionFake`だけ。facadeはprepare／close／seal／inspectのみ。既存composition／source／controlのコードとexportは変更していない。

各slotは同construction／retention／role origin、brand、unbound状態、対応親shell、payload=undefinedを確認する。claimは同参照と両origin、診断／結果slotは両originを独立検査する。固定故障selectorのinputValid=trueはselectorの受付だけを示し、正式な全体受付・owner検査成功ではない。

この保証は独立unbound assemblyのもので、既存の実class内に同source／controlへの結合が入った証明ではない。外部map／bytes／ops／callbackを受領せず、古いfacade／summaryも採用しない。後続のprivate配置と結合では改めて同一性・試験保証を検証し、ここで作った公開診断から実発行物へ昇格させない。

## 生成・捕捉・終了の有限契約

prepare前に先行ownerと診断／結果slot、claim、固定4cellを用意する。scopeと正規claimを検査してclaimを一度だけ開始し、pendingShell→pendingActive→failureShell→failureCustodyの順に生成する。各roleのcellは参照を保持したprovisionalの後、同owner・kind等の検査を通ってconfirmedとなる。

| 固定故障 | 対象roleの記録 | RetentionRootの責務 |
|---|---|---|
| mint呼出し前の故障 | not_created・参照なし | それ以前のconfirmed prefixを保持。未生成をcustody保持済みにしない |
| mint内で参照が返らないthrow | attempting・参照未捕捉 | capture_unconfirmed。見える参照がないことを未生成／回収済みと推測しない |
| 参照格納後、確認前の故障 | provisional・参照あり | 対象slotと先行prefixを保持し、確認bitを立てない |

この3境界×4roleの12prefixを別に数える。ここでsource=not_createdという診断は、実装が元sourceを一切生成しないという事実を指し、slotのattemptingをnot_createdに読み替えたものではない。実source constructor内部や実OOMによる部分生成を捕捉した保証ではない。

失敗・重複生成・生成中再入でもclaimはspentのままで、再生成・slot上書きを許さない。closeは生成前なら停止だけ、生成開始後は先行firstがなければsupply_closedを保持する。先行拒否があれば返答と診断の両方で維持する。

sealは同scopeの固定結果slotへpayload-freeな不変診断を一度記録するだけである。slot参照のclear・回収開始・退役・root finishは起こらない。結果slot／診断scope不一致ならsealも拒否する。封印後のprepare／closeはalready_sealedを返し、seal／inspectは同じobjectを返す。partial prefixも保持し、retirement=not_startedとする。

## unit試験と独立oracle

新規71件：正常1、mint故障4、provisional捕捉故障4、未捕捉attempt4、slot混入36（4role×9条件）、claim／診断／結果scope7、生成中close／再入8、重複・claimless close・診断seal・hook拒否・旧assembly不変の5件、oracle2件。

slot混入はconstruction／retentionの同値copy、role origin、role、state、brand、親shell、空payload用の不正sentinel、同値slot copy。狙うfield以外を同mint内で整合し、copyの場合は正規capture cellと別の候補を渡す。sentinelは空の合成objectであり、通常payloadや実bytesではない。

独立prefix oracleは4roleの順序を本体からimportせず、各故障点より前をconfirmed、対象を上表の3状態、後続をnot_startedと計算する。独立lifecycle oracleはprepare／close／seal／inspectの全3操作列（4³=64通り）について、first・停止・生成済み件数・claim・結果slotを別の状態モデルで追跡する。両oracleとも本体のchecker／slot表／係数を期待値としてimportしない。

既存のsource assemblyを別に準備し、新入口のprepare／close／seal前後で既存assemblyの診断・枠が変わらないことも確認した。ただし、これは同一assemblyに統合した保証ではない。通常payload・source classは新moduleに登場せず、root finishを呼ぶ入口もない。

## compiled・梱包対照

scratch ESMに新moduleだけをcompileし、namespaceのfactory1つとfacade4操作、12prefixを検査した。slot／claim／scopeの単独検査除去16種とlifecycle変異6種（生成再実行、provisional参照消失、未確認のconfirmed化、封印後prepare、結果差替え、後着closeによる先行理由隠蔽）をすべて検出した。unitは全4roleを確認し、共通slot checkerのcompiled変異はpendingShellを代表にする。

梱包確認へ新factory／fixtureの漏洩markerと、依存・runtime・issuer接続に対する固定ソース監査／seeded負対照を追加した。新moduleにはimport／require・runtime操作・既存source factory呼出し・PayloadGoneEvidence発行口を置かない。これは現在の固定ソースに対する検査であり、任意の難読化コードを扱う完全な安全性解析ではない。

既存compiled-declared-actualのsourceGrid75、旧B8・供給6・preflight24＋退役7・境界14＋局所19＋件数3を維持した。新対照の成功をこれらの旧class接続済み・回収済み証拠へ転用しない。

## RED／初回失敗と修正

1. 最初の正常試験は新module未作成でimport失敗。最小の生成経路を追加して成功。
2. mint故障4件、provisional故障4件、slot混入36件、claim／scope7件、生成中close／再入8件は、各固定selector／対応prefixの追加前に失敗。正常／拒否理由だけでなく、inputValid、生成claim0／1、保持／確認件数を確認してGREENへ進めた。
3. 初回strict型検査は#resultのReturnTypeとsnapshotが循環してTS7022／TS7023の2件が発生。明示PendingSnapshot型へ置き換え、同じstrict検査を再実行して成功。anyや検査抑制で回避していない。不正値castは固定故障scriptの内部だけ。
4. 重複生成→closeの返答試験が1件失敗。診断firstは保持していたがcloseの返答を常にsupply_closedにしていたため、先行firstを返すよう修正して成功。対応するcompiled変異も追加した。

既存試験を削除せず、期限・Bのcap／D_stop900／D_end1000／guard131,524も変更していない。

## 最終検証

| 確認 | 結果 |
|---|---|
| 新規unit | 71件成功 |
| 関連回帰 | 24ファイル・1,585件成功 |
| build | npm run build成功 |
| strict型検査 | 新fixture／testのnoEmit・noUnused成功 |
| lint | 変更TS／MJSのESLint成功 |
| 新compiled保証 | 単独16変異＋lifecycle6変異、12prefix成功 |
| 梱包 | offline dry-run441ファイル、既存・新compiled対照、seeded漏洩／依存負対照成功 |

```sh
bdo npx vitest run tests/review/pending-construction.test.ts tests/review/supply-boundary.test.ts tests/review/canonical-supply-transfer.test.ts tests/review/canonical-supply-view.test.ts tests/review/snapshot-read-composition.test.ts tests/review/read-hash-declared-actual.test.ts tests/review/read-hash-kernel-extraction.test.ts tests/review/snapshot-read-start.test.ts tests/review/read-hash-capacity.test.ts tests/review/read-hash-fake.test.ts tests/review/read-ops-fake.test.ts tests/review/source-map-supply.test.ts tests/review/source-map-values.test.ts tests/review/carrier-coverage.test.ts tests/review/seed-bootstrap.test.ts tests/review/bridge-work.test.ts tests/review/value-admission.test.ts tests/review/value-core-detailed.test.ts tests/review/snapshot-value.test.ts tests/review/raw-json-boundary.test.ts tests/review/raw-json-syntax.test.ts tests/review/store-recorder-persistence.test.ts tests/review/store-recorder-binding.test.ts tests/review/fixed-evidence-store.test.ts
bdo npm run build
bdo node tests/review/fixtures/compiled-pending-construction.mjs
bdo node tests/review/package-http-classification.mjs
```

全repository回帰ではなく、上記24ファイルの関連回帰である。梱包確認は実sourceの内容hash照合ではない。

## 未確認・次工程

同source／controlへのbound化、payload-free core／retirable binding、正規SourceRootSlot、8群の実参照保持表、固定回収／未確認保持、PayloadGoneEvidence、root finish→retireFailedは未実装。今回のshell／診断sealをこれらの代替証拠にしない。

先行RetentionRootや診断slot自体の実確保失敗を含む全heap／work・実E／S・OOM時の診断必着はUnknown。捕捉不能なsource constructor内部状態も未確認である。次工程はsourceとのprivate配置・一度限りの結合とcontrol／claim参照の退役可能化であり、下位claim消費・pendingへの通常payload記録・detachはまだ有効化しない。

## コミット対象だけでの再検証（2026-11-09）

今回の9ファイルだけを明示してstageし、index全体を一時ディレクトリへ展開した。既存node_modulesだけを参照し、未stageの作業内容を含めず、関連24ファイル・1,585件、build、新fixture／testのstrict noEmit／noUnused、変更TS／MJSのESLint、新compiled対照（16＋6変異・12prefix）、offline梱包確認を再実行してすべて成功した。梱包441ファイルと既存compiled対照、文書リンク22件も確認した。検証後の追記は本段落だけとし、他のstage内容が検証済みの展開内容と一致することを再照合した。全体回帰・source結合・実通信等は追加しておらず、Pushは行わない。
