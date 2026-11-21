# AP05 G02：ED06／ACK-36 旧PK01の隔離再現・実行前承認票案

Version: release-ap05-g02-ed06-ack36-legacy-pk01-isolated-repro-approval-draft-0.4 / Date: 2026-11-20。

Status: **保持方式を採用。固定旧treeとローカルのNode／npm／依存入力を静的に照合。実行用の隔離・終了観測・数値・保全方式／先は未確定または未承認。旧版の隔離再現起動0、候補未指定・G02未充足・SL01起動0。** [保持方式](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_LEGACY_COMPILED_RETENTION_DESIGN.md)のHのみを扱い、候補Pの入場許可やED06の代替証拠①〜③として扱わない。

## 1 承認票の対象と除外

対象は固定旧commit `32a24ae1947383d89577a18dac77c49ff55b24b8`／tree `60cfcda9554cd6efcfab5560060cb6619ae87ad5`、一回分の隔離root、旧版の空build 1回、無変更の[旧PK01 wrapper](../tests/review/package-canonical-budget.mjs) 1回の案。実行の可否は下記の受付で判定。旧ACK-36を含むsource側42件の別記録は、旧compiledの成功を保証しない。

| 固定順（案） | 許可対象の案・証拠 | 止める条件 |
|---|---|---|
| 1／隔離とpin | 先行保持枠と専用root・一時領域・結果領域を同runに確保。旧treeのsource・設定・元試験、ローカル依存、起動可能な実体の一致を記録 | 別版／不明な実体、既存 `dist`、候補／元作業treeへのfallback、外部通信を排除できない場合はbuild 0 |
| 2／空build | 固定したNode／TS実体、同rootの `tsconfig.json` を使う。旧版から専用の空 `dist` へ一回だけ生成。必要なJS・map・宣言の内容と出力一覧、事後pin・終了四軸を次へ渡す | 不一致、部分出力、終了・保全未確認はwrapper起動0。別build由来の出力で補わない |
| 3／元PK01 | 元wrapperを同旧rootで一回。元コード内の `npm pack --dry-run --ignore-scripts --offline --json` 1回と、元順のcompiled子4本（下記）だけを所定の実行とする | wrapper／子／依存の解決違い、未許可の子孫や外部接続、出力欠落、予約不足で停止。子の部分成功を全体成功にしない |
| 4／退出 | 同runの判定、全子の終了、両stdioと所有stdin、出力と保全の事後pinを確定。専用領域の掃除または未確認時の引受のみ | 応答不明なら保持し、別試行・次wrapper・削除の再試行は0 |

子4本の順は [canonical会計](../tests/review/fixtures/compiled-canonical-budget.mjs) → [通常session](../tests/review/fixtures/compiled-canonical-session.mjs) → [typed dispatch](../tests/review/fixtures/compiled-typed-dispatch.mjs) → [FX05の旧ACK](../tests/review/fixtures/compiled-private-composition-ack.mjs)。wrapper直下の既知の呼出し数であり、子孫の上界ではない。FX05は旧実classの正常prepared・会計・閉鎖・非公開の検査。旧ACK-36のbind no-opによるPromise拒否は別の旧source試験に残す。

**除外：** PK03／FX06、`test:pack`・`prepublishOnly`、実tarballの生成／展開、依存導入、候補Pの読み取り／起動、既存試験の編集・skip・期待値変更、本体適用、実ServiceNow／worker接続、設定変更、外部照会、コミット・Push・公開。元PK01の子以外を承認範囲に自動追加しない。

## 2 実施承認前に記入する欄

