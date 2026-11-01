# B-02-03：注入同reader cleanup・private source受理の合成検証

Date: 2026-11-01（JST）。基準：`093b42d`。[詳細設計§9](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_MIGRATION_B02_DESIGN.md)参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。friend撤去・実接続・実通信・PDI操作・設定変更・Pushなし。

## 1 変更範囲と保証区分

- [既存cleanup部品](../src/review/abort-scope-evidence-status-cleanup.ts)の同reader操作・固定factsを、別のEF-03開発resource realmで再利用。旧cleanup／workflow入口のmethod集合と既存台帳は維持し、旧試験を変更・削除・skipしていない。private source proofは新realmのownerだけに結合し、copy／外部診断から発行できない。
- [開発native境界](../tests/support/review/ef03/native.ts)と[root](../tests/support/review/ef03/assembly.ts)で、opaque Response delivery→親bytes→同coreのrelease試行→同reader cancel-only cleanup→同source消費→closeを連続接続。Gは親bytesだけ、release read=0・P=0。final4枠の返却はcleanup join後。
- [開発source](../tests/support/review/ef03/source.ts)は既知ownerの元window／private proofだけを一度消費し、status_consumptions=1へ進む。ReleasePermit／fallback／body ackではない。実classのprivate生成継続・実認証snapshot・実ReleasePermitとの結合保証へ読み替えない。
- 今回はdevelopment-assembly保証と、再利用する注入cleanup部品の保証。旧production-class-fake-I/O試験の成功は別区分で残す。B-ND全caseの対応表、release判断、開発compiled保証、friend撤去・artifact変異は未完了。

## 2 RED／修正・検証上の注意

1. tracerは開発native module未存在でRED。最小接続後に、同readerのread=0、getReader／closed／cancel／release各1回、source status消費1、予約4→0がGREEN。
2. standalone型検査でinternalのinvalid_observation_timeを公開codeへ渡す2箇所がエラー。既存3内部理由と同じinternal_review_errorへ写像し、内部理由は失わない形で解消。
3. source pre-guard拒否後にproofを別途消費できてしまうREDを追加。原因はsource guardより後にprivate proofを取り出していた順序。source開始状態と証拠消費をguardより先に行い、pre／post拒否後の再利用も拒否してGREEN。
4. 故障注入試験のreader退避がlintのno-this-aliasに1件抵触。試験所有の回収用配列へ保持する形に整理し、lintと新規試験を再実行して成功。規則・期待・期限は緩和していない。
5. 初回全体テストは221ファイル・9,771件成功。終了summaryへclosed／revoked状態を明記する最終補足後、その最終コードでも関連・build・型・lint・梱包確認と全体テストを単独で再実行した。2本の全体テストを重複起動していない。

## 3 新規28件の独立確認

[development-native試験](../tests/review/development-native.test.ts)で、実Stream側のcancel回数・locked状態と、固定operation数／factsを照合する。期待C=2、G=入力親bytes長、P=0を別計算し、旧実classの出力をoracleにしていない。

- release403／404のbodyなしは操作0・no_body、bodyありは同readerのcancel／closed／releaseが各1回。hard401、未対応status、cancel拒否、errored streamで診断を保持し受理0。
- 取消後も同cleanupを元floorまでjoin。pending中はadmissionをまだ返さず、確定またはfloor打切り後に返却。whole deadlineとnative取消制御をrun_stopで区別し、late settleで未確認factsを昇格しない。
- Response／streamのrootをまたぐ再使用、raw／copy／proxy delivery、外部cleanup申告、foreign owner／window／proof、診断copy、二重消費、close後の消費を拒否。
- source pre／post guard拒否時もproofは消費済み。source受理0・first reason保持。getterを呼ばないprofile pinと、shadow Response／stream methodを使わない固定操作を確認。
- getReaderがreaderを返す前のthrow、closed取得throw、releaseLock throwを局所module再読込とnative操作境界で注入。unknown所有をconfirmedとせず、known readerだけ回収する。試験側が故意に隠した／解除失敗させたreaderは、試験finallyで別途回収し、製品cleanupの成功数には加えない。
- 親不正・事前取消ではreaderを取得しない。callerが既にlockを所有するreaderも勝手に解除しない。実class2枠・construction・run primary・会計が不変でnetwork呼出し0。

## 4 実行結果

- 関連9ファイル336件成功：新native、development-root／source／bootstrap、旧status-cleanup／status-workflow、native-session-composition／native-diagnostic-workflow、source-status-binding。
- `npm run build`、開発assemblyと新試験のstandalone strict TypeScript検査、変更7ファイルのESLintが成功。
- `node tests/review/package-http-classification.mjs`成功、417ファイル。既存compiled fixtureを維持し、EF-03の新delivery／native scope／proof consumer名も配布JS／宣言／mapにないことを確認。これは開発assemblyのcompiled連続保証ではない。
- 最終全体テスト：`npm test -- --reporter=json --outputFile=/tmp/servicenow-b0203-final-20261101.json`を他の検証終了後に単独実行しexit 0。JSONで221ファイル・9,771件成功、失敗0・保留0・success=trueを確認した。
- コミット前再検証：対象13ファイルを明示stageし、indexだけを`/tmp/servicenow-b0203-commit-20261101/`へ取り出して既存node_modulesを参照。build・standalone型検査・offline梱包417ファイル・文書リンク77件が成功。続けて全体テストを単独実行し、`/tmp/servicenow-b0203-commit-test-20261101.json`で221ファイル・9,771件成功、失敗0・保留0・success=true、exit 0を確認した。無関係な未追跡ファイルは検証コピーに含めていない。

construction teardownのconfirmedはnative cleanupを代替しない。物理解放未確認・残った基底Promise・強制GC／停止の限界はそのまま残す。正確なlayout・work・全体必要量はUnknown、全体受付へ昇格しない。無関係な未追跡ファイルは変更していない。
