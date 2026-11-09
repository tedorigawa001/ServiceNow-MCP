# WF-B B-02：一度限りenter・同grant捕捉・同dutyの責務保持

Date: 2026-11-10 / 基準HEAD: `30d91c0` / 未コミット差分の合成検証。

対象は[(B)接続差分設計](BEST_PRACTICE_WFB_PROBE_GRANT_EXIT_DUTY_DESIGN.md)のB-02だけ。正式発行口・body起動・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。内部の合成grant候補は最大1発行するが正式permit／実writer権限ではない。実接続・実通信・設定変更・Pushなし。開始時は作業ツリーがクリーン。runtimeコード・設定は変更していない。

## 実装範囲

新`createProbeGrantCaptureFake`だけが同root・同start／wrapper・既存RunLink／cell束／dutyを使い、enterの利用開始と候補発行・provisional捕捉・照合まで進む。旧(A)・B-01・旧facadeは閉鎖状態とexportを維持。compositionの試験用export一覧に新factoryを追加した。grant／owner／任意bodyを外部から登録・採用する口はない。

claim前後、試行前／試行開始後／発行元保持後、capture前後、validate前後の9点を固定する。同useとdutyを同期更新してから試行を開始し、issuer参照保持→current／receiver-issued捕捉→同一性検査の順序を守る。正常時はentering／provisional／owedで停止し、activeには進まない。body／旧generationFrame／旧finally／requestは呼ばず、旧seed拒否も維持する。

故障・不正候補・停止時はfirst・位置・使用済みclaim・既知参照・未知責務を保持する。捕捉前に発行元が保持した参照は同ownerに残す。cellの既知issued／拒否候補を上書きして捨てず、未使用へ復元しない。rootとstartが同じdutyを保持することを診断し、固定unwind未試行のattemptUsed=falseと責務ありを分離する。closeも固定stop latchだけで、回収claimや解放には進まない。

## 最終実行結果

| 検証 | 結果 |
|---|---|
| 新probe-grant-capture試験 | 47件成功 |
| 関連21ファイル | 1,359件成功、失敗0 |
| 新compiled-probe-grant-capture | exit 0、14grant identity・reentry／duplicate・発行元／非返却／同duty保持・projection3・停止guard・body trap |
| 旧compiled12本 | 全てexit 0（B-01の状態16対照・semantic型拒否6件を含む） |
| `bdo npm run build` | exit 0 |
| composition＋新試験strict TypeScript | exit 0 |
| 梱包dry-run | exit 0、441ファイル、tests／新fixture／composition fixtureの混入0 |

関連試験はprobe-grant-capture／probe-run-preparation／probe-frame-preparation／canonical-gate-draft／writer-gate／canonical-supply-construction／journal-supply-shell／absence-journal／canonical-supply-transfer／capture-admission／canonical-supply-view／pending-binding／pending-construction／read-hash-capacity／read-hash-declared-actual／read-hash-kernel-extraction／read-hash-fake／retirement-start／snapshot-read-start／snapshot-read-composition／supply-boundary。`bdo npx --no-install vitest run`へ各`tests/review/<name>.test.ts`を指定した。全repository回帰は今回未実施。