| 承認欄 | 必要な証拠と起動0条件 | 現状 |
|---|---|---|
| H01／入力・実解決 | 旧treeとwrapper／4本・参照元source、package／lock／TS設定。Node実体、wrapperが名前で起動するnpmの実解決先とそのNode、TS・各fixtureの使用依存への実解決・内容照合。宣言版や同じ `node_modules` 名だけでは不可 | 旧commit／treeと固定パスは指定案。ツール・依存・入力manifestの実体と権限は未固定 |
| H02／閉じた領域・通信 | 専用のroot／home・一時領域・作業出力・結果先、実効npm設定／許可環境の確認。元wrapperの `tmpdir()/servicenow-mcp-owner-pack-cache` が同runの専用領域内に解決すること、候補や利用者cacheに書かないこと、外部通信が排除されること。fixture内のfetch拒否とnpmのofflineだけを全子孫の証明にしない | 隔離・外部通信排除の手段、書込み先と権限は未確定 |
| H03／終了観測 | runnerの終了／回収、npmと元4本・子孫／workerの生成受付の完全性と各退出、stdout／stderrの個別終端および所有stdinの閉鎖、後始末・保全を別判定。npmのstdioはwrapper側でcapture、compiled子は継承なので、終端だけでなくどの子の所定結果かを識別可能にする | 観測手段は未承認。PID一覧・成功ログ・runner単体のexit 0だけでは不可。元wrapperに観測hookを足さない |
| H04／時間枠・費目 | 一回の外側単調時計の起点を先行副作用前に固定。準備、空build、PK01、出力・退出確認の通常枠と、停止・drain・回収／保全のcleanup予約を分け、段別上界・結果保持上限に根拠を添える。次段の上界が通常枠に収まらないなら起動0。等号・時計不明でも前進しない | 数値・根拠は未承認。元wrapperのnpm出力buffer 8MiBは当該出力の制限で、時間枠・全stdio上限ではない。既存の5秒／60秒を流用しない |
| H05／保全・採否 | 同run、分類、先行理由、未到達／未確認、責任主体、有効な受理票と照会先を残す。終了が未確認なら削除せず、同じ受理票で照会可能にする。保全応答不明で移譲や削除を二重実行しない | 保全先・受理方式・責任者・削除権限は未承認 |

元wrapperのfake I/O同梱期待と元assertionを維持し、元の順で子4本すべての所定結果を取り、結果数、事後pin、終了四軸が揃った場合だけ「固定旧版の旧PK01確認」とする。媒体はdry-run一覧と旧rootのcompiled結果であり、実配布物の検証、候補の受入、旧保証の代替には数えない。[終了と保全](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)の分類を参照するが、候補の承認・資源枠を流用しない。

## 3 静的に照合できた実体と、なお必要な対照

