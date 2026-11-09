# WF-B：正規gate先行生成・SS03結合・非実行draftの合成検証

Date: 2026-11-09 / 基準HEAD: `50a7d6f` / 実装時の作業中差分を検証し、末尾にコミット候補の隔離再確認を追記。

対象は[正規gate／継続入口設計](BEST_PRACTICE_WFB_GATE_ROOT_CONTINUATION_DESIGN.md)の実装分割(1)だけ。正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushなし。

## 実装と所有境界

同composition内の新rootが固定37段階で先行shellと空holderを保持し、gate→seed→既存issuer／同start／binding→正規target→pin→非実行draft→未使用継続slotを構築する。同seedのprivate捕捉と、既存owner／pin／claim／scope／epoch／packet参照を照合する。新epoch・第2issuer・外部artifact登録・任意callbackによる補完はしない。旧factoryの挙動・旧試験は維持する。

失敗時は最初の理由・段階・境界・捕捉prefix・未確認attemptを保持し、同rootの再生成を拒否する。構築中再入はrefusal、構築中closeはdeferred、失敗後は同じ固定返答を返す。late closeでも参照は退役／破棄しない。これは将来の退出・固定回収の保証ではない。

draftは関数を持たず`probe_only`／`executable=false`、継続slotはunused。公開APIはprepare／check／close／inspectだけで、checkは`blocked_frame_execution`を返す。frame実行・grant発行・実writer・Journal供給・admission消費・packet生成・closed証拠・root終端は未接続。inspectのゼロ値だけで操作不在を証明せず、呼出し経路と公開境界も差分確認した。

## 実行結果

| 検証 | 結果 |
|---|---|
| 新`canonical-gate-draft.test.ts` | 200件成功 |
| 関連18ファイル（下記） | 1,166件成功、失敗0 |
| `compiled-canonical-gate-draft.mjs` | exit 0、identity29条件＋target preflight負の対照 |
| 旧compiled対照9本 | 全てexit 0（下記） |
| `bdo npm run build` | exit 0 |
| 新試験・compositionのstrict TypeScript | exit 0、エラーなし |
| npm pack dry-run | exit 0、441ファイル、試験fixture混入0 |

関連試験はcanonical-gate-draft／writer-gate／canonical-supply-construction／journal-supply-shell／absence-journal／canonical-supply-transfer／capture-admission／canonical-supply-view／pending-binding／pending-construction／read-hash-capacity／read-hash-declared-actual／read-hash-kernel-extraction／read-hash-fake／retirement-start／snapshot-read-start／snapshot-read-composition／supply-boundary。`bdo npx vitest run`へ各`tests/review/<name>.test.ts`を指定した。全repository回帰は今回未実施。

旧compiledはcanonical-supply-construction（17binding）／journal-supply-shell（11binding）／writer-gate（20identity）／absence-journal（6binding・11legacy clear等）／capture-admission（22binding・5root gate）／retirement-start（9frame claim）／pending-binding（9binding・5retention）／pending-construction（16slot/scope・6lifecycle・12prefix）／declared-actual（75 source grid等）の各`tests/review/fixtures/compiled-<name>.mjs`を`bdo node`で実行した。新exportによるcomposition一覧のみ更新し、旧互換facade一覧は変更していない。

strict検査は`bdo npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/canonical-gate-draft.test.ts`。compiled試験は隔離scratchをfinallyで除去する。梱包は一時cacheで`npm pack --dry-run --json --ignore-scripts`の一覧を検査し、全`tests/`・新gate／旧composition／WriterGate fixtureが含まれないことを確認した。archive生成・依存導入・配布worker起動は行っていない。

## 独立oracleと拒否段階

- 37×4=148の構築故障を本体の段階表からimportせず、添字とbefore／attempt／after／doneの意味からprefix・捕捉数・全後続未開始を導出した。停止後prepare／check／closeが同一固定返答を返し参照を保持することを確認した。
- seed5＋受領先issuer／start／bindingの同値copy3はphase33、旧owner／claim／pin・scope・issuer状態14はphase34、pin11はphase35、draft10はphase36で拒否する。後段guardの拒否を前段保証と数えない。
- 新compiled対照はseed5・pin11・draft10・受領先private seed3の計29条件を単独で外すと、元の拒否が構築postまで進むことを検証した。各mutationの置換位置は一意性を検査する。別途targetの初回guardだけを外すと、scope混入はpin発行前phase34拒否からpin保持後phase37拒否へ変わる。最終冗長guardを成功対照と誤認しない。
- 不正factory入力・Proxy・callbackを実行せず拒否、旧root／純粋WriterGateのstate不変、重複prepareと再入refusal、開始前close・構築中close・late closeを検査した。

今回記録した実行はすべて成功。初期実装中の局所検査を全回帰と同一視せず、上表は最終差分への再実行結果である。

## 残るUnknown・未実施

GC06〜09の実frame enter／exit・grant・request合流、全writer停止、Journal封印／供給、admission／packet／field clear／root終端、実確保layout・実OOM・shell以前の診断必着・constructor未捕捉部分生成の全参照回収・実E／Sと全体work上界は未確認。37は構築産物slot数であり、実allocation数・work料金ではない。純粋fakeやこの新assemblyの成功をruntime保証・実費目確認済み・全体受付許可へ昇格させない。

## レビュー修正（2026-11-09）

レビュー基準HEAD: `fb02aab`（設計`50a7d6f`も照合）。修正前は全体324ファイル・16,413件成功。

指摘：構築frame内closeの返答（`deferred_frame`）が未確認だった。`close_in_frame`試験は最終`first='closed'`・保持32だけを見ており、frame内deferを外す変異が最終状態の一致で生存した。

修正：`closeInFrame`診断を追加し、試験で`deferred_frame`を確認する。到達しない二重防御4種（draft照合内の`g.matches(pin)`、gateの`#bound`二重bind guard、`issue()`の重複guard、`check()`再照合）を設計§9へ明記した。

RED：更新した1件が修正前に失敗した。GREEN：新規200件成功、compiled 29＋早期target対照を維持。

一時変異（試験後に元へ戻した）：計10種、検出6、等価4。検出はissuer seed連鎖、開始前close、重複prepareの固定化、frame内closeの確認、post再照合（compiled）、今回のframe内close defer。等価は上記の到達しない二重防御4種。

全体回帰：`npm run lint`・`npm run build`・`package-http-classification.mjs`成功、vitest全体324ファイル・16,413件成功（更新は既存試験への期待値追加で件数不変）。

## コミット候補だけの再確認

同日、HEAD＋今回の8ファイルだけを一時index／一時object領域でtree化し、隔離directoryへ展開した。既存node_modulesだけを参照し、依存導入は行っていない。検証対象treeは`f20da9031a253f90f8c0b05c8c347f7a3a4023ca`（本節追記前）。そのコピーでbuild・strict検査・上記18ファイル1,166件・新旧compiled10本・梱包dry-runを全て再実行し、exit 0。梱包441ファイル、fixture混入0を再確認した。本節以外の候補内容が検証treeと一致することをコミット前に照合する。

隔離コピー作成時、最初はGit object領域への書込み制限、その後はarchive出力をメモリ捕捉する処理の既定buffer上限で停止した。製品／試験失敗ではなく検証準備の失敗。一時object領域とarchiveの直接ファイル出力に切り替えて解消し、製品コード・期限・試験条件・設定は変更していない。通常indexと作業中変更はこの準備では更新していない。全repository回帰・実接続・実通信・Pushは行っていない。