旧compiledはprobe-run-preparation／probe-frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの各`tests/review/fixtures/compiled-<name>.mjs`を`bdo node`で実行した。旧判定を緩めず、新factory追加に伴うcomposition export一覧だけを更新した。strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-grant-capture.test.ts`。

梱包は一時cacheを指定した`npm pack --dry-run --json --ignore-scripts`を`bdo node`の固定検査から呼び、返されたファイル一覧を検査した。archive生成・設定変更・公開は行わず、一時cacheはfinallyで除去した。

## 独立oracle・compiled対照

9観測点の順序を本体からimportせず、独立配列の添字からclaim使用、試行開始、候補発行、current捕捉、検査完了のprefixを導出した。故障9点＋stop9点でfirst・全保持boolean・sameDuty・責務あり・未試行unwind・body未開始を検査する。失敗後prepare／enter／check／checkLegacy／closeは同じ固定返答を返し、prefixは変わらない。同期再入9点ではenter_in_progress・副作用追加0・first不変を確認した。

grantのbrand＋10field、current／receiver-issued／発行元参照のcopy、余剰fieldを固定不正候補で拒否する。current／receiver-issuedを同値copyに揃えて発行元参照だけ不一致とする対照と、receiver-issuedだけcopyの対照を分け、等価な二重比較でmaskしない。全14条件の単独compiled変異を外すと、元のvalidate拒否からgrant_captured_body_closedへ進むことを確認した。これはbody資格やformal証拠の発行成功ではない。

compiledではさらに、同期再入guard・重複enter refusal、発行元保持の除去、claim払い戻し、receiver側duty参照消失を検出した。発行元保持の対照は発行後／current捕捉前の故障でissued参照が失われる差を測る。private grantが実在する状態でcurrent／issued／duty-linkのboolean projectionを実参照へ戻す3変異も検出した。停止guard単独除去ではstop_issue_beforeが閉鎖されず捕捉まで進む差を検出した。旧body開始直前のthrow sentinelをscratchだけへ挿入して、enter後のcheck／旧prepare経由でもそこへ到達しないことを確認した。負の対照でもbodyは起動しない。

preflightの同link／同dutyコピー拒否は合成故障試験で確認した。既存root・startには重複した同一性防御があるため、それら全節の単独compiled変異検出を今回の保証とはしない。新しいgrant照合14条件の単独対照と、既存B-01の状態16対照は区別する。

公開返答のgraphは固定plain data・freeze・primitive終端・symbol／getter／関数なしを検査した。実tokenや実sessionを使わず、runtime friendや登録口も追加していない。不正引数・Proxy・callbackを実行せず拒否し、旧rootの状態が新rootによって変わらないことも確認した。

## 初回の問題と修正

初回strict検査は6件を検出した。前段でemptyと絞ったgrant slotを別helperでprovisionalへ更新した後、TypeScriptが元の絞込みを保持してrejected代入を拒否した1件と、内部root返答のfirst:stringを狭いcapture返答へ返す型不一致5件である。前者は正規cellを受ける固定rejected保持helperへ分離、後者は内部呼出しに必要なok／dispositionだけの返答境界へ修正した。unionの不正組合せやpublic firstの固定値projectionは緩めていない。再実行でstrictエラー0。

新compiledの最初の実行では、再入guard除去時に内部のduplicate_enterが公開reentryへそのまま出ると誤って期待して1件失敗した。実際はallowlist projectionがその値をnoneへ固定し、別のrefusalにはduplicate_enterが残る。製品を変更せず、reentry=noneとrefusal=duplicate_enterの両方でguard除去を検出する対照へ訂正し、再実行で成功した。期限・旧試験の判定は変更していない。

## 責務・未接続範囲

grantAttemptsは試行開始点の計数であり、実constructor完了数ではない。試行後未返却・未捕捉を「不存在」にせずunknownObligationを保持する。grantIssuesは内部候補発行数で、不正field対照の候補も含む。正常でもactive／revokedではなく、dutyはowedで同ownerに保持される。故障後のunconfirmedも責務消失ではない。

BE05／06、固定exit guard、局所退役、body帰還／throw／取消、退出候補・accepted同期確定、request実合流・回収claim・drain、実writer／Journal／root終端は未実装。B-03が先行firstに妨げられず同dutyの固定exitを処理する私的継続は別途必要で、固定失敗返答を解除する再開口にはしない。実OOM・layout・実費目・総guard／projection上界・実E／S・runtime停止はUnknown、全体受付は無効のまま。

## レビュー修正（2026-11-10）

レビュー基準HEAD: `ba84ea4`。修正前は全体327ファイル・16,606件成功。

指摘：
1. `retainProbeCaptureFailure()`は使用開始後の失敗を理由・境界によらずuse／duty／exitをunconfirmed、grant試行後はgrantもunconfirmed／unresolvedへ集約していた。設計§7（BE01後・BE02前はowed duty＋正規未発行checkpoint、provisional拒否は正規履歴の範囲で固定退役）・§6・BG07の区別に反し、current／issued／rejectedを全保持する`grant_*`拒否でも`unknownObligation=true`、`stop_claim_after`等の既知停止もunconfirmedとなった。状態関係ではunconfirmedが終端のため、B-03で退役可能な既知grantを退役不能にしていた。
2. 到達しない防御条件：start側preflightの事前状態4種（duty state／attemptUsed、use、body／exit）、start側stop前段、root側の状態・binding再確認2種。`cells.diagnostic.first`はprojection外で観測できない。

修正：
- 失敗prefixを3分類にした。constructor呼出し前は`claimed_not_issued`（entering＋owed＋grant empty）。issuerが候補を保持していれば`grant_known`（未捕捉ならcellへ同参照を補足、provisional・unresolved=false・duty owed、拒否候補保持）。constructor呼出し後に返却を捕捉できない場合だけ`grant_unknown`（use／duty／exit／grantをunconfirmed）。claim前は`not_claimed`。stopと同期faultも既知境界なら同分類。
- `#grantCallStarted`をconstructor呼出し直前に立て、`issue_attempt`（呼出し前）と`issue_throw`（呼出し後未返却）を区別する。
- projectionへ`capture.prefix`を追加した。
- 9観測点×fault／stopの期待値、`grant_*`14種、`issue_throw`の期待値を上記分類へ直した。compiledの払い戻し禁止対照を新しい既知prefixへ移し、既知prefixの集約変異と、未知を既知と誤分類する変異の対照を加えた。

RED：更新した33件が修正前に失敗した。GREEN：関連3ファイル193件、compiled全本成功。

一時変異（試験後に元へ戻した）：今回の修正点への6種（既知の集約、current補足漏れ、既知のunresolved化、未知の既知化、未発行の集約、prefix未記録）を全検出。既存の10種は検出2・到達しない防御条件8（上記2）。

全体回帰：`npm run lint`・`npm run build`・`package-http-classification.mjs`成功、vitest全体327ファイル・16,606件成功（既存試験の期待値更新で件数不変）。

## コミット前の対象限定再検証（2026-11-10）

B-02の9ファイルだけを明示してindexへ登録し、index全体を一時ディレクトリへ展開した。対象9ファイルの内容hashがindexと一致することを確認し、既存node_modulesだけを借用した検証用コピーで上記のbuild・strict・関連21ファイル1,359件・compiled13本を再実行し、全てexit 0。梱包dry-runも441ファイル・fixture混入0だった。全repository回帰は今回も未実施。最終追記は本節だけで、実装／試験の内容は再検証時から変更していない。他の作業差分・実接続・実通信・設定変更・Pushは含めない。