| 区分 | 確認結果／選択案 | 実施に残る条件 |
|---|---|---|
| H01／旧treeと元試験 | 旧commitから取り出したGit blob IDと、開発用旧rootのpackage／lock／tsconfig、元wrapperと子4本の8ファイルが一致。**開発用rootは部分コピー**で、`.node-version`、`bin/`、`instances.example.json`などを含む完全な旧treeではない | 実施時は固定tree全体からfreshな専用rootを作る。部分コピーでpack一覧を取らず、候補の別ファイルや旧試作の `dist`、キャッシュを借りない。実行入力manifestは実体確保後に照合 |
| H01／Node・npm | 旧版の `.node-version` は **24.18.0**。同版のローカルNode SHA-256は `ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a`。同版の `bin/npm` のリンク先はnpm **11.16.0**、npmディレクトリの内容指紋は `ea60f90e55d98eb091cb1398aa7abb4bbcc969208d0193a1fe69e4635180063c`。shimが環境によって24.22.1を選ぶことも、以前の開発対照の記録と合わせて確認した | 24.18.0側を固定候補とし、shimを使わない。実行直前にはwrapperの名前指定 `npm` とその `#!/usr/bin/env node` の解決が同じ固定binに向くことを、承認された環境で確かめる。本照合はnpm CLIの起動・実効設定確認ではない |
| H01／ローカル依存 | 開発用旧rootに既存の依存内容指紋 `b8aa2e96a83b0269dec31d0cf896d5a35f3b352fba5de22d2b49e3c083a5b3d1`（Viteの一時cacheを除外）を再照合。lockの実体377エントリで版とroot内実体が一致、未設置optional 49、非optional不足0、ローカルinstall台帳のlock外エントリ0。TS 5.9.3、zod 4.6.7、acorn 8.18.0、saxes 5.0.1を確認 | 既存copyを供給元の候補にできる。実施用rootで、必要なoptional・各fixtureのimportと外部解決なしを固定・再照合する。静的な版照合だけでは実行時ロード／通信・OS互換は合格にしない |
| H02／通信遮断と領域 | このホストに `/usr/bin/sandbox-exec` とDocker CLIへのリンクは存在。これは利用可能な分離機構の候補で、隔離の有効性やDockerの実稼働を示さない。元fixtureのfetch拒否・npm offlineも独立した遮断の代用にしない | 元wrapperを触らない隔離方式の候補を小さな合成子で確認。外部実接続は使わず、拒否が仕組み自体によることを独立に区別し、子への継承と専用一時領域以外に書かないことを確認する。環境起動や権限追加は未承認 |
| H03／子とstdio | 既存の[supervisor設計の実装状態](BEST_PRACTICE_WFB_BODY_LIVE_SUPERVISOR_FAULT_DESIGN.md)でも、純粋fakeと実process adapterは別。親終了や同groupの一覧だけでは短命の子、group離脱、親終了後に残るpipeを見落とし得る | H02と同じ環境で、すぐ退出する子、親より遅く閉じるpipe、停止後も残る子孫を外側が区別できるよう、合成対照で先に確認。停止不能・観測欠落を確認済みにせず、旧PK01は起動0 |
| H04／時間・H05／保全 | 通常枠とcleanup予約を分け、同runの先行理由・終了未確認を保持する方針は維持。外側の強制停止、stdioの回収、監視側喪失後の照会がいずれも未確認のため、時間・保持量の数値や保全先は仮決めしない | 検証済みの停止・回収手段に基づいて段別の打切り上限を決め、cleanupに別予約を残す。専用一時領域は実行領域とし、監視側とは別に責務を照会できる承認済みの保全先・担当を用意。応答不明なら再移譲・削除0 |

旧PK01を起動しない小さな合成process対照は別承認を受け、[合成対照結果](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_LEGACY_PK01_SYNTHETIC_PREFLIGHT_RESULT.md)に記録。既知の親・子・孫とstdioは区別できたが、専用sandboxの適用と独立したprocess一覧の照会は拒否されたため、H02／H03は未充足。承認済みの隔離環境・独立観測が用意されるまで、旧treeの空build・npm dry-runは起動しない。

追記：別途許可された[Dockerの合成対照](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_LEGACY_PK01_DOCKER_PREFLIGHT_RESULT.md)では、有効interfaceがloのみ、合成ツリーの独立観測・stdio終端・退出を確認した。旧PK01指定のLinux版Node／npmとその依存に一致する実施用イメージ、旧実行での監視、時間・保全は未確定。合成環境の成功でH02／H03を充足扱いにせず、空build・npm dry-runは起動0。

**実施承認記入欄（未記入）：** 採否・承認者／日付、実行用入力manifest、隔離と終了観測の方法、通常枠／cleanup予約、結果上限・保全先・停止／削除の担当。必須欄にUnknown／不一致があれば先行操作から0。未取得を埋めるために先にbuildやdry-runを始めない。本書の作成は実施承認ではない。

旧試験・正式発行口閉鎖・全体受付無効・外部利用Unknown・閲覧0・調査保留を維持。旧PK01の実施ではなく、ローカル実体の読み取りと独立した合成対照の結果を記録。旧PK01／候補の起動・build・梱包・旧PK01所要時間の実測・保全操作・実通信・設定変更・コミット・Push・公開は行わない。
